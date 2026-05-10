"use server";

import { revalidatePath } from "next/cache";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export type OrgMemberRow = {
  id: string;
  user_id: string;
  role: "owner" | "admin" | "member";
  email: string | null;
  display_name: string | null;
  avatar_url: string | null;
  created_at: string;
};

export type OrgInviteRow = {
  id: string;
  email: string;
  org_role: "owner" | "admin" | "member";
  status: "pending" | "accepted" | "expired";
  created_at: string;
  expires_at: string;
};

export async function listOrgMembers(params: { organizationId: string }): Promise<
  { ok: true; rows: OrgMemberRow[] } | { ok: false; error: string }
> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("organization_members")
    .select("id, user_id, role, created_at, profiles(email, display_name, avatar_url)")
    .eq("organization_id", params.organizationId)
    .order("created_at");

  if (error) return { ok: false, error: error.message };

  const rows: OrgMemberRow[] = (data ?? []).map((m: any) => ({
    id:           m.id,
    user_id:      m.user_id,
    role:         m.role,
    email:        m.profiles?.email ?? null,
    display_name: m.profiles?.display_name ?? null,
    avatar_url:   m.profiles?.avatar_url ?? null,
    created_at:   m.created_at,
  }));

  return { ok: true, rows };
}

export async function listOrgInvites(params: { organizationId: string }): Promise<
  { ok: true; rows: OrgInviteRow[] } | { ok: false; error: string }
> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("org_invites")
    .select("id, email, org_role, status, created_at, expires_at")
    .eq("organization_id", params.organizationId)
    .eq("status", "pending")
    .order("created_at", { ascending: false });

  if (error) return { ok: false, error: error.message };
  return { ok: true, rows: (data ?? []) as OrgInviteRow[] };
}

export async function updateMemberRoleAction(params: {
  organizationId: string;
  memberId: string;
  role: "owner" | "admin" | "member";
}): Promise<{ ok: true } | { ok: false; error: string }> {
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase
    .from("organization_members")
    .update({ role: params.role })
    .eq("id", params.memberId)
    .eq("organization_id", params.organizationId);

  if (error) return { ok: false, error: error.message };
  revalidatePath("/settings/users");
  return { ok: true };
}

export async function removeMemberAction(params: {
  organizationId: string;
  memberId: string;
}): Promise<{ ok: true } | { ok: false; error: string }> {
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase
    .from("organization_members")
    .delete()
    .eq("id", params.memberId)
    .eq("organization_id", params.organizationId);

  if (error) return { ok: false, error: error.message };
  revalidatePath("/settings/users");
  return { ok: true };
}

export async function cancelInviteAction(params: {
  organizationId: string;
  inviteId: string;
}): Promise<{ ok: true } | { ok: false; error: string }> {
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase
    .from("org_invites")
    .update({ status: "expired" })
    .eq("id", params.inviteId)
    .eq("organization_id", params.organizationId);

  if (error) return { ok: false, error: error.message };
  revalidatePath("/settings/users");
  return { ok: true };
}
