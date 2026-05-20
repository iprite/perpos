import { NextRequest, NextResponse } from 'next/server';
import { requireUser } from '../../_lib/auth';
import crypto from 'crypto';

const GOOGLE_SCOPES = [
  'https://www.googleapis.com/auth/drive.file',
  'https://www.googleapis.com/auth/calendar.events',
].join(' ');

function createSignedState(profileId: string): string {
  const secret = (process.env.GOOGLE_OAUTH_STATE_SECRET ?? '').trim();
  if (!secret) throw new Error('Missing GOOGLE_OAUTH_STATE_SECRET');
  const payload = { pid: profileId, iat: Date.now(), nonce: crypto.randomUUID() };
  const encoded = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const sig = crypto.createHmac('sha256', secret).update(encoded).digest('base64url');
  return `${encoded}.${sig}`;
}

export async function POST(req: NextRequest) {
  const auth = await requireUser(req);
  if (!auth.ok) return auth.res;

  const clientId = (process.env.GOOGLE_OAUTH_CLIENT_ID ?? '').trim();
  if (!clientId) return NextResponse.json({ error: 'Google OAuth not configured' }, { status: 500 });

  const origin = req.headers.get('origin') ?? req.nextUrl.origin;
  const explicit = (process.env.GOOGLE_OAUTH_DRIVE_REDIRECT_URI ?? '').trim();
  const redirectUri = explicit || `${origin}/api/google-drive/callback`;

  const state = createSignedState(auth.userId);
  const url = new URL('https://accounts.google.com/o/oauth2/v2/auth');
  url.searchParams.set('client_id', clientId);
  url.searchParams.set('redirect_uri', redirectUri);
  url.searchParams.set('response_type', 'code');
  url.searchParams.set('scope', GOOGLE_SCOPES);
  url.searchParams.set('access_type', 'offline');
  url.searchParams.set('prompt', 'consent');
  url.searchParams.set('include_granted_scopes', 'true');
  url.searchParams.set('state', state);

  return NextResponse.json({ ok: true, url: url.toString() });
}
