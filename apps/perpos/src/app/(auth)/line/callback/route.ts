/**
 * GET /line/callback?code=...&state=...
 *   — LINE Login OAuth callback: แลก code → access token → LINE userId →
 *     หา/สร้าง profile (provisionLineUser) → ตั้ง Supabase session → redirect เข้าแอป
 *
 * userId ที่ได้จาก Login channel = line_user_id เดียวกับ Messaging channel
 * ต่อเมื่อทั้งสอง channel อยู่ provider เดียวกัน (เงื่อนไขการตั้งค่า)
 */

import { createServerClient } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';
import { createSupabaseAdminClient } from '@/lib/supabase/admin';
import { provisionLineUser } from '@/app/api/line/_provision';
import { withBasePath } from '@/utils/base-path';

const SHADOW_DOMAIN = '@stt-line.perpos.io';

function appBaseUrl(): string {
  return (process.env.APP_BASE_URL ?? 'https://app.perpos.io').replace(/\/$/, '');
}

export async function GET(request: NextRequest) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_DEFAULT_KEY;
  const signin = (err?: string) => {
    const dest = new URL(withBasePath('/signin'), request.url);
    if (err) dest.searchParams.set('error', err);
    return NextResponse.redirect(dest);
  };

  const reqUrl = new URL(request.url);
  const code = reqUrl.searchParams.get('code');
  const state = reqUrl.searchParams.get('state');
  const oauthError = reqUrl.searchParams.get('error');

  if (oauthError) return signin('line_login_denied');

  // 1. ตรวจ state (CSRF) เทียบกับ cookie
  const cookieState = request.cookies.get('line_oauth_state')?.value;
  const returnToRaw = request.cookies.get('line_oauth_return')?.value;
  const returnTo = returnToRaw && returnToRaw.startsWith('/') && !returnToRaw.startsWith('//') ? returnToRaw : '/';
  if (!url || !anonKey || !code || !state || !cookieState || state !== cookieState) {
    return signin('line_login_state');
  }

  const channelId = process.env.LINE_LOGIN_CHANNEL_ID;
  const channelSecret = process.env.LINE_LOGIN_CHANNEL_SECRET;
  if (!channelId || !channelSecret) return signin('line_login_unconfigured');

  const redirectUri = `${appBaseUrl()}${withBasePath('/line/callback')}`;

  // 2. แลก code → access token
  let lineUserId: string;
  try {
    const tokenRes = await fetch('https://api.line.me/oauth2/v2.1/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'authorization_code',
        code,
        redirect_uri: redirectUri,
        client_id: channelId,
        client_secret: channelSecret,
      }),
    });
    if (!tokenRes.ok) return signin('line_login_token');
    const tok = (await tokenRes.json()) as { access_token?: string };
    if (!tok.access_token) return signin('line_login_token');

    // 3. ดึง LINE profile → userId
    const profRes = await fetch('https://api.line.me/v2/profile', {
      headers: { Authorization: `Bearer ${tok.access_token}` },
    });
    if (!profRes.ok) return signin('line_login_profile');
    const lp = (await profRes.json()) as { userId?: string };
    if (!lp.userId) return signin('line_login_profile');
    lineUserId = lp.userId;
  } catch {
    return signin('line_login_failed');
  }

  const admin = createSupabaseAdminClient();

  // 4. หา profile by line_user_id — ไม่มี → provision (idempotent, สร้างบัญชี + STT trial)
  let email: string | null = null;
  const { data: prof } = await admin.from('profiles').select('id, email, is_active').eq('line_user_id', lineUserId).maybeSingle();
  if (prof) {
    if ((prof as { is_active?: boolean }).is_active === false) return signin('account_inactive');
    email = (prof as { email?: string }).email ?? null;
  } else {
    try {
      const result = await provisionLineUser(admin, lineUserId);
      const { data: p2 } = await admin.from('profiles').select('email').eq('id', result.profileId).maybeSingle();
      email = (p2 as { email?: string } | null)?.email ?? null;
    } catch {
      return signin('line_login_provision');
    }
  }
  if (!email) return signin('account_missing');
  const isShadow = email.endsWith(SHADOW_DOMAIN);

  // 5. magic link → token_hash → verifyOtp → ตั้ง session cookies
  const { data: gl, error: ge } = await admin.auth.admin.generateLink({ type: 'magiclink', email });
  const tokenHash = gl?.properties?.hashed_token;
  if (ge || !tokenHash) return signin('login_failed');

  // shadow → ไป /claim-account (ตั้ง email/password ถ้าอยาก, optional) · real → returnTo
  const dest = new URL(withBasePath(isShadow ? '/claim-account' : returnTo), request.url);
  const response = NextResponse.redirect(dest);
  // ล้าง oauth cookies
  response.cookies.set('line_oauth_state', '', { path: '/', maxAge: 0 });
  response.cookies.set('line_oauth_return', '', { path: '/', maxAge: 0 });

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
