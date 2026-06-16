/**
 * Admin action audit — บันทึก action ระดับแอปของ super admin ลงตาราง admin_audit_log
 *
 * ใช้กับ mutation ที่ไม่ถูกจับโดย audit_logs v2 (trigger-based DML hash chain) เช่น
 * auth.deleteUser, Stripe, generateLink, หรือ action เชิงความหมาย (impersonate.start).
 *
 * ออกแบบให้ "ไม่ล้มงานหลัก": ถ้า log ไม่สำเร็จจะไม่ throw — แค่ console.error
 * (การ audit ที่พังต้องไม่ทำให้ admin ทำงานไม่ได้ แต่ก็ไม่ควรเงียบสนิท)
 */

import { type NextRequest } from 'next/server';
import { createAdminClient } from './supabase';

export type AdminAuditEntry = {
  action: string;                       // 'user.delete' | 'user.reset_password' | 'impersonate.start' ...
  targetType?: string;                  // 'user' | 'org' | 'subscription' | 'stt_job' ...
  targetId?: string | null;
  targetLabel?: string | null;          // ชื่อ/อีเมล เพื่ออ่านง่ายแม้เป้าหมายถูกลบ
  metadata?: Record<string, unknown>;
};

function clientIp(req: NextRequest): string | null {
  return (
    req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ??
    req.headers.get('x-real-ip') ??
    null
  );
}

/**
 * บันทึก 1 รายการ. actorId = super admin จาก requireAdmin(); actorEmail ดึงจาก profiles
 * ให้อัตโนมัติเพื่อให้ log อ่านรู้เรื่องแม้ profile ถูกลบภายหลัง.
 */
export async function logAdminAction(
  req: NextRequest,
  actorId: string,
  entry: AdminAuditEntry,
): Promise<void> {
  try {
    const admin = createAdminClient();

    let actorEmail: string | null = null;
    const { data: actor } = await admin.from('profiles').select('email').eq('id', actorId).maybeSingle();
    actorEmail = (actor?.email as string | undefined) ?? null;

    await admin.from('admin_audit_log').insert({
      actor_id:     actorId,
      actor_email:  actorEmail,
      action:       entry.action,
      target_type:  entry.targetType ?? null,
      target_id:    entry.targetId ?? null,
      target_label: entry.targetLabel ?? null,
      metadata:     entry.metadata ?? {},
      ip_address:   clientIp(req),
      user_agent:   req.headers.get('user-agent') ?? null,
    });
  } catch (e) {
    console.error('[admin-audit] failed to log action', entry.action, e);
  }
}
