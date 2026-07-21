import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "../../_lib/supabase";
import { setAuditContext } from "../../_lib/audit";
import { requireGovProcureMember, canWrite, canDelete, orgIdFromQuery, govError } from "../_lib";
import { listAttachments } from "@/lib/gov-procure/attachments";
import { ATTACHMENT_KINDS, type AttachmentKind } from "@/lib/gov-procure/types";

const BUCKET = "gov-procure";

// จำกัดชนิด/ขนาดไฟล์ (สลิป/รูปเช็ค = รูปภาพหรือ PDF เท่านั้น) — กัน abuse storage
const ALLOWED_MIME = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/heic",
  "image/heif",
  "application/pdf",
]);
const MAX_FILE_BYTES = 10 * 1024 * 1024; // 10MB

/**
 * ยืนยันว่า order_id เป็นของ orgId จริงก่อนแตะ attachment (defense-in-depth / IDOR).
 * gov_procure_attachments.org_id ไม่มี composite-FK ผูกกับ orders.org_id → API ต้องเช็คเอง
 * (security-reviewer flag). คืน true ถ้า order นั้นอยู่ใน org นี้.
 */
async function orderBelongsToOrg(
  admin: ReturnType<typeof createAdminClient>,
  orgId: string,
  orderId: string,
): Promise<boolean> {
  const { data } = await admin
    .from("gov_procure_orders")
    .select("id")
    .eq("id", orderId)
    .eq("org_id", orgId)
    .maybeSingle();
  return !!data;
}

// GET /api/gov-procure/attachments?orgId=&orderId= → list สลิป/รูปเช็คของ order
export async function GET(req: NextRequest) {
  const orgId = orgIdFromQuery(req);
  const orderId = req.nextUrl.searchParams.get("orderId");
  if (!orgId || !orderId) return govError("missing orgId หรือ orderId");

  const auth = await requireGovProcureMember(req, orgId);
  if (!auth.ok) return auth.res;

  try {
    const attachments = await listAttachments(createAdminClient(), orgId, orderId);
    return NextResponse.json({ attachments });
  } catch (e) {
    return govError((e as Error).message, 500);
  }
}

// POST /api/gov-procure/attachments?orgId= → upload ไฟล์เข้า bucket + บันทึก record
// FormData: orderId, kind, file
export async function POST(req: NextRequest) {
  const orgId = orgIdFromQuery(req);
  if (!orgId) return govError("missing orgId");

  const auth = await requireGovProcureMember(req, orgId);
  if (!auth.ok) return auth.res;
  if (!canWrite(auth.role)) return govError("ไม่มีสิทธิ์แนบไฟล์", 403);

  const form = await req.formData().catch(() => null);
  if (!form) return govError("payload ต้องเป็น multipart/form-data");

  const orderId = String(form.get("orderId") ?? "");
  const kind = String(form.get("kind") ?? "") as AttachmentKind;
  const file = form.get("file");

  if (!orderId) return govError("กรุณาระบุ orderId");
  if (!ATTACHMENT_KINDS.includes(kind)) return govError("ประเภทไฟล์ (kind) ไม่ถูกต้อง");
  if (!(file instanceof File)) return govError("กรุณาแนบไฟล์");
  if (!ALLOWED_MIME.has(file.type)) {
    return govError("รองรับเฉพาะไฟล์รูปภาพ (JPEG/PNG/WebP/HEIC) หรือ PDF");
  }
  if (file.size > MAX_FILE_BYTES) {
    return govError("ไฟล์ใหญ่เกิน 10MB — กรุณาลดขนาดไฟล์ก่อนอัปโหลด");
  }

  const admin = createAdminClient();

  // IDOR guard — order ต้องอยู่ใน org นี้ก่อน insert เสมอ
  if (!(await orderBelongsToOrg(admin, orgId, orderId))) {
    return govError("ไม่พบงานนี้ในองค์กร", 404);
  }

  await setAuditContext(req, auth.userId, orgId);

  const safeName = (file.name || "file").replace(/[^\w.\-ก-๙]/g, "_");
  const filePath = `${orgId}/${orderId}/${crypto.randomUUID()}-${safeName}`;
  const bytes = new Uint8Array(await file.arrayBuffer());

  const { error: upErr } = await admin.storage.from(BUCKET).upload(filePath, bytes, {
    contentType: file.type || "application/octet-stream",
    upsert: false,
  });
  if (upErr) return govError(`อัปโหลดไฟล์ไม่สำเร็จ: ${upErr.message}`, 500);

  const { data, error } = await admin
    .from("gov_procure_attachments")
    .insert({
      org_id: orgId,
      order_id: orderId,
      kind,
      file_path: filePath,
      file_name: file.name || null,
      uploaded_by: auth.userId,
    })
    .select()
    .single();

  if (error) {
    // rollback ไฟล์ที่เพิ่งอัปถ้า insert ล้ม
    await admin.storage.from(BUCKET).remove([filePath]);
    return govError(error.message, 500);
  }
  return NextResponse.json({ attachment: data }, { status: 201 });
}

// DELETE /api/gov-procure/attachments?orgId=&attachmentId= → ลบ record + ไฟล์ใน bucket
export async function DELETE(req: NextRequest) {
  const orgId = orgIdFromQuery(req);
  const attachmentId = req.nextUrl.searchParams.get("attachmentId");
  if (!orgId || !attachmentId) return govError("missing orgId หรือ attachmentId");

  const auth = await requireGovProcureMember(req, orgId);
  if (!auth.ok) return auth.res;
  if (!canDelete(auth.role)) return govError("ไม่มีสิทธิ์ลบไฟล์ (เฉพาะเจ้าของ/ผู้จัดการ)", 403);

  const admin = createAdminClient();

  // กรอง org_id ป้องกัน cross-org delete
  const { data: att } = await admin
    .from("gov_procure_attachments")
    .select("file_path")
    .eq("id", attachmentId)
    .eq("org_id", orgId)
    .maybeSingle();

  if (!att) return govError("ไม่พบไฟล์แนบ", 404);

  await setAuditContext(req, auth.userId, orgId);

  await admin.storage.from(BUCKET).remove([(att as { file_path: string }).file_path]);
  const { error } = await admin
    .from("gov_procure_attachments")
    .delete()
    .eq("id", attachmentId)
    .eq("org_id", orgId);

  if (error) return govError(error.message, 500);
  return NextResponse.json({ ok: true });
}
