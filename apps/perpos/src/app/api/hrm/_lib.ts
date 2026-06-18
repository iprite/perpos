import { NextRequest, NextResponse } from 'next/server';
import { requireModuleMember, ModuleAuth } from '../_lib/module-auth';

export const MODULE_KEY = 'hrm';
export type HrmRole = 'owner' | 'manager' | 'viewer';

export interface HrmAuth extends Omit<ModuleAuth, 'moduleRole'> {
  role: HrmRole;
}

export async function requireHrmMember(
  req: NextRequest,
  orgId: string,
): Promise<HrmAuth | { ok: false; res: NextResponse }> {
  const result = await requireModuleMember(req, orgId, MODULE_KEY);
  if (!result.ok) return result;
  return { ...result, role: result.moduleRole as HrmRole };
}

export function canWrite(role: HrmRole): boolean {
  return ['owner', 'manager'].includes(role);
}
