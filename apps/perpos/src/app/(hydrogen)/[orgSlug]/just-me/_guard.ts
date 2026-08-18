// _guard.ts — ด่านสิทธิ์ฝั่งหน้าของโมดูล just_me
//
// ระดับสิทธิ์ (เรียงจากสูงลงต่ำ) — role มาจาก `module_members.module_role` ก่อน
// ถ้าไม่มีแถวค่อยตกไปใช้ role ระดับองค์กร (`organization_members.role`) เหมือนที่ sidebar ใช้:
//
//   owner   → ทุกเมนู
//   admin   → ทุกเมนู **ยกเว้น "อนุมัติค่าเดินทาง"** (เงินที่จ่ายออกต้องผ่านเจ้าของ)
//   ที่เหลือ (manager / viewer / member …) → เฉพาะ "คลังสินค้า" และ "เวลาทำงานและการเดินทาง"
//
// 🔴 กติกาชุดนี้ต้องตรงกับเมนูใน `layouts/hydrogen/menu-items.tsx` (buildJustMeMenuItems) เสมอ
//    ซ่อนเมนูอย่างเดียวไม่พอ — พิมพ์ URL ตรง ๆ ก็ต้องเข้าไม่ได้
import "server-only";

import { redirect } from "next/navigation";

import {
  getModuleRoleForCurrentUser,
  getOrganizationsForCurrentUser,
} from "@/lib/accounting/queries";

/** หน้าที่ทุกคนในโมดูลเข้าได้ (เป็น path ท้าย `/[orgSlug]/just-me/…`) */
const OPS_PAGES = ["inventory", "clock-in-out"] as const;

/** หน้าที่เจ้าของเท่านั้น — admin เข้าไม่ได้ */
const OWNER_ONLY_PAGES = ["travel-claims"] as const;

/** หน้าแรกที่ทุก role เข้าได้ — ปลายทาง redirect เวลาสิทธิ์ไม่พอ */
export function justMeFallbackPath(orgSlug: string): string {
  return `/${orgSlug}/just-me/inventory`;
}

/** ส่วนของ path หลัง `/just-me/` ("" = หน้า Dashboard ของโมดูล) */
function sectionOf(pathname: string): string {
  const seg = pathname.split("?")[0].split("/").filter(Boolean);
  const i = seg.indexOf("just-me");
  return i === -1 ? "" : (seg[i + 1] ?? "");
}

/** role นี้เปิดหน้านี้ได้ไหม — กติกาเดียวกับเมนู */
export function canOpenJustMePage(role: string | null, section: string): boolean {
  if (!role) return false;
  if (role === "owner") return true;
  if (role === "admin")
    return !OWNER_ONLY_PAGES.includes(section as (typeof OWNER_ONLY_PAGES)[number]);
  return OPS_PAGES.includes(section as (typeof OPS_PAGES)[number]);
}

/**
 * ด่านของ layout โมดูล — ไม่ใช่สมาชิก → "/" · สิทธิ์ไม่พอ → หน้าคลังสินค้า
 * (super_admin ได้ "owner" จาก `getModuleRoleForCurrentUser` อยู่แล้ว)
 */
export async function requireJustMePage(orgSlug: string, pathname: string): Promise<string> {
  const orgs = await getOrganizationsForCurrentUser();
  const org = orgs.find((o) => o.slug === orgSlug);
  if (!org) redirect("/");

  const role = (await getModuleRoleForCurrentUser(org.id, "just_me")) ?? org.role ?? null;
  if (!role) redirect("/");

  const section = sectionOf(pathname);
  if (!canOpenJustMePage(role, section)) redirect(justMeFallbackPath(orgSlug));
  return role;
}
