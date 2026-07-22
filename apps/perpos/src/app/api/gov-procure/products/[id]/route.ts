// PATCH  /api/gov-procure/products/[id]?orgId= → แก้สินค้าในคลัง (canWrite)
// DELETE /api/gov-procure/products/[id]?orgId= → ลบสินค้าในคลัง + ไฟล์ (canDelete — C-B3)
//
// contract: §5.9 A-B2 (allowlist · `image_path` เขียนจาก /catalog-images เท่านั้น) · A-10 (ลบไฟล์)

import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "../../../_lib/supabase";
import { setAuditContext } from "../../../_lib/audit";
import { requireGovProcureMember, canWrite, canDelete, orgIdFromQuery, govError } from "../../_lib";
import { removeStoragePrefix } from "../../_catalog-lib";
import type { CatalogProduct } from "@/lib/gov-procure/catalog";

type Ctx = { params: Promise<{ id: string }> };

/**
 * ฟิลด์ที่แก้ได้จาก UI คลังสินค้า — `name_key` เป็น GENERATED, `image_path`/`times_used`/
 * `price_updated_*` เป็น server-set (ห้ามรับจาก body)
 */
const PRODUCT_WRITABLE_FIELDS = [
  "name",
  "brand_model",
  "spec_line",
  "size_line",
  "bullets",
  "care_notes",
  "caution_notes",
  "sub_items",
  "category",
  "default_unit",
  "last_unit_price",
] as const;

const ARRAY_FIELDS = new Set(["bullets", "care_notes", "caution_notes"]);

function toStringArray(v: unknown): string[] {
  if (!Array.isArray(v)) return [];
  return v.map((x) => String(x ?? "").trim()).filter((s) => s.length > 0);
}

function toSubItems(v: unknown): { name: string; qty: number | null; unit: string | null }[] {
  if (!Array.isArray(v)) return [];
  return v
    .map((raw) => {
      const o = (raw ?? {}) as Record<string, unknown>;
      const name = String(o.name ?? "").trim();
      if (!name) return null;
      const qty = Number(o.qty);
      const unit = String(o.unit ?? "").trim();
      return { name, qty: Number.isFinite(qty) ? qty : null, unit: unit || null };
    })
    .filter((x): x is { name: string; qty: number | null; unit: string | null } => x !== null);
}

export async function PATCH(req: NextRequest, ctx: Ctx) {
  const { id } = await ctx.params;
  const orgId = orgIdFromQuery(req);
  if (!orgId) return govError("missing orgId");

  const auth = await requireGovProcureMember(req, orgId);
  if (!auth.ok) return auth.res;
  if (!canWrite(auth.role)) return govError("ไม่มีสิทธิ์แก้ไขคลังสินค้า", 403);

  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const admin = createAdminClient();

  try {
    const { data: existing } = await admin
      .from("gov_procure_products")
      .select("id, last_unit_price")
      .eq("id", id)
      .eq("org_id", orgId)
      .maybeSingle();
    if (!existing) return govError("ไม่พบสินค้าในคลัง", 404);

    const patch: Record<string, unknown> = {};
    for (const key of PRODUCT_WRITABLE_FIELDS) {
      if (!(key in body)) continue;
      const v = body[key];
      if (ARRAY_FIELDS.has(key)) patch[key] = toStringArray(v);
      else if (key === "sub_items") patch.sub_items = toSubItems(v);
      else if (key === "last_unit_price") {
        const n = Number(v);
        patch.last_unit_price = v === "" || v === null || !Number.isFinite(n) ? null : n;
      } else patch[key] = v === "" ? null : v;
    }

    if ("name" in patch && !String(patch.name ?? "").trim()) {
      return govError("กรุณาระบุชื่อสินค้า");
    }
    if (Object.keys(patch).length === 0) return govError("ไม่มีข้อมูลที่ต้องแก้ไข");

    // ราคาที่คนแก้เองในคลัง = ต้องรู้ว่าใครแก้ (ท่าเดียวกับ price_updated_* ของรายการ)
    const prev = (existing as { last_unit_price: number | null }).last_unit_price;
    if ("last_unit_price" in patch && Number(patch.last_unit_price) !== Number(prev)) {
      patch.price_updated_by = auth.userId;
      patch.price_updated_at = new Date().toISOString();
    }

    await setAuditContext(req, auth.userId, orgId);

    const { data, error } = await admin
      .from("gov_procure_products")
      .update(patch)
      .eq("id", id)
      .eq("org_id", orgId)
      .select("*")
      .maybeSingle();

    if (error) {
      if (error.code === "23505") return govError("มีสินค้าชื่อนี้ในคลังแล้ว", 409);
      return govError(error.message, 500);
    }
    if (!data) return govError("ไม่พบสินค้าในคลัง", 404);

    return NextResponse.json({ product: data as CatalogProduct });
  } catch (e) {
    return govError((e as Error).message, 500);
  }
}

export async function DELETE(req: NextRequest, ctx: Ctx) {
  const { id } = await ctx.params;
  const orgId = orgIdFromQuery(req);
  if (!orgId) return govError("missing orgId");

  const auth = await requireGovProcureMember(req, orgId);
  if (!auth.ok) return auth.res;
  if (!canDelete(auth.role)) {
    return govError("ไม่มีสิทธิ์ลบสินค้าในคลัง (เฉพาะเจ้าของ/ผู้จัดการ)", 403);
  }

  const admin = createAdminClient();

  const { data: existing } = await admin
    .from("gov_procure_products")
    .select("id")
    .eq("id", id)
    .eq("org_id", orgId)
    .maybeSingle();
  if (!existing) return govError("ไม่พบสินค้าในคลัง", 404);

  await setAuditContext(req, auth.userId, orgId);

  const { error } = await admin
    .from("gov_procure_products")
    .delete()
    .eq("id", id)
    .eq("org_id", orgId);

  if (error) return govError(error.message, 500);

  // A-10 — ลบไฟล์หลังลบแถวสำเร็จ (รายการที่เคยอ้างจะถูก set null ที่ DB)
  await removeStoragePrefix(admin, `${orgId}/products/${id}`, orgId);

  return NextResponse.json({ ok: true });
}
