import { NextRequest, NextResponse } from "next/server";
import { requireTmcMember } from "../../_lib";

type OcrItem = { name: string; unit: string; qty: number; unitCost: number };
type OcrResult = {
  items: OcrItem[];
  note: string | null;
  date: string | null; // ISO YYYY-MM-DD (CE) แปลงจาก พ.ศ. แล้ว
  expense_category: string | null;
};

export async function POST(req: NextRequest) {
  const body = (await req.json().catch(() => ({}))) as Record<string, string>;
  const { orgId, imageBase64, mimeType } = body;

  if (!orgId || !imageBase64) {
    return NextResponse.json({ error: "missing orgId or imageBase64" }, { status: 400 });
  }

  const auth = await requireTmcMember(req, orgId);
  if (!auth.ok) return auth.res;

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return NextResponse.json(
      { error: "OCR ไม่พร้อมใช้งาน (ไม่มี GEMINI_API_KEY)" },
      { status: 503 },
    );
  }

  const imgMime = mimeType ?? "image/jpeg";

  const prompt = `You are a Thai receipt OCR expert integrated into an ERP system.
Extract structured data from this receipt/bill image.

CRITICAL RULES — follow exactly:

1. SPELLING: Auto-correct vendor and product names distorted by receipt font or fading.
   Use standard correct Thai spelling (e.g. "แม็คโคร" not "แมคโคร", "เซเว่น อีเลฟเว่น" not "เซเวน อีเลฟเวน", "ปตท." not "ปท.").
   Preserve original product names but fix obvious OCR character errors.

2. NULL POLICY: If any value cannot be read clearly — return null for that field.
   NEVER guess, fabricate, or hallucinate numbers or dates. Accuracy > completeness.

3. DATE FORMAT: Find the receipt/bill date and convert to ISO 8601 YYYY-MM-DD in Christian Era (CE).
   Thai Buddhist Era (พ.ศ.) is 543 years ahead of CE — subtract 543.
   Example: "28/05/2569" (BE) → "2026-05-28" (CE).
   Example: "1 ม.ค. 2567" (BE) → "2024-01-01" (CE).
   If no date is visible, return null.

4. ITEM CALCULATION: If a line shows only total price (no unit price), calculate unitCost = total ÷ qty.
   Both qty and unitCost must be positive numbers. Omit lines where either is 0 or unreadable.

5. EXPENSE CATEGORY: Suggest one category from this exact list based on vendor name and items:
   ["แมคโค", "ค่าของใช้ทั่วไป", "ซักผ้า", "ล้างแอร์", "เงินสดย่อย", "ส่วนกลาง", "ค่าใช้จ่ายอื่นๆ"]
   Examples: แม็คโคร/แมคโคร/Makro → "แมคโค", ของใช้ทั่วไป/ซุปเปอร์มาร์เก็ต → "ค่าของใช้ทั่วไป",
   ร้านซักรีด/ซักอบรีด → "ซักผ้า", ล้างแอร์/ซ่อมแอร์ → "ล้างแอร์",
   จิปาถะเล็กน้อยจ่ายเงินสด → "เงินสดย่อย", ค่าใช้จ่ายส่วนกลางอาคาร → "ส่วนกลาง",
   อื่นๆ ที่ไม่ตรงหมวดข้างต้น → "ค่าใช้จ่ายอื่นๆ".
   If uncertain, return null.

Return ONLY valid JSON — no markdown fences, no explanation, nothing else:
{
  "items": [
    { "name": "ชื่อสินค้าภาษาไทย", "unit": "ชิ้น/แพ็ค/ขวด/กก/ลัง/โหล/ม้วน", "qty": number, "unitCost": number }
  ],
  "note": "ชื่อร้านหรือผู้ขาย or null",
  "date": "YYYY-MM-DD or null",
  "expense_category": "หมวดค่าใช้จ่าย or null"
}`;

  const ocrRes = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [
          {
            parts: [{ text: prompt }, { inline_data: { mime_type: imgMime, data: imageBase64 } }],
          },
        ],
        generationConfig: { maxOutputTokens: 2000, temperature: 0 },
      }),
    },
  );

  if (!ocrRes.ok) {
    const err = await ocrRes.text();
    return NextResponse.json({ error: `Gemini error: ${err.slice(0, 200)}` }, { status: 502 });
  }

  const ocrJson = (await ocrRes.json()) as {
    candidates: { content: { parts: { text: string }[] } }[];
  };
  const content = ocrJson.candidates?.[0]?.content?.parts?.[0]?.text ?? "";

  // Strip markdown code fences if Gemini adds them despite instructions
  const cleaned = content
    .replace(/^```[a-z]*\n?/i, "")
    .replace(/\n?```$/i, "")
    .trim();

  let parsed: OcrResult;
  try {
    parsed = JSON.parse(cleaned) as OcrResult;
  } catch {
    return NextResponse.json(
      { error: "ไม่สามารถอ่านบิลได้ กรุณาลองใหม่หรือกรอกเอง", raw: content },
      { status: 422 },
    );
  }

  return NextResponse.json({
    items: parsed.items ?? [],
    note: parsed.note ?? null,
    date: parsed.date ?? null,
    expense_category: parsed.expense_category ?? null,
  });
}
