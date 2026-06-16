/**
 * /api/admin/impersonate
 *
 * Super Admin impersonation session management.
 * Sessions expire in 30 minutes and are fully audited.
 *
 * GET  ?sessionId=xxx        → get session info (verify still active)
 * GET  (no params)           → list active sessions for this admin
 * POST { targetUserId, orgId, reason } → start impersonation session
 * DELETE { sessionId }       → end session immediately
 */

import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '../../_lib/auth';
import { createAdminClient } from '../../_lib/supabase';
import { logAdminAction } from '../../_lib/admin-audit';

const SESSION_DURATION_MS = 30 * 60 * 1000; // 30 minutes

export async function GET(req: NextRequest) {
  const auth = await requireAdmin(req);
  if (!auth.ok) return auth.res;

  const admin = createAdminClient();
  const sessionId = req.nextUrl.searchParams.get('sessionId');

  if (sessionId) {
    // Verify a specific session
    const { data: session, error } = await admin
      .from('impersonation_sessions')
      .select(`
        id, reason, started_at, ended_at, is_active,
        target_user:profiles!impersonation_sessions_target_user_id_fkey(id, email, display_name),
        org:organizations!impersonation_sessions_org_id_fkey(id, name, slug)
      `)
      .eq('id', sessionId)
      .eq('super_admin_id', auth.userId)
      .maybeSingle();

    if (error || !session) {
      return NextResponse.json({ error: 'session not found' }, { status: 404 });
    }

    const s = session as Record<string, unknown>;

    // Auto-expire if older than 30 min
    const startedAt = new Date(s.started_at as string);
    const isExpired = Date.now() - startedAt.getTime() > SESSION_DURATION_MS;

    if (isExpired && s.is_active) {
      await admin
        .from('impersonation_sessions')
        .update({ is_active: false, ended_at: new Date().toISOString() })
        .eq('id', sessionId);
      return NextResponse.json({ ...s, is_active: false, expired: true });
    }

    return NextResponse.json(s);
  }

  // List active sessions for this admin
  const { data: sessions } = await admin
    .from('impersonation_sessions')
    .select(`
      id, reason, started_at, is_active,
      target_user:profiles!impersonation_sessions_target_user_id_fkey(id, email, display_name),
      org:organizations!impersonation_sessions_org_id_fkey(id, name)
    `)
    .eq('super_admin_id', auth.userId)
    .eq('is_active', true)
    .order('started_at', { ascending: false })
    .limit(20);

  return NextResponse.json({ sessions: sessions ?? [] });
}

export async function POST(req: NextRequest) {
  const auth = await requireAdmin(req);
  if (!auth.ok) return auth.res;

  const body = await req.json().catch(() => null) as Record<string, unknown> | null;
  const { targetUserId, orgId, reason } = body ?? {};

  // ── Validation ─────────────────────────────────────────────────────────────
  if (!targetUserId || typeof targetUserId !== 'string') {
    return NextResponse.json({ error: 'missing targetUserId' }, { status: 400 });
  }
  if (!orgId || typeof orgId !== 'string') {
    return NextResponse.json({ error: 'missing orgId' }, { status: 400 });
  }
  if (!reason || typeof reason !== 'string' || !reason.trim()) {
    return NextResponse.json({ error: 'reason is required' }, { status: 400 });
  }
  if (targetUserId === auth.userId) {
    return NextResponse.json({ error: 'cannot impersonate yourself' }, { status: 400 });
  }

  const admin = createAdminClient();

  // ── Verify target user ─────────────────────────────────────────────────────
  const { data: targetProfile } = await admin
    .from('profiles')
    .select('id, email, display_name, role')
    .eq('id', targetUserId)
    .maybeSingle();

  if (!targetProfile) {
    return NextResponse.json({ error: 'target user not found' }, { status: 404 });
  }

  const tp = targetProfile as Record<string, unknown>;

  if (tp.role === 'super_admin') {
    return NextResponse.json({ error: 'cannot impersonate another super admin' }, { status: 403 });
  }

  // ── Verify org exists ──────────────────────────────────────────────────────
  const { data: org } = await admin
    .from('organizations')
    .select('id, name, slug')
    .eq('id', orgId)
    .maybeSingle();

  if (!org) {
    return NextResponse.json({ error: 'organization not found' }, { status: 404 });
  }

  // ── End any existing active sessions for this admin ────────────────────────
  await admin
    .from('impersonation_sessions')
    .update({ is_active: false, ended_at: new Date().toISOString() })
    .eq('super_admin_id', auth.userId)
    .eq('is_active', true);

  // ── Create new session ─────────────────────────────────────────────────────
  const { data: session, error: sessionErr } = await admin
    .from('impersonation_sessions')
    .insert({
      super_admin_id: auth.userId,
      target_user_id: targetUserId,
      org_id:         orgId,
      reason:         String(reason).trim(),
    })
    .select('id, started_at')
    .single();

  if (sessionErr || !session) {
    return NextResponse.json(
      { error: sessionErr?.message ?? 'สร้าง session ไม่สำเร็จ' },
      { status: 500 },
    );
  }

  const s = session as Record<string, unknown>;
  const expiresAt = new Date(
    new Date(s.started_at as string).getTime() + SESSION_DURATION_MS,
  ).toISOString();

  await logAdminAction(req, auth.userId, {
    action: 'impersonate.start',
    targetType: 'user',
    targetId: targetUserId,
    targetLabel: (tp.email as string | undefined) ?? (tp.display_name as string | undefined) ?? null,
    metadata: { org_id: orgId, reason: String(reason).trim(), session_id: s.id },
  });

  return NextResponse.json({
    ok:        true,
    sessionId: s.id,
    expiresAt,
    targetUser: {
      id:          tp.id,
      email:       tp.email,
      displayName: tp.display_name,
    },
    org: {
      id:   (org as Record<string, unknown>).id,
      name: (org as Record<string, unknown>).name,
      slug: (org as Record<string, unknown>).slug,
    },
  }, { status: 201 });
}

export async function DELETE(req: NextRequest) {
  const auth = await requireAdmin(req);
  if (!auth.ok) return auth.res;

  // Accept sessionId from body or query string
  let sessionId: string | null = req.nextUrl.searchParams.get('sessionId');
  if (!sessionId) {
    const body = await req.json().catch(() => null) as Record<string, unknown> | null;
    sessionId = (body?.sessionId as string | undefined) ?? null;
  }

  if (!sessionId) {
    return NextResponse.json({ error: 'missing sessionId' }, { status: 400 });
  }

  const admin = createAdminClient();

  const { error } = await admin
    .from('impersonation_sessions')
    .update({ is_active: false, ended_at: new Date().toISOString() })
    .eq('id', sessionId)
    .eq('super_admin_id', auth.userId); // Can only end your own sessions

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  await logAdminAction(req, auth.userId, {
    action: 'impersonate.end',
    targetType: 'impersonation_session',
    targetId: sessionId,
  });

  return NextResponse.json({ ok: true });
}
