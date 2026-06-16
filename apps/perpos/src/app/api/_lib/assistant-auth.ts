/**
 * requireAssistantUser — guard ผู้ช่วย AI (assistant) แบบ per-profile
 *
 * ต่างจาก requireModuleMember (org-scoped) — assistant เป็นบริการระดับบุคคล:
 *   umbrella access = มี grant ของ kind ใด ๆ ใน ASSISTANT_KINDS (ดู lib/assistant/kinds)
 *            หรือ user_permissions('bot.assistant.transcribe')
 *            หรือ super_admin
 *
 * ยังคืน `orgId` = "home org" ของผู้ใช้ (ใช้เป็น storage folder + tag งาน + เรียก worker)
 * โดยไม่ต้องมี org ใน URL — อ่านจาก profiles.personal_org_id (fallback membership จริง)
 */

import { NextRequest, NextResponse } from 'next/server';
import { extractBearer, requireUser } from './auth';
import { createAdminClient, createAuthedClient } from './supabase';
import { ASSISTANT_KINDS, enabledAssistantKinds, type AssistantKind } from '@/lib/assistant/kinds';

export interface AssistantAuth {
  ok: true;
  userId: string;
  /** home org สำหรับ storage/worker/tag (ไม่โผล่ใน URL) */
  orgId: string;
  isSuperAdmin: boolean;
  /** kind ที่ผู้ใช้มีสิทธิ์ใช้ (super_admin = ทุก kind) — สำหรับ routing ต่อ kind */
  kinds: AssistantKind[];
  rls: ReturnType<typeof createAuthedClient>;
}
type AuthFailure = { ok: false; res: NextResponse };

async function resolveHomeOrg(admin: ReturnType<typeof createAdminClient>, userId: string): Promise<string | null> {
  // 1) personal_org_id — แหล่งความจริง deterministic (เขียนโดย provisionLineUser)
  const { data: prof } = await admin
    .from('profiles')
    .select('personal_org_id, line_active_org_id')
    .eq('id', userId)
    .maybeSingle();
  const p = prof as { personal_org_id?: string | null; line_active_org_id?: string | null } | null;
  if (p?.personal_org_id) return p.personal_org_id;

  // 2) fallback สำหรับโปรไฟล์เก่าที่ backfill ยังไม่ถึง: ใช้ membership จริง
  //    (line_active_org_id ถ้ายังเป็นสมาชิก → ไม่งั้น org แรกตาม created_at)
  const { data: rows } = await admin
    .from('organization_members')
    .select('organization_id, organizations(created_at)')
    .eq('user_id', userId);
  const list = (rows ?? []) as unknown as Array<{ organization_id: string; organizations: { created_at: string } | null }>;
  if (!list.length) return null;
  const activeId = p?.line_active_org_id ?? null;
  if (activeId && list.some((r) => r.organization_id === activeId)) return activeId;
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

  // kind ที่ใช้ได้ — super_admin เห็นทุก kind, คนอื่นตาม grant ที่ enabled
  const kinds: AssistantKind[] = isSuperAdmin
    ? [...ASSISTANT_KINDS]
    : await enabledAssistantKinds(admin, auth.userId);

  if (!isSuperAdmin && kinds.length === 0) {
    // ไม่มี grant ของ kind ใด ๆ → เผื่อ legacy perm bot.assistant.transcribe
    const { data: perm } = await admin.from('user_permissions').select('allowed')
      .eq('user_id', auth.userId).eq('function_key', 'bot.assistant.transcribe').maybeSingle();
    if (!(perm as { allowed?: boolean } | null)?.allowed) {
      return { ok: false, res: NextResponse.json({ error: 'ไม่มีสิทธิ์ใช้งานผู้ช่วย AI' }, { status: 403 }) };
    }
  }

  const orgId = await resolveHomeOrg(admin, auth.userId);
  if (!orgId) {
    return { ok: false, res: NextResponse.json({ error: 'ไม่พบพื้นที่สำหรับเก็บงาน — กรุณาติดต่อผู้ดูแล' }, { status: 409 }) };
  }

  return { ok: true, userId: auth.userId, orgId, isSuperAdmin, kinds, rls };
}
