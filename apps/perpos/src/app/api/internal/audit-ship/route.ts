/**
 * POST /api/internal/audit-ship
 *
 * Batch-ships unshipped audit_log entries to configured external destination(s).
 * Currently supports Axiom. Add Cloudflare R2 / S3 Object Lock as additional sinks.
 *
 * Authentication: same CRON_SECRET used by the assistant scheduler.
 *
 * Trigger: call from Google Cloud Scheduler every 5 minutes:
 *   POST https://perpos.ai/api/internal/audit-ship
 *   Authorization: Bearer <CRON_SECRET>
 *
 * Env vars:
 *   CRON_SECRET        — guards this endpoint
 *   AXIOM_API_TOKEN    — Axiom API token (enable shipping to Axiom)
 *   AXIOM_DATASET      — Axiom dataset name (default: "audit_logs")
 */

import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '../../_lib/supabase';

const BATCH_SIZE = 200;

// ─── Auth ─────────────────────────────────────────────────────────────────────

function isAuthorized(req: NextRequest): boolean {
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret) return false;
  const auth = req.headers.get('authorization') ?? '';
  const vercel = req.headers.get('x-vercel-cron-secret') ?? '';
  return auth === `Bearer ${cronSecret}` || vercel === cronSecret;
}

// ─── Axiom sink ───────────────────────────────────────────────────────────────

async function shipToAxiom(entries: AuditRow[]): Promise<void> {
  const token   = process.env.AXIOM_API_TOKEN;
  const dataset = process.env.AXIOM_DATASET ?? 'audit_logs';
  if (!token) return; // not configured — skip silently

  // Map to Axiom ingest format (requires _time field)
  const payload = entries.map((e) => ({
    _time:       e.logged_at,
    sequence_no: e.sequence_no,
    action:      e.action,
    table_name:  e.table_name,
    record_id:   e.record_id,
    org_id:      e.org_id,
    actor_id:    e.actor_id,
    diff_keys:   e.diff_keys,
    payload_hash: e.payload_hash,
    chain_hash:   e.chain_hash,
    ip_address:  e.ip_address,
    user_agent:  e.user_agent,
    request_id:  e.request_id,
    // Include data snapshot (stripped of secrets if any)
    old_data:    e.old_data,
    new_data:    e.new_data,
  }));

  const res = await fetch(
    `https://api.axiom.co/v1/datasets/${dataset}/ingest`,
    {
      method:  'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type':  'application/json',
      },
      body: JSON.stringify(payload),
    },
  );

  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`Axiom ingest failed ${res.status}: ${body}`);
  }
}

// ─── Types ────────────────────────────────────────────────────────────────────

type AuditRow = {
  id:           string;
  sequence_no:  number;
  org_id:       string | null;
  actor_id:     string | null;
  action:       string;
  table_name:   string;
  record_id:    string | null;
  old_data:     Record<string, unknown> | null;
  new_data:     Record<string, unknown> | null;
  diff_keys:    string[] | null;
  payload_hash: string;
  chain_hash:   string;
  ip_address:   string | null;
  user_agent:   string | null;
  request_id:   string | null;
  logged_at:    string;
};

type ShipResult = {
  destination: string;
  shipped:     number;
  last_seq:    number;
  skipped?:    string;
  error?:      string;
};

// ─── Handler ──────────────────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  if (!isAuthorized(req)) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  const admin = createAdminClient();
  const results: ShipResult[] = [];

  // ── Process each destination ────────────────────────────────────────────────
  const { data: cursors, error: cursorErr } = await admin
    .from('audit_ship_cursors')
    .select('*');

  if (cursorErr) {
    return NextResponse.json({ error: cursorErr.message }, { status: 500 });
  }

  for (const cursor of (cursors ?? [])) {
    const dest    = cursor.destination as string;
    const lastSeq = (cursor.last_seq as number) ?? 0;

    // Skip destinations without required config
    if (dest === 'axiom' && !process.env.AXIOM_API_TOKEN) {
      results.push({ destination: dest, shipped: 0, last_seq: lastSeq, skipped: 'AXIOM_API_TOKEN not set' });
      continue;
    }

    // Fetch batch of unshipped entries
    const { data: entries, error: fetchErr } = await admin
      .from('audit_logs')
      .select('*')
      .gt('sequence_no', lastSeq)
      .order('sequence_no', { ascending: true })
      .limit(BATCH_SIZE) as { data: AuditRow[] | null; error: unknown };

    if (fetchErr || !entries || entries.length === 0) {
      results.push({
        destination: dest,
        shipped:     0,
        last_seq:    lastSeq,
        skipped:     entries?.length === 0 ? 'nothing new' : undefined,
        error:       fetchErr ? String(fetchErr) : undefined,
      });
      continue;
    }

    // Ship to destination
    try {
      if (dest === 'axiom') await shipToAxiom(entries);
      // Add more destinations here: if (dest === 'r2') await shipToR2(entries);

      const maxSeq = entries[entries.length - 1].sequence_no;

      // Update cursor
      await admin.from('audit_ship_cursors').update({
        last_seq:        maxSeq,
        last_shipped_at: new Date().toISOString(),
        total_shipped:   (cursor.total_shipped ?? 0) + entries.length,
        error_count:     0,
        last_error:      null,
        updated_at:      new Date().toISOString(),
      }).eq('destination', dest);

      results.push({ destination: dest, shipped: entries.length, last_seq: maxSeq });

    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);

      // Record error in cursor
      await admin.from('audit_ship_cursors').update({
        error_count: (cursor.error_count ?? 0) + 1,
        last_error:  msg,
        updated_at:  new Date().toISOString(),
      }).eq('destination', dest);

      results.push({ destination: dest, shipped: 0, last_seq: lastSeq, error: msg });
    }
  }

  const totalShipped = results.reduce((s, r) => s + r.shipped, 0);
  return NextResponse.json({ ok: true, totalShipped, results });
}
