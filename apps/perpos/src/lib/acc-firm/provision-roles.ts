/**
 * บทบาทที่ "สำนักงานบัญชี" ได้รับใน org ของลูกค้าเมื่อถูก provision
 *
 * อยู่ที่ไฟล์นี้ที่เดียวเพราะมีสองฝั่งต้องใช้ค่าเดียวกันเป๊ะ:
 *   - provision (ให้สิทธิ์)  → สร้าง module_members ด้วย role นี้
 *   - เลิกเชื่อม (ถอนสิทธิ์) → ถอน**เฉพาะ**แถวที่ role ตรงกับค่านี้
 *
 * ถ้าสองฝั่งไม่ตรงกัน การถอนจะไปโดนสิทธิ์ที่ลูกค้ามีมาแต่เดิม (เช่น เจ้าของกิจการ
 * ที่เป็นสมาชิกสำนักงานด้วย จะถูกถอน owner ของ module ตัวเอง)
 */
import { getModuleRoles } from "@/lib/modules";

// แต่ละ module มี role set ต่างกัน — accounting มี 'accountant', hrm มี 'hr'
export const FIRM_MODULE_ROLE: Record<string, string> = {
  accounting: "accountant",
  hrm: "hr",
};

/** role ที่จะ grant: map ที่กำหนด → ไม่งั้น role แรกที่ canWrite ที่ไม่ใช่ owner */
export function firmRoleFor(moduleKey: string): string {
  const mapped = FIRM_MODULE_ROLE[moduleKey];
  if (mapped) return mapped;
  const writable = getModuleRoles(moduleKey).find((r) => r.canWrite && r.key !== "owner");
  return writable?.key ?? "viewer";
}
