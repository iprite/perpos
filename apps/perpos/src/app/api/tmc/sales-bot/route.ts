/**
 * ผู้ช่วยขาย TMC — ตั้งค่าบอท + รายชื่อแอดมินที่รับแจ้งเตือนได้
 *
 * GET  ?orgId=  → { settings, members, stats }
 * PUT           → แก้ตั้งค่า
 */
import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "../../_lib/supabase";
import { requireTmcMember, canWriteFinance } from "../_lib";

export async function GET(req: NextRequest) {
  const orgId = req.nextUrl.searchParams.get("orgId") ?? "";
  if (!orgId) return NextResponse.json({ error: "missing orgId" }, { status: 400 });

  const auth = await requireTmcMember(req, orgId);
  if (!auth.ok) return auth.res;

  const admin = createAdminClient();

  let { data: settings } = await admin
    .from("tmc_bot_settings")
    .select("*")
    .eq("org_id", orgId)
    .maybeSingle();
  if (!settings) {
    const { data: created } = await admin
      .from("tmc_bot_settings")
      .insert({ org_id: orgId })
      .select("*")
      .single();
    settings = created;
  }

  // แอดมินที่เลือกให้รับแจ้งเตือนได้ = สมาชิก org ที่ผูก LINE กับบอท PERPOS แล้ว
  const { data: memberRows } = await admin
    .from("organization_members")
    .select("user_id, role")
    .eq("organization_id", orgId);
  const members = (memberRows ?? []) as { user_id: string; role: string }[];

  const { data: profileRows } = members.length
    ? await admin
        .from("profiles")
        .select("id, display_name, email, line_user_id")
        .in(
          "id",
          members.map((m) => m.user_id),
        )
    : { data: [] };

  const profiles = (profileRows ?? []) as {
    id: string;
    display_name: string | null;
    email: string | null;
    line_user_id: string | null;
  }[];

  const [
    { count: articleCount },
    { count: pendingEmbed },
    { count: openCases },
    { count: contactCount },
  ] = await Promise.all([
    admin
      .from("tmc_kb_articles")
      .select("id", { count: "exact", head: true })
      .eq("org_id", orgId)
      .eq("is_active", true),
    admin
      .from("tmc_kb_articles")
      .select("id", { count: "exact", head: true })
      .eq("org_id", orgId)
      .eq("is_active", true)
      .is("embedded_at", null),
    admin
      .from("tmc_chat_escalations")
      .select("id", { count: "exact", head: true })
      .eq("org_id", orgId)
      .eq("status", "open"),
    admin
      .from("tmc_chat_contacts")
      .select("id", { count: "exact", head: true })
      .eq("org_id", orgId),
  ]);

  return NextResponse.json({
    settings,
    members: profiles.map((p) => ({
      id: p.id,
      name: p.display_name || p.email || "ผู้ใช้",
      role: members.find((m) => m.user_id === p.id)?.role ?? "",
      hasLine: !!p.line_user_id,
    })),
    stats: {
      articles: articleCount ?? 0,
      pendingEmbed: pendingEmbed ?? 0,
      openCases: openCases ?? 0,
      contacts: contactCount ?? 0,
    },
    lineConfigured: !!(
      process.env.TMC_LINE_CHANNEL_SECRET && process.env.TMC_LINE_CHANNEL_ACCESS_TOKEN
    ),
  });
}

export async function PUT(req: NextRequest) {
  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const orgId = String(body.orgId ?? "");
  if (!orgId) return NextResponse.json({ error: "missing orgId" }, { status: 400 });

  const auth = await requireTmcMember(req, orgId);
  if (!auth.ok) return auth.res;
  if (!canWriteFinance(auth.role))
    return NextResponse.json({ error: "ไม่มีสิทธิ์" }, { status: 403 });

  const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (typeof body.isEnabled === "boolean") patch.is_enabled = body.isEnabled;
  if (typeof body.botName === "string") patch.bot_name = body.botName.trim() || "น้องแอดมิน TMC";
  if (typeof body.greetingText === "string") patch.greeting_text = body.greetingText;
  if (typeof body.fallbackText === "string") patch.fallback_text = body.fallbackText;
  if (typeof body.handoffText === "string") patch.handoff_text = body.handoffText;
  if (body.minSimilarity !== undefined) {
    patch.min_similarity = Math.min(0.95, Math.max(0.3, Number(body.minSimilarity) || 0.6));
  }
  if (body.humanModeMinutes !== undefined) {
    patch.human_mode_minutes = Math.min(1440, Math.max(5, Number(body.humanModeMinutes) || 120));
  }
  if (body.dailyMessageCap !== undefined) {
    patch.daily_message_cap = Math.min(500, Math.max(5, Number(body.dailyMessageCap) || 60));
  }
  if (Array.isArray(body.notifyProfileIds)) {
    patch.notify_profile_ids = (body.notifyProfileIds as string[]).map(String);
  }

  const admin = createAdminClient();
  const { error } = await admin.from("tmc_bot_settings").upsert({ org_id: orgId, ...patch });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
