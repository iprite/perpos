/**
 * GET /line/callback?code=...&state=...
 *   — LINE Login OAuth callback: แลก code → access token → LINE userId →
 *     เช็คว่าแอด OA แล้วหรือยัง (เพื่อให้ระบบ track + push ได้)
 *       · ยังไม่แอด → onboard ให้แอดก่อน (redirect /line/add-friend) — ยังไม่ provision/login
 *       · แอดแล้ว → หา/สร้าง profile (provisionLineUser) → ตั้ง Supabase session → เข้าแอป
 *
 * userId ที่ได้จาก Login channel = line_user_id เดียวกับ Messaging channel
 * ต่อเมื่อทั้งสอง channel อยู่ provider เดียวกัน (เงื่อนไขการตั้งค่า)
 */

import { NextResponse, type NextRequest } from 'next/server';
import { withBasePath } from '@/utils/base-path';
import { appBaseUrl, completeLineLogin, isLineFriend, PENDING_UID_COOKIE } from '../_session';

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

  // 2. แลก code → access token → ดึง LINE profile → userId
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

  // 3. ด่านสำคัญ: ต้องแอด OA ก่อน ระบบถึงจะ track + push ได้ → ยังไม่แอด = onboard ก่อน login
  //    (fail-open: null = ไม่ทราบสถานะ ปล่อยผ่าน กันล็อกเอาต์ทั้งระบบเวลา LINE API ล่ม)
  const friend = await isLineFriend(lineUserId);
  if (friend === false) {
    const dest = new URL(withBasePath('/line/add-friend'), request.url);
    const response = NextResponse.redirect(dest);
    const cookieOpts = { httpOnly: true, secure: true, sameSite: 'lax' as const, path: '/', maxAge: 900 };
    // เก็บ uid + returnTo ไว้ verify ซ้ำหลังผู้ใช้แอด OA (ไม่ต้อง re-OAuth)
    response.cookies.set(PENDING_UID_COOKIE, lineUserId, cookieOpts);
    response.cookies.set('line_oauth_return', returnTo, cookieOpts);
    response.cookies.set('line_oauth_state', '', { path: '/', maxAge: 0 });
    return response;
  }

  // 4. แอดแล้ว (หรือไม่ทราบสถานะ) → provision + ตั้ง session + เข้าแอป
  const result = await completeLineLogin(request, lineUserId, returnTo);
  if ('error' in result) return signin(result.error);
  return result.response;
}
