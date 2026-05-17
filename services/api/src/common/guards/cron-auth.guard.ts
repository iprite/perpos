import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Request } from 'express';

@Injectable()
export class CronAuthGuard implements CanActivate {
  constructor(private readonly config: ConfigService) {}

  canActivate(context: ExecutionContext): boolean {
    const req = context.switchToHttp().getRequest<Request>();
    const secret = this.config.get<string>('CRON_SECRET');
    if (!secret) return true;

    const vercelHeader = req.headers['x-vercel-cron-secret'];
    if (vercelHeader === secret) return true;

    const auth = req.headers.authorization ?? '';
    if (auth === `Bearer ${secret}`) return true;

    throw new UnauthorizedException('unauthorized');
  }
}
