/**
 * /api/just-me/projects/[id]/files — ไฟล์แนบของโครงการ
 * GET    = สมาชิก (เมทาดาทาเท่านั้น ไม่มี URL ไฟล์)
 * POST   = owner/manager · `action:"upload-url"` → signed upload URL (อัปตรงเข้า bucket)
 *                          ไม่ระบุ action → ลงทะเบียนไฟล์ที่อัปเสร็จแล้ว
 * DELETE = owner/manager · `?fileId=` → ลบทั้งแถวและไฟล์จริง
 */

import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "../../../../_lib/supabase";
import { auditMutation, guard, jmError } from "../../../_lib";
import { getProject, listProjectFiles } from "@/lib/just-me/projects";
import {
  FILE_KINDS,
  MAX_FILE_SIZE_BYTES,
  createUploadUrl,
  isOwnedPath,
  removeStorageObject,
} from "@/lib/just-me/files";
import type { ProjectFileKind } from "@/lib/just-me/types";

type Ctx = { params: Promise<{ id: string }> };

export async function GET(req: NextRequest, ctx: Ctx) {
  const { id } = await ctx.params;
  const g = await guard(req);
  if (!g.ok) return g.res;

  const admin = createAdminClient();
  const project = await getProject(admin, g.orgId, id);
  if (!project) return jmError("ไม่พบโครงการนี้", 404);

  try {
    return NextResponse.json({ files: await listProjectFiles(admin, g.orgId, id) });
  } catch (e) {
    return jmError(e instanceof Error ? e.message : "โหลดรายการไฟล์ไม่สำเร็จ", 500);
  }
}

export async function POST(req: NextRequest, ctx: Ctx) {
  const { id } = await ctx.params;
  const g = await guard(req, { write: true });
  if (!g.ok) return g.res;

  const admin = createAdminClient();
  const project = await getProject(admin, g.orgId, id);
  if (!project) return jmError("ไม่พบโครงการนี้", 404);

  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const fileName = typeof body.file_name === "string" ? body.file_name.trim() : "";
  if (!fileName) return jmError("กรุณาระบุชื่อไฟล์", 400);

  const sizeBytes =
    body.size_bytes === undefined || body.size_bytes === null ? null : Number(body.size_bytes);
  if (sizeBytes !== null && (!Number.isFinite(sizeBytes) || sizeBytes < 0)) {
    return jmError("ขนาดไฟล์ไม่ถูกต้อง", 400);
  }
  if (sizeBytes !== null && sizeBytes > MAX_FILE_SIZE_BYTES) {
    return jmError("ไฟล์ใหญ่เกิน 50 MB", 413);
  }

  // ขั้นที่ 1 — ขอลิงก์อัปโหลด (ไฟล์ไม่วิ่งผ่าน route นี้)
  if (body.action === "upload-url") {
    try {
      const up = await createUploadUrl(admin, {
        orgId: g.orgId,
        projectId: id,
        fileName,
        sizeBytes,
      });
      return NextResponse.json(up);
    } catch (e) {
      return jmError(e instanceof Error ? e.message : "สร้างลิงก์อัปโหลดไม่สำเร็จ", 500);
    }
  }

  // ขั้นที่ 2 — ลงทะเบียนไฟล์ที่อัปขึ้น storage แล้ว
  const storagePath = typeof body.storage_path === "string" ? body.storage_path : "";
  if (!storagePath) return jmError("ไม่พบตำแหน่งไฟล์ที่อัปโหลด", 400);
  if (!isOwnedPath(storagePath, g.orgId, id)) {
    return jmError("ตำแหน่งไฟล์ไม่ตรงกับโครงการนี้", 400);
  }

  const kind = (body.file_kind as ProjectFileKind) ?? "other";
  if (!FILE_KINDS.includes(kind)) return jmError("ประเภทไฟล์ไม่ถูกต้อง", 400);

  await auditMutation(req, g.auth);
  const { data, error } = await admin
    .from("just_me_project_files")
    .insert({
      org_id: g.orgId,
      project_id: id,
      file_kind: kind,
      file_name: fileName,
      storage_path: storagePath,
      mime_type: typeof body.mime_type === "string" ? body.mime_type : null,
      size_bytes: sizeBytes,
      uploaded_by: g.auth.userId,
      created_by: g.auth.userId,
    })
    .select("*")
    .single();
  if (error) {
    await removeStorageObject(admin, storagePath);
    return jmError(error.message, 500);
  }
  return NextResponse.json({ file: data }, { status: 201 });
}

export async function DELETE(req: NextRequest, ctx: Ctx) {
  const { id } = await ctx.params;
  const g = await guard(req, { write: true });
  if (!g.ok) return g.res;

  const fileId = req.nextUrl.searchParams.get("fileId");
  if (!fileId) return jmError("ไม่ได้ระบุไฟล์ที่จะลบ", 400);

  const admin = createAdminClient();
  const { data: file } = await admin
    .from("just_me_project_files")
    .select("id, storage_path")
    .eq("org_id", g.orgId)
    .eq("project_id", id)
    .eq("id", fileId)
    .maybeSingle();
  if (!file) return jmError("ไม่พบไฟล์นี้", 404);

  await auditMutation(req, g.auth);
  const { error } = await admin
    .from("just_me_project_files")
    .delete()
    .eq("id", fileId)
    .eq("org_id", g.orgId);
  if (error) return jmError(error.message, 500);

  await removeStorageObject(admin, (file as { storage_path: string }).storage_path);
  return NextResponse.json({ ok: true });
}
