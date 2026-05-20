import { NextRequest, NextResponse } from 'next/server';
import { requireUser } from '../../_lib/auth';
import { createAdminClient, createAuthedClient } from '../../_lib/supabase';
import { extractBearer } from '../../_lib/auth';
import nodemailer from 'nodemailer';

export async function POST(req: NextRequest) {
  const auth = await requireUser(req);
  if (!auth.ok) return auth.res;

  const body = await req.json().catch(() => ({})) as {
    email?: string;
    organizationId?: string;
    orgRole?: string;
    redirectTo?: string;
  };
  const { email, organizationId, orgRole = 'member', redirectTo } = body;
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

  // Generate invite link
  const linkRes = await admin.auth.admin.generateLink({ type: 'invite', email, options: { redirectTo } });
  const actionLink = ((linkRes.data as unknown as Record<string, Record<string, string>>)?.properties)?.action_link ?? null;
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
        subject: 'คำเชิญเข้าร่วมองค์กรใน PERPOS',
        html: `<p>คุณได้รับคำเชิญเข้าร่วมองค์กรใน PERPOS</p><p><a href="${actionLink}">คลิกที่นี่เพื่อยืนยัน</a></p>`,
        text: `คำเชิญเข้าร่วมองค์กรใน PERPOS\n\n${actionLink}`,
      });
    } catch { /* SMTP optional */ }
  }

  return NextResponse.json({ ok: true, actionLink });
}
