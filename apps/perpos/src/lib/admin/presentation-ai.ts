/**
 * Presentation Desk — แก้ deck HTML ด้วย Gemini (ออนไลน์, ฝั่ง Next.js)
 *
 * deck ถูกผลิตโดย Presentation Factory (หลังบ้าน); ไฟล์นี้ใช้แค่ "แก้เล็กน้อย" จาก prompt ของ admin
 * กลไกร่วม (เรียก Gemini + validate + strip fence) อยู่ที่ `gemini-html.ts`
 */
import { editHtmlWithGemini, type GeminiHtmlResult } from "./gemini-html";

/** กฎร่วมของ deck — ยึด DESIGN.md §2 (charcoal/mono) + อิงของจริง ห้ามเกินจริง · canonical ของ factory (CONTEXT §3.1) */
const DECK_RULES = `คุณคือผู้ช่วยทำสื่อนำเสนอ HTML ของ PERPOS (ERP/บัญชี SME ไทย + ผู้ช่วย AI ผ่าน LINE).
กฎเหล็ก:
- ผลลัพธ์ต้องเป็น "ไฟล์ HTML เดียวที่สมบูรณ์ self-contained" (มี <!DOCTYPE html> ... </html>) — CSS/JS ฝังในไฟล์ทั้งหมด ห้ามอ้างไฟล์ภายนอก (ยกเว้น Google Fonts ได้)
- แบรนด์โทน mono / charcoal #3C3B3D เป็นสีหลัก (ไม่ใช้ฟ้า AQUA) · ฟอนต์ไทย Sarabun/Noto Sans Thai
- ภาษาบนสื่อ = ไทยทั้งหมด
- อิงของจริงเท่านั้น ห้ามแต่งตัวเลข/สถิติ/ฟีเจอร์ที่ไม่มีหลักฐาน — อะไรที่ยังไม่ทำให้ระบุว่าเป็น roadmap/แผน
- ตอบกลับเป็น "โค้ด HTML ดิบเท่านั้น" ห้ามมีคำอธิบาย/คำนำ/markdown fence ใด ๆ นอกตัว HTML`;

/** แก้ทั้ง deck ตาม prompt — รับ HTML ปัจจุบัน + คำสั่ง คืน HTML ใหม่ทั้งหน้า */
export function editDeckHtml(currentHtml: string, instruction: string): Promise<GeminiHtmlResult> {
  return editHtmlWithGemini(DECK_RULES, currentHtml, instruction);
}
