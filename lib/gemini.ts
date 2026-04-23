import {
  getGeminiProxyEndpoint,
  getGeminiTransport,
  requiresUserGeminiApiKey
} from "@/lib/runtimeMode";

interface GeminiGenerationConfig {
  responseMimeType?: "application/json" | "text/plain";
  responseSchema?: Record<string, unknown>;
}

interface GeminiCallParams {
  apiKey?: string;
  prompt: string;
  systemInstruction?: string;
  model?: string;
  retries?: number;
  retryBaseDelayMs?: number;
  generationConfig?: GeminiGenerationConfig;
  signal?: AbortSignal;
}

const DEFAULT_MODEL = "gemini-3.1-pro-preview";

function sleep(ms: number) {
  return new Promise((resolve) => {
    window.setTimeout(resolve, ms);
  });
}

function extractResponseText(payload: unknown): string {
  const data = payload as {
    candidates?: Array<{
      content?: {
        parts?: Array<{ text?: string }>;
      };
    }>;
  };

  const text = data.candidates?.[0]?.content?.parts?.map((part) => part.text ?? "").join("") ?? "";
  if (!text.trim()) {
    throw new Error("Gemini 返回为空，无法解析。");
  }
  return text;
}

function parseJsonText<T>(text: string): T {
  const trimmed = text.trim();
  const codeBlockMatch = trimmed.match(/```json\s*([\s\S]*?)\s*```/i);
  const normalized = codeBlockMatch ? codeBlockMatch[1].trim() : trimmed;
  return JSON.parse(normalized) as T;
}

export async function callGemini<T = unknown>({
  apiKey,
  prompt,
  systemInstruction,
  model = DEFAULT_MODEL,
  retries = 2,
  retryBaseDelayMs = 800,
  generationConfig,
  signal
}: GeminiCallParams): Promise<T> {
  const transport = getGeminiTransport();

  if (transport === "direct" && requiresUserGeminiApiKey() && !(apiKey ?? "").trim()) {
    throw new Error("缺少 Gemini API Key。");
  }

  let lastError: unknown = null;

  for (let attempt = 0; attempt <= retries; attempt += 1) {
    try {
      const text =
        transport === "proxy"
          ? await callGeminiViaProxy({
              prompt,
              systemInstruction,
              model,
              generationConfig,
              signal
            })
          : await callGeminiDirect({
              apiKey: apiKey ?? "",
              prompt,
              systemInstruction,
              model,
              generationConfig,
              signal
            });
      const isJsonMode = generationConfig?.responseMimeType === "application/json";
      return (isJsonMode ? parseJsonText<T>(text) : (text as T));
    } catch (error) {
      lastError = error;
      if (attempt >= retries) {
        break;
      }
      const waitMs = retryBaseDelayMs * 2 ** attempt;
      await sleep(waitMs);
    }
  }

  throw lastError instanceof Error ? lastError : new Error("Gemini 调用失败。");
}

async function callGeminiDirect({
  apiKey,
  prompt,
  systemInstruction,
  model,
  generationConfig,
  signal
}: Pick<
  GeminiCallParams,
  "apiKey" | "prompt" | "systemInstruction" | "model" | "generationConfig" | "signal"
>) {
  const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${model ?? DEFAULT_MODEL}:generateContent?key=${encodeURIComponent(apiKey ?? "")}`;

  const requestBody: Record<string, unknown> = {
    contents: [
      {
        role: "user",
        parts: [{ text: prompt }]
      }
    ],
    tools: []
  };

  if (systemInstruction) {
    requestBody.systemInstruction = {
      role: "system",
      parts: [{ text: systemInstruction }]
    };
  }

  if (generationConfig) {
    requestBody.generationConfig = generationConfig;
  }

  const response = await fetch(endpoint, {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify(requestBody),
    signal
  });

  if (!response.ok) {
    const raw = await response.text();
    throw new Error(`Gemini 调用失败（${response.status}）：${raw}`);
  }

  const payload = (await response.json()) as unknown;
  return extractResponseText(payload);
}

async function callGeminiViaProxy({
  prompt,
  systemInstruction,
  model,
  generationConfig,
  signal
}: Pick<GeminiCallParams, "prompt" | "systemInstruction" | "model" | "generationConfig" | "signal">) {
  const response = await fetch(getGeminiProxyEndpoint(), {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      prompt,
      systemInstruction,
      model: model ?? DEFAULT_MODEL,
      generationConfig
    }),
    signal
  });

  if (!response.ok) {
    const raw = await response.text();
    throw new Error(`Gemini 代理调用失败（${response.status}）：${raw}`);
  }

  const payload = (await response.json()) as { text?: string };
  const text = payload.text ?? "";
  if (!text.trim()) {
    throw new Error("Gemini 代理返回为空，无法解析。");
  }
  return text;
}
