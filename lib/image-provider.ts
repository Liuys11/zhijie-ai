import { createHmac } from "crypto";

type OpenAICompatibleImageProviderConfig = {
  provider: "openai-compatible";
  apiKey: string;
  baseUrl: string;
  model: string;
  size: string;
};

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
};

export type ImageProviderConfig = OpenAICompatibleImageProviderConfig | XfyunHiDreamImageProviderConfig;

export type GeneratedImage = {
  bytes: Uint8Array;
  mimeType: "image/png" | "image/jpeg" | "image/webp";
  provider: string;
  model: string;
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
const DEFAULT_XFYUN_HIDREAM_TIMEOUT_MS = 55000;

type ImagePayloadResult =
  | {
      kind: "url";
      value: string;
    }
  | {
      kind: "base64";
      value: string;
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
      timeoutMs: parsePositiveInt(process.env.XFYUN_HIDREAM_TIMEOUT_MS, DEFAULT_XFYUN_HIDREAM_TIMEOUT_MS, 15000, 60000)
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
  return typeof value === "string" ? value : "";
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

async function fetchImageUrl(url: string): Promise<Pick<GeneratedImage, "bytes" | "mimeType">> {
  const response = await fetch(url, { cache: "no-store" });
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

function buildXfyunRequestBody(config: XfyunHiDreamImageProviderConfig, payload: unknown) {
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

async function callXfyun(url: string, config: XfyunHiDreamImageProviderConfig, body: unknown) {
  const response = await fetch(buildXfyunSignedUrl(url, config.apiKey, config.apiSecret), {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Host: new URL(url).host
    },
    body: JSON.stringify(body),
    cache: "no-store"
  });

  const text = await response.text();
  if (!response.ok) throw new Error(text || `讯飞 HiDream 接口调用失败，状态码 ${response.status}`);

  try {
    return JSON.parse(text) as Record<string, unknown>;
  } catch {
    throw new Error("讯飞 HiDream 接口返回了无法解析的 JSON");
  }
}

function assertXfyunSuccess(response: Record<string, unknown>, stage: string) {
  const header = asRecord(response.header);
  const code = header?.code;
  const message = readString(header, "message") || readString(header, "sid") || "未知错误";
  if (code !== undefined && String(code) !== "0") {
    throw new Error(`讯飞 HiDream ${stage}失败：${message}`);
  }
}

function decodeXfyunPayloadJson(response: Record<string, unknown>) {
  const payload = asRecord(response.payload);
  const resultText = readString(asRecord(payload?.result), "text") || readString(asRecord(payload?.oig), "text");
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

function findHeaderTaskId(response: Record<string, unknown>) {
  return readString(asRecord(response.header), "task_id");
}

function normalizeTaskStatus(value: unknown) {
  const record = asRecord(value);
  if (!record) return "running";

  const rawStatus = readString(record, "status")
    || readString(record, "state")
    || readString(record, "task_status")
    || readString(record, "taskStatus")
    || readString(record, "code");
  const status = String(rawStatus).toLowerCase();

  if (["3", "4", "completed", "complete", "success", "succeeded", "finished", "done"].includes(status)) return "completed";
  if (["failed", "fail", "error", "timeout", "canceled", "cancelled"].includes(status)) return "failed";
  return "running";
}

function findErrorMessage(value: unknown): string {
  const record = asRecord(value);
  if (!record) return "";

  const direct = readString(record, "message") || readString(record, "error") || readString(record, "desc");
  if (direct) return direct;

  for (const nestedValue of Object.values(record)) {
    if (Array.isArray(nestedValue)) continue;
    const nestedMessage = findErrorMessage(nestedValue);
    if (nestedMessage) return nestedMessage;
  }

  return "";
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

function findFirstImagePayload(value: unknown): ImagePayloadResult | null {
  if (typeof value === "string") {
    if (looksLikeImageUrl(value)) return { kind: "url", value };
    if (looksLikeBase64Image(value)) return { kind: "base64", value: value.replace(/^data:image\/(?:png|jpeg|jpg|webp);base64,/, "") };
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

  const preferredKeys = ["url", "image_url", "imageUrl", "image", "b64_json", "base64", "content"];
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

async function generateXfyunHiDreamImage(
  prompt: string,
  config: XfyunHiDreamImageProviderConfig
): Promise<GeneratedImage> {
  const createPayload = {
    prompt,
    aspect_ratio: config.aspectRatio,
    resolution: config.resolution,
    img_count: config.imageCount
  };

  const createResponse = await callXfyun(config.createUrl, config, buildXfyunRequestBody(config, createPayload));
  assertXfyunSuccess(createResponse, "创建任务");

  const createResult = decodeXfyunPayloadJson(createResponse) || createResponse;
  const taskId = findHeaderTaskId(createResponse) || findTaskId(createResult) || findTaskId(createResponse);
  if (!taskId) throw new Error("讯飞 HiDream 创建任务成功，但没有返回 task_id");

  const startedAt = Date.now();
  while (Date.now() - startedAt < config.timeoutMs) {
    await new Promise((resolve) => setTimeout(resolve, config.pollIntervalMs));

    const queryResponse = await callXfyun(config.queryUrl, config, {
      header: {
        app_id: config.appId,
        task_id: taskId
      }
    });
    assertXfyunSuccess(queryResponse, "查询任务");

    const queryResult = decodeXfyunPayloadJson(queryResponse) || queryResponse;
    const status = normalizeTaskStatus(queryResult);
    if (status === "failed") {
      throw new Error(`讯飞 HiDream 图片生成失败：${findErrorMessage(queryResult) || "任务状态失败"}`);
    }

    const imagePayload = findFirstImagePayload(queryResult);
    if (imagePayload && status === "completed") {
      if (imagePayload.kind === "url") {
        const image = await fetchImageUrl(imagePayload.value);
        return {
          ...image,
          provider: config.provider,
          model: `hidream-${config.resolution}-${config.aspectRatio}`
        };
      }

      const bytes = decodeBase64Image(imagePayload.value);
      return {
        bytes,
        mimeType: inferMimeTypeFromBytes(bytes),
        provider: config.provider,
        model: `hidream-${config.resolution}-${config.aspectRatio}`
      };
    }
  }

  throw new Error("讯飞 HiDream 图片生成超时，请稍后重试或降低分辨率");
}

export async function generateImage(prompt: string, config: ImageProviderConfig): Promise<GeneratedImage> {
  if (config.provider === "xfyun-hidream") {
    return generateXfyunHiDreamImage(prompt, config);
  }

  return generateOpenAICompatibleImage(prompt, config);
}
