/**
 * recordUsage — บันทึกต้นทุนแปรผัน 1 รายการลง `usage_events`
 *
 * ใช้กับต้นทุนที่ "ยังไม่มีตารางของตัวเอง" — Gemini ที่เรียกผ่าน aiChat/aiEmbed, LINE push,
 * PDF render, งาน worker · ของที่ log อยู่แล้ว (assistant_jobs / acc_firm_ai_log / bi_query_log)
 * มี **trigger ที่ DB** ยิงเข้า usage_events ให้อยู่แล้ว — ห้ามเรียกซ้ำที่นี่ (จะนับเบิ้ล)
 *
 * กฎ:
 *  - fire-and-forget เสมอ — การวัดต้นทุนห้ามทำให้ฟีเจอร์ผู้ใช้พัง (error ถูกกลืน + log)
 *  - cost ถูกคำนวณ ณ ตอนเขียนด้วยราคาปัจจุบัน แล้ว freeze ไว้ (ราคาเปลี่ยนไม่ย้อนแก้ประวัติ)
 *  - ราคาต่อหน่วยอ่านจากตาราง `usage_prices` (super_admin แก้ได้) แคชในโปรเซส 5 นาที
 */

import { after } from "next/server";

import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { mergeUsageContext } from "@/lib/usage/context";

export type UsageService = "gemini" | "line" | "recall" | "compute" | "storage" | "other";
export type UsageUnit = "token" | "message" | "second" | "page" | "request" | "gb_month" | "job";

/** บริบทเจ้าของต้นทุน — ส่งต่อจาก caller (org ไหน ใครสั่ง) */
export type UsageContext = {
  orgId?: string | null;
  profileId?: string | null;
  /**
   * ชื่อฟีเจอร์ที่ก่อต้นทุน เช่น 'tmc.sales_bot' — ใช้ group ในรายงาน
   * ไม่ส่ง = ใช้ค่าจาก ambient context ของ request (ดู lib/usage/context.ts)
   */
  feature?: string;
};

export type UsageInput = UsageContext & {
  service: UsageService;
  resource?: string | null;
  unit: UsageUnit;
  quantity: number;
  /** จ่ายมาเองถ้าคำนวณแล้ว — ไม่งั้นคิดจาก priceKey × quantity */
  costUsd?: number;
  /** key ใน usage_prices (เช่น 'line:push_message') */
  priceKey?: string;
  inputTokens?: number;
  outputTokens?: number;
  refTable?: string | null;
  refId?: string | null;
  meta?: Record<string, unknown>;
};

// ── price cache ──────────────────────────────────────────────────────────────
let priceCache: { at: number; map: Map<string, number> } | null = null;
const PRICE_TTL_MS = 5 * 60_000;

async function getPrices(): Promise<Map<string, number>> {
  if (priceCache && Date.now() - priceCache.at < PRICE_TTL_MS) return priceCache.map;
  const map = new Map<string, number>();
  try {
    const admin = createSupabaseAdminClient();
    const { data } = await admin
      .from("usage_prices")
      .select("key, unit_cost_usd")
      .eq("is_active", true);
    for (const r of data ?? []) map.set(r.key as string, Number(r.unit_cost_usd) || 0);
  } catch (e) {
    console.error("[usage] load prices failed", String(e));
  }
  priceCache = { at: Date.now(), map };
  return map;
}

export async function priceUsd(key: string): Promise<number> {
  return (await getPrices()).get(key) ?? 0;
}

/**
 * เลื่อนงานไปทำหลังส่ง response — บน Vercel ฟังก์ชันอาจถูก freeze ทันทีที่ตอบ
 * ทำให้ promise ที่ลอย ๆ (`void insert()`) ไม่ได้เขียนจริง → event หาย
 * `after()` ของ Next 15 การันตีว่างานได้รัน · นอก request scope (cron/สคริปต์) จะ throw → ทำ inline แทน
 */
function runAfterResponse(fn: () => Promise<void>): void {
  try {
    after(fn);
  } catch {
    void fn();
  }
}

