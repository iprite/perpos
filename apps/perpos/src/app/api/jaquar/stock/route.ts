import { NextRequest, NextResponse } from "next/server";
import { requireModuleMember } from "../../_lib/module-auth";
import { createAdminClient } from "../../_lib/supabase";
import { canModuleWrite } from "@/lib/modules";
import { setAuditContext } from "../../_lib/audit";

export async function GET(req: NextRequest) {
  const orgId = req.nextUrl.searchParams.get("orgId");
  if (!orgId) return NextResponse.json({ error: "missing orgId" }, { status: 400 });

  const auth = await requireModuleMember(req, orgId, "jaquar");
  if (!auth.ok) return auth.res;

  const search = req.nextUrl.searchParams.get("search") || "";
  const location = req.nextUrl.searchParams.get("location") || "";
  const status = req.nextUrl.searchParams.get("status") || ""; // 'out_of_stock' | 'low_stock' | 'in_stock' | ''
  const limit = parseInt(req.nextUrl.searchParams.get("limit") || "50", 10);
  const offset = parseInt(req.nextUrl.searchParams.get("offset") || "0", 10);

  const admin = createAdminClient();
  let query = admin
    .from("jaquar_inventory_items")
    .select("*", { count: "exact" })
    .eq("org_id", orgId);

  if (search) {
    // Sanitize: strip characters that break PostgREST .or() filter syntax (,  ) ( )
    const safeSearch = search.replace(/[,)(]/g, "");
    query = query.or(`item_code.ilike.%${safeSearch}%,description.ilike.%${safeSearch}%`);
  }

  if (location) {
    query = query.ilike("location", `%${location}%`);
  }

  if (status === "out_of_stock") {
    query = query.eq("total_saleable", 0);
  } else if (status === "low_stock") {
    query = query.gt("total_saleable", 0).lt("total_saleable", 5);
  } else if (status === "in_stock") {
    query = query.gt("total_saleable", 0);
  }

  const { data, count, error } = await query
    .order("item_code", { ascending: true })
    .range(offset, offset + limit - 1);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({
    items: data ?? [],
    total: count ?? 0,
  });
}

export async function POST(req: NextRequest) {
  const orgId = req.nextUrl.searchParams.get("orgId");
  if (!orgId) return NextResponse.json({ error: "missing orgId" }, { status: 400 });

  const auth = await requireModuleMember(req, orgId, "jaquar");
  if (!auth.ok) return auth.res;

  if (!canModuleWrite("jaquar", auth.moduleRole)) {
    return NextResponse.json({ error: "ไม่มีสิทธิ์เขียนข้อมูลในโมดูลนี้" }, { status: 403 });
  }

  const body = await req.json().catch(() => ({}));
  const { item_code, description, location, amount_starting, import_jaquar, return_borrowed } =
    body;

  if (!item_code || typeof item_code !== "string" || !item_code.trim()) {
    return NextResponse.json({ error: "missing item_code" }, { status: 400 });
  }

  const starting = Number(amount_starting || 0);
  const imp = Number(import_jaquar || 0);
  const ret = Number(return_borrowed || 0);
  const total = starting + imp + ret;

  const admin = createAdminClient();
  await setAuditContext(req, auth.userId, auth.orgId);

  const { data, error } = await admin
    .from("jaquar_inventory_items")
    .insert({
      org_id: orgId,
      item_code: item_code.trim(),
      description: description?.trim() || null,
      location: location?.trim() || null,
      amount_starting: starting,
      import_jaquar: imp,
      return_borrowed: ret,
      total_saleable: total,
      created_by: auth.userId,
    })
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ item: data }, { status: 201 });
}

export async function PUT(req: NextRequest) {
  const orgId = req.nextUrl.searchParams.get("orgId");
  if (!orgId) return NextResponse.json({ error: "missing orgId" }, { status: 400 });

  const auth = await requireModuleMember(req, orgId, "jaquar");
  if (!auth.ok) return auth.res;

  if (!canModuleWrite("jaquar", auth.moduleRole)) {
    return NextResponse.json({ error: "ไม่มีสิทธิ์เขียนข้อมูลในโมดูลนี้" }, { status: 403 });
  }

  const body = await req.json().catch(() => ({}));
  const {
    id,
    description,
    location,
    amount_starting,
    import_jaquar,
    return_borrowed,
    total_saleable,
  } = body;

  if (!id) return NextResponse.json({ error: "missing id" }, { status: 400 });

  const admin = createAdminClient();
  await setAuditContext(req, auth.userId, auth.orgId);

  // Fetch current item to do math if total_saleable not provided
  let total = total_saleable;
  if (total === undefined) {
    const { data: current } = await admin
      .from("jaquar_inventory_items")
      .select("*")
      .eq("id", id)
      .eq("org_id", orgId)
      .maybeSingle();

    if (current) {
      const starting =
        amount_starting !== undefined ? Number(amount_starting) : Number(current.amount_starting);
      const imp =
        import_jaquar !== undefined ? Number(import_jaquar) : Number(current.import_jaquar);
      const ret =
        return_borrowed !== undefined ? Number(return_borrowed) : Number(current.return_borrowed);
      // We also need to subtract all OUT movements to calculate correct total saleable
      const { data: outs } = await admin
        .from("jaquar_inventory_movements")
        .select("qty")
        .eq("item_id", id)
        .eq("movement_type", "out");
      const totalOut = (outs || []).reduce((acc: number, m: any) => acc + Number(m.qty), 0);
      total = starting + imp + ret - totalOut;
    }
  }

  const updatePayload: any = {
    updated_at: new Date().toISOString(),
  };

  if (description !== undefined) updatePayload.description = description?.trim() || null;
  if (location !== undefined) updatePayload.location = location?.trim() || null;
  if (amount_starting !== undefined) updatePayload.amount_starting = Number(amount_starting);
  if (import_jaquar !== undefined) updatePayload.import_jaquar = Number(import_jaquar);
  if (return_borrowed !== undefined) updatePayload.return_borrowed = Number(return_borrowed);
  if (total !== undefined) updatePayload.total_saleable = total;

  const { data, error } = await admin
    .from("jaquar_inventory_items")
    .update(updatePayload)
    .eq("id", id)
    .eq("org_id", orgId)
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ item: data });
}

export async function DELETE(req: NextRequest) {
  const orgId = req.nextUrl.searchParams.get("orgId");
  const id = req.nextUrl.searchParams.get("id");
  if (!orgId) return NextResponse.json({ error: "missing orgId" }, { status: 400 });
  if (!id) return NextResponse.json({ error: "missing id" }, { status: 400 });

  const auth = await requireModuleMember(req, orgId, "jaquar");
  if (!auth.ok) return auth.res;

  if (!canModuleWrite("jaquar", auth.moduleRole)) {
    return NextResponse.json({ error: "ไม่มีสิทธิ์เขียนข้อมูลในโมดูลนี้" }, { status: 403 });
  }

  const admin = createAdminClient();
  await setAuditContext(req, auth.userId, auth.orgId);

  const { error } = await admin
    .from("jaquar_inventory_items")
    .delete()
    .eq("id", id)
    .eq("org_id", orgId);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ success: true });
}
