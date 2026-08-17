/**
 * แคชความชอบไว้ที่เครื่อง — **ไฟล์ pure ฝั่งเบราว์เซอร์เท่านั้น**
 *
 * ค่าจริงอยู่ในกล่องเมลของผู้ใช้ (`lib/mail/prefs.ts` + `/api/mail/prefs`)
 * ที่นี่มีไว้กัน "จอวูบ" ตอน first paint เท่านั้น ⇒ ค่าจากเซิร์ฟเวอร์มาถึงเมื่อไรทับเสมอ
 *
 * แยกเป็นไฟล์ของตัวเองเพราะทั้ง `mail-workspace` (เขียน) และ `mail-shell` (ล้างตอนออกจากระบบ)
 * ต้องใช้คีย์เดียวกัน — และ shell ต้องไม่ import ตัว workspace ทั้งก้อนมาเพียงเพื่อค่าคงที่ตัวเดียว
 */

import type { MailPaneMode } from "./types";

export const MAIL_PANE_STORAGE_KEY = "perpos_mail_pane";

export function readCachedPane(): MailPaneMode | null {
  try {
    return localStorage.getItem(MAIL_PANE_STORAGE_KEY) === "list" ? "list" : null;
  } catch {
    return null;
  }
}

export function cachePane(pane: MailPaneMode): void {
  try {
    localStorage.setItem(MAIL_PANE_STORAGE_KEY, pane);
  } catch {
    /* โหมดส่วนตัว/พื้นที่เต็ม = ไม่มีแคช ยังใช้งานได้ตามปกติ */
  }
}

/**
 * ออกจากระบบต้องล้างทิ้ง — ไม่งั้นคนถัดไปที่ใช้เครื่องเดียวกันเห็นมุมมองของคนก่อนหน้า
 * ชั่วขณะก่อนค่าของตัวเองจะโหลดมาทับ
 */
export function clearCachedPane(): void {
  try {
    localStorage.removeItem(MAIL_PANE_STORAGE_KEY);
  } catch {
    /* ไม่มีอะไรให้ล้าง */
  }
}
