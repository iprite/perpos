/**
 * ล้างถังขยะ / จดหมายขยะ — **ลบถาวร** (ดู `lib/mail/empty-box.ts`)
 *
 * ไม่มี undo โดยเจตนา: ของในสองกล่องนี้ผู้ใช้ตัดสินใจทิ้งไปแล้วรอบหนึ่ง
 * ⇒ หน้าเว็บต้องถามยืนยันพร้อมจำนวนก่อนเรียก และเรียกซ้ำจนกว่า `remaining` = 0
 */

import { type NextRequest } from "next/server";

import { mailError, mailJson, readJsonBody, withMailSession } from "../../_lib";
import { EMPTY_BOX_LIMIT, emptyMailbox, isEmptyableBox } from "@/lib/mail/empty-box";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  const body = await readJsonBody(req);
  const box = body.box;
  if (!isEmptyableBox(box)) {
    return mailError("mail_bad_request", "ล้างได้เฉพาะถังขยะและจดหมายขยะ", 400);
  }
  return withMailSession(req, async (session) => {
    const res = await emptyMailbox(session, box);
    return mailJson({ ...res, limit: EMPTY_BOX_LIMIT });
  });
}
