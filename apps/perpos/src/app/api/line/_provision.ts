/**
 * Auto-onboarding: สร้าง account + personal org + assistant grant + โควต้า ให้ LINE user
 * อัตโนมัติเมื่อแอด LINE (zero friction — ไม่ต้องสมัครเว็บก่อน)
 *
 * profiles.id → auth.users(id) จึงต้องสร้าง "shadow auth user" (email ปลอมที่เราคุมโดเมน)
 * แล้ว trigger handle_new_user จะสร้าง profile ให้ → จากนั้น provision ส่วนที่เหลือ
 *
 * ⚠️ self-heal / idempotent: ไม่มี transaction ครอบ insert หลายตัว ถ้าครั้งก่อน fail กลางคัน
 * (เช่น สร้าง profile แล้วแต่ org insert ล้ม) การเรียกซ้ำ (re-follow) จะ "เติมส่วนที่ขาดให้ครบ"
 * แทนที่จะ return profile ที่ค้างไม่สมบูรณ์ — กันผู้ใช้ติดสถานะใช้ /mom ไม่ได้
 */

import type { SupabaseClient } from '@supabase/supabase-js';

const DEFAULT_QUOTA_SECONDS = 18000; // 300 นาที (stt — อัปไฟล์เอง)
const DEFAULT_BOT_QUOTA_SECONDS = 7200; // 120 นาที (bot — ประชุมผ่าน Recall)
const DEFAULT_PDF_QUOTA_PAGES = 20; // 20 หน้า (pdf_compress — trial บีบ PDF)

export type ProvisionResult = { profileId: string; orgId: string; displayName: string; isNew: boolean };

