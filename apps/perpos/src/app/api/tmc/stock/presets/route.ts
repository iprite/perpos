import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "../../../_lib/supabase";
import { requireTmcMember } from "../../_lib";

// ชุดเบิกของประจำห้อง (preset) — ดู specs/tmc-stock-v2.md §4.5
// ชุด = ค่าตั้งต้น ไม่ใช่กฎเหล็ก · หัวหน้าแก้เองได้ ไม่ต้องรอ dev
const WRITE_ROLES = ["owner", "admin", "team_lead"];

// GET /api/tmc/stock/presets?orgId= — ชุดทั้งหมด + บรรทัดในชุด
export async function GET(req: NextRequest) {
  const orgId = req.nextUrl.searchParams.get("orgId") ?? "";
  if (!orgId) return NextResponse.json({ error: "missing orgId" }, { status: 400 });

  const auth = await requireTmcMember(req, orgId);
  if (!auth.ok) return auth.res;

  const { data, error } = await auth.rls
    .from("tmc_stock_presets")
    .select("*, tmc_stock_preset_lines(*)")
    .eq("org_id", orgId)
    .order("sort_order")
    .order("name");

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data ?? []);
}

// POST /api/tmc/stock/presets — action: create | save_line | delete_line
export async function POST(req: NextRequest) {
  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const orgId = String(body.orgId ?? "");
  if (!orgId) return NextResponse.json({ error: "missing orgId" }, { status: 400 });

  const auth = await requireTmcMember(req, orgId);
  if (!auth.ok) return auth.res;
  if (!WRITE_ROLES.includes(auth.role)) {
    return NextResponse.json({ error: "ต้องการสิทธิ์ team_lead ขึ้นไป" }, { status: 403 });
  }

  const admin = createAdminClient();
  const action = String(body.action ?? "");

  if (action === "create") {
    const name = String(body.name ?? "").trim();
    if (!name) return NextResponse.json({ error: "ต้องมีชื่อชุด" }, { status: 400 });
    const { data, error } = await admin
      .from("tmc_stock_presets")
      .insert({
        org_id: orgId,
        name,
        preset_kind: String(body.presetKind ?? "checkout"),
        property_code: (body.propertyCode as string) || null,
        room_name: (body.roomName as string) || null,
        sort_order: Number(body.sortOrder ?? 500),
        created_by: auth.userId,
      })
      .select()
      .single();
    if (error) {
      const dup = error.code === "23505";
      return NextResponse.json(
        { error: dup ? "มีชุดของหลัง/ห้อง/ชนิดนี้อยู่แล้ว" : error.message },
        { status: 400 },
      );
    }
    return NextResponse.json(data, { status: 201 });
  }

  if (action === "save_line") {
    const presetId = String(body.presetId ?? "");
    const itemId = String(body.itemId ?? "");
    const qty = Number(body.qty);
    if (!presetId || !itemId || !Number.isFinite(qty) || qty <= 0) {
      return NextResponse.json({ error: "ข้อมูลบรรทัดไม่ครบ" }, { status: 400 });
    }
    // ชุดต้องเป็นของ org นี้ (presetId มาจาก client)
    const { data: preset } = await admin
      .from("tmc_stock_presets")
      .select("id")
      .eq("id", presetId)
      .eq("org_id", orgId)
      .maybeSingle();
    if (!preset) return NextResponse.json({ error: "ไม่พบชุด" }, { status: 404 });

    const { data, error } = await admin
      .from("tmc_stock_preset_lines")
      .upsert(
        {
          preset_id: presetId,
          item_id: itemId,
          qty,
          qty_basis: String(body.qtyBasis ?? "fixed"),
          is_optional: Boolean(body.isOptional ?? false),
          sort_order: Number(body.sortOrder ?? 100),
        },
        { onConflict: "preset_id,item_id" },
      )
      .select()
      .single();
    if (error) return NextResponse.json({ error: error.message }, { status: 400 });
    return NextResponse.json(data);
  }

  if (action === "delete_line") {
    const lineId = String(body.lineId ?? "");
    if (!lineId) return NextResponse.json({ error: "missing lineId" }, { status: 400 });
    // ยืนยันว่าบรรทัดนี้อยู่ในชุดของ org นี้ก่อนลบ (lineId มาจาก client)
    const { data: line } = await admin
      .from("tmc_stock_preset_lines")
      .select("id, tmc_stock_presets!inner(org_id)")
      .eq("id", lineId)
      .eq("tmc_stock_presets.org_id", orgId)
      .maybeSingle();
    if (!line) return NextResponse.json({ error: "ไม่พบบรรทัดนี้" }, { status: 404 });

    const { error } = await admin.from("tmc_stock_preset_lines").delete().eq("id", lineId);
    if (error) return NextResponse.json({ error: error.message }, { status: 400 });
    return NextResponse.json({ ok: true });
  }

  return NextResponse.json({ error: `ไม่รู้จัก action "${action}"` }, { status: 400 });
}

// PATCH /api/tmc/stock/presets — แก้หัวชุด (ชื่อ / เปิด-ปิด)
export async function PATCH(req: NextRequest) {
  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const orgId = String(body.orgId ?? "");
  const id = String(body.id ?? "");
  if (!orgId || !id) return NextResponse.json({ error: "missing orgId or id" }, { status: 400 });

  const auth = await requireTmcMember(req, orgId);
  if (!auth.ok) return auth.res;
  if (!WRITE_ROLES.includes(auth.role)) {
    return NextResponse.json({ error: "ต้องการสิทธิ์ team_lead ขึ้นไป" }, { status: 403 });
  }

  const patch: Record<string, unknown> = {};
  if (typeof body.name === "string") patch.name = body.name.trim();
  if (typeof body.isActive === "boolean") patch.is_active = body.isActive;
  if (body.sortOrder !== undefined) patch.sort_order = Number(body.sortOrder);
  if (Object.keys(patch).length === 0) {
    return NextResponse.json({ error: "ไม่มีข้อมูลให้แก้" }, { status: 400 });
  }

  const { data, error } = await createAdminClient()
    .from("tmc_stock_presets")
    .update(patch)
    .eq("id", id)
    .eq("org_id", orgId)
    .select()
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json(data);
}
