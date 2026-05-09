"use server";

import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export async function uploadOrgFile(params: {
  organizationId: string;
  bucket: "org-assets" | "bank-statements" | "documents";
  objectPath: string;
  file: File;
  contentType?: string;
}) {
  const supabase = await createSupabaseServerClient();
  const { data: userRes, error: userErr } = await supabase.auth.getUser();
  if (userErr || !userRes.user) return { ok: false as const, error: "not_authenticated" };

  const { data: m, error: mErr } = await supabase
    .from("organization_members")
    .select("role")
    .eq("organization_id", params.organizationId)
    .eq("user_id", userRes.user.id)
    .maybeSingle();
  if (mErr || !m) return { ok: false as const, error: "not_allowed" };

  const admin = createSupabaseAdminClient();
  const bytes = new Uint8Array(await params.file.arrayBuffer());
  const { error } = await admin.storage
    .from(params.bucket)
    .upload(params.objectPath, bytes, { upsert: true, contentType: params.contentType ?? params.file.type });
  if (error) return { ok: false as const, error: error.message ?? "upload_failed" };
  return { ok: true as const, path: params.objectPath };
}

