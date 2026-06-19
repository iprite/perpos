/**
 * GET /line/connect-calendar
 *   — ปลายทางหลัง /line/claim (มี session แล้ว): เริ่ม Google OAuth เชื่อม Calendar
 *     ใช้ session cookies หา profile → สร้าง consent URL → redirect ไป Google
 *     (เชื่อมผ่าน LINE: การ์ดใน LINE → claim?next=/line/connect-calendar → ที่นี่ → Google)
 */

import { createServerClient } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';
import { withBasePath } from '@/utils/base-path';
import { buildGoogleConnectUrl } from '@/lib/google/oauth-state';

export async function GET(request: NextRequest) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_DEFAULT_KEY;
  const signin = () => NextResponse.redirect(new URL(withBasePath('/signin'), request.url));
  if (!url || !anonKey) return signin();

  const supabase = createServerClient(url, anonKey, {
    cookies: {
      getAll() { return request.cookies.getAll(); },
      setAll() { /* read-only */ },
    },
  });
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return signin();

  try {
    const origin = request.nextUrl.origin;
    return NextResponse.redirect(buildGoogleConnectUrl(user.id, origin));
  } catch {
    return NextResponse.redirect(new URL(withBasePath('/assistant'), request.url));
  }
}
