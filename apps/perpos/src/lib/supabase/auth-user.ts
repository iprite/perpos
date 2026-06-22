import { cache } from "react";

import { createSupabaseServerClient } from "@/lib/supabase/server";

/**
 * getAuthUser — `supabase.auth.getUser()` แบบ dedupe ต่อ request ด้วย React `cache()`
 *
 * ปัญหาเดิม: หนึ่ง page render เรียก getUser() หลายรอบ (HydrogenLayout → getOrganizations +
 * getCurrentUserId, + page guard) · getUser() เป็น **network round-trip** ไป Supabase Auth
 * (validate JWT, ~50–160ms/รอบ) · คนละ client instance → Next.js ไม่ dedupe ให้
 *
 * `cache()` memoize ผลลัพธ์ **ภายใน request เดียว** (scope ต่อ render pass — ไม่ leak ข้าม request,
 * ปลอดภัยตอน test หลาย account) → getUser เหลือ 1 รอบต่อ render แทน 3–4 รอบ
 *
 * ใช้แทน `createSupabaseServerClient().auth.getUser()` ทุกที่ที่ต้องการแค่ "ใครคือ user ปัจจุบัน"
 */
export const getAuthUser = cache(async () => {
  const supabase = await createSupabaseServerClient();
  const { data } = await supabase.auth.getUser();
  return data.user ?? null;
});
