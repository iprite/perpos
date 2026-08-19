/**
 * ป้าย/เพดานของกฎกรอง — **ไฟล์ pure ที่ใช้ได้ทั้งสองฝั่ง**
 *
 * แยกออกมาจาก `lib/mail/sieve.ts` เพราะไฟล์นั้นใช้ `Buffer` (ประกอบ/อ่านสคริปต์)
 * ⇒ import เข้าคอมโพเนนต์ฝั่ง client ไม่ได้ · ที่นี่คือแหล่งเดียวของชื่อช่อง/เงื่อนไขที่ผู้ใช้เห็น
 */

import type { MailRuleField, MailRuleOperator } from "./types";
import type { MailLocale } from "./i18n";

export const MAIL_RULE_MAX = 30;
export const MAIL_RULE_CONDITION_MAX = 5;
export const MAIL_RULE_VALUE_MAX = 200;

/**
 * เพดาน "ใช้กฎกับเมลเดิม" ต่อครั้ง — ตัวเลขนี้คือจำนวนที่ย้ายจบก่อน timeout ได้สบาย ๆ
 * อยู่ที่นี่เพราะทั้งหน้าเว็บ (บอกผู้ใช้ล่วงหน้า) และเซิร์ฟเวอร์ (บังคับจริง) ต้องใช้ค่าเดียวกัน
 * — `lib/mail/rules-apply.ts` import ตรงจากฝั่ง client ไม่ได้ (ลาก jmap/messages เข้า bundle)
 */
export const MAIL_RULE_APPLY_LIMIT = 200;

export const MAIL_RULE_FIELDS: MailRuleField[] = ["from", "to", "cc", "subject"];
export const MAIL_RULE_OPERATORS: MailRuleOperator[] = ["contains", "is", "not_contains"];

export const MAIL_RULE_FIELD_LABELS_BY_LOCALE: Record<MailLocale, Record<MailRuleField, string>> = {
  th: { from: "ผู้ส่ง", to: "ผู้รับ (ถึง)", cc: "ผู้รับ (สำเนา)", subject: "หัวเรื่อง" },
  en: { from: "Sender", to: "Recipient (To)", cc: "Recipient (Cc)", subject: "Subject" },
};

export const MAIL_RULE_OPERATOR_LABELS_BY_LOCALE: Record<
  MailLocale,
  Record<MailRuleOperator, string>
> = {
  th: { contains: "มีคำว่า", is: "ตรงกับ", not_contains: "ไม่มีคำว่า" },
  en: { contains: "contains", is: "is exactly", not_contains: "does not contain" },
};

/** ป้ายภาษาไทย (ค่าเริ่มต้น) — ฝั่ง UI ใช้ตัว `_BY_LOCALE[locale]` */
export const MAIL_RULE_FIELD_LABELS: Record<MailRuleField, string> =
  MAIL_RULE_FIELD_LABELS_BY_LOCALE.th;
export const MAIL_RULE_OPERATOR_LABELS: Record<MailRuleOperator, string> =
  MAIL_RULE_OPERATOR_LABELS_BY_LOCALE.th;
