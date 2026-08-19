/**
 * ชั้นประกอบเมลขาออก (M2) — **pure ทั้งไฟล์ ห้ามยิงเน็ต** เพื่อให้เทสได้ตรง ๆ
 *
 * หน้าที่: ตรวจร่างที่ผู้ใช้กรอก → ประกอบเป็น JMAP `Email` object · ประกอบร่างตอบ/ส่งต่อ
 * (หัวเรื่อง `Re:`/`Fwd:` · header อ้างอิงเธรด · ข้อความที่อ้างถึง)
 *
 * กฎที่ห้ามพัง:
 *  - **ส่งเป็น `text/plain` เท่านั้นใน M2** — ไม่มี rich text ⇒ ไม่มีทางที่ผู้ใช้จะสร้าง HTML
 *    ที่ต้อง sanitize ขาออก (ลดพื้นที่ความเสี่ยงทั้งก้อน) · ขาเข้ายัง render HTML เหมือนเดิม
 *  - `inReplyTo`/`references` ต้องมาจาก `messageId` ของฉบับที่ตอบเท่านั้น — ผิดแล้วเมลหลุดเธรด
 *    ที่ปลายทาง (ผู้รับเห็นเป็นเมลใหม่ลอย ๆ) ซึ่งไม่มีทางแก้ย้อนหลัง
 *  - ที่อยู่ผู้รับต้องผ่าน `parseRecipients` ที่เดียว — ห้าม split comma เองที่หน้าจอ
 */

import type { MailAddress } from "./types";

/** เพดานของเมลหนึ่งฉบับ **หลังเข้ารหัสส่งจริง** — Stalwart รับได้มากกว่านี้ แต่กันเผลอ */
export const MAX_MESSAGE_BYTES = 25 * 1024 * 1024;

/**
 * ไฟล์แนบถูกเข้ารหัส base64 ตอนประกอบ MIME ⇒ โตขึ้นราว 4/3
 * ต้องคิดเผื่อ ไม่งั้นผู้ใช้แนบไฟล์ 24MB (ดูเหมือนผ่าน) แล้วโดนปฏิเสธที่เซิร์ฟเวอร์ตอนกดส่ง
 */
export const ATTACHMENT_ENCODING_OVERHEAD = 4 / 3;
export const MAX_RECIPIENTS = 100;

export interface MailDraftInput {
  /** id ของร่างเดิมใน Drafts (ถ้าเคยเซฟแล้ว) */
  draftId?: string | null;
  identityId?: string | null;
  to: string[];
  cc?: string[];
  bcc?: string[];
  subject?: string;
  body?: string;
  /** blobId ที่อัปโหลดไว้แล้ว + metadata ที่ต้องใส่กลับใน Email object */
  attachments?: MailComposeAttachment[];
  /** ฉบับที่กำลังตอบ (ใช้ต่อ header เธรด) */
  inReplyTo?: string | null;
  references?: string[] | null;
}

export interface MailComposeAttachment {
  blobId: string;
  name: string;
  type: string;
  size: number;
}

export class MailComposeError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "MailComposeError";
  }
}

// ─── ที่อยู่ผู้รับ ─────────────────────────────────────────────────────────────

/** รูปแบบขั้นต่ำที่ยอมรับ — ไม่พยายามทำ RFC 5322 เต็มรูปแบบ (เกินจำเป็นและ false negative เยอะ) */
const EMAIL_RE = /^[^\s@,<>]+@[^\s@,<>]+\.[^\s@,<>]+$/;

export function isEmailAddress(value: string): boolean {
  return EMAIL_RE.test(value.trim());
}

/**
 * รับได้ทั้ง `a@b.com`, `ชื่อ <a@b.com>` และหลายอันคั่นด้วย `,` / `;` / เว้นวรรค / ขึ้นบรรทัด
 * — ผู้ใช้วางรายชื่อจาก Outlook มาทั้งก้อนได้เลย
 */
