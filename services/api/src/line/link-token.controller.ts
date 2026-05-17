import { Controller, Post, Req, UnauthorizedException, InternalServerErrorException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Request } from 'express';
import crypto from 'crypto';
import { SupabaseService } from '../supabase/supabase.service';
import { extractBearer } from '../common/guards/admin.guard';

@Controller('line')
export class LinkTokenController {
  constructor(
    private readonly config: ConfigService,
    private readonly supabase: SupabaseService,
  ) {}

  @Post('link-token')
  async createLinkToken(@Req() req: Request): Promise<{ ok: boolean; token: string; expiresAt: string; linkUrl: string }> {
    const oaIdRaw = (this.config.get<string>('LINE_OA_ID') ?? '').trim();
    const oaId = oaIdRaw ? (oaIdRaw.startsWith('@') ? oaIdRaw : `@${oaIdRaw}`) : '';
    if (!oaId) throw new InternalServerErrorException('LINE env not configured');

    const token = extractBearer(req);
    if (!token) throw new UnauthorizedException('unauthorized');

    const rls = this.supabase.createAuthedClient(token);
    const userRes = await rls.auth.getUser();
    const userId = String(userRes.data.user?.id ?? '').trim();
    if (!userId) throw new UnauthorizedException('unauthorized');

    const admin = this.supabase.createAdminClient();
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000).toISOString();
    const linkToken = crypto.randomUUID();

    const { error } = await admin.from('line_link_tokens').insert({
      token: linkToken,
      profile_id: userId,
      expires_at: expiresAt,
      used_at: null,
    });
    if (error) throw new InternalServerErrorException(error.message);

    const message = `LINK ${linkToken}`;
    const linkUrl = `https://line.me/R/oaMessage/${oaId}/?${encodeURIComponent(message)}`;
    return { ok: true, token: linkToken, expiresAt, linkUrl };
  }
}
