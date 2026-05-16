import { NextResponse } from "next/server";
import { z } from "zod";

import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { assertCallerIsAdmin } from "../_utils";

export const runtime = "nodejs";

const OrgRoleEnum = z.enum(["owner", "admin", "member"]);

// GET ?userId=xxx
// Returns: { memberships: [{id, orgId, orgName, role}], allOrgs: [{id, name}] }
export async function GET(req: Request) {
  const guard = await assertCallerIsAdmin(req);
  if (!guard.ok) return NextResponse.json({ error: guard.message }, { status: guard.status });

  const url = new URL(req.url);
  const userId = url.searchParams.get("userId") ?? "";
  if (!userId) return NextResponse.json({ error: "userId is required" }, { status: 400 });

  let admin: ReturnType<typeof createSupabaseAdminClient>;
  try {
    admin = createSupabaseAdminClient();
  } catch (e: any) {
    return NextResponse.json({ error: "missing_supabase_admin_env", message: String(e?.message ?? "") }, { status: 500 });
  }

  const [membershipsRes, allOrgsRes] = await Promise.all([
    admin.from("organization_members").select("id,organization_id,role").eq("user_id", userId),
    admin.from("organizations").select("id,name").order("name"),
  ]);

  if (membershipsRes.error) return NextResponse.json({ error: membershipsRes.error.message }, { status: 400 });
  if (allOrgsRes.error) return NextResponse.json({ error: allOrgsRes.error.message }, { status: 400 });

  const allOrgs = (allOrgsRes.data ?? []).map((o: any) => ({ id: o.id as string, name: o.name as string }));
  const orgNameById = new Map(allOrgs.map((o) => [o.id, o.name]));

  const memberships = (membershipsRes.data ?? []).map((row: any) => ({
    id: row.id as string,
    orgId: row.organization_id as string,
    orgName: orgNameById.get(row.organization_id) ?? row.organization_id,
    role: row.role as string,
  }));

  return NextResponse.json({ memberships, allOrgs });
}

// PUT body: { userId, orgId, role }
// Upserts membership
export async function PUT(req: Request) {
  const guard = await assertCallerIsAdmin(req);
  if (!guard.ok) return NextResponse.json({ error: guard.message }, { status: guard.status });

  const json = await req.json().catch(() => null);
  const parsed = z
    .object({
      userId: z.string().min(1),
      orgId: z.string().min(1),
      role: OrgRoleEnum,
    })
    .safeParse(json);
  if (!parsed.success) return NextResponse.json({ error: "invalid_body" }, { status: 400 });

  let admin: ReturnType<typeof createSupabaseAdminClient>;
  try {
    admin = createSupabaseAdminClient();
  } catch (e: any) {
    return NextResponse.json({ error: "missing_supabase_admin_env", message: String(e?.message ?? "") }, { status: 500 });
  }

  const { userId, orgId, role } = parsed.data;
  const { error } = await admin
    .from("organization_members")
    .upsert({ organization_id: orgId, user_id: userId, role }, { onConflict: "organization_id,user_id" });

  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ ok: true });
}

// DELETE body: { userId, orgId }
// Removes membership
export async function DELETE(req: Request) {
  const guard = await assertCallerIsAdmin(req);
  if (!guard.ok) return NextResponse.json({ error: guard.message }, { status: guard.status });

  const json = await req.json().catch(() => null);
  const parsed = z
    .object({
      userId: z.string().min(1),
      orgId: z.string().min(1),
    })
    .safeParse(json);
  if (!parsed.success) return NextResponse.json({ error: "invalid_body" }, { status: 400 });

  let admin: ReturnType<typeof createSupabaseAdminClient>;
  try {
    admin = createSupabaseAdminClient();
  } catch (e: any) {
    return NextResponse.json({ error: "missing_supabase_admin_env", message: String(e?.message ?? "") }, { status: 500 });
  }

  const { userId, orgId } = parsed.data;
  const { error } = await admin
    .from("organization_members")
    .delete()
    .eq("organization_id", orgId)
    .eq("user_id", userId);

  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ ok: true });
}
