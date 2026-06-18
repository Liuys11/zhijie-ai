export type ImageProviderConfig = {
  provider: string;
  apiKey: string;
  baseUrl: string;
  model: string;
  size: string;
};

export type GeneratedImage = {
  bytes: Uint8Array;
  mimeType: "image/png" | "image/jpeg" | "image/webp";
  provider: string;
  model: string;
};

const DEFAULT_IMAGE_BASE_URL = "https://api.openai.com/v1";
const DEFAULT_IMAGE_MODEL = "gpt-image-1";
const DEFAULT_IMAGE_SIZE = "1024x1024";

export function getImageProviderConfig(): ImageProviderConfig | null {
  const apiKey = process.env.IMAGE_API_KEY || process.env.OPENAI_API_KEY;
  if (!apiKey) return null;

  return {
    provider: process.env.IMAGE_PROVIDER || "openai-compatible",
    apiKey,
    baseUrl: (process.env.IMAGE_BASE_URL || process.env.OPENAI_BASE_URL || DEFAULT_IMAGE_BASE_URL).replace(/\/$/, ""),
    model: process.env.IMAGE_MODEL || DEFAULT_IMAGE_MODEL,
    size: process.env.IMAGE_SIZE || DEFAULT_IMAGE_SIZE
  };
}

function getImagesUrl(baseUrl: string) {
  return baseUrl.endsWith("/images/generations") ? baseUrl : `${baseUrl}/images/generations`;
}

function decodeBase64Image(value: string) {
  return Uint8Array.from(Buffer.from(value, "base64"));
}

function inferMimeTypeFromUrl(url: string): "image/png" | "image/jpeg" | "image/webp" {
  const lowerUrl = url.toLowerCase();
  if (lowerUrl.includes(".jpg") || lowerUrl.includes(".jpeg")) return "image/jpeg";
  if (lowerUrl.includes(".webp")) return "image/webp";
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

export async function generateImage(prompt: string, config: ImageProviderConfig): Promise<GeneratedImage> {
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
