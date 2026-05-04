import { NextResponse } from "next/server";
import { z } from "zod";

import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { assertCallerIsAdmin } from "../_utils";

export const runtime = "nodejs";

const QuerySchema = z.object({
  userId: z.string().uuid(),
});

const BodySchema = z.object({
  userId: z.string().uuid(),
  items: z
    .array(
      z.object({
        function_key: z.string().min(1),
        allowed: z.boolean(),
      }),
    )
    .default([]),
});

export async function GET(req: Request) {
  const guard = await assertCallerIsAdmin(req);
  if (!guard.ok) return NextResponse.json({ error: guard.message }, { status: guard.status });

  const url = new URL(req.url);
  const parsed = QuerySchema.safeParse({ userId: url.searchParams.get("userId") ?? "" });
  if (!parsed.success) return NextResponse.json({ error: "invalid_query" }, { status: 400 });

  let admin: ReturnType<typeof createSupabaseAdminClient>;
  try {
    admin = createSupabaseAdminClient();
  } catch (e: any) {
    return NextResponse.json({ error: "missing_supabase_admin_env", message: String(e?.message ?? "") }, { status: 500 });
  }

  const { data, error } = await admin
    .from("user_permissions")
    .select("function_key,allowed")
    .eq("user_id", parsed.data.userId);

  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ ok: true, items: data ?? [] });
}

export async function PUT(req: Request) {
  const guard = await assertCallerIsAdmin(req);
  if (!guard.ok) return NextResponse.json({ error: guard.message }, { status: guard.status });

  const json = await req.json().catch(() => null);
  const parsed = BodySchema.safeParse(json);
  if (!parsed.success) return NextResponse.json({ error: "invalid_body" }, { status: 400 });

  let admin: ReturnType<typeof createSupabaseAdminClient>;
  try {
    admin = createSupabaseAdminClient();
  } catch (e: any) {
    return NextResponse.json({ error: "missing_supabase_admin_env", message: String(e?.message ?? "") }, { status: 500 });
  }

  const userId = parsed.data.userId;
  const allowedKeys = parsed.data.items.filter((x) => x.allowed).map((x) => x.function_key);

  const delRes = await admin.from("user_permissions").delete().eq("user_id", userId);
  if (delRes.error) return NextResponse.json({ error: delRes.error.message }, { status: 400 });

  if (allowedKeys.length) {
    const insRes = await admin
      .from("user_permissions")
      .insert(allowedKeys.map((k) => ({ user_id: userId, function_key: k, allowed: true })));
    if (insRes.error) return NextResponse.json({ error: insRes.error.message }, { status: 400 });
  }

  return NextResponse.json({ ok: true });
}

