import { NextRequest, NextResponse } from "next/server";
import { getVideoProviderConfig, getVideoProviderSetupHint, createXfyunVideoTask, type VideoDifficulty, type VideoDurationOption, type VideoStyle } from "@/lib/video-provider";
import {
  buildVideoParts,
  buildVideoUserContent,
  ensureConversation,
  ensureProjectAccess,
  saveGeneratedVideoAsset,
  saveMessage
} from "@/lib/video-generation-store";
import { requireUser } from "@/lib/supabase-rest";

export const runtime = "nodejs";
export const maxDuration = 120;

type ParsedBody = {
  projectId: string;
  conversationId?: string;
  projectName: string;
  topic: string;
  duration: VideoDurationOption;
  difficulty: VideoDifficulty;
  style: VideoStyle;
};

const MAX_TOPIC_LENGTH = 300;
const activeVideoTasks = new Map<string, number>();
const DUPLICATE_TASK_TTL_MS = 120000;

function logBuildVersion() {
  console.info("[video-build-version]", {
    commit: process.env.VERCEL_GIT_COMMIT_SHA || "local",
    environment: process.env.VERCEL_ENV || process.env.NODE_ENV || "local"
  });
}

function jsonError(message: string, status: number) {
  return NextResponse.json({ ok: false, error: message }, { status });
}

