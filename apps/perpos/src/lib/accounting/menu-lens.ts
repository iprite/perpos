/**
 * menu-lens.ts — เมนู sidebar ของ accounting ต้องสะท้อน role matrix §4
 *
 * แยกออกมาเป็น logic บริสุทธิ์ (ไม่มี JSX) เพื่อ unit test ได้ — ตัว menu-items.tsx
 * เป็น .tsx ที่ vitest parse ไม่ได้
 *
 * matrix ฝั่งหลังบ้าน (journal/accounts/tax/assets/purchase-documents):
 *   owner = ดูได้ · accountant = เขียนได้ · viewer = ดูได้ · **staff = ไม่มีสิทธิ์เลย**
 * staff จึงไม่ควรเห็นเมนูกลุ่มนี้ (กดแล้วเจอ NoAccess ทุกอัน = noise + เข้าใจผิดว่ามีสิทธิ์)
 * สิทธิ์จริงยังบังคับที่ page guard + API เหมือนเดิม — นี่คุมแค่ "เห็นอะไร"
 */

/** ควรโชว์กลุ่ม "หลังบ้าน (นักบัญชี)" ใน sidebar ไหม */
export function showAccountingBackstage(
  moduleRole: string | null | undefined,
  isSuperAdmin = false,
): boolean {
  if (isSuperAdmin) return true; // super_admin ข้ามทุกด่านตาม AGENTS.md
  if (!moduleRole) return true; // ยังไม่รู้ role (context ยังไม่มา) → อย่าเพิ่งซ่อน กันเมนูวูบ
  return moduleRole !== "staff";
}
