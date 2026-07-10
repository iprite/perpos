// lib/gov-procure/notify.ts — helper สำหรับ LINE push ของ gov_procure (cron T1/T2 + event T3)
// org-context: query ด้วย org_id ตรงเสมอ (ไม่พึ่ง active org ผู้รับ) — กันข้อมูลข้าม org.
// reuse: notify/aging + notify/weekly + orders/[id]/stage (T3 hook).

import type { SupabaseClient } from "@supabase/supabase-js";
import type { GovProcureRole } from "./types";

export const MODULE_KEY = "gov_procure";

/** org ทั้งหมดที่เปิด module gov_procure (org_module_settings.is_enabled=true) */
export async function listGovProcureOrgIds(admin: SupabaseClient): Promise<string[]> {
  const { data, error } = await admin
    .from("org_module_settings")
    .select("organization_id")
    .eq("module_key", MODULE_KEY)
    .eq("is_enabled", true);
  if (error) throw new Error(error.message);
  return (data ?? []).map((r) => (r as { organization_id: string }).organization_id);
}

/** slug ของ org (สำหรับสร้างลิงก์ในการ์ด) — fallback = org_id ถ้าไม่พบ */
export async function getOrgSlug(admin: SupabaseClient, orgId: string): Promise<string> {
  const { data } = await admin.from("organizations").select("slug").eq("id", orgId).maybeSingle();
  return (data as { slug: string | null } | null)?.slug ?? orgId;
}

/**
 * line_user_id ของสมาชิก module ที่ role อยู่ใน `roles` และผูก LINE แล้ว (line_user_id != null).
 * ผูก org_id + module_key ตรง → ไม่ข้าม org. dedup.
 */
export async function getRecipientLineUserIds(
  admin: SupabaseClient,
  orgId: string,
  roles: GovProcureRole[],
): Promise<string[]> {
  if (!roles.length) return [];

  const { data: members, error } = await admin
    .from("module_members")
    .select("user_id, module_role")
    .eq("org_id", orgId)
    .eq("module_key", MODULE_KEY)
    .eq("is_active", true)
    .in("module_role", roles);
  if (error) throw new Error(error.message);

  const userIds = Array.from(
    new Set((members ?? []).map((m) => (m as { user_id: string }).user_id)),
  );
  if (!userIds.length) return [];

  const { data: profiles } = await admin
    .from("profiles")
    .select("id, line_user_id")
    .in("id", userIds);

  const ids = new Set<string>();
  for (const p of profiles ?? []) {
    const lid = (p as { line_user_id: string | null }).line_user_id;
    if (lid && lid.trim()) ids.add(lid.trim());
  }
  return Array.from(ids);
}

/** normalize line_recipients (jsonb) → GovProcureRole[] ที่ valid, default owner+manager */
export function normalizeRecipientRoles(raw: unknown): GovProcureRole[] {
  const valid: GovProcureRole[] = ["owner", "manager", "staff", "viewer"];
  if (Array.isArray(raw)) {
    const out = raw.filter((r): r is GovProcureRole => valid.includes(r as GovProcureRole));
    if (out.length) return out;
  }
  return ["owner", "manager"];
}

/** label วันที่ไทย (พ.ศ.) สั้น ๆ สำหรับหัวการ์ด cron */
export function thaiDateLabel(d: Date = new Date()): string {
  return d.toLocaleDateString("th-TH", { day: "numeric", month: "long", year: "numeric" });
}
