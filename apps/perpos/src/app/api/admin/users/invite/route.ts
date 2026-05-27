import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '../../../_lib/auth';
import { createAdminClient } from '../../../_lib/supabase';
import nodemailer from 'nodemailer';

// Redirect URL สำหรับตั้งรหัสผ่าน — ใช้ SITE_URL จาก env เพื่อให้ถูกต้องทั้งใน dev และ production
function getRedirectTo(clientRedirectTo?: string): string {
  const siteUrl = (process.env.NEXT_PUBLIC_SITE_URL ?? '').replace(/\/$/, '');
  if (siteUrl) return `${siteUrl}/auth/password`;
  if (clientRedirectTo) return clientRedirectTo;
  return 'https://app.perpos.io/auth/password';
}

export async function POST(req: NextRequest) {
  const auth = await requireAdmin(req);
  if (!auth.ok) return auth.res;

  const body = await req.json().catch(() => ({})) as { email?: string; role?: string; redirectTo?: string };
  const { email, role = 'user', redirectTo: clientRedirectTo } = body;
  if (!email) return NextResponse.json({ error: 'missing email' }, { status: 400 });

  const admin = createAdminClient();
  const redirectTo = getRedirectTo(clientRedirectTo);

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
    actionLink = recoveryRes.data?.properties?.action_link ?? null;
  } else {
    actionLink = linkRes.data?.properties?.action_link ?? null;
  }

  // Upsert profile — set is_active = true and role for both new and existing users
  const newUserId: string | null = linkRes.data?.user?.id ?? null;
  const { data: existing } = await admin.from('profiles').select('id').eq('email', email).maybeSingle();
  if (existing?.id) {
    await admin.from('profiles').update({ role, is_active: true }).eq('id', existing.id);
  } else if (newUserId) {
    // New user — upsert profile so it's active from the start
    await admin.from('profiles').upsert({
      id: newUserId,
      email,
      role,
      is_active: true,
    }, { onConflict: 'id' });
  }

  // Return userId so the caller can immediately add org membership
  const userId: string | null = newUserId;

  // Send email if SMTP configured
  let emailSent = false;
  let smtpError: string | null = null;
  const smtpHost = process.env.SMTP_HOST ?? '';

  if (!smtpHost) {
    smtpError = 'SMTP_HOST ไม่ได้ตั้งค่า';
  } else if (!actionLink) {
    smtpError = 'ไม่มี action link สำหรับส่งในอีเมล';
  } else {
    try {
      const smtpPort = Number(process.env.SMTP_PORT ?? 587);
      const transporter = nodemailer.createTransport({
        host: smtpHost,
        port: smtpPort,
        secure: smtpPort === 465,
        auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASSWORD },
        tls: { rejectUnauthorized: false },
      });
      // Verify connection before sending
      await transporter.verify();
      await transporter.sendMail({
        from: process.env.SMTP_FROM_EMAIL ?? process.env.SMTP_USER,
        to: email,
        subject: 'คำเชิญเข้าใช้งาน PERPOS',
        html: `
          <div style="font-family:sans-serif;max-width:500px;margin:0 auto">
            <h2 style="color:#1e3a5f">คำเชิญเข้าใช้งาน PERPOS</h2>
            <p>คุณได้รับคำเชิญเข้าใช้งานระบบ PERPOS</p>
            <p>กดปุ่มด้านล่างเพื่อตั้งรหัสผ่านและเริ่มใช้งาน:</p>
            <a href="${actionLink}"
               style="display:inline-block;padding:12px 24px;background:#2563eb;color:#fff;border-radius:8px;text-decoration:none;font-weight:bold;margin:16px 0">
              ตั้งรหัสผ่าน
            </a>
            <p style="color:#6b7280;font-size:13px">
              หากไม่ได้กดปุ่มข้างต้น ให้คัดลอกลิงก์นี้ไปวางในเบราว์เซอร์:<br/>
              <a href="${actionLink}">${actionLink}</a>
            </p>
            <p style="color:#9ca3af;font-size:12px">ลิงก์นี้ใช้ได้ครั้งเดียวและหมดอายุใน 24 ชั่วโมง</p>
          </div>
        `,
        text: `คำเชิญเข้าใช้งาน PERPOS\n\nกดลิงก์ด้านล่างเพื่อตั้งรหัสผ่าน:\n${actionLink}\n\nลิงก์นี้ใช้ได้ครั้งเดียวและหมดอายุใน 24 ชั่วโมง`,
      });
      emailSent = true;
    } catch (e: unknown) {
      const err = e as Error & { code?: string; responseCode?: number; response?: string };
      smtpError = `${err?.message ?? 'ส่งอีเมลไม่สำเร็จ'}${err?.code ? ` [${err.code}]` : ''}${err?.response ? ` — ${err.response}` : ''}`;
      console.error('[invite] SMTP error:', {
        host: smtpHost,
        port: process.env.SMTP_PORT,
        user: process.env.SMTP_USER,
        error: smtpError,
      });
    }
  }

  return NextResponse.json({ ok: true, actionLink, emailSent, smtpError, userId });
}
