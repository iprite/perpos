import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '../../../_lib/auth';
import { createAdminClient } from '../../../_lib/supabase';
import { logAdminAction } from '../../../_lib/admin-audit';

export async function PUT(req: NextRequest) {
  const auth = await requireAdmin(req);
  if (!auth.ok) return auth.res;

  const body = await req.json().catch(() => ({})) as { userId?: string; isActive?: boolean };
  const { userId, isActive } = body;
  if (!userId || isActive === undefined) {
    return NextResponse.json({ error: 'missing userId or isActive' }, { status: 400 });
  }

  // กันระงับตัวเอง (ล็อกตัวเองออกจากระบบ)
  if (userId === auth.userId && isActive === false) {
    return NextResponse.json({ error: 'cannot deactivate yourself' }, { status: 400 });
  }

  const admin = createAdminClient();
  const { error } = await admin
    .from('profiles')
    .update({ is_active: isActive })
    .eq('id', userId);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  await logAdminAction(req, auth.userId, {
    action: isActive ? 'user.activate' : 'user.deactivate',
    targetType: 'user',
    targetId: userId,
  });

  return NextResponse.json({ ok: true, isActive });
}
