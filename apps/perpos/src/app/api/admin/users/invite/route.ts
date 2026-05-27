import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '../../../_lib/auth';
import { createAdminClient } from '../../../_lib/supabase';

function getRedirectTo(clientRedirectTo?: string): string {
  const siteUrl = (process.env.NEXT_PUBLIC_SITE_URL ?? '').replace(/\/$/, '');
  if (siteUrl) return `${siteUrl}/auth/password`;
  if (clientRedirectTo) return clientRedirectTo;
  return 'https://app.perpos.io/auth/password';
}

async function sendBrevoEmail(to: string, actionLink: string): Promise<void> {
  const apiKey = process.env.BREVO_API_KEY ?? '';
  if (!apiKey) throw new Error('BREVO_API_KEY ไม่ได้ตั้งค่า');

  const sender = process.env.SMTP_FROM_EMAIL ?? 'noreply@perpos.io';

  const res = await fetch('https://api.brevo.com/v3/smtp/email', {
    method: 'POST',
    headers: {
      'accept': 'application/json',
      'api-key': apiKey,
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      sender: { email: sender, name: 'PERPOS' },
      to: [{ email: to }],
      subject: 'คำเชิญเข้าใช้งาน PERPOS',
      htmlContent: `
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
      textContent: `คำเชิญเข้าใช้งาน PERPOS\n\nกดลิงก์ด้านล่างเพื่อตั้งรหัสผ่าน:\n${actionLink}\n\nลิงก์นี้ใช้ได้ครั้งเดียวและหมดอายุใน 24 ชั่วโมง`,
    }),
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Brevo API ${res.status}: ${body}`);
  }
}

export async function POST(req: NextRequest) {
  const auth = await requireAdmin(req);
  if (!auth.ok) return auth.res;

  const body = await req.json().catch(() => ({})) as { email?: string; role?: string; redirectTo?: string };
  const { email, role = 'user', redirectTo: clientRedirectTo } = body;
  if (!email) return NextResponse.json({ error: 'missing email' }, { status: 400 });

  const admin = createAdminClient();
  const redirectTo = getRedirectTo(clientRedirectTo);

  // Generate invite link
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

  // Upsert profile — set is_active = true and role
  const newUserId: string | null = linkRes.data?.user?.id ?? null;
  const { data: existing } = await admin.from('profiles').select('id').eq('email', email).maybeSingle();
  if (existing?.id) {
    await admin.from('profiles').update({ role, is_active: true }).eq('id', existing.id);
  } else if (newUserId) {
    await admin.from('profiles').upsert({
      id: newUserId,
      email,
      role,
      is_active: true,
    }, { onConflict: 'id' });
  }

  const userId: string | null = newUserId;

  // Send email via Brevo API
  let emailSent = false;
  let smtpError: string | null = null;

  if (!actionLink) {
    smtpError = 'ไม่มี action link สำหรับส่งในอีเมล';
  } else {
    try {
      await sendBrevoEmail(email, actionLink);
      emailSent = true;
    } catch (e: unknown) {
      smtpError = (e as Error)?.message ?? 'ส่งอีเมลไม่สำเร็จ';
      console.error('[invite] Brevo error:', smtpError);
    }
  }

  return NextResponse.json({ ok: true, actionLink, emailSent, smtpError, userId });
}
