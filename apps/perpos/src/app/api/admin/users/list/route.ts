import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '../../../_lib/auth';
import { createAdminClient } from '../../../_lib/supabase';

export async function GET(req: NextRequest) {
  const auth = await requireAdmin(req);
  if (!auth.ok) return auth.res;

  const page = Math.max(1, Number(req.nextUrl.searchParams.get('page') ?? 1));
  const perPage = Math.min(200, Math.max(1, Number(req.nextUrl.searchParams.get('perPage') ?? 50)));

  const admin = createAdminClient();
  const { data: { users }, error } = await admin.auth.admin.listUsers({ page, perPage });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const ids = users.map((u) => u.id);
  const { data: profiles } = await admin.from('profiles').select('id, email, role, is_active, line_user_id, created_at').in('id', ids);
  const profileById = new Map((profiles ?? []).map((p) => [p.id, p]));

  return NextResponse.json({
    ok: true,
    items: users.map((u) => ({
      id: u.id,
      email: u.email ?? null,
      created_at: u.created_at,
      last_sign_in_at: u.last_sign_in_at ?? null,
      invited_at: (u as unknown as Record<string, unknown>).invited_at ?? null,
      profile: profileById.get(u.id) ?? null,
    })),
  });
}
