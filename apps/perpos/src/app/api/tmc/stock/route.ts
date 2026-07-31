import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "../../_lib/supabase";
import { requireTmcMember } from "../_lib";
import { recordMetric } from "@/lib/metrics";

// GET /api/tmc/stock?orgId=&lowStock=true
export async function GET(req: NextRequest) {
  const t0 = Date.now();
  const p = req.nextUrl.searchParams;
  const orgId = p.get("orgId") ?? "";
  if (!orgId) return NextResponse.json({ error: "missing orgId" }, { status: 400 });

  const auth = await requireTmcMember(req, orgId);
  if (!auth.ok) return auth.res;

  const [{ data: items }, { data: locations }, { data: balances }, { data: movements }] =
    await Promise.all([
      auth.rls
        .from("tmc_stock_items")
        .select("*")
        .eq("org_id", orgId)
        .eq("is_active", true)
        .order("category")
        .order("name"),
      // จุดเก็บของ + ยอดคงเหลือรายจุดเก็บ (specs/tmc-stock-v2.md §3)
      auth.rls
        .from("tmc_stock_locations")
        .select("*")
        .eq("org_id", orgId)
        .eq("is_active", true)
        .order("sort_order"),
      auth.rls.from("tmc_stock_balances").select("item_id, location_id, qty").eq("org_id", orgId),
      auth.rls
        .from("tmc_stock_movements")
        .select(
          `*, tmc_stock_items(name, unit),
           from_location:tmc_stock_locations!tmc_stock_movements_from_location_id_fkey(code, name),
           to_location:tmc_stock_locations!tmc_stock_movements_to_location_id_fkey(code, name)`,
        )
        .eq("org_id", orgId)
        .order("created_at", { ascending: false })
        .limit(200),
    ]);

  void recordMetric({ orgId, route: "/api/tmc/stock", method: req.method, status: 200, t0 });
  return NextResponse.json({
    items: items ?? [],
    locations: locations ?? [],
    balances: balances ?? [],
    movements: movements ?? [],
  });
}

// POST /api/tmc/stock — add item or record movement
export async function POST(req: NextRequest) {
  const t0 = Date.now();
  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const orgId = String(body.orgId ?? "");
  if (!orgId) return NextResponse.json({ error: "missing orgId" }, { status: 400 });

  const auth = await requireTmcMember(req, orgId);
  if (!auth.ok) return auth.res;

  const admin = createAdminClient();

  // action: 'add_item' | 'movement'
  if (body.action === "add_item") {
    if (!["owner", "admin", "team_lead"].includes(auth.role)) {
      return NextResponse.json({ error: "ต้องการสิทธิ์ team_lead ขึ้นไป" }, { status: 403 });
    }
    // ของใช้ซ้ำ (ผ้า/เครื่องนอน/อุปกรณ์) ไม่หายเมื่อเบิก และมีบ้านคนละที่กับของใช้แล้วหมดไป
    const stockClass = body.stockClass === "reusable" ? "reusable" : "consumable";
    const itemGroup = (body.itemGroup as string) || null;
    const homeCode = ["linen", "bedding"].includes(itemGroup ?? "") ? "LINEN" : "WH";
    const { data: home } = await admin
      .from("tmc_stock_locations")
      .select("id")
      .eq("org_id", orgId)
      .eq("code", homeCode)
      .maybeSingle();

    const { data, error } = await admin
      .from("tmc_stock_items")
      .insert({
        org_id: orgId,
        name: body.name,
        unit: body.unit ?? "ชิ้น",
        min_quantity: Number(body.minQuantity ?? 0),
        category: body.category ?? null,
        stock_class: stockClass,
        item_group: itemGroup,
        consumes_on_issue: stockClass === "consumable",
        default_location_id: home?.id ?? null,
      })
      .select()
      .single();
    if (error) {
      const dup = error.code === "23505";
      void recordMetric({
        orgId,
        route: "/api/tmc/stock",
        method: req.method,
        status: dup ? 400 : 500,
        t0,
      });
      return NextResponse.json(
        { error: dup ? `มีรายการชื่อ "${String(body.name)}" อยู่แล้ว` : error.message },
        { status: dup ? 400 : 500 },
      );
    }
    void recordMetric({ orgId, route: "/api/tmc/stock", method: req.method, status: 201, t0 });
    return NextResponse.json(data, { status: 201 });
  }

  // การเคลื่อนไหวสต๊อกย้ายไปที่ /api/tmc/stock/movements (แบบ from → to) แล้ว
  // ทางเดิมเขียน movement โดยไม่รู้จุดเก็บ → ปิดทิ้ง กันมีสองทางเขียนที่กติกาไม่เท่ากัน
  void recordMetric({ orgId, route: "/api/tmc/stock", method: req.method, status: 410, t0 });
  return NextResponse.json(
    { error: "ย้ายไปใช้ POST /api/tmc/stock/movements แทน" },
    { status: 410 },
  );
}
