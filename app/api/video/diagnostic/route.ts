import { NextRequest, NextResponse } from "next/server";
import {
  createXfyunVideoDiagnosticTask,
  getVideoProviderConfig,
  queryXfyunVideoDiagnosticTask
} from "@/lib/video-provider";
import { requireUser } from "@/lib/supabase-rest";

export const runtime = "nodejs";
export const maxDuration = 120;

type DiagnosticBody = {
  action?: "generate" | "query";
  taskId?: string;
  startedAt?: string;
};

function jsonError(message: string, status: number) {
  return NextResponse.json({ ok: false, error: message }, { status });
}

function asString(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function maskTaskId(taskId: string) {
  if (!taskId) return "";
  if (taskId.length <= 8) return "***";
  return `${taskId.slice(0, 4)}...${taskId.slice(-4)}`;
}

function getElapsedMs(startedAt?: string) {
  const startedTime = Date.parse(startedAt || "");
  if (!Number.isFinite(startedTime)) return 0;
  return Math.max(0, Date.now() - startedTime);
}

function logBuildVersion() {
  console.info("[video-build-version]", {
    commit: process.env.VERCEL_GIT_COMMIT_SHA || "local",
    environment: process.env.VERCEL_ENV || process.env.NODE_ENV || "local"
  });
}

export async function POST(request: NextRequest) {
  try {
    const auth = await requireUser(request);
    if ("status" in auth) return jsonError(auth.error, auth.status);

    logBuildVersion();

    const rawBody = (await request.json().catch(() => ({}))) as DiagnosticBody;
    const action = rawBody.action === "query" ? "query" : "generate";
    const config = getVideoProviderConfig();
    if (!config) return jsonError("视频服务尚未配置，无法执行诊断。", 400);

    const startedAt = rawBody.startedAt || new Date().toISOString();
    const phaseStartedAt = Date.now();
    const result = action === "query"
      ? await queryXfyunVideoDiagnosticTask(asString(rawBody.taskId), config)
      : await createXfyunVideoDiagnosticTask(config);
    const elapsedMs = action === "query" ? getElapsedMs(startedAt) : Date.now() - phaseStartedAt;

    console.info("[xfyun-video-diagnostic]", {
      phase: action,
      taskIdMasked: result.taskId ? maskTaskId(result.taskId) : undefined,
      httpStatus: result.httpStatus,
      headerCode: result.headerCode,
      headerMessage: result.headerMessage,
      taskStatus: String(result.taskStatus ?? ""),
      hasTaskId: result.hasTaskId,
      hasPayload: result.hasPayload,
      hasVideo: result.hasVideo,
      hasText: result.hasText,
      hasVideoUrl: result.hasVideoUrl,
      payloadKeys: result.payloadKeys,
      videoPayloadKind: result.videoPayloadKind,
      videoTextLength: result.videoTextLength,
      elapsedMs
    });

    return NextResponse.json({
      ok: true,
      action,
      startedAt,
      elapsedMs,
      result: {
        taskId: result.taskId,
        taskIdMasked: result.taskIdMasked,
        headerCode: result.headerCode,
        headerMessage: result.headerMessage,
        taskStatus: result.taskStatus,
        hasTaskId: result.hasTaskId,
        hasPayload: result.hasPayload,
        hasVideo: result.hasVideo,
        hasText: result.hasText,
        hasVideoUrl: result.hasVideoUrl,
        payloadKeys: result.payloadKeys,
        videoPayloadKind: result.videoPayloadKind,
        videoTextLength: result.videoTextLength,
        videoUrl: result.videoUrl
      }
    });
  } catch (error) {
    console.error("[xfyun-video-diagnostic-error]", error);
    return jsonError(error instanceof Error ? error.message : "视频诊断失败，请稍后重试。", 500);
  }
}
