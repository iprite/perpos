import { NextRequest, NextResponse } from "next/server";
import type Stripe from "stripe";
import { createAdminClient } from "../../_lib/supabase";
import { getStripe } from "../../_lib/stripe";
import { sendLineMessages } from "@/lib/line/send-messages";

export const runtime = "nodejs";

type PaymentStatus = "trial" | "active" | "overdue" | "cancelled" | "pending";

function asString(v: unknown) {
  return typeof v === "string" ? v : "";
}

async function findOrgIdByStripeIds(
  admin: ReturnType<typeof createAdminClient>,
  ids: {
    subscriptionId?: string;
    customerId?: string;
  },
) {
  if (ids.subscriptionId) {
    const { data } = await admin
      .from("org_stripe")
      .select("org_id")
      .eq("stripe_subscription_id", ids.subscriptionId)
      .maybeSingle();
    if (data?.org_id) return String(data.org_id);
  }

  if (ids.customerId) {
    const { data } = await admin
      .from("org_stripe")
      .select("org_id")
      .eq("stripe_customer_id", ids.customerId)
      .maybeSingle();
    if (data?.org_id) return String(data.org_id);
  }

  return null;
}

async function upsertStripeEvent(
  admin: ReturnType<typeof createAdminClient>,
  event: Stripe.Event,
  orgId: string | null,
) {
  const payload = event as unknown as Record<string, unknown>;
  const { error } = await admin.from("stripe_events").insert({
    id: event.id,
    type: event.type,
    org_id: orgId,
    stripe_created_at: event.created ? new Date(event.created * 1000).toISOString() : null,
    payload,
  });

  if (!error) return { inserted: true };
  const code = (error as unknown as { code?: string }).code ?? "";
  if (code === "23505") return { inserted: false };
  return { inserted: false, error };
}

async function updateOrgBilling(
  admin: ReturnType<typeof createAdminClient>,
  orgId: string,
  patch: Record<string, unknown>,
) {
  await admin
    .from("org_billing")
    .update({
      ...patch,
      updated_at: new Date().toISOString(),
    })
    .eq("org_id", orgId);
}

async function setOrgBillingStatus(
  admin: ReturnType<typeof createAdminClient>,
  orgId: string,
  paymentStatus: PaymentStatus,
) {
  await updateOrgBilling(admin, orgId, { payment_status: paymentStatus });
}

async function resetOverdue(
  admin: ReturnType<typeof createAdminClient>,
  orgId: string,
  paymentStatus: PaymentStatus,
) {
  await updateOrgBilling(admin, orgId, {
    payment_status: paymentStatus,
    overdue_count: 0,
    last_failed_invoice_id: null,
  });
}

async function markOverdueCycle(
  admin: ReturnType<typeof createAdminClient>,
  orgId: string,
  invoiceId: string | null,
) {
  const { data } = await admin
    .from("org_billing")
    .select("overdue_count, last_failed_invoice_id")
    .eq("org_id", orgId)
    .maybeSingle();

  const row = data as Record<string, unknown> | null;
  const currentCount = Number(row?.overdue_count ?? 0);
  const lastInvoiceId = String(row?.last_failed_invoice_id ?? "");

  const shouldIncrement = Boolean(invoiceId) && invoiceId !== lastInvoiceId;
  const nextCount = shouldIncrement ? currentCount + 1 : currentCount;

  await updateOrgBilling(admin, orgId, {
    payment_status: "overdue",
    overdue_count: nextCount,
    last_failed_invoice_id: invoiceId ? invoiceId : lastInvoiceId || null,
  });
}

// normalize recurring → ต่อเดือน (annual ÷ 12) จาก Stripe subscription item
// คืน { mrr_amount, interval } สำหรับเก็บลง org_stripe — sub ที่จบแล้ว (canceled/unpaid) → 0
function mrrFields(sub: Stripe.Subscription): { mrr_amount: number; interval: string | null } {
  if (["canceled", "unpaid", "incomplete_expired"].includes(String(sub.status))) {
    return { mrr_amount: 0, interval: null };
  }
  const item = sub.items?.data?.[0];
  const price = item?.price;
  const unit = (price?.unit_amount ?? 0) / 100;
  const qty = item?.quantity ?? 1;
  const interval = price?.recurring?.interval ?? null;
  const count = price?.recurring?.interval_count ?? 1;
  const gross = unit * qty;
  let monthly = gross;
  if (interval === "year") monthly = gross / (12 * count);
  else if (interval === "month") monthly = gross / count;
  else if (interval === "week") monthly = (gross * 52) / 12 / count;
  else if (interval === "day") monthly = (gross * 365) / 12 / count;
  return { mrr_amount: Math.round(monthly * 100) / 100, interval };
}

