import { NextResponse } from "next/server";

import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { assertCallerIsAdmin } from "../users/_utils";
import { ALL_MODULE_KEYS, ORG_ROLES } from "@/lib/modules";

export const runtime = "nodejs";

// GET /api/admin/modules          → { orgs: [{id, name}] }
// GET /api/admin/modules?orgId=x  → { settings: [{module_key, is_enabled, allowed_roles}] }
export async function GET(req: Request) {
  const guard = await assertCallerIsAdmin(req);
  if (!guard.ok) return NextResponse.json({ error: guard.message }, { status: guard.status });

  const url   = new URL(req.url);
  const orgId = url.searchParams.get("orgId");
  const admin = createSupabaseAdminClient();

  if (!orgId) {
    const { data: orgs, error } = await admin
      .from("organizations")
      .select("id,name")
      .order("name");
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ orgs: orgs ?? [] });
  }

  const { data, error } = await admin
    .from("org_module_settings")
    .select("module_key,is_enabled,allowed_roles")
    .eq("organization_id", orgId);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const rowByKey = new Map((data ?? []).map((r: any) => [r.module_key as string, r]));
  const settings = ALL_MODULE_KEYS.map((key) =>
    rowByKey.get(key) ?? {
      module_key: key,
      is_enabled: true,
      allowed_roles: [...ORG_ROLES],
    },
  );

  return NextResponse.json({ settings });
}

// PUT /api/admin/modules
// body: { orgId: string, settings: { module_key, is_enabled, allowed_roles }[] }
export async function PUT(req: Request) {
  const guard = await assertCallerIsAdmin(req);
  if (!guard.ok) return NextResponse.json({ error: guard.message }, { status: guard.status });

  const body = await req.json().catch(() => null);
  if (!body?.orgId || !Array.isArray(body.settings)) {
    return NextResponse.json({ error: "invalid_body" }, { status: 400 });
  }

  const admin = createSupabaseAdminClient();
  const now   = new Date().toISOString();

  const rows = (body.settings as any[]).map((s) => ({
    organization_id: body.orgId as string,
    module_key:      String(s.module_key),
    is_enabled:      Boolean(s.is_enabled),
    allowed_roles:   Array.isArray(s.allowed_roles) ? (s.allowed_roles as string[]) : [...ORG_ROLES],
    updated_at:      now,
  }));

  const { error } = await admin
    .from("org_module_settings")
    .upsert(rows, { onConflict: "organization_id,module_key" });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
