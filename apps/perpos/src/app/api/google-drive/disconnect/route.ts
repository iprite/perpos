import { NextRequest, NextResponse } from 'next/server';
import { requireUser } from '../../_lib/auth';
import { createAdminClient } from '../../_lib/supabase';

export async function POST(req: NextRequest) {
  const auth = await requireUser(req);
  if (!auth.ok) return auth.res;

  const admin = createAdminClient();
  await admin.from('google_drive_tokens').delete().eq('profile_id', auth.userId);

  return NextResponse.json({ ok: true });
}
