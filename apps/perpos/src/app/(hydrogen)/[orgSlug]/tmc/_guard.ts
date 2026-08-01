// _guard.ts — ด่านสิทธิ์ฝั่งหน้าของโมดูล tmc (per-org module, module_members)
// role ของ tmc: owner | admin | team_lead | finance
// บัญชีและการเงิน / เงินสดย่อย → owner|admin|finance · Dashboard (ภาพรวมทั้งกิจการ) → owner เท่านั้น
// finance ("การเงิน") = เห็นเฉพาะ บัญชีและการเงิน / เงินสดย่อย / การเข้าพัก (ไม่เห็น Stock, ผู้ช่วยขาย)
import "server-only";

import { redirect } from "next/navigation";
import { getModuleRoleForCurrentUser } from "@/lib/accounting/queries";

// TMC = single-tenant — ผูกกับ org เดียว
export const TMC_ORG_ID = "1f52618c-09c4-49c5-a929-ea5060f26e7d";

export type TmcRole = "owner" | "admin" | "team_lead" | "finance";

/** เจ้าของ + ผู้ดูแล + การเงิน (super_admin ได้ "owner" จาก getModuleRoleForCurrentUser) */
export function isTmcManager(role: string | null): boolean {
  return role === "owner" || role === "admin" || role === "finance";
}

/** หน้าแรกที่ role นั้นเห็นได้ — ปลายทาง redirect เวลาสิทธิ์ไม่พอ */
function tmcHomeFor(orgSlug: string, role: TmcRole): string {
  return isTmcManager(role) ? `/${orgSlug}/tmc/finance` : `/${orgSlug}/tmc/stock`;
}

/** ไม่ใช่สมาชิกโมดูล → "/" · เป็นสมาชิกแต่ไม่ใช่เจ้าของ/ผู้ดูแล/การเงิน → หน้าแรกที่เห็นได้ (Stock) */
export async function requireTmcManagerPage(orgSlug: string): Promise<TmcRole> {
  const role = (await getModuleRoleForCurrentUser(TMC_ORG_ID, "tmc")) as TmcRole | null;
  if (!role) redirect("/");
  if (!isTmcManager(role)) redirect(`/${orgSlug}/tmc/stock`);
  return role;
}

/** Dashboard = เจ้าของเท่านั้น · ที่เหลือ → หน้าแรกที่ role นั้นเห็นได้ */
export async function requireTmcOwnerPage(orgSlug: string): Promise<TmcRole> {
  const role = (await getModuleRoleForCurrentUser(TMC_ORG_ID, "tmc")) as TmcRole | null;
  if (!role) redirect("/");
  if (role !== "owner") redirect(tmcHomeFor(orgSlug, role));
  return role;
}

/** หน้าฝั่งปฏิบัติการ (Stock / ผู้ช่วยขาย) — ทุก role ยกเว้น "การเงิน" */
export async function requireTmcOperationsPage(orgSlug: string): Promise<TmcRole> {
  const role = (await getModuleRoleForCurrentUser(TMC_ORG_ID, "tmc")) as TmcRole | null;
  if (!role) redirect("/");
  if (role === "finance") redirect(`/${orgSlug}/tmc/finance`);
  return role;
}
