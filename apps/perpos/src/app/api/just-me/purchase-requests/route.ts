/**
 * /api/just-me/purchase-requests — ใบขอซื้อ (PR)
 * ทุก method ต้องมี **cost-access** (owner/manager) — viewer เข้าไม่ได้เลย (403)
 * GET  = list + filter (โครงการ/สถานะ/คำค้น) + แบ่งหน้า
 * POST = สร้างใบใหม่ · สร้างจาก BOQ ได้ (`from_boq_items`) → บรรทัดผูก `boq_item_id` กลับ
 *
 * ⛔ ยอดหัวใบ/เลขที่ใบ ระบบออกให้เอง — ห้ามรับจาก body
 */

import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "../../_lib/supabase";
import {
  assertOrgRefs,
  auditMutation,
  guard,
  insertWithGeneratedCode,
  jmError,
  pickFields,
} from "../_lib";
import {
  applyPrItems,
  listPurchaseRequests,
  sumPrQtyByBoqItem,
  type PrItemInput,
} from "@/lib/just-me/purchasing";
import type { PurchaseRequestStatus } from "@/lib/just-me/types";

const EDITABLE = ["project_id", "boq_id", "warehouse_id", "needed_date", "note"] as const;

export async function GET(req: NextRequest) {
  const g = await guard(req, { cost: true });
  if (!g.ok) return g.res;

  const sp = req.nextUrl.searchParams;
  const status = sp.getAll("status").filter(Boolean) as PurchaseRequestStatus[];
  try {
    const page = await listPurchaseRequests(createAdminClient(), g.orgId, {
      projectId: sp.get("projectId") ?? undefined,
      status: status.length > 0 ? status : undefined,
      q: sp.get("q") ?? undefined,
      limit: Number(sp.get("limit")) || undefined,
      offset: Number(sp.get("offset")) || undefined,
    });
    return NextResponse.json({ ...page, role: g.auth.role });
  } catch (e) {
    return jmError(e instanceof Error ? e.message : "โหลดรายการใบขอซื้อไม่สำเร็จ", 500);
  }
}

export async function POST(req: NextRequest) {
  const g = await guard(req, { write: true, cost: true });
  if (!g.ok) return g.res;

  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const payload = pickFields(body, EDITABLE);

  const refErr = await assertOrgRefs(g.orgId, [
    { value: payload.project_id, table: "just_me_projects", label: "โครงการ" },
    { value: payload.boq_id, table: "just_me_boqs", label: "BOQ" },
    { value: payload.warehouse_id, table: "just_me_warehouses", label: "คลังปลายทาง" },
  ]);
  if (refErr) return jmError(refErr, 400);

  const admin = createAdminClient();
  const inputs = await resolveItemInputs(admin, g.orgId, body);
  if ("error" in inputs) return jmError(inputs.error, 400);

  await auditMutation(req, g.auth);
  const created = await insertWithGeneratedCode<Record<string, unknown>>(
    { orgId: g.orgId, table: "just_me_purchase_requests", column: "pr_code", prefix: "PR" },
    async (code) => {
      const { data, error } = await admin
        .from("just_me_purchase_requests")
        .insert({
          ...payload,
          org_id: g.orgId,
          pr_code: code,
          status: "draft",
          created_by: g.auth.userId,
        })
        .select("*")
        .single();
      return { data: data as Record<string, unknown> | null, error };
    },
  );
  if (!created.ok) return jmError(created.error, created.status);

  const pr = created.data as unknown as Parameters<typeof applyPrItems>[1]["pr"];
  if (inputs.rows.length > 0) {
    const res = await applyPrItems(admin, {
      orgId: g.orgId,
      pr,
      inputs: inputs.rows,
      userId: g.auth.userId,
      isOwner: g.auth.role === "owner",
      overBudgetReason:
        typeof body.over_budget_reason === "string" ? body.over_budget_reason : null,
    });
    if (!res.ok) {
      // ใบที่ยังไม่มีบรรทัดและสร้างไม่สำเร็จ → เก็บกวาดทิ้ง ไม่ปล่อยใบเปล่าค้างในทะเบียน
      await admin.from("just_me_purchase_requests").delete().eq("org_id", g.orgId).eq("id", pr.id);
      return jmError(res.error, res.status);
    }
  }

  const { data: fresh } = await admin
    .from("just_me_purchase_requests")
    .select("*")
    .eq("org_id", g.orgId)
    .eq("id", pr.id)
    .maybeSingle();

  return NextResponse.json({ pr: fresh ?? pr }, { status: 201 });
}

/**
 * บรรทัดของใบใหม่ — รับได้ 2 ทาง
 *  1. `items[]` (กรอกเอง)
 *  2. `from_boq_items[]` = `[{ boq_item_id, qty? }]` → เติมชื่อ/หน่วย/ราคาประเมินจาก BOQ ให้เอง
 *     (ไม่ระบุ qty → ใช้ยอดคงเหลือที่ยังไม่ได้สั่งของบรรทัดนั้น)
 */
async function resolveItemInputs(
  admin: ReturnType<typeof createAdminClient>,
  orgId: string,
  body: Record<string, unknown>,
): Promise<{ rows: PrItemInput[] } | { error: string }> {
  if (Array.isArray(body.items)) {
    return { rows: body.items as PrItemInput[] };
  }
  if (!Array.isArray(body.from_boq_items) || body.from_boq_items.length === 0) {
    return { rows: [] };
  }

  const picks = body.from_boq_items as { boq_item_id?: string; qty?: number | string }[];
  const ids = Array.from(
    new Set(picks.map((p) => p.boq_item_id).filter((v): v is string => typeof v === "string")),
  );
  if (ids.length === 0) return { error: "ไม่ได้เลือกรายการจาก BOQ" };

  const [{ data, error }, ordered] = await Promise.all([
    admin
      .from("just_me_boq_items")
      .select("id, name, unit, qty, item_id, material_unit_cost, sort_order")
      .eq("org_id", orgId)
      .in("id", ids),
    sumPrQtyByBoqItem(admin, orgId, ids),
  ]);
  if (error) return { error: error.message };

  const boqItems = new Map(
    (
      (data ?? []) as {
        id: string;
        name: string;
        unit: string;
        qty: number;
        item_id: string | null;
        material_unit_cost: number | null;
        sort_order: number | null;
      }[]
    ).map((b) => [b.id, b]),
  );
  if (boqItems.size !== ids.length) return { error: "มีรายการ BOQ ที่ไม่อยู่ในองค์กรนี้" };

  const rows: PrItemInput[] = [];
  for (const pick of picks) {
    const b = pick.boq_item_id ? boqItems.get(pick.boq_item_id) : undefined;
    if (!b) continue;
    const remaining = b.qty - (ordered.get(b.id) ?? 0);
    const qty =
      pick.qty === undefined || pick.qty === null || pick.qty === "" ? remaining : pick.qty;
    if (Number(qty) <= 0) {
      return {
        error: `รายการ "${b.name}" สั่งซื้อครบตาม BOQ แล้ว — ระบุจำนวนเองถ้าต้องการสั่งเพิ่ม`,
      };
    }
    rows.push({
      boq_item_id: b.id,
      item_id: b.item_id,
      name: b.name,
      unit: b.unit,
      qty,
      estimated_unit_cost: b.material_unit_cost,
      sort_order: b.sort_order ?? 0,
    });
  }
  if (rows.length === 0) return { error: "ไม่มีรายการที่จะสั่งซื้อ" };
  return { rows };
}