/** บันทึก 1 event — ไม่ throw ไม่ว่าเกิดอะไร */
export async function recordUsage(raw: UsageInput): Promise<void> {
  try {
    // ⚠️ ต้อง merge บริบทตรงนี้ (ยังอยู่ใน AsyncLocalStorage scope ของ request)
    // ก่อนจะเลื่อนการเขียนออกไปหลัง response — ไม่งั้น store หายแล้ว org จะกลายเป็น null
    const input = mergeUsageContext(raw);
    const qty = Number.isFinite(input.quantity) ? Math.max(0, input.quantity) : 0;
    let cost = input.costUsd;
    if (cost == null && input.priceKey) cost = qty * (await priceUsd(input.priceKey));

    const row = {
      org_id: input.orgId ?? null,
      profile_id: input.profileId ?? null,
      service: input.service,
      feature: input.feature ?? "uncategorized",
      resource: input.resource ?? null,
      quantity: qty,
      unit: input.unit,
      input_tokens: Math.max(0, Math.round(input.inputTokens ?? 0)),
      output_tokens: Math.max(0, Math.round(input.outputTokens ?? 0)),
      cost_usd: Math.max(0, cost ?? 0),
      ref_table: input.refTable ?? null,
      ref_id: input.refId ?? null,
      meta: input.meta ?? {},
    };

    runAfterResponse(async () => {
      const { error } = await createSupabaseAdminClient().from("usage_events").insert(row);
      if (error) console.error("[usage] insert failed", row.feature, error.message);
    });
  } catch (e) {
    console.error("[usage] record failed", raw.feature ?? raw.service, String(e));
  }
}

/**
 * ราคา Gemini ต่อโมเดล — map ชื่อโมเดล → key ใน usage_prices
 * โมเดลที่ไม่รู้จักตกไปที่ flash (ราคาที่ใช้จริงมากสุด) แทนที่จะนับเป็น 0
 */
function geminiKeys(model: string): { textIn: string; out: string } {
  const m = model.toLowerCase();
  if (m.includes("embedding"))
    return { textIn: "gemini-embedding-001:in", out: "gemini-embedding-001:in" };
  if (m.includes("flash-lite"))
    return { textIn: "gemini-2.5-flash-lite:text_in", out: "gemini-2.5-flash-lite:out" };
  if (m.includes("pro")) return { textIn: "gemini-2.5-pro:text_in", out: "gemini-2.5-pro:out" };
  return { textIn: "gemini-2.5-flash:text_in", out: "gemini-2.5-flash:out" };
}

/** ต้นทุน Gemini (USD) จาก token จริง ตามราคาของโมเดลนั้น */
export async function geminiCostUsd(
  model: string,
  inputTokens: number,
  outputTokens: number,
): Promise<number> {
  const k = geminiKeys(model);
  const inRate = await priceUsd(k.textIn);
  const outRate = await priceUsd(k.out);
  return Math.max(0, inputTokens) * inRate + Math.max(0, outputTokens) * outRate;
}

/** ทางลัดสำหรับการเรียก Gemini 1 ครั้ง (ใช้ใน lib/ai/client.ts) */
export async function recordGeminiUsage(
  ctx: UsageContext,
  args: {
    model: string;
    inputTokens: number;
    outputTokens: number;
    meta?: Record<string, unknown>;
  },
): Promise<void> {
  const cost = await geminiCostUsd(args.model, args.inputTokens, args.outputTokens);
  await recordUsage({
    ...ctx,
    service: "gemini",
    resource: args.model,
    unit: "token",
    quantity: args.inputTokens + args.outputTokens,
    inputTokens: args.inputTokens,
    outputTokens: args.outputTokens,
    costUsd: cost,
    meta: args.meta,
  });
}

/** ทางลัดสำหรับข้อความ LINE ที่ส่งออก (push/multicast/reply) */
export async function recordLineUsage(
  ctx: UsageContext,
  args: { messages: number; recipients?: number; kind?: string },
): Promise<void> {
  const count = Math.max(0, args.messages) * Math.max(1, args.recipients ?? 1);
  if (!count) return;
  await recordUsage({
    orgId: ctx.orgId ?? null,
    profileId: ctx.profileId ?? null,
    feature: ctx.feature,
    service: "line",
    resource: args.kind ?? "push",
    unit: "message",
    quantity: count,
    priceKey: "line:push_message",
  });
}
