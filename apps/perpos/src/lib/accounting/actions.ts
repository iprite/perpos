"use server";

import { cookies } from "next/headers";

import { createSupabaseServerClient } from "@/lib/supabase/server";

export async function setActiveOrganizationAction(orgId: string) {
  const id = String(orgId ?? "").trim();
  if (!id) return { ok: false, error: "missing_org_id" };

  const supabase = await createSupabaseServerClient();
  const { data: userRes } = await supabase.auth.getUser();
  const uid = userRes.user?.id;
  if (!uid) return { ok: false, error: "not_authenticated" };

  const { data: m, error: e } = await supabase
    .from("organization_members")
    .select("id")
    .eq("organization_id", id)
    .eq("user_id", uid)
    .maybeSingle();
  if (e || !m) return { ok: false, error: "not_member" };

  const cookieStore = await cookies();
  cookieStore.set("perpos.activeOrgId", id, { path: "/", sameSite: "lax" });
  return { ok: true };
}

export async function createOrganizationAction(name: string) {
  const trimmed = String(name ?? "").trim();
  if (!trimmed) return { ok: false, error: "missing_name" };

  const supabase = await createSupabaseServerClient();
  const { data: userRes } = await supabase.auth.getUser();
  const uid = userRes.user?.id;
  if (!uid) return { ok: false, error: "not_authenticated" };

  const { data: org, error: orgErr } = await supabase
    .from("organizations")
    .insert({ name: trimmed })
    .select("id")
    .single();
  if (orgErr || !org?.id) return { ok: false, error: orgErr?.message ?? "org_create_failed" };

  const { error: memErr } = await supabase
    .from("organization_members")
    .insert({ organization_id: org.id, user_id: uid, role: "owner" });
  if (memErr) return { ok: false, error: memErr.message };

  const cookieStore = await cookies();
  cookieStore.set("perpos.activeOrgId", String(org.id), { path: "/", sameSite: "lax" });
  return { ok: true, organizationId: String(org.id) };
}
