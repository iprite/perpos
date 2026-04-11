import { NextResponse } from "next/server";
import { z } from "zod";

import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { assertCallerIsAdmin } from "../_utils";

const QuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  perPage: z.coerce.number().int().min(1).max(200).default(50),
});

export async function GET(req: Request) {
  const guard = await assertCallerIsAdmin(req);
  if (!guard.ok) {
    return NextResponse.json({ error: guard.message }, { status: guard.status });
  }

  const url = new URL(req.url);
  const parsed = QuerySchema.safeParse({
    page: url.searchParams.get("page") ?? undefined,
    perPage: url.searchParams.get("perPage") ?? undefined,
  });
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid_query" }, { status: 400 });
  }

  const admin = createSupabaseAdminClient();
  const { page, perPage } = parsed.data;

  const { data: listData, error: listError } = await admin.auth.admin.listUsers({ page, perPage });
  if (listError || !listData) {
    return NextResponse.json({ error: listError?.message ?? "list_failed" }, { status: 400 });
  }

  const users = listData.users ?? [];
  const ids = users.map((u) => u.id);

  const [profilesRes, orgMembersRes, repsRes, orgsRes] = await Promise.all([
    ids.length
      ? admin
          .from("profiles")
          .select("id,email,role,representative_level,representative_lead_id,created_at")
          .in("id", ids)
      : Promise.resolve({ data: [], error: null } as any),
    ids.length
      ? admin
          .from("organization_members")
          .select("organization_id,profile_id")
          .in("profile_id", ids)
      : Promise.resolve({ data: [], error: null } as any),
    ids.length
      ? admin
          .from("company_representatives")
          .select("id,rep_code,profile_id")
          .in("profile_id", ids)
      : Promise.resolve({ data: [], error: null } as any),
    admin.from("organizations").select("id,name"),
  ]);

  const firstError = profilesRes.error ?? orgMembersRes.error ?? repsRes.error ?? orgsRes.error;
  if (firstError) {
    return NextResponse.json({ error: firstError.message }, { status: 400 });
  }

  const orgNameById = new Map<string, string>();
  for (const o of (orgsRes.data ?? []) as Array<{ id: string; name: string }>) {
    orgNameById.set(o.id, o.name);
  }

  const profileById = new Map<string, any>();
  for (const p of (profilesRes.data ?? []) as any[]) {
    profileById.set(p.id, p);
  }

  const orgByProfileId = new Map<string, { organization_id: string; organization_name: string | null }>();
  for (const m of (orgMembersRes.data ?? []) as Array<{ organization_id: string; profile_id: string }>) {
    orgByProfileId.set(m.profile_id, {
      organization_id: m.organization_id,
      organization_name: orgNameById.get(m.organization_id) ?? null,
    });
  }

  const repByProfileId = new Map<string, { id: string; rep_code: string | null }>();
  for (const r of (repsRes.data ?? []) as Array<{ id: string; rep_code: string | null; profile_id: string | null }>) {
    if (!r.profile_id) continue;
    repByProfileId.set(r.profile_id, { id: r.id, rep_code: r.rep_code ?? null });
  }

  const items = users.map((u) => {
    const p = profileById.get(u.id) ?? null;
    const org = orgByProfileId.get(u.id) ?? null;
    const rep = repByProfileId.get(u.id) ?? null;
    return {
      id: u.id,
      email: u.email ?? null,
      created_at: u.created_at,
      last_sign_in_at: u.last_sign_in_at ?? null,
      invited_at: (u as any).invited_at ?? null,
      profile: p,
      employer_org: org,
      representative: rep,
    };
  });

  return NextResponse.json({
    page,
    perPage,
    total: listData.total ?? null,
    items,
  });
}

