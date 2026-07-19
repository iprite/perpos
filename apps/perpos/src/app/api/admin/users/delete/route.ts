import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '../../../_lib/auth';
import { createAdminClient } from '../../../_lib/supabase';
import { logAdminAction } from '../../../_lib/admin-audit';

export async function POST(req: NextRequest) {
  const auth = await requireAdmin(req);
  if (!auth.ok) return auth.res;

  const body = await req.json().catch(() => ({})) as { userId?: string };
  if (!body.userId) return NextResponse.json({ error: 'missing userId' }, { status: 400 });

  // กันลบตัวเอง
  if (body.userId === auth.userId) {
    return NextResponse.json({ error: 'cannot delete yourself' }, { status: 400 });
  }

  const admin = createAdminClient();

  // shared auth pool: ลบได้เฉพาะ user ของ perpos (มีแถวใน public.profiles) —
  // auth.users ใช้ร่วมกับ app อื่น (tagged user_metadata.app) ห้ามแตะข้าม app
  const { data: target } = await admin
    .from('profiles')
    .select('id, email, display_name, role')
    .eq('id', body.userId)
    .maybeSingle();
  if (!target) {
    return NextResponse.json({ error: 'user not found' }, { status: 404 });
  }
  // กันลบ super admin คนอื่น (insider/บัญชีหลุดลบ admin ทิ้งทั้งหมด)
  if (target.role === 'super_admin') {
    return NextResponse.json({ error: 'cannot delete another super admin' }, { status: 403 });
  }

  const { error } = await admin.auth.admin.deleteUser(body.userId);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  await logAdminAction(req, auth.userId, {
    action: 'user.delete',
    targetType: 'user',
    targetId: body.userId,
    targetLabel: (target?.email as string | undefined) ?? (target?.display_name as string | undefined) ?? null,
  });

  return NextResponse.json({ ok: true });
}
