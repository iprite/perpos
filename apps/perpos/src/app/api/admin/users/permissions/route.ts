import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '../../../_lib/auth';
import { createAdminClient } from '../../../_lib/supabase';
import { logAdminAction } from '../../../_lib/admin-audit';

export async function GET(req: NextRequest) {
  const auth = await requireAdmin(req);
  if (!auth.ok) return auth.res;

  const userId = req.nextUrl.searchParams.get('userId');
  if (!userId) return NextResponse.json({ error: 'missing userId' }, { status: 400 });

  const admin = createAdminClient();
  const { data, error } = await admin
    .from('user_permissions')
    .select('function_key, allowed')
    .eq('user_id', userId);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ ok: true, items: data ?? [] });
}

export async function PUT(req: NextRequest) {
  const auth = await requireAdmin(req);
  if (!auth.ok) return auth.res;

  const body = await req.json().catch(() => ({})) as {
    userId?: string;
    items?: { function_key: string; allowed: boolean }[];
  };
  const { userId, items } = body;
  if (!userId || !Array.isArray(items)) return NextResponse.json({ error: 'missing userId or items' }, { status: 400 });

  const admin = createAdminClient();

  // snapshot ไว้ rollback ถ้า insert ล้ม — กัน user เสียสิทธิ์ทั้งหมดจาก delete-then-insert ที่ไม่ atomic
  const { data: prev } = await admin.from('user_permissions').select('function_key, allowed').eq('user_id', userId);

  await admin.from('user_permissions').delete().eq('user_id', userId);

  if (items.length) {
    const rows = items.map((it) => ({ user_id: userId, function_key: it.function_key, allowed: Boolean(it.allowed) }));
    const { error } = await admin.from('user_permissions').insert(rows);
    if (error) {
      // rollback กลับสู่สถานะเดิม
      if (prev?.length) {
        await admin.from('user_permissions').insert(prev.map((p) => ({ user_id: userId, function_key: p.function_key, allowed: p.allowed })));
      }
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
  }

  await logAdminAction(req, auth.userId, {
    action: 'user.permissions_set',
    targetType: 'user',
    targetId: userId,
    metadata: { count: items.length },
  });

  return NextResponse.json({ ok: true });
}
