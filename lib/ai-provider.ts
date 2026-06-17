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
  choices?: Array<{
    delta?: {
      content?: string;
    };
  }>;
};

const DEFAULT_OPENAI_BASE_URL = "https://api.openai.com/v1";
const DEFAULT_MODEL = "gpt-4o-mini";

export function getAiProviderConfig(): AiProviderConfig | null {
  const apiKey = process.env.AI_API_KEY || process.env.OPENAI_API_KEY;
  if (!apiKey) return null;

  return {
    apiKey,
    baseUrl: (process.env.AI_BASE_URL || process.env.OPENAI_BASE_URL || DEFAULT_OPENAI_BASE_URL).replace(/\/$/, ""),
    model: process.env.AI_MODEL || process.env.OPENAI_MODEL || DEFAULT_MODEL
  };
}

function parseDataLine(line: string): ChatCompletionChunk | null {
  if (!line.startsWith("data:")) return null;

  const payload = line.slice(5).trim();
  if (!payload || payload === "[DONE]") return null;

  try {
    return JSON.parse(payload) as ChatCompletionChunk;
  } catch {
    return null;
  }
}

export async function createAiTextStream(messages: AiChatMessage[], config: AiProviderConfig) {
  const response = await fetch(`${config.baseUrl}/chat/completions`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${config.apiKey}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      model: config.model,
      messages,
      stream: true,
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
