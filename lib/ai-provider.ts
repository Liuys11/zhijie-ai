export type AiChatMessage = {
  role: "system" | "user" | "assistant";
  content: string;
};

export type AiProviderConfig = {
  apiKey: string;
  baseUrl: string;
  model: string;
};

type ChatCompletionChunk = {
  code?: number;
  message?: string;
  choices?: Array<{
    delta?: {
      content?: string;
      reasoning_content?: string;
    };
  }>;
};

const DEFAULT_OPENAI_BASE_URL = "https://api.openai.com/v1";
const DEFAULT_MODEL = "gpt-4o-mini";

export function getAiProviderConfig(): AiProviderConfig | null {
  const apiKey = process.env.AI_API_KEY || process.env.OPENAI_API_KEY;
  if (!apiKey) return null;

  const baseUrl = (process.env.AI_BASE_URL || process.env.OPENAI_BASE_URL || DEFAULT_OPENAI_BASE_URL).replace(/\/$/, "");
  const configuredModel = process.env.AI_MODEL || process.env.OPENAI_MODEL || DEFAULT_MODEL;

  return {
    apiKey,
    baseUrl,
    model: normalizeModelName(baseUrl, configuredModel)
  };
}

function normalizeModelName(baseUrl: string, model: string) {
  if (!baseUrl.includes("xf-yun.com")) return model;

  if (/spark[-_ ]?x|x1\.?5|x2|flash/i.test(model)) {
    return "spark-x";
  }

  return model;
}

function getChatCompletionsUrl(baseUrl: string) {
  return baseUrl.endsWith("/chat/completions") ? baseUrl : `${baseUrl}/chat/completions`;
}

function normalizeMessages(messages: AiChatMessage[], config: AiProviderConfig): AiChatMessage[] {
  if (!config.baseUrl.includes("xf-yun.com")) return messages;

  const systemText = messages
    .filter((message) => message.role === "system")
    .map((message) => message.content)
    .join("\n\n");
  const nonSystemMessages = messages.filter((message) => message.role !== "system");

  if (!systemText) return nonSystemMessages;

  const firstUserIndex = nonSystemMessages.findIndex((message) => message.role === "user");
  if (firstUserIndex === -1) {
    return [{ role: "user", content: `${systemText}\n\n请开始。` }];
  }

  return nonSystemMessages.map((message, index) =>
    index === firstUserIndex
      ? {
          ...message,
          content: `${systemText}\n\n用户问题：${message.content}`
        }
      : message
  );
}

function parseDataLine(line: string): ChatCompletionChunk | null {
  const payload = line.startsWith("data:") ? line.slice(5).trim() : line.trim();

  if (!payload || payload === "[DONE]") return null;

  try {
    return JSON.parse(payload) as ChatCompletionChunk;
  } catch {
    return null;
  }
}

export async function createAiTextStream(messages: AiChatMessage[], config: AiProviderConfig) {
  const normalizedMessages = normalizeMessages(messages, config);

  const response = await fetch(getChatCompletionsUrl(config.baseUrl), {
    method: "POST",
    headers: {
      Authorization: `Bearer ${config.apiKey}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      model: config.model,
      messages: normalizedMessages,
      stream: true,
      user: "zhijie-ai-demo",
      temperature: 0.4
    })
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(errorText || `AI provider request failed with ${response.status}`);
  }

  if (!response.body) {
    throw new Error("AI provider did not return a stream");
  }

  const decoder = new TextDecoder();
  const encoder = new TextEncoder();
  let buffer = "";

  return new ReadableStream<Uint8Array>({
    async start(controller) {
      const reader = response.body?.getReader();
      if (!reader) {
        controller.close();
        return;
      }

      try {
        while (true) {
          const { value, done } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split(/\r?\n/);
          buffer = lines.pop() || "";

          for (const line of lines) {
            const chunk = parseDataLine(line);
            if (chunk?.code && chunk.code !== 0) {
              throw new Error(chunk.message || `AI provider error ${chunk.code}`);
            }
            const content = chunk?.choices?.[0]?.delta?.content;
            if (content) controller.enqueue(encoder.encode(content));
          }
        }

        controller.close();
      } catch (error) {
        controller.error(error);
      }
    }
  });
}
