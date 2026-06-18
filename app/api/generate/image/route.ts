import { NextRequest, NextResponse } from "next/server";
import { createXfyunHiDreamTask, generateImage, getImageProviderConfig, getImageProviderSetupHint } from "@/lib/image-provider";
import {
  buildImageParts,
  buildUserContent,
  ensureConversation,
  ensureProjectAccess,
  saveGeneratedAsset,
  saveMessage,
  storeGeneratedImage
} from "@/lib/image-generation-store";
import { requireUser } from "@/lib/supabase-rest";

export const runtime = "nodejs";
export const maxDuration = 120;

type ParsedBody = {
  prompt: string;
  projectId: string;
  conversationId?: string;
  projectName: string;
};

const MAX_PROMPT_LENGTH = 1000;
const DUPLICATE_TASK_TTL_MS = 120000;
const activeImageTasks = new Map<string, number>();

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

function getTaskKey(userId: string, projectId: string, prompt: string) {
  return `${userId}:${projectId}:${prompt.trim().toLowerCase()}`;
}

function isDuplicateTask(taskKey: string) {
  const startedAt = activeImageTasks.get(taskKey);
  if (!startedAt) return false;

  if (Date.now() - startedAt > DUPLICATE_TASK_TTL_MS) {
    activeImageTasks.delete(taskKey);
    return false;
  }

  return true;
}

export async function POST(request: NextRequest) {
  try {
    const auth = await requireUser(request);
    if ("status" in auth) return jsonError(auth.error, auth.status);

    const parsedBody = parseBody(await request.json());
    if ("error" in parsedBody) return jsonError(parsedBody.error, 400);

    const project = await ensureProjectAccess(auth.token, parsedBody.projectId);
    if (!project) return jsonError("项目不存在或无权访问", 404);

    const taskKey = getTaskKey(auth.user.id, parsedBody.projectId, parsedBody.prompt);
    if (isDuplicateTask(taskKey)) {
      return jsonError("同一张图片正在生成中，请等待当前任务完成后再试。", 429);
    }

    const conversation = await ensureConversation(auth.token, auth.user.id, parsedBody.projectId, parsedBody.conversationId);
    await saveMessage(auth.token, auth.user.id, conversation.id, "user", buildUserContent(parsedBody.prompt), {
      parts: [{ type: "markdown", content: buildUserContent(parsedBody.prompt) }]
    });

    const imageConfig = getImageProviderConfig();
    if (!imageConfig) {
      const error = getImageProviderSetupHint();
      const parts = buildImageParts({ prompt: parsedBody.prompt, status: "failed", error });
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

    activeImageTasks.set(taskKey, Date.now());
    try {
      if (imageConfig.provider === "xfyun-hidream") {
        const task = await createXfyunHiDreamTask(parsedBody.prompt, imageConfig);
        const content = "图片正在排队生成，请稍候。";
        const parts = buildImageParts({
          prompt: parsedBody.prompt,
          status: "generating",
          error: content,
          taskId: task.taskId,
          taskStatus: "1",
          provider: task.provider
        });
        const assistantMessage = await saveMessage(auth.token, auth.user.id, conversation.id, "assistant", content, {
          parts,
          imageTask: {
            provider: task.provider,
            taskId: task.taskId,
            status: "waiting",
            taskStatus: "1",
            prompt: parsedBody.prompt,
            startedAt: new Date().toISOString(),
            pollCount: 0
          }
        }, task.model);

        return NextResponse.json({
          ok: true,
          conversationId: conversation.id,
          status: "processing",
          taskId: task.taskId,
          message: {
            id: assistantMessage.id,
            role: "assistant",
            content,
            parts,
            time: new Intl.DateTimeFormat("zh-CN", { hour: "2-digit", minute: "2-digit" }).format(new Date())
          }
        });
      }

      const generatedImage = await generateImage(parsedBody.prompt, imageConfig);
      const storedImage = await storeGeneratedImage(auth.token, auth.user.id, parsedBody.projectId, generatedImage);
      const parts = buildImageParts({
        prompt: parsedBody.prompt,
        status: "completed",
        url: storedImage.publicUrl,
        storagePath: storedImage.storagePath,
        provider: generatedImage.provider
      });
      const content = `已根据你的描述生成教学图片：${parsedBody.prompt}`;
      const assistantMessage = await saveMessage(auth.token, auth.user.id, conversation.id, "assistant", content, { parts }, generatedImage.model);

      await saveGeneratedAsset(
        auth.token,
        auth.user.id,
        parsedBody.projectId,
        assistantMessage.id,
        parsedBody.prompt,
        storedImage.storagePath,
        storedImage.publicUrl,
        generatedImage.mimeType,
        generatedImage.provider,
        generatedImage.model
      );

      return NextResponse.json({
        ok: true,
        conversationId: conversation.id,
        status: "completed",
        message: {
          id: assistantMessage.id,
          role: "assistant",
          content,
          parts,
          time: new Intl.DateTimeFormat("zh-CN", { hour: "2-digit", minute: "2-digit" }).format(new Date())
        }
      });
    } finally {
      activeImageTasks.delete(taskKey);
    }
  } catch (error) {
    console.error(error);
    return jsonError(error instanceof Error ? error.message : "图片生成失败，请稍后重试。", 500);
  }
}
