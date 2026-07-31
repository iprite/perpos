import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "../../../_lib/supabase";
import { requireTmcMember } from "../../_lib";

// จุดเก็บของ (คลังกลาง / ห้องผ้าสะอาด / ร้านซัก / แต่ละหลัง) — ดู specs/tmc-stock-v2.md §3.1
const WRITE_ROLES = ["owner", "admin", "team_lead"];

// GET /api/tmc/stock/locations?orgId=
export async function GET(req: NextRequest) {
  const orgId = req.nextUrl.searchParams.get("orgId") ?? "";
  if (!orgId) return NextResponse.json({ error: "missing orgId" }, { status: 400 });

  const auth = await requireTmcMember(req, orgId);
  if (!auth.ok) return auth.res;

  const { data, error } = await auth.rls
    .from("tmc_stock_locations")
    .select("*")
    .eq("org_id", orgId)
    .order("sort_order")
    .order("name");

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data ?? []);
}

// POST /api/tmc/stock/locations — เพิ่มจุดเก็บ (เช่น ร้านซักเจ้าที่ 2, สโตรใหม่)
export async function POST(req: NextRequest) {
  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const orgId = String(body.orgId ?? "");
  if (!orgId) return NextResponse.json({ error: "missing orgId" }, { status: 400 });

  const auth = await requireTmcMember(req, orgId);
  if (!auth.ok) return auth.res;
  if (!WRITE_ROLES.includes(auth.role)) {
    return NextResponse.json({ error: "ต้องการสิทธิ์ team_lead ขึ้นไป" }, { status: 403 });
  }

  const name = String(body.name ?? "").trim();
  const code = String(body.code ?? "").trim();
  const kind = String(body.kind ?? "store");
  if (!name || !code) return NextResponse.json({ error: "ต้องมีรหัสและชื่อ" }, { status: 400 });

  const { data, error } = await createAdminClient()
    .from("tmc_stock_locations")
    .insert({
      org_id: orgId,
      code,
      name,
      kind,
      is_external: kind === "laundry",
      sort_order: Number(body.sortOrder ?? 500),
    })
    .select()
    .single();

  if (error) {
    const msg = error.code === "23505" ? `มีจุดเก็บรหัส "${code}" อยู่แล้ว` : error.message;
    return NextResponse.json({ error: msg }, { status: 400 });
  }
  return NextResponse.json(data, { status: 201 });
}

// PATCH /api/tmc/stock/locations — แก้ชื่อ / ปิดใช้งาน
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
    .from("tmc_stock_locations")
    .update(patch)
    .eq("id", id)
    .eq("org_id", orgId)
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json(data);
}
