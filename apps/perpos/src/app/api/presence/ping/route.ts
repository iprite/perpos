import { NextRequest, NextResponse } from 'next/server';
import { requireUser } from '../../_lib/auth';
import { createAdminClient } from '../../_lib/supabase';

/**
 * Heartbeat — client ยิงทุก ~60 วิ เพื่ออัปเดต last_seen_at
 * ใช้โชว์สถานะ "ออนไลน์" ในหน้า admin/users (online = last_seen_at < 2 นาที)
 */
export async function POST(req: NextRequest) {
  const auth = await requireUser(req);
  if (!auth.ok) return auth.res;

  const admin = createAdminClient();
  const { error } = await admin
    .from('profiles')
    .update({ last_seen_at: new Date().toISOString() })
    .eq('id', auth.userId);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ ok: true });
}
