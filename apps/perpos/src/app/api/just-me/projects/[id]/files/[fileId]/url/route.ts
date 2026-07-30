/**
 * /api/just-me/projects/[id]/files/[fileId]/url — ลิงก์เปิดไฟล์ชั่วคราว
 * GET = สมาชิกทุกคน · คืน signed URL อายุ ≤60 วิ (bucket เป็น private เสมอ)
 */

import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "../../../../../../_lib/supabase";
import { guard, jmError } from "../../../../../_lib";
import { createDownloadUrl } from "@/lib/just-me/files";

type Ctx = { params: Promise<{ id: string; fileId: string }> };

export async function GET(req: NextRequest, ctx: Ctx) {
  const { id, fileId } = await ctx.params;
  const g = await guard(req);
  if (!g.ok) return g.res;

  const admin = createAdminClient();
  const { data: file } = await admin
    .from("just_me_project_files")
    .select("id, file_name, storage_path")
    .eq("org_id", g.orgId)
    .eq("project_id", id)
    .eq("id", fileId)
    .maybeSingle();
  if (!file) return jmError("ไม่พบไฟล์นี้", 404);

  const row = file as { file_name: string | null; storage_path: string };
  try {
    const signed = await createDownloadUrl(admin, row.storage_path, row.file_name);
    return NextResponse.json({ ...signed, file_name: row.file_name });
  } catch (e) {
    return jmError(e instanceof Error ? e.message : "สร้างลิงก์ไม่สำเร็จ", 500);
  }
}
