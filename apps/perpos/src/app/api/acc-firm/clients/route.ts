/**
 * GET  /api/acc-firm/clients?orgId=<firmOrgId>
 *   — รายการ client orgs ที่ firm นี้ดูแลอยู่
 *
 * POST /api/acc-firm/clients
 *   — เพิ่ม engagement ใหม่
 *   body: { firmOrgId, clientOrgId, modulesManaged?, note?, startedAt? }
 *
 * PATCH /api/acc-firm/clients/:id
 *   — อัปเดต status / note / modulesManaged
 */

import { NextRequest, NextResponse } from 'next/server';
import { requireModuleMember } from '../../_lib/module-auth';
import { createAdminClient } from '../../_lib/supabase';

// ── GET ───────────────────────────────────────────────────────────────────────
export async function GET(req: NextRequest) {
  const firmOrgId = req.nextUrl.searchParams.get('orgId');
  if (!firmOrgId) return NextResponse.json({ error: 'missing orgId' }, { status: 400 });

  const auth = await requireModuleMember(req, firmOrgId, 'acc_firm');
  if (!auth.ok) return auth.res;

  const admin = createAdminClient();
  const { data, error } = await admin
    .from('acc_firm_clients')
    .select(`
      id, status, modules_managed, note, started_at, created_at,
      client_org:organizations!acc_firm_clients_client_org_id_fkey (
        id, name, slug
      )
    `)
    .eq('firm_org_id', firmOrgId)
    .order('created_at', { ascending: false });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ clients: data });
}

// ── POST ──────────────────────────────────────────────────────────────────────
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null) as Record<string, unknown> | null;
  const { firmOrgId, clientOrgId, modulesManaged, note, startedAt } = body ?? {};

  if (!firmOrgId || typeof firmOrgId !== 'string')
    return NextResponse.json({ error: 'missing firmOrgId' }, { status: 400 });
  if (!clientOrgId || typeof clientOrgId !== 'string')
    return NextResponse.json({ error: 'missing clientOrgId' }, { status: 400 });

  const auth = await requireModuleMember(req, firmOrgId, 'acc_firm');
  if (!auth.ok) return auth.res;

  if (auth.moduleRole === 'viewer')
    return NextResponse.json({ error: 'ไม่มีสิทธิ์เพิ่ม client' }, { status: 403 });

  const admin = createAdminClient();

  // ตรวจ client org มีจริงไหม
  const { data: clientOrg } = await admin
    .from('organizations')
    .select('id, name')
    .eq('id', clientOrgId)
    .maybeSingle();
  if (!clientOrg)
    return NextResponse.json({ error: 'ไม่พบ client org' }, { status: 404 });

  const modules = Array.isArray(modulesManaged) ? modulesManaged : ['accounting'];

  const { data, error } = await admin
    .from('acc_firm_clients')
    .insert({
      firm_org_id:     firmOrgId,
      client_org_id:   clientOrgId,
      modules_managed: modules,
      note:            typeof note === 'string' ? note : null,
      started_at:      typeof startedAt === 'string' ? startedAt : null,
    })
    .select(`
      id, status, modules_managed, note, started_at, created_at,
      client_org:organizations!acc_firm_clients_client_org_id_fkey (
        id, name, slug
      )
    `)
    .single();

  if (error) {
    if (error.code === '23505')
      return NextResponse.json({ error: 'org นี้เป็น client อยู่แล้ว' }, { status: 409 });
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ client: data }, { status: 201 });
}

// ── PATCH ─────────────────────────────────────────────────────────────────────
export async function PATCH(req: NextRequest) {
  const body = await req.json().catch(() => null) as Record<string, unknown> | null;
  const { id, firmOrgId, status, note, modulesManaged } = body ?? {};

  if (!id || typeof id !== 'string' || !firmOrgId || typeof firmOrgId !== 'string')
    return NextResponse.json({ error: 'missing id or firmOrgId' }, { status: 400 });

  const auth = await requireModuleMember(req, firmOrgId, 'acc_firm');
  if (!auth.ok) return auth.res;

  if (auth.moduleRole === 'viewer')
    return NextResponse.json({ error: 'ไม่มีสิทธิ์แก้ไข' }, { status: 403 });

  const updates: Record<string, unknown> = {};
  if (status && ['active', 'inactive', 'ended'].includes(status as string))
    updates.status = status;
  if (typeof note === 'string') updates.note = note;
  if (Array.isArray(modulesManaged)) updates.modules_managed = modulesManaged;

  if (Object.keys(updates).length === 0)
    return NextResponse.json({ error: 'nothing to update' }, { status: 400 });

  const admin = createAdminClient();
  const { data, error } = await admin
    .from('acc_firm_clients')
    .update(updates)
    .eq('id', id)
    .eq('firm_org_id', firmOrgId)
    .select(`
      id, status, modules_managed, note, started_at, created_at,
      client_org:organizations!acc_firm_clients_client_org_id_fkey (
        id, name, slug
      )
    `)
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ client: data });
}
