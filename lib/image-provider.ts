import { createHmac } from "crypto";

type OpenAICompatibleImageProviderConfig = {
  provider: "openai-compatible";
  apiKey: string;
  baseUrl: string;
  model: string;
  size: string;
};

export type XfyunHiDreamTaskStatus = "waiting" | "processing" | "completed" | "failed";

type XfyunHiDreamImageProviderConfig = {
  provider: "xfyun-hidream";
  appId: string;
  apiKey: string;
  apiSecret: string;
  createUrl: string;
  queryUrl: string;
  aspectRatio: string;
  resolution: string;
  imageCount: number;
  pollIntervalMs: number;
  timeoutMs: number;
  requestTimeoutMs: number;
};

export type ImageProviderConfig = OpenAICompatibleImageProviderConfig | XfyunHiDreamImageProviderConfig;

export type GeneratedImage = {
  bytes: Uint8Array;
  mimeType: "image/png" | "image/jpeg" | "image/webp";
  provider: string;
  model: string;
};

export type XfyunHiDreamTask = {
  taskId: string;
  provider: "xfyun-hidream";
  model: string;
};

export type XfyunHiDreamQueryResult = {
  taskId: string;
  status: XfyunHiDreamTaskStatus;
  taskStatus: string;
  message: string;
  image?: GeneratedImage;
  hasResultText: boolean;
};

const DEFAULT_IMAGE_BASE_URL = "https://api.openai.com/v1";
const DEFAULT_IMAGE_MODEL = "gpt-image-1";
const DEFAULT_IMAGE_SIZE = "1024x1024";

const DEFAULT_XFYUN_HIDREAM_CREATE_URL = "https://cn-huadong-1.xf-yun.com/v1/private/s3fd61810/create";
const DEFAULT_XFYUN_HIDREAM_QUERY_URL = "https://cn-huadong-1.xf-yun.com/v1/private/s3fd61810/query";
const DEFAULT_XFYUN_HIDREAM_ASPECT_RATIO = "1:1";
const DEFAULT_XFYUN_HIDREAM_RESOLUTION = "2k";
const DEFAULT_XFYUN_HIDREAM_IMAGE_COUNT = 1;
const DEFAULT_XFYUN_HIDREAM_POLL_INTERVAL_MS = 3000;
const DEFAULT_XFYUN_HIDREAM_TIMEOUT_MS = 90000;
const DEFAULT_XFYUN_HIDREAM_REQUEST_TIMEOUT_MS = 15000;

type ImagePayloadResult =
  | {
      kind: "url";
      value: string;
    }
  | {
      kind: "base64";
      value: string;
    };

type XfyunHttpResult = {
  status: number;
  data: Record<string, unknown>;
};

export function getImageProviderConfig(): ImageProviderConfig | null {
  const provider = process.env.IMAGE_PROVIDER || "openai-compatible";

  if (provider === "xfyun-hidream") {
    const appId = process.env.XFYUN_HIDREAM_APP_ID;
    const apiKey = process.env.XFYUN_HIDREAM_API_KEY;
    const apiSecret = process.env.XFYUN_HIDREAM_API_SECRET;

    if (!appId || !apiKey || !apiSecret) return null;

    return {
      provider: "xfyun-hidream",
      appId,
      apiKey,
      apiSecret,
      createUrl: process.env.XFYUN_HIDREAM_CREATE_URL || DEFAULT_XFYUN_HIDREAM_CREATE_URL,
      queryUrl: process.env.XFYUN_HIDREAM_QUERY_URL || DEFAULT_XFYUN_HIDREAM_QUERY_URL,
      aspectRatio: process.env.XFYUN_HIDREAM_ASPECT_RATIO || DEFAULT_XFYUN_HIDREAM_ASPECT_RATIO,
      resolution: process.env.XFYUN_HIDREAM_RESOLUTION || DEFAULT_XFYUN_HIDREAM_RESOLUTION,
      imageCount: parsePositiveInt(process.env.XFYUN_HIDREAM_IMAGE_COUNT, DEFAULT_XFYUN_HIDREAM_IMAGE_COUNT, 1, 4),
      pollIntervalMs: parsePositiveInt(
        process.env.XFYUN_HIDREAM_POLL_INTERVAL_MS,
        DEFAULT_XFYUN_HIDREAM_POLL_INTERVAL_MS,
        1000,
        15000
      ),
      timeoutMs: parsePositiveInt(process.env.XFYUN_HIDREAM_TIMEOUT_MS, DEFAULT_XFYUN_HIDREAM_TIMEOUT_MS, 15000, 120000),
      requestTimeoutMs: parsePositiveInt(
        process.env.XFYUN_HIDREAM_REQUEST_TIMEOUT_MS,
        DEFAULT_XFYUN_HIDREAM_REQUEST_TIMEOUT_MS,
        5000,
        30000
      )
    };
  }

  const apiKey = process.env.IMAGE_API_KEY || process.env.OPENAI_API_KEY;
  if (!apiKey) return null;

  return {
    provider: "openai-compatible",
    apiKey,
    baseUrl: (process.env.IMAGE_BASE_URL || process.env.OPENAI_BASE_URL || DEFAULT_IMAGE_BASE_URL).replace(/\/$/, ""),
    model: process.env.IMAGE_MODEL || DEFAULT_IMAGE_MODEL,
    size: process.env.IMAGE_SIZE || DEFAULT_IMAGE_SIZE
  };
}

