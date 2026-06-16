/**
 * Auto-onboarding: สร้าง account + personal org + assistant grant + โควต้า ให้ LINE user
 * อัตโนมัติเมื่อแอด LINE (zero friction — ไม่ต้องสมัครเว็บก่อน)
 *
 * profiles.id → auth.users(id) จึงต้องสร้าง "shadow auth user" (email ปลอมที่เราคุมโดเมน)
 * แล้ว trigger handle_new_user จะสร้าง profile ให้ → จากนั้น provision ส่วนที่เหลือ
 * idempotent ต่อ line_user_id (re-follow ไม่สร้างซ้ำ/ไม่ได้โควต้าใหม่)
 */

import type { SupabaseClient } from '@supabase/supabase-js';

const DEFAULT_QUOTA_SECONDS = 18000; // 300 นาที
const ASSISTANT_ALLOWED_ROLES = ['owner', 'admin', 'member'];

export type ProvisionResult = { profileId: string; orgId: string; displayName: string; isNew: boolean };

async function getLineDisplayName(lineUserId: string): Promise<string> {
  const token = process.env.LINE_MESSAGING_CHANNEL_ACCESS_TOKEN ?? '';
  try {
    const res = await fetch(`https://api.line.me/v2/bot/profile/${lineUserId}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (res.ok) {
      const j = (await res.json()) as { displayName?: string };
      if (j.displayName) return j.displayName;
    }
  } catch {
    /* ignore */
  }
  return 'ผู้ใช้ LINE';
}

export async function provisionLineUser(admin: SupabaseClient, lineUserId: string): Promise<ProvisionResult> {
  // 1. idempotent — ถ้ามีอยู่แล้ว return เลย
  const { data: existing } = await admin
    .from('profiles')
    .select('id, display_name, line_active_org_id')
    .eq('line_user_id', lineUserId)
    .maybeSingle();
  if (existing) {
    const ex = existing as { id: string; display_name?: string; line_active_org_id?: string };
    return {
      profileId: ex.id,
      orgId: ex.line_active_org_id ?? '',
      displayName: ex.display_name ?? 'ผู้ใช้ LINE',
      isNew: false,
    };
  }

  const displayName = await getLineDisplayName(lineUserId);

  // 2. สร้าง shadow auth user → trigger handle_new_user สร้าง profile
  const shadowEmail = `line.${lineUserId.toLowerCase()}@stt-line.perpos.io`;
  const { data: created, error: createErr } = await admin.auth.admin.createUser({
    email: shadowEmail,
    email_confirm: true,
    user_metadata: { source: 'line', line_user_id: lineUserId, display_name: displayName },
  });
  if (createErr || !created?.user) {
    throw new Error(`createUser failed: ${createErr?.message ?? 'unknown'}`);
  }
  const profileId = created.user.id;

  // 3. profile: ผูก LINE + เปิดใช้งาน
  await admin
    .from('profiles')
    .update({ line_user_id: lineUserId, line_linked_at: new Date().toISOString(), display_name: displayName, is_active: true })
    .eq('id', profileId);

  // 4. personal org + membership (owner)
  const slug = `u${Math.random().toString(36).slice(2, 12)}`;
  const { data: org, error: orgErr } = await admin
    .from('organizations')
    .insert({ name: `พื้นที่ส่วนตัว — ${displayName}`, slug, created_by: profileId })
    .select('id')
    .single();
  if (orgErr || !org) throw new Error(`org insert failed: ${orgErr?.message ?? 'unknown'}`);
  const orgId = org.id as string;

  await admin.from('organization_members').insert({ organization_id: orgId, user_id: profileId, role: 'owner' });

  // 5. assistant — org module (สำหรับเว็บภายหลัง) + personal grant (สำหรับ LINE checkAssistantAccess)
  await admin.from('org_module_settings').insert({
    organization_id: orgId, module_key: 'assistant', is_enabled: true, allowed_roles: ASSISTANT_ALLOWED_ROLES,
  });
  await admin.from('personal_module_grants').insert({
    module_key: 'assistant', user_id: profileId, granted_by: profileId, is_enabled: true,
  });

  // 6. active org + quota
  await admin.from('profiles').update({ line_active_org_id: orgId }).eq('id', profileId);
  await admin.from('stt_quota').insert({ profile_id: profileId, limit_seconds: DEFAULT_QUOTA_SECONDS, used_seconds: 0 });

  return { profileId, orgId, displayName, isNew: true };
}
