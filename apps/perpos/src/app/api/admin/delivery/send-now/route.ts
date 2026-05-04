import { NextResponse } from "next/server";
import { z } from "zod";

import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { assertCallerIsAdmin } from "../../users/_utils";
import { sendLineMessages } from "@/lib/line/send-messages";
import { basicHeadlineSummary, fetchRssItems, summarizeWithOpenAI } from "@/lib/news/news-agent";

export const runtime = "nodejs";

const BodySchema = z.object({
  toUserIds: z.array(z.string().uuid()).default([]),
});

async function buildNewsText(admin: ReturnType<typeof createSupabaseAdminClient>) {
  const cfgRes = await admin.from("news_agent_configs").select("topics,sources,summary_style,max_items").order("updated_at", { ascending: false }).limit(1).maybeSingle();
  const cfg = cfgRes.error ? null : (cfgRes.data as any);

  const topics = Array.isArray(cfg?.topics) ? (cfg?.topics as string[]) : [];
  const sources = Array.isArray(cfg?.sources) ? (cfg?.sources as any[]) : [];
  const style = (cfg?.summary_style as any) || "bullet";
  const maxItems = Number(cfg?.max_items ?? 8);

  const rssUrls = sources
    .map((s) => (s && typeof s.value === "string" ? String(s.value) : ""))
    .filter((x) => x.trim().length);
  const perSource = Math.max(1, Math.ceil(maxItems / Math.max(1, rssUrls.length)));
  const lists = await Promise.all(rssUrls.map((u) => fetchRssItems(u, perSource).catch(() => [])));
  const items = lists.flat().slice(0, Math.min(30, Math.max(1, maxItems)));

  const key = process.env.OPENAI_API_KEY ?? "";
  if (!key) return basicHeadlineSummary(items, Math.min(8, maxItems));

  try {
    return await summarizeWithOpenAI({ apiKey: key, topics, items, style });
  } catch {
    return basicHeadlineSummary(items, Math.min(8, maxItems));
  }
}

export async function POST(req: Request) {
  const guard = await assertCallerIsAdmin(req);
  if (!guard.ok) return NextResponse.json({ error: guard.message }, { status: guard.status });

  const json = await req.json().catch(() => null);
  const parsed = BodySchema.safeParse(json);
  if (!parsed.success) return NextResponse.json({ error: "invalid_body" }, { status: 400 });

  let admin: ReturnType<typeof createSupabaseAdminClient>;
  try {
    admin = createSupabaseAdminClient();
  } catch (e: any) {
    return NextResponse.json({ error: "missing_supabase_admin_env", message: String(e?.message ?? "") }, { status: 500 });
  }

  const toUserIds = parsed.data.toUserIds;
  if (!toUserIds.length) return NextResponse.json({ ok: true, sent: 0 });

  const profilesRes = await admin.from("profiles").select("id,line_user_id").in("id", toUserIds);
  if (profilesRes.error) return NextResponse.json({ error: profilesRes.error.message }, { status: 400 });

  const lineIds = (profilesRes.data ?? [])
    .map((p: any) => String(p.line_user_id ?? "").trim())
    .filter((x) => x.length);

  const text = await buildNewsText(admin);
  let sent = 0;

  for (const p of (profilesRes.data ?? []) as any[]) {
    const lineUserId = String(p.line_user_id ?? "").trim();
    if (!lineUserId) {
      await admin.from("delivery_logs").insert({ profile_id: p.id, status: "failed", error_message: "missing_line_user_id", payload: { type: "news" } });
      continue;
    }
    const res = await sendLineMessages({ to: lineUserId, messages: [{ type: "text", text }] });
    if (res.ok) {
      sent += 1;
      await admin.from("delivery_logs").insert({ profile_id: p.id, status: "sent", payload: { type: "news" } });
    } else {
      await admin.from("delivery_logs").insert({ profile_id: p.id, status: "failed", error_message: res.error, payload: { type: "news" } });
    }
  }

  return NextResponse.json({ ok: true, sent, total: toUserIds.length, lineRecipients: lineIds.length });
}

