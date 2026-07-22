// POST   /api/gov-procure/catalog-images?orgId=  → อัปโหลดรูป (canWrite) — path server สร้างเอง
// GET    /api/gov-procure/catalog-images?orgId=&itemId=|productId=|itemIds=a,b → signed URL (member)
// DELETE /api/gov-procure/catalog-images?orgId=&itemId=|productId=  → ลบรูป (canWrite)
//
// contract: §5.9 A-B1 (**client ห้ามส่ง `path` เข้ามาทุกกรณี** · batch = คิวรีเดียว) ·
//           A-B2 (`image_path` เขียนได้จาก route นี้เท่านั้น) · C-1 (รูปแบบ path) · A-10 (ลบไฟล์)
// pattern: `attachments/route.ts` (MIME/ขนาด/IDOR/rollback/setAuditContext)

import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "../../_lib/supabase";
import { setAuditContext } from "../../_lib/audit";
import { requireGovProcureMember, canWrite, orgIdFromQuery, govError } from "../_lib";
import {
  CATALOG_BUCKET,
  buildCatalogImagePath,
  buildProductImagePath,
  pathBelongsToOrg,
  removeStorageFiles,
} from "../_catalog-lib";

/** รูปเท่านั้น (ต่างจาก attachments ที่รับ PDF ด้วย — อันนี้ลงเอกสารที่พิมพ์จริง) */
const ALLOWED_MIME = new Set(["image/jpeg", "image/png", "image/webp", "image/heic", "image/heif"]);
const MAX_FILE_BYTES = 5 * 1024 * 1024; // 5MB
const SIGNED_URL_TTL = 300; // ≤300s (A-B1)
const MAX_BATCH = 300;

const ITEM_TABLE = "gov_procure_catalog_items";
const PRODUCT_TABLE = "gov_procure_products";

export async function GET(req: NextRequest) {
  const orgId = orgIdFromQuery(req);
  if (!orgId) return govError("missing orgId");

  const auth = await requireGovProcureMember(req, orgId);
  if (!auth.ok) return auth.res;

  const sp = req.nextUrl.searchParams;
  // ⛔ A-B1 — ไม่มีทางไหนที่ client ระบุ path ได้ (server resolve จาก id เท่านั้น)
  if (sp.has("path")) return govError("ไม่รองรับการระบุ path ของไฟล์", 400);

  const itemId = sp.get("itemId");
  const productId = sp.get("productId");
  const itemIds = (sp.get("itemIds") ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean)
    .slice(0, MAX_BATCH);

  const admin = createAdminClient();

  try {
    const table = productId ? PRODUCT_TABLE : ITEM_TABLE;
    const ids = productId ? [productId] : itemId ? [itemId] : itemIds;
    if (ids.length === 0) return govError("กรุณาระบุ itemId / productId / itemIds");

    // batch = คิวรีเดียว + กรอง org_id ในคิวรีเดียวกัน (security-reviewer flag)
    const { data, error } = await admin
      .from(table)
      .select("id, image_path")
      .eq("org_id", orgId)
      .in("id", ids);

    if (error) return govError(error.message, 500);

    const rows = (data ?? []) as { id: string; image_path: string | null }[];
    const withPath = rows.filter((r) => pathBelongsToOrg(r.image_path, orgId));

    const urls: Record<string, string> = {};
    if (withPath.length > 0) {
      const { data: signed, error: signErr } = await admin.storage
        .from(CATALOG_BUCKET)
        .createSignedUrls(
          withPath.map((r) => r.image_path as string),
          SIGNED_URL_TTL,
        );
      if (signErr) return govError(signErr.message, 500);
      (signed ?? []).forEach((s, idx) => {
        const row = withPath[idx];
        if (s?.signedUrl && row) urls[row.id] = s.signedUrl;
      });
    }

    return NextResponse.json({ urls, expiresIn: SIGNED_URL_TTL });
  } catch (e) {
    return govError((e as Error).message, 500);
  }
}

