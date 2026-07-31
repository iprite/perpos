// _guard.ts — ด่านสิทธิ์ฝั่งหน้าของโมดูล tmc (per-org module, module_members)
// role ของ tmc: owner | admin | team_lead
// Dashboard / บัญชีและการเงิน / เงินสดย่อย = ตัวเลขรายได้-ต้นทุนทั้งกิจการ → เฉพาะ owner|admin
import "server-only";

import { redirect } from "next/navigation";
import { getModuleRoleForCurrentUser } from "@/lib/accounting/queries";

// TMC = single-tenant — ผูกกับ org เดียว
export const TMC_ORG_ID = "1f52618c-09c4-49c5-a929-ea5060f26e7d";

export type TmcRole = "owner" | "admin" | "team_lead";

/** เจ้าของ + ผู้ดูแล (super_admin ได้ "owner" จาก getModuleRoleForCurrentUser) */
export function isTmcManager(role: string | null): boolean {
  return role === "owner" || role === "admin";
}

/** ไม่ใช่สมาชิกโมดูล → "/" · เป็นสมาชิกแต่ไม่ใช่เจ้าของ/ผู้ดูแล → หน้าแรกที่เห็นได้ (Stock) */
export async function requireTmcManagerPage(orgSlug: string): Promise<TmcRole> {
  const role = (await getModuleRoleForCurrentUser(TMC_ORG_ID, "tmc")) as TmcRole | null;
  if (!role) redirect("/");
  if (!isTmcManager(role)) redirect(`/${orgSlug}/tmc/stock`);
  return role;
}
