/**
 * GET /line/claim?t=<oneTimeToken>
 *   — magic link จาก LINE: ตรวจ token → ล็อกอินผู้ใช้อัตโนมัติ (ตั้ง session cookies) →
 *     ส่งไปหน้า claim (ตั้ง email/password) ถ้ายังเป็น shadow account
 */

import { createServerClient } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';
import { createSupabaseAdminClient } from '@/lib/supabase/admin';
import { withBasePath } from '@/utils/base-path';


export async function GET(request: NextRequest) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_DEFAULT_KEY;
  const signin = (err?: string) => {
    const dest = new URL(withBasePath('/signin'), request.url);
    if (err) dest.searchParams.set('error', err);
    return NextResponse.redirect(dest);
  };

  const t = new URL(request.url).searchParams.get('t');
  if (!url || !anonKey || !t) return signin('link_invalid');

  const admin = createSupabaseAdminClient();

  // 1. validate token — ใช้ซ้ำได้จนหมดอายุ (ไม่ block ที่ used_at)
  //    เหตุ: LINE link-preview bot prefetch URL ทันทีที่ส่งข้อความ (~2 วิ) ถ้า one-time
  //    bot จะกิน token ก่อน → พอ user กดจริงจะ link_expired → เด้งไป /signin
  //    แต่ละ GET generate Supabase magic link ใหม่ของตัวเอง การ prefetch จึงไม่กระทบ
  //    การ login จริงของ user · ความเสี่ยง reuse ต่ำ (อายุ 5 นาที + ลิงก์ส่งเข้าแชทเจ้าตัวเท่านั้น)
  const { data: row } = await admin
    .from('web_login_tokens')
    .select('profile_id, expires_at, used_at')
    .eq('token', t)
    .maybeSingle();
  if (!row || new Date(row.expires_at as string) < new Date()) return signin('link_expired');
  // บันทึกเวลาใช้ครั้งแรกไว้เป็น audit (ไม่ block การใช้ซ้ำในช่วงยังไม่หมดอายุ)
  if (!row.used_at) await admin.from('web_login_tokens').update({ used_at: new Date().toISOString() }).eq('token', t);

  // 2. email ของ user
  const { data: prof } = await admin.from('profiles').select('email').eq('id', row.profile_id as string).maybeSingle();
  const email = (prof as { email?: string } | null)?.email;
  if (!email) return signin('account_missing');

  // 3. magic link → token_hash
  const { data: gl, error: ge } = await admin.auth.admin.generateLink({ type: 'magiclink', email });
  const tokenHash = gl?.properties?.hashed_token;
  if (ge || !tokenHash) return signin('login_failed');

  // 4. verifyOtp ผ่าน SSR client → ตั้ง session cookies → เข้าแอป (LINE-only, ไม่ต้องตั้ง password)
  const dest = new URL(withBasePath('/'), request.url);
  const response = NextResponse.redirect(dest);
  const supabase = createServerClient(url, anonKey, {
    cookies: {
      getAll() { return request.cookies.getAll(); },
      setAll(cookiesToSet) { for (const c of cookiesToSet) response.cookies.set(c.name, c.value, c.options); },
    },
  });
  const { error: ve } = await supabase.auth.verifyOtp({ type: 'email', token_hash: tokenHash });
  if (ve) return signin('login_failed');

  return response;
}
