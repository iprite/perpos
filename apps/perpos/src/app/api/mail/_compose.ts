/**
 * อ่านร่างจาก request body — **ด่านเดียวของทั้ง `drafts` และ `send`**
 * รับเฉพาะฟิลด์ที่รู้จัก (ไม่ spread body ดิบเข้า JMAP) และตัดความยาวก่อนส่งต่อ
 */

import type { MailDraftInput } from "@/lib/mail/compose";

const MAX_SUBJECT = 998; // RFC 5322 จำกัดความยาวบรรทัด header
const MAX_BODY = 1_000_000;
const MAX_ATTACHMENTS = 20;

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
          name: String(a.name ?? "ไฟล์แนบ"),
          type: String(a.type ?? "application/octet-stream"),
          size: typeof a.size === "number" ? a.size : 0,
        }))
        .filter((a) => a.blobId)
    : [];

  return {
    draftId: typeof body.draftId === "string" ? body.draftId : null,
    identityId: typeof body.identityId === "string" ? body.identityId : null,
    to: stringList(body.to),
    cc: stringList(body.cc),
    bcc: stringList(body.bcc),
    subject: typeof body.subject === "string" ? body.subject.slice(0, MAX_SUBJECT) : "",
    body: typeof body.body === "string" ? body.body.slice(0, MAX_BODY) : "",
    attachments,
    inReplyTo: typeof body.inReplyTo === "string" ? body.inReplyTo : null,
    references: stringList(body.references),
  };
}
