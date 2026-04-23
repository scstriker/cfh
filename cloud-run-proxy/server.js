const http = require("node:http");

const PORT = Number(process.env.PORT || "8080");
const DEFAULT_MODEL = process.env.DEFAULT_MODEL || "gemini-3.1-pro-preview";
const ALLOWED_MODELS = new Set(
  String(process.env.ALLOWED_MODELS || DEFAULT_MODEL)
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean)
);
const ALLOWED_ORIGINS = new Set(
  String(process.env.ALLOW_ORIGIN || "")
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean)
);
const RATE_LIMIT_WINDOW_MS = Number(process.env.RATE_LIMIT_WINDOW_MS || "60000");
const RATE_LIMIT_MAX_REQUESTS = Number(process.env.RATE_LIMIT_MAX_REQUESTS || "20");
const REQUEST_SIZE_LIMIT_BYTES = 2 * 1024 * 1024;
const GEMINI_API_KEY = String(process.env.GEMINI_API_KEY || "").trim();
const rateBuckets = new Map();

function json(response, statusCode, payload, extraHeaders = {}) {
  response.writeHead(statusCode, {
    "Cache-Control": "no-store",
    "Content-Type": "application/json; charset=utf-8",
    ...extraHeaders
  });
  response.end(JSON.stringify(payload));
}

function text(response, statusCode, message, extraHeaders = {}) {
  response.writeHead(statusCode, {
    "Cache-Control": "no-store",
    "Content-Type": "text/plain; charset=utf-8",
    ...extraHeaders
  });
  response.end(message);
}

function getCorsHeaders(origin) {
  if (!origin || !ALLOWED_ORIGINS.has(origin)) {
    return {};
  }
  return {
    "Access-Control-Allow-Origin": origin,
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    Vary: "Origin"
  };
}

function getClientIp(request) {
  const forwarded = request.headers["x-forwarded-for"];
  if (typeof forwarded === "string" && forwarded.trim()) {
    return forwarded.split(",")[0].trim();
  }
  return request.socket.remoteAddress || "unknown";
}

function consumeRateLimit(ip) {
  const now = Date.now();
  const bucket = rateBuckets.get(ip);

  if (!bucket || now - bucket.windowStart >= RATE_LIMIT_WINDOW_MS) {
    rateBuckets.set(ip, { windowStart: now, count: 1 });
    return true;
  }

  if (bucket.count >= RATE_LIMIT_MAX_REQUESTS) {
    return false;
  }

  bucket.count += 1;
  return true;
}

function cleanupRateBuckets() {
  const now = Date.now();
  for (const [ip, bucket] of rateBuckets.entries()) {
    if (now - bucket.windowStart >= RATE_LIMIT_WINDOW_MS * 2) {
      rateBuckets.delete(ip);
    }
  }
}

function extractResponseText(payload) {
  const text =
    payload?.candidates?.[0]?.content?.parts?.map((part) => part?.text || "").join("") || "";

  if (!text.trim()) {
    throw new Error("Gemini 返回为空，无法解析。");
  }

  return text;
}

async function readJsonBody(request) {
  const chunks = [];
  let total = 0;

  for await (const chunk of request) {
    total += chunk.length;
    if (total > REQUEST_SIZE_LIMIT_BYTES) {
      throw new Error("REQUEST_TOO_LARGE");
    }
    chunks.push(chunk);
  }

  const raw = Buffer.concat(chunks).toString("utf8");
  if (!raw.trim()) {
    throw new Error("EMPTY_BODY");
  }

  return JSON.parse(raw);
}

function validatePayload(payload) {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    return "请求体必须为 JSON 对象。";
  }

  if (typeof payload.prompt !== "string" || !payload.prompt.trim()) {
    return "prompt 为必填字符串。";
  }

  if (
    payload.systemInstruction !== undefined &&
    typeof payload.systemInstruction !== "string"
  ) {
    return "systemInstruction 必须为字符串。";
  }

  if (payload.generationConfig !== undefined) {
    const generationConfig = payload.generationConfig;
    if (
      !generationConfig ||
      typeof generationConfig !== "object" ||
      Array.isArray(generationConfig)
    ) {
      return "generationConfig 必须为对象。";
    }
  }

  const model = typeof payload.model === "string" && payload.model.trim()
    ? payload.model.trim()
    : DEFAULT_MODEL;

  if (!ALLOWED_MODELS.has(model)) {
    return `model 不在白名单中：${model}`;
  }

  return null;
}

