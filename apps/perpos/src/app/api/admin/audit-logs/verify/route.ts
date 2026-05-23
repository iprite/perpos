/**
 * GET /api/admin/audit-logs/verify?table=tmc_finance_entries
 *
 * Calls verify_audit_chain(table) and returns a summary:
 *   { table, total, broken, entries: [...] }
 *
 * entries only returned when broken > 0 or count <= 500
 * (avoids huge payloads on large tables).
 */

import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '../../../_lib/auth';
import { createAdminClient } from '../../../_lib/supabase';

type VerifyRow = {
  seq_no:     number;
  chain_hash: string;
  expected:   string;
  ok:         boolean;
};

export async function GET(req: NextRequest) {
  const auth = await requireAdmin(req);
  if (!auth.ok) return auth.res;

  const table = req.nextUrl.searchParams.get('table') ?? '';
  if (!table) return NextResponse.json({ error: 'missing table' }, { status: 400 });

  const admin = createAdminClient();

  const { data, error } = await admin.rpc('verify_audit_chain', {
    p_table_name: table,
  }) as { data: VerifyRow[] | null; error: unknown };

  if (error) return NextResponse.json({ error: String(error) }, { status: 500 });

  const rows   = data ?? [];
  const total  = rows.length;
  const broken = rows.filter((r) => !r.ok).length;

  // Return full rows only when there are problems or a small table
  const entries = broken > 0 || total <= 500 ? rows : [];

  return NextResponse.json({ table, total, broken, ok: broken === 0, entries });
}
