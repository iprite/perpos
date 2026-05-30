/**
 * /api/admin/module-registry
 *
 * GET    → list all modules with org name joined
 * POST   → create a new custom module (always specific, bound to 1 org)
 * PATCH  → update a module (key in body)
 * DELETE → delete a custom module (builtin protected)
 */

import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '../../_lib/auth';
import { createAdminClient } from '../../_lib/supabase';

const KEY_RE  = /^[a-z][a-z0-9_-]{1,48}[a-z0-9]$/;
const SLUG_RE = /^[a-z][a-z0-9-]{0,48}[a-z0-9]$|^[a-z]$/;

export async function GET(req: NextRequest) {
  const auth = await requireAdmin(req);
  if (!auth.ok) return auth.res;

  const admin = createAdminClient();
  const { data, error } = await admin
    .from('module_registry')
    .select('*, organizations(id, name, slug)')
    .order('sort_order')
    .order('created_at');

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ modules: data ?? [] });
}

export async function POST(req: NextRequest) {
  const auth = await requireAdmin(req);
  if (!auth.ok) return auth.res;

  const body = await req.json().catch(() => null) as Record<string, unknown> | null;
  const { key, label, href_slug, description, org_id, is_personal } = body ?? {};

  if (!key || typeof key !== 'string' || !KEY_RE.test(key)) {
    return NextResponse.json({ error: 'key ต้องเป็นตัวเล็ก a-z 0-9 _ - ความยาว 2-50' }, { status: 400 });
  }
  if (!label || typeof label !== 'string' || !label.trim()) {
    return NextResponse.json({ error: 'missing label' }, { status: 400 });
  }
  if (!href_slug || typeof href_slug !== 'string' || !SLUG_RE.test(href_slug)) {
    return NextResponse.json({ error: 'href_slug ต้องเป็นตัวเล็ก a-z 0-9 -' }, { status: 400 });
  }

  const isPersonal = Boolean(is_personal);
  // personal modules are never org-specific
  const isSpecific = isPersonal ? false : Boolean(body?.is_specific ?? true);

  const admin = createAdminClient();

  // Check key uniqueness
  const { data: existing } = await admin
    .from('module_registry')
    .select('id')
    .eq('key', key)
    .maybeSingle();
  if (existing) {
    return NextResponse.json({ error: `module key "${key}" ถูกใช้แล้ว` }, { status: 409 });
  }

  // Validate org_id — not applicable for personal modules
  if (!isPersonal && org_id) {
    const { data: org } = await admin.from('organizations').select('id').eq('id', org_id).maybeSingle();
    if (!org) return NextResponse.json({ error: 'org not found' }, { status: 404 });
  }

  const { data, error } = await admin
    .from('module_registry')
    .insert({
      key,
      label:       String(label).trim(),
      href_slug:   String(href_slug).trim(),
      description: description ? String(description).trim() : null,
      is_specific: isSpecific,
      is_personal: isPersonal,
      is_builtin:  false,
      is_active:   true,
      org_id:      isPersonal ? null : (org_id ?? null),
      created_by:  auth.userId,
    })
    .select('*, organizations(id, name, slug)')
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, module: data }, { status: 201 });
}

export async function PATCH(req: NextRequest) {
  const auth = await requireAdmin(req);
  if (!auth.ok) return auth.res;

  const body = await req.json().catch(() => null) as Record<string, unknown> | null;
  const { key, ...updates } = body ?? {};

  if (!key || typeof key !== 'string') {
    return NextResponse.json({ error: 'missing key' }, { status: 400 });
  }

  const admin = createAdminClient();

  const { data: mod } = await admin
    .from('module_registry')
    .select('is_builtin, is_specific, is_personal, org_id')
    .eq('key', key)
    .maybeSingle();

  if (!mod) return NextResponse.json({ error: 'module not found' }, { status: 404 });

  const m = mod as Record<string, unknown>;
  const allowed: Record<string, unknown> = {};

  // label + description + is_active + menu_labels — editable for all modules
  if (updates.label        !== undefined) allowed.label        = String(updates.label).trim();
  if (updates.description  !== undefined) allowed.description  = updates.description ? String(updates.description).trim() : null;
  if (updates.is_active    !== undefined) allowed.is_active    = Boolean(updates.is_active);
  if (updates.menu_labels  !== undefined && typeof updates.menu_labels === 'object' && updates.menu_labels !== null) {
    // Only store string values — sanitise
    const raw = updates.menu_labels as Record<string, unknown>;
    allowed.menu_labels = Object.fromEntries(
      Object.entries(raw)
        .filter(([, v]) => typeof v === 'string')
        .map(([k, v]) => [k, (v as string).trim()]),
    );
  }

  // href_slug + sort_order — only for non-builtin
  if (!m.is_builtin) {
    if (updates.href_slug  !== undefined) allowed.href_slug  = String(updates.href_slug).trim();
    if (updates.sort_order !== undefined) allowed.sort_order = Number(updates.sort_order);
  }

  // org_id — allowed for specific modules that are not yet bound
  if (m.is_specific && !m.org_id && Object.prototype.hasOwnProperty.call(updates, 'org_id')) {
    if (updates.org_id) {
      const { data: org } = await admin.from('organizations').select('id').eq('id', updates.org_id).maybeSingle();
      if (!org) return NextResponse.json({ error: 'org not found' }, { status: 404 });
    }
    allowed.org_id = updates.org_id || null;
  }

  allowed.updated_at = new Date().toISOString();

  const { data, error } = await admin
    .from('module_registry')
    .update(allowed)
    .eq('key', key)
    .select('*, organizations(id, name, slug)')
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, module: data });
}

export async function DELETE(req: NextRequest) {
  const auth = await requireAdmin(req);
  if (!auth.ok) return auth.res;

  const body = await req.json().catch(() => null) as Record<string, unknown> | null;
  const { key } = body ?? {};

  if (!key || typeof key !== 'string') {
    return NextResponse.json({ error: 'missing key' }, { status: 400 });
  }

  const admin = createAdminClient();

  const { data: mod } = await admin
    .from('module_registry')
    .select('is_builtin')
    .eq('key', key)
    .maybeSingle();

  if (!mod) return NextResponse.json({ error: 'module not found' }, { status: 404 });
  if ((mod as Record<string, unknown>).is_builtin) {
    return NextResponse.json({ error: 'ไม่สามารถลบ builtin module ได้' }, { status: 403 });
  }

  const { error } = await admin.from('module_registry').delete().eq('key', key);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
