/**
 * Audit context enrichment helper
 *
 * Architecture:
 * - Tier 1 (always): DB trigger auto-extracts actor_id (from created_by/user_id)
 *   and org_id (from org_id column) directly from row data — 100% reliable.
 * - Tier 2 (best-effort): this helper sets session-level GUCs for IP / UA /
 *   request_id, which are only available from the HTTP request context.
 *   Works when PostgREST reuses the same DB session for the subsequent mutation.
 *   If the connection differs (PgBouncer transaction mode), Tier 1 still captures
 *   the critical attribution data.
 */

import { type NextRequest } from 'next/server';
import { createAdminClient } from './supabase';

export async function setAuditContext(
  req: NextRequest,
  userId: string,
  orgId?: string,
): Promise<void> {
  const ip =
    req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ??
    req.headers.get('x-real-ip') ??
    null;
  const ua    = req.headers.get('user-agent') ?? null;
  const reqId = req.headers.get('x-request-id') ?? crypto.randomUUID();

  try {
    const admin = createAdminClient();
    await admin.rpc('set_audit_context', {
      p_actor_id: userId,
      p_org_id:   orgId ?? null,
      p_ip:       ip,
      p_ua:       ua,
      p_req_id:   reqId,
    });
  } catch {
    // Non-fatal — Tier 1 row-data extraction still captures actor/org.
  }
}
