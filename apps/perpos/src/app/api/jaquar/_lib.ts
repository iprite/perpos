import { NextRequest, NextResponse } from 'next/server';
import { requireModuleMember, ModuleAuth } from '../_lib/module-auth';

export const MODULE_KEY = 'jaquar';
export type JaquarRole = 'owner' | 'manager' | 'viewer';

export interface JaquarAuth extends Omit<ModuleAuth, 'moduleRole'> {
  role: JaquarRole;
}

export async function requireJaquarMember(
  req: NextRequest,
  orgId: string,
): Promise<JaquarAuth | { ok: false; res: NextResponse }> {
  const result = await requireModuleMember(req, orgId, MODULE_KEY);
  if (!result.ok) return result;
  return { ...result, role: result.moduleRole as JaquarRole };
}

export function canWrite(role: JaquarRole): boolean {
  return ['owner', 'manager'].includes(role);
}
