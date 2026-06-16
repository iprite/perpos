/**
 * Super admin: ดูบันทึกการจัดการของแอดมิน (admin_audit_log)
 *   GET /api/admin/admin-audit?action=&actor=&from=&to=&page=&limit=
 */

import { NextRequest } from 'next/server';
import { requireAdmin } from '../../_lib/auth';
import { createAdminClient } from '../../_lib/supabase';
import { ok, Err } from '../../_lib/response';

export async function GET(req: NextRequest) {
  const auth = await requireAdmin(req);
  if (!auth.ok) return auth.res;

  const p = req.nextUrl.searchParams;
  const page = Math.max(1, Number(p.get('page') ?? 1));
  const limit = Math.min(200, Math.max(1, Number(p.get('limit') ?? 50)));
  const from = page === 1 ? 0 : (page - 1) * limit;
  const to = from + limit - 1;

  const admin = createAdminClient();
  let q = admin
    .from('admin_audit_log')
    .select('id, actor_id, actor_email, action, target_type, target_id, target_label, metadata, ip_address, created_at', { count: 'exact' })
    .order('created_at', { ascending: false })
    .range(from, to);

  const action = p.get('action');
  const actor = p.get('actor');
  const dFrom = p.get('from');
  const dTo = p.get('to');
  if (action) q = q.eq('action', action);
  if (actor) q = q.eq('actor_id', actor);
  if (dFrom) q = q.gte('created_at', dFrom);
  if (dTo) q = q.lte('created_at', dTo);

  const { data, error, count } = await q;
  if (error) return Err.dbError(error);

  // รายการ action ที่มี (สำหรับ filter dropdown)
  const { data: actionsRaw } = await admin.from('admin_audit_log').select('action').limit(1000);
  const actions = Array.from(new Set((actionsRaw ?? []).map((r) => r.action as string))).sort();

  return ok({ items: data ?? [], total: count ?? 0, page, limit, actions });
}
