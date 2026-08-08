/**
 * Firm access — สำนักงานบัญชีเข้าทำบัญชีให้ org ลูกค้าได้โดยไม่ต้องเป็นสมาชิก org นั้น
 *
 * ปัญหาเดิม: พนักงาน jtacc ทำงานหลังบ้านให้ลูกค้าได้เฉพาะสิ่งที่ acc_firm ห่อไว้ให้
 * (OCR / ตรวจปิดงวด / รายงานรวม) · หน้าบัญชีเต็ม ๆ (สมุดรายวัน, ผังบัญชี, ใบกำกับซื้อ,
 * ภาษี & ปิดงวด) อยู่ที่ `/[clientSlug]/accounting/*` ซึ่งต้องเป็น **สมาชิก org ลูกค้า**
 * → ทางเดียวคือไปเพิ่มคนของสำนักงานเข้าทะเบียนสมาชิกของลูกค้าทีละคนทีละองค์กร
 * (รกทะเบียนลูกค้า + ต้องจัดการมือทุกครั้งที่รับ/เลิกลูกค้า)
 *
 * ท่านี้: สิทธิ์ผูกกับ **engagement** (`acc_firm_clients` status='active') แทน membership
 * → รับลูกค้าใหม่ = ทีมเข้าทำได้ทันที · เลิกสัญญา/พัก engagement = ตัดสิทธิ์ทั้งทีมทันที
 * โดยไม่ต้องแตะ `organization_members` ของลูกค้าเลย
 *
 * **ขอบเขต (ตั้งใจให้แคบ):**
 *   - ให้เฉพาะโมดูลใน `FIRM_ACCESS_MODULES` = `accounting` เท่านั้น — สำนักงานบัญชีมาทำบัญชี
 *     ไม่ใช่มาดู CRM/HR/คลังสินค้าของลูกค้า
 *   - เพดานสิทธิ์ = `accountant` (เขียนหลังบ้าน + ปิดงวดได้) — **ไม่เคยได้ `owner`**
 *     จึงแตะ "ตั้งค่าองค์กร" ของลูกค้าไม่ได้ (VAT toggle / ข้อมูลผู้เสียภาษี = เจ้าของกิจการเท่านั้น)
 *   - `acc_firm` viewer → `viewer` (อ่านอย่างเดียว)
 *   - membership จริงชนะเสมอ — ผู้เรียกต้องลอง `module_members` ก่อน ค่อย fallback มาที่นี่
 */

import type { SupabaseClient } from "@supabase/supabase-js";

/** โมดูลของลูกค้าที่สำนักงานบัญชีเข้าถึงได้ผ่าน engagement */
export const FIRM_ACCESS_MODULES = ["accounting"] as const;
const ACCOUNTING_MODULE = "accounting";

export type FirmAccess = {
  /** org ของสำนักงานบัญชี (เจ้าของ engagement) */
  firmOrgId: string;
  firmOrgName: string;
  firmOrgSlug: string;
  /** role ที่ผู้ใช้มีในโมดูล acc_firm ของสำนักงาน */
  firmModuleRole: string;
  /** role ที่ได้ในโมดูลของ org ลูกค้า */
  moduleRole: string;
};

/**
 * acc_firm role → role ในโมดูลของลูกค้า
 *
 * **เพดานคือ `accountant` เสมอ — ห้ามคืน `owner` ไม่ว่ากรณีใด** เพราะ `owner` ของ accounting
 * คือเจ้าของกิจการ (แก้ตั้งค่าองค์กร/VAT/ข้อมูลผู้เสียภาษี) ซึ่งไม่ใช่สิ่งที่สำนักงานบัญชี
 * ควรตัดสินใจแทนลูกค้า · มีเทสคุมใน firm-access.test.ts
 */
export function firmRoleToClientRole(firmModuleRole: string): string {
  return firmModuleRole === "viewer" ? "viewer" : "accountant";
}
const toClientModuleRole = firmRoleToClientRole;

type Admin = SupabaseClient<any, any, any>;

