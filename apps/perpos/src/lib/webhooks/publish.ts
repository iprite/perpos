/**
 * Webhook Publisher — src/lib/webhooks/publish.ts
 *
 * Fire-and-forget delivery to all active webhooks subscribed to an event.
 *
 * Usage:
 *   // After creating a finance entry:
 *   void publishWebhookEvent(orgId, 'finance.entry.created', { id, amount, ... });
 *
 * Security:
 *   - HMAC-SHA256 signature in X-PERPOS-Signature header when signing_secret is set
 *   - Internal IP allowlist enforced at DB level (url_not_internal constraint)
 *   - Payload size capped at 1 MB
 *   - Timeout: webhook.timeout_ms (default 10 s)
 *   - Retries: webhook.retry_count (default 3) with exponential back-off
 *
 * All deliveries are logged in webhook_delivery_logs (success + failure).
 */

import { createAdminClient } from '@/app/api/_lib/supabase';

const MAX_PAYLOAD_BYTES = 1_048_576; // 1 MB

// ── Types ─────────────────────────────────────────────────────────────────────

type WebhookRow = {
  id:             string;
  url:            string;
  signing_secret: string | null;
  timeout_ms:     number;
  retry_count:    number;
};

// ── Public API ─────────────────────────────────────────────────────────────────

/**
 * Deliver an event to all active webhooks for the given org + eventType.
 * Returns immediately — delivery is async.
 */
export function publishWebhookEvent(
  orgId:     string,
  eventType: string,
  payload:   unknown,
): void {
  void _publish(orgId, eventType, payload);
}

// ── Internal ──────────────────────────────────────────────────────────────────

async function _publish(
  orgId:     string,
  eventType: string,
  payload:   unknown,
): Promise<void> {
  const admin = createAdminClient();

  // Find all active webhooks for this org that subscribe to this event
  const { data: hooks } = await admin
    .from('tenant_webhooks')
    .select('id, url, signing_secret, timeout_ms, retry_count')
    .eq('org_id', orgId)
    .eq('is_active', true)
    .contains('event_types', [eventType]);

  if (!hooks || hooks.length === 0) return;

  const body = JSON.stringify({
    event:      eventType,
    org_id:     orgId,
    delivered_at: new Date().toISOString(),
    data:       payload,
  });

  if (Buffer.byteLength(body, 'utf8') > MAX_PAYLOAD_BYTES) {
    console.warn(`[webhook] payload too large for event ${eventType} (org: ${orgId})`);
    return;
  }

  await Promise.allSettled(
    (hooks as WebhookRow[]).map((hook) =>
      deliverWithRetry(admin, hook, eventType, body),
    ),
  );
}

async function deliverWithRetry(
  admin:     ReturnType<typeof createAdminClient>,
  hook:      WebhookRow,
  eventType: string,
  body:      string,
): Promise<void> {
  const maxAttempts = Math.max(1, Math.min(hook.retry_count, 5));

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    const t0 = Date.now();
    let responseStatus: number | null = null;
    let responseBody:   string | null = null;
    let success = false;

    try {
      const sig = hook.signing_secret
        ? await computeHmac(hook.signing_secret, body)
        : null;

      const controller = new AbortController();
      const timeout    = setTimeout(() => controller.abort(), hook.timeout_ms);

      const res = await fetch(hook.url, {
        method:  'POST',
        headers: {
          'Content-Type':       'application/json',
          'X-PERPOS-Event':     eventType,
          'X-PERPOS-Attempt':   String(attempt),
          ...(sig ? { 'X-PERPOS-Signature': `sha256=${sig}` } : {}),
        },
        body,
        signal: controller.signal,
      }).finally(() => clearTimeout(timeout));

      responseStatus = res.status;
      responseBody   = (await res.text().catch(() => '')).slice(0, 1000);
      success        = res.status >= 200 && res.status < 300;
    } catch (err: unknown) {
      responseBody = err instanceof Error ? err.message : String(err);
    }

    const latency_ms = Date.now() - t0;

    // Log delivery attempt (fire-and-forget)
    void admin.from('webhook_delivery_logs').insert({
      webhook_id:      hook.id,
      event_type:      eventType,
      payload:         JSON.parse(body) as Record<string, unknown>,
      response_status: responseStatus,
      response_body:   responseBody,
      latency_ms,
      attempt_no:      attempt,
      success,
    });

    if (success) return;

    // Exponential back-off before retry: 1s, 2s, 4s …
    if (attempt < maxAttempts) {
      await sleep(Math.min(1000 * 2 ** (attempt - 1), 8000));
    }
  }
}

// ── Helpers ───────────────────────────────────────────────────────────────────

async function computeHmac(secret: string, body: string): Promise<string> {
  const enc     = new TextEncoder();
  const keyData = enc.encode(secret);
  const msgData = enc.encode(body);

  const key = await crypto.subtle.importKey(
    'raw', keyData,
    { name: 'HMAC', hash: 'SHA-256' },
    false, ['sign'],
  );
  const sig  = await crypto.subtle.sign('HMAC', key, msgData);
  return Buffer.from(sig).toString('hex');
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
