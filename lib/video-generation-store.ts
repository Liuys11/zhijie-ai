import { ensureConversation, ensureProjectAccess, saveMessage, updateMessage } from "@/lib/image-generation-store";
import { supabaseRest } from "@/lib/supabase-rest";
import { durationLabel, type VideoDifficulty, type VideoDurationOption, type VideoStyle } from "@/lib/video-provider";

export { ensureConversation, ensureProjectAccess, saveMessage, updateMessage };

export type VideoPartStatus = "queued" | "generating" | "completed" | "failed";

export function buildVideoUserContent(topic: string) {
  return `生成一个教学视频：${topic}`;
}

export function buildVideoParts({
  title,
  status,
  progressLabel,
  taskId,
  taskStatus,
  provider,
  startedAt,
  lastCheckedAt,
  pollCount,
  elapsedMs,
  duration,
  difficulty,
  style,
  videoUrl,
  audioUrl,
  script,
  subtitleUrl,
  subtitleFormat,
  subtitleStatus,
  subtitleMessage,
  error
}: {
  title: string;
  status: VideoPartStatus;
  progressLabel?: string;
  taskId?: string;
  taskStatus?: string;
  provider?: string;
  startedAt?: string;
  lastCheckedAt?: string;
  pollCount?: number;
  elapsedMs?: number;
  duration: VideoDurationOption;
  difficulty: VideoDifficulty;
  style: VideoStyle;
  videoUrl?: string;
  audioUrl?: string;
  script?: string;
  subtitleUrl?: string;
  subtitleFormat?: "vtt";
  subtitleStatus?: "generated" | "missing-script" | "failed";
  subtitleMessage?: string;
  error?: string;
}) {
  return [
    {
      type: "markdown",
      content: status === "completed"
        ? `教学视频已生成：**${title}**`
        : `正在生成教学视频：**${title}**\n\n预计时长：${durationLabel(duration)}；难度：${difficulty}；风格：${style}。`
    },
    {
      type: "video",
      title,
      url: videoUrl,
      audioUrl,
      status,
      progressLabel,
      script,
      subtitleUrl,
      subtitleFormat,
      subtitleStatus,
      subtitleMessage,
      error,
      taskId,
      taskStatus,
      provider,
      startedAt,
      lastCheckedAt,
      pollCount,
      elapsedMs,
      duration,
      difficulty,
      style
    }
  ];
}

export async function saveGeneratedVideoAsset({
  token,
  userId,
  projectId,
  messageId,
  prompt,
  taskId,
  videoUrl,
  provider,
  model,
  status,
  metadata
}: {
  token: string;
  userId: string;
  projectId: string;
  messageId: string;
  prompt: string;
  taskId: string;
  videoUrl?: string;
  provider: string;
  model: string;
  status: "queued" | "generating" | "completed" | "failed";
  metadata: Record<string, unknown>;
}) {
  await supabaseRest<unknown[]>(token, "generated_assets", {
    method: "POST",
    body: {
      project_id: projectId,
      user_id: userId,
      message_id: messageId,
      asset_type: "video",
      prompt,
      storage_bucket: "xfyun-avatar-video",
      storage_path: taskId,
      public_url: videoUrl,
      mime_type: videoUrl ? "video/mp4" : null,
      provider,
      model,
      status,
      metadata
    }
  });
}
