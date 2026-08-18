import { NextRequest, NextResponse } from "next/server";
import { requireModuleMember } from "../../../_lib/module-auth";
import { canWrite, type JustMeRole } from "../../_lib";
import { aiChat } from "@/lib/ai/client";

// อ่านบิล 1 ใบ = 3–8 วิ (บิลยาว ๆ ถึง 15 วิ) — ค่า default 10 วิ ของ Vercel ทำให้ 504 กลางทาง
export const maxDuration = 60;

/** เพดานรูปที่รับ (base64 ~1.37 เท่าของไฟล์จริง) — กันยิง payload ใหญ่เผาโควตา Gemini */
const MAX_IMAGE_BASE64 = 11_000_000; // ≈ 8 MB

type OcrItem = { name: string; unit: string; qty: number; unit_cost: number | null };
type OcrResult = {
  items: OcrItem[];
  note: string | null;
  date: string | null;
};

export async function POST(req: NextRequest) {
  const body = (await req.json().catch(() => ({}))) as Record<string, string>;
  const { orgId, imageBase64, mimeType } = body;

  if (!orgId || !imageBase64) {
    return NextResponse.json({ error: "missing orgId or imageBase64" }, { status: 400 });
  }

  if (imageBase64.length > MAX_IMAGE_BASE64) {
    return NextResponse.json(
      { error: "ไฟล์รูปใหญ่เกิน 8 MB — ย่อรูปก่อนอัปโหลด" },
      { status: 413 },
    );
  }

  const auth = await requireModuleMember(req, orgId, "just_me");
  if (!auth.ok) return auth.res;
  // อ่านบิลเข้าคลัง = ทางเดียวที่จบด้วยการรับของเข้า → ผู้ที่แก้ข้อมูลไม่ได้ก็ไม่ควรเรียก (กันเผาโควตา AI)
  if (!canWrite(auth.moduleRole as JustMeRole)) {
    return NextResponse.json({ error: "ไม่มีสิทธิ์แก้ไขข้อมูลในโมดูลนี้" }, { status: 403 });
  }

  const imgMime = mimeType ?? "image/jpeg";

  const prompt = `You are a Thai receipt/invoice OCR expert for an inventory management system.
Extract structured stock item data from this receipt/bill/delivery note image.

CRITICAL RULES — follow exactly:

1. SPELLING: Auto-correct vendor and product names distorted by receipt font or fading.
   Use standard correct Thai spelling. Preserve original product names but fix obvious OCR errors.

2. NULL POLICY: If any value cannot be read clearly — return null for that field.
   NEVER guess, fabricate, or hallucinate numbers or dates. Accuracy > completeness.

3. DATE FORMAT: Find the receipt/bill date and convert to ISO 8601 YYYY-MM-DD in Christian Era (CE).
   Thai Buddhist Era (พ.ศ.) is 543 years ahead of CE — subtract 543.
   Example: "28/05/2569" (BE) → "2026-05-28" (CE).
   If no date is visible, return null.

4. ITEMS: Extract each product/material line. Use Thai unit names:
   ชิ้น, เมตร, ม้วน, กล่อง, ลัง, แพ็ค, ถุง, กก, ลิตร, โหล, ชุด
   If unit is unclear from context, use "ชิ้น".
   Omit lines where qty is 0 or unreadable.
   DO NOT include subtotals, taxes, discounts, or service fees as items.

4b. UNIT COST: Read the per-unit price of each line (ราคา/หน่วย). If the bill shows only a
   line total (จำนวนเงิน), divide it by qty to get the per-unit price.
   Prices are BEFORE VAT when the bill lists VAT separately; if only a VAT-included total is
   shown, still report that number as-is — do NOT compute VAT yourself.
   If the per-unit price cannot be read with confidence, return null (NEVER guess).

5. NOTE: Extract the vendor/seller name as note. Return null if not visible.

Return ONLY valid JSON — no markdown fences, no explanation, nothing else:
{
  "items": [
    { "name": "ชื่อสินค้า/วัสดุ", "unit": "ชิ้น/เมตร/กล่อง/...", "qty": number, "unit_cost": number or null }
  ],
  "note": "ชื่อร้านหรือผู้ขาย or null",
  "date": "YYYY-MM-DD or null"
}`;

  // เรียกผ่าน aiChat เท่านั้น (มาตรฐานเดียวของระบบ) — ได้ thinkingBudget:0 + jsonMode +
  // การนับต้นทุนอัตโนมัติมาในตัว · **ห้ามกลับไป fetch Gemini ตรง**:
  // ของเดิมตั้ง maxOutputTokens 2000 โดยไม่ปิด thinking ⇒ บิล ~13 รายการกิน thinking token
  // จนเต็มโควตา output → JSON ขาดกลางคัน → ผู้ใช้เจอ "อ่านบิลไม่ได้" ทุกครั้ง (วัดแล้ว 3/3)
  const result = await aiChat([{ role: "user", content: prompt }], {
    provider: "gemini",
    model: "gemini-2.5-flash",
    temperature: 0,
    jsonMode: true,
    maxTokens: 8000,
    images: [{ base64: imageBase64, mimeType: imgMime }],
    usage: { orgId, profileId: auth.userId, feature: "just_me.inventory_ocr" },
  });

  if (!result) {
    return NextResponse.json(
      { error: "อ่านบิลไม่สำเร็จ (บริการ AI ไม่ตอบสนอง) — กรุณาลองใหม่หรือกรอกเอง" },
      { status: 502 },
    );
  }

  const content = result.text;
  // jsonMode คืน JSON ล้วนอยู่แล้ว — ถอด ``` เผื่อไว้เฉย ๆ (โมเดลเผลอครอบได้เป็นบางครั้ง)
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
  });
}
