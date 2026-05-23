/**
 * /api/admin/webhooks
 *
 * CRUD for tenant webhooks + delivery log viewer.
 *
 * GET  ?orgId=                       → list webhooks for org (+ recent delivery stats)
 * GET  ?webhookId=&logs=1            → delivery logs for a specific webhook
 * POST { orgId, name, url, eventTypes, signingSecret?, timeoutMs?, retryCount? }
 * PUT  { id, name?, url?, eventTypes?, signingSecret?, isActive?, timeoutMs?, retryCount? }
 * DELETE ?id=                        → delete webhook + its logs
 *
 * POST ?test=1 { id }               → send test ping to webhook
 */

import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '../../_lib/auth';
import { createAdminClient } from '../../_lib/supabase';

// Basic URL safety check (mirrors DB constraint)
const INTERNAL_IP_RE = /^https?:\/\/(localhost|127\.|0\.|169\.254\.|10\.|192\.168\.|172\.(1[6-9]|2[0-9]|3[01])\.)/i;

function validateUrl(url: string): string | null {
  if (!url.startsWith('http://') && !url.startsWith('https://')) {
    return 'URL ต้องขึ้นต้นด้วย http:// หรือ https://';
  }
  if (INTERNAL_IP_RE.test(url)) {
    return 'ห้ามใช้ internal IP addresses หรือ localhost';
  }
  return null;
}

export async function GET(req: NextRequest) {
  const auth = await requireAdmin(req);
  if (!auth.ok) return auth.res;

  const p         = req.nextUrl.searchParams;
  const orgId     = p.get('orgId');
  const webhookId = p.get('webhookId');
  const showLogs  = p.get('logs') === '1';

  const admin = createAdminClient();

  // List orgs for the selector
  const { data: orgs } = await admin
    .from('organizations')
    .select('id, name')
    .order('name');

  if (!orgId && !webhookId) {
    return NextResponse.json({ orgs: orgs ?? [], webhooks: [] });
  }

  // Delivery logs for a specific webhook
  if (webhookId && showLogs) {
    const { data: logs, error } = await admin
      .from('webhook_delivery_logs')
      .select('id, event_type, response_status, response_body, latency_ms, attempt_no, success, delivered_at')
      .eq('webhook_id', webhookId)
      .order('delivered_at', { ascending: false })
      .limit(100);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ logs: logs ?? [] });
  }

  // List webhooks for org
  if (orgId) {
    const { data: webhooks, error } = await admin
      .from('tenant_webhooks')
      .select('id, name, url, event_types, is_active, timeout_ms, retry_count, created_at, updated_at')
      .eq('org_id', orgId)
      .order('created_at', { ascending: false });
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    // Attach recent delivery stats per webhook
    const webhookIds = (webhooks ?? []).map((w) => (w as Record<string, unknown>).id as string);
    let statsMap: Record<string, { total: number; success: number; last_at: string | null }> = {};

    if (webhookIds.length > 0) {
      const { data: stats } = await admin
        .from('webhook_delivery_logs')
        .select('webhook_id, success, delivered_at')
        .in('webhook_id', webhookIds)
        .gte('delivered_at', new Date(Date.now() - 7 * 24 * 3600 * 1000).toISOString());

      for (const s of stats ?? []) {
        const ss = s as Record<string, unknown>;
        const wid = String(ss.webhook_id);
        if (!statsMap[wid]) statsMap[wid] = { total: 0, success: 0, last_at: null };
        statsMap[wid].total++;
        if (ss.success) statsMap[wid].success++;
        if (!statsMap[wid].last_at || String(ss.delivered_at) > statsMap[wid].last_at!) {
          statsMap[wid].last_at = String(ss.delivered_at);
        }
      }
    }

    const enriched = (webhooks ?? []).map((w) => {
      const ww = w as Record<string, unknown>;
      const stat = statsMap[String(ww.id)];
      return {
        ...ww,
        stats_7d: stat
          ? {
              total:       stat.total,
              success:     stat.success,
              success_pct: stat.total > 0 ? Math.round((stat.success / stat.total) * 100) : 100,
              last_at:     stat.last_at,
            }
          : null,
      };
    });

    return NextResponse.json({ orgs: orgs ?? [], webhooks: enriched });
  }

  return NextResponse.json({ orgs: orgs ?? [], webhooks: [] });
}

