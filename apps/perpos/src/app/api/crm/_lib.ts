import { NextRequest, NextResponse } from 'next/server';
import { createAuthedClient } from '../_lib/supabase';
import { requireModuleMember } from '../_lib/module-auth';

export type CrmRole = 'owner' | 'manager' | 'member' | 'viewer';

export interface CrmAuth {
  ok: true;
  userId: string;
  orgId: string;
  role: CrmRole;
  rls: ReturnType<typeof createAuthedClient>;
}

export async function requireCrmMember(
  req: NextRequest,
  orgId: string,
): Promise<CrmAuth | { ok: false; res: NextResponse }> {
  const result = await requireModuleMember(req, orgId, 'crm');
  if (!result.ok) return result;
  return {
    ok: true,
    userId: result.userId,
    orgId:  result.orgId,
    role:   result.moduleRole as CrmRole,
    rls:    result.rls,
  };
}

export function canWrite(role: CrmRole) {
  return role !== 'viewer';
}

export const SOLUTION_STATUSES = [
  { value: 'lead',        label: 'Lead' },
  { value: 'proposal',    label: 'Proposal' },
  { value: 'in_progress', label: 'In Progress' },
  { value: 'on_hold',     label: 'On Hold' },
  { value: 'completed',   label: 'Completed' },
  { value: 'cancelled',   label: 'Cancelled' },
] as const;

export const PRIORITIES = [
  { value: 'low',    label: 'Low' },
  { value: 'medium', label: 'Medium' },
  { value: 'high',   label: 'High' },
  { value: 'urgent', label: 'Urgent' },
] as const;
