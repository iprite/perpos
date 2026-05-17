import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
  ForbiddenException,
} from '@nestjs/common';
import type { Request } from 'express';
import { SupabaseService } from '../../supabase/supabase.service';
import { extractBearer } from './admin.guard';

@Injectable()
export class ActiveUserGuard implements CanActivate {
  constructor(private readonly supabase: SupabaseService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest<Request>();
    const token = extractBearer(req);
    if (!token) throw new UnauthorizedException('unauthorized');

    const rls = this.supabase.createAuthedClient(token);
    const { data, error } = await rls.auth.getUser();
    if (error || !data.user) throw new UnauthorizedException('unauthorized');

    const uid = data.user.id;
    const admin = this.supabase.createAdminClient();
    const { data: profile, error: pe } = await admin
      .from('profiles')
      .select('id,role,is_active')
      .eq('id', uid)
      .maybeSingle();

    if (pe || !profile) throw new ForbiddenException('profile_not_found');
    if ((profile as { is_active: boolean }).is_active === false) throw new ForbiddenException('blocked');

    const r = req as Request & { userId: string; token: string; profileRole: string };
    r.userId = uid;
    r.token = token;
    r.profileRole = (profile as { role: string }).role ?? null;
    return true;
  }
}
