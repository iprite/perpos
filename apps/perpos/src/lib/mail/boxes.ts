/**
 * กล่องเมล — ลำดับ + ป้ายภาษาไทย (contract §4.4 · ห้ามตั้งชื่ออื่น)
 *
 * **แหล่งเดียวของทั้งแอป** — ทั้งฝั่งเซิร์ฟเวอร์ (`lib/mail/messages.ts` ตอนแมป JMAP mailbox
 * เป็นกล่องของเรา) และฝั่งหน้าจอ (rail ของ PERPOS Mail + หัวรายการของ `<MailWorkspace>`)
 * ต้อง import จากไฟล์นี้เท่านั้น ไม่งั้นชื่อกล่องหลุด sync กัน
 *
 * ไฟล์นี้ pure (ไม่แตะ env/network) จึงใช้ได้ทั้ง server component และ client component
 */

import type { MailBoxKey } from "./types";

/** ลำดับที่แสดงใน rail — และเป็นชุดคีย์ที่ถูกต้องทั้งหมด */
export const MAIL_BOX_ORDER = [
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

/** ชื่อผลิตภัณฑ์ (แยกขาดจาก Suite/Flow — ดู docs/MAIL_WEBMAIL_HANDOFF.md) */
export const MAIL_PRODUCT_NAME = "PERPOS Mail";

export function isMailBoxKey(value: string | undefined | null): value is MailBoxKey {
  return !!value && (MAIL_BOX_ORDER as readonly string[]).includes(value);
}

export function resolveMailBox(value: string | undefined | null): MailBoxKey {
  return isMailBoxKey(value) ? value : "inbox";
}
