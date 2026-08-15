/**
 * ร่าง/ส่งเมล (M2) — ชั้นที่คุยกับ JMAP · การประกอบ object อยู่ที่ `compose.ts` (pure) เสมอ
 *
 * ลำดับที่ใช้ส่ง (ตาม RFC 8621 §7):
 *   `Email/set create` (ลง Drafts) → `EmailSubmission/set create` (+ `onSuccessUpdateEmail`
 *   ย้ายเข้า Sent + ถอด `$draft`) — **สองอย่างนี้ต้องอยู่ใน request เดียวกัน**
 *   ไม่งั้นถ้าขั้นสองล้ม เมลจะค้างใน Drafts โดยผู้ใช้เชื่อว่าส่งไปแล้ว
 *
 * กฎที่ห้ามพัง:
 *  - **ส่งได้เฉพาะ identity ที่เซิร์ฟเวอร์ยืนยันว่าเป็นของบัญชีนี้** — ห้ามให้ผู้เรียกกำหนด
 *    `from` เอง (ไม่งั้นกลายเป็นเครื่องมือปลอมผู้ส่ง) · `resolveIdentity()` เป็นด่านเดียว
 *  - ร่างที่เซฟแล้วต้องมี `$draft` เสมอ ไม่งั้น client อื่น (Outlook/Apple Mail) จะเห็นเป็นเมลปกติ
 */

import {
  JMAP_USING_SUBMISSION,
  MailServiceError,
  jmapRequest,
  pickResponse,
  responseType,
} from "./jmap";
import { MailComposeError, buildDraftEmail, type MailDraftInput } from "./compose";
import { fetchMailboxes, mailboxIdByKey } from "./messages";
import type { MailAddress, MailSession } from "./types";

export interface MailIdentity {
  id: string;
  name: string | null;
  email: string;
}

/** identity ทั้งหมดที่บัญชีนี้ส่งในนามได้ (เซิร์ฟเวอร์เป็นคนบอก ไม่ใช่เรา) */
export async function fetchIdentities(session: MailSession): Promise<MailIdentity[]> {
  const responses = await jmapRequest(
    session,
    [["Identity/get", { accountId: session.accountId }, "i"]],
    JMAP_USING_SUBMISSION,
  );
  const list = pickResponse(responses, "i").list as
    { id: string; name?: string | null; email: string }[] | undefined;
  if (!Array.isArray(list) || list.length === 0) {
    throw new MailServiceError(502, "บัญชีนี้ยังส่งเมลไม่ได้ (ไม่มีที่อยู่ผู้ส่ง)");
  }
  return list.map((i) => ({ id: i.id, name: i.name?.trim() || null, email: i.email }));
}

/**
 * เลือก identity ที่จะส่ง — ผู้เรียกขอมาได้ แต่ **ต้องอยู่ในรายการของเซิร์ฟเวอร์**
 * ไม่ระบุ/ไม่พบ → ใช้ที่อยู่ของกล่องเมลนั้นเอง ไม่ก็ตัวแรก
 */
export function resolveIdentity(
  identities: MailIdentity[],
  requestedId: string | null | undefined,
  sessionEmail: string,
): MailIdentity {
  if (requestedId) {
    const found = identities.find((i) => i.id === requestedId);
    if (!found) throw new MailComposeError("ไม่พบที่อยู่ผู้ส่งที่เลือก");
    return found;
  }
  const own = identities.find((i) => i.email.toLowerCase() === sessionEmail.toLowerCase());
  return own ?? identities[0]!;
}

async function requireMailbox(session: MailSession, key: "drafts" | "sent"): Promise<string> {
  const id = mailboxIdByKey(await fetchMailboxes(session))[key];
  if (!id) {
    throw new MailServiceError(
      404,
      key === "drafts" ? "ไม่พบกล่องร่างในกล่องเมลนี้" : "ไม่พบกล่องส่งแล้วในกล่องเมลนี้",
    );
  }
  return id;
}

function identityAddress(identity: MailIdentity): MailAddress {
  return { name: identity.name, email: identity.email };
}

export interface SaveDraftResult {
  draftId: string;
}

/**
 * เซฟร่าง — มี `draftId` เดิม = สร้างใหม่แล้วลบของเก่าใน request เดียว
 * (JMAP แก้ body ของ Email ที่มีอยู่ไม่ได้ — `Email` เป็น immutable ยกเว้น keyword/mailbox)
 */
