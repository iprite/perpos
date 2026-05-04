import { NextResponse } from "next/server";

import { assertActiveUser } from "@/app/api/google-drive/_utils";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";

export async function GET(req: Request) {
  const guard = await assertActiveUser(req);
  if (!guard.ok) return NextResponse.json({ error: guard.error }, { status: guard.status });

  const admin = createSupabaseAdminClient();
  const { data, error } = await admin
    .from("google_drive_tokens")
    .select("profile_id,expires_at,drive_root_folder_id")
    .eq("profile_id", guard.profileId)
    .maybeSingle();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({
    ok: true,
    connected: Boolean(data?.profile_id),
    expiresAt: data?.expires_at ?? null,
    folderId: data?.drive_root_folder_id ?? null,
  });
}

