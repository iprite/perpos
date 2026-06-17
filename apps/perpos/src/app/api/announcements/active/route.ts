/**
 * Active announcements สำหรับ in-app banner (ผู้ใช้ที่ล็อกอินทุกคน)
 *   GET /api/announcements/active  — คืนประกาศที่ is_active + อยู่ในช่วงเวลา
 *
 * อ่านผ่าน service role (createAdminClient) — announcements ไม่มี RLS read policy
 */

import { NextRequest } from 'next/server';
import { requireUser } from '../../_lib/auth';
import { createAdminClient } from '../../_lib/supabase';
import { ok } from '../../_lib/response';

export async function GET(req: NextRequest) {
  const auth = await requireUser(req);
  if (!auth.ok) return auth.res;

  const admin = createAdminClient();
  const nowIso = new Date().toISOString();
  const { data, error } = await admin
    .from('announcements')
    .select('id, title, body, level, starts_at, ends_at')
    .eq('is_active', true)
    .or(`starts_at.is.null,starts_at.lte.${nowIso}`)
    .or(`ends_at.is.null,ends_at.gte.${nowIso}`)
    .order('created_at', { ascending: false })
    .limit(5);

  if (error) return ok({ announcements: [] }); // อย่าให้ banner ล้มทั้งแอป
  return ok({ announcements: data ?? [] });
}
