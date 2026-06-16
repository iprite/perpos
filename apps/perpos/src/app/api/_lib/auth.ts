import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient, createAuthedClient } from './supabase';

export function extractBearer(req: NextRequest): string | null {
  const auth = req.headers.get('authorization') ?? req.headers.get('Authorization') ?? '';
  return auth.startsWith('Bearer ') ? auth.slice(7) : null;
}

type AuthResult =
  | { ok: true; userId: string; token: string }
  | { ok: false; res: NextResponse };

/** Verify Bearer token + check profiles.role = 'super_admin' */
export async function requireAdmin(req: NextRequest): Promise<AuthResult> {
  const token = extractBearer(req);
  if (!token) return { ok: false, res: NextResponse.json({ error: 'unauthorized' }, { status: 401 }) };

  try {
    const rls = createAuthedClient(token);
    const { data: { user }, error } = await rls.auth.getUser();
    if (error || !user) return { ok: false, res: NextResponse.json({ error: 'unauthorized' }, { status: 401 }) };

    const admin = createAdminClient();
    const { data: profile } = await admin.from('profiles').select('role, is_active').eq('id', user.id).maybeSingle();
    if (profile?.role !== 'super_admin') return { ok: false, res: NextResponse.json({ error: 'forbidden' }, { status: 403 }) };
    if (profile?.is_active === false) return { ok: false, res: NextResponse.json({ error: 'account_inactive' }, { status: 403 }) };

    return { ok: true, userId: user.id, token };
  } catch {
    return { ok: false, res: NextResponse.json({ error: 'unauthorized' }, { status: 401 }) };
  }
}

/** Verify Bearer token + check profiles.is_active = true */
export async function requireUser(req: NextRequest): Promise<AuthResult> {
  const token = extractBearer(req);
  if (!token) return { ok: false, res: NextResponse.json({ error: 'unauthorized' }, { status: 401 }) };

  try {
    const rls = createAuthedClient(token);
    const { data: { user }, error } = await rls.auth.getUser();
    if (error || !user) return { ok: false, res: NextResponse.json({ error: 'unauthorized' }, { status: 401 }) };

    const admin = createAdminClient();
    const { data: profile } = await admin.from('profiles').select('is_active').eq('id', user.id).maybeSingle();
    if (profile?.is_active === false) return { ok: false, res: NextResponse.json({ error: 'account_inactive' }, { status: 403 }) };

    return { ok: true, userId: user.id, token };
  } catch {
    return { ok: false, res: NextResponse.json({ error: 'unauthorized' }, { status: 401 }) };
  }
}

/** Verify CRON_SECRET for scheduler endpoints */
export function requireCron(req: NextRequest): NextResponse | null {
  const secret = process.env.CRON_SECRET;
  if (!secret) return null; // No secret set — allow all (dev)

  const vercelHeader = req.headers.get('x-vercel-cron-secret');
  if (vercelHeader === secret) return null;

  const auth = req.headers.get('authorization') ?? '';
  if (auth === `Bearer ${secret}`) return null;

  return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
}