export async function POST(req: NextRequest) {
  const auth = await requireAdmin(req);
  if (!auth.ok) return auth.res;

  const p = req.nextUrl.searchParams;

  // Test ping
  if (p.get('test') === '1') {
    const body = await req.json().catch(() => null) as Record<string, unknown> | null;
    const id = body?.id as string | undefined;
    if (!id) return NextResponse.json({ error: 'missing id' }, { status: 400 });

    const admin = createAdminClient();
    const { data: hook } = await admin
      .from('tenant_webhooks')
      .select('id, url, signing_secret, timeout_ms, retry_count, org_id')
      .eq('id', id)
      .maybeSingle();

    if (!hook) return NextResponse.json({ error: 'webhook not found' }, { status: 404 });
    const h = hook as Record<string, unknown>;

    // Fire test ping
    const pingPayload = JSON.stringify({
      event:        'test.ping',
      org_id:       h.org_id,
      delivered_at: new Date().toISOString(),
      data:         { message: 'Test ping from PERPOS Super Admin' },
    });

    const t0 = Date.now();
    let responseStatus: number | null = null;
    let responseBody = '';
    let success = false;

    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), Number(h.timeout_ms) || 10000);
      const res = await fetch(String(h.url), {
        method:  'POST',
        headers: { 'Content-Type': 'application/json', 'X-PERPOS-Event': 'test.ping' },
        body:    pingPayload,
        signal:  controller.signal,
      }).finally(() => clearTimeout(timer));
      responseStatus = res.status;
      responseBody   = (await res.text().catch(() => '')).slice(0, 500);
      success        = res.status >= 200 && res.status < 300;
    } catch (e) {
      responseBody = e instanceof Error ? e.message : String(e);
    }

    await admin.from('webhook_delivery_logs').insert({
      webhook_id:      h.id,
      event_type:      'test.ping',
      payload:         { message: 'Test ping' },
      response_status: responseStatus,
      response_body:   responseBody,
      latency_ms:      Date.now() - t0,
      attempt_no:      1,
      success,
    });

    return NextResponse.json({ ok: true, success, responseStatus, responseBody, latencyMs: Date.now() - t0 });
  }

  // Create webhook
  const body = await req.json().catch(() => null) as Record<string, unknown> | null;
  const { orgId, name, url, eventTypes, signingSecret, timeoutMs, retryCount } = body ?? {};

  if (!orgId || typeof orgId !== 'string') return NextResponse.json({ error: 'missing orgId' },  { status: 400 });
  if (!name  || typeof name  !== 'string' || !String(name).trim()) return NextResponse.json({ error: 'missing name' }, { status: 400 });
  if (!url   || typeof url   !== 'string') return NextResponse.json({ error: 'missing url' },   { status: 400 });

  const urlErr = validateUrl(String(url));
  if (urlErr) return NextResponse.json({ error: urlErr }, { status: 400 });

  if (!Array.isArray(eventTypes) || eventTypes.length === 0) {
    return NextResponse.json({ error: 'eventTypes must be a non-empty array' }, { status: 400 });
  }

  const admin = createAdminClient();
  const { data: webhook, error } = await admin
    .from('tenant_webhooks')
    .insert({
      org_id:         orgId,
      name:           String(name).trim(),
      url:            String(url).trim(),
      event_types:    eventTypes.map(String),
      signing_secret: signingSecret ? String(signingSecret) : null,
      timeout_ms:     timeoutMs ? Math.max(1000, Math.min(30000, Number(timeoutMs))) : 10000,
      retry_count:    retryCount ? Math.max(0, Math.min(5, Number(retryCount))) : 3,
      created_by:     auth.userId,
    })
    .select('id, name, url, event_types, is_active')
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, webhook }, { status: 201 });
}

export async function PUT(req: NextRequest) {
  const auth = await requireAdmin(req);
  if (!auth.ok) return auth.res;

  const body = await req.json().catch(() => null) as Record<string, unknown> | null;
  const { id, name, url, eventTypes, signingSecret, isActive, timeoutMs, retryCount } = body ?? {};

  if (!id || typeof id !== 'string') return NextResponse.json({ error: 'missing id' }, { status: 400 });

  if (url !== undefined) {
    const urlErr = validateUrl(String(url));
    if (urlErr) return NextResponse.json({ error: urlErr }, { status: 400 });
  }

  const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (name        !== undefined) patch.name           = String(name).trim();
  if (url         !== undefined) patch.url            = String(url).trim();
  if (eventTypes  !== undefined) patch.event_types    = Array.isArray(eventTypes) ? eventTypes.map(String) : [];
  if (signingSecret !== undefined) patch.signing_secret = signingSecret ? String(signingSecret) : null;
  if (isActive    !== undefined) patch.is_active      = Boolean(isActive);
  if (timeoutMs   !== undefined) patch.timeout_ms     = Math.max(1000, Math.min(30000, Number(timeoutMs)));
  if (retryCount  !== undefined) patch.retry_count    = Math.max(0, Math.min(5, Number(retryCount)));

  const admin = createAdminClient();
  const { error } = await admin.from('tenant_webhooks').update(patch).eq('id', id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ ok: true });
}

export async function DELETE(req: NextRequest) {
  const auth = await requireAdmin(req);
  if (!auth.ok) return auth.res;

  const id = req.nextUrl.searchParams.get('id');
  if (!id) return NextResponse.json({ error: 'missing id' }, { status: 400 });

  const admin = createAdminClient();
  const { error } = await admin.from('tenant_webhooks').delete().eq('id', id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ ok: true });
}
