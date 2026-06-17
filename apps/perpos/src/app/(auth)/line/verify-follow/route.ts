/**
 * GET /line/verify-follow
 *   — ผู้ใช้กด "ตรวจสอบอีกครั้ง" หลังแอด OA จากหน้า /line/add-friend
 *     อ่าน line_pending_uid (httpOnly cookie ที่ callback ตั้งไว้) → เช็คเป็นเพื่อนแล้วหรือยัง
 *       · เป็นเพื่อนแล้ว → จบ login (provision + session) → เข้าแอป
 *       · ยังไม่ → กลับหน้า add-friend พร้อม ?status=notyet
 *       · cookie หมดอายุ/หาย → กลับไป signin ให้ login ใหม่
 *
 * ไม่ต้อง re-OAuth — friendship เช็คด้วย Messaging token ฝั่ง server โดยใช้แค่ lineUserId
 */

import { NextResponse, type NextRequest } from 'next/server';
import { withBasePath } from '@/utils/base-path';
import { completeLineLogin, isLineFriend, PENDING_UID_COOKIE } from '../_session';

export async function GET(request: NextRequest) {
  const lineUserId = request.cookies.get(PENDING_UID_COOKIE)?.value;
  const returnToRaw = request.cookies.get('line_oauth_return')?.value;
  const returnTo = returnToRaw && returnToRaw.startsWith('/') && !returnToRaw.startsWith('//') ? returnToRaw : '/';

  // cookie หาย/หมดอายุ → login ใหม่
  if (!lineUserId) {
    return NextResponse.redirect(new URL(withBasePath('/signin'), request.url));
  }

  const friend = await isLineFriend(lineUserId);
  if (friend === false) {
    const dest = new URL(withBasePath('/line/add-friend'), request.url);
    dest.searchParams.set('status', 'notyet');
    return NextResponse.redirect(dest);
  }

  // เป็นเพื่อนแล้ว (หรือไม่ทราบสถานะ — fail-open) → จบ login
  const result = await completeLineLogin(request, lineUserId, returnTo);
  if ('error' in result) {
    const dest = new URL(withBasePath('/signin'), request.url);
    dest.searchParams.set('error', result.error);
    return NextResponse.redirect(dest);
  }
  return result.response;
}
