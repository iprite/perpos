import { NextRequest, NextResponse } from 'next/server';
import { requireModuleMember, ModuleAuth } from '../_lib/module-auth';

export const MODULE_KEY = 'p2p_supply';
export type P2pSupplyRole = 'owner' | 'manager' | 'viewer';

export interface P2pSupplyAuth extends Omit<ModuleAuth, 'moduleRole'> {
  role: P2pSupplyRole;
}

export async function requireP2pSupplyMember(
  req: NextRequest,
  orgId: string,
): Promise<P2pSupplyAuth | { ok: false; res: NextResponse }> {
  const result = await requireModuleMember(req, orgId, MODULE_KEY);
  if (!result.ok) return result;
  return { ...result, role: result.moduleRole as P2pSupplyRole };
}

export function canWrite(role: P2pSupplyRole): boolean {
  return ['owner', 'manager'].includes(role);
}
