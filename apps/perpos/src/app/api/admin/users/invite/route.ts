import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '../../../_lib/auth';
import { createAdminClient } from '../../../_lib/supabase';
import nodemailer from 'nodemailer';

export async function POST(req: NextRequest) {
  const auth = await requireAdmin(req);
  if (!auth.ok) return auth.res;

  const body = await req.json().catch(() => ({})) as { email?: string; role?: string; redirectTo?: string };
  const { email, role = 'user', redirectTo } = body;
  if (!email) return NextResponse.json({ error: 'missing email' }, { status: 400 });

  const admin = createAdminClient();

  // Try to generate invite link
  const linkRes = await admin.auth.admin.generateLink({
    type: 'invite',
    email,
    options: { redirectTo },
  });

  let actionLink: string | null = null;

  if (linkRes.error) {
    // User may already exist — use recovery link fallback
    const recoveryRes = await admin.auth.admin.generateLink({
      type: 'recovery',
      email,
      options: { redirectTo },
    });
    if (recoveryRes.error) return NextResponse.json({ error: recoveryRes.error.message }, { status: 500 });
    actionLink = ((recoveryRes.data as unknown as Record<string, Record<string, string>>)?.properties)?.action_link ?? null;
  } else {
    actionLink = ((linkRes.data as unknown as Record<string, Record<string, string>>)?.properties)?.action_link ?? null;
  }

  // Upsert profile role
  const { data: existing } = await admin.from('profiles').select('id').eq('email', email).maybeSingle();
  if (existing?.id) {
    await admin.from('profiles').update({ role }).eq('id', existing.id);
  }

  // Send email if SMTP configured
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
        subject: 'คำเชิญเข้าใช้งาน PERPOS',
        html: `<p>คุณได้รับคำเชิญเข้าใช้งาน PERPOS</p><p><a href="${actionLink}">คลิกที่นี่เพื่อตั้งรหัสผ่าน</a></p>`,
        text: `คุณได้รับคำเชิญเข้าใช้งาน PERPOS\n\n${actionLink}`,
      });
      emailSent = true;
    } catch { /* SMTP not configured or failed */ }
  }

  // Return userId so the caller can immediately add org membership
  const userId: string | null =
    (linkRes.data as unknown as Record<string, Record<string, string>>)?.user?.id ??
    null;

  return NextResponse.json({ ok: true, actionLink, emailSent, userId });
}