async function upsertOrgStripe(
  admin: ReturnType<typeof createAdminClient>,
  orgId: string,
  patch: Record<string, unknown>,
) {
  await admin.from("org_stripe").upsert({
    org_id: orgId,
    ...patch,
    updated_at: new Date().toISOString(),
  });
}

async function handleCheckoutSessionCompleted(
  admin: ReturnType<typeof createAdminClient>,
  stripe: ReturnType<typeof getStripe>,
  session: Stripe.Checkout.Session,
) {
  const orgId =
    asString(session.metadata?.org_id) ||
    asString(session.client_reference_id) ||
    (await findOrgIdByStripeIds(admin, {
      subscriptionId: asString(session.subscription),
      customerId: asString(session.customer),
    }));

  if (!orgId) return null;

  const customerId = asString(session.customer);
  const subscriptionId = asString(session.subscription);

  let subscription: Stripe.Subscription | null = null;
  if (subscriptionId) {
    subscription = await stripe.subscriptions.retrieve(subscriptionId);
  }

  await upsertOrgStripe(admin, orgId, {
    stripe_customer_id: customerId || null,
    stripe_subscription_id: subscriptionId || null,
    subscription_status: subscription?.status ?? null,
    current_period_start: subscription?.current_period_start
      ? new Date(subscription.current_period_start * 1000).toISOString()
      : null,
    current_period_end: subscription?.current_period_end
      ? new Date(subscription.current_period_end * 1000).toISOString()
      : null,
    cancel_at_period_end: subscription?.cancel_at_period_end ?? false,
    ...(subscription ? mrrFields(subscription) : {}),
  });

  await resetOverdue(admin, orgId, "pending");
  return orgId;
}

// บันทึกเงินเข้า ledger ฝั่ง ERP (idempotent ด้วย invoice/payment_intent) — service role
async function recordOrgPayment(
  admin: ReturnType<typeof createAdminClient>,
  orgId: string,
  invoice: Stripe.Invoice,
  status: "succeeded" | "failed",
  eventId: string,
) {
  const amount =
    status === "succeeded" ? (invoice.amount_paid ?? 0) / 100 : (invoice.amount_due ?? 0) / 100;
  await admin.rpc("apply_org_payment", {
    p_org_id: orgId,
    p_kind: "subscription",
    p_amount: amount,
    p_currency: (invoice.currency ?? "thb").toUpperCase(),
    p_status: status,
    p_payment_intent:
      asString((invoice as unknown as { payment_intent?: string }).payment_intent) || null,
    p_invoice: asString(invoice.id) || null,
    p_event_id: eventId,
  });
}

async function handleInvoicePaymentSucceeded(
  admin: ReturnType<typeof createAdminClient>,
  stripe: ReturnType<typeof getStripe>,
  invoice: Stripe.Invoice,
  eventId: string,
) {
  const subscriptionId = asString(invoice.subscription);
  const customerId = asString(invoice.customer);

  let orgId =
    asString((invoice as unknown as { metadata?: Record<string, string> }).metadata?.org_id) ||
    (await findOrgIdByStripeIds(admin, { subscriptionId, customerId }));

  if (!orgId && subscriptionId) {
    const sub = await stripe.subscriptions.retrieve(subscriptionId);
    orgId = asString(sub.metadata?.org_id) || orgId;
  }

  if (!orgId) return null;

  if (subscriptionId) {
    const sub = await stripe.subscriptions.retrieve(subscriptionId);
    await upsertOrgStripe(admin, orgId, {
      stripe_customer_id: customerId || null,
      stripe_subscription_id: subscriptionId,
      subscription_status: sub.status,
      current_period_start: sub.current_period_start
        ? new Date(sub.current_period_start * 1000).toISOString()
        : null,
      current_period_end: sub.current_period_end
        ? new Date(sub.current_period_end * 1000).toISOString()
        : null,
      cancel_at_period_end: sub.cancel_at_period_end,
      ...mrrFields(sub),
    });
  }

  await recordOrgPayment(admin, orgId, invoice, "succeeded", eventId);
  await resetOverdue(admin, orgId, "active");
  return orgId;
}

