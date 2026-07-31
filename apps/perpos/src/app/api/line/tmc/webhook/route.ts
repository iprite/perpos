/**
 * Webhook ของ LINE OA @tmcvilla — "ผู้ช่วยขาย TMC"
 *
 * แยกจาก /api/line/webhook (บอท PERPOS) โดยสิ้นเชิง — คนละ channel คนละ secret
 *
 * flow ต่อ 1 ข้อความ
 *   verify signature → resolve org → upsert contact → บันทึกข้อความ
 *   → ถ้าอยู่โหมด "คนจริง" → บอทเงียบ
 *   → ถ้าลูกค้าขอคุยกับแอดมิน → escalate(request_human)
 *   → ไม่งั้น RAG ตอบ · ตอบไม่ได้ → escalate(no_answer)
 *
 * escalate = ตั้งโหมดคนจริง (บอทเงียบ N นาที) + บันทึกเคส + push แจ้งแอดมินทาง LINE ส่วนตัว
 * (ผ่านบอท PERPOS) แล้วแอดมินเข้าไปคุยต่อใน LINE Official Account Manager
 *
 * ⚠️ LINE OA ต้องตั้ง Response settings = เปิดทั้ง "Chat" และ "Webhook"
 *    ไม่งั้นแอดมินตอบมือไม่ได้ หรือ webhook ไม่ยิง
 */
import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "../../../_lib/supabase";
import { answerSalesQuestion, isSmallTalk, wantsHuman } from "@/lib/tmc/sales-bot";
import {
  tmcChatUrl,
  tmcGetBotUserId,
  tmcGetProfile,
  tmcLineConfigured,
  tmcReplyText,
  verifyTmcSignature,
} from "@/lib/tmc/line-oa";
import { buildTmcEscalationFlex } from "@/lib/tmc/line-cards";
import { sendLineMessages } from "@/lib/line/send-messages";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;

type Admin = ReturnType<typeof createAdminClient>;

interface BotSettings {
  org_id: string;
  is_enabled: boolean;
  bot_name: string;
  greeting_text: string;
  fallback_text: string;
  handoff_text: string;
  min_similarity: number;
  human_mode_minutes: number;
  daily_message_cap: number;
  notify_profile_ids: string[];
  oa_bot_user_id: string | null;
}

interface Contact {
  id: string;
  org_id: string;
  line_user_id: string;
  display_name: string | null;
  mode: string;
  human_until: string | null;
  message_count: number;
  escalation_count: number;
  day_key: string | null;
  day_count: number;
}

// ─── org เจ้าของ OA ──────────────────────────────────────────────────────────

async function resolveBotOrgId(admin: Admin): Promise<string | null> {
  const slug = process.env.TMC_BOT_ORG_SLUG?.trim();
  if (slug) {
    const { data } = await admin.from("organizations").select("id").eq("slug", slug).maybeSingle();
    return (data as { id: string } | null)?.id ?? null;
  }
  // ไม่ได้ระบุ slug → ใช้ org เดียวที่เปิด module tmc (ถ้ามีหลาย org ต้องตั้ง TMC_BOT_ORG_SLUG)
  const { data } = await admin
    .from("org_module_settings")
    .select("organization_id")
    .eq("module_key", "tmc")
    .eq("is_enabled", true)
    .limit(2);
  const rows = (data ?? []) as { organization_id: string }[];
  return rows.length === 1 ? rows[0].organization_id : null;
}

async function loadSettings(admin: Admin, orgId: string): Promise<BotSettings> {
  const { data } = await admin
    .from("tmc_bot_settings")
    .select("*")
    .eq("org_id", orgId)
    .maybeSingle();
  if (data) return data as BotSettings;
  const { data: created } = await admin
    .from("tmc_bot_settings")
    .insert({ org_id: orgId })
    .select("*")
    .single();
  return created as BotSettings;
}

// ─── contact ─────────────────────────────────────────────────────────────────

async function upsertContact(
  admin: Admin,
  orgId: string,
  lineUserId: string,
): Promise<Contact | null> {
  const { data: existing } = await admin
    .from("tmc_chat_contacts")
    .select("*")
    .eq("org_id", orgId)
    .eq("line_user_id", lineUserId)
    .maybeSingle();

  if (existing) {
    const c = existing as Contact;
    if (!c.display_name) {
      const profile = await tmcGetProfile(lineUserId);
      if (profile?.displayName) {
        await admin
          .from("tmc_chat_contacts")
          .update({ display_name: profile.displayName, picture_url: profile.pictureUrl ?? null })
          .eq("id", c.id);
        c.display_name = profile.displayName;
      }
    }
    return c;
  }

  const profile = await tmcGetProfile(lineUserId);
  const { data: created } = await admin
    .from("tmc_chat_contacts")
    .insert({
      org_id: orgId,
      line_user_id: lineUserId,
      display_name: profile?.displayName ?? null,
      picture_url: profile?.pictureUrl ?? null,
    })
    .select("*")
    .single();
  return (created as Contact | null) ?? null;
}

