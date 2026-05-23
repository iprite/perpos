import { NextRequest, NextResponse } from 'next/server';
import { createAuthedClient } from '../_lib/supabase';
import { requireModuleMember } from '../_lib/module-auth';

export type TmcRole = 'owner' | 'admin' | 'team_lead' | 'team_member';

export interface TmcAuth {
  ok: true;
  userId: string;
  orgId: string;
  role: TmcRole;
  rls: ReturnType<typeof createAuthedClient>;
}

/** Require user to be an active member of the TMC module.
 *  Delegates to the generic requireModuleMember() registry checker.
 */
export async function requireTmcMember(
  req: NextRequest,
  orgId: string,
): Promise<TmcAuth | { ok: false; res: NextResponse }> {
  const result = await requireModuleMember(req, orgId, 'tmc');
  if (!result.ok) return result;

  return {
    ok: true,
    userId: result.userId,
    orgId:  result.orgId,
    role:   result.moduleRole as TmcRole,
    rls:    result.rls,
  };
}

/** Only team_lead/owner/admin can mutate finance entries */
export function canWriteFinance(role: TmcRole) {
  return ['owner', 'admin', 'team_lead'].includes(role);
}

export const FINANCE_CATEGORIES = [
  'รายรับ ค่าเช่า',
  'ค่ามัดจำ',
  'คืนเงินมัดจำ',
  'ค่าอาหาร',
  'อาหารเช้า',
  'หมูกระทะ',
  'บาร์บีคิว',
  'ค่าแรง(เงินเดือน+จ้างนอก)',
  'ค่าไฟ',
  'ค่าน้ำ',
  'ซักผ้า',
  'ล้างแอร์',
  'ค่าของใช้ทั่วไป',
  'ค่าโทรศัพท์',
  'ค่าใช้จ่ายอื่นๆ',
  'ค่าส่งของ',
  'ค่าเสื้อพนักงาน',
  'ค่านวด',
  'เงินสดย่อย',
  'แมคโค',
  'ส่วนกลาง',
  'บัญชี',
  'Timber',
];

export const BOOKING_CHANNELS = ['Line', 'Agoda', 'Walk-in', 'IG', 'Call', 'Friend', 'อินฟลู', 'Shopee', 'อื่นๆ'];
export const GROUP_TYPES = ['Family', 'Couple', 'Friend', 'Solo'];
