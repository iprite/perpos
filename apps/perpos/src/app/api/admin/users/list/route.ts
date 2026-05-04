import { NextResponse } from "next/server";
import { z } from "zod";

import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { assertCallerIsAdmin } from "../_utils";

export const runtime = "nodejs";

const QuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  perPage: z.coerce.number().int().min(1).max(200).default(50),
});

export async function GET(req: Request) {
  const guard = await assertCallerIsAdmin(req);
  if (!guard.ok) {
    return NextResponse.json({ error: guard.message }, { status: guard.status });
  }

  const url = new URL(req.url);
  const parsed = QuerySchema.safeParse({
    page: url.searchParams.get("page") ?? undefined,
    perPage: url.searchParams.get("perPage") ?? undefined,
  });
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid_query" }, { status: 400 });
  }

  let admin: ReturnType<typeof createSupabaseAdminClient>;
  try {
    admin = createSupabaseAdminClient();
  } catch (e: any) {
    return NextResponse.json({ error: "missing_supabase_admin_env", message: String(e?.message ?? "") }, { status: 500 });
  }
  const { page, perPage } = parsed.data;

  const { data: listData, error: listError } = await admin.auth.admin.listUsers({ page, perPage });
  if (listError || !listData) {
    return NextResponse.json({ error: listError?.message ?? "list_failed" }, { status: 400 });
  }

  const users = listData.users ?? [];
  const ids = users.map((u) => u.id);

  const profilesRes = ids.length
    ? await admin
        .from("profiles")
        .select("id,email,role,is_active,line_user_id,created_at")
        .in("id", ids)
    : ({ data: [], error: null } as any);

  const firstError = profilesRes.error;
  if (firstError) {
    return NextResponse.json({ error: firstError.message }, { status: 400 });
  }

  const profileById = new Map<string, any>();
  for (const p of (profilesRes.data ?? []) as any[]) {
    profileById.set(p.id, p);
  }

  const items = users.map((u) => {
    const p = profileById.get(u.id) ?? null;
    return {
      id: u.id,
      email: u.email ?? null,
      created_at: u.created_at,
      last_sign_in_at: u.last_sign_in_at ?? null,
      invited_at: (u as any).invited_at ?? null,
      profile: p,
    };
  });

  return NextResponse.json({
    page,
    perPage,
    total: listData.total ?? null,
    items,
  });
}
