import { NextRequest, NextResponse } from 'next/server';
import { requireUser } from '../../_lib/auth';
import { createAdminClient } from '../../_lib/supabase';

export async function GET(req: NextRequest) {
  const auth = await requireUser(req);
  if (!auth.ok) return auth.res;

  const admin = createAdminClient();
  const { data: row } = await admin
    .from('google_drive_tokens')
    .select('profile_id, expires_at, drive_root_folder_id')
    .eq('profile_id', auth.userId)
    .maybeSingle();

  return NextResponse.json({
    ok: true,
    connected: Boolean(row?.profile_id),
    expiresAt: (row?.expires_at as string | null) ?? null,
    folderId: (row?.drive_root_folder_id as string | null) ?? null,
  });
}
