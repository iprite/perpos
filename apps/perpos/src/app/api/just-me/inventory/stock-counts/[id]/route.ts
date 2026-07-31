/**
 * /api/just-me/inventory/stock-counts/[id] — ใบตรวจนับหนึ่งใบ
 *   GET   รายละเอียด (บรรทัด + ยอดตามระบบ + ผลต่าง + สรุปมูลค่า)
 *   PATCH `action`:
 *     · `save`     บันทึกยอดนับจริง/เหตุผลรายบรรทัด (เฉพาะใบ draft)
 *     · `add_item` เพิ่มวัสดุที่ยอดระบบ 0 แต่เจอของจริงที่ไซต์
 *     · `post`     ลงบัญชีปรับยอด — สร้างความเคลื่อนไหวชดเชยผลต่างผ่าน RPC เดียวกับหน้าคลัง
 *     · `cancel`   ยกเลิกใบ
 *
 * ⛔ ใบที่ `posted` แล้วแก้ไม่ได้ (trigger ที่ DB เป็นด่านจริง — route ตอบข้อความไทยก่อนชน)
 * ⛔ ปรับยอดต้องเดินผ่าน `postStockMovement()` เท่านั้น (ห้าม update ยอดคงเหลือตรง ๆ)
 * ⛔ ผลต่าง ≠ 0 ต้องมีเหตุผล — ด่านอยู่ที่ `buildAdjustments()`
 */

import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "../../../../_lib/supabase";
import { assertOrgRefs, auditMutation, guard, jmError } from "../../../_lib";
import {
  buildAdjustments,
  getStockCount,
  listStockCountItems,
  loadAvgCosts,
  summarizeStockCount,
  type JustMeStockCountItem,
} from "@/lib/just-me/stock-count";
import { postStockMovement } from "@/lib/just-me/stock-movements";

type Ctx = { params: Promise<{ id: string }> };

interface ItemInfo {
  id: string;
  name: string;
  unit: string;
}

async function loadItems(orgId: string, itemIds: string[]): Promise<Map<string, ItemInfo>> {
  if (itemIds.length === 0) return new Map();
  const { data } = await createAdminClient()
    .from("just_me_inventory_items")
    .select("id, name, unit")
    .eq("org_id", orgId)
    .in("id", itemIds);
  return new Map(((data ?? []) as ItemInfo[]).map((i) => [i.id, i]));
}

export async function GET(req: NextRequest, ctx: Ctx) {
  const { id } = await ctx.params;
  const g = await guard(req, { cost: true, write: true });
  if (!g.ok) return g.res;

  const admin = createAdminClient();
  const count = await getStockCount(admin, g.orgId, id);
  if (!count) return jmError("ไม่พบใบตรวจนับนี้", 404);

  const lines = await listStockCountItems(admin, g.orgId, [id]);
  const [items, avgCosts] = await Promise.all([
    loadItems(
      g.orgId,
      lines.map((l) => l.item_id),
    ),
    loadAvgCosts(admin, g.orgId),
  ]);

  return NextResponse.json({
    count,
    lines: lines
      .map((l) => ({
        ...l,
        item_name: items.get(l.item_id)?.name ?? "ไม่พบชื่อวัสดุ",
        unit: items.get(l.item_id)?.unit ?? "",
        avg_cost: avgCosts.get(l.item_id) ?? null,
      }))
      .sort((a, b) => a.item_name.localeCompare(b.item_name, "th")),
    summary: summarizeStockCount(lines, avgCosts),
  });
}

