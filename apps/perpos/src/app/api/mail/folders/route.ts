/**
 * โฟลเดอร์ที่ผู้ใช้สร้างเอง (M3) — สร้างใหม่
 *
 * รายการโฟลเดอร์อยู่ใน `GET /api/mail/mailboxes` (คำขอเดียวกับกล่องระบบ) โดยตั้งใจ
 * — rail ต้องได้ทั้งกล่องระบบและโฟลเดอร์จากแหล่งเดียว ไม่งั้นตัวเลข/ลำดับเพี้ยนกันเอง
 */

import { type NextRequest } from "next/server";

import { mailError, mailJson, readJsonBody, withMailSession } from "../_lib";
import { createMailFolder } from "@/lib/mail/folders";
import { isMailboxId } from "@/lib/mail/boxes";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  const body = await readJsonBody(req);
  const name = typeof body.name === "string" ? body.name : "";
  const parentRaw = typeof body.parentId === "string" ? body.parentId.trim() : "";
  if (parentRaw && !isMailboxId(parentRaw)) {
    return mailError("mail_bad_request", "โฟลเดอร์แม่ไม่ถูกต้อง", 400);
  }

  return withMailSession(req, async (session) => {
    const folder = await createMailFolder(session, { name, parentId: parentRaw || null });
    return mailJson({ ok: true, folder }, 201);
  });
}
