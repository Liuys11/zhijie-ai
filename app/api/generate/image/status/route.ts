import { NextRequest, NextResponse } from "next/server";
import { getImageProviderConfig, queryXfyunHiDreamTask } from "@/lib/image-provider";
import {
  buildImageParts,
  ensureProjectAccess,
  saveGeneratedAsset,
  storeGeneratedImage,
  updateMessage
} from "@/lib/image-generation-store";
import { requireUser, supabaseRest } from "@/lib/supabase-rest";

export const runtime = "nodejs";
export const maxDuration = 120;

type ParsedBody = {
  projectId: string;
  messageId: string;
  taskId: string;
  prompt: string;
  pollCount: number;
};

type DbMessageWithMetadata = {
  id: string;
  user_id: string;
  metadata: Record<string, unknown>;
};

function jsonError(message: string, status: number) {
  return NextResponse.json({ ok: false, error: message }, { status });
}

function asString(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function asNumber(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

function maskTaskId(taskId: string) {
  if (taskId.length <= 8) return "***";
  return `${taskId.slice(0, 4)}...${taskId.slice(-4)}`;
}

function parseBody(rawBody: unknown): ParsedBody | { error: string } {
  if (typeof rawBody !== "object" || rawBody === null) return { error: "请求体格式不正确" };

  const body = rawBody as Record<string, unknown>;
  const projectId = asString(body.projectId);
  const messageId = asString(body.messageId);
  const taskId = asString(body.taskId);
  const prompt = asString(body.prompt);
  if (!projectId) return { error: "缺少项目 ID，请刷新页面后重试。" };
  if (!messageId) return { error: "缺少消息 ID，无法查询图片任务。" };
  if (!taskId) return { error: "缺少图片任务 ID，无法继续查询。" };
  if (!prompt) return { error: "缺少图片描述，无法更新消息。" };

  return {
    projectId,
    messageId,
    taskId,
    prompt,
    pollCount: Math.max(1, asNumber(body.pollCount))
  };
}

async function ensureMessageAccess(token: string, userId: string, messageId: string) {
  const messages = await supabaseRest<DbMessageWithMetadata[]>(
    token,
    `messages?select=id,user_id,metadata&id=eq.${messageId}&user_id=eq.${userId}&limit=1`
  );
  return messages[0] || null;
}

export async function POST(request: NextRequest) {
  try {
    const auth = await requireUser(request);
    if ("status" in auth) return jsonError(auth.error, auth.status);

    const parsedBody = parseBody(await request.json());
    if ("error" in parsedBody) return jsonError(parsedBody.error, 400);

    const project = await ensureProjectAccess(auth.token, parsedBody.projectId);
    if (!project) return jsonError("项目不存在或无权访问", 404);

    const message = await ensureMessageAccess(auth.token, auth.user.id, parsedBody.messageId);
    if (!message) return jsonError("图片任务消息不存在或无权访问", 404);

    const imageConfig = getImageProviderConfig();
    if (!imageConfig || imageConfig.provider !== "xfyun-hidream") {
      return jsonError("当前图片服务不是讯飞 HiDream，无法查询该任务。", 400);
    }

    console.info("[image-build-version]", {
      commit: process.env.VERCEL_GIT_COMMIT_SHA || "local",
      environment: process.env.VERCEL_ENV || "local"
    });

    const result = await queryXfyunHiDreamTask(parsedBody.taskId, imageConfig, parsedBody.pollCount);
    console.info("[hidream-status-api]", {
      messageId: parsedBody.messageId,
      taskId: maskTaskId(parsedBody.taskId),
      pollCount: parsedBody.pollCount,
      status: result.status,
      taskStatus: result.taskStatus,
      hasResultText: result.hasResultText,
      hasImage: Boolean(result.image),
      provider: imageConfig.provider
    });
    if (!result.image) {
      const timeoutHint = parsedBody.pollCount * imageConfig.pollIntervalMs >= imageConfig.timeoutMs
        ? "讯飞图片任务处理时间较长，请点击继续查询。"
        : result.message;
      const parts = buildImageParts({
        prompt: parsedBody.prompt,
        status: "generating",
        error: timeoutHint,
        taskId: parsedBody.taskId,
        taskStatus: result.taskStatus,
        provider: "xfyun-hidream"
      });
      await updateMessage(auth.token, parsedBody.messageId, timeoutHint, {
        parts,
        imageTask: {
          provider: "xfyun-hidream",
          taskId: parsedBody.taskId,
          status: result.status,
          taskStatus: result.taskStatus,
          prompt: parsedBody.prompt,
          pollCount: parsedBody.pollCount,
          lastCheckedAt: new Date().toISOString()
        }
      }, imageConfig.provider);

      return NextResponse.json({
        ok: true,
        status: result.status,
        taskStatus: result.taskStatus,
        message: {
          id: parsedBody.messageId,
          role: "assistant",
          content: timeoutHint,
          parts,
          time: new Intl.DateTimeFormat("zh-CN", { hour: "2-digit", minute: "2-digit" }).format(new Date())
        }
      });
    }

    const storedImage = await storeGeneratedImage(auth.token, auth.user.id, parsedBody.projectId, result.image);
    const parts = buildImageParts({
      prompt: parsedBody.prompt,
      status: "completed",
      url: storedImage.publicUrl,
      storagePath: storedImage.storagePath,
      taskId: parsedBody.taskId,
      taskStatus: result.taskStatus,
      provider: "xfyun-hidream"
    });
    const content = `图片生成完成：${parsedBody.prompt}`;
    await updateMessage(auth.token, parsedBody.messageId, content, {
      parts,
      imageTask: {
        provider: "xfyun-hidream",
        taskId: parsedBody.taskId,
        status: "completed",
        taskStatus: result.taskStatus,
        prompt: parsedBody.prompt,
        storagePath: storedImage.storagePath,
        publicUrl: storedImage.publicUrl,
        completedAt: new Date().toISOString()
      }
    }, result.image.model);

    await saveGeneratedAsset(
      auth.token,
      auth.user.id,
      parsedBody.projectId,
      parsedBody.messageId,
      parsedBody.prompt,
      storedImage.storagePath,
      storedImage.publicUrl,
      result.image.mimeType,
      result.image.provider,
      result.image.model
    );

    return NextResponse.json({
      ok: true,
      status: "completed",
      taskStatus: result.taskStatus,
      message: {
        id: parsedBody.messageId,
        role: "assistant",
        content,
        parts,
        time: new Intl.DateTimeFormat("zh-CN", { hour: "2-digit", minute: "2-digit" }).format(new Date())
      }
    });
  } catch (error) {
    console.error(error);
    return jsonError(error instanceof Error ? error.message : "图片任务查询失败，请稍后重试。", 500);
  }
}
