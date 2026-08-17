/**
 * โฟลเดอร์ที่ผู้ใช้สร้างเอง (M3) — เปลี่ยนชื่อ / ย้าย / ลบ
 *
 * 🔴 เปลี่ยนชื่อหรือย้ายแล้ว **ต้อง regenerate สคริปต์กฎกรอง** เสมอ
 *    เพราะ `fileinto` ของ Sieve อ้าง path ไม่ใช่ id — ไม่ทำ = กฎย้ายเมลไปโฟลเดอร์ที่ไม่มีอยู่แล้ว
 */

import { type NextRequest } from "next/server";

import { mailError, mailJson, readJsonBody, withMailSession } from "../../_lib";
import { deleteMailFolder, updateMailFolder } from "@/lib/mail/folders";
import { refreshMailRulesScript } from "@/lib/mail/rules";
import { isMailboxId } from "@/lib/mail/boxes";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function PATCH(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  if (!isMailboxId(id)) return mailError("mail_bad_request", "รหัสโฟลเดอร์ไม่ถูกต้อง", 400);

  const body = await readJsonBody(req);
  const args: { name?: string; parentId?: string | null } = {};
  if (typeof body.name === "string") args.name = body.name;
  if (body.parentId !== undefined) {
    if (body.parentId === null || body.parentId === "") {
      args.parentId = null;
    } else if (typeof body.parentId === "string" && isMailboxId(body.parentId)) {
      args.parentId = body.parentId;
    } else {
      return mailError("mail_bad_request", "โฟลเดอร์แม่ไม่ถูกต้อง", 400);
    }
  }

  return withMailSession(req, async (session) => {
    const folder = await updateMailFolder(session, id, args);
    await refreshMailRulesScript(session);
    return mailJson({ ok: true, folder });
  });
}

export async function DELETE(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  if (!isMailboxId(id)) return mailError("mail_bad_request", "รหัสโฟลเดอร์ไม่ถูกต้อง", 400);

  return withMailSession(req, async (session) => {
    await deleteMailFolder(session, id);
    await refreshMailRulesScript(session, { removedMailboxId: id });
    return mailJson({ ok: true });
  });
}
