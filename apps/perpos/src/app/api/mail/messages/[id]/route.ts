/**
 * GET  = บานอ่าน (default `by=thread`) · `images=1` = ขอ HTML รอบที่ผ่อนให้แสดงรูปนอก
 * PATCH = อ่านแล้ว/ดาว/ย้าย รายฉบับ (default `by=email`) → คืน undo token สำหรับคืนค่าเดิม
 */

import { type NextRequest } from "next/server";

import { mailError, mailJson, readJsonBody, withMailSession } from "../../_lib";
import { applyMailPatch, getMailThread, type MailPatch } from "@/lib/mail/messages";
import type { MailScope } from "@/lib/mail/types";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function scopeOf(value: unknown, fallback: MailScope): MailScope {
  return value === "thread" || value === "email" ? value : fallback;
}

export async function GET(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const by = scopeOf(req.nextUrl.searchParams.get("by"), "thread");
  const showImages = req.nextUrl.searchParams.get("images") === "1";

  return withMailSession(req, async (session) =>
    mailJson(await getMailThread(session, id, by, { showImages })),
  );
}

export async function PATCH(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const body = await readJsonBody(req);
  const by = scopeOf(body.by, "email");

  const patch: MailPatch = {};
  if (typeof body.isUnread === "boolean") patch.isUnread = body.isUnread;
  if (typeof body.isFlagged === "boolean") patch.isFlagged = body.isFlagged;
  if (body.moveTo === "archive" || body.moveTo === "trash" || body.moveTo === "inbox") {
    patch.moveTo = body.moveTo;
  }
  if (Object.keys(patch).length === 0) {
    return mailError("mail_bad_request", "ไม่มีสิ่งที่ต้องเปลี่ยน", 400);
  }

  return withMailSession(req, async (session) => {
    const result = await applyMailPatch(session, { ids: [id], by, patch });
    return mailJson({ ok: true, undo: result.undo });
  });
}
