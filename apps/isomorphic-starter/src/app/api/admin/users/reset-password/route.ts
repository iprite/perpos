import { NextResponse } from "next/server";
import { z } from "zod";

import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { buildAuthLinkEmail } from "@/lib/email/auth-link-email";
import { sendEmail } from "@/lib/email/send-email";
import { assertCallerIsAdmin } from "../_utils";

const BodySchema = z.object({
  email: z.string().email(),
  redirectTo: z.string().url(),
});

export async function POST(req: Request) {
  const guard = await assertCallerIsAdmin(req);
  if (!guard.ok) {
    return NextResponse.json({ error: guard.message }, { status: guard.status });
  }

  const json = await req.json().catch(() => null);
  const parsed = BodySchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid_body" }, { status: 400 });
  }

  const { email, redirectTo } = parsed.data;

  const admin = createSupabaseAdminClient();

  const { data: linkData, error: linkError } = await admin.auth.admin.generateLink({
    type: "recovery",
    email,
    options: { redirectTo },
  });
  if (linkError || !linkData.properties?.action_link) {
    return NextResponse.json({ error: linkError?.message ?? "reset_failed" }, { status: 400 });
  }

  const actionLink = linkData.properties.action_link;
  const subject = "รีเซ็ตรหัสผ่าน";
  const { html, text } = buildAuthLinkEmail({ title: "รีเซ็ตรหัสผ่าน", actionLabel: "ตั้งรหัสผ่านใหม่", actionLink: actionLink });
  const sent = await sendEmail({ to: email, subject, html, text }).catch(() => ({ ok: false as const, reason: "send_failed" as const }));

  return NextResponse.json({ ok: true, actionLink, emailSent: sent.ok });
}