async function handleInvoicePaymentFailed(
  admin: ReturnType<typeof createAdminClient>,
  stripe: ReturnType<typeof getStripe>,
  invoice: Stripe.Invoice,
  eventId: string,
) {
  const subscriptionId = asString(invoice.subscription);
  const customerId = asString(invoice.customer);

  let orgId = await findOrgIdByStripeIds(admin, { subscriptionId, customerId });

  if (!orgId && subscriptionId) {
    const sub = await stripe.subscriptions.retrieve(subscriptionId);
    orgId = asString(sub.metadata?.org_id) || orgId;
  }

  if (!orgId) return null;

  await recordOrgPayment(admin, orgId, invoice, "failed", eventId);

  if (subscriptionId) {
    const sub = await stripe.subscriptions.retrieve(subscriptionId);
    await upsertOrgStripe(admin, orgId, {
      stripe_customer_id: customerId || null,
      stripe_subscription_id: subscriptionId,
      subscription_status: sub.status,
      current_period_start: sub.current_period_start
        ? new Date(sub.current_period_start * 1000).toISOString()
        : null,
      current_period_end: sub.current_period_end
        ? new Date(sub.current_period_end * 1000).toISOString()
        : null,
      cancel_at_period_end: sub.cancel_at_period_end,
      ...mrrFields(sub),
    });
  }

  await markOverdueCycle(admin, orgId, asString(invoice.id) || null);
  return orgId;
}

async function handleSubscriptionUpdated(
  admin: ReturnType<typeof createAdminClient>,
  sub: Stripe.Subscription,
) {
  const subscriptionId = sub.id;
  const customerId = asString(sub.customer);
  const orgId =
    asString(sub.metadata?.org_id) ||
    (await findOrgIdByStripeIds(admin, { subscriptionId, customerId }));
  if (!orgId) return null;

  await upsertOrgStripe(admin, orgId, {
    stripe_customer_id: customerId || null,
    stripe_subscription_id: subscriptionId,
    subscription_status: sub.status,
    current_period_start: sub.current_period_start
      ? new Date(sub.current_period_start * 1000).toISOString()
      : null,
    current_period_end: sub.current_period_end
      ? new Date(sub.current_period_end * 1000).toISOString()
      : null,
    cancel_at_period_end: sub.cancel_at_period_end,
  });

  if (sub.status === "past_due" || sub.status === "unpaid") {
    await setOrgBillingStatus(admin, orgId, "overdue");
  }

  if (sub.status === "canceled") {
    await updateOrgBilling(admin, orgId, {
      payment_status: "trial",
      monthly_price: null,
      overdue_count: 0,
      last_failed_invoice_id: null,
    });
  }

  return orgId;
}

async function handleSubscriptionDeleted(
  admin: ReturnType<typeof createAdminClient>,
  sub: Stripe.Subscription,
) {
  const subscriptionId = sub.id;
  const customerId = asString(sub.customer);
  const orgId =
    asString(sub.metadata?.org_id) ||
    (await findOrgIdByStripeIds(admin, { subscriptionId, customerId }));
  if (!orgId) return null;

  await upsertOrgStripe(admin, orgId, {
    stripe_customer_id: customerId || null,
    stripe_subscription_id: subscriptionId,
    subscription_status: sub.status,
    current_period_start: sub.current_period_start
      ? new Date(sub.current_period_start * 1000).toISOString()
      : null,
    current_period_end: sub.current_period_end
      ? new Date(sub.current_period_end * 1000).toISOString()
      : null,
    cancel_at_period_end: sub.cancel_at_period_end,
  });

  await updateOrgBilling(admin, orgId, {
    payment_status: "trial",
    monthly_price: null,
    overdue_count: 0,
    last_failed_invoice_id: null,
  });
  return orgId;
}