/**
 * สำนักงานบัญชีที่ผู้ใช้สังกัด และมี engagement `active` อยู่กับ org ลูกค้าที่ระบุ
 *
 * คืน `null` เมื่อ: ไม่ได้อยู่สำนักงานไหนเลย · สำนักงานปิดโมดูล `acc_firm` ·
 * ไม่มี engagement กับลูกค้ารายนี้ (หรือ engagement ไม่ active) · โมดูลที่ขอไม่อยู่ในขอบเขต
 */
export async function resolveFirmAccess(
  admin: Admin,
  userId: string,
  clientOrgId: string,
  moduleKey: string,
): Promise<FirmAccess | null> {
  if (!(FIRM_ACCESS_MODULES as readonly string[]).includes(moduleKey)) return null;

  // สำนักงานที่ผู้ใช้เป็นสมาชิกโมดูล acc_firm
  const { data: firmRows } = await admin
    .from("module_members")
    .select("org_id, module_role")
    .eq("user_id", userId)
    .eq("module_key", "acc_firm")
    .eq("is_active", true)
    .range(0, 999);
  if (!firmRows?.length) return null;

  const roleByFirm = new Map<string, string>(
    (firmRows as Record<string, unknown>[]).map((r) => [String(r.org_id), String(r.module_role)]),
  );
  const firmOrgIds = Array.from(roleByFirm.keys());

  // engagement ที่ยัง active กับลูกค้ารายนี้ + สำนักงานยังเปิดโมดูล acc_firm อยู่
  // + การถอนสิทธิ์รายบุคคล (DELETE /api/acc-firm/provision ปิดแถว module_members ของ org
  //   ลูกค้า) — ต้องชนะ engagement ไม่งั้น "ถอนแล้วยังเข้าได้" = ถอนไม่ได้จริง
  const [{ data: engagements }, { data: firmSettings }, { data: revoked }] = await Promise.all([
    admin
      .from("acc_firm_clients")
      .select("firm_org_id, modules_managed")
      .eq("client_org_id", clientOrgId)
      .eq("status", "active")
      .in("firm_org_id", firmOrgIds),
    admin
      .from("org_module_settings")
      .select("organization_id")
      .eq("module_key", "acc_firm")
      .eq("is_enabled", true)
      .in("organization_id", firmOrgIds),
    admin
      .from("module_members")
      .select("id")
      .eq("org_id", clientOrgId)
      .eq("module_key", moduleKey)
      .eq("user_id", userId)
      .eq("is_active", false)
      .maybeSingle(),
  ]);
  if (!engagements?.length) return null;
  if (revoked) return null;

  const enabledFirms = new Set(
    (firmSettings ?? []).map((s: Record<string, unknown>) => String(s.organization_id)),
  );
  const firmOrgId = (engagements as Record<string, unknown>[])
    .filter((e) => ((e.modules_managed as string[]) ?? []).includes(moduleKey))
    .map((e) => String(e.firm_org_id))
    .filter((id) => enabledFirms.has(id))
    // อยู่หลายสำนักงานที่ดูแลลูกค้ารายเดียวกัน → เรียงคงที่ ไม่งั้น role พลิกไปมาราย request
    // (และไม่ตรงกับ listFirmClientOrgs ที่ dedupe ด้วยลำดับเดียวกัน)
    .sort()[0];
  if (!firmOrgId) return null;

  const { data: firmOrg } = await admin
    .from("organizations")
    .select("id, name, slug")
    .eq("id", firmOrgId)
    .maybeSingle();
  if (!firmOrg) return null;

  const firmModuleRole = roleByFirm.get(firmOrgId) ?? "viewer";
  return {
    firmOrgId,
    firmOrgName: String((firmOrg as Record<string, unknown>).name),
    firmOrgSlug: String((firmOrg as Record<string, unknown>).slug),
    firmModuleRole,
    moduleRole: toClientModuleRole(firmModuleRole),
  };
}

export type FirmClientOrg = {
  id: string;
  name: string;
  slug: string;
  firmOrgId: string;
  firmOrgName: string;
  firmOrgSlug: string;
  moduleRole: string;
};

