import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '../../../_lib/auth';
import { createAdminClient } from '../../../_lib/supabase';
import { withBasePath } from '@/utils/base-path';

export async function POST(req: NextRequest) {
  const auth = await requireAdmin(req);
  if (!auth.ok) return auth.res;

  const body = await req.json().catch(() => ({})) as { email?: string; redirectTo?: string };
  const { email, redirectTo } = body;
  if (!email) return NextResponse.json({ error: 'missing email' }, { status: 400 });

  const admin = createAdminClient();
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'https://perpos.io';
  const finalRedirect = redirectTo ?? `${baseUrl}${withBasePath('/auth/password')}`;

  const { data, error } = await admin.auth.admin.generateLink({
    type: 'recovery',
    email,
    options: { redirectTo: finalRedirect },
  });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const actionLink =
    ((data as unknown as Record<string, Record<string, string>>)?.properties)?.action_link ?? null;

  return NextResponse.json({ ok: true, actionLink });
}
