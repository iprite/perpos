import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '../../_lib/supabase';

export type MobileAuth = {
  ok: true;
  profileId: string;
  orgId: string;
  displayName: string;
} | {
  ok: false;
  res: NextResponse;
};

/** ดึง token จาก Authorization header หรือ query param ?t= */
function extractToken(req: NextRequest): string {
  const t = req.nextUrl.searchParams.get('t');
  if (t) return t;
  const auth = req.headers.get('Authorization') ?? '';
  if (auth.startsWith('Bearer ')) return auth.slice(7);
  return '';
}

/** Validate mobile token — ใช้แทน requireTmcMember สำหรับ page มือถือ */
export async function requireMobileToken(req: NextRequest): Promise<MobileAuth> {
  const token = extractToken(req);
  if (!token) {
    return { ok: false, res: NextResponse.json({ error: 'missing token' }, { status: 401 }) };
  }

  const admin = createAdminClient();
  const { data } = await admin
    .from('tmc_mobile_tokens')
    .select('profile_id, org_id, expires_at')
    .eq('id', token)
    .maybeSingle();

  if (!data) {
    return { ok: false, res: NextResponse.json({ error: 'invalid token' }, { status: 401 }) };
  }
  if (new Date(data.expires_at as string) < new Date()) {
    return { ok: false, res: NextResponse.json({ error: 'token expired' }, { status: 401 }) };
  }

  const row = data as { profile_id: string; org_id: string; expires_at: string };

  const method = (req.method ?? 'GET').toUpperCase();
  const isMutating = method === 'POST' || method === 'PUT' || method === 'PATCH' || method === 'DELETE';
  if (isMutating) {
    const [{ data: org }, { data: billing }] = await Promise.all([
      admin.from('organizations').select('maintenance_mode').eq('id', row.org_id).maybeSingle(),
      admin.from('org_billing').select('payment_status, overdue_count').eq('org_id', row.org_id).maybeSingle(),
    ]);

    if ((org as Record<string, unknown> | null)?.maintenance_mode === true) {
      return { ok: false, res: NextResponse.json({ error: 'maintenance_mode' }, { status: 503 }) };
    }

    const b = billing as Record<string, unknown> | null;
    const isOverdue = String(b?.payment_status ?? '') === 'overdue';
    const overdueCount = Number(b?.overdue_count ?? 0);
    if (isOverdue && overdueCount >= 2) {
      return { ok: false, res: NextResponse.json({ error: 'billing_overdue_readonly' }, { status: 402 }) };
    }
  }

  // ดึงชื่อ profile
  const { data: profile } = await admin
    .from('profiles')
    .select('full_name, email')
    .eq('id', row.profile_id)
    .maybeSingle();

  const p = profile as { full_name: string | null; email: string } | null;
  const displayName = p?.full_name ?? p?.email ?? 'Unknown';

  return { ok: true, profileId: row.profile_id, orgId: row.org_id, displayName };
}

/** สร้างหรือ refresh token สำหรับ profile (upsert โดย delete เก่า + insert ใหม่) */
export async function upsertMobileToken(profileId: string, orgId: string): Promise<string> {
  const admin = createAdminClient();
  // ลบ token เก่าของ profile นี้
  await admin.from('tmc_mobile_tokens').delete().eq('profile_id', profileId).eq('org_id', orgId);
  // สร้างใหม่
  const { data } = await admin
    .from('tmc_mobile_tokens')
    .insert({ profile_id: profileId, org_id: orgId })
    .select('id')
    .single();
  return (data as { id: string }).id;
}