export function getImageProviderSetupHint() {
  if (process.env.IMAGE_PROVIDER === "xfyun-hidream") {
    return "图片生成服务尚未配置。请在 Vercel 配置 XFYUN_HIDREAM_APP_ID、XFYUN_HIDREAM_API_KEY、XFYUN_HIDREAM_API_SECRET。";
  }

  return "图片生成服务尚未配置。请在 Vercel 配置 IMAGE_API_KEY、IMAGE_BASE_URL 和 IMAGE_MODEL，或切换到 IMAGE_PROVIDER=xfyun-hidream。";
}

function parsePositiveInt(value: string | undefined, fallback: number, min: number, max: number) {
  const parsed = Number.parseInt(value || "", 10);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(max, Math.max(min, parsed));
}

function getImagesUrl(baseUrl: string) {
  return baseUrl.endsWith("/images/generations") ? baseUrl : `${baseUrl}/images/generations`;
}

function decodeBase64Image(value: string) {
  return Uint8Array.from(Buffer.from(value, "base64"));
}

function encodeBase64Json(value: unknown) {
  return Buffer.from(JSON.stringify(value), "utf8").toString("base64");
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null && !Array.isArray(value) ? (value as Record<string, unknown>) : null;
}

function readString(record: Record<string, unknown> | null, key: string) {
  const value = record?.[key];
  return value === undefined || value === null ? "" : String(value);
}

function inferMimeTypeFromUrl(url: string): "image/png" | "image/jpeg" | "image/webp" {
  const lowerUrl = url.toLowerCase();
  if (lowerUrl.includes(".jpg") || lowerUrl.includes(".jpeg")) return "image/jpeg";
  if (lowerUrl.includes(".webp")) return "image/webp";
  return "image/png";
}

