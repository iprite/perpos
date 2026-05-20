import { NextRequest, NextResponse } from 'next/server';
import { createAuthedClient } from '../_lib/supabase';
import { extractBearer, requireUser } from '../_lib/auth';

export type TmcRole = 'owner' | 'admin' | 'management' | 'team_lead' | 'team_member';

export interface TmcAuth {
  ok: true;
  userId: string;
  orgId: string;
  role: TmcRole;
  rls: ReturnType<typeof createAuthedClient>;
}

/** Require user to be a member of a TMC org. orgId must be provided in body/query. */
export async function requireTmcMember(
  req: NextRequest,
  orgId: string,
): Promise<TmcAuth | { ok: false; res: NextResponse }> {
  const auth = await requireUser(req);
  if (!auth.ok) return { ok: false, res: auth.res };

  const token = extractBearer(req)!;
  const rls = createAuthedClient(token);

  const { data: membership } = await rls
    .from('organization_members')
    .select('role')
    .eq('organization_id', orgId)
    .eq('user_id', auth.userId)
    .maybeSingle();

  if (!membership) {
    return {
      ok: false,
      res: NextResponse.json({ error: 'ไม่มีสิทธิ์เข้าถึง TMC module' }, { status: 403 }),
    };
  }

  return {
    ok: true,
    userId: auth.userId,
    orgId,
    role: (membership as Record<string, string>).role as TmcRole,
    rls,
  };
}

/** Only management/owner/admin can mutate finance entries */
export function canWriteFinance(role: TmcRole) {
  return ['owner', 'admin', 'management', 'team_lead'].includes(role);
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
