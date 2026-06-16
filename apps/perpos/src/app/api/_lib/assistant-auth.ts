/**
 * requireAssistantUser — guard ผู้ช่วย AI (assistant) แบบ per-profile
 *
 * ต่างจาก requireModuleMember (org-scoped) — assistant เป็นบริการระดับบุคคล:
 *   สิทธิ์ = personal_module_grants(module_key='stt')  ← key ภายในยังเป็น 'stt'
 *            หรือ user_permissions('bot.assistant.transcribe')
 *            หรือ super_admin
 *
 * ยังคืน `orgId` = "home org" ของผู้ใช้ (ใช้เป็น storage folder + tag งาน + เรียก worker)
 * โดยไม่ต้องมี org ใน URL — เลือก personal org ก่อน, ถ้าไม่มีใช้ line_active_org_id, ไม่งั้น org แรก
 */

import { NextRequest, NextResponse } from 'next/server';
import { extractBearer, requireUser } from './auth';
import { createAdminClient, createAuthedClient } from './supabase';

export interface AssistantAuth {
  ok: true;
  userId: string;
  /** home org สำหรับ storage/worker/tag (ไม่โผล่ใน URL) */
  orgId: string;
  isSuperAdmin: boolean;
  rls: ReturnType<typeof createAuthedClient>;
}
type AuthFailure = { ok: false; res: NextResponse };

const PERSONAL_NAME_PREFIX = 'พื้นที่ส่วนตัว';
const PERSONAL_SLUG_RE = /^u[a-z0-9]{10}$/;

async function resolveHomeOrg(admin: ReturnType<typeof createAdminClient>, userId: string): Promise<string | null> {
  const { data: rows } = await admin
    .from('organization_members')
    .select('organization_id, organizations(name, slug, created_at)')
    .eq('user_id', userId);
  const list = (rows ?? []) as unknown as Array<{ organization_id: string; organizations: { name: string; slug: string | null; created_at: string } | null }>;
  if (!list.length) return null;
  // 1) personal org ก่อน
  const personal = list.find((r) => {
    const n = r.organizations?.name ?? '';
    const s = r.organizations?.slug ?? '';
    return n.startsWith(PERSONAL_NAME_PREFIX) || PERSONAL_SLUG_RE.test(s);
  });
  if (personal) return personal.organization_id;
  // 2) line_active_org_id ถ้าเป็นสมาชิก
  const { data: prof } = await admin.from('profiles').select('line_active_org_id').eq('id', userId).maybeSingle();
  const activeId = (prof as { line_active_org_id?: string } | null)?.line_active_org_id ?? null;
  if (activeId && list.some((r) => r.organization_id === activeId)) return activeId;
  // 3) org แรก (created_at เก่าสุด)
  const sorted = [...list].sort((a, b) => (a.organizations?.created_at ?? '').localeCompare(b.organizations?.created_at ?? ''));
  return sorted[0]?.organization_id ?? list[0].organization_id;
}

export async function requireAssistantUser(req: NextRequest): Promise<AssistantAuth | AuthFailure> {
  const auth = await requireUser(req);
  if (!auth.ok) return { ok: false, res: auth.res };

  const admin = createAdminClient();
  const rls = createAuthedClient(extractBearer(req)!);

  const { data: prof } = await admin.from('profiles').select('role').eq('id', auth.userId).maybeSingle();
  const isSuperAdmin = (prof as { role?: string } | null)?.role === 'super_admin';

  if (!isSuperAdmin) {
    const [{ data: grant }, { data: perm }] = await Promise.all([
      admin.from('personal_module_grants').select('is_enabled')
        .eq('user_id', auth.userId).eq('module_key', 'stt').eq('is_enabled', true).maybeSingle(),
      admin.from('user_permissions').select('allowed')
        .eq('user_id', auth.userId).eq('function_key', 'bot.assistant.transcribe').maybeSingle(),
    ]);
    const allowed = grant !== null || Boolean((perm as { allowed?: boolean } | null)?.allowed);
    if (!allowed) {
      return { ok: false, res: NextResponse.json({ error: 'ไม่มีสิทธิ์ใช้งานผู้ช่วย AI' }, { status: 403 }) };
    }
  }

  const orgId = await resolveHomeOrg(admin, auth.userId);
  if (!orgId) {
    return { ok: false, res: NextResponse.json({ error: 'ไม่พบพื้นที่สำหรับเก็บงาน — กรุณาติดต่อผู้ดูแล' }, { status: 409 }) };
  }

  return { ok: true, userId: auth.userId, orgId, isSuperAdmin, rls };
}
