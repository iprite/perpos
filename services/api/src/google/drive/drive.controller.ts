import { Controller, Post, Get, Req, Res, UseGuards } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Request, Response } from 'express';
import { DriveService } from './drive.service';
import { SupabaseService } from '../../supabase/supabase.service';
import { ActiveUserGuard } from '../../common/guards/active-user.guard';

const GOOGLE_SCOPES = [
  'https://www.googleapis.com/auth/drive.file',
  'https://www.googleapis.com/auth/calendar.events',
].join(' ');

@Controller('google-drive')
export class DriveController {
  constructor(
    private readonly config: ConfigService,
    private readonly drive: DriveService,
    private readonly supabase: SupabaseService,
  ) {}

  @Post('connect')
  @UseGuards(ActiveUserGuard)
  async connect(@Req() req: Request & { userId: string }): Promise<{ ok: boolean; url: string }> {
    const clientId = (this.config.get<string>('GOOGLE_OAUTH_CLIENT_ID') ?? '').trim();
    if (!clientId) throw new Error('Missing GOOGLE_OAUTH_CLIENT_ID');

    const redirectUri = this.getCallbackUrl(req);
    const state = this.drive.createSignedOAuthState(req.userId);

    const authUrl = new URL('https://accounts.google.com/o/oauth2/v2/auth');
    authUrl.searchParams.set('client_id', clientId);
    authUrl.searchParams.set('redirect_uri', redirectUri);
    authUrl.searchParams.set('response_type', 'code');
    authUrl.searchParams.set('scope', GOOGLE_SCOPES);
    authUrl.searchParams.set('access_type', 'offline');
    authUrl.searchParams.set('prompt', 'consent');
    authUrl.searchParams.set('include_granted_scopes', 'true');
    authUrl.searchParams.set('state', state);

    return { ok: true, url: authUrl.toString() };
  }

  @Get('callback')
  async callback(@Req() req: Request, @Res() res: Response): Promise<void> {
    const { code, state, error } = req.query as Record<string, string>;
    const origin = req.headers.origin || `${req.protocol}://${req.headers.host}`;

    if (error) { res.redirect(`${origin}/settings?gdrive=error`); return; }
    if (!code || !state) { res.redirect(`${origin}/settings?gdrive=missing`); return; }

    try {
      const payload = this.drive.verifySignedOAuthState(state);
      const redirectUri = this.getCallbackUrl(req);
      const tokens = await this.drive.exchangeCode(code, redirectUri);

      const refresh = (tokens.refresh_token ?? '').trim();
      if (!refresh) { res.redirect(`${origin}/settings?gdrive=refresh_missing`); return; }

      const expiresAt = new Date(Date.now() + Math.max(0, tokens.expires_in) * 1000).toISOString();
      const admin = this.supabase.createAdminClient();

      const { error: upsertError } = await admin.from('google_drive_tokens').upsert(
        { profile_id: payload.pid, refresh_token: refresh, access_token: tokens.access_token, expires_at: expiresAt, scope: tokens.scope ?? null, token_type: tokens.token_type ?? null, updated_at: new Date().toISOString() },
        { onConflict: 'profile_id' },
      );
      if (upsertError) throw new Error(upsertError.message);

      res.redirect(`${origin}/settings?gdrive=connected`);
    } catch {
      res.redirect(`${origin}/settings?gdrive=error`);
    }
  }

  @Post('disconnect')
  @UseGuards(ActiveUserGuard)
  async disconnect(@Req() req: Request & { userId: string }): Promise<{ ok: boolean }> {
    const admin = this.supabase.createAdminClient();
    await admin.from('google_drive_tokens').delete().eq('profile_id', req.userId);
    return { ok: true };
  }

  @Get('status')
  @UseGuards(ActiveUserGuard)
  async status(@Req() req: Request & { userId: string }): Promise<{ ok: boolean; connected: boolean; expiresAt: string | null; folderId: string | null }> {
    const admin = this.supabase.createAdminClient();
    const { data } = await admin.from('google_drive_tokens').select('profile_id,expires_at,drive_root_folder_id').eq('profile_id', req.userId).maybeSingle();
    const row = data as Record<string, unknown> | null;
    return {
      ok: true,
      connected: Boolean(row?.profile_id),
      expiresAt: (row?.expires_at as string | null) ?? null,
      folderId: (row?.drive_root_folder_id as string | null) ?? null,
    };
  }

  private getCallbackUrl(req: Request): string {
    const explicit = (this.config.get<string>('GOOGLE_OAUTH_DRIVE_REDIRECT_URI') ?? '').trim();
    if (explicit) return explicit;
    const origin = req.headers.origin || `${req.protocol}://${req.headers.host}`;
    return `${origin}/google-drive/callback`;
  }
}
