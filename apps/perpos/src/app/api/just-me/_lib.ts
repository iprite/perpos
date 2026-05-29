import { NextRequest, NextResponse } from 'next/server';
import { requireModuleMember, ModuleAuth } from '../_lib/module-auth';

export const MODULE_KEY = 'just_me';
export type JustMeRole = 'owner' | 'manager' | 'viewer';

export interface JustMeAuth extends Omit<ModuleAuth, 'moduleRole'> {
  role: JustMeRole;
}

export async function requireJustMeMember(
  req: NextRequest,
  orgId: string,
): Promise<JustMeAuth | { ok: false; res: NextResponse }> {
  const result = await requireModuleMember(req, orgId, MODULE_KEY);
  if (!result.ok) return result;
  return { ...result, role: result.moduleRole as JustMeRole };
}

export function canWrite(role: JustMeRole): boolean {
  return ['owner', 'manager'].includes(role);
}

// ─── Token Sign/Verify for Passwordless Clock In/Out ─────────────────────────
import crypto from 'crypto';

const SIGNING_SECRET = process.env.SUPABASE_SERVICE_ROLE_KEY || 'just-me-clock-secret-key';

export function signClockToken(profileId: string, orgId: string, type: 'in' | 'out'): string {
  const expiresAt = Date.now() + 10 * 60 * 1000; // 10 minutes expiration
  const payload = JSON.stringify({ profileId, orgId, type, exp: expiresAt });
  const base64Payload = Buffer.from(payload).toString('base64url');
  const signature = crypto.createHmac('sha256', SIGNING_SECRET).update(payload).digest('hex');
  return `${base64Payload}.${signature}`;
}

export function verifyClockToken(token: string): { profileId: string; orgId: string; type: 'in' | 'out' } | null {
  try {
    const [base64Payload, signature] = token.split('.');
    if (!base64Payload || !signature) return null;
    const payloadStr = Buffer.from(base64Payload, 'base64url').toString('utf8');
    const expectedSignature = crypto.createHmac('sha256', SIGNING_SECRET).update(payloadStr).digest('hex');
    if (signature !== expectedSignature) return null;

    const payload = JSON.parse(payloadStr) as { profileId: string; orgId: string; type: 'in' | 'out'; exp: number };
    if (Date.now() > payload.exp) return null; // Expired

    return { profileId: payload.profileId, orgId: payload.orgId, type: payload.type };
  } catch {
    return null;
  }
}
