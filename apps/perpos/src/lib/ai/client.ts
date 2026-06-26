/**
 * Unified AI Client — OpenAI + Anthropic (Claude) + Gemini
 *
 * ห้ามเรียก fetch('https://api.openai.com/...') ตรงใน code อื่น
 * ใช้ aiChat() จากที่นี่เท่านั้น เพื่อ swap provider ได้จากที่เดียว
 *
 * Gemini = ใช้ GEMINI_API_KEY ที่ระบบมีอยู่แล้ว (OCR/STT/flow-rag) — ไม่ต้องตั้ง key ใหม่
 * See docs/claude.md for usage guide.
 */

export type AiProvider = "openai" | "anthropic" | "gemini";

export interface AiMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

export interface AiCallOptions {
  /** Provider — default จาก env PERPOS_AI_PROVIDER */
  provider?: AiProvider;
  /** Model override — default จาก env OPENAI_MODEL / ANTHROPIC_MODEL / GEMINI_MODEL */
  model?: string;
  /** default: 0 */
  temperature?: number;
  /** default: 800 */
  maxTokens?: number;
  /** Force JSON output (OpenAI response_format, Claude via prompt) */
  jsonMode?: boolean;
}

export interface AiResult {
  text: string;
  inputTokens: number;
  outputTokens: number;
  model: string;
  provider: AiProvider;
  latencyMs: number;
}

/** Main entry point — call OpenAI or Anthropic based on provider setting */
export async function aiChat(
  messages: AiMessage[],
  opts: AiCallOptions = {},
): Promise<AiResult | null> {
  const provider = opts.provider ?? (process.env.PERPOS_AI_PROVIDER as AiProvider) ?? "openai";
  const temperature = opts.temperature ?? 0;
  const startTime = Date.now();

  try {
    if (provider === "anthropic") {
      return await callAnthropic(messages, opts, temperature, startTime);
    }
    if (provider === "gemini") {
      return await callGemini(messages, opts, temperature, startTime);
    }
    return await callOpenAI(messages, opts, temperature, startTime);
  } catch (e) {
    console.error(`[AI:${provider}] call failed`, String(e));
    return null;
  }
}

// ─── OpenAI ───────────────────────────────────────────────────────────────────

async function callOpenAI(
  messages: AiMessage[],
  opts: AiCallOptions,
  temperature: number,
  startTime: number,
): Promise<AiResult> {
  const model = opts.model ?? process.env.OPENAI_MODEL ?? "gpt-4o-mini";
  const key = process.env.OPENAI_API_KEY;
  if (!key) throw new Error("OPENAI_API_KEY not configured");

  const body: Record<string, unknown> = {
    model,
    messages,
    temperature,
    max_tokens: opts.maxTokens ?? 800,
  };
  if (opts.jsonMode) body.response_format = { type: "json_object" };

  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(30_000),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`OpenAI ${res.status}: ${text}`);
  }

  const data = (await res.json()) as {
    choices: { message: { content: string } }[];
    usage: { prompt_tokens: number; completion_tokens: number };
    model: string;
  };

  return {
    text: data.choices[0]?.message?.content ?? "",
    inputTokens: data.usage.prompt_tokens,
    outputTokens: data.usage.completion_tokens,
    model: data.model,
    provider: "openai",
    latencyMs: Date.now() - startTime,
  };
}

// ─── Anthropic (Claude) ───────────────────────────────────────────────────────

async function callAnthropic(
  messages: AiMessage[],
  opts: AiCallOptions,
  temperature: number,
  startTime: number,
): Promise<AiResult> {
  const model = opts.model ?? process.env.ANTHROPIC_MODEL ?? "claude-sonnet-4-5";
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) throw new Error("ANTHROPIC_API_KEY not configured");

  // Anthropic API แยก system message ออกจาก messages array
  const systemMsg = messages.find((m) => m.role === "system")?.content;
  const chatMsgs = messages
    .filter((m) => m.role !== "system")
    .map((m) => ({ role: m.role, content: m.content }));

  const body: Record<string, unknown> = {
    model,
    max_tokens: opts.maxTokens ?? 800,
    temperature,
    messages: chatMsgs,
  };
  if (systemMsg) body.system = systemMsg;

  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "x-api-key": key,
      "anthropic-version": "2023-06-01",
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(30_000),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Anthropic ${res.status}: ${text}`);
  }

  const data = (await res.json()) as {
    content: { type: string; text: string }[];
    usage: { input_tokens: number; output_tokens: number };
    model: string;
  };

  return {
    text: data.content.find((c) => c.type === "text")?.text ?? "",
    inputTokens: data.usage.input_tokens,
    outputTokens: data.usage.output_tokens,
    model: data.model,
    provider: "anthropic",
    latencyMs: Date.now() - startTime,
  };
}

// ─── Gemini ───────────────────────────────────────────────────────────────────
// ใช้ GEMINI_API_KEY ที่ระบบมีอยู่ (OCR/STT/flow-rag) · REST generateContent
// role mapping: system → systemInstruction · assistant → 'model' · user → 'user'

async function callGemini(
  messages: AiMessage[],
  opts: AiCallOptions,
  temperature: number,
  startTime: number,
): Promise<AiResult> {
  const model = opts.model ?? process.env.GEMINI_MODEL ?? "gemini-2.5-flash";
  const key = process.env.GEMINI_API_KEY;
  if (!key) throw new Error("GEMINI_API_KEY not configured");

  const systemMsg = messages.find((m) => m.role === "system")?.content;
  const contents = messages
    .filter((m) => m.role !== "system")
    .map((m) => ({
      role: m.role === "assistant" ? "model" : "user",
      parts: [{ text: m.content }],
    }));

  const generationConfig: Record<string, unknown> = {
    temperature,
    maxOutputTokens: opts.maxTokens ?? 800,
    // thinkingBudget:0 → เร็วขึ้น (เหมือน flow-rag) สำหรับงาน narration สั้น
    thinkingConfig: { thinkingBudget: 0 },
  };
  if (opts.jsonMode) generationConfig.responseMimeType = "application/json";

  const body: Record<string, unknown> = { contents, generationConfig };
  if (systemMsg) body.systemInstruction = { parts: [{ text: systemMsg }] };

  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${key}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(30_000),
    },
  );

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Gemini ${res.status}: ${text}`);
  }

  const data = (await res.json()) as {
    candidates?: { content?: { parts?: { text?: string }[] } }[];
    usageMetadata?: { promptTokenCount?: number; candidatesTokenCount?: number };
  };

  const text = (data.candidates?.[0]?.content?.parts ?? []).map((p) => p.text ?? "").join("");

  return {
    text,
    inputTokens: data.usageMetadata?.promptTokenCount ?? 0,
    outputTokens: data.usageMetadata?.candidatesTokenCount ?? 0,
    model,
    provider: "gemini",
    latencyMs: Date.now() - startTime,
  };
}
