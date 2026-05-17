import { Controller, Post, Body, Req, UnauthorizedException, ForbiddenException, BadRequestException } from '@nestjs/common';
import { IsEmail, IsEnum, IsUUID, IsUrl } from 'class-validator';
import type { Request } from 'express';
import { SupabaseService } from '../supabase/supabase.service';
import { EmailService } from '../email/email.service';
import { extractBearer } from '../common/guards/admin.guard';

class OrgInviteDto {
  @IsEmail()
  email!: string;

  @IsEnum(['owner', 'admin', 'member'])
  orgRole!: 'owner' | 'admin' | 'member';

  @IsUUID()
  organizationId!: string;

  @IsUrl()
  redirectTo!: string;
}

@Controller('org')
export class OrgController {
  constructor(
    private readonly supabase: SupabaseService,
    private readonly email: EmailService,
  ) {}

  @Post('invite')
  async invite(@Req() req: Request, @Body() body: OrgInviteDto) {
    const token = extractBearer(req);
    if (!token) throw new UnauthorizedException('unauthorized');

    const authed = this.supabase.createAuthedClient(token);
    const { data: userData, error: userErr } = await authed.auth.getUser(token);
    if (userErr || !userData.user) throw new UnauthorizedException('unauthorized');

    const callerId = userData.user.id;
    const { email, orgRole, organizationId, redirectTo } = body;

    const { data: callerMem, error: memErr } = await authed.from('organization_members').select('role').eq('organization_id', organizationId).eq('user_id', callerId).single();
    if (memErr || !callerMem) throw new ForbiddenException('forbidden');
    if (!['owner', 'admin'].includes((callerMem as Record<string, string>).role)) throw new ForbiddenException('forbidden');

    const admin = this.supabase.createAdminClient();
    const inviteRes = await admin.auth.admin.generateLink({ type: 'invite', email, options: { redirectTo } });
    let linkData = inviteRes.data;
    let linkError = inviteRes.error;

    if (linkError) {
      const msg = String(linkError.message ?? '').toLowerCase();
      const alreadyExists = msg.includes('already registered') || msg.includes('already exists') || msg.includes('user exists');
      if (alreadyExists) {
        const recoveryRes = await admin.auth.admin.generateLink({ type: 'recovery', email, options: { redirectTo } });
        linkData = recoveryRes.data;
        linkError = recoveryRes.error;
      }
    }

    if (linkError || !linkData.user || !linkData.properties?.action_link) {
      throw new BadRequestException(linkError?.message ?? 'invite_failed');
    }

    const userId = linkData.user.id;
    const actionLink = linkData.properties.action_link;

    await admin.from('profiles').upsert({ id: userId, email, role: 'user', is_active: true }, { onConflict: 'id' });
    await admin.from('organization_members').upsert({ organization_id: organizationId, user_id: userId, role: orgRole }, { onConflict: 'organization_id,user_id' });

    await admin.from('org_invites').delete().eq('organization_id', organizationId).eq('email', email).eq('status', 'pending');
    await admin.from('org_invites').insert({ organization_id: organizationId, email, org_role: orgRole, invited_user_id: userId, invited_by: callerId, status: 'pending' });

    const { html, text } = this.email.buildAuthLinkEmail({ title: 'คุณได้รับคำเชิญเข้าใช้งานระบบ', actionLabel: 'ตั้งรหัสผ่านและเข้าสู่ระบบ', actionLink });
    const sent = await this.email.sendEmail({ to: email, subject: 'คำเชิญเข้าใช้งานระบบ PERPOS', html, text });

    if (!sent.ok) {
      return { error: 'email_send_failed', actionLink };
    }

    return { ok: true, userId, actionLink, emailSent: true };
  }
}
