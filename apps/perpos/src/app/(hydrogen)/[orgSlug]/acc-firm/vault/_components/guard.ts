// guard.ts — server helper ของหน้า [orgSlug]/acc-firm/vault/*
// per-org module → member + RLS (CONTEXT §5 · SERVER_COMPONENT_PATTERN)
// ห้ามใช้ admin service-role client กับข้อมูล per-org ในหน้า
import "server-only";

import { notFound } from "next/navigation";
import {
  getOrganizationsForCurrentUser,
  getModuleRoleForCurrentUser,
} from "@/lib/accounting/queries";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import type { SupabaseClient } from "@supabase/supabase-js";

/** role ของ module acc_firm (lib/modules.ts) */
export type AccFirmRole = "owner" | "accountant" | "viewer";

export interface VaultPageContext {
  orgId: string;
  orgSlug: string;
  role: AccFirmRole;
  /** owner/accountant เขียนได้ · viewer อ่านอย่างเดียว */
  canWrite: boolean;
  /** เอกสารข้อมูลอ่อนไหวดาวน์โหลดได้เฉพาะ owner (spec §6 — ตรงกับด่านฝั่ง API) */
  canDownloadSensitive: boolean;
  /** RLS-scoped client (session) — ใช้ดึง initial data ผ่าน lib/acc-firm/vault/queries */
  rls: SupabaseClient;
}

export async function requireVaultPage(orgSlug: string): Promise<VaultPageContext> {
  const orgs = await getOrganizationsForCurrentUser();
  const org = orgs.find((o) => o.slug === orgSlug);
  if (!org) notFound();

  const role = (await getModuleRoleForCurrentUser(org.id, "acc_firm")) as AccFirmRole | null;
  if (!role) notFound();

  const rls = await createSupabaseServerClient();
  return {
    orgId: org.id,
    orgSlug,
    role,
    canWrite: role !== "viewer",
    canDownloadSensitive: role === "owner",
    rls,
  };
}
