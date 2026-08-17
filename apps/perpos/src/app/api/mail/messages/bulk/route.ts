/** ทำหลายฉบับพร้อมกัน (≤200) → คืน undo token ที่เก็บสถานะเดิมรายฉบับ (spec §5) */

import { type NextRequest } from "next/server";

import { mailError, mailJson, readJsonBody, withMailSession } from "../../_lib";
import { applyMailBulk } from "@/lib/mail/messages";
import { isMailboxId } from "@/lib/mail/boxes";
import type { MailBulkAction, MailScope } from "@/lib/mail/types";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const ACTIONS: MailBulkAction[] = ["read", "unread", "star", "unstar", "archive", "trash", "move"];
const MAIL_BULK_LIMIT = 200;

export async function POST(req: NextRequest) {
  const body = await readJsonBody(req);
  const ids = Array.isArray(body.ids)
    ? body.ids.filter((v): v is string => typeof v === "string")
    : [];
  const action = body.action as MailBulkAction;
  const by: MailScope = body.by === "thread" ? "thread" : "email";

  if (ids.length === 0) return mailError("mail_bad_request", "ยังไม่ได้เลือกอีเมล", 400);
  if (ids.length > MAIL_BULK_LIMIT) {
    return mailError("mail_bad_request", `เลือกได้สูงสุด ${MAIL_BULK_LIMIT} ฉบับต่อครั้ง`, 400);
  }
  if (!ACTIONS.includes(action)) {
    return mailError("mail_bad_request", "ไม่รู้จักคำสั่งนี้", 400);
  }

  const mailboxId = typeof body.mailboxId === "string" ? body.mailboxId : "";
  if (action === "move" && !isMailboxId(mailboxId)) {
    return mailError("mail_bad_request", "ยังไม่ได้เลือกโฟลเดอร์ปลายทาง", 400);
  }

  return withMailSession(req, async (session) => {
    const result = await applyMailBulk(session, { ids, action, by, mailboxId });
    return mailJson({ ok: true, affected: result.affected, undo: result.undo });
  });
}