// ─── STT billing (per-profile) ───────────────────────────────────────────────
// แยกจาก org billing: ระบุด้วย metadata.kind === 'stt' (+ profile_id) หรือ row ใน stt_subscriptions

function isSttSession(session: Stripe.Checkout.Session) {
  return asString(session.metadata?.kind) === "stt";
}

// หา profile/plan ของ STT subscription จาก subId/customerId (กรณี invoice/sub event ไม่มี metadata)
async function sttSubByStripe(
  admin: ReturnType<typeof createAdminClient>,
  ids: { subscriptionId?: string; customerId?: string },
) {
  if (ids.subscriptionId) {
    const { data } = await admin
      .from("stt_subscriptions")
      .select("profile_id, plan_id")
      .eq("stripe_subscription_id", ids.subscriptionId)
      .maybeSingle();
    if (data?.profile_id) return data as { profile_id: string; plan_id: string | null };
  }
  if (ids.customerId) {
    const { data } = await admin
      .from("stt_subscriptions")
      .select("profile_id, plan_id")
      .eq("stripe_customer_id", ids.customerId)
      .maybeSingle();
    if (data?.profile_id) return data as { profile_id: string; plan_id: string | null };
  }
  return null;
}

// resolve แผน → { id, minutes } จาก plan_id (เรา) หรือ stripe_price_id
async function resolveSttPlan(
  admin: ReturnType<typeof createAdminClient>,
  by: { planId?: string | null; priceId?: string | null },
) {
  if (by.planId) {
    const { data } = await admin
      .from("stt_plans")
      .select("id, minutes, meter")
      .eq("id", by.planId)
      .maybeSingle();
    if (data) return data as { id: string; minutes: number; meter: string };
  }
  if (by.priceId) {
    const { data } = await admin
      .from("stt_plans")
      .select("id, minutes, meter")
      .eq("stripe_price_id", by.priceId)
      .maybeSingle();
    if (data) return data as { id: string; minutes: number; meter: string };
  }
  return null;
}

function subPeriod(sub: Stripe.Subscription) {
  return {
    status: sub.status,
    start: sub.current_period_start
      ? new Date(sub.current_period_start * 1000).toISOString()
      : null,
    end: sub.current_period_end ? new Date(sub.current_period_end * 1000).toISOString() : null,
    cancel: sub.cancel_at_period_end ?? false,
  };
}

async function upsertSttSub(
  admin: ReturnType<typeof createAdminClient>,
  profileId: string,
  planId: string | null,
  customerId: string,
  sub: Stripe.Subscription,
) {
  const p = subPeriod(sub);
  await admin.rpc("upsert_stt_subscription", {
    p_profile_id: profileId,
    p_plan_id: planId,
    p_customer: customerId || null,
    p_subscription: sub.id,
    p_status: p.status,
    p_period_start: p.start,
    p_period_end: p.end,
    p_cancel_at_period_end: p.cancel,
  });
}

async function handleSttCheckout(
  admin: ReturnType<typeof createAdminClient>,
  stripe: ReturnType<typeof getStripe>,
  session: Stripe.Checkout.Session,
  eventId: string,
) {
  const profileId = asString(session.metadata?.profile_id);
  const planIdMeta = asString(session.metadata?.plan_id) || null;
  if (!profileId) return;
  const currency = (session.currency ?? "thb").toUpperCase();

  if (session.mode === "payment") {
    // topup (จ่ายครั้งเดียว) — เติมนาทีทันที
    const plan = await resolveSttPlan(admin, { planId: planIdMeta });
    if (!plan) return;
    await admin.rpc("apply_stt_payment", {
      p_profile_id: profileId,
      p_plan_id: plan.id,
      p_kind: "topup",
      p_amount: (session.amount_total ?? 0) / 100,
      p_currency: currency,
      p_minutes: plan.minutes,
      p_status: "succeeded",
      p_payment_intent: asString(session.payment_intent) || null,
      p_invoice: null,
      p_event_id: eventId,
      p_meter: plan.meter ?? "stt",
    });
  } else if (session.mode === "subscription") {
    // subscription — บันทึก sub (เติมนาทีรอ invoice.payment_succeeded)
    const subId = asString(session.subscription);
    if (!subId) return;
    const sub = await stripe.subscriptions.retrieve(subId);
    await upsertSttSub(admin, profileId, planIdMeta, asString(session.customer), sub);
  }
}

