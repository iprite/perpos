/**
 * ป้ายภาษาไทยของกล่องเมล — ล็อกตาม contract §4.4 (ห้ามตั้งชื่ออื่น)
 * ใช้ร่วมกัน 2 ที่: เมนู sidebar (`buildMailMenuItems`) และหัวรายการของ `<MailWorkspace>`
 * เพื่อไม่ให้ชื่อกล่องหลุด sync กัน
 */

import type { MailBoxKey } from "@/lib/mail/types";

export const MAIL_BOX_KEYS = [
  "inbox",
  "starred",
  "sent",
  "drafts",
  "archive",
  "junk",
  "trash",
] as const satisfies readonly MailBoxKey[];

export const MAIL_BOX_LABELS: Record<MailBoxKey, string> = {
  inbox: "กล่องขาเข้า",
  starred: "ดาว",
  sent: "ส่งแล้ว",
  drafts: "ร่าง",
  archive: "คลังเก็บ",
  junk: "จดหมายขยะ",
  trash: "ถังขยะ",
};

/** ชื่อร่มของโมดูล (contract §4.4) */
export const MAIL_MODULE_LABEL = "อีเมล";

export function isMailBoxKey(value: string | undefined | null): value is MailBoxKey {
  return !!value && (MAIL_BOX_KEYS as readonly string[]).includes(value);
}

export function resolveMailBox(value: string | undefined | null): MailBoxKey {
  return isMailBoxKey(value) ? value : "inbox";
}
