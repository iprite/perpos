import { NextResponse } from "next/server";

import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { assertCallerIsAdmin } from "../../users/_utils";

export const runtime = "nodejs";

export async function GET(req: Request) {
  const guard = await assertCallerIsAdmin(req);
  if (!guard.ok) return NextResponse.json({ error: guard.message }, { status: guard.status });

  let admin: ReturnType<typeof createSupabaseAdminClient>;
  try {
    admin = createSupabaseAdminClient();
  } catch (e: any) {
    return NextResponse.json({ error: "missing_supabase_admin_env", message: String(e?.message ?? "") }, { status: 500 });
  }

  const { data, error } = await admin.from("delivery_logs").select("id,profile_id,status,error_message,sent_at").order("sent_at", { ascending: false }).limit(50);
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ ok: true, items: data ?? [] });
}