/**
 * org ลูกค้าทั้งหมดที่ผู้ใช้เข้าถึงได้ในนามสำนักงาน — ใช้ทำ list/สลับลูกค้า และให้ layout
 * ของ `/[orgSlug]` ยอมให้ผ่านด่าน (ผู้ใช้ไม่ได้เป็นสมาชิก org เหล่านี้)
 */
export async function listFirmClientOrgs(admin: Admin, userId: string): Promise<FirmClientOrg[]> {
  const { data: firmRows } = await admin
    .from("module_members")
    .select("org_id, module_role")
    .eq("user_id", userId)
    .eq("module_key", "acc_firm")
    .eq("is_active", true)
    .range(0, 999);
  if (!firmRows?.length) return [];

  const roleByFirm = new Map<string, string>(
    (firmRows as Record<string, unknown>[]).map((r) => [String(r.org_id), String(r.module_role)]),
  );
  const firmOrgIds = Array.from(roleByFirm.keys());

  const [{ data: engagements }, { data: firmSettings }, { data: revokedRows }] = await Promise.all([
    admin
      .from("acc_firm_clients")
      .select("firm_org_id, client_org_id, modules_managed")
      .eq("status", "active")
      .in("firm_org_id", firmOrgIds)
      .range(0, 999),
    admin
      .from("org_module_settings")
      .select("organization_id")
      .eq("module_key", "acc_firm")
      .eq("is_enabled", true)
      .in("organization_id", firmOrgIds),
    // org ลูกค้าที่ผู้ใช้คนนี้ถูกถอนสิทธิ์รายบุคคลไว้ — ต้องชนะ engagement
    admin
      .from("module_members")
      .select("org_id")
      .eq("module_key", ACCOUNTING_MODULE)
      .eq("user_id", userId)
      .eq("is_active", false)
      .range(0, 999),
  ]);
  if (!engagements?.length) return [];

  const enabledFirms = new Set(
    (firmSettings ?? []).map((s: Record<string, unknown>) => String(s.organization_id)),
  );
  const revokedOrgs = new Set(
    (revokedRows ?? []).map((r: Record<string, unknown>) => String(r.org_id)),
  );
  const live = (engagements as Record<string, unknown>[])
    .filter((e) => ((e.modules_managed as string[]) ?? []).includes(ACCOUNTING_MODULE))
    .map((e) => ({ firmOrgId: String(e.firm_org_id), clientOrgId: String(e.client_org_id) }))
    .filter((e) => enabledFirms.has(e.firmOrgId) && !revokedOrgs.has(e.clientOrgId))
    // เรียงคงที่ให้ตรงกับ resolveFirmAccess (ลูกค้าเดียวกันผ่านหลายสำนักงาน → เลือกอันเดียวกัน)
    .sort(
      (a, b) =>
        a.clientOrgId.localeCompare(b.clientOrgId) || a.firmOrgId.localeCompare(b.firmOrgId),
    );
  if (!live.length) return [];

  const orgIds = Array.from(new Set(live.map((e) => e.clientOrgId).concat(firmOrgIds)));
  const { data: orgs } = await admin
    .from("organizations")
    .select("id, name, slug")
    .in("id", orgIds)
    .range(0, 9999);
  const orgById = new Map(
    (orgs ?? []).map((o: Record<string, unknown>) => [String(o.id), o as Record<string, unknown>]),
  );

  const seen = new Set<string>();
  const out: FirmClientOrg[] = [];
  for (const e of live) {
    if (seen.has(e.clientOrgId)) continue; // ลูกค้าเดียวกันผ่านหลายสำนักงาน → เอาอันแรก
    const client = orgById.get(e.clientOrgId);
    const firm = orgById.get(e.firmOrgId);
    if (!client || !firm) continue;
    seen.add(e.clientOrgId);
    out.push({
      id: e.clientOrgId,
      name: String(client.name),
      slug: String(client.slug ?? e.clientOrgId),
      firmOrgId: e.firmOrgId,
      firmOrgName: String(firm.name),
      firmOrgSlug: String(firm.slug ?? e.firmOrgId),
      moduleRole: toClientModuleRole(roleByFirm.get(e.firmOrgId) ?? "viewer"),
    });
  }
  return out.sort((a, b) => a.name.localeCompare(b.name, "th"));
}
