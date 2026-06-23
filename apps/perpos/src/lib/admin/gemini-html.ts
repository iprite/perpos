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

// ปลายทาง gemini-2.5-flash รับ input ได้สูงสุด ~1,048,576 token. base64 ของรูป (data URI) กินโทเคนมหาศาล
// ทั้งที่ LLM แก้ภาพไม่ได้ → ถอดรูปออกเป็น placeholder ก่อนส่ง แล้วเติมกลับหลังแก้ (ลดทั้ง input + output)
// guard ข้อความล้วน: ~4 ตัวอักษร ≈ 1 token → เผื่อ ~900k token (กันชน 1M + system + prompt)
const MAX_TEXT_CHARS = 3_600_000;
// จับ data URI base64 (img src / css url) — payload เป็น base64 ([A-Za-z0-9+/=]) หยุดที่ " ) ' หรือ whitespace
const DATA_URI_RE = /data:[a-zA-Z0-9.+-]+\/[a-zA-Z0-9.+-]+;base64,[A-Za-z0-9+/=]+/g;

/** ถอด data URI base64 ออกเป็น placeholder สั้น — คืน html ที่เบาลง + แผนที่ไว้เติมกลับ */
function stripDataUris(html: string): { slim: string; assets: string[] } {
  const assets: string[] = [];
  const slim = html.replace(DATA_URI_RE, (match) => {
    const token = `__PERPOS_ASSET_${assets.length}__`;
    assets.push(match);
    return token;
  });
  return { slim, assets };
}

/** เติม data URI กลับเข้า placeholder (token ปลอดภัยต่อ split/join — ไม่ใช้ regex) */
function restoreDataUris(html: string, assets: string[]): string {
  let out = html;
  for (let i = 0; i < assets.length; i++) {
    out = out.split(`__PERPOS_ASSET_${i}__`).join(assets[i]);
  }
  return out;
}

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

  // ถอดรูป base64 ออกก่อนส่ง (กันชน token limit) — เก็บไว้เติมกลับหลังแก้
  const { slim, assets } = stripDataUris(currentHtml);
  if (slim.length > MAX_TEXT_CHARS)
    return {
      ok: false,
      error:
        "เนื้อหา (ไม่รวมรูป) ใหญ่เกินกว่าจะแก้ด้วย AI ทั้งก้อนได้ — แก้บางส่วนด้วยมือ หรือสั่ง factory ผลิตใหม่",
    };

  const prompt = `นี่คือ HTML ปัจจุบัน (รูปภาพถูกแทนด้วย placeholder \`__PERPOS_ASSET_n__\` — ให้คงไว้ตรงเดิม ห้ามแก้/ลบ เว้นแต่ถูกสั่งให้เอารูปออก):

\`\`\`html
${slim}
\`\`\`

คำสั่งของผู้ดูแล: "${instruction}"

ปรับแก้ตามคำสั่ง แล้วคืน HTML ฉบับเต็มที่แก้แล้วทั้งหน้า (รักษาส่วนที่ไม่เกี่ยวข้อง + placeholder รูปไว้เหมือนเดิม).`;

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
    const slimOut = stripFences(raw).trim();

    if (!slimOut || !/<html|<!doctype/i.test(slimOut)) {
      if (cand?.finishReason === "MAX_TOKENS")
        return { ok: false, error: "เนื้อหายาวเกินขีดจำกัดของโมเดล — ลองแบ่งคำสั่งให้เล็กลง" };
      return { ok: false, error: "Gemini ไม่ได้คืน HTML ที่ใช้ได้" };
    }
    // เติมรูป base64 กลับเข้า placeholder
    return { ok: true, html: restoreDataUris(slimOut, assets) };
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
}