export async function saveDraft(
  session: MailSession,
  input: MailDraftInput,
  identity: MailIdentity,
): Promise<SaveDraftResult> {
  const draftsId = await requireMailbox(session, "drafts");
  const { email } = buildDraftEmail(input, identityAddress(identity));

  const create = {
    ...email,
    mailboxIds: { [draftsId]: true },
    keywords: { $draft: true, $seen: true },
  };
  const args: Record<string, unknown> = {
    accountId: session.accountId,
    create: { draft: create },
  };
  if (input.draftId) args.destroy = [input.draftId];

  const responses = await jmapRequest(session, [["Email/set", args, "d"]]);
  const result = pickResponse(responses, "d");
  const created = (result.created as Record<string, { id?: string }> | undefined)?.draft;
  if (!created?.id) throw new MailServiceError(502, "บันทึกร่างไม่สำเร็จ");
  return { draftId: created.id };
}

export async function deleteDraft(session: MailSession, draftId: string): Promise<void> {
  await jmapRequest(session, [
    ["Email/set", { accountId: session.accountId, destroy: [draftId] }, "x"],
  ]);
}

export interface SendMailResult {
  /** id ของฉบับที่ถูกส่ง (อยู่ใน Sent แล้ว) */
  emailId: string;
}

/**
 * ส่งจริง — สร้างฉบับใหม่ + submission ใน request เดียว แล้วให้เซิร์ฟเวอร์ย้ายเข้า Sent เอง
 * ร่างเดิม (ถ้ามี) ถูกลบใน request เดียวกัน — ส่งแล้วต้องไม่มีร่างค้าง
 */
export async function sendMail(
  session: MailSession,
  input: MailDraftInput,
  identity: MailIdentity,
): Promise<SendMailResult> {
  const [draftsId, sentId] = await Promise.all([
    requireMailbox(session, "drafts"),
    requireMailbox(session, "sent"),
  ]);
  const { email } = buildDraftEmail(input, identityAddress(identity), {
    requireRecipients: true,
  });

  const emailSetArgs: Record<string, unknown> = {
    accountId: session.accountId,
    create: {
      out: {
        ...email,
        mailboxIds: { [draftsId]: true },
        keywords: { $draft: true, $seen: true },
      },
    },
  };
  if (input.draftId) emailSetArgs.destroy = [input.draftId];

  const responses = await jmapRequest(
    session,
    [
      ["Email/set", emailSetArgs, "e"],
      [
        "EmailSubmission/set",
        {
          accountId: session.accountId,
          create: { sub: { emailId: "#out", identityId: identity.id } },
          // ให้เซิร์ฟเวอร์ย้ายเข้า Sent + ถอด $draft ให้เอง เมื่อส่งสำเร็จเท่านั้น
          onSuccessUpdateEmail: {
            "#sub": {
              [`mailboxIds/${draftsId}`]: null,
              [`mailboxIds/${sentId}`]: true,
              "keywords/$draft": null,
            },
          },
        },
        "s",
      ],
    ],
    JMAP_USING_SUBMISSION,
  );

  const emailResult = pickResponse(responses, "e");
  const emailId = (emailResult.created as Record<string, { id?: string }> | undefined)?.out?.id;
  if (!emailId) throw new MailServiceError(502, "ประกอบอีเมลไม่สำเร็จ");

  if (responseType(responses, "s") === "error") {
    // ฉบับที่สร้างไว้ยังค้างใน Drafts — เก็บกวาดแล้วค่อยแจ้ง ไม่ให้เหลือขยะที่ผู้ใช้ไม่ได้สั่ง
    await deleteDraft(session, emailId).catch(() => {});
    throw new MailServiceError(502, "ส่งอีเมลไม่สำเร็จ ลองใหม่อีกครั้ง");
  }
  const subResult = pickResponse(responses, "s");
  const notCreated = subResult.notCreated as Record<string, unknown> | undefined;
  if (notCreated && Object.keys(notCreated).length > 0) {
    await deleteDraft(session, emailId).catch(() => {});
    throw new MailServiceError(502, "เซิร์ฟเวอร์ปฏิเสธการส่ง ลองใหม่อีกครั้ง");
  }

  return { emailId };
}
