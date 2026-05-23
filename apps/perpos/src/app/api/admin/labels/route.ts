/**
 * /api/admin/labels
 *
 * Manage per-org label overrides (terminology customization).
 *
 * GET  ?orgId=&locale=th   → list all labels with any org overrides merged in
 * PUT  { orgId, locale, overrides: { [labelKey]: string | null } }
 *      → upsert/delete overrides (null value = remove override)
 */

import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '../../_lib/auth';
import { createAdminClient } from '../../_lib/supabase';
import { ALL_LABEL_KEYS, DEFAULT_LABELS } from '@/lib/labels/defaults';

export async function GET(req: NextRequest) {
  const auth = await requireAdmin(req);
  if (!auth.ok) return auth.res;

  const p      = req.nextUrl.searchParams;
  const orgId  = p.get('orgId');
  const locale = p.get('locale') ?? 'th';

  const admin = createAdminClient();

  // Always return orgs list for the selector
  const { data: orgs } = await admin
    .from('organizations')
    .select('id, name')
    .order('name');

  if (!orgId) {
    return NextResponse.json({ orgs: orgs ?? [], labels: [] });
  }

  // Load this org's overrides for the given locale
  const { data: overrideRows, error } = await admin
    .from('org_label_overrides')
    .select('label_key, value')
    .eq('org_id', orgId)
    .eq('locale', locale);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const overrideMap: Record<string, string> = {};
  for (const row of overrideRows ?? []) {
    overrideMap[(row as Record<string, string>).label_key] = (row as Record<string, string>).value;
  }

  // Merge defaults + overrides into a flat list
  const labels = ALL_LABEL_KEYS.map((key) => ({
    key,
    default_value: DEFAULT_LABELS[key] ?? key,
    override:      overrideMap[key] ?? null,
  }));

  return NextResponse.json({ orgs: orgs ?? [], labels });
}

export async function PUT(req: NextRequest) {
  const auth = await requireAdmin(req);
  if (!auth.ok) return auth.res;

  const body = await req.json().catch(() => null) as Record<string, unknown> | null;
  const { orgId, locale = 'th', overrides } = body ?? {};

  if (!orgId || typeof orgId !== 'string') {
    return NextResponse.json({ error: 'missing orgId' }, { status: 400 });
  }
  if (typeof locale !== 'string' || !['th', 'en'].includes(locale)) {
    return NextResponse.json({ error: 'locale must be "th" or "en"' }, { status: 400 });
  }
  if (!overrides || typeof overrides !== 'object' || Array.isArray(overrides)) {
    return NextResponse.json({ error: 'overrides must be an object' }, { status: 400 });
  }

  const overrideMap = overrides as Record<string, string | null>;
  const now = new Date().toISOString();

  const admin = createAdminClient();

  const toUpsert: { org_id: string; label_key: string; locale: string; value: string; updated_by: string; updated_at: string }[] = [];
  const toDelete: string[] = [];

  for (const [key, value] of Object.entries(overrideMap)) {
    // Only allow keys from the registry
    if (!Object.prototype.hasOwnProperty.call(DEFAULT_LABELS, key)) continue;

    if (value === null || value === '') {
      toDelete.push(key);
    } else {
      toUpsert.push({
        org_id:     orgId,
        label_key:  key,
        locale:     String(locale),
        value:      String(value).trim(),
        updated_by: auth.userId,
        updated_at: now,
      });
    }
  }

  // Upsert overrides
  if (toUpsert.length > 0) {
    const { error } = await admin
      .from('org_label_overrides')
      .upsert(toUpsert, { onConflict: 'org_id,label_key,locale' });
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // Delete cleared overrides
  if (toDelete.length > 0) {
    const { error } = await admin
      .from('org_label_overrides')
      .delete()
      .eq('org_id', orgId)
      .eq('locale', locale)
      .in('label_key', toDelete);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({
    ok:      true,
    upserted: toUpsert.length,
    deleted:  toDelete.length,
  });
}
