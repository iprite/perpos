import { NextRequest, NextResponse } from 'next/server';
import { requireModuleMember, ModuleAuth } from '../_lib/module-auth';

export const MODULE_KEY = 'usvilla';
export type UsvillaRole = 'owner' | 'manager' | 'viewer';

export interface UsvillaAuth extends Omit<ModuleAuth, 'moduleRole'> {
  role: UsvillaRole;
}

export async function requireUsvillaMember(
  req: NextRequest,
  orgId: string,
): Promise<UsvillaAuth | { ok: false; res: NextResponse }> {
  const result = await requireModuleMember(req, orgId, MODULE_KEY);
  if (!result.ok) return result;
  return { ...result, role: result.moduleRole as UsvillaRole };
}

export function canWrite(role: UsvillaRole): boolean {
  return ['owner', 'manager'].includes(role);
}