function asString(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function parseDuration(value: string): VideoDurationOption {
  if (/90|1\.5|1分30|一分半|1 分 30/.test(value)) return "90s";
  if (/30|半分钟|半 分钟/.test(value)) return "30s";
  return "60s";
}

function parseDifficulty(value: string): VideoDifficulty {
  if (/入门|初学|零基础/.test(value)) return "入门";
  if (/进阶|提高|深入/.test(value)) return "进阶";
  return "基础";
}

function parseStyle(value: string): VideoStyle {
  if (/考前|复习|冲刺/.test(value)) return "考前复习";
  if (/科普|通俗/.test(value)) return "概念科普";
  if (/案例|例子|应用/.test(value)) return "案例分析";
  return "知识讲解";
}

function parseBody(rawBody: unknown): ParsedBody | { error: string } {
  if (typeof rawBody !== "object" || rawBody === null) return { error: "请求体格式不正确" };

  const body = rawBody as Record<string, unknown>;
  const projectId = asString(body.projectId);
  const topic = asString(body.topic);
  const projectName = asString(body.projectName) || "当前学习项目";
  const durationText = asString(body.duration) || topic;
  const difficultyText = asString(body.difficulty) || topic;
  const styleText = asString(body.style) || topic;

  if (!projectId) return { error: "缺少项目 ID，请刷新页面后重试。" };
  if (!topic) return { error: "视频主题不能为空" };
  if (topic.length > MAX_TOPIC_LENGTH) return { error: `视频主题不能超过 ${MAX_TOPIC_LENGTH} 个字符` };

  return {
    projectId,
    conversationId: asString(body.conversationId) || undefined,
    projectName,
    topic,
    duration: parseDuration(durationText),
    difficulty: parseDifficulty(difficultyText),
    style: parseStyle(styleText)
  };
}

function getTaskKey(userId: string, projectId: string, topic: string) {
  return `${userId}:${projectId}:${topic.trim().toLowerCase()}`;
}

function maskTaskId(taskId: string) {
  if (taskId.length <= 8) return "***";
  return `${taskId.slice(0, 4)}...${taskId.slice(-4)}`;
}

function isDuplicateTask(taskKey: string) {
  const startedAt = activeVideoTasks.get(taskKey);
  if (!startedAt) return false;
  if (Date.now() - startedAt > DUPLICATE_TASK_TTL_MS) {
    activeVideoTasks.delete(taskKey);
    return false;
  }
  return true;
}

export async function POST(request: NextRequest) {
  try {
    logBuildVersion();
    const auth = await requireUser(request);
    if ("status" in auth) return jsonError(auth.error, auth.status);

    const parsedBody = parseBody(await request.json());
    if ("error" in parsedBody) return jsonError(parsedBody.error, 400);

    const project = await ensureProjectAccess(auth.token, parsedBody.projectId);
    if (!project) return jsonError("项目不存在或无权访问", 404);

    const taskKey = getTaskKey(auth.user.id, parsedBody.projectId, parsedBody.topic);
    if (isDuplicateTask(taskKey)) return jsonError("同一个视频任务正在创建中，请稍候。", 429);

    const conversation = await ensureConversation(auth.token, auth.user.id, parsedBody.projectId, parsedBody.conversationId);
    await saveMessage(auth.token, auth.user.id, conversation.id, "user", buildVideoUserContent(parsedBody.topic), {
      parts: [{ type: "markdown", content: buildVideoUserContent(parsedBody.topic) }]
    });

    const videoConfig = getVideoProviderConfig();
    if (!videoConfig) {
      const error = getVideoProviderSetupHint();
      const parts = buildVideoParts({
        title: parsedBody.topic,
        status: "failed",
        error,
        progressLabel: error,
        duration: parsedBody.duration,
        difficulty: parsedBody.difficulty,
        style: parsedBody.style
      });
      const assistantMessage = await saveMessage(auth.token, auth.user.id, conversation.id, "assistant", error, { parts }, "video-unconfigured");

      return NextResponse.json({
        ok: true,
        conversationId: conversation.id,
        status: "failed",
        message: {
          id: assistantMessage.id,
          role: "assistant",
          content: error,
          parts,
          time: new Intl.DateTimeFormat("zh-CN", { hour: "2-digit", minute: "2-digit" }).format(new Date())
        }
      });
    }

    activeVideoTasks.set(taskKey, Date.now());
    try {
      const task = await createXfyunVideoTask(
        {
          topic: parsedBody.topic,
          projectName: parsedBody.projectName,
          duration: parsedBody.duration,
          difficulty: parsedBody.difficulty,
          style: parsedBody.style
        },
        videoConfig
      );
      const content = "正在生成数字人视频，请稍候。";
      const startedAt = new Date().toISOString();
      const parts = buildVideoParts({
        title: parsedBody.topic,
        status: "generating",
        progressLabel: content,
        taskId: task.taskId,
        taskStatus: "1",
        provider: task.provider,
        taskIdMasked: maskTaskId(task.taskId),
        startedAt,
        elapsedMs: 0,
        providerStatusLabel: "\u8baf\u98de\u72b6\u6001\uff1a\u5df2\u521b\u5efa/\u6392\u961f\u4e2d\uff081\uff09",
        providerStatusDetail: "\u4efb\u52a1\u5df2\u521b\u5efa\uff0c\u7b49\u5f85\u9996\u6b21\u67e5\u8be2\u8fd4\u56de\u8baf\u98de\u5904\u7406\u72b6\u6001\u3002",
        duration: parsedBody.duration,
        difficulty: parsedBody.difficulty,
        style: parsedBody.style
      });
      const assistantMessage = await saveMessage(auth.token, auth.user.id, conversation.id, "assistant", content, {
        parts,
        videoTask: {
          provider: task.provider,
          taskId: task.taskId,
          status: "created",
          taskStatus: "1",
          topic: parsedBody.topic,
          duration: parsedBody.duration,
          difficulty: parsedBody.difficulty,
          style: parsedBody.style,
          prompt: task.prompt,
          wordCount: task.wordCount,
          startedAt,
          pollCount: 0
        }
      }, task.model);

      await saveGeneratedVideoAsset({
        token: auth.token,
        userId: auth.user.id,
        projectId: parsedBody.projectId,
        messageId: assistantMessage.id,
        prompt: task.prompt,
        taskId: task.taskId,
        provider: task.provider,
        model: task.model,
        status: "generating",
        metadata: { topic: parsedBody.topic, duration: parsedBody.duration, difficulty: parsedBody.difficulty, style: parsedBody.style }
      });

      return NextResponse.json({
        ok: true,
        conversationId: conversation.id,
        status: "processing",
        taskId: task.taskId,
        pollIntervalMs: videoConfig.pollIntervalMs,
        message: {
          id: assistantMessage.id,
          role: "assistant",
          content,
          parts,
          time: new Intl.DateTimeFormat("zh-CN", { hour: "2-digit", minute: "2-digit" }).format(new Date())
        }
      });
    } finally {
      activeVideoTasks.delete(taskKey);
    }
  } catch (error) {
    console.error(error);
    return jsonError(error instanceof Error ? error.message : "视频任务创建失败，请稍后重试。", 500);
  }
}