/** POST FormData: `file` + (`catalogId`+`itemId`) หรือ `productId` */
export async function POST(req: NextRequest) {
  const orgId = orgIdFromQuery(req);
  if (!orgId) return govError("missing orgId");

  const auth = await requireGovProcureMember(req, orgId);
  if (!auth.ok) return auth.res;
  if (!canWrite(auth.role)) return govError("ไม่มีสิทธิ์อัปโหลดรูป", 403);

  const form = await req.formData().catch(() => null);
  if (!form) return govError("payload ต้องเป็น multipart/form-data");

  const itemId = String(form.get("itemId") ?? "");
  const catalogId = String(form.get("catalogId") ?? "");
  const productId = String(form.get("productId") ?? "");
  const file = form.get("file");

  if (!itemId && !productId) return govError("กรุณาระบุ itemId หรือ productId");
  if (itemId && !catalogId) return govError("กรุณาระบุ catalogId ของรายการ");
  if (!(file instanceof File)) return govError("กรุณาแนบไฟล์รูป");
  if (!ALLOWED_MIME.has(file.type)) {
    return govError("รองรับเฉพาะไฟล์รูปภาพ (JPEG/PNG/WebP/HEIC)");
  }
  if (file.size > MAX_FILE_BYTES) {
    return govError("ไฟล์ใหญ่เกิน 5MB — กรุณาลดขนาดรูปก่อนอัปโหลด");
  }

  const admin = createAdminClient();

  try {
    // IDOR guard — เป้าหมายต้องอยู่ใน org นี้ (กรอง org_id ในคิวรีเดียวกัน)
    const table = productId ? PRODUCT_TABLE : ITEM_TABLE;
    let ownerQ = admin
      .from(table)
      .select("id, image_path")
      .eq("id", productId || itemId)
      .eq("org_id", orgId);
    if (!productId) ownerQ = ownerQ.eq("catalog_id", catalogId);

    const { data: owner, error: ownerErr } = await ownerQ.maybeSingle();
    if (ownerErr) return govError(ownerErr.message, 500);
    if (!owner) return govError(productId ? "ไม่พบสินค้าในคลัง" : "ไม่พบรายการนี้", 404);

    const oldPath = (owner as { image_path: string | null }).image_path;

    await setAuditContext(req, auth.userId, orgId);

    // path สร้างฝั่ง server เสมอ (client ส่งมาไม่ได้ — A-B2/C-1)
    const filePath = productId
      ? buildProductImagePath(orgId, productId, file.name)
      : buildCatalogImagePath(orgId, catalogId, file.name);

    const bytes = new Uint8Array(await file.arrayBuffer());
    const { error: upErr } = await admin.storage.from(CATALOG_BUCKET).upload(filePath, bytes, {
      contentType: file.type || "application/octet-stream",
      upsert: false,
    });
    if (upErr) return govError(`อัปโหลดไฟล์ไม่สำเร็จ: ${upErr.message}`, 500);

    const { data, error } = await admin
      .from(table)
      .update({ image_path: filePath })
      .eq("id", productId || itemId)
      .eq("org_id", orgId)
      .select("*")
      .maybeSingle();

    if (error || !data) {
      // rollback ไฟล์ที่เพิ่งอัปเมื่อเขียน DB ไม่สำเร็จ
      await removeStorageFiles(admin, [filePath], orgId);
      return govError(error?.message ?? "บันทึกรูปไม่สำเร็จ", 500);
    }

    // ไฟล์เดิมไม่มีใครอ้างแล้ว → เก็บกวาด (best-effort)
    if (oldPath && oldPath !== filePath) await removeStorageFiles(admin, [oldPath], orgId);

    return NextResponse.json({ row: data, path: filePath }, { status: 201 });
  } catch (e) {
    return govError((e as Error).message, 500);
  }
}

export async function DELETE(req: NextRequest) {
  const orgId = orgIdFromQuery(req);
  if (!orgId) return govError("missing orgId");

  const auth = await requireGovProcureMember(req, orgId);
  if (!auth.ok) return auth.res;
  if (!canWrite(auth.role)) return govError("ไม่มีสิทธิ์ลบรูป", 403);

  const sp = req.nextUrl.searchParams;
  if (sp.has("path")) return govError("ไม่รองรับการระบุ path ของไฟล์", 400);

  const itemId = sp.get("itemId");
  const productId = sp.get("productId");
  if (!itemId && !productId) return govError("กรุณาระบุ itemId หรือ productId");

  const admin = createAdminClient();

  try {
    const table = productId ? PRODUCT_TABLE : ITEM_TABLE;
    const { data: owner, error: ownerErr } = await admin
      .from(table)
      .select("id, image_path")
      .eq("id", productId || itemId)
      .eq("org_id", orgId)
      .maybeSingle();

    if (ownerErr) return govError(ownerErr.message, 500);
    if (!owner) return govError("ไม่พบข้อมูล", 404);

    await setAuditContext(req, auth.userId, orgId);

    const { error } = await admin
      .from(table)
      .update({ image_path: null })
      .eq("id", productId || itemId)
      .eq("org_id", orgId);

    if (error) return govError(error.message, 500);

    await removeStorageFiles(admin, [(owner as { image_path: string | null }).image_path], orgId);
    return NextResponse.json({ ok: true });
  } catch (e) {
    return govError((e as Error).message, 500);
  }
}
