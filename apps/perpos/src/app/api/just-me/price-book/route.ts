/**
 * /api/just-me/price-book — ราคามาตรฐาน (ต้นทุนวัสดุ/ค่าแรง/overhead + margin)
 * ทุก method ต้องมี **cost-access** (owner/manager) — viewer เข้าไม่ได้เลย (403)
 * GET    = list พร้อมต้นทุนที่ใช้จริง + ราคาขายที่ระบบเสนอ + สัญญาณราคาซื้อขยับ
 * POST   = เพิ่มรายการ
 * PATCH  = แก้รายการ · `action:"ack-baseline"` = รับทราบราคาใหม่ (ตั้งฐานเทียบใหม่)
 * DELETE = `?id=` → ปิดใช้งาน (soft) เพื่อไม่ให้ BOQ เก่าที่อ้างถึงเสียประวัติ
 */

import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "../../_lib/supabase";
import { assertOrgRefs, auditMutation, guard, jmError, numOrNull, pickFields } from "../_lib";
import {
  computePriceBookRow,
  getPriceBookRow,
  getSettings,
  listPriceBook,
  listWorkCategories,
  loadAvgCosts,
} from "@/lib/just-me/price-book";
import { effectiveMaterialCost } from "@/lib/just-me/project-metrics";

const EDITABLE = [
  "item_id",
  "category_id",
  "name",
  "unit",
  "material_cost_mode",
  "material_unit_cost_manual",
  "labor_unit_cost",
  "overhead_unit_cost",
  "margin_pct",
  "cost_alert_pct",
  "is_active",
] as const;

const NUMERIC = [
  "material_unit_cost_manual",
  "labor_unit_cost",
  "overhead_unit_cost",
  "margin_pct",
  "cost_alert_pct",
] as const;

export async function GET(req: NextRequest) {
  const g = await guard(req, { cost: true });
  if (!g.ok) return g.res;

  const sp = req.nextUrl.searchParams;
  try {
    const admin = createAdminClient();
    const [rows, categories, settings] = await Promise.all([
      listPriceBook(admin, g.orgId, {
        includeInactive: sp.get("includeInactive") === "1",
        categoryId: sp.get("categoryId") ?? undefined,
        q: sp.get("q") ?? undefined,
      }),
      listWorkCategories(admin, g.orgId, { includeInactive: true }),
      getSettings(admin, g.orgId),
    ]);
    return NextResponse.json({ rows, categories, settings, total: rows.length });
  } catch (e) {
    return jmError(e instanceof Error ? e.message : "โหลดราคามาตรฐานไม่สำเร็จ", 500);
  }
}

export async function POST(req: NextRequest) {
  const g = await guard(req, { write: true, cost: true });
  if (!g.ok) return g.res;

  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const payload = pickFields(body, EDITABLE);

  const invalid = normalize(payload);
  if (invalid) return jmError(invalid, 400);
  if (!payload.name) return jmError("กรุณาระบุชื่อรายการ", 400);
  if (!payload.unit) return jmError("กรุณาระบุหน่วยนับ", 400);

  const refErr = await assertOrgRefs(g.orgId, [
    { value: payload.item_id, table: "just_me_inventory_items", label: "วัสดุในคลัง" },
    { value: payload.category_id, table: "just_me_work_categories", label: "หมวดงาน" },
  ]);
  if (refErr) return jmError(refErr, 400);

  await auditMutation(req, g.auth);
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("just_me_price_book")
    .insert({ ...payload, org_id: g.orgId, created_by: g.auth.userId })
    .select("*")
    .single();
  if (error) return jmError(error.message, 500);

  return NextResponse.json(
    { row: await withComputed(g.orgId, data), created: true },
    { status: 201 },
  );
}

