/**
 * Super admin: สมมติฐานต้นทุน (ราคาต่อหน่วย / อัตราแลกเปลี่ยน / margin / ต้นทุนคงที่)
 *
 *   PUT    /api/admin/usage  body { kind: 'settings', usdThbRate?, targetMargin? }
 *   PUT    /api/admin/usage  body { kind: 'price', key, unitCostUsd, isActive? }
 *   POST   /api/admin/usage  body { kind: 'fixed_cost', month, label, amountUsd, allocation, note? }
 *   DELETE /api/admin/usage?id=<fixed_cost_id>
 *
 * ⚠️ แก้ราคาที่นี่มีผลกับ event ที่เกิด "หลังจากนี้" เท่านั้น — ต้นทุนที่บันทึกไปแล้ว
 *    ถูก freeze ไว้ที่ราคาตอนนั้น (ไม่งั้นต้นทุนย้อนหลังจะขยับทุกครั้งที่ปรับสมมติฐาน)
 */

import { NextRequest } from "next/server";
import { requireAdmin } from "../../_lib/auth";
import { createAdminClient } from "../../_lib/supabase";
import { ok, Err } from "../../_lib/response";
import { logAdminAction } from "../../_lib/admin-audit";

const ALLOCATIONS = ["pro_rata", "per_org", "none"] as const;

export async function PUT(req: NextRequest) {
  const auth = await requireAdmin(req);
  if (!auth.ok) return auth.res;
  const body = await req.json().catch(() => null);
  const kind = String(body?.kind ?? "");
  const admin = createAdminClient();
  const now = new Date().toISOString();

  if (kind === "settings") {
    const patch: Record<string, unknown> = { updated_at: now, updated_by: auth.userId };
    if (body?.usdThbRate != null) {
      const rate = Number(body.usdThbRate);
      if (!Number.isFinite(rate) || rate <= 0) return Err.invalidFormat("usdThbRate", "ต้อง > 0");
      patch.usd_thb_rate = rate;
    }
    if (body?.targetMargin != null) {
      const margin = Number(body.targetMargin);
      if (!Number.isFinite(margin) || margin < 1)
        return Err.invalidFormat("targetMargin", "ต้อง ≥ 1 (1 = ขายเท่าทุน)");
      patch.target_margin = margin;
    }
    const { error } = await admin.from("usage_settings").update(patch).eq("id", true);
    if (error) return Err.dbError(error);
    await logAdminAction(req, auth.userId, {
      action: "usage.settings_set",
      targetType: "usage_settings",
      targetId: "singleton",
      metadata: patch,
    });
    return ok({ updated: true });
  }

  if (kind === "price") {
    const key = String(body?.key ?? "").trim();
    if (!key) return Err.missingField("key");
    const cost = Number(body?.unitCostUsd);
    if (!Number.isFinite(cost) || cost < 0) return Err.invalidFormat("unitCostUsd", "ต้อง ≥ 0");
    const patch: Record<string, unknown> = {
      unit_cost_usd: cost,
      updated_at: now,
      updated_by: auth.userId,
    };
    if (body?.isActive != null) patch.is_active = Boolean(body.isActive);
    const { error } = await admin.from("usage_prices").update(patch).eq("key", key);
    if (error) return Err.dbError(error);
    await logAdminAction(req, auth.userId, {
      action: "usage.price_set",
      targetType: "usage_price",
      targetId: key,
      metadata: { unitCostUsd: cost },
    });
    return ok({ key, unitCostUsd: cost });
  }

  return Err.invalidFormat("kind", "settings|price");
}

export async function POST(req: NextRequest) {
  const auth = await requireAdmin(req);
  if (!auth.ok) return auth.res;
  const body = await req.json().catch(() => null);
  if (String(body?.kind ?? "") !== "fixed_cost") return Err.invalidFormat("kind", "fixed_cost");

  const month = String(body?.month ?? "").slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(month))
    return Err.invalidFormat("month", "YYYY-MM-DD (วันที่ 1)");
  const label = String(body?.label ?? "").trim();
  if (!label) return Err.missingField("label");
  const amountUsd = Number(body?.amountUsd);
  if (!Number.isFinite(amountUsd) || amountUsd < 0)
    return Err.invalidFormat("amountUsd", "ต้อง ≥ 0");
  const allocation = String(body?.allocation ?? "pro_rata");
  if (!(ALLOCATIONS as readonly string[]).includes(allocation))
    return Err.invalidFormat("allocation", ALLOCATIONS.join("|"));

  const admin = createAdminClient();
  const { data, error } = await admin
    .from("usage_fixed_costs")
    .upsert(
      {
        month: `${month.slice(0, 7)}-01`,
        label,
        amount_usd: amountUsd,
        allocation,
        note: body?.note ? String(body.note) : null,
        created_by: auth.userId,
      },
      { onConflict: "month,label" },
    )
    .select("id")
    .single();
  if (error) return Err.dbError(error);

  await logAdminAction(req, auth.userId, {
    action: "usage.fixed_cost_set",
    targetType: "usage_fixed_cost",
    targetId: String(data?.id ?? label),
    metadata: { month, label, amountUsd, allocation },
  });
  return ok({ id: data?.id });
}

export async function DELETE(req: NextRequest) {
  const auth = await requireAdmin(req);
  if (!auth.ok) return auth.res;
  const id = req.nextUrl.searchParams.get("id") ?? "";
  if (!id) return Err.missingField("id");

  const admin = createAdminClient();
  const { error } = await admin.from("usage_fixed_costs").delete().eq("id", id);
  if (error) return Err.dbError(error);
  await logAdminAction(req, auth.userId, {
    action: "usage.fixed_cost_delete",
    targetType: "usage_fixed_cost",
    targetId: id,
  });
  return ok({ deleted: true });
}
