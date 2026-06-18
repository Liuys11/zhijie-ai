import { createHmac } from "crypto";

export type VideoProviderConfig = {
  provider: "xfyun-avatar-video";
  appId: string;
  apiKey: string;
  apiSecret: string;
  generateUrl: string;
  queryUrl: string;
  pollIntervalMs: number;
  timeoutMs: number;
  requestTimeoutMs: number;
};

export type VideoDurationOption = "30s" | "60s" | "90s";
export type VideoDifficulty = "入门" | "基础" | "进阶";
export type VideoStyle = "知识讲解" | "考前复习" | "概念科普" | "案例分析";

export type CreateVideoTaskInput = {
  topic: string;
  projectName: string;
  duration: VideoDurationOption;
  difficulty: VideoDifficulty;
  style: VideoStyle;
};

export type XfyunVideoTask = {
  taskId: string;
  provider: "xfyun-avatar-video";
  model: string;
  prompt: string;
  wordCount: number;
};

export type XfyunVideoStatus = "created" | "processing" | "completed" | "failed";

export type XfyunVideoQueryResult = {
  taskId: string;
  status: XfyunVideoStatus;
  taskStatus: string;
  message: string;
  hasVideoUrl: boolean;
  videoUrl?: string;
  script?: string;
  imageUrl?: string;
  audioUrl?: string;
  bgmUrl?: string;
};

const DEFAULT_GENERATE_URL = "https://vms.cn-huadong-1.xf-yun.com/v1/private/video/generate";
const DEFAULT_QUERY_URL = "https://vms.cn-huadong-1.xf-yun.com/v1/private/video/query";
const DEFAULT_POLL_INTERVAL_MS = 5000;
const DEFAULT_TIMEOUT_MS = 300000;
const DEFAULT_REQUEST_TIMEOUT_MS = 15000;

const wordCountByDuration: Record<VideoDurationOption, number> = {
  "30s": 80,
  "60s": 150,
  "90s": 220
};

type XfyunHttpResult = {
  status: number;
  data: Record<string, unknown>;
};

export function getVideoProviderConfig(): VideoProviderConfig | null {
  const provider = process.env.VIDEO_PROVIDER;
  if (provider !== "xfyun-avatar-video") return null;

  const appId = process.env.XFYUN_VIDEO_APP_ID;
  const apiKey = process.env.XFYUN_VIDEO_API_KEY;
  const apiSecret = process.env.XFYUN_VIDEO_API_SECRET;
  if (!appId || !apiKey || !apiSecret) return null;

  return {
    provider: "xfyun-avatar-video",
    appId,
    apiKey,
    apiSecret,
    generateUrl: process.env.XFYUN_VIDEO_GENERATE_URL || DEFAULT_GENERATE_URL,
    queryUrl: process.env.XFYUN_VIDEO_QUERY_URL || DEFAULT_QUERY_URL,
    pollIntervalMs: parsePositiveInt(process.env.XFYUN_VIDEO_POLL_INTERVAL_MS, DEFAULT_POLL_INTERVAL_MS, 2000, 30000),
    timeoutMs: parsePositiveInt(process.env.XFYUN_VIDEO_TIMEOUT_MS, DEFAULT_TIMEOUT_MS, 30000, 600000),
    requestTimeoutMs: parsePositiveInt(process.env.XFYUN_VIDEO_REQUEST_TIMEOUT_MS, DEFAULT_REQUEST_TIMEOUT_MS, 5000, 30000)
  };
}

export function getVideoProviderSetupHint() {
  if (process.env.VIDEO_PROVIDER !== "xfyun-avatar-video") {
    return "视频生成服务尚未启用。请在 Vercel 配置 VIDEO_PROVIDER=xfyun-avatar-video。";
  }

  return "视频生成服务尚未配置完整。请在 Vercel 配置 XFYUN_VIDEO_APP_ID、XFYUN_VIDEO_API_KEY、XFYUN_VIDEO_API_SECRET。";
}

function parsePositiveInt(value: string | undefined, fallback: number, min: number, max: number) {
  const parsed = Number.parseInt(value || "", 10);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(max, Math.max(min, parsed));
}

function encodeBase64Json(value: unknown) {
  return Buffer.from(JSON.stringify(value), "utf8").toString("base64");
}

function decodeBase64Text(value: string) {
  return Buffer.from(value, "base64").toString("utf8");
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null && !Array.isArray(value) ? (value as Record<string, unknown>) : null;
}

function readString(record: Record<string, unknown> | null, key: string) {
  const value = record?.[key];
  return value === undefined || value === null ? "" : String(value);
}

function maskTaskId(taskId: string) {
  if (taskId.length <= 8) return "***";
  return `${taskId.slice(0, 4)}...${taskId.slice(-4)}`;
}