async function handleSttInvoicePaid(
  admin: ReturnType<typeof createAdminClient>,
  stripe: ReturnType<typeof getStripe>,
  invoice: Stripe.Invoice,
  eventId: string,
) {
  const subscriptionId = asString(invoice.subscription);
  const customerId = asString(invoice.customer);
  if (!subscriptionId) return false; // ไม่มี sub = ไม่ใช่ STT subscription invoice

  // หา profile/plan จาก row ที่มีอยู่ ก่อน — ถ้าไม่เจอ (event มาก่อน checkout) อ่าน metadata จาก subscription
  let row = await sttSubByStripe(admin, { subscriptionId, customerId });
  const sub = await stripe.subscriptions.retrieve(subscriptionId);
  if (!row) {
    if (asString(sub.metadata?.kind) !== "stt") return false; // ไม่ใช่ STT → ให้ org handler จัดการ
    const profileId = asString(sub.metadata?.profile_id);
    if (!profileId) return false;
    row = { profile_id: profileId, plan_id: asString(sub.metadata?.plan_id) || null };
  }

  const priceId = asString(invoice.lines?.data?.[0]?.price?.id);
  const plan = await resolveSttPlan(admin, { planId: row.plan_id, priceId });
  // sync สถานะ/รอบก่อนเสมอ (สร้าง row ถ้ายังไม่มี — กัน race)
  await upsertSttSub(admin, row.profile_id, plan?.id ?? row.plan_id, customerId, sub);
  if (!plan) return true;

  // เติมโควต้ารอบนี้ (idempotent ด้วย invoice.id)
  await admin.rpc("apply_stt_payment", {
    p_profile_id: row.profile_id,
    p_plan_id: plan.id,
    p_kind: "subscription",
    p_amount: (invoice.amount_paid ?? 0) / 100,
    p_currency: (invoice.currency ?? "thb").toUpperCase(),
    p_minutes: plan.minutes,
    p_status: "succeeded",
    p_payment_intent:
      asString((invoice as unknown as { payment_intent?: string }).payment_intent) || null,
    p_invoice: asString(invoice.id) || null,
    p_event_id: eventId,
  });
  return true;
}

async function handleSttSubscriptionEvent(
  admin: ReturnType<typeof createAdminClient>,
  sub: Stripe.Subscription,
) {
  const row = await sttSubByStripe(admin, {
    subscriptionId: sub.id,
    customerId: asString(sub.customer),
  });
  const profileId = asString(sub.metadata?.profile_id) || row?.profile_id;
  if (!profileId) return false; // ไม่ใช่ STT
  const planId = asString(sub.metadata?.plan_id) || row?.plan_id || null;
  await upsertSttSub(admin, profileId, planId, asString(sub.customer), sub);
  // subscription จบ (ยกเลิก/ค้างชำระ) → ล้างโควต้าแผนที่เหลือ (ไม่ให้ 300 นาทีค้างถาวรเกิน 30 วัน)
  if (["canceled", "unpaid", "incomplete_expired"].includes(String(sub.status))) {
    await admin.rpc("expire_stt_plan", { p_profile_id: profileId });
  }
  return true;
}

// ─── Token top-up (prepaid + auto top-up, per-profile) ───────────────────────
// ระบุด้วย metadata.kind ('token_topup' = ซื้อแพ็ก/auto-charge, 'token_setup' = บันทึกบัตร)

// เก็บ payment_method ที่บันทึกไว้ (มาจาก save_card / setup / off-session) ลง token_autotopup
async function captureTokenCard(
  admin: ReturnType<typeof createAdminClient>,
  stripe: ReturnType<typeof getStripe>,
  profileId: string,
  pmId: string,
) {
  if (!profileId || !pmId) return;
  const pm = await stripe.paymentMethods.retrieve(pmId).catch(() => null);
  await admin.from("token_autotopup").upsert(
    {
      profile_id: profileId,
      stripe_payment_method_id: pmId,
      card_brand: pm?.card?.brand ?? null,
      card_last4: pm?.card?.last4 ?? null,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "profile_id" },
  );
}

