/**
 * ร่างอัตโนมัติ (M2) — POST = เซฟ (สร้างใหม่/ทับของเดิม) · DELETE = ทิ้งร่าง
 *
 * ⚠️ ผู้เรียกต้องส่ง `draftId` เดิมกลับมาทุกครั้ง ไม่งั้นจะได้ร่างซ้ำกองใน Drafts
 * (JMAP แก้เนื้อ Email เดิมไม่ได้ — ทุกครั้งคือสร้างใหม่+ลบเก่า ดู lib/mail/outbox.ts)
 */

import { type NextRequest } from "next/server";

import { mailError, mailJson, readJsonBody, withMailSession } from "../_lib";
import { readDraftInput } from "../_compose";
import { MailComposeError } from "@/lib/mail/compose";
import { deleteDraft, fetchIdentities, resolveIdentity, saveDraft } from "@/lib/mail/outbox";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  const body = await readJsonBody(req);
  return withMailSession(req, async (session) => {
    try {
      const input = readDraftInput(body);
      const identities = await fetchIdentities(session);
      const identity = resolveIdentity(identities, input.identityId, session.email);
      const { draftId } = await saveDraft(session, input, identity);
      return mailJson({ draftId, savedAt: new Date().toISOString() });
    } catch (e) {
      if (e instanceof MailComposeError) return mailError("mail_bad_request", e.message, 400);
      throw e;
    }
  });
}

export async function DELETE(req: NextRequest) {
  const body = await readJsonBody(req);
  const draftId = typeof body.draftId === "string" ? body.draftId : "";
  if (!draftId) return mailError("mail_bad_request", "ไม่พบร่างที่จะลบ", 400);
  return withMailSession(req, async (session) => {
    await deleteDraft(session, draftId);
    return mailJson({ ok: true });
  });
}