function buildSignedUrl(rawUrl: string, apiKey: string, apiSecret: string) {
  const url = new URL(rawUrl);
  const date = new Date().toUTCString();
  const signatureOrigin = `host: ${url.host}\ndate: ${date}\nPOST ${url.pathname} HTTP/1.1`;
  const signature = createHmac("sha256", apiSecret).update(signatureOrigin).digest("base64");
  const authorizationOrigin = `api_key="${apiKey}", algorithm="hmac-sha256", headers="host date request-line", signature="${signature}"`;
  const authorization = Buffer.from(authorizationOrigin, "utf8").toString("base64");

  url.searchParams.set("authorization", authorization);
  url.searchParams.set("date", date);
  url.searchParams.set("host", url.host);
  return url.toString();
}

async function fetchWithTimeout(url: string, init: RequestInit, timeoutMs: number) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    return await fetch(url, {
      ...init,
      signal: controller.signal
    });
  } finally {
    clearTimeout(timer);
  }
}

async function callXfyunVideo(url: string, config: VideoProviderConfig, body: unknown): Promise<XfyunHttpResult> {
  const response = await fetchWithTimeout(
    buildSignedUrl(url, config.apiKey, config.apiSecret),
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Host: new URL(url).host
      },
      body: JSON.stringify(body),
      cache: "no-store"
    },
    config.requestTimeoutMs
  );

  const text = await response.text();
  if (!response.ok) {
    throw new Error(formatHttpError(response.status, text));
  }

  try {
    return {
      status: response.status,
      data: JSON.parse(text) as Record<string, unknown>
    };
  } catch {
    throw new Error("讯飞数字人视频接口返回了无法解析的 JSON");
  }
}

function formatHttpError(status: number, body: string) {
  if (status === 401 || /401|Unauthorized|signature/i.test(body)) return "讯飞视频鉴权失败，请检查 APP_ID、APIKey、APISecret。";
  if (/quota|余额|额度|insufficient/i.test(body)) return "讯飞视频免费额度不足或余额不足。";
  if (/not.*open|未开通|permission|forbidden|403/i.test(body)) return "讯飞数字人视频服务未开通或无权限。";
  if (/param|参数|invalid/i.test(body)) return `讯飞视频请求参数错误：${body}`;
  return body || `讯飞数字人视频接口调用失败，状态码 ${status}`;
}

function getHeader(response: Record<string, unknown>) {
  return asRecord(response.header);
}

function assertSuccess(response: Record<string, unknown>, stage: string) {
  const header = getHeader(response);
  const code = readString(header, "code");
  const message = readString(header, "message") || "未知错误";
  if (code && code !== "0") {
    if (/quota|余额|额度/i.test(message)) throw new Error("讯飞视频免费额度不足或余额不足。");
    if (/未开通|权限|permission|forbidden/i.test(message)) throw new Error("讯飞数字人视频服务未开通或无权限。");
    if (/param|参数|invalid/i.test(message)) throw new Error(`讯飞视频请求参数错误：${message}`);
    throw new Error(`讯飞数字人视频${stage}失败：${message}`);
  }
}

function getPayloadRecord(response: Record<string, unknown>, key: string) {
  return asRecord(asRecord(response.payload)?.[key]);
}

