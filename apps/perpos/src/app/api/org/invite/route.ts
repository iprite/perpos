import { NextResponse } from "next/server";
import { z } from "zod";

import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { buildAuthLinkEmail } from "@/lib/email/auth-link-email";
import { sendEmail } from "@/lib/email/send-email";
import {
  getBearerTokenFromRequest,
  createSupabaseAuthedClient,
} from "@/app/api/admin/users/_utils";

export const runtime = "nodejs";

const BodySchema = z.object({
  email:          z.string().email(),
  orgRole:        z.enum(["owner", "admin", "member"]),
  organizationId: z.string().uuid(),
  redirectTo:     z.string().url(),
});

export async function POST(req: Request) {
  const token = getBearerTokenFromRequest(req);
  if (!token) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const authed = createSupabaseAuthedClient(token);
  const { data: userData, error: userErr } = await authed.auth.getUser(token);
  if (userErr || !userData.user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const callerId = userData.user.id;

  const json = await req.json().catch(() => null);
  const parsed = BodySchema.safeParse(json);
  if (!parsed.success) return NextResponse.json({ error: "invalid_body" }, { status: 400 });

  const { email, orgRole, organizationId, redirectTo } = parsed.data;

  // Verify caller is owner or admin of this org
  const { data: callerMem, error: memErr } = await authed
    .from("organization_members")
    .select("role")
    .eq("organization_id", organizationId)
    .eq("user_id", callerId)
    .single();

  if (memErr || !callerMem) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  if (!["owner", "admin"].includes(callerMem.role)) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  let admin: ReturnType<typeof createSupabaseAdminClient>;
  try {
    admin = createSupabaseAdminClient();
  } catch {
    return NextResponse.json({ error: "missing_supabase_admin_env" }, { status: 500 });
  }

  // Generate invite / recovery link
  const inviteRes = await admin.auth.admin.generateLink({
    type: "invite",
    email,
    options: { redirectTo },
  });

  let linkData = inviteRes.data;
  let linkError = inviteRes.error;

  if (linkError) {
    const msg = String(linkError.message ?? "").toLowerCase();
    const alreadyExists =
      msg.includes("already registered") || msg.includes("already exists") || msg.includes("user exists");
    if (alreadyExists) {
      const recoveryRes = await admin.auth.admin.generateLink({
        type: "recovery",
        email,
        options: { redirectTo },
      });
      linkData = recoveryRes.data;
      linkError = recoveryRes.error;
    }
  }

  if (linkError || !linkData.user || !linkData.properties?.action_link) {
    return NextResponse.json({ error: linkError?.message ?? "invite_failed" }, { status: 400 });
  }

  const userId      = linkData.user.id;
  const actionLink  = linkData.properties.action_link;

  // Upsert profile
  await admin.from("profiles").upsert(
    { id: userId, email, role: "user", is_active: true },
    { onConflict: "id" },
  );

  // Add to org (upsert in case already a member)
  await admin
    .from("organization_members")
    .upsert(
      { organization_id: organizationId, user_id: userId, role: orgRole },
      { onConflict: "organization_id,user_id" },
    );

  // Record in org_invites (delete old pending for same email+org first)
  await admin
    .from("org_invites")
    .delete()
    .eq("organization_id", organizationId)
    .eq("email", email)
    .eq("status", "pending");

  await admin.from("org_invites").insert({
    organization_id: organizationId,
    email,
    org_role:        orgRole,
    invited_user_id: userId,
    invited_by:      callerId,
    status:          "pending",
  });

  // Send email
  const { html, text } = buildAuthLinkEmail({
    title:       "คุณได้รับคำเชิญเข้าใช้งานระบบ",
    actionLabel: "ตั้งรหัสผ่านและเข้าสู่ระบบ",
    actionLink,
  });
  const sent = await sendEmail({
    to:      email,
    subject: "คำเชิญเข้าใช้งานระบบ PERPOS",
    html,
    text,
  });

  if (!sent.ok) {
    return NextResponse.json(
      { error: "email_send_failed", actionLink },
      { status: 502 },
    );
  }

  return NextResponse.json({ ok: true, userId, actionLink, emailSent: true });
}
