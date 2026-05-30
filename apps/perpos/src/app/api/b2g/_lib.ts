import { NextRequest, NextResponse } from 'next/server';
import { requireModuleMember, ModuleAuth } from '../_lib/module-auth';

export const MODULE_KEY = 'b2g';
export type B2gRole = 'owner' | 'manager' | 'viewer';

export interface B2gAuth extends Omit<ModuleAuth, 'moduleRole'> {
  role: B2gRole;
}

export async function requireB2gMember(
  req: NextRequest,
  orgId: string,
): Promise<B2gAuth | { ok: false; res: NextResponse }> {
  const result = await requireModuleMember(req, orgId, MODULE_KEY);
  if (!result.ok) return result;
  return { ...result, role: result.moduleRole as B2gRole };
}

export function canWrite(role: B2gRole): boolean {
  return ['owner', 'manager'].includes(role);
}