async function getLineProfile(lineUserId: string): Promise<{ displayName: string; pictureUrl: string | null }> {
  const token = process.env.LINE_MESSAGING_CHANNEL_ACCESS_TOKEN ?? '';
  try {
    const res = await fetch(`https://api.line.me/v2/bot/profile/${lineUserId}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (res.ok) {
      const j = (await res.json()) as { displayName?: string; pictureUrl?: string };
      return { displayName: j.displayName || 'ผู้ใช้ LINE', pictureUrl: j.pictureUrl ?? null };
    }
  } catch {
    /* ignore */
  }
  return { displayName: 'ผู้ใช้ LINE', pictureUrl: null };
}

/** insert แถวเฉพาะเมื่อยังไม่มี (idempotent) — ใช้กับตาราง access ที่ provision ต้องมีครบ */
async function ensureRow(
  admin: SupabaseClient,
  table: string,
  match: Record<string, unknown>,
  insert: Record<string, unknown>,
): Promise<void> {
  const { count } = await admin
    .from(table)
    .select('*', { head: true, count: 'exact' })
    .match(match);
  if (!count) await admin.from(table).insert(insert);
}

/** หา personal org ของ user (reuse ถ้ามี) หรือสร้างใหม่ + ensure owner membership */
async function ensurePersonalOrg(
  admin: SupabaseClient,
  profileId: string,
  displayName: string,
  preferredOrgId: string | null,
): Promise<string> {
  // 1. line_active_org_id เดิมยังมี membership อยู่ → ใช้เลย
  if (preferredOrgId) {
    const { data: m } = await admin
      .from('organization_members')
      .select('organization_id')
      .eq('organization_id', preferredOrgId)
      .eq('user_id', profileId)
      .maybeSingle();
    if (m) return preferredOrgId;
  }

  // 2. มี membership owner อยู่แล้ว (provisioning ก่อนหน้าสร้างไว้แต่ค้าง) → ใช้ org นั้น
  const { data: owned } = await admin
    .from('organization_members')
    .select('organization_id')
    .eq('user_id', profileId)
    .eq('role', 'owner')
    .order('created_at')
    .limit(1)
    .maybeSingle();
  if (owned) return (owned as { organization_id: string }).organization_id;

  // 3. มี org ที่เคยสร้างค้างไว้ (created_by) แต่ membership หาย → reuse + เติม membership
  const { data: orphan } = await admin
    .from('organizations')
    .select('id')
    .eq('created_by', profileId)
    .order('created_at')
    .limit(1)
    .maybeSingle();
  if (orphan) {
    const orgId = (orphan as { id: string }).id;
    await ensureRow(admin, 'organization_members',
      { organization_id: orgId, user_id: profileId },
      { organization_id: orgId, user_id: profileId, role: 'owner' });
    return orgId;
  }

  // 4. สร้างใหม่ + membership
  const slug = `u${Math.random().toString(36).slice(2, 12)}`;
  const { data: org, error: orgErr } = await admin
    .from('organizations')
    .insert({ name: `พื้นที่ส่วนตัว — ${displayName}`, slug, created_by: profileId })
    .select('id')
    .single();
  if (orgErr || !org) throw new Error(`org insert failed: ${orgErr?.message ?? 'unknown'}`);
  const orgId = org.id as string;
  await admin.from('organization_members').insert({ organization_id: orgId, user_id: profileId, role: 'owner' });
  return orgId;
}

/** สร้าง quota row เริ่มต้น ถ้ายังไม่มี (อ่าน default จาก stt_settings) */
async function ensureQuota(admin: SupabaseClient, profileId: string): Promise<void> {
  const { data: existing } = await admin
    .from('stt_quota')
    .select('profile_id')
    .eq('profile_id', profileId)
    .maybeSingle();
  if (existing) return;
  const { data: sttSettings } = await admin
    .from('stt_settings')
    .select('default_quota_seconds')
    .eq('id', true)
    .maybeSingle();
  const quotaSeconds = (sttSettings?.default_quota_seconds as number | undefined) ?? DEFAULT_QUOTA_SECONDS;
  await admin.from('stt_quota').insert({ profile_id: profileId, limit_seconds: quotaSeconds, used_seconds: 0 });
}

/** สร้าง bot_quota row เริ่มต้น ถ้ายังไม่มี (มิเตอร์ที่ 2 — ประชุมผ่านบอท Recall) */
async function ensureBotQuota(admin: SupabaseClient, profileId: string): Promise<void> {
  const { data: existing } = await admin
    .from('bot_quota')
    .select('profile_id')
    .eq('profile_id', profileId)
    .maybeSingle();
  if (existing) return;
  const { data: sttSettings } = await admin
    .from('stt_settings')
    .select('default_bot_quota_seconds')
    .eq('id', true)
    .maybeSingle();
  const botSeconds = (sttSettings?.default_bot_quota_seconds as number | undefined) ?? DEFAULT_BOT_QUOTA_SECONDS;
  await admin.from('bot_quota').insert({ profile_id: profileId, limit_seconds: botSeconds, used_seconds: 0 });
}

/** สร้าง pdf_quota row เริ่มต้น ถ้ายังไม่มี (อ่าน default จาก pdf_settings) — kind pdf_compress */
async function ensurePdfQuota(admin: SupabaseClient, profileId: string): Promise<void> {
  const { data: existing } = await admin
    .from('pdf_quota')
    .select('profile_id')
    .eq('profile_id', profileId)
    .maybeSingle();
  if (existing) return;
  const { data: pdfSettings } = await admin
    .from('pdf_settings')
    .select('default_quota_pages')
    .eq('id', true)
    .maybeSingle();
  const quotaPages = (pdfSettings?.default_quota_pages as number | undefined) ?? DEFAULT_PDF_QUOTA_PAGES;
  await admin.from('pdf_quota').insert({ profile_id: profileId, limit_pages: quotaPages, used_pages: 0 });
}

export async function provisionLineUser(admin: SupabaseClient, lineUserId: string): Promise<ProvisionResult> {
  // 1. profile — find or create (shadow auth user)
  const { data: existing } = await admin
    .from('profiles')
    .select('id, display_name, line_active_org_id')
    .eq('line_user_id', lineUserId)
    .maybeSingle();

  let profileId: string;
  let displayName: string;
  let isNew: boolean;
  const preferredOrgId = (existing as { line_active_org_id?: string } | null)?.line_active_org_id ?? null;

  if (existing) {
    const ex = existing as { id: string; display_name?: string };
    profileId = ex.id;
    displayName = ex.display_name ?? 'ผู้ใช้ LINE';
    isNew = false;
  } else {
    const prof = await getLineProfile(lineUserId);
    displayName = prof.displayName;
    const shadowEmail = `line.${lineUserId.toLowerCase()}@stt-line.perpos.io`;
    const { data: created, error: createErr } = await admin.auth.admin.createUser({
      email: shadowEmail,
      email_confirm: true,
      user_metadata: { source: 'line', line_user_id: lineUserId, display_name: displayName },
    });
    if (createErr || !created?.user) {
      throw new Error(`createUser failed: ${createErr?.message ?? 'unknown'}`);
    }
    profileId = created.user.id;
    await admin
      .from('profiles')
      .update({ line_user_id: lineUserId, line_linked_at: new Date().toISOString(), display_name: displayName, line_picture_url: prof.pictureUrl, is_active: true })
      .eq('id', profileId);
    isNew = true;
  }

  // 2. personal org + owner membership (idempotent / reuse-if-exists)
  const orgId = await ensurePersonalOrg(admin, profileId, displayName, preferredOrgId);

  // 3. ผู้ช่วย AI (key ภายใน 'stt') — per-profile: แค่ personal_module_grants ก็พอ
  //    (สิทธิ์เช็คต่อ profile โดย requireAssistantUser / LINE checkSttAccess — ไม่ใช้ org module)
  //    personal org ที่สร้างไว้ = "home org" สำหรับเก็บไฟล์/เรียก worker เท่านั้น
  await ensureRow(admin, 'personal_module_grants',
    { user_id: profileId, module_key: 'stt' },
    { module_key: 'stt', user_id: profileId, granted_by: profileId, is_enabled: true });

  // kind ที่ 2: บีบ PDF (pdf_compress) — แจก trial อัตโนมัติเหมือน stt (ดู docs/PDF_COMPRESS_FEATURE.md)
  await ensureRow(admin, 'personal_module_grants',
    { user_id: profileId, module_key: 'pdf_compress' },
    { module_key: 'pdf_compress', user_id: profileId, granted_by: profileId, is_enabled: true });

  // 4. home org pointers + quota
  //    personal_org_id = แหล่งความจริงของ home org (assistant-auth.resolveHomeOrg อ่านตรงนี้)
  //    line_active_org_id = org ที่ active สำหรับ ERP context (อาจถูกสลับด้วย org switcher)
  await admin.from('profiles').update({ personal_org_id: orgId }).eq('id', profileId);
  if (preferredOrgId !== orgId) {
    await admin.from('profiles').update({ line_active_org_id: orgId }).eq('id', profileId);
  }
  await ensureQuota(admin, profileId);
  await ensureBotQuota(admin, profileId);
  await ensurePdfQuota(admin, profileId);

  return { profileId, orgId, displayName, isNew };
}
