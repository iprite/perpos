/**
 * คีย์เข้ารหัส session ของกล่องเมล — **แหล่งเดียวของกติกา** (spec §2.3)
 *
 * รูปแบบ: base64 ของ **32 ไบต์พอดี** · หลายคีย์คั่นด้วย `,` (ตัวแรก = คีย์ที่ใช้เข้ารหัส
 * ตัวถัดไปไว้ถอดของเก่าตอนหมุนคีย์) · ค่าที่ยาวไม่ถึง/เกิน 32 ไบต์ถูกทิ้งเงียบ ๆ
 *
 * แยกออกมาเป็นไฟล์เล็ก ๆ เพราะทั้ง `session.ts` (ใช้เข้ารหัสจริง) และ `oauth.ts`
 * (ตรวจว่า config ใช้ได้ไหมก่อนเริ่ม OAuth) ต้องใช้กติกาเดียวกัน — ถ้า import หากันตรง ๆ จะวน
 */

export function parseSessionSecrets(raw: string | undefined): Buffer[] {
  if (!raw) return [];
  return raw
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean)
    .map((s) => Buffer.from(s, "base64"))
    .filter((b) => b.length === 32);
}

/** มีคีย์ที่ใช้ได้อย่างน้อยหนึ่งอันไหม — ใช้ตัดสินว่า "ตั้งค่าระบบอีเมลแล้ว" */
export function hasUsableSessionSecret(raw: string | undefined): boolean {
  return parseSessionSecrets(raw).length > 0;
}
