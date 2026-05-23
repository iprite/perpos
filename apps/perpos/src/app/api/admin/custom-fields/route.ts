/**
 * /api/admin/custom-fields
 *
 * Manage per-org custom field definitions (EAV-lite via JSONB).
 * Values are stored in `custom_properties` column on each target table.
 *
 * GET  ?orgId=&moduleKey=&entityType=  → list fields for an org/module/entity
 * POST { orgId, moduleKey, entityType, fieldKey, labelTh, labelEn?,
 *         fieldType, selectOptions?, isRequired?, sortOrder? }  → create
 * PUT  { id, labelTh, labelEn?, fieldType, selectOptions?,
 *         isRequired?, sortOrder? }                             → update
 * DELETE ?id=                                                   → delete
 */

import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '../../_lib/auth';
import { createAdminClient } from '../../_lib/supabase';

const FIELD_KEY_RE     = /^[a-z][a-z0-9_]{0,62}$/;
const RESERVED_KEYS    = new Set([
  'id', 'org_id', 'organization_id', 'created_at', 'updated_at',
  'created_by', 'updated_by', 'deleted_at', 'is_active',
]);
const VALID_FIELD_TYPES = ['text', 'number', 'date', 'select', 'boolean'] as const;

// ── GET ───────────────────────────────────────────────────────────────────────
export async function GET(req: NextRequest) {
  const auth = await requireAdmin(req);
  if (!auth.ok) return auth.res;

  const p = req.nextUrl.searchParams;
  const orgId      = p.get('orgId');
  const moduleKey  = p.get('moduleKey');
  const entityType = p.get('entityType');

  const admin = createAdminClient();

  // If orgId only → return list of orgs (for the org selector)
  if (!orgId) {
    const { data: orgs } = await admin
      .from('organizations')
      .select('id, name')
      .order('name');
    return NextResponse.json({ orgs: orgs ?? [] });
  }

  let q = admin
    .from('org_custom_fields')
    .select('id, module_key, entity_type, field_key, label_th, label_en, field_type, select_options, is_required, sort_order, created_at')
    .eq('org_id', orgId)
    .order('sort_order', { ascending: true })
    .order('created_at',  { ascending: true });

  if (moduleKey)  q = q.eq('module_key',  moduleKey);
  if (entityType) q = q.eq('entity_type', entityType);

  const { data: fields, error } = await q;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ fields: fields ?? [] });
}

// ── POST ──────────────────────────────────────────────────────────────────────
export async function POST(req: NextRequest) {
  const auth = await requireAdmin(req);
  if (!auth.ok) return auth.res;

  const body = await req.json().catch(() => null) as Record<string, unknown> | null;
  const {
    orgId, moduleKey, entityType,
    fieldKey, labelTh, labelEn,
    fieldType = 'text', selectOptions,
    isRequired = false, sortOrder = 0,
  } = body ?? {};

  // Validation
  if (!orgId      || typeof orgId      !== 'string') return NextResponse.json({ error: 'missing orgId' },      { status: 400 });
  if (!moduleKey  || typeof moduleKey  !== 'string') return NextResponse.json({ error: 'missing moduleKey' },  { status: 400 });
  if (!entityType || typeof entityType !== 'string') return NextResponse.json({ error: 'missing entityType' }, { status: 400 });
  if (!fieldKey   || typeof fieldKey   !== 'string' || !FIELD_KEY_RE.test(fieldKey)) {
    return NextResponse.json({ error: 'fieldKey ต้องเป็น snake_case ตัวพิมพ์เล็ก a-z 0-9 _' }, { status: 400 });
  }
  if (RESERVED_KEYS.has(fieldKey)) {
    return NextResponse.json({ error: `fieldKey "${fieldKey}" เป็น reserved key` }, { status: 400 });
  }
  if (!labelTh || typeof labelTh !== 'string' || !labelTh.trim()) {
    return NextResponse.json({ error: 'missing labelTh' }, { status: 400 });
  }
  if (!VALID_FIELD_TYPES.includes(fieldType as typeof VALID_FIELD_TYPES[number])) {
    return NextResponse.json({ error: `fieldType ต้องเป็น: ${VALID_FIELD_TYPES.join(', ')}` }, { status: 400 });
  }
  if (fieldType === 'select' && !Array.isArray(selectOptions)) {
    return NextResponse.json({ error: 'selectOptions required for type=select' }, { status: 400 });
  }

  const admin = createAdminClient();

  const { data: field, error } = await admin
    .from('org_custom_fields')
    .insert({
      org_id:         orgId,
      module_key:     String(moduleKey),
      entity_type:    String(entityType),
      field_key:      fieldKey,
      label_th:       String(labelTh).trim(),
      label_en:       labelEn ? String(labelEn).trim() : null,
      field_type:     fieldType,
      select_options: selectOptions ?? null,
      is_required:    Boolean(isRequired),
      sort_order:     Number(sortOrder) || 0,
      created_by:     auth.userId,
    })
    .select('id, field_key, label_th, field_type, sort_order')
    .single();

  if (error) {
    if (error.code === '23505') {
      return NextResponse.json({ error: `field_key "${fieldKey}" ซ้ำกับที่มีอยู่แล้ว` }, { status: 409 });
    }
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true, field }, { status: 201 });
}

// ── PUT ───────────────────────────────────────────────────────────────────────
export async function PUT(req: NextRequest) {
  const auth = await requireAdmin(req);
  if (!auth.ok) return auth.res;

  const body = await req.json().catch(() => null) as Record<string, unknown> | null;
  const { id, labelTh, labelEn, fieldType, selectOptions, isRequired, sortOrder } = body ?? {};

  if (!id || typeof id !== 'string') {
    return NextResponse.json({ error: 'missing id' }, { status: 400 });
  }
  if (labelTh !== undefined && (typeof labelTh !== 'string' || !String(labelTh).trim())) {
    return NextResponse.json({ error: 'labelTh cannot be empty' }, { status: 400 });
  }
  if (fieldType !== undefined && !VALID_FIELD_TYPES.includes(fieldType as typeof VALID_FIELD_TYPES[number])) {
    return NextResponse.json({ error: `invalid fieldType` }, { status: 400 });
  }

  const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (labelTh    !== undefined) patch.label_th       = String(labelTh).trim();
  if (labelEn    !== undefined) patch.label_en       = labelEn ? String(labelEn).trim() : null;
  if (fieldType  !== undefined) patch.field_type     = fieldType;
  if (selectOptions !== undefined) patch.select_options = selectOptions;
  if (isRequired !== undefined) patch.is_required    = Boolean(isRequired);
  if (sortOrder  !== undefined) patch.sort_order     = Number(sortOrder) || 0;

  const admin = createAdminClient();
  const { error } = await admin
    .from('org_custom_fields')
    .update(patch)
    .eq('id', id);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ ok: true });
}

// ── DELETE ────────────────────────────────────────────────────────────────────
export async function DELETE(req: NextRequest) {
  const auth = await requireAdmin(req);
  if (!auth.ok) return auth.res;

  const id = req.nextUrl.searchParams.get('id');
  if (!id) return NextResponse.json({ error: 'missing id' }, { status: 400 });

  const admin = createAdminClient();
  const { error } = await admin
    .from('org_custom_fields')
    .delete()
    .eq('id', id);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ ok: true });
}
