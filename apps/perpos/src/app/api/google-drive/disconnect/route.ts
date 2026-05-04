import { NextResponse } from "next/server";

import { assertActiveUser } from "@/app/api/google-drive/_utils";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";

export async function POST(req: Request) {
  const guard = await assertActiveUser(req);
  if (!guard.ok) return NextResponse.json({ error: guard.error }, { status: guard.status });

  const admin = createSupabaseAdminClient();
  const { error } = await admin.from("google_drive_tokens").delete().eq("profile_id", guard.profileId);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}

