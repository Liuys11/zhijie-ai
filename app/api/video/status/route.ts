import { NextRequest, NextResponse } from "next/server";
import { getVideoProviderConfig, queryXfyunVideoTask, type VideoDifficulty, type VideoDurationOption, type VideoStyle } from "@/lib/video-provider";
import {
  buildVideoParts,
  ensureProjectAccess,
  saveGeneratedVideoAsset,
  updateMessage
} from "@/lib/video-generation-store";
import { getStoragePublicUrl, requireUser, supabaseRest, uploadStorageObject } from "@/lib/supabase-rest";
import { estimateSubtitleDuration, generateWebVtt } from "@/lib/video-subtitles";

export const runtime = "nodejs";
export const maxDuration = 120;

type ParsedBody = {
  projectId: string;
  messageId: string;
  taskId: string;
  topic: string;
  duration: VideoDurationOption;
  difficulty: VideoDifficulty;
  style: VideoStyle;
  pollCount: number;
};

type DbMessageWithMetadata = {
  id: string;
  user_id: string;
  metadata: Record<string, unknown>;
};

type SubtitleResult = {
  subtitleUrl?: string;
  subtitlePath?: string;
  subtitleStatus: "generated" | "missing-script" | "failed";
  subtitleMessage: string;
  timedSegments?: Array<{ start: number; end: number; text: string }>;
  durationSeconds?: number;
};

const SUBTITLE_BUCKET = "generated-images";
const MAX_AUTO_VIDEO_POLL_MS = 15 * 60 * 1000;

function jsonError(message: string, status: number) {
  return NextResponse.json({ ok: false, error: message }, { status });
}

