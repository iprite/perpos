import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

interface DriveFile {
  id: string;
  name?: string;
  webViewLink?: string;
}

@Injectable()
export class DriveService {
  constructor(private readonly config: ConfigService) {}

  async exchangeCode(code: string, redirectUri: string) {
    const clientId = this.requiredEnv('GOOGLE_OAUTH_CLIENT_ID');
    const clientSecret = this.requiredEnv('GOOGLE_OAUTH_CLIENT_SECRET');

    const body = new URLSearchParams();
    body.set('code', code);
    body.set('client_id', clientId);
    body.set('client_secret', clientSecret);
    body.set('redirect_uri', redirectUri);
    body.set('grant_type', 'authorization_code');

    return this.fetchJson('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body,
    }) as Promise<{ access_token: string; expires_in: number; refresh_token?: string; scope?: string; token_type?: string }>;
  }

  async refreshToken(refreshToken: string) {
    const clientId = this.requiredEnv('GOOGLE_OAUTH_CLIENT_ID');
    const clientSecret = this.requiredEnv('GOOGLE_OAUTH_CLIENT_SECRET');

    const body = new URLSearchParams();
    body.set('client_id', clientId);
    body.set('client_secret', clientSecret);
    body.set('refresh_token', refreshToken);
    body.set('grant_type', 'refresh_token');

    return this.fetchJson('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body,
    }) as Promise<{ access_token: string; expires_in: number; scope?: string; token_type?: string }>;
  }

  async getAccessTokenForRow(
    row: Record<string, unknown>,
    saveUpdated: (patch: Record<string, unknown>) => Promise<void>,
  ): Promise<string> {
    if (row.access_token && this.isStillValid(row.expires_at as string | null)) {
      return row.access_token as string;
    }
    const refreshed = await this.refreshToken(row.refresh_token as string);
    const expiresAt = new Date(Date.now() + Math.max(0, refreshed.expires_in) * 1000).toISOString();
    await saveUpdated({
      access_token: refreshed.access_token,
      expires_at: expiresAt,
      scope: refreshed.scope ?? row.scope,
      token_type: refreshed.token_type ?? row.token_type,
    });
    return refreshed.access_token;
  }

  async ensureFolder(accessToken: string, folderName: string, existingFolderId?: string | null): Promise<string> {
    if (existingFolderId) return existingFolderId;

    const q = `name='${folderName.replace(/'/g, "\\'")}' and mimeType='application/vnd.google-apps.folder' and 'root' in parents and trashed=false`;
    const listUrl = `https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(q)}&fields=${encodeURIComponent('files(id,name)')}&pageSize=1`;
    const list = await this.driveApiJson(accessToken, listUrl) as { files?: Array<{ id: string }> };
    const found = list.files?.[0]?.id;
    if (found) return found;

    const created = await this.driveApiJson(accessToken, 'https://www.googleapis.com/drive/v3/files?fields=id', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ name: folderName, mimeType: 'application/vnd.google-apps.folder', parents: ['root'] }),
    }) as { id: string };
    return created.id;
  }

  async uploadFile(params: {
    accessToken: string;
    fileName: string;
    mimeType: string;
    bytes: Uint8Array;
    folderId?: string | null;
  }): Promise<DriveFile> {
    const boundary = `perpos_${Math.random().toString(16).slice(2)}`;
    const metadata: Record<string, unknown> = { name: params.fileName };
    if (params.folderId) metadata.parents = [params.folderId];

    const metaPart = `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify(metadata)}\r\n`;
    const fileHeader = `--${boundary}\r\nContent-Type: ${params.mimeType}\r\n\r\n`;
    const closing = `\r\n--${boundary}--\r\n`;

    const body = Buffer.concat([
      Buffer.from(metaPart, 'utf8'),
      Buffer.from(fileHeader, 'utf8'),
      Buffer.from(params.bytes),
      Buffer.from(closing, 'utf8'),
    ]);

    const url = `https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=${encodeURIComponent('id,name,webViewLink')}`;
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        authorization: `Bearer ${params.accessToken}`,
        'content-type': `multipart/related; boundary=${boundary}`,
        'content-length': String(body.length),
      },
      body,
    });
    const text = await res.text();
    const data = text ? (JSON.parse(text) as Record<string, unknown>) : null;
    if (!res.ok) {
      const msg = (data?.error as Record<string, string>)?.message || res.statusText;
      throw new Error(String(msg || 'drive_upload_failed'));
    }
    return data as unknown as DriveFile;
  }

  createSignedOAuthState(profileId: string): string {
    const crypto = require('crypto') as typeof import('crypto');
    const secret = (this.config.get<string>('GOOGLE_OAUTH_STATE_SECRET') ?? '').trim();
    if (!secret) throw new Error('Missing GOOGLE_OAUTH_STATE_SECRET');
    const payload = { pid: profileId, iat: Date.now(), nonce: crypto.randomUUID() };
    const encoded = Buffer.from(JSON.stringify(payload)).toString('base64url');
    const sig = crypto.createHmac('sha256', secret).update(encoded).digest('base64url');
    return `${encoded}.${sig}`;
  }

  verifySignedOAuthState(state: string): { pid: string; iat: number } {
    const crypto = require('crypto') as typeof import('crypto');
    const secret = (this.config.get<string>('GOOGLE_OAUTH_STATE_SECRET') ?? '').trim();
    if (!secret) throw new Error('Missing GOOGLE_OAUTH_STATE_SECRET');
    const parts = String(state ?? '').split('.');
    if (parts.length !== 2) throw new Error('Invalid state');
    const [encoded, sig] = parts;
    const expected = crypto.createHmac('sha256', secret).update(encoded).digest('base64url');
    const a = Buffer.from(sig);
    const b = Buffer.from(expected);
    if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) throw new Error('Invalid state');
    const payload = JSON.parse(Buffer.from(encoded, 'base64url').toString('utf8')) as { pid: string; iat: number };
    if (!payload?.pid || typeof payload.iat !== 'number') throw new Error('Invalid state');
    if (Date.now() - payload.iat > 10 * 60 * 1000) throw new Error('State expired');
    return payload;
  }

  private isStillValid(expiresAtIso: string | null): boolean {
    if (!expiresAtIso) return false;
    const t = new Date(expiresAtIso).getTime();
    if (!Number.isFinite(t)) return false;
    return t - Date.now() > 60 * 1000;
  }

  private async driveApiJson(accessToken: string, url: string, init?: RequestInit): Promise<unknown> {
    return this.fetchJson(url, {
      ...(init ?? {}),
      headers: { ...(init?.headers as Record<string, string> ?? {}), authorization: `Bearer ${accessToken}` },
    });
  }

  private async fetchJson(url: string, init: RequestInit): Promise<unknown> {
    const res = await fetch(url, init);
    const text = await res.text();
    const data = text ? JSON.parse(text) as Record<string, unknown> : null;
    if (!res.ok) {
      const msg = (data as Record<string, string> | null)?.error_description || ((data?.error as Record<string, string>))?.message || String(data?.error ?? '') || res.statusText;
      throw new Error(String(msg || 'request_failed'));
    }
    return data;
  }

  private requiredEnv(name: string): string {
    const v = (this.config.get<string>(name) ?? '').trim();
    if (!v) throw new Error(`Missing ${name}`);
    return v;
  }
}
