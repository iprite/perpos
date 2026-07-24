/**
 * POST /api/bi/feedback — 👍/👎 ต่อคำตอบหนึ่งข้อ (contract §6.4)
 * body: { orgId, messageId, feedback:'up'|'down', note? } → { ok:true }
 *
 * feedback ผูกกับแถวใน `bi_query_log` ของ org นี้เท่านั้น (กันแก้ log ข้าม org)
 */

import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/app/api/_lib/supabase";
import { setAuditContext } from "@/app/api/_lib/audit";
import { isMessageOwnedBy } from "@/lib/bi/threads";
import { FEEDBACK_VALUES, type FeedbackValue } from "@/lib/bi/types";
import { biForbiddenWrite, canWriteBi, missingOrgId, requireBiMember } from "../_lib";

export async function POST(req: NextRequest) {
  let body: { orgId?: string; messageId?: string; feedback?: string; note?: string };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: "รูปแบบคำขอไม่ถูกต้อง" }, { status: 400 });
  }

  const orgId = (body.orgId ?? "").trim();
  if (!orgId) return missingOrgId();

  const messageId = (body.messageId ?? "").trim();
  if (!messageId)
    return NextResponse.json({ error: "ต้องระบุคำตอบที่ต้องการให้คะแนน" }, { status: 400 });

  const feedback = body.feedback as FeedbackValue;
  if (!(FEEDBACK_VALUES as readonly string[]).includes(feedback)) {
    return NextResponse.json({ error: "ค่าความเห็นไม่ถูกต้อง" }, { status: 400 });
  }

  const auth = await requireBiMember(req, orgId);
  if (!auth.ok) return auth.res;
  if (!canWriteBi(auth.role)) return biForbiddenWrite();

  await setAuditContext(req, auth.userId, auth.orgId);

  try {
    const admin = createAdminClient();

    // ด่านเจ้าของ: service-role ข้าม RLS → ถ้าไม่เช็คเอง จะให้คะแนนคำตอบของคนอื่นได้
    // ไม่ใช่ของเรา = 404 เท่ากับ "ไม่มี" (ห้ามยืนยันว่าข้อความนั้นมีอยู่จริง)
    if (!(await isMessageOwnedBy(admin, auth.orgId, messageId, auth.userId))) {
      return NextResponse.json({ error: "ไม่พบคำตอบที่ต้องการให้คะแนน" }, { status: 404 });
    }

    const { data, error } = await admin
      .from("bi_query_log")
      .update({
        feedback,
        feedback_note: (body.note ?? "").trim().slice(0, 1000) || null,
      })
      .eq("org_id", auth.orgId)
      .eq("message_id", messageId)
      .select("id");

    if (error) throw new Error(error.message);
    if (!data || data.length === 0) {
      return NextResponse.json({ error: "ไม่พบคำตอบที่ต้องการให้คะแนน" }, { status: 404 });
    }
    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error("[api/bi/feedback]", (e as Error).message);
    return NextResponse.json({ error: "บันทึกความเห็นไม่สำเร็จ" }, { status: 500 });
  }
}
