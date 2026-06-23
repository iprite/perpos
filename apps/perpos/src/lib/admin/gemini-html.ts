/**
 * Gemini HTML editor — helper ร่วมสำหรับ "แก้ทั้งหน้า HTML จาก prompt" (ฝั่ง Next.js)
 *
 * ใช้โดย Presentation Desk (deck) + Product Documents (เอกสาร) — ทั้งคู่เก็บ HTML self-contained
 * แล้วให้ admin แก้เล็กน้อยด้วยภาษาธรรมชาติ. เรียก Gemini REST ตรง (pattern เดียวกับ flow-rag.ts).
 *
 * ⚠️ GEMINI_API_KEY ต้องเป็น paid tier (ดู AGENTS.md) — flash free tier มัก 503
 */

const GEMINI_BASE = "https://generativelanguage.googleapis.com/v1beta/models";
const MODEL = "gemini-2.5-flash";

export type GeminiHtmlResult = { ok: true; html: string } | { ok: false; error: string };

/** ตัด markdown code fence (```html ... ```) ถ้าโมเดลใส่มา */
function stripFences(text: string): string {
  const m = text.match(/```(?:html)?\s*([\s\S]*?)```/i);
  return m ? m[1] : text;
}

/**
 * แก้ทั้งหน้า HTML ตาม prompt — รับ system rules (โทน/contract ของชนิดงาน) + HTML ปัจจุบัน + คำสั่ง
 * คืน HTML ฉบับเต็มที่แก้แล้ว (validate ว่ามี <html>/<!doctype>)
 */
export async function editHtmlWithGemini(
  rules: string,
  currentHtml: string,
  instruction: string,
  maxOutputTokens = 32768,
): Promise<GeminiHtmlResult> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) return { ok: false, error: "ยังไม่ได้ตั้งค่า GEMINI_API_KEY" };

  const prompt = `นี่คือ HTML ปัจจุบัน:

\`\`\`html
${currentHtml}
\`\`\`

คำสั่งของผู้ดูแล: "${instruction}"

ปรับแก้ตามคำสั่ง แล้วคืน HTML ฉบับเต็มที่แก้แล้วทั้งหน้า (รักษาส่วนที่ไม่เกี่ยวข้องไว้เหมือนเดิม).`;

  try {
    const res = await fetch(`${GEMINI_BASE}/${MODEL}:generateContent?key=${apiKey}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: rules }] },
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: { temperature: 0.4, maxOutputTokens },
      }),
    });

    if (!res.ok) {
      const body = (await res.text()).slice(0, 300);
      return { ok: false, error: `Gemini ${res.status}: ${body}` };
    }

    const json = (await res.json()) as {
      candidates?: { content?: { parts?: { text?: string }[] }; finishReason?: string }[];
    };
    const cand = json.candidates?.[0];
    const raw = cand?.content?.parts?.map((p) => p.text ?? "").join("") ?? "";
    const html = stripFences(raw).trim();

    if (!html || !/<html|<!doctype/i.test(html)) {
      if (cand?.finishReason === "MAX_TOKENS")
        return { ok: false, error: "เนื้อหายาวเกินขีดจำกัดของโมเดล — ลองแบ่งคำสั่งให้เล็กลง" };
      return { ok: false, error: "Gemini ไม่ได้คืน HTML ที่ใช้ได้" };
    }
    return { ok: true, html };
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
}
