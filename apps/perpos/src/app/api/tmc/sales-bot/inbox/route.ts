/**
 * ผู้ช่วยขาย TMC — เคสรอแอดมิน + บทสนทนาลูกค้า
 *
 * GET  ?orgId=&view=cases|contacts            → รายการ
 * GET  ?orgId=&contactId=                     → ประวัติข้อความของลูกค้ารายนั้น
 * PATCH { orgId, escalationId, status }       → ปิด/รับเคส
 * PATCH { orgId, contactId, mode:'bot' }      → คืนลูกค้ารายนี้ให้บอทตอบต่อ
 */
import { NextRequest, NextResponse } from "next/server";
import { requireTmcMember, canManageSalesBot } from "../../_lib";

const MESSAGE_LIMIT = 100;
const LIST_LIMIT = 200;

export async function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams;
  const orgId = sp.get("orgId") ?? "";
  if (!orgId) return NextResponse.json({ error: "missing orgId" }, { status: 400 });

  const auth = await requireTmcMember(req, orgId);
  if (!auth.ok) return auth.res;

  const contactId = sp.get("contactId");
  if (contactId) {
    const { data, error } = await auth.rls
      .from("tmc_chat_messages")
      .select("id, role, text, similarity, is_escalation, created_at")
      .eq("org_id", orgId)
      .eq("contact_id", contactId)
      .order("created_at", { ascending: false })
      .limit(MESSAGE_LIMIT);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ messages: (data ?? []).reverse() });
  }

  if (sp.get("view") === "contacts") {
    const { data, error } = await auth.rls
      .from("tmc_chat_contacts")
      .select(
        "id, line_user_id, display_name, picture_url, mode, human_until, is_blocked, message_count, escalation_count, last_message_at, last_message_text",
      )
      .eq("org_id", orgId)
      .order("last_message_at", { ascending: false, nullsFirst: false })
      .limit(LIST_LIMIT);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ contacts: data ?? [] });
  }

  // default = เคสรอแอดมิน
  const status = sp.get("status") ?? "open";
  let q = auth.rls
    .from("tmc_chat_escalations")
    .select(
      "id, contact_id, reason, question, best_similarity, status, notified_at, handled_at, created_at, tmc_chat_contacts(display_name, line_user_id, mode, human_until)",
    )
    .eq("org_id", orgId)
    .order("created_at", { ascending: false })
    .limit(LIST_LIMIT);
  if (status !== "all") q = q.eq("status", status);

  const { data, error } = await q;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ cases: data ?? [] });
}

export async function PATCH(req: NextRequest) {
  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const orgId = String(body.orgId ?? "");
  if (!orgId) return NextResponse.json({ error: "missing orgId" }, { status: 400 });

  const auth = await requireTmcMember(req, orgId);
  if (!auth.ok) return auth.res;
  if (!canManageSalesBot(auth.role))
    return NextResponse.json({ error: "ไม่มีสิทธิ์" }, { status: 403 });

  if (body.escalationId) {
    const status = String(body.status ?? "handled");
    if (!["open", "handled", "closed"].includes(status)) {
      return NextResponse.json({ error: "status ไม่ถูกต้อง" }, { status: 400 });
    }
    const { error } = await auth.rls
      .from("tmc_chat_escalations")
      .update({
        status,
        handled_by: status === "open" ? null : auth.userId,
        handled_at: status === "open" ? null : new Date().toISOString(),
        ...(typeof body.note === "string" ? { note: body.note } : {}),
      })
      .eq("id", String(body.escalationId))
      .eq("org_id", orgId);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true });
  }

  if (body.contactId) {
    const mode = String(body.mode ?? "bot");
    if (!["bot", "human"].includes(mode)) {
      return NextResponse.json({ error: "mode ไม่ถูกต้อง" }, { status: 400 });
    }
    const { error } = await auth.rls
      .from("tmc_chat_contacts")
      .update({
        mode,
        // คืนให้บอท = ล้างเวลาหมดอายุโหมดคนจริงทันที
        human_until: mode === "bot" ? null : new Date(Date.now() + 120 * 60_000).toISOString(),
        ...(typeof body.note === "string" ? { note: body.note } : {}),
      })
      .eq("id", String(body.contactId))
      .eq("org_id", orgId);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true });
  }

  return NextResponse.json({ error: "ต้องระบุ escalationId หรือ contactId" }, { status: 400 });
}
