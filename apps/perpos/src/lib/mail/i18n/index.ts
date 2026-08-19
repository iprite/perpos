/**
 * ภาษาของ PERPOS Mail (th/en) — แกนกลางที่ทั้งฝั่งเซิร์ฟเวอร์และเบราว์เซอร์ใช้ร่วมกัน
 *
 * หลักการ:
 *  - ทุกข้อความมี **ทั้งสองภาษาในบรรทัดเดียวกัน** (`{ th, en }`) — เพิ่มข้อความแล้วลืมแปลไม่ได้
 *    เพราะ TypeScript บังคับรูปร่างตั้งแต่ตอนเขียนพจนานุกรม
 *  - พจนานุกรมแยกไฟล์ตามพื้นที่ (`messages/*.ts`) แล้วรวมเป็นก้อนเดียวที่นี่ ⇒ `MailMessageKey`
 *    เป็น union ของคีย์ทั้งหมด — พิมพ์คีย์ผิด tsc จับได้ ไม่หลุดเป็นข้อความว่างบนจอ
 *  - **คีย์ต้องขึ้นต้นด้วยชื่อพื้นที่** (`shell.`, `reader.` …) กันชนกันเวลารวม
 *  - ค่าที่ผู้ใช้เลือกเก็บ 3 ที่: ไฟล์ prefs ในกล่องเมล (ตัวจริง — ตามตัวไปทุกเครื่อง) ·
 *    cookie (ให้ SSR รู้ก่อน paint แรก จะได้ไม่วูบจากไทยเป็นอังกฤษ) · localStorage (แคชฝั่งเบราว์เซอร์)
 *  - ไฟล์นี้ **ห้ามมี dependency ของ React/Next** — `lib/mail/format.ts` ฯลฯ ที่เป็น pure ต้อง import ได้
 */

import type { MailMessage } from "./define";
import { account } from "./messages/account";
import { common } from "./messages/common";
import { compose } from "./messages/compose";
import { list } from "./messages/list";
import { login } from "./messages/login";
import { preview } from "./messages/preview";
import { reader } from "./messages/reader";
import { rules } from "./messages/rules";
import { shell } from "./messages/shell";
import { workspace } from "./messages/workspace";

export const MAIL_LOCALES = ["th", "en"] as const;
export type MailLocale = (typeof MAIL_LOCALES)[number];
export const MAIL_LOCALE_DEFAULT: MailLocale = "th";

/** cookie ไม่ใช่ความลับ (แค่ตัวอักษร 2 ตัว) — ตั้ง path `/` เพื่อให้ layout ของทุกหน้าอ่านได้ */
export const MAIL_LOCALE_COOKIE = "perpos_mail_locale";
export const MAIL_LOCALE_STORAGE_KEY = "perpos_mail_locale";
/** BCP-47 สำหรับ `<html lang>` และ `Intl` */
export const MAIL_LOCALE_TAGS: Record<MailLocale, string> = { th: "th-TH", en: "en-GB" };

export function isMailLocale(value: unknown): value is MailLocale {
  return typeof value === "string" && (MAIL_LOCALES as readonly string[]).includes(value);
}

/** ค่าที่อ่านมาจากไฟล์/cookie/ผู้ใช้เขียนมั่วได้ ⇒ ไม่รู้จัก = ค่าเริ่มต้นเสมอ */
export function normalizeMailLocale(raw: unknown): MailLocale {
  return isMailLocale(raw) ? raw : MAIL_LOCALE_DEFAULT;
}

export type { MailMessage } from "./define";
export { defineMailMessages } from "./define";

export const MAIL_MESSAGES = {
  ...common,
  ...shell,
  ...account,
  ...login,
  ...workspace,
  ...list,
  ...reader,
  ...compose,
  ...rules,
  ...preview,
} as const;

export type MailMessageKey = keyof typeof MAIL_MESSAGES;
export type MailMessageVars = Record<string, string | number>;

/**
 * แปลข้อความ + แทนที่ตัวแปร `{name}` — ไม่มี plural (ภาษาไทยไม่มี · อังกฤษให้เขียนสองคีย์)
 * คีย์ที่ไม่มีในพจนานุกรม (ผ่าน `as` มา) → คืนตัวคีย์เอง จะได้เห็นบนจอว่าตกหล่นตรงไหน
 */
export function translateMail(
  locale: MailLocale,
  key: MailMessageKey,
  vars?: MailMessageVars,
): string {
  const entry = (MAIL_MESSAGES as Record<string, MailMessage | undefined>)[key];
  const template = entry?.[locale] ?? entry?.th ?? key;
  if (!vars) return template;
  return template.replace(/\{(\w+)\}/g, (m, name: string) =>
    name in vars ? String(vars[name]) : m,
  );
}

export type MailTranslate = (key: MailMessageKey, vars?: MailMessageVars) => string;

/** ผูก locale ไว้ล่วงหน้า — สำหรับโค้ดนอก React (route/lib) ที่รู้ locale แล้ว */
export function mailTranslator(locale: MailLocale): MailTranslate {
  return (key, vars) => translateMail(locale, key, vars);
}
