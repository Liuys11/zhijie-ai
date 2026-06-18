import { NextRequest, NextResponse } from "next/server";
import { generateImage, getImageProviderConfig } from "@/lib/image-provider";
import { getStoragePublicUrl, requireUser, supabaseRest, uploadStorageObject } from "@/lib/supabase-rest";

type DbProject = {
  id: string;
};

type DbConversation = {
  id: string;
  project_id: string;
};

type DbMessage = {
  id: string;
};

type ParsedBody = {
  prompt: string;
  projectId: string;
  conversationId?: string;
  projectName: string;
};

const MAX_PROMPT_LENGTH = 1000;
const GENERATED_IMAGES_BUCKET = "generated-images";

function jsonError(message: string, status: number) {
  return NextResponse.json({ ok: false, error: message }, { status });
}

function asString(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function parseBody(rawBody: unknown): ParsedBody | { error: string } {
  if (typeof rawBody !== "object" || rawBody === null) return { error: "请求体格式不正确" };

  const body = rawBody as Record<string, unknown>;
  const prompt = asString(body.prompt);
  const projectId = asString(body.projectId);
  if (!prompt) return { error: "图片描述不能为空" };
  if (prompt.length > MAX_PROMPT_LENGTH) return { error: `图片描述不能超过 ${MAX_PROMPT_LENGTH} 个字符` };
  if (!projectId) return { error: "缺少项目 ID，请刷新页面后重试。" };

  return {
    prompt,
    projectId,
    conversationId: asString(body.conversationId) || undefined,
    projectName: asString(body.projectName) || "当前学习项目"
  };
}

function getExtension(mimeType: string) {
  if (mimeType === "image/jpeg") return "jpg";
  if (mimeType === "image/webp") return "webp";
  return "png";
}

function buildUserContent(prompt: string) {
  return `生成一张教学插图：${prompt}`;
}

function buildImageParts(prompt: string, status: "completed" | "failed", url?: string, storagePath?: string, error?: string) {
  return [
    {
      type: "markdown",
      content: status === "completed"
        ? `已根据你的描述生成教学图片：**${prompt}**`
        : `图片生成没有完成：**${prompt}**`
    },
    {
      type: "image",
      prompt,
      url,
      storagePath,
      status,
      error
    }
  ];
}

async function ensureProjectAccess(token: string, projectId: string) {
  const projects = await supabaseRest<DbProject[]>(token, `projects?select=id&id=eq.${projectId}&limit=1`);
  return projects[0] || null;
}

async function ensureConversation(token: string, userId: string, projectId: string, conversationId?: string) {
  if (conversationId) {
    const existing = await supabaseRest<DbConversation[]>(
      token,
      `conversations?select=id,project_id&id=eq.${conversationId}&project_id=eq.${projectId}&limit=1`
    );
    if (existing[0]) return existing[0];
  }

  const existing = await supabaseRest<DbConversation[]>(
    token,
    `conversations?select=id,project_id&project_id=eq.${projectId}&user_id=eq.${userId}&order=created_at.asc&limit=1`
  );
  if (existing[0]) return existing[0];

  const created = await supabaseRest<DbConversation[]>(token, "conversations", {
    method: "POST",
    prefer: "return=representation",
    body: {
      project_id: projectId,
      user_id: userId,
      title: "默认对话",
      mode: "图片生成"
    }
  });

  return created[0];
}

async function saveMessage(
  token: string,
  userId: string,
  conversationId: string,
  role: "user" | "assistant",
  content: string,
  metadata: Record<string, unknown> = {},
  model?: string
) {
  const created = await supabaseRest<DbMessage[]>(token, "messages", {
    method: "POST",
    prefer: "return=representation",
    body: {
      conversation_id: conversationId,
      user_id: userId,
      role,
      content,
      model,
      metadata
    }
  });

  return created[0];
}

async function saveGeneratedAsset(
  token: string,
  userId: string,
  projectId: string,
  messageId: string,
  prompt: string,
  storagePath: string,
  publicUrl: string,
  mimeType: string,
  provider: string,
  model: string
) {
  await supabaseRest<unknown[]>(token, "generated_assets", {
    method: "POST",
    body: {
      project_id: projectId,
      user_id: userId,
      message_id: messageId,
      asset_type: "image",
      prompt,
      storage_bucket: GENERATED_IMAGES_BUCKET,
      storage_path: storagePath,
      public_url: publicUrl,
      mime_type: mimeType,
      provider,
      model,
      status: "completed",
      metadata: {}
    }
  });
}

export async function POST(request: NextRequest) {
  try {
    const auth = await requireUser(request);
    if ("status" in auth) return jsonError(auth.error, auth.status);

    const parsedBody = parseBody(await request.json());
    if ("error" in parsedBody) return jsonError(parsedBody.error, 400);

    const project = await ensureProjectAccess(auth.token, parsedBody.projectId);
    if (!project) return jsonError("项目不存在或无权访问", 404);

    const conversation = await ensureConversation(auth.token, auth.user.id, parsedBody.projectId, parsedBody.conversationId);
    await saveMessage(auth.token, auth.user.id, conversation.id, "user", buildUserContent(parsedBody.prompt), {
      parts: [{ type: "markdown", content: buildUserContent(parsedBody.prompt) }]
    });

    const imageConfig = getImageProviderConfig();
    if (!imageConfig) {
      const error = "图片生成服务尚未配置。请在 Vercel 环境变量中配置 IMAGE_API_KEY、IMAGE_BASE_URL 和 IMAGE_MODEL 后再试。";
      const parts = buildImageParts(parsedBody.prompt, "failed", undefined, undefined, error);
      const assistantMessage = await saveMessage(auth.token, auth.user.id, conversation.id, "assistant", error, { parts }, "image-unconfigured");

      return NextResponse.json({
        ok: true,
        conversationId: conversation.id,
        message: {
          id: assistantMessage.id,
          role: "assistant",
          content: error,
          parts,
          time: new Intl.DateTimeFormat("zh-CN", { hour: "2-digit", minute: "2-digit" }).format(new Date())
        }
      });
    }

    const generatedImage = await generateImage(parsedBody.prompt, imageConfig);
    const extension = getExtension(generatedImage.mimeType);
    const storagePath = `${auth.user.id}/${parsedBody.projectId}/image-${Date.now()}.${extension}`;
    await uploadStorageObject(auth.token, GENERATED_IMAGES_BUCKET, storagePath, generatedImage.bytes, generatedImage.mimeType);

    const publicUrl = `${getStoragePublicUrl(GENERATED_IMAGES_BUCKET, storagePath)}?v=${Date.now()}`;
    const parts = buildImageParts(parsedBody.prompt, "completed", publicUrl, storagePath);
    const content = `已根据你的描述生成教学图片：${parsedBody.prompt}`;
    const assistantMessage = await saveMessage(auth.token, auth.user.id, conversation.id, "assistant", content, { parts }, generatedImage.model);

    await saveGeneratedAsset(
      auth.token,
      auth.user.id,
      parsedBody.projectId,
      assistantMessage.id,
      parsedBody.prompt,
      storagePath,
      publicUrl,
      generatedImage.mimeType,
      generatedImage.provider,
      generatedImage.model
    );

    return NextResponse.json({
      ok: true,
      conversationId: conversation.id,
      message: {
        id: assistantMessage.id,
        role: "assistant",
        content,
        parts,
        time: new Intl.DateTimeFormat("zh-CN", { hour: "2-digit", minute: "2-digit" }).format(new Date())
      }
    });
  } catch (error) {
    console.error(error);
    return jsonError(error instanceof Error ? error.message : "图片生成失败，请稍后重试。", 500);
  }
}