async function logMessage(
  admin: Admin,
  args: {
    orgId: string;
    contactId: string;
    role: "customer" | "bot" | "system";
    text: string;
    similarity?: number | null;
    isEscalation?: boolean;
    lineMessageId?: string | null;
  },
): Promise<string | null> {
  const { data, error } = await admin
    .from("tmc_chat_messages")
    .insert({
      org_id: args.orgId,
      contact_id: args.contactId,
      role: args.role,
      text: args.text.slice(0, 8000),
      similarity: args.similarity ?? null,
      is_escalation: args.isEscalation ?? false,
      line_message_id: args.lineMessageId ?? null,
    })
    .select("id")
    .single();
  if (error) return null;
  return (data as { id: string }).id;
}

// ─── escalation ──────────────────────────────────────────────────────────────

async function escalate(
  admin: Admin,
  args: {
    settings: BotSettings;
    contact: Contact;
    reason: "no_answer" | "request_human";
    question: string;
    messageId: string | null;
    bestSimilarity: number | null;
  },
): Promise<void> {
  const { settings, contact, reason, question, messageId, bestSimilarity } = args;

  const humanUntil = new Date(Date.now() + settings.human_mode_minutes * 60_000).toISOString();
  await admin
    .from("tmc_chat_contacts")
    .update({
      mode: "human",
      human_until: humanUntil,
      escalation_count: contact.escalation_count + 1,
    })
    .eq("id", contact.id);

  const { data: esc } = await admin
    .from("tmc_chat_escalations")
    .insert({
      org_id: settings.org_id,
      contact_id: contact.id,
      message_id: messageId,
      reason,
      question: question.slice(0, 2000),
      best_similarity: bestSimilarity,
    })
    .select("id")
    .single();

  // ─ แจ้งแอดมินทาง LINE ส่วนตัว (บอท PERPOS) ─
  const profileIds = settings.notify_profile_ids ?? [];
  if (!profileIds.length) return;

  const { data: profiles } = await admin
    .from("profiles")
    .select("line_user_id")
    .in("id", profileIds)
    .not("line_user_id", "is", null);
  const targets = ((profiles ?? []) as { line_user_id: string }[])
    .map((p) => p.line_user_id)
    .filter(Boolean);
  if (!targets.length) return;

  // cache userId ของ OA ไว้ทำลิงก์ห้องแชท
  let botUserId = settings.oa_bot_user_id;
  if (!botUserId) {
    botUserId = await tmcGetBotUserId();
    if (botUserId) {
      await admin
        .from("tmc_bot_settings")
        .update({ oa_bot_user_id: botUserId })
        .eq("org_id", settings.org_id);
    }
  }

  const base = process.env.APP_BASE_URL?.replace(/\/$/, "") || "https://app.perpos.ai";
  const { data: org } = await admin
    .from("organizations")
    .select("slug")
    .eq("id", settings.org_id)
    .maybeSingle();
  const slug = (org as { slug: string } | null)?.slug ?? "";

  const card = buildTmcEscalationFlex({
    reason,
    customerName: contact.display_name || "ลูกค้า LINE",
    question,
    chatUrl: tmcChatUrl(botUserId, contact.line_user_id),
    consoleUrl: `${base}/${slug}/tmc/sales-bot?tab=inbox`,
    askedAt: new Date(),
  });

  await sendLineMessages({ to: targets, messages: [card] });
  if (esc) {
    await admin
      .from("tmc_chat_escalations")
      .update({ notified_at: new Date().toISOString() })
      .eq("id", (esc as { id: string }).id);
  }
}

// ─── handler ─────────────────────────────────────────────────────────────────

interface LineEvent {
  type: string;
  replyToken?: string;
  source?: { type?: string; userId?: string };
  message?: { id?: string; type?: string; text?: string };
}