export function parseRecipients(raw: string): { valid: MailAddress[]; invalid: string[] } {
  const valid: MailAddress[] = [];
  const invalid: string[] = [];
  const chunks = raw
    .split(/[,;\n]+/)
    .map((c) => c.trim())
    .filter(Boolean);

  for (const chunk of chunks) {
    const angled = /^(.*)<([^>]+)>$/.exec(chunk);
    const name = angled ? angled[1]!.trim().replace(/^["']|["']$/g, "") : "";
    const email = (angled ? angled[2]! : chunk).trim();
    if (isEmailAddress(email)) valid.push({ name: name || null, email });
    else invalid.push(chunk);
  }
  return { valid, invalid };
}

// ─── หัวเรื่อง ────────────────────────────────────────────────────────────────

const RE_PREFIX = /^\s*(re|ตอบ)\s*:\s*/i;
const FWD_PREFIX = /^\s*(fwd?|ส่งต่อ)\s*:\s*/i;

/** ไม่ซ้อน `Re: Re: Re:` — ผู้รับที่ใช้ client อื่นจะเห็นรก */
export function replySubject(subject: string | null | undefined): string {
  const base = (subject ?? "").trim();
  if (!base) return "Re:";
  return RE_PREFIX.test(base) ? base : `Re: ${base}`;
}

export function forwardSubject(subject: string | null | undefined): string {
  const base = (subject ?? "").trim();
  if (!base) return "Fwd:";
  return FWD_PREFIX.test(base) ? base : `Fwd: ${base}`;
}

// ─── ลายเซ็น ─────────────────────────────────────────────────────────────────

/**
 * ต่อลายเซ็นเข้ากับเนื้อความตั้งต้นของกล่องเขียน
 *
 * - คั่นด้วย `-- ` (ขีดสองตัว+เว้นวรรค) ตามธรรมเนียมเมล (RFC 3676 §4.3) — ไคลเอนต์ทั่วโลก
 *   ใช้บรรทัดนี้ตัดลายเซ็นออกจากส่วนที่ยกมาอ้าง ⇒ ห้ามเปลี่ยนเป็นเส้นคั่นสวย ๆ
 * - ตอบ/ส่งต่อ: ลายเซ็นอยู่ **เหนือ** ข้อความที่อ้างถึงเสมอ (คนอ่านจากบนลงล่าง
 *   และเคอร์เซอร์ของกล่องเขียนอยู่บนสุด)
 */
export function applySignature(body: string, signature: string): string {
  const sig = signature.replace(/\r\n/g, "\n").trimEnd();
  if (!sig) return body;
  return `\n\n-- \n${sig}\n${body}`;
}

// ─── ข้อความที่อ้างถึง ────────────────────────────────────────────────────────

function addressLabel(addr: MailAddress | null | undefined): string {
  if (!addr) return "(ไม่ระบุผู้ส่ง)";
  return addr.name?.trim() ? `${addr.name} <${addr.email}>` : addr.email;
}

/** `> ` นำหน้าทุกบรรทัดตามธรรมเนียมเมล (client ทุกตัวรู้จัก และยุบให้เองได้) */
export function quoteBody(text: string | null | undefined): string {
  const body = (text ?? "").replace(/\r\n/g, "\n").trimEnd();
  if (!body) return "";
  return body
    .split("\n")
    .map((line) => (line ? `> ${line}` : ">"))
    .join("\n");
}

export function buildQuotedReply(source: {
  from: MailAddress | null;
  receivedAt: string;
  textBody: string | null;
}): string {
  const when = formatQuoteDate(source.receivedAt);
  return `\n\nเมื่อ ${when} ${addressLabel(source.from)} เขียนว่า:\n${quoteBody(source.textBody)}\n`;
}

export function buildForwardBody(source: {
  from: MailAddress | null;
  to: MailAddress[];
  subject: string;
  receivedAt: string;
  textBody: string | null;
}): string {
  const lines = [
    "",
    "",
    "---------- ข้อความที่ส่งต่อ ----------",
    `จาก: ${addressLabel(source.from)}`,
    `วันที่: ${formatQuoteDate(source.receivedAt)}`,
    `หัวเรื่อง: ${source.subject}`,
    `ถึง: ${source.to.map(addressLabel).join(", ") || "—"}`,
    "",
    (source.textBody ?? "").replace(/\r\n/g, "\n").trimEnd(),
    "",
  ];
  return lines.join("\n");
}

/** วันที่ในข้อความที่อ้างถึง — ใช้ พ.ศ. ตาม DESIGN.md §14 */
export function formatQuoteDate(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "—";
  return new Intl.DateTimeFormat("th-TH", {
    dateStyle: "long",
    timeStyle: "short",
    timeZone: "Asia/Bangkok",
  }).format(date);
}

// ─── ผู้รับของ "ตอบ" / "ตอบทั้งหมด" ───────────────────────────────────────────

function dedupeByEmail(list: MailAddress[], exclude: Set<string>): MailAddress[] {
  const seen = new Set(exclude);
  const out: MailAddress[] = [];
  for (const addr of list) {
    const key = addr.email.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(addr);
  }
  return out;
}

/**
 * `replyAll` ต้อง **ไม่ส่งกลับหาตัวเอง** และไม่ซ้ำที่อยู่เดิม
 * (เมลวนกลับหาตัวเองคือสิ่งที่ทำให้เธรดพัง และผู้ใช้จะเลิกเชื่อปุ่มนี้ทันที)
 */
export function replyRecipients(
  source: { from: MailAddress | null; to: MailAddress[]; cc: MailAddress[] },
  self: string,
  all: boolean,
): { to: MailAddress[]; cc: MailAddress[] } {
  const me = new Set([self.toLowerCase()]);
  const to = dedupeByEmail(source.from ? [source.from] : [], me);
  if (!all) return { to, cc: [] };
  const used = new Set([self.toLowerCase(), ...to.map((a) => a.email.toLowerCase())]);
  return { to, cc: dedupeByEmail([...source.to, ...source.cc], used) };
}

// ─── ประกอบ JMAP Email ────────────────────────────────────────────────────────

function toJmapAddresses(list: MailAddress[]): { name: string | null; email: string }[] {
  return list.map((a) => ({ name: a.name ?? null, email: a.email }));
}

export interface BuiltDraft {
  /** object สำหรับ `Email/set` (ยังไม่ใส่ mailboxIds/keywords — ผู้เรียกเติมตามบริบท) */
  email: Record<string, unknown>;
  bodyText: string;
}

/**
 * ตรวจร่าง + ประกอบ `Email` object · โยน `MailComposeError` พร้อมข้อความไทยเมื่อไม่ผ่าน
 * (ผู้เรียกส่งต่อให้ผู้ใช้ได้เลย — ห้ามโชว์ error ดิบของ JMAP)
 */
export function buildDraftEmail(
  input: MailDraftInput,
  from: MailAddress,
  opts: { requireRecipients?: boolean } = {},
): BuiltDraft {
  const to = normalizeList(input.to);
  const cc = normalizeList(input.cc);
  const bcc = normalizeList(input.bcc);

  if (opts.requireRecipients && to.length + cc.length + bcc.length === 0) {
    throw new MailComposeError("ยังไม่ได้ใส่ผู้รับ");
  }
  if (to.length + cc.length + bcc.length > MAX_RECIPIENTS) {
    throw new MailComposeError(`ผู้รับได้สูงสุด ${MAX_RECIPIENTS} ที่อยู่ต่อฉบับ`);
  }

  const attachments = input.attachments ?? [];
  const rawBytes = attachments.reduce((sum, a) => sum + (a.size || 0), 0);
  const totalBytes = Math.ceil(rawBytes * ATTACHMENT_ENCODING_OVERHEAD);
  if (totalBytes > MAX_MESSAGE_BYTES) {
    throw new MailComposeError("ไฟล์แนบรวมกันเกิน 25 MB");
  }

  const bodyText = (input.body ?? "").replace(/\r\n/g, "\n");
  const email: Record<string, unknown> = {
    from: [{ name: from.name ?? null, email: from.email }],
    subject: (input.subject ?? "").trim(),
    // ส่ง text/plain อย่างเดียว (ดูหัวไฟล์) — bodyValues ผูกกับ partId "b"
    bodyValues: { b: { value: bodyText } },
    textBody: [{ partId: "b", type: "text/plain" }],
  };

  /**
   * 🔴 ช่องผู้รับที่ว่าง ต้อง **ไม่ใส่คีย์เลย** ห้ามใส่ `null`
   *    Stalwart ตอบ `invalidProperties: ["cc"]` แล้วส่งไม่ออกทั้งฉบับ (เจอจากการทดสอบจริง
   *    2026-08-15 — ก่อนหน้านี้ส่ง `cc: null` ทำให้ "ส่งเมลไม่ได้เลยแม้แต่ฉบับเดียว")
   */
  if (to.length) email.to = toJmapAddresses(to);
  if (cc.length) email.cc = toJmapAddresses(cc);
  if (bcc.length) email.bcc = toJmapAddresses(bcc);

  if (input.inReplyTo) {
    email.inReplyTo = [input.inReplyTo];
    email.references = [...(input.references ?? []), input.inReplyTo];
  }

  if (attachments.length) {
    email.attachments = attachments.map((a) => ({
      blobId: a.blobId,
      name: a.name,
      type: a.type || "application/octet-stream",
      disposition: "attachment",
    }));
  }

  return { email, bodyText };
}

function normalizeList(list: string[] | undefined): MailAddress[] {
  if (!list?.length) return [];
  const { valid, invalid } = parseRecipients(list.join(","));
  if (invalid.length) {
    throw new MailComposeError(`ที่อยู่อีเมลไม่ถูกต้อง: ${invalid.slice(0, 3).join(", ")}`);
  }
  return valid;
}
