import { redirect } from "next/navigation";
import type { SupabaseClient } from "@supabase/supabase-js";

import { createSupabaseServerClient } from "@/lib/supabase/server";
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
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/signin");

  const admin = createSupabaseAdminClient();
  const { data: profile } = await admin
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .maybeSingle();
  if (profile?.role !== "super_admin") redirect("/");

  return admin;
}
