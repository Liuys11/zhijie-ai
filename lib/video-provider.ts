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
  headerCode: string;
  headerMessage: string;
  hasPayload: boolean;
  hasVideo: boolean;
  hasText: boolean;
  hasVideoUrl: boolean;
  videoUrl?: string;
  script?: string;
  imageUrl?: string;
  audioUrl?: string;
  bgmUrl?: string;
  audioDurationSeconds?: number;
  videoDurationSeconds?: number;
};

type XfyunVideoGenerateRequest = {
  header: {
    app_id: string;
    callback_url?: string;
  };
  parameter: {
    avatar: {
      prompt: string;
      word_count?: number;
    };
  };
};

type XfyunVideoQueryRequest = {
  header: {
    app_id: string;
    task_id: string;
  };
};

type XfyunHttpResult = {
  status: number;
  data: Record<string, unknown>;
};

type PayloadReadResult = {
  value: string;
  kind: string;
  textLength: number;
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

const MAX_XFYUN_VIDEO_PROMPT_LENGTH = 300;
const SAFE_XFYUN_VIDEO_PROMPT_LENGTH = 280;

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

function clampWordCount(value: number) {
  return Math.min(300, Math.max(50, Math.round(value)));
}

function getCharacterLength(value: string) {
  return Array.from(value).length;
}

function truncatePrompt(value: string, maxLength = SAFE_XFYUN_VIDEO_PROMPT_LENGTH) {
  return Array.from(value.trim()).slice(0, maxLength).join("");
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null && !Array.isArray(value) ? (value as Record<string, unknown>) : null;
}

function readString(record: Record<string, unknown> | null, key: string) {
  const value = record?.[key];
  return value === undefined || value === null ? "" : String(value);
}

function decodeTextCandidates(value: string) {
  const candidates = [value];
  if (!value || /^https?:\/\//i.test(value)) return candidates;

  try {
    const decoded = Buffer.from(value, "base64").toString("utf8").trim();
    if (decoded && decoded !== value) candidates.push(decoded);
  } catch {
    // Keep the raw value only.
  }

  return candidates;
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

async function callXfyunVideo(
  url: string,
  config: VideoProviderConfig,
  body: XfyunVideoGenerateRequest | XfyunVideoQueryRequest
): Promise<XfyunHttpResult> {
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
  if (/prompt.*length|length.*300|less or equal than 300|超过.*300/i.test(body)) return "视频主题描述过长，系统正在压缩后重新提交。";
  if (/param|参数|invalid|schema/i.test(body)) return `讯飞视频请求参数错误：${body}`;
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
    if (/prompt.*length|length.*300|less or equal than 300|超过.*300/i.test(message)) {
      throw new Error("视频生成要求过于复杂，请简化主题后重试。");
    }
    if (/param|参数|invalid|schema/i.test(message)) throw new Error(`讯飞视频请求参数错误：${message}`);
    throw new Error(`讯飞数字人视频${stage}失败：${message}`);
  }
}

function collectPayloadStrings(value: unknown): string[] {
  if (typeof value === "string") return [value];
  if (Array.isArray(value)) return value.flatMap((item) => collectPayloadStrings(item));

  const record = asRecord(value);
  if (!record) return [];

  const preferredKeys = ["text", "url", "content", "video", "video_url", "videoUrl", "file_url", "fileUrl", "download_url"];
  const preferredValues = preferredKeys.flatMap((key) => collectPayloadStrings(record[key]));
  const nestedValues = Object.entries(record)
    .filter(([key]) => !preferredKeys.includes(key))
    .flatMap(([, item]) => collectPayloadStrings(item));

  return [...preferredValues, ...nestedValues];
}

function getPayloadKind(value: unknown) {
  if (typeof value === "string") return "string";
  if (Array.isArray(value)) return "array";
  if (asRecord(value)) return "object";
  if (value === undefined) return "missing";
  return typeof value;
}

function readPayloadValue(response: Record<string, unknown>, key: "text" | "image" | "audio" | "bgm" | "video"): PayloadReadResult {
  const payload = asRecord(response.payload);
  const value = payload?.[key];
  const candidates = collectPayloadStrings(value).flatMap((item) => decodeTextCandidates(item));
  const firstValue = candidates.find((item) => item.trim()) || "";

  return {
    value: firstValue,
    kind: getPayloadKind(value),
    textLength: firstValue.length
  };
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

function extractUrlFromPayload(response: Record<string, unknown>, key: "image" | "audio" | "bgm" | "video") {
  const payload = asRecord(response.payload);
  const value = payload?.[key];
  const candidates = collectPayloadStrings(value).flatMap((item) => decodeTextCandidates(item));

  for (const candidate of candidates) {
    const directUrl = extractUrl(candidate);
    if (directUrl) return directUrl;
  }

  return "";
}

function findDuration(value: unknown): number | undefined {
  if (typeof value === "number" && Number.isFinite(value) && value > 0) {
    return value > 1000 ? value / 1000 : value;
  }

  if (typeof value === "string") {
    const parsed = Number.parseFloat(value);
    if (Number.isFinite(parsed) && parsed > 0) return parsed > 1000 ? parsed / 1000 : parsed;
    return undefined;
  }

  if (Array.isArray(value)) {
    for (const item of value) {
      const duration = findDuration(item);
      if (duration) return duration;
    }
    return undefined;
  }

  const record = asRecord(value);
  if (!record) return undefined;

  for (const key of ["duration", "duration_seconds", "durationSeconds", "duration_ms", "durationMs", "audio_duration", "video_duration", "time"]) {
    const duration = findDuration(record[key]);
    if (duration) return duration;
  }

  for (const item of Object.values(record)) {
    const duration = findDuration(item);
    if (duration) return duration;
  }

  return undefined;
}

function getPayloadDuration(response: Record<string, unknown>, key: "audio" | "video") {
  const payload = asRecord(response.payload);
  return findDuration(payload?.[key]);
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

function sanitizePromptText(value: string) {
  return value
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/<[^>]*>/g, " ")
    .replace(/[{}[\]"'`*_#>|~]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function compactRepeatedText(value: string) {
  const segments = value
    .split(/[。！？!?；;，,]/)
    .map((segment) => segment.trim())
    .filter(Boolean);
  return Array.from(new Set(segments)).join("，") || value;
}

function buildXfyunVideoPrompt(input: CreateVideoTaskInput) {
  const topic = truncatePrompt(compactRepeatedText(sanitizePromptText(input.topic)), 80);
  if (!topic) throw new Error("视频主题不能为空");

  const requirementMap: Record<VideoStyle, string[]> = {
    知识讲解: ["讲清核心概念", "解释关键公式", "给出简单算例", "总结易错点"],
    考前复习: ["突出考试重点", "梳理公式用法", "提示常见失误", "给出记忆线索"],
    概念科普: ["用通俗语言解释", "联系生活例子", "避免堆砌术语", "总结直观理解"],
    案例分析: ["结合具体场景", "说明解题步骤", "解释参数含义", "给出结论"]
  };
  const requirements = requirementMap[input.style].slice(0, 4).join("、");
  const prompt = [
    `请生成一段中文数字人教学视频，主题为${topic}。`,
    `面向${input.difficulty}学习者，风格为${input.style}。`,
    `${requirements}，表达简洁清晰。`
  ].join("");

  return truncatePrompt(prompt);
}

export function durationLabel(duration: VideoDurationOption) {
  if (duration === "30s") return "约30秒";
  if (duration === "90s") return "约1分30秒";
  return "约1分钟";
}

function buildGenerateBody(config: VideoProviderConfig, input: CreateVideoTaskInput): XfyunVideoGenerateRequest {
  const prompt = buildXfyunVideoPrompt(input).trim();
  if (!prompt) throw new Error("视频提示词不能为空。");

  const wordCount = clampWordCount(wordCountByDuration[input.duration]);
  const promptLength = getCharacterLength(prompt);

  console.info("[xfyun-video-prompt]", {
    promptLength,
    wordCount,
    topicLength: getCharacterLength(input.topic)
  });

  if (promptLength > MAX_XFYUN_VIDEO_PROMPT_LENGTH) {
    throw new Error(`数字人视频提示词超过300字符，当前长度：${promptLength}`);
  }

  const body: XfyunVideoGenerateRequest = {
    header: {
      app_id: config.appId
    },
    parameter: {
      avatar: {
        prompt,
        word_count: wordCount
      }
    }
  };

  console.info("[xfyun-video-generate-body]", {
    headerKeys: Object.keys(body.header),
    parameterKeys: Object.keys(body.parameter),
    avatarKeys: Object.keys(body.parameter.avatar),
    promptLength,
    wordCount: body.parameter.avatar.word_count
  });

  return body;
}

function buildQueryBody(config: VideoProviderConfig, taskId: string): XfyunVideoQueryRequest {
  return {
    header: {
      app_id: config.appId,
      task_id: taskId
    }
  };
}

export async function createXfyunVideoTask(input: CreateVideoTaskInput, config: VideoProviderConfig): Promise<XfyunVideoTask> {
  const body = buildGenerateBody(config, input);
  const response = await callXfyunVideo(config.generateUrl, config, body);
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
    prompt: body.parameter.avatar.prompt,
    wordCount: body.parameter.avatar.word_count || wordCountByDuration[input.duration]
  };
}

export async function queryXfyunVideoTask(taskId: string, config: VideoProviderConfig): Promise<XfyunVideoQueryResult> {
  const queryStartedAt = Date.now();
  const response = await callXfyunVideo(config.queryUrl, config, buildQueryBody(config, taskId));
  const elapsedMs = Date.now() - queryStartedAt;
  const header = getHeader(response.data);
  const payload = asRecord(response.data.payload);
  const taskStatus = getTaskStatus(response.data);
  const headerCode = readString(header, "code");
  const headerMessage = readString(header, "message");
  const hasPayload = Boolean(payload);
  const hasVideo = Boolean(payload?.video);
  const hasText = Boolean(payload?.text);
  const textPayload = readPayloadValue(response.data, "text");
  const videoPayload = readPayloadValue(response.data, "video");
  const videoUrl = extractUrlFromPayload(response.data, "video");
  const audioDurationSeconds = getPayloadDuration(response.data, "audio");
  const videoDurationSeconds = getPayloadDuration(response.data, "video");

  console.info("[xfyun-video-query]", {
    taskIdMasked: maskTaskId(taskId),
    elapsedMs,
    httpStatus: response.status,
    headerCode,
    headerMessage,
    rawTaskStatus: String(taskStatus ?? ""),
    hasPayload,
    hasVideo,
    hasText,
    payloadKeys: Object.keys(payload || {}),
    videoPayloadKind: videoPayload.kind,
    videoTextLength: videoPayload.textLength,
    hasVideoUrl: Boolean(videoUrl),
    audioDurationSeconds,
    videoDurationSeconds
  });

  assertSuccess(response.data, "查询任务");

  const status = normalizeTaskStatus(taskStatus);
  if (status !== "completed") {
    return {
      taskId,
      status,
      taskStatus,
      message: status === "created" ? "视频正在排队，请稍候。" : "正在生成数字人视频，请稍候。",
      headerCode,
      headerMessage,
      hasPayload,
      hasVideo,
      hasText,
      hasVideoUrl: false
    };
  }

  if (!videoUrl) {
    return {
      taskId,
      status: "processing",
      taskStatus,
      message: "视频已生成，正在获取播放地址，请继续查询。",
      headerCode,
      headerMessage,
      hasPayload,
      hasVideo,
      hasText,
      hasVideoUrl: false,
      script: textPayload.value || undefined,
      imageUrl: extractUrlFromPayload(response.data, "image") || undefined,
      audioUrl: extractUrlFromPayload(response.data, "audio") || undefined,
      bgmUrl: extractUrlFromPayload(response.data, "bgm") || undefined,
      audioDurationSeconds,
      videoDurationSeconds
    };
  }

  return {
    taskId,
    status: "completed",
    taskStatus,
    message: "视频生成完成。",
      headerCode,
      headerMessage,
      hasPayload,
      hasVideo,
      hasText,
    hasVideoUrl: true,
    videoUrl,
    script: textPayload.value || undefined,
    imageUrl: extractUrlFromPayload(response.data, "image") || undefined,
    audioUrl: extractUrlFromPayload(response.data, "audio") || undefined,
    bgmUrl: extractUrlFromPayload(response.data, "bgm") || undefined,
    audioDurationSeconds,
    videoDurationSeconds
  };
}
