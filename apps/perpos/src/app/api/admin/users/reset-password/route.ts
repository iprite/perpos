import { NextRequest, NextResponse } from 'next/server';
import nodemailer from 'nodemailer';
import { requireAdmin } from '../../../_lib/auth';
import { createAdminClient } from '../../../_lib/supabase';
import { logAdminAction } from '../../../_lib/admin-audit';
import { withBasePath } from '@/utils/base-path';

export async function POST(req: NextRequest) {
  const auth = await requireAdmin(req);
  if (!auth.ok) return auth.res;

  const body = await req.json().catch(() => ({})) as { email?: string; redirectTo?: string };
  const { email, redirectTo } = body;
  if (!email) return NextResponse.json({ error: 'missing email' }, { status: 400 });

  const admin = createAdminClient();
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'https://app.perpos.io';
  const finalRedirect = redirectTo ?? `${baseUrl}${withBasePath('/auth/password')}`;

  const { data, error } = await admin.auth.admin.generateLink({
    type: 'recovery',
    email,
    options: { redirectTo: finalRedirect },
  });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const actionLink =
    ((data as unknown as Record<string, Record<string, string>>)?.properties)?.action_link ?? null;

  // Send email via SMTP if configured
  let emailSent = false;
  const smtpHost = process.env.SMTP_HOST ?? '';
  if (smtpHost && actionLink) {
    try {
      const transporter = nodemailer.createTransport({
        host: smtpHost,
        port: Number(process.env.SMTP_PORT ?? 587),
        secure: Number(process.env.SMTP_PORT ?? 587) === 465,
        auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASSWORD },
      });
      await transporter.sendMail({
        from: process.env.SMTP_FROM_EMAIL,
        to: email,
        subject: 'ตั้งรหัสผ่านใหม่ — PERPOS',
        html: `
          <p>มีการร้องขอให้ตั้งรหัสผ่านใหม่สำหรับบัญชี PERPOS ของคุณ</p>
          <p><a href="${actionLink}" style="display:inline-block;padding:10px 20px;background:#7761A7;color:#fff;border-radius:6px;text-decoration:none;">ตั้งรหัสผ่านใหม่</a></p>
          <p style="color:#888;font-size:12px;">ลิงก์นี้จะหมดอายุใน 1 ชั่วโมง หากคุณไม่ได้ร้องขอ กรุณาเพิกเฉยต่ออีเมลนี้</p>
        `,
        text: `ตั้งรหัสผ่านใหม่ PERPOS\n\n${actionLink}\n\nลิงก์นี้จะหมดอายุใน 1 ชั่วโมง`,
      });
      emailSent = true;
    } catch { /* SMTP not configured or failed — fall through */ }
  }

  await logAdminAction(req, auth.userId, {
    action: 'user.reset_password',
    targetType: 'user',
    targetLabel: email,
    metadata: { email_sent: emailSent, link_returned: !emailSent },
  });

  // ความปลอดภัย: ไม่คืน action_link เมื่อส่งอีเมลสำเร็จ — กันยึดบัญชีเงียบๆ ผ่าน response
  // คืนเฉพาะกรณี SMTP ไม่ได้ตั้งค่า (admin ต้องส่งลิงก์ให้ user เอง) เป็น fallback
  return NextResponse.json({ ok: true, actionLink: emailSent ? null : actionLink, emailSent });
}
