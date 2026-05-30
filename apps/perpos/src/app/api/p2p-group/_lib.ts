import { NextRequest, NextResponse } from 'next/server';
import { requireModuleMember, ModuleAuth } from '../_lib/module-auth';

export const MODULE_KEY = 'p2p_group';
export type P2pGroupRole = 'owner' | 'manager' | 'viewer';

export interface P2pGroupAuth extends Omit<ModuleAuth, 'moduleRole'> {
  role: P2pGroupRole;
}

export async function requireP2pGroupMember(
  req: NextRequest,
  orgId: string,
): Promise<P2pGroupAuth | { ok: false; res: NextResponse }> {
  const result = await requireModuleMember(req, orgId, MODULE_KEY);
  if (!result.ok) return result;
  return { ...result, role: result.moduleRole as P2pGroupRole };
}

export function canWrite(role: P2pGroupRole): boolean {
  return ['owner', 'manager'].includes(role);
}
