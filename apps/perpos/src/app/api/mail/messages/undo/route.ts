/**
 * เลิกทำ = **คืนค่าเดิมรายฉบับ** จาก token ที่ client ถือไว้ (stateless — ไม่เก็บฝั่ง server)
 * ห้ามทำเป็น "ทำตรงข้าม" (ปลดดาวทั้งชุดแล้ว undo จะไปติดดาวเมลที่เดิมไม่เคยติด)
 */

import { type NextRequest } from "next/server";

import { mailError, mailJson, readJsonBody, withMailSession } from "../../_lib";
import { applyMailUndo } from "@/lib/mail/messages";
import type { MailUndoItem, MailUndoToken } from "@/lib/mail/types";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function parseItems(raw: unknown): MailUndoItem[] {
  if (!Array.isArray(raw)) return [];
  const items: MailUndoItem[] = [];
  for (const entry of raw) {
    if (!entry || typeof entry !== "object") continue;
    const e = entry as Record<string, unknown>;
    if (typeof e.id !== "string") continue;
    items.push({
      id: e.id,
      mailboxIds: Array.isArray(e.mailboxIds)
        ? e.mailboxIds.filter((v): v is string => typeof v === "string")
        : [],
      wasUnread: e.wasUnread === true,
      wasFlagged: e.wasFlagged === true,
    });
  }
  return items;
}

export async function POST(req: NextRequest) {
  const body = await readJsonBody(req);
  const items = parseItems(body.items);
  if (items.length === 0) return mailError("mail_bad_request", "ไม่มีรายการให้เลิกทำ", 400);
  if (items.length > 200) return mailError("mail_bad_request", "รายการเกินที่กำหนด", 400);
  if (items.some((i) => i.mailboxIds.length === 0)) {
    return mailError("mail_bad_request", "ข้อมูลสำหรับเลิกทำไม่ครบ", 400);
  }

  const token: MailUndoToken = {
    action: (body.action as MailUndoToken["action"]) ?? "archive",
    by: body.by === "thread" ? "thread" : "email",
    items,
  };

  return withMailSession(req, async (session) => {
    const result = await applyMailUndo(session, token);
    return mailJson({ ok: true, affected: result.affected });
  });
}
