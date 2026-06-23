/**
 * Product Documents — แก้เอกสาร HTML ด้วย Gemini (ออนไลน์, ฝั่ง Next.js)
 *
 * เอกสารถูกผลิตโดย Documentation Factory (หลังบ้าน) เป็น HTML self-contained ที่ออกแบบมาให้
 * พิมพ์/export เป็น PDF ได้สวย; ไฟล์นี้ใช้แค่ "แก้เล็กน้อย" จาก prompt ของ admin
 * กลไกร่วม (เรียก Gemini + validate + strip fence) อยู่ที่ `gemini-html.ts`
 */
import { editHtmlWithGemini, type GeminiHtmlResult } from "./gemini-html";

/**
 * กฎร่วมของเอกสารผลิตภัณฑ์ — ต่างจาก deck: เป็น "เอกสารหน้ากระดาษ" (A4, มีหัวข้อ/สารบัญ) ไม่ใช่สไลด์
 * canonical ของ Documentation Factory (อ้างจาก docs-factory CONTEXT). ถ้าแก้ที่นี่ ให้ sync ฝั่ง factory.
 */
const DOC_RULES = `คุณคือผู้ช่วยทำเอกสาร/คู่มือผู้ใช้ HTML ของ PERPOS (ERP/บัญชี SME ไทย + ผู้ช่วย AI ผ่าน LINE).
กฎเหล็ก:
- ผลลัพธ์ต้องเป็น "ไฟล์ HTML เดียวที่สมบูรณ์ self-contained" (มี <!DOCTYPE html> ... </html>) — CSS/JS ฝังในไฟล์ทั้งหมด ห้ามอ้างไฟล์ภายนอก (ยกเว้น Google Fonts ได้); รูปต้องเป็น data URI
- เป็น "เอกสารหน้ากระดาษ" ออกแบบให้ export PDF สวย: ใส่ CSS \`@page { size: A4; margin: ... }\`, ขนาดตัวอักษรเหมาะอ่าน/พิมพ์, หลีกเลี่ยงตัด heading กลางหน้า (\`break-inside: avoid\`), มีสารบัญ/หัวข้อลำดับชั้นชัดถ้าเอกสารยาว
- แบรนด์โทน mono / charcoal #3C3B3D เป็นสีหลัก (ไม่ใช้ฟ้า AQUA) · ฟอนต์ไทย Sarabun/Noto Sans Thai
- ภาษาในเอกสาร = ไทยทั้งหมด, task-oriented (ภาษาผู้ใช้ปลายทาง ไม่ใช่ศัพท์ dev)
- อิงของจริงเท่านั้น — สอนเฉพาะสิ่งที่ใช้งานได้จริง ห้ามแต่งขั้นตอน/ฟีเจอร์ที่ไม่มี
- ตอบกลับเป็น "โค้ด HTML ดิบเท่านั้น" ห้ามมีคำอธิบาย/คำนำ/markdown fence ใด ๆ นอกตัว HTML`;

/** แก้ทั้งเอกสารตาม prompt — รับ HTML ปัจจุบัน + คำสั่ง คืน HTML ใหม่ทั้งหน้า */
export function editDocumentHtml(
  currentHtml: string,
  instruction: string,
): Promise<GeminiHtmlResult> {
  return editHtmlWithGemini(DOC_RULES, currentHtml, instruction);
}
