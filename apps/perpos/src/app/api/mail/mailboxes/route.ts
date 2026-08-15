/** โฟลเดอร์ทั้งหมด + อีเมลของกล่องที่เชื่อมอยู่ (spec §5) */

import { type NextRequest } from "next/server";

import { mailJson, withMailSession } from "../_lib";
import { buildMailboxSummaries, fetchMailboxes } from "@/lib/mail/messages";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  return withMailSession(req, async (session) => {
    const boxes = await fetchMailboxes(session);
    return mailJson({ mailboxes: buildMailboxSummaries(boxes), email: session.email });
  });
}