function asString(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function asNumber(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null && !Array.isArray(value) ? (value as Record<string, unknown>) : null;
}

function getVideoTaskMetadata(message: DbMessageWithMetadata) {
  return asRecord(message.metadata?.videoTask);
}

function getStartedAt(message: DbMessageWithMetadata) {
  const videoTask = getVideoTaskMetadata(message);
  return asString(videoTask?.startedAt) || new Date().toISOString();
}

function getElapsedMs(startedAt: string) {
  const startedTime = Date.parse(startedAt);
  if (!Number.isFinite(startedTime)) return 0;
  return Math.max(0, Date.now() - startedTime);
}

function formatElapsed(elapsedMs: number) {
  const totalSeconds = Math.floor(elapsedMs / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  if (minutes <= 0) return `${seconds}秒`;
  return `${minutes}分${String(seconds).padStart(2, "0")}秒`;
}

function getNowLabel() {
  return new Intl.DateTimeFormat("zh-CN", { hour: "2-digit", minute: "2-digit", second: "2-digit" }).format(new Date());
}

function withQueryStatusLabel(message: string, elapsedMs: number, lastCheckedAt: string) {
  return `${message} 已等待 ${formatElapsed(elapsedMs)}，最近查询 ${lastCheckedAt}`;
}

function getProviderStatusLabel(taskStatus: string) {
  if (taskStatus === "1") return "讯飞状态：已创建/排队中（1）";
  if (taskStatus === "2") return "讯飞状态：处理中（2）";
  if (taskStatus === "3") return "讯飞状态：已完成（3）";
  if (taskStatus === "4") return "讯飞状态：最终完成（4）";
  return `讯飞状态：未知（${taskStatus || "-"}）`;
}

function getProviderStatusDetail(result: {
  headerCode: string;
  headerMessage: string;
  hasPayload: boolean;
  hasVideo: boolean;
  hasText: boolean;
  hasVideoUrl: boolean;
}) {
  const code = result.headerCode || "-";
  const message = result.headerMessage || "-";
  return `header.code=${code}，message=${message}，payload=${result.hasPayload ? "有" : "无"}，video=${result.hasVideo ? "有" : "无"}，videoUrl=${result.hasVideoUrl ? "有" : "无"}，text=${result.hasText ? "有" : "无"}`;
}

function isDuration(value: string): value is VideoDurationOption {
  return value === "30s" || value === "60s" || value === "90s";
}

function isDifficulty(value: string): value is VideoDifficulty {
  return value === "入门" || value === "基础" || value === "进阶";
}

function isStyle(value: string): value is VideoStyle {
  return value === "知识讲解" || value === "考前复习" || value === "概念科普" || value === "案例分析";
}

function parseBody(rawBody: unknown): ParsedBody | { error: string } {
  if (typeof rawBody !== "object" || rawBody === null) return { error: "请求体格式不正确" };

  const body = rawBody as Record<string, unknown>;
  const projectId = asString(body.projectId);
  const messageId = asString(body.messageId);
  const taskId = asString(body.taskId);
  const topic = asString(body.topic);
  const duration = asString(body.duration);
  const difficulty = asString(body.difficulty);
  const style = asString(body.style);

  if (!projectId) return { error: "缺少项目 ID，请刷新页面后重试。" };
  if (!messageId) return { error: "缺少消息 ID，无法查询视频任务。" };
  if (!taskId) return { error: "缺少视频任务 ID，无法继续查询。" };
  if (!topic) return { error: "缺少视频主题，无法更新消息。" };

  return {
    projectId,
    messageId,
    taskId,
    topic,
    duration: isDuration(duration) ? duration : "60s",
    difficulty: isDifficulty(difficulty) ? difficulty : "基础",
    style: isStyle(style) ? style : "知识讲解",
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

async function createAndUploadSubtitle({
  token,
  userId,
  projectId,
  taskId,
  script,
  durationSeconds
}: {
  token: string;
  userId: string;
  projectId: string;
  taskId: string;
  script?: string;
  durationSeconds?: number;
}): Promise<SubtitleResult> {
  if (!script?.trim()) {
    return {
      subtitleStatus: "missing-script",
      subtitleMessage: "该视频未返回播报文案，暂时无法生成字幕。"
    };
  }

  try {
    const resolvedDuration = durationSeconds && Number.isFinite(durationSeconds) && durationSeconds > 0
      ? durationSeconds
      : estimateSubtitleDuration(script);
    const { vtt, timedSegments } = generateWebVtt(script, resolvedDuration);
    if (!vtt) {
      return {
        subtitleStatus: "missing-script",
        subtitleMessage: "该视频未返回有效播报文案，暂时无法生成字幕。"
      };
    }

    const subtitlePath = `${userId}/${projectId}/subtitles/${taskId}-${Date.now()}.vtt`;
    await uploadStorageObject(token, SUBTITLE_BUCKET, subtitlePath, new TextEncoder().encode(vtt), "text/vtt;charset=utf-8");

    return {
      subtitleUrl: `${getStoragePublicUrl(SUBTITLE_BUCKET, subtitlePath)}?v=${Date.now()}`,
      subtitlePath,
      subtitleStatus: "generated",
      subtitleMessage: "字幕：已生成",
      timedSegments,
      durationSeconds: resolvedDuration
    };
  } catch (error) {
    console.error("[video-subtitle-generate]", error);
    return {
      subtitleStatus: "failed",
      subtitleMessage: "字幕生成失败，视频仍可正常播放。"
    };
  }
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
    if (!message) return jsonError("视频任务消息不存在或无权访问", 404);

    const videoConfig = getVideoProviderConfig();
    if (!videoConfig) return jsonError("视频生成服务尚未配置完整，无法查询任务。", 400);

    const startedAt = getStartedAt(message);
    const lastCheckedAt = getNowLabel();
    const result = await queryXfyunVideoTask(parsedBody.taskId, videoConfig);
    const elapsedMs = getElapsedMs(startedAt);
    const autoPollExpired = elapsedMs >= MAX_AUTO_VIDEO_POLL_MS;
    const providerStatusLabel = getProviderStatusLabel(result.taskStatus);
    const providerStatusDetail = getProviderStatusDetail(result);

    console.info("[video-status-query]", {
      taskIdMasked: parsedBody.taskId.length <= 8 ? "***" : `${parsedBody.taskId.slice(0, 4)}...${parsedBody.taskId.slice(-4)}`,
      messageId: parsedBody.messageId,
      pollCount: parsedBody.pollCount,
      elapsedMs,
      taskStatus: result.taskStatus,
      status: result.status,
      hasVideoUrl: Boolean(result.videoUrl)
    });
    if (!result.videoUrl) {
      const statusMessage = autoPollExpired
        ? "\u8baf\u98de\u4ecd\u5728\u5904\u7406\u8be5\u4efb\u52a1\uff0c\u53ef\u4ee5\u7a0d\u540e\u7ee7\u7eed\u67e5\u8be2\u539f\u4efb\u52a1\u3002"
        : result.message;
      const timeoutHint = withQueryStatusLabel(statusMessage, elapsedMs, lastCheckedAt);
      const parts = buildVideoParts({
        title: parsedBody.topic,
        status: "generating",
        progressLabel: timeoutHint,
        taskId: parsedBody.taskId,
        taskStatus: result.taskStatus,
        provider: "xfyun-avatar-video",
        startedAt,
        lastCheckedAt,
        pollCount: parsedBody.pollCount,
        elapsedMs,
        providerStatusLabel,
        providerStatusDetail,
        duration: parsedBody.duration,
        difficulty: parsedBody.difficulty,
        style: parsedBody.style,
        script: result.script
      });
      await updateMessage(auth.token, parsedBody.messageId, timeoutHint, {
        parts,
        videoTask: {
          provider: "xfyun-avatar-video",
          taskId: parsedBody.taskId,
          status: result.status,
          taskStatus: result.taskStatus,
          topic: parsedBody.topic,
          duration: parsedBody.duration,
          difficulty: parsedBody.difficulty,
          style: parsedBody.style,
          pollCount: parsedBody.pollCount,
          startedAt,
          elapsedMs,
          autoPollExpired,
          providerStatusLabel,
          providerStatusDetail,
          lastCheckedAt: new Date().toISOString()
        }
      }, "xfyun-avatar-video");

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

    const subtitle = await createAndUploadSubtitle({
      token: auth.token,
      userId: auth.user.id,
      projectId: parsedBody.projectId,
      taskId: parsedBody.taskId,
      script: result.script,
      durationSeconds: result.audioDurationSeconds || result.videoDurationSeconds
    });

    const parts = buildVideoParts({
      title: parsedBody.topic,
      status: "completed",
      progressLabel: "视频生成完成。",
      taskId: parsedBody.taskId,
      taskStatus: result.taskStatus,
      provider: "xfyun-avatar-video",
      startedAt,
      lastCheckedAt,
      pollCount: parsedBody.pollCount,
      elapsedMs,
      providerStatusLabel,
      providerStatusDetail,
      duration: parsedBody.duration,
      difficulty: parsedBody.difficulty,
      style: parsedBody.style,
      videoUrl: result.videoUrl,
      audioUrl: result.audioUrl,
      script: result.script,
      subtitleUrl: subtitle.subtitleUrl,
      subtitleFormat: subtitle.subtitleUrl ? "vtt" : undefined,
      subtitleStatus: subtitle.subtitleStatus,
      subtitleMessage: subtitle.subtitleMessage
    });
    const content = `视频生成完成：${parsedBody.topic}`;
    await updateMessage(auth.token, parsedBody.messageId, content, {
      parts,
      videoTask: {
        provider: "xfyun-avatar-video",
        taskId: parsedBody.taskId,
        status: "completed",
        taskStatus: result.taskStatus,
        topic: parsedBody.topic,
        duration: parsedBody.duration,
        difficulty: parsedBody.difficulty,
        style: parsedBody.style,
        startedAt,
        elapsedMs,
        pollCount: parsedBody.pollCount,
        lastCheckedAt: new Date().toISOString(),
        providerStatusLabel,
        providerStatusDetail,
        videoUrl: result.videoUrl,
        audioUrl: result.audioUrl,
        script: result.script,
        subtitleUrl: subtitle.subtitleUrl,
        subtitlePath: subtitle.subtitlePath,
        subtitleFormat: subtitle.subtitleUrl ? "vtt" : undefined,
        subtitleStatus: subtitle.subtitleStatus,
        subtitleMessage: subtitle.subtitleMessage,
        timedSegments: subtitle.timedSegments,
        subtitleDurationSeconds: subtitle.durationSeconds,
        completedAt: new Date().toISOString()
      }
    }, "xfyun-avatar-video");

    await saveGeneratedVideoAsset({
      token: auth.token,
      userId: auth.user.id,
      projectId: parsedBody.projectId,
      messageId: parsedBody.messageId,
      prompt: parsedBody.topic,
      taskId: parsedBody.taskId,
      videoUrl: result.videoUrl,
      provider: "xfyun-avatar-video",
      model: "xfyun-avatar-video",
      status: "completed",
      metadata: {
        taskStatus: result.taskStatus,
        topic: parsedBody.topic,
        duration: parsedBody.duration,
        difficulty: parsedBody.difficulty,
        style: parsedBody.style,
        startedAt,
        elapsedMs,
        pollCount: parsedBody.pollCount,
        lastCheckedAt: new Date().toISOString(),
        providerStatusLabel,
        providerStatusDetail,
        script: result.script,
        audioUrl: result.audioUrl,
        subtitleUrl: subtitle.subtitleUrl,
        subtitlePath: subtitle.subtitlePath,
        subtitleFormat: subtitle.subtitleUrl ? "vtt" : undefined,
        subtitleStatus: subtitle.subtitleStatus,
        subtitleMessage: subtitle.subtitleMessage,
        timedSegments: subtitle.timedSegments,
        subtitleDurationSeconds: subtitle.durationSeconds
      }
    });

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
    return jsonError(error instanceof Error ? error.message : "视频任务查询失败，请稍后重试。", 500);
  }
}
