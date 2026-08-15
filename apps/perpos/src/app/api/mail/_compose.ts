/**
 * อ่านร่างจาก request body — **ด่านเดียวของทั้ง `drafts` และ `send`**
 * รับเฉพาะฟิลด์ที่รู้จัก (ไม่ spread body ดิบเข้า JMAP) และตัดความยาวก่อนส่งต่อ
 */

import { isValidBlobId, sanitizeAttachmentName } from "@/lib/mail/jmap";
import type { MailDraftInput } from "@/lib/mail/compose";

const MAX_SUBJECT = 998; // RFC 5322 จำกัดความยาวบรรทัด header
const MAX_BODY = 1_000_000;
const MAX_ATTACHMENTS = 20;

/**
 * ค่าที่จะไปกลายเป็น **header** ต้องไม่มีอักขระควบคุม — CR/LF คือช่องแทรก header เพิ่ม
 * (`Bcc:` / `From:` ที่จะล้มด่าน identity ทั้งดุ้น) · เราไม่พึ่งการ encode ของ Stalwart อย่างเดียว
 * ฝั่งอ่านมี `sanitizeAttachmentName` ด้วยเหตุผลเดียวกัน ฝั่งเขียนก็ต้องมี
 */
function headerSafe(value: string): string {
  // eslint-disable-next-line no-control-regex
  return value.replace(/[\u0000-\u001F\u007F]/g, " ").trim();
}

/** Message-ID ตาม RFC 5322 — รับเฉพาะ `<...>` ที่ไม่มีช่องว่าง ที่เหลือทิ้งเงียบ */
const MESSAGE_ID_RE = /^<[^\s<>]{1,200}>$/;

function messageIds(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter((v): v is string => typeof v === "string")
    .map((v) => v.trim())
    .filter((v) => MESSAGE_ID_RE.test(v))
    .slice(0, 50);
}

function stringList(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((v): v is string => typeof v === "string").slice(0, 200);
}

export function readDraftInput(body: Record<string, unknown>): MailDraftInput {
  const attachments = Array.isArray(body.attachments)
    ? body.attachments
        .filter((a): a is Record<string, unknown> => !!a && typeof a === "object")
        .slice(0, MAX_ATTACHMENTS)
        .map((a) => ({
          blobId: String(a.blobId ?? ""),
          name: sanitizeAttachmentName(String(a.name ?? "")),
          type: headerSafe(String(a.type ?? "application/octet-stream")).slice(0, 120),
          size: typeof a.size === "number" ? a.size : 0,
        }))
        // blobId ที่ไม่ผ่านรูปแบบ = ของปลอม/เดามา ทิ้งไปเลย (ด่านเดียวกับตอนดาวน์โหลด)
        .filter((a) => isValidBlobId(a.blobId))
    : [];

  return {
    draftId: typeof body.draftId === "string" ? body.draftId : null,
    identityId: typeof body.identityId === "string" ? body.identityId : null,
    to: stringList(body.to),
    cc: stringList(body.cc),
    bcc: stringList(body.bcc),
    subject: typeof body.subject === "string" ? headerSafe(body.subject).slice(0, MAX_SUBJECT) : "",
    body: typeof body.body === "string" ? body.body.slice(0, MAX_BODY) : "",
    attachments,
    inReplyTo: messageIds([body.inReplyTo])[0] ?? null,
    references: messageIds(body.references),
  };
}
