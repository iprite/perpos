/**
 * POST /api/bi/ask — ถามคำถามธุรกิจ (contract §6.4)
 *
 * body: { orgId, question, threadId? } → BiAnswer
 * - `orgId` ที่ client ส่งมาใช้เพื่อ resolve เท่านั้น — ต้องผ่าน `requireBiMember` ทุกครั้ง
 *   และ orgId ที่ส่งต่อเข้า engine คือค่าที่ guard คืนกลับมา (ไม่ใช่ค่าจาก body)
 */

import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/app/api/_lib/supabase";
import { setAuditContext } from "@/app/api/_lib/audit";
import { askBi, BiThreadNotFoundError } from "@/lib/bi/ask";
import { requireBiMember } from "../_lib";

export const maxDuration = 60;

export async function POST(req: NextRequest) {
  let body: { orgId?: string; question?: string; threadId?: string | null };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: "รูปแบบคำขอไม่ถูกต้อง" }, { status: 400 });
  }

  const orgId = (body.orgId ?? "").trim();
  if (!orgId) return NextResponse.json({ error: "ต้องระบุองค์กร (orgId)" }, { status: 400 });

  const question = (body.question ?? "").trim();
  if (!question)
    return NextResponse.json({ error: "กรุณาพิมพ์คำถามที่ต้องการทราบ" }, { status: 400 });

  const auth = await requireBiMember(req, orgId);
  if (!auth.ok) return auth.res;

  // การถามสร้างแถวใน bi_threads/bi_messages/bi_query_log → ถือเป็น mutation
  await setAuditContext(req, auth.userId, auth.orgId);

  try {
    const answer = await askBi(
      {
        orgId: auth.orgId,
        profileId: auth.userId,
        role: auth.role,
        question,
        threadId: body.threadId ?? null,
        source: "web",
      },
      { admin: createAdminClient() },
    );
    return NextResponse.json(answer);
  } catch (e) {
    // threadId ที่ส่งมาไม่ใช่ของผู้ถาม → 404 เท่ากับ "ไม่มี" (ห้ามยืนยันว่ามีอยู่จริง)
    if (e instanceof BiThreadNotFoundError) {
      return NextResponse.json({ error: "ไม่พบบทสนทนานี้" }, { status: 404 });
    }
    console.error("[api/bi/ask]", (e as Error).message);
    return NextResponse.json(
      { error: "ผู้ช่วยวิเคราะห์ธุรกิจขัดข้องชั่วคราว กรุณาลองใหม่อีกครั้ง" },
      { status: 500 },
    );
  }
}