export async function POST(req: NextRequest) {
  const rawBody = await req.text();

  if (!tmcLineConfigured()) {
    // ยังไม่ได้ตั้ง env — ตอบ 200 กัน LINE retry รัว ๆ
    return NextResponse.json({ ok: true, skipped: "not_configured" });
  }
  if (!verifyTmcSignature(rawBody, req.headers.get("x-line-signature"))) {
    return NextResponse.json({ error: "invalid signature" }, { status: 401 });
  }

  const body = JSON.parse(rawBody || "{}") as { events?: LineEvent[] };
  const events = body.events ?? [];
  if (!events.length) return NextResponse.json({ ok: true });

  const admin = createAdminClient();
  const orgId = await resolveBotOrgId(admin);
  if (!orgId) return NextResponse.json({ ok: true, skipped: "no_org" });

  const settings = await loadSettings(admin, orgId);

  for (const ev of events) {
    const lineUserId = ev.source?.userId;
    if (!lineUserId || ev.source?.type !== "user") continue;

    try {
      if (ev.type === "follow") {
        const contact = await upsertContact(admin, orgId, lineUserId);
        if (contact) {
          await admin.from("tmc_chat_contacts").update({ is_blocked: false }).eq("id", contact.id);
          if (settings.is_enabled && ev.replyToken) {
            await tmcReplyText(ev.replyToken, settings.greeting_text);
            await logMessage(admin, {
              orgId,
              contactId: contact.id,
              role: "bot",
              text: settings.greeting_text,
            });
          }
        }
        continue;
      }

      if (ev.type === "unfollow") {
        await admin
          .from("tmc_chat_contacts")
          .update({ is_blocked: true })
          .eq("org_id", orgId)
          .eq("line_user_id", lineUserId);
        continue;
      }

      if (ev.type !== "message" || ev.message?.type !== "text") continue;

      const text = (ev.message.text ?? "").trim();
      if (!text) continue;

      const contact = await upsertContact(admin, orgId, lineUserId);
      if (!contact) continue;

      // dedup ต่อ line_message_id (unique index กันซ้ำอยู่แล้ว — null = ข้าม)
      const messageId = await logMessage(admin, {
        orgId,
        contactId: contact.id,
        role: "customer",
        text,
        lineMessageId: ev.message.id ?? null,
      });
      if (!messageId) continue; // ซ้ำ (LINE redeliver) → ไม่ตอบซ้ำ

      const today = new Date().toISOString().slice(0, 10);
      const dayCount = contact.day_key === today ? contact.day_count + 1 : 1;
      await admin
        .from("tmc_chat_contacts")
        .update({
          message_count: contact.message_count + 1,
          day_key: today,
          day_count: dayCount,
          last_message_at: new Date().toISOString(),
          last_message_text: text.slice(0, 500),
        })
        .eq("id", contact.id);

      if (!settings.is_enabled) continue;
      if (dayCount > settings.daily_message_cap) continue; // กันสแปม — เงียบ

      // โหมดคนจริงยังไม่หมดอายุ → บอทเงียบ ปล่อยให้แอดมินคุย
      const humanActive =
        contact.mode === "human" &&
        !!contact.human_until &&
        new Date(contact.human_until) > new Date();
      if (humanActive) continue;

      // ทริกเกอร์ 1: ลูกค้าขอคุยกับคนจริง
      if (wantsHuman(text)) {
        if (ev.replyToken) await tmcReplyText(ev.replyToken, settings.handoff_text);
        await logMessage(admin, {
          orgId,
          contactId: contact.id,
          role: "bot",
          text: settings.handoff_text,
          isEscalation: true,
        });
        await escalate(admin, {
          settings,
          contact,
          reason: "request_human",
          question: text,
          messageId,
          bestSimilarity: null,
        });
        continue;
      }

      // ทักทายสั้น ๆ → ตอบเองไม่ต้องเรียกแอดมิน
      if (isSmallTalk(text)) {
        if (ev.replyToken) await tmcReplyText(ev.replyToken, settings.greeting_text);
        await logMessage(admin, {
          orgId,
          contactId: contact.id,
          role: "bot",
          text: settings.greeting_text,
        });
        continue;
      }

      // ประวัติสั้น ๆ ให้บอทเข้าใจบริบทต่อเนื่อง
      const { data: hist } = await admin
        .from("tmc_chat_messages")
        .select("role, text")
        .eq("contact_id", contact.id)
        .in("role", ["customer", "bot"])
        .order("created_at", { ascending: false })
        .limit(7);
      const history = ((hist ?? []) as { role: "customer" | "bot"; text: string }[])
        .slice(1) // ตัดข้อความล่าสุด (= คำถามปัจจุบัน)
        .reverse();

      let answer: string | null = null;
      let best = 0;
      try {
        const result = await answerSalesQuestion({
          admin,
          orgId,
          botName: settings.bot_name,
          question: text,
          minSimilarity: Number(settings.min_similarity),
          history,
        });
        answer = result.answer;
        best = result.bestSimilarity;
      } catch {
        answer = null;
      }

      if (answer) {
        if (ev.replyToken) await tmcReplyText(ev.replyToken, answer);
        await logMessage(admin, {
          orgId,
          contactId: contact.id,
          role: "bot",
          text: answer,
          similarity: best,
        });
        continue;
      }

      // ทริกเกอร์ 2: บอทตอบไม่ได้
      if (ev.replyToken) await tmcReplyText(ev.replyToken, settings.fallback_text);
      await logMessage(admin, {
        orgId,
        contactId: contact.id,
        role: "bot",
        text: settings.fallback_text,
        similarity: best,
        isEscalation: true,
      });
      await escalate(admin, {
        settings,
        contact,
        reason: "no_answer",
        question: text,
        messageId,
        bestSimilarity: best,
      });
    } catch {
      // ข้อความเดียวพังไม่ควรทำให้ทั้ง batch fail (LINE จะ retry ทั้งก้อน)
      continue;
    }
  }

  return NextResponse.json({ ok: true });
}