function readPayloadText(response: Record<string, unknown>, key: "text" | "image" | "audio" | "bgm" | "video") {
  const payload = getPayloadRecord(response, key);
  const rawText = readString(payload, "text") || readString(payload, "url");
  if (!rawText) return "";
  if (/^https?:\/\//i.test(rawText)) return rawText;

  try {
    return decodeBase64Text(rawText);
  } catch {
    return rawText;
  }
}

function extractUrl(rawValue: string) {
  const directMatch = rawValue.match(/https?:\/\/[^\s"'<>]+/i);
  if (directMatch) return directMatch[0];

  try {
    const parsed = JSON.parse(rawValue) as unknown;
    return findUrl(parsed);
  } catch {
    return "";
  }
}

function findUrl(value: unknown): string {
  if (typeof value === "string") return /^https?:\/\//i.test(value) ? value : "";
  if (Array.isArray(value)) {
    for (const item of value) {
      const found = findUrl(item);
      if (found) return found;
    }
    return "";
  }

  const record = asRecord(value);
  if (!record) return "";
  for (const key of ["url", "video_url", "videoUrl", "file_url", "fileUrl", "download_url"]) {
    const found = findUrl(record[key]);
    if (found) return found;
  }
  for (const item of Object.values(record)) {
    const found = findUrl(item);
    if (found) return found;
  }
  return "";
}

function getTaskStatus(response: Record<string, unknown>) {
  return readString(getHeader(response), "task_status");
}

function normalizeTaskStatus(taskStatus: string): XfyunVideoStatus {
  if (taskStatus === "1") return "created";
  if (taskStatus === "2") return "processing";
  if (taskStatus === "3" || taskStatus === "4") return "completed";
  return "processing";
}

function buildPrompt(input: CreateVideoTaskInput) {
  return [
    `请生成一段适合大学生学习的数字人微课视频。`,
    `当前学习项目：${input.projectName}`,
    `主题：${input.topic}`,
    `预计时长：${durationLabel(input.duration)}`,
    `难度：${input.difficulty}`,
    `风格：${input.style}`,
    `要求：语言清晰，先解释概念，再给出公式或例子，最后总结易错点。`
  ].join("\n");
}

export function durationLabel(duration: VideoDurationOption) {
  if (duration === "30s") return "约30秒";
  if (duration === "90s") return "约1分30秒";
  return "约1分钟";
}

function buildGenerateBody(config: VideoProviderConfig, input: CreateVideoTaskInput) {
  const prompt = buildPrompt(input);

  return {
    header: {
      app_id: config.appId,
      status: 3
    },
    parameter: {
      video: {
        result: {
          encoding: "utf8",
          compress: "raw",
          format: "json"
        }
      }
    },
    payload: {
      text: {
        encoding: "utf8",
        compress: "raw",
        format: "json",
        status: 3,
        text: encodeBase64Json({
          prompt,
          word_count: wordCountByDuration[input.duration],
          duration: durationLabel(input.duration),
          difficulty: input.difficulty,
          style: input.style
        })
      }
    }
  };
}

export async function createXfyunVideoTask(input: CreateVideoTaskInput, config: VideoProviderConfig): Promise<XfyunVideoTask> {
  const response = await callXfyunVideo(config.generateUrl, config, buildGenerateBody(config, input));
  const header = getHeader(response.data);
  const taskId = readString(header, "task_id");

  console.info("[xfyun-video-generate]", {
    httpStatus: response.status,
    code: readString(header, "code"),
    message: readString(header, "message"),
    hasTaskId: Boolean(taskId),
    taskId: taskId ? maskTaskId(taskId) : undefined
  });

  assertSuccess(response.data, "创建任务");
  if (!taskId) throw new Error("讯飞数字人视频任务创建成功，但没有返回 task_id。");

  return {
    taskId,
    provider: "xfyun-avatar-video",
    model: "xfyun-avatar-video",
    prompt: buildPrompt(input),
    wordCount: wordCountByDuration[input.duration]
  };
}

export async function queryXfyunVideoTask(taskId: string, config: VideoProviderConfig): Promise<XfyunVideoQueryResult> {
  const response = await callXfyunVideo(config.queryUrl, config, {
    header: {
      app_id: config.appId,
      task_id: taskId
    }
  });
  const header = getHeader(response.data);
  const taskStatus = getTaskStatus(response.data);
  const textPayload = readPayloadText(response.data, "text");
  const imagePayload = readPayloadText(response.data, "image");
  const audioPayload = readPayloadText(response.data, "audio");
  const bgmPayload = readPayloadText(response.data, "bgm");
  const videoPayload = readPayloadText(response.data, "video");
  const videoUrl = extractUrl(videoPayload);

  console.info("[xfyun-video-query]", {
    httpStatus: response.status,
    code: readString(header, "code"),
    message: readString(header, "message"),
    taskStatus,
    hasVideoUrl: Boolean(videoUrl),
    taskId: maskTaskId(taskId)
  });

  assertSuccess(response.data, "查询任务");

  const status = normalizeTaskStatus(taskStatus);
  if (status !== "completed") {
    return {
      taskId,
      status,
      taskStatus,
      message: status === "created" ? "视频正在排队，请稍候。" : "正在生成数字人视频，请稍候。",
      hasVideoUrl: false
    };
  }

  if (!videoUrl) {
    return {
      taskId,
      status: "processing",
      taskStatus,
      message: "视频任务已完成但暂未返回 MP4 地址，请继续查询。",
      hasVideoUrl: false,
      script: textPayload || undefined,
      imageUrl: extractUrl(imagePayload) || undefined,
      audioUrl: extractUrl(audioPayload) || undefined,
      bgmUrl: extractUrl(bgmPayload) || undefined
    };
  }

  return {
    taskId,
    status: "completed",
    taskStatus,
    message: "视频生成完成。",
    hasVideoUrl: true,
    videoUrl,
    script: textPayload || undefined,
    imageUrl: extractUrl(imagePayload) || undefined,
    audioUrl: extractUrl(audioPayload) || undefined,
    bgmUrl: extractUrl(bgmPayload) || undefined
  };
}
