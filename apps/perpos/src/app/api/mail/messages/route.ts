/**
 * รายการเมล / ค้นหา — **POST โดยตั้งใจ ไม่ใช่ GET** (spec §5)
 * คำค้น (`q`) เป็นข้อมูลส่วนบุคคล ถ้าอยู่ใน query string จะถูกเก็บใน access log ของ Vercel ซึ่งลบไม่ได้
 * ห้ามเปลี่ยนกลับเป็น GET เพื่อความสะดวกของ cache (หน้านี้ไม่ cache อยู่แล้ว)
 */

import { type NextRequest } from "next/server";

import { mailError, mailJson, readJsonBody, withMailSession } from "../_lib";
import { MAIL_BOX_ORDER, MAIL_FOLDER_PREFIX, isMailboxId } from "@/lib/mail/boxes";
import { listMessages } from "@/lib/mail/messages";
import type { MailBoxKey } from "@/lib/mail/types";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/** คีย์ระบบ หรือ `f:<mailboxId>` ของโฟลเดอร์เอง (M3) — นอกนั้นตีกลับตั้งแต่ที่นี่ */
function isKnownBoxValue(box: string): boolean {
  if (box.startsWith(MAIL_FOLDER_PREFIX)) {
    return isMailboxId(box.slice(MAIL_FOLDER_PREFIX.length));
  }
  return MAIL_BOX_ORDER.includes(box as MailBoxKey);
}

export async function POST(req: NextRequest) {
  const body = await readJsonBody(req);
  const box = typeof body.box === "string" && body.box ? body.box : "inbox";
  if (!isKnownBoxValue(box)) {
    return mailError("mail_bad_request", "ไม่รู้จักโฟลเดอร์ที่ขอ", 400);
  }

  const limitRaw = typeof body.limit === "number" ? body.limit : 50;
  const params = {
    box,
    q: typeof body.q === "string" ? body.q.slice(0, 200) : undefined,
    // ค่าอื่นที่ไม่รู้จัก = `all` (ค้นทั้งกล่องเมล) — ดูเหตุผลใน `buildFilter`
    searchScope: body.searchScope === "box" ? ("box" as const) : ("all" as const),
    unread: body.unread === true,
    attachment: body.attachment === true,
    anchor: typeof body.anchor === "string" ? body.anchor : undefined,
    anchorOffset: typeof body.anchorOffset === "number" ? body.anchorOffset : undefined,
    position: typeof body.position === "number" ? body.position : undefined,
    limit: Math.min(Math.max(Math.trunc(limitRaw), 1), 100),
  };

  return withMailSession(req, async (session) => mailJson(await listMessages(session, params)));
}