// PaymentIntent สำเร็จ (ทั้ง manual pack + auto-charge) → เติม token + เก็บบัตร(ถ้ามี)
async function handleTokenPaymentSucceeded(
  admin: ReturnType<typeof createAdminClient>,
  stripe: ReturnType<typeof getStripe>,
  pi: Stripe.PaymentIntent,
  eventId: string,
) {
  if (asString(pi.metadata?.kind) !== "token_topup") return;
  const profileId = asString(pi.metadata?.profile_id);
  const packCode = asString(pi.metadata?.pack_code);
  if (!profileId || !packCode) return;

  // ตรึงจำนวน token จาก metadata ตอนชาร์จ (กัน pack ถูกแก้ระหว่างทาง) · fallback อ่าน pack
  let tokens = Number(asString(pi.metadata?.tokens));
  if (!Number.isFinite(tokens) || tokens <= 0) {
    const { data: pack } = await admin
      .from("token_packs")
      .select("tokens")
      .eq("code", packCode)
      .maybeSingle();
    tokens = Number((pack as { tokens?: number } | null)?.tokens ?? 0);
  }
  if (tokens <= 0) return;

  await admin.rpc("apply_token_payment", {
    p_profile_id: profileId,
    p_pack_code: packCode,
    p_tokens: tokens,
    p_amount: (pi.amount_received ?? pi.amount ?? 0) / 100,
    p_currency: (pi.currency ?? "thb").toUpperCase(),
    p_payment_intent: pi.id,
    p_event_id: eventId,
  });

  const pmId = asString(pi.payment_method);
  if (pmId) await captureTokenCard(admin, stripe, profileId, pmId);

  // auto-charge สำเร็จ → ปลดล็อก runtime + บันทึกเวลา
  if (asString(pi.metadata?.auto) === "1") {
    await admin
      .from("token_autotopup")
      .update({
        status: "idle",
        charging_at: null,
        last_charged_at: new Date().toISOString(),
        last_error: null,
        updated_at: new Date().toISOString(),
      })
      .eq("profile_id", profileId);
  }
}

// PaymentIntent ล้มเหลว — เฉพาะ auto-charge: ปิด auto ทันที + แจ้ง LINE
async function handleTokenPaymentFailed(
  admin: ReturnType<typeof createAdminClient>,
  pi: Stripe.PaymentIntent,
) {
  if (asString(pi.metadata?.kind) !== "token_topup" || asString(pi.metadata?.auto) !== "1") return;
  const profileId = asString(pi.metadata?.profile_id);
  if (!profileId) return;
  // dedupe: scheduler ปิด+แจ้งทันทีตอน off-session decline แล้ว → ถ้าปิดไปแล้วไม่ต้องทำซ้ำ
  const { data: row } = await admin
    .from("token_autotopup")
    .select("enabled")
    .eq("profile_id", profileId)
    .maybeSingle();
  if (!row || (row as { enabled: boolean }).enabled === false) return;
  await admin
    .from("token_autotopup")
    .update({
      enabled: false,
      status: "idle",
      charging_at: null,
      last_error: asString(pi.last_payment_error?.message) || "card_declined",
      updated_at: new Date().toISOString(),
    })
    .eq("profile_id", profileId);

  const { data: prof } = await admin
    .from("profiles")
    .select("line_user_id")
    .eq("id", profileId)
    .maybeSingle();
  const lineId = (prof as { line_user_id?: string } | null)?.line_user_id;
  if (lineId) {
    await sendLineMessages({
      to: lineId,
      messages: [
        {
          type: "text",
          text: "⚠️ เติมเครดิตอัตโนมัติไม่สำเร็จ (บัตรถูกปฏิเสธ) — ปิดระบบเติมอัตโนมัติแล้ว\nกรุณาอัปเดตบัตรหรือเติมเครดิตเองที่หน้าผู้ช่วย AI ครับ",
        },
      ],
    }).catch(() => undefined);
  }
}

