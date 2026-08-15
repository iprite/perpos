/**
 * ส่งเมล (M2) — ฝั่ง client หน่วง 8 วิ (toast "เลิกทำ") **ก่อน** ยิงมาที่นี่
 * ⇒ route นี้ส่งจริงทันทีเสมอ ห้ามเพิ่มหน่วงเวลาซ้ำที่ฝั่งเซิร์ฟเวอร์
 */

import { type NextRequest } from "next/server";

import { mailError, mailJson, readJsonBody, withMailSession } from "../_lib";
import { readDraftInput } from "../_compose";
import { MailComposeError } from "@/lib/mail/compose";
import { fetchIdentities, resolveIdentity, sendMail } from "@/lib/mail/outbox";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  const body = await readJsonBody(req);
  return withMailSession(req, async (session) => {
    try {
      const input = readDraftInput(body);
      const identities = await fetchIdentities(session);
      const identity = resolveIdentity(identities, input.identityId, session.email);
      const { emailId, movedToSent } = await sendMail(session, input, identity);
      return mailJson({ ok: true, emailId, from: identity.email, movedToSent });
    } catch (e) {
      if (e instanceof MailComposeError) return mailError("mail_bad_request", e.message, 400);
      throw e;
    }
  });
}
