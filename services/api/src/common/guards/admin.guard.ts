import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
  ForbiddenException,
} from '@nestjs/common';
import type { Request } from 'express';
import { SupabaseService } from '../../supabase/supabase.service';

@Injectable()
export class AdminGuard implements CanActivate {
  constructor(private readonly supabase: SupabaseService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest<Request>();
    const token = extractBearer(req);
    if (!token) throw new UnauthorizedException('unauthorized');

    const rls = this.supabase.createAuthedClient(token);
    const { data, error } = await rls.auth.getUser(token);
    if (error || !data.user) throw new UnauthorizedException('unauthorized');

    const { data: profile, error: profileError } = await rls
      .from('profiles')
      .select('role')
      .eq('id', data.user.id)
      .single();

    if (profileError || !profile) throw new ForbiddenException('forbidden');
    if ((profile as { role: string }).role !== 'admin') throw new ForbiddenException('forbidden');

    (req as Request & { userId: string; token: string }).userId = data.user.id;
    (req as Request & { userId: string; token: string }).token = token;
    return true;
  }
}

export function extractBearer(req: Request): string | null {
  const auth = req.headers.authorization ?? '';
  const m = auth.match(/^Bearer\s+(.+)$/i);
  return m?.[1]?.trim() ?? null;
}
