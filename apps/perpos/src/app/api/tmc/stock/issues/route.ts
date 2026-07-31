import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "../../../_lib/supabase";
import { requireTmcMember } from "../../_lib";
import { recordMetric } from "@/lib/metrics";

// ใบเบิกของ — เบิก 1 ครั้ง = หลายบรรทัด ต้อง atomic ทั้งใบ (specs/tmc-stock-v2.md §4.5)
// การตัดสต๊อกทั้งหมดทำใน RPC + trigger ของ DB · route นี้ auth + แปลง error เป็นข้อความไทย

// GET /api/tmc/stock/issues?orgId=&limit=
export async function GET(req: NextRequest) {
  const p = req.nextUrl.searchParams;
  const orgId = p.get("orgId") ?? "";
  if (!orgId) return NextResponse.json({ error: "missing orgId" }, { status: 400 });

  const auth = await requireTmcMember(req, orgId);
  if (!auth.ok) return auth.res;

  // ?id= → ใบเดียวพร้อมบรรทัดจริง (ใช้ทำใบเช็คของที่พิมพ์ออกมา)
  const id = p.get("id");
  if (id) {
    const [{ data: issue }, { data: lines }] = await Promise.all([
      auth.rls.from("tmc_stock_issues").select("*").eq("org_id", orgId).eq("id", id).maybeSingle(),
      auth.rls
        .from("tmc_stock_movements")
        .select("quantity, room_name, tmc_stock_items(name, unit)")
        .eq("org_id", orgId)
        .eq("issue_id", id)
        .is("ref_movement_id", null),
    ]);
    if (!issue) return NextResponse.json({ error: "ไม่พบใบเบิก" }, { status: 404 });
    return NextResponse.json({ issue, lines: lines ?? [] });
  }

  const { data, error } = await auth.rls
    .from("tmc_stock_issues")
    .select("*, tmc_stock_presets(name, room_name)")
    .eq("org_id", orgId)
    .order("created_at", { ascending: false })
    .limit(Number(p.get("limit") ?? 100));

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data ?? []);
}

// POST /api/tmc/stock/issues — เบิกทั้งชุด
export async function POST(req: NextRequest) {
  const t0 = Date.now();
  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const orgId = String(body.orgId ?? "");
  if (!orgId) return NextResponse.json({ error: "missing orgId" }, { status: 400 });

  const auth = await requireTmcMember(req, orgId);
  if (!auth.ok) return auth.res;

  // เบิกทั้งหลัง (หลายห้องในใบเดียว) — ท่าหลักของหน้าเบิกของ
  if (Array.isArray(body.groups) && body.groups.length > 0) {
    const { data, error } = await createAdminClient().rpc("tmc_stock_issue_rooms", {
      p_org_id: orgId,
      p_property_code: String(body.propertyCode ?? ""),
      p_groups: body.groups,
      p_stay_id: (body.stayId as string) || null,
      p_note: (body.note as string) || null,
      p_created_by: auth.userId,
    });
    if (error) {
      const status = error.code === "23514" || error.code === "23503" ? 400 : 500;
      void recordMetric({ orgId, route: "/api/tmc/stock/issues", method: "POST", status, t0 });
      return NextResponse.json({ error: error.message }, { status });
    }
    void recordMetric({ orgId, route: "/api/tmc/stock/issues", method: "POST", status: 201, t0 });
    return NextResponse.json(data, { status: 201 });
  }

  const presetId = (body.presetId as string) || null;
  const lines = Array.isArray(body.lines) ? body.lines : null;
  if (!presetId && (!lines || lines.length === 0)) {
    return NextResponse.json({ error: "ต้องเลือกชุด หรือระบุรายการเอง" }, { status: 400 });
  }

  const { data, error } = await createAdminClient().rpc("tmc_stock_issue_preset", {
    p_org_id: orgId,
    p_preset_id: presetId,
    p_property_code: (body.propertyCode as string) || null,
    p_to_location_id: (body.toLocationId as string) || null,
    p_stay_id: (body.stayId as string) || null,
    p_guests: body.guests === undefined ? null : Number(body.guests),
    p_nights: body.nights === undefined ? null : Number(body.nights),
    p_lines: lines,
    p_note: (body.note as string) || null,
    p_created_by: auth.userId,
  });

  if (error) {
    // ข้อความจาก trigger เป็นภาษาไทยอยู่แล้ว (เช่น "ผ้าเช็ดตัว ที่ ห้องผ้าสะอาด เหลือ 3 ผืน …")
    const status = error.code === "23514" || error.code === "23503" ? 400 : 500;
    void recordMetric({ orgId, route: "/api/tmc/stock/issues", method: "POST", status, t0 });
    return NextResponse.json({ error: error.message }, { status });
  }

  void recordMetric({ orgId, route: "/api/tmc/stock/issues", method: "POST", status: 201, t0 });
  return NextResponse.json(data, { status: 201 });
}

// PATCH /api/tmc/stock/issues — ยกเลิกใบ (ออกรายการกลับ ไม่ลบ)
export async function PATCH(req: NextRequest) {
  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const orgId = String(body.orgId ?? "");
  const id = String(body.id ?? "");
  if (!orgId || !id) return NextResponse.json({ error: "missing orgId or id" }, { status: 400 });

  const auth = await requireTmcMember(req, orgId);
  if (!auth.ok) return auth.res;
  if (!["owner", "admin", "team_lead"].includes(auth.role)) {
    return NextResponse.json({ error: "ต้องการสิทธิ์ team_lead ขึ้นไป" }, { status: 403 });
  }

  const { data, error } = await createAdminClient().rpc("tmc_stock_void_issue", {
    p_org_id: orgId,
    p_issue_id: id,
    p_reason: (body.reason as string) || null,
    p_created_by: auth.userId,
  });

  if (error) {
    const status = error.code === "23514" || error.code === "23503" ? 400 : 500;
    return NextResponse.json({ error: error.message }, { status });
  }
  return NextResponse.json(data);
}
