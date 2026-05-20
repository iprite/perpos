import { NextRequest, NextResponse } from 'next/server';
import { requireUser } from '../../_lib/auth';
import { createAdminClient } from '../../_lib/supabase';
import crypto from 'crypto';

export async function POST(req: NextRequest) {
  const auth = await requireUser(req);
  if (!auth.ok) return auth.res;

  const oaIdRaw = (process.env.LINE_OA_ID ?? '').trim();
  const oaId = oaIdRaw ? (oaIdRaw.startsWith('@') ? oaIdRaw : `@${oaIdRaw}`) : '';
  if (!oaId) return NextResponse.json({ error: 'LINE OA not configured' }, { status: 500 });

  const admin = createAdminClient();
  const expiresAt = new Date(Date.now() + 10 * 60 * 1000).toISOString();
  const linkToken = crypto.randomUUID();

  const { error } = await admin.from('line_link_tokens').insert({
    token: linkToken,
    profile_id: auth.userId,
    expires_at: expiresAt,
    used_at: null,
  });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const message = `LINK ${linkToken}`;
  const linkUrl = `https://line.me/R/oaMessage/${oaId}/?${encodeURIComponent(message)}`;

  return NextResponse.json({ ok: true, token: linkToken, expiresAt, linkUrl });
}
