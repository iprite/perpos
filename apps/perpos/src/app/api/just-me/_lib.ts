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
