/**
 * GET /api/admin/audit-logs
 *
 * Super-admin only. Returns paginated audit log entries.
 *
 * Query params:
 *   table      — filter by table_name
 *   action     — INSERT | UPDATE | DELETE
 *   from       — ISO date (logged_at >=)
 *   to         — ISO date (logged_at <=)
 *   actor      — actor_id (uuid)
 *   page       — 1-based page (default 1)
 *   limit      — max 200 (default 50)
 *   detail=1   — include old_data/new_data (single record by &id=)
 *   id         — uuid of single entry (use with detail=1)
 *   shipping   — "1" to return audit_ship_cursors status instead of entries
 */

import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '../../_lib/auth';
import { createAdminClient } from '../../_lib/supabase';

export async function GET(req: NextRequest) {
  const auth = await requireAdmin(req);
  if (!auth.ok) return auth.res;

  const p      = req.nextUrl.searchParams;
  const admin  = createAdminClient();

  // ── Shipping status ──────────────────────────────────────────────────────────
  if (p.get('shipping') === '1') {
    const { data, error } = await admin
      .from('audit_ship_cursors')
      .select('*')
      .order('destination');
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    // Also count unshipped entries
    const results = await Promise.all(
      (data ?? []).map(async (cursor) => {
        const { count } = await admin
          .from('audit_logs')
          .select('*', { count: 'exact', head: true })
          .gt('sequence_no', cursor.last_seq ?? 0);
        return { ...cursor, unshipped: count ?? 0 };
      }),
    );
    return NextResponse.json(results);
  }

  // ── Single entry detail ──────────────────────────────────────────────────────
  if (p.get('detail') === '1') {
    const id = p.get('id') ?? '';
    if (!id) return NextResponse.json({ error: 'missing id' }, { status: 400 });

    const { data, error } = await admin
      .from('audit_logs')
      .select('*, profiles:actor_id(display_name, email)')
      .eq('id', id)
      .maybeSingle();
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json(data);
  }

  // ── Paginated list ───────────────────────────────────────────────────────────
  const table   = p.get('table')  ?? '';
  const action  = p.get('action') ?? '';
  const from    = p.get('from')   ?? '';
  const to      = p.get('to')     ?? '';
  const actorId = p.get('actor')  ?? '';
  const page    = Math.max(1, Number(p.get('page')  ?? '1'));
  const limit   = Math.min(200,  Number(p.get('limit') ?? '50'));
  const offset  = (page - 1) * limit;

  let q = admin
    .from('audit_logs')
    .select(
      `id, sequence_no, action, table_name, record_id,
       org_id, actor_id, diff_keys,
       payload_hash, chain_hash,
       ip_address, user_agent, request_id,
       logged_at,
       profiles:actor_id(display_name, email)`,
      { count: 'exact' },
    )
    .order('sequence_no', { ascending: false });

  if (table)   q = q.eq('table_name', table);
  if (action)  q = q.eq('action', action);
  if (from)    q = q.gte('logged_at', from);
  if (to)      q = q.lte('logged_at', to + 'T23:59:59Z');
  if (actorId) q = q.eq('actor_id', actorId);

  q = q.range(offset, offset + limit - 1);

  const { data, error, count } = await q;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ entries: data ?? [], total: count ?? 0, page, limit });
}