export async function PATCH(req: NextRequest) {
  const g = await guard(req, { write: true, cost: true });
  if (!g.ok) return g.res;

  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const id = typeof body.id === "string" ? body.id : req.nextUrl.searchParams.get("id");
  if (!id) return jmError("ไม่ได้ระบุรายการที่จะแก้", 400);

  const admin = createAdminClient();
  const existing = await getPriceBookRow(admin, g.orgId, id);
  if (!existing) return jmError("ไม่พบรายการราคานี้", 404);

  // รับทราบราคาใหม่ → ตั้งฐานเทียบเป็นต้นทุนวัสดุที่ใช้จริงตอนนี้
  if (body.action === "ack-baseline") {
    const avg = await loadAvgCosts(admin, g.orgId, [existing.item_id]);
    const material = effectiveMaterialCost({
      material_cost_mode: existing.material_cost_mode,
      material_unit_cost_manual: existing.material_unit_cost_manual,
      avg_cost: existing.item_id ? (avg.get(existing.item_id) ?? null) : null,
    });
    if (material === null) {
      return jmError("ยังไม่มีต้นทุนวัสดุให้ตั้งเป็นฐานเทียบ (ยังไม่เคยซื้อเข้าคลัง)", 400);
    }
    await auditMutation(req, g.auth);
    const { data, error } = await admin
      .from("just_me_price_book")
      .update({ baseline_material_cost: material, baseline_at: new Date().toISOString() })
      .eq("org_id", g.orgId)
      .eq("id", id)
      .select("*")
      .single();
    if (error) return jmError(error.message, 500);
    return NextResponse.json({ row: await withComputed(g.orgId, data) });
  }

  const payload = pickFields(body, EDITABLE);
  const invalid = normalize(payload);
  if (invalid) return jmError(invalid, 400);
  if ("name" in payload && !payload.name) return jmError("กรุณาระบุชื่อรายการ", 400);
  if ("unit" in payload && !payload.unit) return jmError("กรุณาระบุหน่วยนับ", 400);
  if (Object.keys(payload).length === 0) return jmError("ไม่มีข้อมูลที่จะแก้ไข", 400);

  const refErr = await assertOrgRefs(g.orgId, [
    { value: payload.item_id, table: "just_me_inventory_items", label: "วัสดุในคลัง" },
    { value: payload.category_id, table: "just_me_work_categories", label: "หมวดงาน" },
  ]);
  if (refErr) return jmError(refErr, 400);

  await auditMutation(req, g.auth);
  const { data, error } = await admin
    .from("just_me_price_book")
    .update(payload)
    .eq("org_id", g.orgId)
    .eq("id", id)
    .select("*")
    .single();
  if (error) return jmError(error.message, 500);

  return NextResponse.json({ row: await withComputed(g.orgId, data) });
}

export async function DELETE(req: NextRequest) {
  const g = await guard(req, { write: true, cost: true });
  if (!g.ok) return g.res;

  const id = req.nextUrl.searchParams.get("id");
  if (!id) return jmError("ไม่ได้ระบุรายการที่จะลบ", 400);

  const admin = createAdminClient();
  const existing = await getPriceBookRow(admin, g.orgId, id);
  if (!existing) return jmError("ไม่พบรายการราคานี้", 404);

  await auditMutation(req, g.auth);
  // ปิดใช้งานแทนการลบจริง — บรรทัด BOQ เก่าอ้าง `price_book_id` อยู่ (ประวัติต้องอยู่ครบ)
  const { error } = await admin
    .from("just_me_price_book")
    .update({ is_active: false })
    .eq("org_id", g.orgId)
    .eq("id", id);
  if (error) return jmError(error.message, 500);

  return NextResponse.json({ ok: true, deactivated: true });
}

/** แปลงตัวเลข + ตรวจค่าที่ผิดแล้วทำให้ราคาเพี้ยน */
function normalize(payload: Record<string, unknown>): string | null {
  if ("name" in payload && typeof payload.name === "string") payload.name = payload.name.trim();
  if ("unit" in payload && typeof payload.unit === "string") payload.unit = payload.unit.trim();

  if ("material_cost_mode" in payload) {
    const mode = payload.material_cost_mode;
    if (mode !== "auto" && mode !== "manual") return "โหมดต้นทุนวัสดุต้องเป็น auto หรือ manual";
  }
  for (const key of NUMERIC) {
    if (!(key in payload)) continue;
    const v = numOrNull(payload[key]);
    if (v === undefined) return "ค่าตัวเลขที่กรอกไม่ถูกต้อง";
    if (v !== null && v < 0 && key !== "margin_pct") return "ต้นทุน/เกณฑ์เตือนติดลบไม่ได้";
    payload[key] = v;
  }
  if (payload.material_cost_mode === "manual" && payload.material_unit_cost_manual === null) {
    return "โหมดกำหนดเองต้องระบุต้นทุนวัสดุต่อหน่วย";
  }
  if ("labor_unit_cost" in payload && payload.labor_unit_cost === null) payload.labor_unit_cost = 0;
  if ("overhead_unit_cost" in payload && payload.overhead_unit_cost === null) {
    payload.overhead_unit_cost = 0;
  }
  return null;
}

/** คืนแถวที่คิดต้นทุน/ราคาขายให้แล้ว (หน้าจอใช้ค่าเดียวกับตอน list) */
async function withComputed(orgId: string, row: unknown) {
  const admin = createAdminClient();
  const parsed = row as Awaited<ReturnType<typeof getPriceBookRow>>;
  if (!parsed) return row;
  const [settings, categories, avg] = await Promise.all([
    getSettings(admin, orgId),
    listWorkCategories(admin, orgId, { includeInactive: true }),
    loadAvgCosts(admin, orgId, [parsed.item_id]),
  ]);
  const categoryMargin = categories.find((c) => c.id === parsed.category_id)?.default_margin_pct;
  return computePriceBookRow(parsed, {
    avgCost: parsed.item_id ? (avg.get(parsed.item_id) ?? null) : null,
    categoryMarginPct: categoryMargin ?? null,
    companyMarginPct: settings.default_margin_pct,
    companyAlertPct: settings.cost_alert_pct,
  });
}
