import { Controller, Post, Req, UnauthorizedException } from '@nestjs/common';
import type { Request } from 'express';
import { SupabaseService } from '../supabase/supabase.service';
import { extractBearer } from '../common/guards/admin.guard';

@Controller('line')
export class UnlinkController {
  constructor(private readonly supabase: SupabaseService) {}

  @Post('unlink')
  async unlink(@Req() req: Request): Promise<{ ok: boolean }> {
    const token = extractBearer(req);
    if (!token) throw new UnauthorizedException('unauthorized');

    const rls = this.supabase.createAuthedClient(token);
    const userRes = await rls.auth.getUser();
    const userId = String(userRes.data.user?.id ?? '').trim();
    if (!userId) throw new UnauthorizedException('unauthorized');

    await rls.from('profiles').update({ line_user_id: null, line_linked_at: null }).eq('id', userId);
    return { ok: true };
  }
}