function inferMimeTypeFromBytes(bytes: Uint8Array): "image/png" | "image/jpeg" | "image/webp" {
  if (bytes[0] === 0xff && bytes[1] === 0xd8) return "image/jpeg";
  if (bytes[0] === 0x52 && bytes[1] === 0x49 && bytes[2] === 0x46 && bytes[3] === 0x46) return "image/webp";
  return "image/png";
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

async function fetchImageUrl(url: string, timeoutMs = DEFAULT_XFYUN_HIDREAM_REQUEST_TIMEOUT_MS): Promise<Pick<GeneratedImage, "bytes" | "mimeType">> {
  const response = await fetchWithTimeout(url, { cache: "no-store" }, timeoutMs);
  if (!response.ok) throw new Error(`图片下载失败，状态码 ${response.status}`);

  const contentType = response.headers.get("content-type") || inferMimeTypeFromUrl(url);
  if (!contentType.startsWith("image/")) throw new Error("图片服务返回的不是图片文件");

  const bytes = new Uint8Array(await response.arrayBuffer());
  const mimeType = contentType.includes("jpeg") || contentType.includes("jpg")
    ? "image/jpeg"
    : contentType.includes("webp")
      ? "image/webp"
      : "image/png";

  return { bytes, mimeType };
}

function maskTaskId(taskId: string) {
  if (taskId.length <= 8) return "***";
  return `${taskId.slice(0, 4)}...${taskId.slice(-4)}`;
}

function buildXfyunSignedUrl(rawUrl: string, apiKey: string, apiSecret: string) {
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

function buildXfyunCreateBody(config: XfyunHiDreamImageProviderConfig, payload: unknown) {
  return {
    header: {
      app_id: config.appId,
      status: 3,
      channel: "default",
      callback_url: "default"
    },
    parameter: {
      oig: {
        result: {
          encoding: "utf8",
          compress: "raw",
          format: "json"
        }
      }
    },
    payload: {
      oig: {
        encoding: "utf8",
        compress: "raw",
        format: "json",
        status: 3,
        text: encodeBase64Json(payload)
      }
    }
  };
}

async function callXfyun(url: string, config: XfyunHiDreamImageProviderConfig, body: unknown): Promise<XfyunHttpResult> {
  const response = await fetchWithTimeout(
    buildXfyunSignedUrl(url, config.apiKey, config.apiSecret),
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
  if (!response.ok) throw new Error(text || `讯飞 HiDream 接口调用失败，状态码 ${response.status}`);

  try {
    return {
      status: response.status,
      data: JSON.parse(text) as Record<string, unknown>
    };
  } catch {
    throw new Error("讯飞 HiDream 接口返回了无法解析的 JSON");
  }
}

function getXfyunHeader(response: Record<string, unknown>) {
  return asRecord(response.header);
}

function assertXfyunSuccess(response: Record<string, unknown>, stage: string) {
  const header = getXfyunHeader(response);
  const code = readString(header, "code");
  const message = readString(header, "message") || "未知错误";
  if (code && code !== "0") {
    throw new Error(`讯飞 HiDream ${stage}失败：${message}`);
  }
}

function getXfyunResultText(response: Record<string, unknown>) {
  const payload = asRecord(response.payload);
  return readString(asRecord(payload?.result), "text") || readString(asRecord(payload?.oig), "text");
}

function decodeXfyunPayloadJson(response: Record<string, unknown>) {
  const resultText = getXfyunResultText(response);
  if (!resultText) return null;

  try {
    return JSON.parse(Buffer.from(resultText, "base64").toString("utf8")) as unknown;
  } catch {
    throw new Error("讯飞 HiDream 返回结果解析失败");
  }
}

function findTaskId(value: unknown): string {
  const record = asRecord(value);
  if (!record) return "";

  const direct = readString(record, "task_id") || readString(record, "taskId") || readString(record, "id");
  if (direct) return direct;

  for (const nestedValue of Object.values(record)) {
    if (Array.isArray(nestedValue)) continue;
    const nestedTaskId = findTaskId(nestedValue);
    if (nestedTaskId) return nestedTaskId;
  }

  return "";
}

function getHeaderTaskId(response: Record<string, unknown>) {
  return readString(getXfyunHeader(response), "task_id");
}

function getHeaderTaskStatus(response: Record<string, unknown>) {
  return readString(getXfyunHeader(response), "task_status");
}

function normalizeTaskStatus(taskStatus: string): XfyunHiDreamTaskStatus {
  if (taskStatus === "1") return "waiting";
  if (taskStatus === "2") return "processing";
  if (taskStatus === "3" || taskStatus === "4") return "completed";
  return "processing";
}

function looksLikeImageUrl(value: string) {
  return /^https?:\/\//i.test(value) && (
    /\.(png|jpe?g|webp)(\?|#|$)/i.test(value)
    || /image|img|oss|cos|obs|cdn/i.test(value)
  );
}

function looksLikeBase64Image(value: string) {
  const normalized = value.replace(/^data:image\/(?:png|jpeg|jpg|webp);base64,/, "");
  return normalized.length > 200 && /^[A-Za-z0-9+/=]+$/.test(normalized);
}

function parseJsonLikeString(value: string): unknown | null {
  const trimmed = value.trim();
  if (!trimmed || (!trimmed.startsWith("{") && !trimmed.startsWith("["))) return null;
  try {
    return JSON.parse(trimmed) as unknown;
  } catch {
    return null;
  }
}

function parseBase64JsonLikeString(value: string): unknown | null {
  const normalized = value.replace(/^data:application\/json;base64,/, "").trim();
  if (normalized.length < 16 || !/^[A-Za-z0-9+/=]+$/.test(normalized)) return null;
  try {
    const decoded = Buffer.from(normalized, "base64").toString("utf8").trim();
    return parseJsonLikeString(decoded);
  } catch {
    return null;
  }
}

function describePayloadShape(value: unknown): unknown {
  if (typeof value === "string") {
    return {
      type: "string",
      length: value.length,
      looksLikeUrl: /^https?:\/\//i.test(value),
      looksLikeBase64: /^[A-Za-z0-9+/=]+$/.test(value.slice(0, 80))
    };
  }
  if (Array.isArray(value)) {
    return {
      type: "array",
      length: value.length,
      first: value.length ? describePayloadShape(value[0]) : null
    };
  }
  const record = asRecord(value);
  if (!record) return { type: value === null ? "null" : typeof value };
  const keys = Object.keys(record);
  return {
    type: "object",
    keys: keys.slice(0, 20),
    children: Object.fromEntries(keys.slice(0, 8).map((key) => [key, describePayloadShape(record[key])]))
  };
}

function findFirstImagePayload(value: unknown): ImagePayloadResult | null {
  if (typeof value === "string") {
    if (looksLikeImageUrl(value)) return { kind: "url", value };
    if (looksLikeBase64Image(value)) return { kind: "base64", value: value.replace(/^data:image\/(?:png|jpeg|jpg|webp);base64,/, "") };
    const jsonValue = parseJsonLikeString(value) || parseBase64JsonLikeString(value);
    if (jsonValue) return findFirstImagePayload(jsonValue);
    return null;
  }

  if (Array.isArray(value)) {
    for (const item of value) {
      const image = findFirstImagePayload(item);
      if (image) return image;
    }
    return null;
  }

  const record = asRecord(value);
  if (!record) return null;

  const preferredKeys = [
    "url",
    "urls",
    "image_url",
    "image_urls",
    "imageUrl",
    "imageUrls",
    "file_url",
    "fileUrl",
    "download_url",
    "downloadUrl",
    "resource_url",
    "resourceUrl",
    "result_url",
    "resultUrl",
    "img_url",
    "imgUrl",
    "image",
    "images",
    "b64_json",
    "base64",
    "content",
    "text"
  ];
  for (const key of preferredKeys) {
    const image = findFirstImagePayload(record[key]);
    if (image) return image;
  }

  for (const nestedValue of Object.values(record)) {
    const image = findFirstImagePayload(nestedValue);
    if (image) return image;
  }

  return null;
}

async function materializeImagePayload(
  imagePayload: ImagePayloadResult,
  config: XfyunHiDreamImageProviderConfig
): Promise<GeneratedImage> {
  const model = `hidream-${config.resolution}-${config.aspectRatio}`;
  if (imagePayload.kind === "url") {
    const image = await fetchImageUrl(imagePayload.value, config.requestTimeoutMs);
    return {
      ...image,
      provider: config.provider,
      model
    };
  }

  const bytes = decodeBase64Image(imagePayload.value);
  return {
    bytes,
    mimeType: inferMimeTypeFromBytes(bytes),
    provider: config.provider,
    model
  };
}

async function generateOpenAICompatibleImage(
  prompt: string,
  config: OpenAICompatibleImageProviderConfig
): Promise<GeneratedImage> {
  const response = await fetch(getImagesUrl(config.baseUrl), {
    method: "POST",
    headers: {
      Authorization: `Bearer ${config.apiKey}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      model: config.model,
      prompt,
      size: config.size,
      n: 1
    }),
    cache: "no-store"
  });

  const text = await response.text();
  if (!response.ok) {
    throw new Error(text || `图片生成接口调用失败，状态码 ${response.status}`);
  }

  const data = JSON.parse(text) as {
    data?: Array<{
      b64_json?: string;
      url?: string;
      revised_prompt?: string;
    }>;
  };
  const firstImage = data.data?.[0];
  if (!firstImage) throw new Error("图片生成接口没有返回图片");

  if (firstImage.b64_json) {
    return {
      bytes: decodeBase64Image(firstImage.b64_json),
      mimeType: "image/png",
      provider: config.provider,
      model: config.model
    };
  }

  if (firstImage.url) {
    const image = await fetchImageUrl(firstImage.url);
    return {
      ...image,
      provider: config.provider,
      model: config.model
    };
  }

  throw new Error("图片生成接口返回格式不支持");
}

export async function createXfyunHiDreamTask(
  prompt: string,
  config: XfyunHiDreamImageProviderConfig
): Promise<XfyunHiDreamTask> {
  const createPayload = {
    prompt,
    aspect_ratio: config.aspectRatio,
    resolution: config.resolution,
    img_count: config.imageCount
  };

  const createResponse = await callXfyun(config.createUrl, config, buildXfyunCreateBody(config, createPayload));
  const header = getXfyunHeader(createResponse.data);
  const headerCode = readString(header, "code");
  let taskId = getHeaderTaskId(createResponse.data);
  if (!headerCode || headerCode === "0") {
    const createResult = decodeXfyunPayloadJson(createResponse.data) || createResponse.data;
    taskId = taskId || findTaskId(createResult) || findTaskId(createResponse.data);
  }

  console.info("[hidream-create]", {
    httpStatus: createResponse.status,
    code: readString(header, "code"),
    message: readString(header, "message"),
    hasTaskId: Boolean(taskId),
    taskId: taskId ? maskTaskId(taskId) : undefined
  });

  assertXfyunSuccess(createResponse.data, "创建任务");
  if (!taskId) throw new Error("讯飞 HiDream 创建任务成功，但没有返回 task_id");

  return {
    taskId,
    provider: "xfyun-hidream",
    model: `hidream-${config.resolution}-${config.aspectRatio}`
  };
}

export async function queryXfyunHiDreamTask(
  taskId: string,
  config: XfyunHiDreamImageProviderConfig,
  pollCount: number
): Promise<XfyunHiDreamQueryResult> {
  const queryResponse = await callXfyun(config.queryUrl, config, {
    header: {
      app_id: config.appId,
      task_id: taskId
    }
  });

  const header = getXfyunHeader(queryResponse.data);
  const taskStatus = getHeaderTaskStatus(queryResponse.data);
  const resultText = getXfyunResultText(queryResponse.data);
  const status = normalizeTaskStatus(taskStatus);
  const queryResult = decodeXfyunPayloadJson(queryResponse.data);
  const imagePayload = status === "completed" ? findFirstImagePayload(queryResult) : null;

  console.info("[hidream-query]", {
    pollCount,
    httpStatus: queryResponse.status,
    code: readString(header, "code"),
    message: readString(header, "message"),
    taskStatus,
    hasResultText: Boolean(resultText),
    hasPayload: Boolean(queryResult),
    payloadShape: status === "completed" ? describePayloadShape(queryResult) : undefined,
    imagePayloadKind: imagePayload?.kind,
    hasImagePayload: Boolean(imagePayload),
    taskId: maskTaskId(taskId)
  });

  assertXfyunSuccess(queryResponse.data, "查询任务");
  if (status !== "completed") {
    return {
      taskId,
      status,
      taskStatus,
      message: status === "waiting" ? "图片正在排队生成，请稍候。" : "图片正在生成中，请稍候。",
      hasResultText: Boolean(resultText)
    };
  }

  if (!imagePayload) {
    return {
      taskId,
      status: "processing",
      taskStatus,
      message: "讯飞图片任务已完成，但未返回可解析的图片地址。请稍后继续查询，或查看 Vercel 日志中的 payloadShape。",
      hasResultText: Boolean(resultText)
    };
  }

  return {
    taskId,
    status: "completed",
    taskStatus,
    message: "图片生成完成。",
    image: await materializeImagePayload(imagePayload, config),
    hasResultText: Boolean(resultText)
  };
}

export async function generateImage(prompt: string, config: ImageProviderConfig): Promise<GeneratedImage> {
  if (config.provider === "xfyun-hidream") {
    const task = await createXfyunHiDreamTask(prompt, config);
    const startedAt = Date.now();
    let pollCount = 0;

    while (Date.now() - startedAt < config.timeoutMs) {
      await new Promise((resolve) => setTimeout(resolve, config.pollIntervalMs));
      pollCount += 1;
      const result = await queryXfyunHiDreamTask(task.taskId, config, pollCount);
      if (result.status === "failed") throw new Error(result.message);
      if (result.image) return result.image;
    }

    throw new Error("讯飞图片任务处理时间较长，请点击继续查询。");
  }

  return generateOpenAICompatibleImage(prompt, config);
}
