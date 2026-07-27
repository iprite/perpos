import { cache } from "react";

import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getSupabaseJwks } from "@/lib/supabase/jwks";

export type AuthUser = { id: string; email: string | null };

/**
 * getAuthUser — "ใครคือ user ปัจจุบัน" แบบ dedupe ต่อ request + ไม่มี network round-trip
 *
 * เดิม: `supabase.auth.getUser()` = HTTP ไป Supabase Auth เพื่อ validate JWT (~50–160ms/รอบ)
 * และ middleware ก็ยิงอีกรอบหนึ่งอยู่แล้วทุก request → 2 hop ต่อการเปิดหน้า 1 หน้า
 *
 * ตอนนี้: `getClaims()` + JWKS ที่ cache ไว้ ([jwks.ts](./jwks.ts)) → verify ลายเซ็น ES256 ในเครื่อง
 * ด้วย WebCrypto, ปกติ 0 round-trip · ถ้าโปรเจกต์กลับไปใช้ symmetric secret หรือ verify ไม่ได้
 * ตัว getClaims จะ fallback ไปถาม Auth server ให้เอง (พฤติกรรมเท่าของเดิม ไม่ใช่การ "เชื่อ JWT ดิบ")
 *
 * `cache()` memoize ผลลัพธ์ **ภายใน request เดียว** (ไม่ leak ข้าม request)
 *
 * หมายเหตุความปลอดภัย: JWT ที่ verify ในเครื่องยังถือว่าใช้ได้จนหมดอายุ (ยกเลิก session กลางคัน
 * จะยังไม่ถูกจับที่ชั้นนี้) — ด่านที่กันจริงคือการอ่าน `profiles` (role/is_active) ที่ทุกหน้า/guard
 * ทำอยู่แล้วทุก render + middleware ที่ refresh token ตามปกติ
 */
export const getAuthUser = cache(async (): Promise<AuthUser | null> => {
  const supabase = await createSupabaseServerClient();
  const jwks = await getSupabaseJwks();

  const { data, error } = await supabase.auth.getClaims(
    undefined,
    jwks ? { jwks: jwks as never } : undefined,
  );
  if (error) return null;

  const claims = data?.claims as { sub?: string; email?: string } | undefined;
  if (!claims?.sub) return null;
  return { id: claims.sub, email: claims.email ?? null };
});

/**
 * getProfileRole — `profiles.role` ของ user ปัจจุบัน แบบ dedupe ต่อ request
 *
 * query เดียวกันนี้เคยถูกยิงซ้ำ 3–4 รอบต่อ 1 render (org list + enabled modules + module role +
 * admin guard) — แต่ละรอบคือ round-trip ไป Supabase (ap-southeast-1) จึงเป็นตัวถ่วงหลัก
 * ตอนสลับบริบท Admin / Suite / Flow
 */
export const getProfileRole = cache(async (): Promise<string | null> => {
  const user = await getAuthUser();
  if (!user) return null;

  const { createSupabaseAdminClient } = await import("@/lib/supabase/admin");
  const { data } = await createSupabaseAdminClient()
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .maybeSingle();
  return (data as { role?: string } | null)?.role ?? null;
});