export async function PATCH(req: NextRequest, ctx: Ctx) {
  const { id } = await ctx.params;
  const g = await guard(req, { cost: true, write: true });
  if (!g.ok) return g.res;

  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const action = typeof body.action === "string" ? body.action : "save";

  const admin = createAdminClient();
  const count = await getStockCount(admin, g.orgId, id);
  if (!count) return jmError("ไม่พบใบตรวจนับนี้", 404);
  if (count.status === "posted") {
    return jmError("ใบตรวจนับนี้ลงบัญชีแล้ว แก้ไขไม่ได้ — ถ้ายอดยังไม่ตรงให้เปิดใบนับใหม่", 409);
  }
  if (count.status === "cancelled") {
    return jmError("ใบตรวจนับนี้ถูกยกเลิกแล้ว", 409);
  }

  await auditMutation(req, g.auth);

  if (action === "cancel") {
    const { error } = await admin
      .from("just_me_stock_counts")
      .update({ status: "cancelled" })
      .eq("org_id", g.orgId)
      .eq("id", id);
    if (error) return jmError("ยกเลิกใบตรวจนับไม่สำเร็จ", 500);
    return NextResponse.json({ ok: true, status: "cancelled" });
  }

  if (action === "add_item") {
    const itemId = typeof body.itemId === "string" ? body.itemId : "";
    if (!itemId) return jmError("กรุณาเลือกวัสดุที่จะเพิ่มเข้าใบนับ", 400);
    const refErr = await assertOrgRefs(g.orgId, [
      { value: itemId, table: "just_me_inventory_items", label: "วัสดุ" },
    ]);
    if (refErr) return jmError(refErr, 400);

    // ยอดตามระบบของวัสดุที่เพิ่งเพิ่ม = ยอดจริงในคลังตอนนี้ (ปกติ 0 — เจอของที่ระบบไม่รู้จัก)
    const { data: bal } = await admin
      .from("just_me_stock_balances")
      .select("quantity")
      .eq("org_id", g.orgId)
      .eq("warehouse_id", count.warehouse_id)
      .eq("item_id", itemId)
      .maybeSingle();

    const { data, error } = await admin
      .from("just_me_stock_count_items")
      .insert({
        org_id: g.orgId,
        count_id: id,
        item_id: itemId,
        system_qty: Number((bal as { quantity: number } | null)?.quantity ?? 0),
      })
      .select("*")
      .single();
    if (error) {
      return jmError(
        error.code === "23505" ? "วัสดุนี้อยู่ในใบนับแล้ว" : "เพิ่มวัสดุเข้าใบนับไม่สำเร็จ",
        error.code === "23505" ? 409 : 500,
      );
    }
    return NextResponse.json({ line: data }, { status: 201 });
  }

  if (action === "save") {
    const inputs = Array.isArray(body.lines) ? (body.lines as Record<string, unknown>[]) : [];
    if (inputs.length === 0) return jmError("ไม่มีรายการที่จะบันทึก", 400);

    const existing = await listStockCountItems(admin, g.orgId, [id]);
    const byId = new Map(existing.map((l) => [l.id, l]));

    for (const input of inputs) {
      const lineId = typeof input.id === "string" ? input.id : "";
      const line = byId.get(lineId);
      if (!line) return jmError("มีบรรทัดที่ไม่อยู่ในใบตรวจนับนี้", 400);

      const raw = input.counted_qty;
      let counted: number | null = null;
      if (raw !== null && raw !== undefined && raw !== "") {
        counted = Number(raw);
        if (!Number.isFinite(counted) || counted < 0) {
          return jmError("ยอดนับจริงต้องเป็นตัวเลขไม่ติดลบ", 400);
        }
      }
      const note = typeof input.note === "string" ? input.note.trim() : "";

      const { error } = await admin
        .from("just_me_stock_count_items")
        .update({ counted_qty: counted, note: note || null })
        .eq("org_id", g.orgId)
        .eq("id", lineId);
      if (error) return jmError("บันทึกยอดนับไม่สำเร็จ กรุณาลองใหม่อีกครั้ง", 500);
    }

    const after = await listStockCountItems(admin, g.orgId, [id]);
    const avgCosts = await loadAvgCosts(admin, g.orgId);
    return NextResponse.json({ ok: true, summary: summarizeStockCount(after, avgCosts) });
  }

  if (action === "post") {
    const lines: JustMeStockCountItem[] = await listStockCountItems(admin, g.orgId, [id]);
    const items = await loadItems(
      g.orgId,
      lines.map((l) => l.item_id),
    );
    const built = buildAdjustments(lines, (itemId) => items.get(itemId)?.name ?? "ไม่พบชื่อวัสดุ");
    if (!built.ok) return jmError(built.error, 400);

    // ทุกบรรทัดต้องผ่าน — บรรทัดไหนพลาด = ไม่ปิดใบ และบอกว่าบรรทัดไหน (ยิงซ้ำได้ token กันซ้ำให้)
    const posted: string[] = [];
    for (const adj of built.adjustments) {
      const name = items.get(adj.itemId)?.name ?? "วัสดุ";
      const res = await postStockMovement(admin, {
        orgId: g.orgId,
        itemId: adj.itemId,
        type: adj.type,
        qty: adj.qty,
        sourceWarehouseId: adj.type === "issue" ? count.warehouse_id : null,
        destinationWarehouseId: adj.type === "receive" ? count.warehouse_id : null,
        referenceNo: count.count_code,
        note: `ปรับยอดจากการตรวจนับ ${count.count_code}`,
        createdBy: g.auth.userId,
        clientToken: `sc:${count.id}:${adj.lineId}`,
        adjustmentReason: adj.reason,
        stockCountId: count.id,
      });
      if (!res.ok) {
        return NextResponse.json(
          {
            error: `ปรับยอด "${name}" ไม่สำเร็จ: ${res.error} — ใบยังไม่ถูกปิด แก้แล้วกดลงบัญชีใหม่ได้ (รายการที่สำเร็จแล้วจะไม่ถูกบันทึกซ้ำ)`,
            posted_movements: posted.length,
          },
          { status: res.status },
        );
      }
      posted.push(res.movementId);
    }

    const { error } = await admin
      .from("just_me_stock_counts")
      .update({
        status: "posted",
        posted_at: new Date().toISOString(),
        posted_by: g.auth.userId,
      })
      .eq("org_id", g.orgId)
      .eq("id", id);
    if (error) {
      return jmError(
        "ปรับยอดสำเร็จแล้ว แต่ปิดใบไม่สำเร็จ — กดลงบัญชีอีกครั้งเพื่อปิดใบ (ยอดจะไม่ถูกปรับซ้ำ)",
        500,
      );
    }

    return NextResponse.json({
      ok: true,
      status: "posted",
      adjusted_lines: built.adjustments.length,
      movement_ids: posted,
    });
  }

  return jmError("คำสั่งไม่ถูกต้อง", 400);
}
