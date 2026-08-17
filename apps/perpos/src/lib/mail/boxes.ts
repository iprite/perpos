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

// ─── ตัวเลือกกล่อง (M3 — โฟลเดอร์ที่ผู้ใช้สร้างเอง) ────────────────────────────

/**
 * ค่า `?box=` มีสองแบบ: คีย์ระบบ (`inbox`…) กับโฟลเดอร์เอง (`f:<mailboxId>`)
 * — คำนำหน้ากันชนกับคีย์ระบบ และทำให้ตรวจได้ตั้งแต่ชั้น parse ว่าเป็นชนิดไหน
 */
export const MAIL_FOLDER_PREFIX = "f:";

/**
 * เพดานของโฟลเดอร์ที่ผู้ใช้สร้างเอง — อยู่ในไฟล์ pure นี้เพราะ**ทั้งหน้าเว็บและ API ใช้ร่วมกัน**
 * (`lib/mail/folders.ts` แตะ JMAP จึงเอาไป import ในคอมโพเนนต์ฝั่ง client ไม่ได้)
 */
export const MAIL_FOLDER_NAME_MAX = 60;
export const MAIL_FOLDER_DEPTH_MAX = 3;
export const MAIL_FOLDER_MAX = 100;

/** ตัวคั่นของ path — ต้องตรงกับที่เมลเซิร์ฟเวอร์ใช้ ไม่งั้น `fileinto` ของกฎกรองไม่เข้าโฟลเดอร์ */
export const MAIL_FOLDER_PATH_SEPARATOR = "/";

export type MailBoxSelector =
  { kind: "system"; key: MailBoxKey } | { kind: "folder"; mailboxId: string };

export function folderBoxValue(mailboxId: string): string {
  return `${MAIL_FOLDER_PREFIX}${mailboxId}`;
}

/** id ของ mailbox ที่เซิร์ฟเวอร์ออกให้ — ยอมเฉพาะอักขระปลอดภัย (กันเอาไปต่อ URL/สคริปต์) */
export function isMailboxId(value: string): boolean {
  return /^[A-Za-z0-9_-]{1,128}$/.test(value);
}

/** ค่าที่อ่านไม่ออก/ผิดรูปแบบ → ตกกลับไป `inbox` เสมอ (ห้ามโยน — มาจาก URL ของผู้ใช้) */
export function resolveBoxSelector(value: string | undefined | null): MailBoxSelector {
  const raw = (value ?? "").trim();
  if (raw.startsWith(MAIL_FOLDER_PREFIX)) {
    const id = raw.slice(MAIL_FOLDER_PREFIX.length);
    if (isMailboxId(id)) return { kind: "folder", mailboxId: id };
    return { kind: "system", key: "inbox" };
  }
  return { kind: "system", key: resolveMailBox(raw) };
}
