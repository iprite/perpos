/**
 * Presentation Desk — แก้ deck HTML ด้วย Gemini (ออนไลน์, ฝั่ง Next.js)
 *
 * deck ถูกผลิตโดย Presentation Factory (หลังบ้าน); ไฟล์นี้ใช้แค่ "แก้เล็กน้อย" จาก prompt ของ admin
 *
 * reuse pattern เดียวกับ flow-rag.ts: เรียก Gemini REST ตรง ๆ ด้วย GEMINI_API_KEY
 * (ไม่ใช้ SDK). งานนี้ output ใหญ่ (HTML ทั้งหน้า) → ใช้ gemini-2.5-flash + maxOutputTokens สูง
 *
 * ⚠️ GEMINI_API_KEY ต้องเป็น paid tier (ดู AGENTS.md) — flash free tier มัก 503
 */

const GEMINI_BASE = "https://generativelanguage.googleapis.com/v1beta/models";
const MODEL = "gemini-2.5-flash";

/** กฎร่วมของ deck — ยึด DESIGN.md §2 (charcoal/mono) + อิงของจริง ห้ามเกินจริง */
const DECK_RULES = `คุณคือผู้ช่วยทำสื่อนำเสนอ HTML ของ PERPOS (ERP/บัญชี SME ไทย + ผู้ช่วย AI ผ่าน LINE).
กฎเหล็ก:
- ผลลัพธ์ต้องเป็น "ไฟล์ HTML เดียวที่สมบูรณ์ self-contained" (มี <!DOCTYPE html> ... </html>) — CSS/JS ฝังในไฟล์ทั้งหมด ห้ามอ้างไฟล์ภายนอก (ยกเว้น Google Fonts ได้)
- แบรนด์โทน mono / charcoal #3C3B3D เป็นสีหลัก (ไม่ใช้ฟ้า AQUA) · ฟอนต์ไทย Sarabun/Noto Sans Thai
- ภาษาบนสื่อ = ไทยทั้งหมด
- อิงของจริงเท่านั้น ห้ามแต่งตัวเลข/สถิติ/ฟีเจอร์ที่ไม่มีหลักฐาน — อะไรที่ยังไม่ทำให้ระบุว่าเป็น roadmap/แผน
- ตอบกลับเป็น "โค้ด HTML ดิบเท่านั้น" ห้ามมีคำอธิบาย/คำนำ/markdown fence ใด ๆ นอกตัว HTML`;

type GeminiResult = { ok: true; html: string } | { ok: false; error: string };

async function generateHtml(prompt: string, maxOutputTokens = 32768): Promise<GeminiResult> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) return { ok: false, error: "ยังไม่ได้ตั้งค่า GEMINI_API_KEY" };

  try {
    const res = await fetch(`${GEMINI_BASE}/${MODEL}:generateContent?key=${apiKey}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: DECK_RULES }] },
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: {
          temperature: 0.4,
          maxOutputTokens,
          // ปล่อย thinking budget default — งานสร้าง HTML ได้ประโยชน์จาก reasoning
        },
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
        return { ok: false, error: "deck ยาวเกินขีดจำกัดของโมเดล — ลองแบ่งคำสั่งให้เล็กลง" };
      return { ok: false, error: "Gemini ไม่ได้คืน HTML ที่ใช้ได้" };
    }
    return { ok: true, html };
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
}

/** ตัด markdown code fence (```html ... ```) ถ้าโมเดลใส่มา */
function stripFences(text: string): string {
  const m = text.match(/```(?:html)?\s*([\s\S]*?)```/i);
  return m ? m[1] : text;
}

/** แก้ทั้ง deck ตาม prompt — รับ HTML ปัจจุบัน + คำสั่ง คืน HTML ใหม่ทั้งหน้า */
export function editDeckHtml(currentHtml: string, instruction: string): Promise<GeminiResult> {
  const prompt = `นี่คือ HTML ของสื่อนำเสนอปัจจุบัน:

\`\`\`html
${currentHtml}
\`\`\`

คำสั่งของผู้ดูแล: "${instruction}"

ปรับแก้ตามคำสั่ง แล้วคืน HTML ฉบับเต็มที่แก้แล้วทั้งหน้า (รักษาส่วนที่ไม่เกี่ยวข้องไว้เหมือนเดิม).`;
  return generateHtml(prompt);
}