// Checkout mode='setup' (บันทึกบัตรอย่างเดียว) สำเร็จ → เก็บ payment_method
async function handleTokenSetupCompleted(
  admin: ReturnType<typeof createAdminClient>,
  stripe: ReturnType<typeof getStripe>,
  session: Stripe.Checkout.Session,
) {
  const profileId = asString(session.metadata?.profile_id);
  const siId = asString(session.setup_intent);
  if (!profileId || !siId) return;
  const si = await stripe.setupIntents.retrieve(siId);
  const pmId = asString(si.payment_method);
  if (pmId) await captureTokenCard(admin, stripe, profileId, pmId);
}

export async function POST(req: NextRequest) {
  const secret = process.env.STRIPE_WEBHOOK_SECRET ?? "";
  if (!secret)
    return NextResponse.json({ error: "missing_STRIPE_WEBHOOK_SECRET" }, { status: 500 });

  const signature = req.headers.get("stripe-signature") ?? "";
  if (!signature) return NextResponse.json({ error: "missing_signature" }, { status: 400 });

  const rawBody = await req.text();
  const stripe = getStripe();

  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(rawBody, signature, secret);
  } catch {
    return NextResponse.json({ error: "invalid_signature" }, { status: 400 });
  }

  const admin = createAdminClient();

  const orgIdHint = (() => {
    const obj = event.data.object as unknown as Record<string, unknown>;
    const md = (obj.metadata as Record<string, unknown> | undefined) ?? undefined;
    const fromMd = md ? asString(md.org_id) : "";
    return fromMd || null;
  })();

  const inserted = await upsertStripeEvent(admin, event, orgIdHint);
  if ("error" in inserted && inserted.error) {
    return NextResponse.json({ error: "db_error" }, { status: 500 });
  }
  if (!inserted.inserted) return NextResponse.json({ ok: true });

  let resolvedOrgId: string | null = orgIdHint;

  try {
    if (event.type === "checkout.session.completed") {
      const session = event.data.object as Stripe.Checkout.Session;
      const k = asString(session.metadata?.kind);
      if (k === "token_setup") {
        await handleTokenSetupCompleted(admin, stripe, session); // บันทึกบัตร
      } else if (k === "token_topup") {
        // เติม token จัดการที่ payment_intent.succeeded (มีทั้ง manual + auto)
      } else if (isSttSession(session)) {
        await handleSttCheckout(admin, stripe, session, event.id);
      } else {
        resolvedOrgId = await handleCheckoutSessionCompleted(admin, stripe, session);
      }
    } else if (event.type === "payment_intent.succeeded") {
      await handleTokenPaymentSucceeded(
        admin,
        stripe,
        event.data.object as Stripe.PaymentIntent,
        event.id,
      );
    } else if (event.type === "payment_intent.payment_failed") {
      await handleTokenPaymentFailed(admin, event.data.object as Stripe.PaymentIntent);
    } else if (event.type === "invoice.payment_succeeded") {
      // ลอง STT ก่อน — ถ้า invoice นี้เป็นของ stt_subscription จะจัดการ + return true
      const invoice = event.data.object as Stripe.Invoice;
      const handledStt = await handleSttInvoicePaid(admin, stripe, invoice, event.id);
      if (!handledStt)
        resolvedOrgId = await handleInvoicePaymentSucceeded(admin, stripe, invoice, event.id);
    } else if (event.type === "invoice.payment_failed") {
      resolvedOrgId = await handleInvoicePaymentFailed(
        admin,
        stripe,
        event.data.object as Stripe.Invoice,
        event.id,
      );
    } else if (event.type === "customer.subscription.updated") {
      const sub = event.data.object as Stripe.Subscription;
      const handledStt = await handleSttSubscriptionEvent(admin, sub);
      if (!handledStt) resolvedOrgId = await handleSubscriptionUpdated(admin, sub);
    } else if (event.type === "customer.subscription.deleted") {
      const sub = event.data.object as Stripe.Subscription;
      const handledStt = await handleSttSubscriptionEvent(admin, sub);
      if (!handledStt) resolvedOrgId = await handleSubscriptionDeleted(admin, sub);
    }
  } catch {
    return NextResponse.json({ error: "processing_error" }, { status: 500 });
  }

  if (resolvedOrgId && resolvedOrgId !== orgIdHint) {
    await admin.from("stripe_events").update({ org_id: resolvedOrgId }).eq("id", event.id);
  }

  return NextResponse.json({ ok: true });
}
