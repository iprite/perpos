/**
 * ผู้ช่วย AI (assistant umbrella) — registry ของ "kind" ที่อยู่ใต้ร่ม
 *
 * แนวคิด seam (future-proof, per-kind):
 *   - capability `assistant` (เข้าร่ม /assistant) = มี grant ของ kind ใด ๆ ใน ASSISTANT_KINDS
 *   - แต่ละ kind = ผู้ช่วยหนึ่งตัว มี module_key ของตัวเองใน module_registry + มิเตอร์/quota ของตัวเอง
 *
 * เพิ่มผู้ช่วยตัวใหม่ = ลงทะเบียน module_key ใหม่ + เติมที่นี่ที่เดียว
 * (gate ทั้งเว็บ requireAssistantUser และ LINE checkSttAccess อ่านเซ็ตนี้ร่วมกัน)
 *
 * หมายเหตุ: ไม่ใช้ DB key 'assistant' เป็น umbrella grant — key นั้นเคยเป็น module
 * Task Manager เดิม (ถูกลบแล้ว) จะชนกันเชิงความหมาย + FK module_registry
 */

import type { SupabaseClient } from '@supabase/supabase-js';

/** module_key ของผู้ช่วยแต่ละตัวใต้ร่ม assistant — เพิ่ม kind ใหม่ตรงนี้ */
export const ASSISTANT_KINDS = ['stt', 'pdf_compress'] as const;
export type AssistantKind = (typeof ASSISTANT_KINDS)[number];

/**
 * คืน kind ที่ผู้ใช้มีสิทธิ์ใช้ (personal_module_grants ที่ enabled และอยู่ในร่ม)
 * ใช้ตัดสิน umbrella access (length > 0) และ routing ต่อ kind ในอนาคต
 */
export async function enabledAssistantKinds(
  admin: SupabaseClient,
  userId: string,
): Promise<AssistantKind[]> {
  const { data } = await admin
    .from('personal_module_grants')
    .select('module_key')
    .eq('user_id', userId)
    .eq('is_enabled', true)
    .in('module_key', ASSISTANT_KINDS as unknown as string[]);
  const keys = new Set((data ?? []).map((r) => (r as { module_key: string }).module_key));
  return ASSISTANT_KINDS.filter((k) => keys.has(k));
}
