import { redirect } from "next/navigation";
import type { SupabaseClient } from "@supabase/supabase-js";

import { getAuthUser, getProfileRole } from "@/lib/supabase/auth-user";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

/**
 * requireSuperAdminPage — server-side guard สำหรับ Server Component หน้า /admin/*
 *
 * ตรวจ session (getUser → validate JWT ฝั่ง server) + role === 'super_admin'
 * ผ่าน → คืน admin client (service role, bypass RLS) ให้ caller ใช้ query ต่อ
 * ไม่ผ่าน → redirect (ไม่มี session → /signin · ไม่ใช่ super_admin → /)
 *
 * defense-in-depth: gate ระดับ SSR ก่อน client RouteRoleGuard — กันคนปิด JS / ดึง RSC ตรง
 */
export async function requireSuperAdminPage(): Promise<SupabaseClient> {
  const user = await getAuthUser(); // dedupe ต่อ request (ใช้ร่วมกับ HydrogenLayout)
  if (!user) redirect("/signin");

  // getProfileRole = dedupe ต่อ request → ใช้ผลเดียวกับที่ HydrogenLayout อ่านไปแล้ว
  if ((await getProfileRole()) !== "super_admin") redirect("/");

  return createSupabaseAdminClient();
}
