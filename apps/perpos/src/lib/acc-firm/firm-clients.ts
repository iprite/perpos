/**
 * ตัวช่วยฝั่งหน้าเว็บ (server component) — org ลูกค้าที่ผู้ใช้ปัจจุบันเข้าถึงได้ในนามสำนักงานบัญชี
 * แยกจาก `firm-access.ts` (ตรรกะบริสุทธิ์ + รับ admin client) เพื่อให้ฝั่ง API เรียกได้โดยไม่ต้อง
 * ผูกกับ cookies/session ของ Next
 */

import { cache } from "react";

import { getAuthUser } from "@/lib/supabase/auth-user";

import { listFirmClientOrgs, type FirmClientOrg } from "./firm-access";

export const listFirmClientOrgsForCurrentUser = cache(
  async function listFirmClientOrgsForCurrentUser(): Promise<FirmClientOrg[]> {
    const user = await getAuthUser();
    if (!user) return [];
    const { createSupabaseAdminClient } = await import("@/lib/supabase/admin");
    return listFirmClientOrgs(createSupabaseAdminClient(), user.id);
  },
);
