/**
 * POST /api/admin/onboarding
 *
 * Creates a new organization with initial module settings and owner account.
 * Optionally sends an invite email to the owner.
 *
 * Body:
 *   name        string   — Organization display name
 *   slug        string   — URL slug (alphanumeric + hyphens, unique)
 *   moduleKeys  string[] — Shared modules to enable immediately
 *   ownerEmail  string   — Owner's email (will receive invite)
 */

import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '../../_lib/auth';
import { createAdminClient } from '../../_lib/supabase';
import { ALL_MODULES } from '@/lib/modules';

const SLUG_RE = /^[a-z0-9][a-z0-9-]{1,48}[a-z0-9]$/;

export async function POST(req: NextRequest) {
  const auth = await requireAdmin(req);
  if (!auth.ok) return auth.res;

  const body = await req.json().catch(() => null) as Record<string, unknown> | null;
  const { name, slug, moduleKeys, ownerEmail } = body ?? {};

  // ── Validation ────────────────────────────────────────────────────────────────
  if (!name || typeof name !== 'string' || !name.trim()) {
    return NextResponse.json({ error: 'missing name' }, { status: 400 });
  }
  if (!slug || typeof slug !== 'string' || !SLUG_RE.test(slug)) {
    return NextResponse.json(
      { error: 'slug ต้องเป็นตัวเล็ก a-z 0-9 และ - ความยาว 3-50 ตัวอักษร' },
      { status: 400 },
    );
  }
  if (!ownerEmail || typeof ownerEmail !== 'string' || !ownerEmail.includes('@')) {
    return NextResponse.json({ error: 'missing or invalid ownerEmail' }, { status: 400 });
  }
  const modules = (Array.isArray(moduleKeys) ? moduleKeys : []) as string[];
  // Only allow modules that exist in registry and are not specific
  const validModuleKeys = modules.filter((k) =>
    ALL_MODULES.some((m) => m.key === k && !m.specific),
  );

  const admin = createAdminClient();

  // ── Check slug uniqueness ─────────────────────────────────────────────────────
  const { data: existing } = await admin
    .from('organizations')
    .select('id')
    .eq('slug', slug)
    .maybeSingle();
  if (existing) {
    return NextResponse.json({ error: `slug "${slug}" ถูกใช้แล้ว` }, { status: 409 });
  }

  // ── Create organization ───────────────────────────────────────────────────────
  const { data: org, error: orgErr } = await admin
    .from('organizations')
    .insert({ name: String(name).trim(), slug, created_by: auth.userId })
    .select('id, name, slug')
    .single();

  if (orgErr || !org) {
    return NextResponse.json({ error: orgErr?.message ?? 'สร้างองค์กรไม่สำเร็จ' }, { status: 500 });
  }

  const orgId = (org as Record<string, string>).id;

  // ── Enable selected modules ───────────────────────────────────────────────────
  if (validModuleKeys.length > 0) {
    const moduleRows = validModuleKeys.map((key) => ({
      organization_id: orgId,
      module_key:      key,
      is_enabled:      true,
      allowed_roles:   ['owner', 'admin'],
    }));
    const { error: modErr } = await admin
      .from('org_module_settings')
      .insert(moduleRows);
    if (modErr) {
      // Non-fatal: org created, just log the error
      console.error('[onboarding] module settings error', modErr.message);
    }
  }

  // ── Find or invite owner user ─────────────────────────────────────────────────
  let ownerId: string | null = null;

  // Check if user already exists
  const { data: existingUser } = await admin
    .from('profiles')
    .select('id')
    .eq('email', ownerEmail)
    .maybeSingle();

  if (existingUser) {
    ownerId = (existingUser as Record<string, string>).id;
  } else {
    // Invite new user via Supabase auth admin
    const { data: inviteData, error: inviteErr } = await admin.auth.admin.inviteUserByEmail(
      ownerEmail,
      { data: { invited_to_org: orgId, invited_as: 'owner' } },
    );
    if (!inviteErr && inviteData?.user) {
      ownerId = inviteData.user.id;
    } else {
      console.error('[onboarding] invite error', inviteErr?.message);
    }
  }

  // ── Add owner to organization ─────────────────────────────────────────────────
  if (ownerId) {
    const { error: memberErr } = await admin
      .from('organization_members')
      .insert({
        organization_id: orgId,
        user_id:         ownerId,
        role:            'owner',
      });
    if (memberErr) {
      console.error('[onboarding] add owner error', memberErr.message);
    }
  }

  return NextResponse.json({
    ok:  true,
    org: { id: orgId, name: (org as Record<string, string>).name, slug },
    ownerInvited: !existingUser,
    modulesEnabled: validModuleKeys,
  }, { status: 201 });
}

// ── GET: check slug availability ──────────────────────────────────────────────
export async function GET(req: NextRequest) {
  const auth = await requireAdmin(req);
  if (!auth.ok) return auth.res;

  const slug = req.nextUrl.searchParams.get('checkSlug');
  if (!slug) return NextResponse.json({ error: 'missing checkSlug' }, { status: 400 });

  const admin = createAdminClient();
  const { data } = await admin
    .from('organizations')
    .select('id')
    .eq('slug', slug)
    .maybeSingle();

  return NextResponse.json({ available: !data });
}
