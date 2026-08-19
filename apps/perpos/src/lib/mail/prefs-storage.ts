/**
 * แคชความชอบไว้ที่เครื่อง — **ไฟล์ pure ฝั่งเบราว์เซอร์เท่านั้น**
 *
 * ค่าจริงอยู่ในกล่องเมลของผู้ใช้ (`lib/mail/prefs.ts` + `/api/mail/prefs`)
 * ที่นี่มีไว้กัน "จอวูบ" ตอน first paint เท่านั้น ⇒ ค่าจากเซิร์ฟเวอร์มาถึงเมื่อไรทับเสมอ
 *
 * แยกเป็นไฟล์ของตัวเองเพราะทั้ง `mail-workspace` (เขียน) และ `mail-shell` (ล้างตอนออกจากระบบ)
 * ต้องใช้คีย์เดียวกัน — และ shell ต้องไม่ import ตัว workspace ทั้งก้อนมาเพียงเพื่อค่าคงที่ตัวเดียว
 */

import type { MailPaneMode, MailSearchScope } from "./types";

/**
 * ขอบเขตความกว้างคอลัมน์รายการ (px) — อยู่ที่นี่เพราะทั้งฝั่งเบราว์เซอร์ (ตัวลาก)
 * และฝั่งเซิร์ฟเวอร์ (`prefs.ts` ตอน normalize) ต้องใช้ตัวเลขชุดเดียวกัน
 * และไฟล์นี้ไม่มี dependency ฝั่งเซิร์ฟเวอร์ให้ติดเข้า bundle ของหน้าเว็บ
 */
export const MAIL_LIST_WIDTH_MIN = 280;
export const MAIL_LIST_WIDTH_MAX = 720;
export const MAIL_LIST_WIDTH_DEFAULT = 380;

/** ค่าที่ผู้ใช้/ไคลเอนต์อื่นเขียนมั่วได้ ⇒ บีบเข้ากรอบเสมอ (ไม่ใช่ตัวเลข = ค่าเริ่มต้น) */
export function clampMailListWidth(raw: unknown): number {
  if (typeof raw !== "number" || !Number.isFinite(raw)) return MAIL_LIST_WIDTH_DEFAULT;
  return Math.round(Math.min(MAIL_LIST_WIDTH_MAX, Math.max(MAIL_LIST_WIDTH_MIN, raw)));
}

export const MAIL_SEARCH_SCOPE_STORAGE_KEY = "perpos_mail_search_scope";

/** ขอบเขตค้นหาล่าสุดที่ผู้ใช้เลือก — ความชอบของเครื่อง ไม่ต้องขึ้นเซิร์ฟเวอร์ */
export function readCachedSearchScope(): MailSearchScope | null {
  try {
    return localStorage.getItem(MAIL_SEARCH_SCOPE_STORAGE_KEY) === "box" ? "box" : null;
  } catch {
    return null;
  }
}

export function cacheSearchScope(scope: MailSearchScope): void {
  try {
    localStorage.setItem(MAIL_SEARCH_SCOPE_STORAGE_KEY, scope);
  } catch {
    /* โหมดส่วนตัว = ไม่จำ ไม่เป็นไร */
  }
}

export const MAIL_PANE_STORAGE_KEY = "perpos_mail_pane";
export const MAIL_LIST_WIDTH_STORAGE_KEY = "perpos_mail_list_width";

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

/** ความกว้างคอลัมน์รายการที่ผู้ใช้ลากไว้ล่าสุด — ค่าจริงยังอยู่ที่กล่องเมล */
export function readCachedListWidth(): number | null {
  try {
    const raw = Number(localStorage.getItem(MAIL_LIST_WIDTH_STORAGE_KEY));
    return Number.isFinite(raw) && raw > 0 ? raw : null;
  } catch {
    return null;
  }
}

export function cacheListWidth(width: number): void {
  try {
    localStorage.setItem(MAIL_LIST_WIDTH_STORAGE_KEY, String(Math.round(width)));
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
    localStorage.removeItem(MAIL_LIST_WIDTH_STORAGE_KEY);
    localStorage.removeItem(MAIL_SEARCH_SCOPE_STORAGE_KEY);
  } catch {
    /* ไม่มีอะไรให้ล้าง */
  }
}
