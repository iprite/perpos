/**
 * /api/just-me/inventory/stock-counts — ใบตรวจนับสต๊อกจริง (list / เปิดใบใหม่)
 *
 * ⛔ ทุกเส้นเป็นข้อมูลต้นทุน (มูลค่าผลต่าง) + แก้ยอดคลัง ⇒ `guard(req, { cost, write })`
 *    viewer (ผู้รับเหมาช่วง) เข้าไม่ได้เลย
 * ⛔ เปิดใบ = **freeze ยอดตามระบบ** ลง `system_qty` ที่ตอนเปิด — ห้ามคิดใหม่ตอนลงบัญชี
 */

import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "../../../_lib/supabase";
import { assertOrgRefs, auditMutation, guard, insertWithGeneratedCode, jmError } from "../../_lib";
import {
  listStockCounts,
  listStockCountItems,
  loadAvgCosts,
  snapshotWarehouseBalances,
  summarizeStockCount,
  type JustMeStockCount,
  type StockCountStatus,
} from "@/lib/just-me/stock-count";

export async function GET(req: NextRequest) {
  const g = await guard(req, { cost: true, write: true });
  if (!g.ok) return g.res;

  const sp = req.nextUrl.searchParams;
  const statusParam = sp.get("status");
  const page = await listStockCounts(createAdminClient(), g.orgId, {
    warehouseId: sp.get("warehouseId") ?? undefined,
    status: statusParam ? (statusParam as StockCountStatus) : undefined,
    limit: Number(sp.get("limit")) || undefined,
    offset: Number(sp.get("offset")) || undefined,
  });

  const admin = createAdminClient();
  const [lines, avgCosts] = await Promise.all([
    listStockCountItems(
      admin,
      g.orgId,
      page.rows.map((c) => c.id),
    ),
    loadAvgCosts(admin, g.orgId),
  ]);

  const byCount = new Map<string, typeof lines>();
  for (const line of lines) {
    const arr = byCount.get(line.count_id) ?? [];
    arr.push(line);
    byCount.set(line.count_id, arr);
  }

  return NextResponse.json({
    counts: page.rows.map((c) => ({
      ...c,
      summary: summarizeStockCount(byCount.get(c.id) ?? [], avgCosts),
    })),
    total: page.total,
    truncated: page.truncated,
  });
}

export async function POST(req: NextRequest) {
  const g = await guard(req, { cost: true, write: true });
  if (!g.ok) return g.res;

  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const warehouseId = typeof body.warehouseId === "string" ? body.warehouseId : "";
  if (!warehouseId) return jmError("กรุณาเลือกคลังที่จะตรวจนับ", 400);

  const extraItemIds = Array.isArray(body.extraItemIds)
    ? (body.extraItemIds as unknown[]).filter((v): v is string => typeof v === "string")
    : [];

  const refErr = await assertOrgRefs(g.orgId, [
    { value: warehouseId, table: "just_me_warehouses", label: "คลังที่ตรวจนับ" },
    ...extraItemIds.map((id) => ({
      value: id,
      table: "just_me_inventory_items",
      label: "วัสดุที่เพิ่มเข้าใบนับ",
    })),
  ]);
  if (refErr) return jmError(refErr, 400);

  const admin = createAdminClient();

  // เปิดใบซ้อนกันในคลังเดียวกัน = คนละคนกรอกคนละใบแล้วปรับยอดชนกัน
  const { count: openCount } = await admin
    .from("just_me_stock_counts")
    .select("id", { count: "exact", head: true })
    .eq("org_id", g.orgId)
    .eq("warehouse_id", warehouseId)
    .eq("status", "draft");
  if (openCount) {
    return jmError("คลังนี้มีใบตรวจนับที่ยังไม่ลงบัญชีอยู่แล้ว — ให้ทำใบเดิมให้จบก่อน", 409);
  }

  await auditMutation(req, g.auth);

  const created = await insertWithGeneratedCode<JustMeStockCount>(
    { orgId: g.orgId, table: "just_me_stock_counts", column: "count_code", prefix: "SC" },
    async (code) => {
      const { data, error } = await admin
        .from("just_me_stock_counts")
        .insert({
          org_id: g.orgId,
          warehouse_id: warehouseId,
          count_code: code,
          status: "draft",
          counted_date:
            typeof body.countedDate === "string" && body.countedDate ? body.countedDate : undefined,
          note: typeof body.note === "string" && body.note.trim() ? body.note.trim() : null,
          created_by: g.auth.userId,
        })
        .select("*")
        .single();
      return { data: data as JustMeStockCount | null, error };
    },
  );
  if (!created.ok) return jmError(created.error, created.status);

  // freeze ยอดตามระบบ ณ ตอนนี้ (+ วัสดุที่ยอดระบบ 0 แต่เจอของจริงที่ไซต์)
  const balances = await snapshotWarehouseBalances(admin, g.orgId, warehouseId);
  const rows = new Map<string, number>(balances.map((b) => [b.item_id, b.quantity]));
  for (const itemId of extraItemIds) if (!rows.has(itemId)) rows.set(itemId, 0);

  if (rows.size > 0) {
    const { error } = await admin.from("just_me_stock_count_items").insert(
      Array.from(rows.entries()).map(([itemId, qty]) => ({
        org_id: g.orgId,
        count_id: created.data.id,
        item_id: itemId,
        system_qty: qty,
      })),
    );
    if (error) {
      // ใบเปล่าใช้งานไม่ได้ → เก็บกวาดแล้วบอกให้ลองใหม่ (ใบ draft ลบได้)
      await admin.from("just_me_stock_counts").delete().eq("id", created.data.id);
      return jmError("บันทึกยอดตามระบบลงใบนับไม่สำเร็จ กรุณาลองใหม่อีกครั้ง", 500);
    }
  }

  return NextResponse.json({ count: created.data, lines: rows.size }, { status: 201 });
}
