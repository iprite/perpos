/**
 * Shared LINE-login helpers — ใช้ร่วมกันระหว่าง /line/callback และ /line/verify-follow
 *
 * - isLineFriend: เช็คว่า LINE user แอด OA (Messaging) แล้วหรือยัง (เพื่อให้ระบบ track + push ได้)
 *   → ยิง GET /v2/bot/profile/{userId} ด้วย Messaging channel token
 *     200 = เป็นเพื่อน (แอดแล้ว) · 404 = ยังไม่แอด/บล็อก · อื่น ๆ = ไม่ทราบ (fail-open กันล็อกเอาต์)
 * - completeLineLogin: provision (ถ้าจำเป็น) + magic-link → ตั้ง Supabase session cookies + redirect
 */

import { createServerClient } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';
import type { SupabaseClient } from '@supabase/supabase-js';
import { provisionLineUser } from '@/app/api/line/_provision';
import { withBasePath } from '@/utils/base-path';

export const PENDING_UID_COOKIE = 'line_pending_uid';

export function appBaseUrl(): string {
  return (process.env.APP_BASE_URL ?? 'https://app.perpos.io').replace(/\/$/, '');
}

/**
 * แอด OA แล้วหรือยัง?
 *   true  = เป็นเพื่อน (แอดแล้ว) → ให้ login ต่อได้
 *   false = ยังไม่แอด/บล็อก (404) → ต้อง onboard ให้แอดก่อน
 *   null  = ไม่ทราบ (token ไม่ตั้ง / LINE API ล่ม) → fail-open ไม่บล็อก กันล็อกเอาต์ทั้งระบบ
 */
export async function isLineFriend(lineUserId: string): Promise<boolean | null> {
  const token = process.env.LINE_MESSAGING_CHANNEL_ACCESS_TOKEN;
  if (!token) return null;
  try {
    const res = await fetch(`https://api.line.me/v2/bot/profile/${lineUserId}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (res.ok) return true;
    if (res.status === 404) return false;
    return null;
  } catch {
    return null;
  }
}

type CompleteResult = { response: NextResponse } | { error: string };

/**
 * จบ flow login: หา/สร้าง profile → magic-link → ตั้ง session cookies → redirect เข้าแอป
 * (เรียกหลังยืนยันแล้วว่าผู้ใช้แอด OA แล้วเท่านั้น)
 */
export async function completeLineLogin(
  request: NextRequest,
  lineUserId: string,
  returnTo: string,
): Promise<CompleteResult> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey =
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_DEFAULT_KEY;
  if (!url || !anonKey) return { error: 'line_login_unconfigured' };

  const { createSupabaseAdminClient } = await import('@/lib/supabase/admin');
  const admin: SupabaseClient = createSupabaseAdminClient();

  // หา profile by line_user_id — ไม่มี → provision (idempotent, สร้างบัญชี + STT trial)
  let email: string | null = null;
  let role: string | null = null;
  const { data: prof } = await admin
    .from('profiles')
    .select('id, email, is_active, role')
    .eq('line_user_id', lineUserId)
    .maybeSingle();
  if (prof) {
    if ((prof as { is_active?: boolean }).is_active === false) return { error: 'account_inactive' };
    email = (prof as { email?: string }).email ?? null;
    role = (prof as { role?: string }).role ?? null;
  } else {
    try {
      const result = await provisionLineUser(admin, lineUserId);
      const { data: p2 } = await admin.from('profiles').select('email, role').eq('id', result.profileId).maybeSingle();
      email = (p2 as { email?: string } | null)?.email ?? null;
      role = (p2 as { role?: string } | null)?.role ?? null;
    } catch {
      return { error: 'line_login_provision' };
    }
  }
  if (!email) return { error: 'account_missing' };

  // magic link → token_hash → verifyOtp → ตั้ง session cookies
  const { data: gl, error: ge } = await admin.auth.admin.generateLink({ type: 'magiclink', email });
  const tokenHash = gl?.properties?.hashed_token;
  if (ge || !tokenHash) return { error: 'login_failed' };

  // super_admin → admin console เสมอ (ข้าม returnTo ที่อาจเป็น deep link เก่า)
  const landing = role === 'super_admin' ? '/admin' : returnTo;
  const dest = new URL(withBasePath(landing), request.url);
  const response = NextResponse.redirect(dest);
  // ล้าง oauth + pending cookies
  response.cookies.set('line_oauth_state', '', { path: '/', maxAge: 0 });
  response.cookies.set('line_oauth_return', '', { path: '/', maxAge: 0 });
  response.cookies.set(PENDING_UID_COOKIE, '', { path: '/', maxAge: 0 });

  const supabase = createServerClient(url, anonKey, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet) {
        for (const c of cookiesToSet) response.cookies.set(c.name, c.value, c.options);
      },
    },
  });
  const { error: ve } = await supabase.auth.verifyOtp({ type: 'email', token_hash: tokenHash });
  if (ve) return { error: 'login_failed' };

  return { response };
}
