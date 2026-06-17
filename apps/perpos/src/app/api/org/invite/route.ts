import { NextRequest, NextResponse } from 'next/server';
import { extractBearer, requireUser } from '../../_lib/auth';
import { createAdminClient, createAuthedClient } from '../../_lib/supabase';
import nodemailer from 'nodemailer';

function getRedirectTo(clientRedirectTo?: string): string {
  const siteUrl = (process.env.NEXT_PUBLIC_SITE_URL ?? '').replace(/\/$/, '');
  if (siteUrl) return `${siteUrl}/auth/password`;
  if (clientRedirectTo) return clientRedirectTo;
  return 'https://app.perpos.io/auth/password';
}

export async function POST(req: NextRequest) {
  const auth = await requireUser(req);
  if (!auth.ok) return auth.res;

  const body = await req.json().catch(() => ({})) as {
    email?: string;
    organizationId?: string;
    orgRole?: string;
    redirectTo?: string;
  };
  const { email, organizationId, orgRole = 'team_member', redirectTo: clientRedirectTo } = body;
  if (!email || !organizationId) return NextResponse.json({ error: 'missing email or organizationId' }, { status: 400 });

  // Verify caller is owner or admin of this org
  const token = extractBearer(req)!;
  const rls = createAuthedClient(token);
  const { data: membership } = await rls
    .from('organization_members')
    .select('role')
    .eq('user_id', auth.userId)
    .eq('organization_id', organizationId)
    .maybeSingle();
  if (!membership || !['owner', 'admin'].includes((membership as Record<string, string>).role)) {
    return NextResponse.json({ error: 'forbidden — must be org owner or admin' }, { status: 403 });
  }

  const admin = createAdminClient();
  const { data: billing } = await admin
    .from('org_billing')
    .select('payment_status, overdue_count')
    .eq('org_id', organizationId)
    .maybeSingle();
  const b = billing as Record<string, unknown> | null;
  const isOverdue = String(b?.payment_status ?? '') === 'overdue';
  const overdueCount = Number(b?.overdue_count ?? 0);
  if (isOverdue && overdueCount >= 2) {
    return NextResponse.json({ error: 'billing_overdue_readonly' }, { status: 402 });
  }
  const redirectTo = getRedirectTo(clientRedirectTo);

  // Generate invite link
  const linkRes = await admin.auth.admin.generateLink({ type: 'invite', email, options: { redirectTo } });
  const actionLink = linkRes.data?.properties?.action_link ?? null;
  if (linkRes.error && !actionLink) return NextResponse.json({ error: linkRes.error.message }, { status: 500 });

  // Upsert profile
  const { data: existingProfile } = await admin.from('profiles').select('id').eq('email', email).maybeSingle();
  const profileId = existingProfile?.id ?? null;
  if (profileId) {
    await admin.from('organization_members').upsert(
      { user_id: profileId, organization_id: organizationId, role: orgRole, updated_at: new Date().toISOString() },
      { onConflict: 'user_id,organization_id' },
    );
  }

  // Send email invite
  let emailSent = false;
  let smtpError: string | null = null;
  const smtpHost = process.env.SMTP_HOST ?? '';

  if (!smtpHost) {
    smtpError = 'SMTP_HOST ไม่ได้ตั้งค่า';
  } else if (!actionLink) {
    smtpError = 'ไม่มี action link สำหรับส่งในอีเมล';
  } else {
    try {
      const transporter = nodemailer.createTransport({
        host: smtpHost,
        port: Number(process.env.SMTP_PORT ?? 587),
        secure: Number(process.env.SMTP_PORT ?? 587) === 465,
        auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASSWORD },
      });
      await transporter.sendMail({
        from: process.env.SMTP_FROM_EMAIL ?? process.env.SMTP_USER,
        to: email,
        subject: 'คำเชิญเข้าร่วมองค์กรใน PERPOS',
        html: `
          <div style="font-family:sans-serif;max-width:500px;margin:0 auto">
            <h2 style="color:#436E7E">คำเชิญเข้าร่วมองค์กรใน PERPOS</h2>
            <p>คุณได้รับคำเชิญเข้าร่วมองค์กรในระบบ PERPOS</p>
            <p>กดปุ่มด้านล่างเพื่อตั้งรหัสผ่านและเริ่มใช้งาน:</p>
            <a href="${actionLink}"
               style="display:inline-block;padding:12px 24px;background:#4DB0D3;color:#fff;border-radius:8px;text-decoration:none;font-weight:bold;margin:16px 0">
              ยืนยันและตั้งรหัสผ่าน
            </a>
            <p style="color:#656D78;font-size:13px">
              หากไม่ได้กดปุ่มข้างต้น ให้คัดลอกลิงก์นี้ไปวางในเบราว์เซอร์:<br/>
              <a href="${actionLink}">${actionLink}</a>
            </p>
            <p style="color:#9ca3af;font-size:12px">ลิงก์นี้ใช้ได้ครั้งเดียวและหมดอายุใน 24 ชั่วโมง</p>
          </div>
        `,
        text: `คำเชิญเข้าร่วมองค์กรใน PERPOS\n\nกดลิงก์ด้านล่างเพื่อตั้งรหัสผ่าน:\n${actionLink}\n\nลิงก์นี้ใช้ได้ครั้งเดียวและหมดอายุใน 24 ชั่วโมง`,
      });
      emailSent = true;
    } catch (e: unknown) {
      smtpError = (e as Error)?.message ?? 'ส่งอีเมลไม่สำเร็จ';
      console.error('[org/invite] SMTP error:', smtpError);
    }
  }

  return NextResponse.json({ ok: true, actionLink, emailSent, smtpError });
}
