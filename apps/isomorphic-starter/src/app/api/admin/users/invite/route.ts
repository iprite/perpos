import { NextResponse } from "next/server";
import { z } from "zod";

import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { buildAuthLinkEmail } from "@/lib/email/auth-link-email";
import { sendEmail } from "@/lib/email/send-email";
import { assertCallerIsAdmin } from "../_utils";

const BodySchema = z.object({
  email: z.string().email(),
  role: z.enum(["admin", "sale", "operation", "employer", "representative"]),
  customerId: z.string().uuid().optional(),
  companyRepresentativeId: z.string().uuid().optional(),
  representativeLevel: z.enum(["lead", "member"]).optional(),
  representativeLeadId: z.string().uuid().optional(),
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

  const {
    email,
    role,
    customerId,
    companyRepresentativeId,
    representativeLevel,
    representativeLeadId,
    redirectTo,
  } = parsed.data;

  if (role === "employer" && !customerId) {
    return NextResponse.json({ error: "missing_customer" }, { status: 400 });
  }
  if (role === "representative" && !companyRepresentativeId) {
    return NextResponse.json({ error: "missing_representative" }, { status: 400 });
  }
  if (role === "representative" && !representativeLevel) {
    return NextResponse.json({ error: "missing_representative_level" }, { status: 400 });
  }
  if (role === "representative" && representativeLevel === "member" && !representativeLeadId) {
    return NextResponse.json({ error: "missing_representative_lead" }, { status: 400 });
  }

  const admin = createSupabaseAdminClient();

  const inviteRes = await admin.auth.admin.generateLink({
    type: "invite",
    email,
    options: { redirectTo },
  });

  let linkData = inviteRes.data;
  let linkError = inviteRes.error;

  if (linkError) {
    const msg = String(linkError.message ?? "").toLowerCase();
    const looksLikeAlreadyRegistered =
      msg.includes("already registered") || msg.includes("already exists") || msg.includes("user exists");
    if (looksLikeAlreadyRegistered) {
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

  const userId = linkData.user.id;
  const actionLink = linkData.properties.action_link;

  const { error: profileError } = await admin.from("profiles").upsert(
    {
      id: userId,
      email,
      role,
      representative_level: role === "representative" ? representativeLevel ?? null : null,
      representative_lead_id: role === "representative" && representativeLevel === "member" ? representativeLeadId ?? null : null,
    },
    { onConflict: "id" },
  );
  if (profileError) {
    return NextResponse.json({ error: profileError.message }, { status: 400 });
  }

  if (role === "employer" && customerId) {
    const { data: customer, error: customerError } = await admin
      .from("customers")
      .select("id,name,organization_id")
      .eq("id", customerId)
      .single();
    if (customerError || !customer) {
      return NextResponse.json({ error: customerError?.message ?? "customer_not_found" }, { status: 400 });
    }

    let organizationId = (customer as any).organization_id as string | null;
    if (!organizationId) {
      const { data: orgInserted, error: orgError } = await admin
        .from("organizations")
        .insert({ name: (customer as any).name ?? "องค์กร" })
        .select("id")
        .single();
      if (orgError || !orgInserted) {
        return NextResponse.json({ error: orgError?.message ?? "create_organization_failed" }, { status: 400 });
      }

      organizationId = (orgInserted as any).id as string;
      const { error: linkError } = await admin
        .from("customers")
        .update({ organization_id: organizationId })
        .eq("id", customerId);
      if (linkError) {
        return NextResponse.json({ error: linkError.message }, { status: 400 });
      }
    }

    const { error: memberError } = await admin
      .from("organization_members")
      .upsert(
        { organization_id: organizationId, profile_id: userId, member_role: "member" },
        { onConflict: "organization_id,profile_id" },
      );
    if (memberError) {
      return NextResponse.json({ error: memberError.message }, { status: 400 });
    }
  }

  if (role === "representative" && companyRepresentativeId) {
    const { error: repError } = await admin
      .from("company_representatives")
      .update({ profile_id: userId })
      .eq("id", companyRepresentativeId);
    if (repError) {
      return NextResponse.json({ error: repError.message }, { status: 400 });
    }
  }

  const subject = "ตั้งรหัสผ่านเพื่อเข้าใช้งานระบบ";
  const { html, text } = buildAuthLinkEmail({ title: "ตั้งรหัสผ่านเพื่อเข้าใช้งานระบบ", actionLabel: "ตั้งรหัสผ่าน", actionLink: actionLink });
  const sent = await sendEmail({ to: email, subject, html, text });

  if (!sent.ok) {
    return NextResponse.json({ error: "email_send_failed", reason: sent.reason, actionLink }, { status: 502 });
  }

  return NextResponse.json({ ok: true, userId, actionLink, emailSent: true });
}
