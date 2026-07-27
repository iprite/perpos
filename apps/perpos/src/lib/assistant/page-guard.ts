import { redirect } from "next/navigation";
import type { SupabaseClient } from "@supabase/supabase-js";

import { getAuthUser } from "@/lib/supabase/auth-user";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { resolveAssistantAccess } from "@/lib/assistant/access";
import type { AssistantKind } from "@/lib/assistant/kinds";

export interface AssistantPageAuth {
  admin: SupabaseClient;
  userId: string;
  /** home org สำหรับ storage/worker/tag (ไม่โผล่ใน URL) */
  orgId: string;
  isSuperAdmin: boolean;
  kinds: AssistantKind[];
}

/**
 * requireAssistantPage — server-side guard สำหรับ Server Component หน้า /assistant/*
 *
 * คู่ขนานกับ API guard `requireAssistantUser` แต่ใช้ session จาก cookies (getUser)
 * ผ่าน → คืน admin client + userId + home org ให้ caller query ต่อ
 * ไม่ผ่าน → redirect (ไม่มี session → /signin · ไม่มีสิทธิ์/ไม่มี home org → /)
 *
 * defense-in-depth: gate ระดับ SSR — กันคนปิด JS / ดึง RSC ตรง
 */
export async function requireAssistantPage(): Promise<AssistantPageAuth> {
  // getAuthUser = dedupe ต่อ request (HydrogenLayout resolve ไปแล้ว) → ไม่มี round-trip เพิ่ม
  const user = await getAuthUser();
  if (!user) redirect("/signin");

  const admin = createSupabaseAdminClient();
  const access = await resolveAssistantAccess(admin, user.id);
  if (!access.ok) redirect("/");

  return {
    admin,
    userId: user.id,
    orgId: access.orgId,
    isSuperAdmin: access.isSuperAdmin,
    kinds: access.kinds,
  };
}