async function handleGeminiGenerate(request, response) {
  const origin = request.headers.origin;
  const corsHeaders = getCorsHeaders(origin);

  if (request.method === "OPTIONS") {
    if (!origin || !ALLOWED_ORIGINS.has(origin)) {
      text(response, 403, "Origin not allowed");
      return;
    }
    response.writeHead(204, corsHeaders);
    response.end();
    return;
  }

  if (request.method !== "POST") {
    json(response, 405, { error: "仅支持 POST 方法。" }, corsHeaders);
    return;
  }

  if (!origin || !ALLOWED_ORIGINS.has(origin)) {
    json(response, 403, { error: "Origin 不在允许列表内。" }, corsHeaders);
    return;
  }

  const contentType = request.headers["content-type"] || "";
  if (!String(contentType).startsWith("application/json")) {
    json(response, 415, { error: "仅支持 application/json。" }, corsHeaders);
    return;
  }

  if (!GEMINI_API_KEY) {
    json(response, 500, { error: "服务端未配置 GEMINI_API_KEY。" }, corsHeaders);
    return;
  }

  const clientIp = getClientIp(request);
  cleanupRateBuckets();
  if (!consumeRateLimit(clientIp)) {
    json(response, 429, { error: "请求过于频繁，请稍后重试。" }, corsHeaders);
    return;
  }

  let payload;
  try {
    payload = await readJsonBody(request);
  } catch (error) {
    if (error instanceof Error && error.message === "REQUEST_TOO_LARGE") {
      json(response, 413, { error: "请求体过大。" }, corsHeaders);
      return;
    }
    if (error instanceof Error && error.message === "EMPTY_BODY") {
      json(response, 400, { error: "请求体不能为空。" }, corsHeaders);
      return;
    }
    json(response, 400, { error: "请求体不是合法 JSON。" }, corsHeaders);
    return;
  }

  const validationError = validatePayload(payload);
  if (validationError) {
    json(response, 400, { error: validationError }, corsHeaders);
    return;
  }

  const model =
    typeof payload.model === "string" && payload.model.trim()
      ? payload.model.trim()
      : DEFAULT_MODEL;

  const requestBody = {
    contents: [
      {
        role: "user",
        parts: [{ text: payload.prompt }]
      }
    ],
    tools: []
  };

  if (payload.systemInstruction) {
    requestBody.systemInstruction = {
      role: "system",
      parts: [{ text: payload.systemInstruction }]
    };
  }

  if (payload.generationConfig) {
    requestBody.generationConfig = payload.generationConfig;
  }

  try {
    const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(
      model
    )}:generateContent?key=${encodeURIComponent(GEMINI_API_KEY)}`;

    const upstreamResponse = await fetch(endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify(requestBody)
    });

    const raw = await upstreamResponse.text();
    if (!upstreamResponse.ok) {
      json(
        response,
        502,
        {
          error: `Gemini 上游调用失败（${upstreamResponse.status}）。`,
          details: raw.slice(0, 2000)
        },
        corsHeaders
      );
      return;
    }

    const upstreamPayload = JSON.parse(raw);
    const textValue = extractResponseText(upstreamPayload);
    json(response, 200, { text: textValue }, corsHeaders);
  } catch (error) {
    json(
      response,
      500,
      {
        error: error instanceof Error ? error.message : "代理调用失败。"
      },
      corsHeaders
    );
  }
}

const server = http.createServer(async (request, response) => {
  if (!request.url) {
    text(response, 404, "Not Found");
    return;
  }

  if (request.url === "/healthz") {
    json(response, 200, { ok: true });
    return;
  }

  if (request.url === "/api/gemini/generate") {
    await handleGeminiGenerate(request, response);
    return;
  }

  text(response, 404, "Not Found");
});

server.listen(PORT, () => {
  console.log(`CFH Cloud Run proxy listening on :${PORT}`);
});

