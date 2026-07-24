/**
 * GET  /api/bi/threads?orgId= → { threads }
 * POST /api/bi/threads        → { thread }   (สร้างบทสนทนาใหม่)
 */

import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/app/api/_lib/supabase";
import { setAuditContext } from "@/app/api/_lib/audit";
import { createThread, listThreads } from "@/lib/bi/threads";
import { biForbiddenWrite, canWriteBi, missingOrgId, readOrgId, requireBiMember } from "../_lib";

export async function GET(req: NextRequest) {
  const orgId = readOrgId(req);
  if (!orgId) return missingOrgId();

  const auth = await requireBiMember(req, orgId);
  if (!auth.ok) return auth.res;

  try {
    const threads = await listThreads(createAdminClient(), auth.orgId, { profileId: auth.userId });
    return NextResponse.json({ threads });
  } catch (e) {
    console.error("[api/bi/threads GET]", (e as Error).message);
    return NextResponse.json({ error: "ดึงรายการบทสนทนาไม่สำเร็จ" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  let body: { orgId?: string; title?: string | null };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: "รูปแบบคำขอไม่ถูกต้อง" }, { status: 400 });
  }

  const orgId = (body.orgId ?? "").trim();
  if (!orgId) return missingOrgId();

  const auth = await requireBiMember(req, orgId);
  if (!auth.ok) return auth.res;
  if (!canWriteBi(auth.role)) return biForbiddenWrite();

  await setAuditContext(req, auth.userId, auth.orgId);

  try {
    const thread = await createThread(createAdminClient(), {
      orgId: auth.orgId,
      createdBy: auth.userId,
      title: body.title ?? null,
    });
    return NextResponse.json({ thread }, { status: 201 });
  } catch (e) {
    console.error("[api/bi/threads POST]", (e as Error).message);
    return NextResponse.json({ error: "สร้างบทสนทนาใหม่ไม่สำเร็จ" }, { status: 500 });
  }
}
