export interface ParsedTask {
  title: string;
  description?: string;
  due_at?: string;       // ISO string (Bangkok offset +07:00)
  remind_at?: string;    // ISO string (UTC)
  remind_before_minutes: number;
  priority: "low" | "medium" | "high" | "urgent";
}

const SYSTEM_PROMPT = `You are a task extraction assistant for Thai and English messages.

Extract task/event information and return ONLY valid JSON with these fields:
- is_task: boolean (true if message describes a task, meeting, deadline, or reminder)
- title: string (concise task name, max 200 chars)
- description: string or null (extra context)
- due_date: string or null — one of: "today", "tomorrow", "+Nd" (N days from today), or "YYYY-MM-DD"
- due_time: string or null — "HH:MM" 24-hour format
- remind_before_minutes: number (default 15; use 60 for urgent/important, 30 for meetings)
- priority: "low" | "medium" | "high" | "urgent"

Rules:
- ถ้าข้อความไม่ใช่ task/event ให้ return {"is_task":false}
- "พรุ่งนี้" = tomorrow, "วันนี้" = today, "โมง" = o'clock
- "ด่วน" or "urgent" → priority urgent
- "สำคัญ" → priority high
- Meetings (ประชุม/นัด) → remind_before_minutes 15, priority medium by default
- Deadlines (ส่ง/submit/deadline) → remind_before_minutes 60`;

interface RawParsed {
  is_task: boolean;
  title?: string;
  description?: string | null;
  due_date?: string | null;
  due_time?: string | null;
  remind_before_minutes?: number;
  priority?: string;
}

export async function parseTaskFromText(args: {
  text: string;
  apiKey: string;
  model?: string;
  todayBangkok: string; // YYYY-MM-DD
}): Promise<ParsedTask | null> {
  const { text, apiKey, model = process.env.OPENAI_MODEL ?? "gpt-4o-mini", todayBangkok } = args;

  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model,
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user", content: `Today (Bangkok): ${todayBangkok}\n\nMessage: "${text}"` },
      ],
      temperature: 0,
      max_tokens: 300,
      response_format: { type: "json_object" },
    }),
  });

  if (!res.ok) return null;

  const data = (await res.json()) as any;
  const content = String(data?.choices?.[0]?.message?.content ?? "");

  let parsed: RawParsed;
  try {
    parsed = JSON.parse(content) as RawParsed;
  } catch {
    return null;
  }

  if (!parsed?.is_task || !parsed?.title) return null;

  const remindBefore = Math.min(120, Math.max(5, Number(parsed.remind_before_minutes) || 15));
  const dueDate = resolveDate(parsed.due_date, todayBangkok);

  let due_at: string | undefined;
  let remind_at: string | undefined;

  if (dueDate) {
    const time = parsed.due_time ?? "09:00";
    due_at = `${dueDate}T${time}:00+07:00`;
    const dueMs = new Date(due_at).getTime();
    remind_at = new Date(dueMs - remindBefore * 60 * 1000).toISOString();
  }

  const allowedPriorities = ["low", "medium", "high", "urgent"] as const;
  const priority = allowedPriorities.includes(parsed.priority as any)
    ? (parsed.priority as ParsedTask["priority"])
    : "medium";

  return {
    title: String(parsed.title).slice(0, 200),
    description: parsed.description ? String(parsed.description).slice(0, 500) : undefined,
    due_at,
    remind_at,
    remind_before_minutes: remindBefore,
    priority,
  };
}

function resolveDate(raw: string | null | undefined, today: string): string | null {
  if (!raw) return null;
  if (raw === "today") return today;
  if (raw === "tomorrow") return offsetDays(today, 1);
  const plus = raw.match(/^\+(\d+)d$/);
  if (plus) return offsetDays(today, parseInt(plus[1]));
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw;
  return null;
}

function offsetDays(dateStr: string, n: number): string {
  const d = new Date(`${dateStr}T00:00:00+07:00`);
  d.setDate(d.getDate() + n);
  return d.toISOString().slice(0, 10);
}

export function bangkokToday(): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Bangkok" }).format(new Date());
}
