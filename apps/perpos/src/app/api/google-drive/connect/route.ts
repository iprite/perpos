import { NextRequest, NextResponse } from 'next/server';
import { requireUser } from '../../_lib/auth';
import { buildGoogleConnectUrl } from '@/lib/google/oauth-state';

export async function POST(req: NextRequest) {
  const auth = await requireUser(req);
  if (!auth.ok) return auth.res;

  const origin = req.headers.get('origin') ?? req.nextUrl.origin;
  try {
    const url = buildGoogleConnectUrl(auth.userId, origin);
    return NextResponse.json({ ok: true, url });
  } catch {
    return NextResponse.json({ error: 'Google OAuth not configured' }, { status: 500 });
  }
}
