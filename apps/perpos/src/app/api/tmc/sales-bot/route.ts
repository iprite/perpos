/**
 * ผู้ช่วยขาย TMC — ตั้งค่าบอท + ผูกกลุ่ม LINE ที่รับแจ้งเตือน
 *
 * GET  ?orgId=                        → { settings, stats, lineConfigured }
 * PUT                                 → แก้ตั้งค่า
 * POST { action: "link-code" }        → ออกรหัสผูกกลุ่ม TMC-XXXXXX (อายุ 24 ชม.)
 *                                       กลุ่มอยู่กับบอท PERPOS — รหัสถูกรับที่ /api/line/webhook
 * POST { action: "unlink-group" }     → ปลดการผูกกลุ่ม
 *
 * botMode: sales = ผู้ช่วยขาย (ก่อนจอง) · service = ดูแลลูกค้าระหว่าง/หลังเข้าพัก
 * testMode + testLineUserIds: ช่วงทดสอบ ให้บอทตอบเฉพาะคนที่ระบุ
 */
import { randomBytes } from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "../../_lib/supabase";
import { requireTmcMember, canWriteFinance } from "../_lib";
import { generateTmcLinkCode, TMC_LINK_CODE_TTL_HOURS } from "@/lib/tmc/notify-group";

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
    patch.human_mode_minutes = Math.min(1440, Math.max(5, Number(body.humanModeMinutes) || 15));
  }
  if (body.dailyMessageCap !== undefined) {
    patch.daily_message_cap = Math.min(500, Math.max(5, Number(body.dailyMessageCap) || 60));
  }
  if (["sales", "service", "both"].includes(String(body.botMode))) patch.bot_mode = body.botMode;
  if (typeof body.testMode === "boolean") patch.test_mode = body.testMode;
  if (Array.isArray(body.testLineUserIds)) {
    patch.test_line_user_ids = (body.testLineUserIds as string[]).map(String);
  }

  const admin = createAdminClient();
  const { error } = await admin.from("tmc_bot_settings").upsert({ org_id: orgId, ...patch });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}

export async function POST(req: NextRequest) {
  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const orgId = String(body.orgId ?? "");
  const action = String(body.action ?? "");
  if (!orgId) return NextResponse.json({ error: "missing orgId" }, { status: 400 });

  const auth = await requireTmcMember(req, orgId);
  if (!auth.ok) return auth.res;
  if (!canWriteFinance(auth.role))
    return NextResponse.json({ error: "ไม่มีสิทธิ์" }, { status: 403 });

  const admin = createAdminClient();

  if (action === "link-code") {
    const code = generateTmcLinkCode(randomBytes);
    const expiresAt = new Date(Date.now() + TMC_LINK_CODE_TTL_HOURS * 3600_000).toISOString();
    const { error } = await admin
      .from("tmc_bot_settings")
      .upsert({ org_id: orgId, link_code: code, link_code_expires_at: expiresAt });
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ code, expiresAt });
  }

  if (action === "unlink-group") {
    const { error } = await admin
      .from("tmc_bot_settings")
      .update({ notify_group_id: null, notify_group_name: null, notify_linked_at: null })
      .eq("org_id", orgId);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true });
  }

  return NextResponse.json({ error: "action ไม่ถูกต้อง" }, { status: 400 });
}
