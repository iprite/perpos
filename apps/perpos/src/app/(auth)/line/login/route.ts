/**
 * GET /line/login?returnTo=/somewhere
 *   — เริ่ม LINE Login (OAuth 2.1): redirect ไปหน้า authorize ของ LINE
 *     ตั้ง state (CSRF) + returnTo เก็บใน httpOnly cookie → ตรวจตอน /line/callback
 *
 * ต้องตั้ง env: LINE_LOGIN_CHANNEL_ID, LINE_LOGIN_CHANNEL_SECRET
 *   และลงทะเบียน callback URL `${APP_BASE_URL}/line/callback` ใน LINE Login channel
 *   ⚠️ Login channel ต้องอยู่ provider เดียวกับ Messaging channel (userId ถึงตรงกัน)
 */

import { NextResponse, type NextRequest } from 'next/server';
import { randomBytes } from 'crypto';
import { withBasePath } from '@/utils/base-path';

function appBaseUrl(): string {
  return (process.env.APP_BASE_URL ?? 'https://app.perpos.ai').replace(/\/$/, '');
}

function sanitizeReturnTo(raw: string | null): string {
  if (!raw) return '/';
  let v = String(raw).trim();
  try { v = decodeURIComponent(v); } catch { /* keep raw */ }
  if (!v.startsWith('/') || v.startsWith('//') || v.startsWith('/api')) return '/';
  return v;
}

export async function GET(request: NextRequest) {
  const channelId = process.env.LINE_LOGIN_CHANNEL_ID;
  if (!channelId) {
    const dest = new URL(withBasePath('/signin'), request.url);
    dest.searchParams.set('error', 'line_login_unconfigured');
    return NextResponse.redirect(dest);
  }

  const returnTo = sanitizeReturnTo(new URL(request.url).searchParams.get('returnTo'));
  const state = randomBytes(24).toString('hex');
  const redirectUri = `${appBaseUrl()}${withBasePath('/line/callback')}`;

  const authorize = new URL('https://access.line.me/oauth2/v2.1/authorize');
  authorize.searchParams.set('response_type', 'code');
  authorize.searchParams.set('client_id', channelId);
  authorize.searchParams.set('redirect_uri', redirectUri);
  authorize.searchParams.set('state', state);
  authorize.searchParams.set('scope', 'profile openid');

  const response = NextResponse.redirect(authorize);
  const cookieOpts = { httpOnly: true, secure: true, sameSite: 'lax' as const, path: '/', maxAge: 600 };
  response.cookies.set('line_oauth_state', state, cookieOpts);
  response.cookies.set('line_oauth_return', returnTo, cookieOpts);
  return response;
}
