/**
 * POST /api/account/claim  body { email, password }
 *   — LINE user (shadow account) เคลมเป็นเจ้าของบัญชีถาวร: ตั้ง email + password จริง
 */

import { NextRequest } from 'next/server';
import { requireUser } from '../../_lib/auth';
import { createAdminClient } from '../../_lib/supabase';
import { ok, Err } from '../../_lib/response';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export async function POST(req: NextRequest) {
  const auth = await requireUser(req);
  if (!auth.ok) return auth.res;

  const body = await req.json().catch(() => null);
  const email = String(body?.email ?? '').trim().toLowerCase();
  const password = String(body?.password ?? '');

  if (!EMAIL_RE.test(email)) return Err.invalidFormat('email', 'อีเมลไม่ถูกต้อง');
  if (email.endsWith('@stt-line.perpos.io')) return Err.invalidFormat('email', 'กรุณาใช้อีเมลจริง');
  if (password.length < 8) return Err.invalidFormat('password', 'รหัสผ่านอย่างน้อย 8 ตัวอักษร');

  const admin = createAdminClient();

  // กัน email ซ้ำกับบัญชีอื่น
  const { data: dup } = await admin.from('profiles').select('id').eq('email', email).neq('id', auth.userId).maybeSingle();
  if (dup) return Err.invalidFormat('email', 'อีเมลนี้ถูกใช้แล้ว');

  const { error: updErr } = await admin.auth.admin.updateUserById(auth.userId, {
    email, password, email_confirm: true,
  });
  if (updErr) return Err.externalService('auth', updErr.message);

  await admin.from('profiles').update({ email }).eq('id', auth.userId);
  return ok({ claimed: true, email });
}
