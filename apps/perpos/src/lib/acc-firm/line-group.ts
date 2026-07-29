/**
 * line-group.ts — กลุ่ม LINE ของลูกค้าสำนักงานบัญชี (acc_firm)
 *
 * โมเดล: 1 ลูกค้าในทะเบียน (`acc_firm_service_clients`) = 1 กลุ่ม LINE
 *   1. ทีมงานกด "สร้างรหัสเชื่อมกลุ่ม" ที่หน้าลูกค้า → ได้รหัส `PP-XXXXXX` (หมดอายุ 24 ชม.)
 *   2. เอารหัสไปพิมพ์ในกลุ่มที่แอด Perpos OA ไว้แล้ว → webhook ผูก group_id เข้ากับลูกค้า
 *   3. ระบบส่งอัปเดตเข้ากลุ่มตามสวิตช์ที่ตั้งไว้รายลูกค้า
 *
 * ความปลอดภัย:
 *   - รหัสคือ secret ใช้ได้ครั้งเดียว + หมดอายุ → ล้างทิ้งทันทีที่ผูกสำเร็จ
 *   - กลุ่มที่ยังไม่ผูก บอท **เงียบเสมอ** (ไม่ตอบอะไรเลยนอกจากรหัสที่ถูกต้อง)
 *   - ข้อมูลที่ส่งเข้ากลุ่มเป็นของลูกค้ารายนั้นรายเดียว (query ด้วย service_client_id ตรงเสมอ)
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { sendLineMessages, type LineMessage } from "@/lib/line/send-messages";

export const CLIENT_LINE_EVENTS = [
  "doc_received",
  "tax_due",
  "tax_filed",
  "billing",
  "announce",
] as const;

export type ClientLineEvent = (typeof CLIENT_LINE_EVENTS)[number];

/** สวิตช์ในตาราง ต่อ event */
const NOTIFY_COLUMN: Record<ClientLineEvent, string> = {
  doc_received: "notify_doc_received",
  tax_due: "notify_tax_due",
  tax_filed: "notify_tax_filed",
  billing: "notify_billing",
  announce: "notify_announce",
};

export const EVENT_LABEL: Record<ClientLineEvent, string> = {
  doc_received: "ได้รับเอกสารแล้ว",
  tax_due: "ใกล้ครบกำหนดยื่นภาษี",
  tax_filed: "ยื่นภาษีให้แล้ว",
  billing: "แจ้งค่าบริการ",
  announce: "ประกาศจากทีมงาน",
};

export type ClientLineGroup = {
  id: string;
  firm_org_id: string;
  service_client_id: string;
  status: "pending" | "linked";
  line_group_id: string | null;
  bound_at: string | null;
  pair_code: string | null;
  pair_code_expires_at: string | null;
  notify_doc_received: boolean;
  notify_tax_due: boolean;
  notify_tax_filed: boolean;
  notify_billing: boolean;
  notify_announce: boolean;
  created_at: string;
  updated_at: string;
};

const TABLE = "acc_firm_client_line_groups";
const LOG_TABLE = "acc_firm_client_line_messages";

/** อายุรหัสเชื่อมกลุ่ม (ชั่วโมง) */
export const PAIR_CODE_TTL_HOURS = 24;

/** ตัวอักษรที่อ่านผิดยาก (ไม่มี 0/O, 1/I, U) — ทีมงานต้องอ่านจากจอไปพิมพ์ในกลุ่ม */
const CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTVWXYZ23456789";

function randomCode(): string {
  const bytes = new Uint8Array(6);
  globalThis.crypto.getRandomValues(bytes);
  let out = "";
  for (let i = 0; i < bytes.length; i++) out += CODE_ALPHABET[bytes[i] % CODE_ALPHABET.length];
  return `PP-${out}`;
}

/** รูปแบบรหัสที่ webhook รับ (พิมพ์เล็ก/ใหญ่ก็ได้, มีช่องว่างหน้า-หลังได้) */
export const PAIR_CODE_RE = /^PP-[A-Z0-9]{6}$/;

export function normalizePairCode(raw: string): string | null {
  const t = raw.trim().toUpperCase().replace(/\s+/g, "");
  return PAIR_CODE_RE.test(t) ? t : null;
}

// ── ฝั่งเว็บ (ทีมงาน) ─────────────────────────────────────────────────────────

/** แถวของลูกค้ารายนี้ (สร้างให้ถ้ายังไม่มี) */
export async function getOrCreateGroupRow(
  admin: SupabaseClient,
  firmOrgId: string,
  serviceClientId: string,
  userId: string,
): Promise<ClientLineGroup> {
  const { data: existing } = await admin
    .from(TABLE)
    .select("*")
    .eq("service_client_id", serviceClientId)
    .maybeSingle();
  if (existing) return existing as ClientLineGroup;

  const { data, error } = await admin
    .from(TABLE)
    .insert({ firm_org_id: firmOrgId, service_client_id: serviceClientId, created_by: userId })
    .select()
    .single();
  if (error) throw new Error(error.message);
  return data as ClientLineGroup;
}

/** สร้างรหัสใหม่ (ทับของเดิมที่ยังไม่ถูกใช้) — คืนรหัส + เวลาหมดอายุ */
export async function issuePairCode(
  admin: SupabaseClient,
  firmOrgId: string,
  serviceClientId: string,
  userId: string,
): Promise<{ code: string; expiresAt: string }> {
  await getOrCreateGroupRow(admin, firmOrgId, serviceClientId, userId);

  const expiresAt = new Date(Date.now() + PAIR_CODE_TTL_HOURS * 3600_000).toISOString();

  // ชนรหัสที่ยังไม่หมดอายุของรายอื่น = unique violation → สุ่มใหม่ (สูงสุด 5 ครั้ง)
  for (let i = 0; i < 5; i++) {
    const code = randomCode();
    const { error } = await admin
      .from(TABLE)
      .update({ pair_code: code, pair_code_expires_at: expiresAt, pair_code_by: userId })
      .eq("service_client_id", serviceClientId)
      .eq("firm_org_id", firmOrgId);
    if (!error) return { code, expiresAt };
    if (!/duplicate|unique/i.test(error.message)) throw new Error(error.message);
  }
  throw new Error("สร้างรหัสไม่สำเร็จ ลองใหม่อีกครั้ง");
}

/** เลิกเชื่อมจากฝั่งเว็บ — คืน line_group_id เดิม (ถ้ามี) ไว้แจ้งกลุ่ม */
export async function unlinkClientGroup(
  admin: SupabaseClient,
  firmOrgId: string,
  serviceClientId: string,
): Promise<string | null> {
  const { data } = await admin
    .from(TABLE)
    .select("line_group_id")
    .eq("service_client_id", serviceClientId)
    .eq("firm_org_id", firmOrgId)
    .maybeSingle();

  const gid = (data as { line_group_id: string | null } | null)?.line_group_id ?? null;

  const { error } = await admin
    .from(TABLE)
    .update({
      status: "pending",
      line_group_id: null,
      bound_at: null,
      bound_by: null,
      bound_line_user_id: null,
      pair_code: null,
      pair_code_expires_at: null,
    })
    .eq("service_client_id", serviceClientId)
    .eq("firm_org_id", firmOrgId);
  if (error) throw new Error(error.message);

  return gid;
}

// ── ฝั่ง LINE (ในกลุ่ม) ───────────────────────────────────────────────────────

export type GroupReply = { text: string } | { flex: unknown; altText: string } | null;

/**
 * ใช้รหัสเชื่อมกลุ่ม — เรียกเมื่อมีคนพิมพ์ `PP-XXXXXX` ในกลุ่ม
 * คืน null = ไม่ใช่รหัสของระบบนี้ (ปล่อยเงียบ ไม่ตอบอะไร)
 */
export async function redeemPairCode(
  admin: SupabaseClient,
  groupId: string,
  rawCode: string,
  lineUserId: string,
  profileId: string | null,
): Promise<GroupReply> {
  const code = normalizePairCode(rawCode);
  if (!code) return null;

  const { data: row } = await admin
    .from(TABLE)
    .select("id, firm_org_id, service_client_id, pair_code_expires_at, line_group_id")
    .eq("pair_code", code)
    .maybeSingle();
  if (!row) return null; // รหัสมั่ว → เงียบ (กันคนสุ่มรหัสในกลุ่มอื่น)

  const r = row as {
    id: string;
    firm_org_id: string;
    service_client_id: string;
    pair_code_expires_at: string | null;
    line_group_id: string | null;
  };

  if (r.pair_code_expires_at && new Date(r.pair_code_expires_at).getTime() < Date.now()) {
    return { text: "⌛ รหัสนี้หมดอายุแล้ว — ขอรหัสใหม่จากทีมงานบัญชีได้เลยครับ" };
  }
  if (r.line_group_id && r.line_group_id !== groupId) {
    return { text: "❌ ลูกค้ารายนี้ผูกกับอีกกลุ่มไว้แล้ว — แจ้งทีมงานให้เลิกผูกกลุ่มเดิมก่อน" };
  }

  // กลุ่มนี้ถูกผูกกับลูกค้ารายอื่นอยู่ไหม (1 กลุ่ม = 1 ลูกค้า)
  const { data: taken } = await admin
    .from(TABLE)
    .select("service_client_id")
    .eq("line_group_id", groupId)
    .maybeSingle();
  if (taken && (taken as { service_client_id: string }).service_client_id !== r.service_client_id) {
    return { text: "❌ กลุ่มนี้ผูกกับลูกค้ารายอื่นอยู่แล้ว — เลิกผูกก่อนจึงจะเชื่อมใหม่ได้" };
  }

  const { error } = await admin
    .from(TABLE)
    .update({
      status: "linked",
      line_group_id: groupId,
      bound_at: new Date().toISOString(),
      bound_by: profileId,
      bound_line_user_id: lineUserId,
      pair_code: null, // ใช้ครั้งเดียว
      pair_code_expires_at: null,
    })
    .eq("id", r.id);
  if (error) return { text: `❌ เชื่อมกลุ่มไม่สำเร็จ: ${error.message}` };

  const client = await getClientBasics(admin, r.service_client_id);
  const enabled = await enabledEventLabels(admin, r.service_client_id);

  return {
    altText: `✅ เชื่อมกลุ่มกับ ${client?.company_name ?? "ลูกค้า"} สำเร็จ`,
    flex: buildLinkedFlex(client?.company_name ?? "ลูกค้า", enabled),
  };
}

async function getClientBasics(
  admin: SupabaseClient,
  serviceClientId: string,
): Promise<{ id: string; company_name: string; client_org_id: string | null } | null> {
  const { data } = await admin
    .from("acc_firm_service_clients")
    .select("id, company_name, client_org_id")
    .eq("id", serviceClientId)
    .maybeSingle();
  return (data as { id: string; company_name: string; client_org_id: string | null }) ?? null;
}

async function enabledEventLabels(
  admin: SupabaseClient,
  serviceClientId: string,
): Promise<string[]> {
  const { data } = await admin
    .from(TABLE)
    .select("*")
    .eq("service_client_id", serviceClientId)
    .maybeSingle();
  if (!data) return [];
  const row = data as Record<string, boolean>;
  return CLIENT_LINE_EVENTS.filter((e) => row[NOTIFY_COLUMN[e]]).map((e) => EVENT_LABEL[e]);
}

/** ลูกค้าที่ผูกกับกลุ่มนี้ — null ถ้ากลุ่มยังไม่ผูก */
export async function clientForGroup(
  admin: SupabaseClient,
  groupId: string,
): Promise<{ serviceClientId: string; firmOrgId: string } | null> {
  const { data } = await admin
    .from(TABLE)
    .select("service_client_id, firm_org_id")
    .eq("line_group_id", groupId)
    .eq("status", "linked")
    .maybeSingle();
  if (!data) return null;
  const r = data as { service_client_id: string; firm_org_id: string };
  return { serviceClientId: r.service_client_id, firmOrgId: r.firm_org_id };
}

const HELP = [
  "🤖 ผู้ช่วยสำนักงานบัญชี",
  "",
  "กลุ่มนี้เชื่อมกับระบบของสำนักงานบัญชีแล้ว — จะได้รับอัปเดตงานบัญชี/ภาษีของบริษัทโดยอัตโนมัติ",
  "",
  "คำสั่งที่ใช้ได้",
  "/สถานะ — สรุปสถานะยื่นภาษีล่าสุด",
  "/help — ดูคำสั่งทั้งหมด",
  "",
  "ต้องการเลิกเชื่อมกลุ่ม แจ้งทีมงานบัญชีได้เลยครับ",
].join("\n");

/**
 * router ข้อความในกลุ่มสำหรับ acc_firm
 * คืน null = ไม่ใช่เรื่องของโมดูลนี้ (ให้ caller ไปลอง handler อื่นต่อ / เงียบ)
 */
export async function handleAccFirmGroupMessage(
  admin: SupabaseClient,
  groupId: string,
  lineUserId: string,
  profileId: string | null,
  text: string,
): Promise<GroupReply> {
  const trimmed = text.trim();

  // รหัสเชื่อมกลุ่ม — พิมพ์เดี่ยว ๆ หรือ /เชื่อม PP-XXXXXX ก็ได้
  const codeCandidate = trimmed.replace(/^\/(เชื่อมกลุ่ม|เชื่อม|link)\s+/i, "");
  if (normalizePairCode(codeCandidate)) {
    return redeemPairCode(admin, groupId, codeCandidate, lineUserId, profileId);
  }

  const bound = await clientForGroup(admin, groupId);
  if (!bound) return null; // กลุ่มยังไม่ผูก → เงียบ

  const cmd = trimmed.split(/\s+/)[0]?.toLowerCase() ?? "";
  if (cmd === "/help" || cmd === "/ช่วยเหลือ") return { text: HELP };
  if (cmd === "/สถานะ" || cmd === "/ภาษี") return buildTaxStatusReply(admin, bound.serviceClientId);

  return null;
}

/** /สถานะ — สถานะยื่นภาษี 6 งวดล่าสุดของลูกค้ารายนี้ */
async function buildTaxStatusReply(
  admin: SupabaseClient,
  serviceClientId: string,
): Promise<GroupReply> {
  const client = await getClientBasics(admin, serviceClientId);
  if (!client?.client_org_id) {
    return { text: "ยังไม่มีข้อมูลการยื่นภาษีในระบบ — สอบถามทีมงานบัญชีได้เลยครับ" };
  }

  const { data } = await admin
    .from("acc_tax_filings")
    .select("tax_kind, period_year, period_month, status, due_date")
    .eq("org_id", client.client_org_id)
    .order("period_year", { ascending: false })
    .order("period_month", { ascending: false })
    .limit(6);

  const rows = (data ?? []) as {
    tax_kind: string;
    period_year: number;
    period_month: number;
    status: string;
    due_date: string;
  }[];
  if (!rows.length) return { text: "ยังไม่มีรายการยื่นภาษีในระบบสำหรับบริษัทนี้ครับ" };

  const today = new Date().toISOString().slice(0, 10);
  const lines = rows.map((r) => {
    const mark =
      r.status === "filed"
        ? "✅ ยื่นแล้ว"
        : r.due_date < today
          ? "🔴 เลยกำหนด"
          : r.status === "ready"
            ? "🟡 พร้อมยื่น"
            : "⏳ กำลังจัดทำ";
    return `${TAX_LABEL[r.tax_kind] ?? r.tax_kind} ${r.period_month}/${r.period_year} — ${mark}`;
  });

  return {
    text: [`📋 สถานะยื่นภาษี — ${client.company_name}`, "", ...lines].join("\n"),
  };
}

export const TAX_LABEL: Record<string, string> = {
  pp30: "ภ.พ.30",
  pnd1: "ภ.ง.ด.1",
  pnd3: "ภ.ง.ด.3",
  pnd53: "ภ.ง.ด.53",
};

// ── ส่งอัปเดตเข้ากลุ่ม ────────────────────────────────────────────────────────

export type NotifyArgs = {
  serviceClientId: string;
  event: ClientLineEvent;
  messages: LineMessage[];
  /** ข้อความย่อสำหรับ log */
  summary: string;
  /** กันส่งซ้ำงานอัตโนมัติ (เช่น `tax_due:pp30:2026-07`) */
  dedupKey?: string;
  sentBy?: string | null;
};

export type NotifyResult =
  | { sent: true }
  | { sent: false; reason: "not_linked" | "muted" | "duplicate" | "error"; error?: string };

/**
 * ส่งอัปเดตเข้ากลุ่มของลูกค้า — เช็คสวิตช์ + dedup + เขียน log ให้ในตัว
 * ออกแบบให้ "ไม่พัง caller": ทุกกรณีคืนผลลัพธ์ ไม่ throw
 */
export async function notifyClientGroup(
  admin: SupabaseClient,
  args: NotifyArgs,
): Promise<NotifyResult> {
  try {
    const { data } = await admin
      .from(TABLE)
      .select("*")
      .eq("service_client_id", args.serviceClientId)
      .maybeSingle();
    if (!data) return { sent: false, reason: "not_linked" };

    const row = data as ClientLineGroup & Record<string, boolean>;
    if (row.status !== "linked" || !row.line_group_id) return { sent: false, reason: "not_linked" };
    if (!row[NOTIFY_COLUMN[args.event]]) return { sent: false, reason: "muted" };

    // dedup — จองสิทธิ์ส่งก่อนยิงจริง (unique index กันแข่งกัน)
    if (args.dedupKey) {
      const { error: dupErr } = await admin.from(LOG_TABLE).insert({
        firm_org_id: row.firm_org_id,
        service_client_id: args.serviceClientId,
        line_group_id: row.line_group_id,
        event: args.event,
        summary: args.summary,
        dedup_key: args.dedupKey,
        sent_by: args.sentBy ?? null,
      });
      if (dupErr) {
        if (/duplicate|unique/i.test(dupErr.message)) return { sent: false, reason: "duplicate" };
        return { sent: false, reason: "error", error: dupErr.message };
      }
    }

    const res = await sendLineMessages({ to: row.line_group_id, messages: args.messages });

    if (!args.dedupKey) {
      await admin.from(LOG_TABLE).insert({
        firm_org_id: row.firm_org_id,
        service_client_id: args.serviceClientId,
        line_group_id: row.line_group_id,
        event: args.event,
        summary: args.summary,
        sent_by: args.sentBy ?? null,
        ok: res.ok,
        error: res.ok ? null : res.error,
      });
    } else if (!res.ok) {
      // จองไว้แล้วแต่ส่งไม่ผ่าน → บันทึกความจริงลงแถวเดิม (dedup ยังคุมไม่ให้ยิงซ้ำ)
      await admin
        .from(LOG_TABLE)
        .update({ ok: false, error: res.error })
        .eq("service_client_id", args.serviceClientId)
        .eq("dedup_key", args.dedupKey);
    }

    return res.ok ? { sent: true } : { sent: false, reason: "error", error: res.error };
  } catch (e) {
    return { sent: false, reason: "error", error: String((e as Error)?.message ?? e) };
  }
}

/** ชื่อบริษัทในทะเบียนลูกค้า จาก org ของลูกค้า (fallback = ชื่อ org) */
export async function companyNameByOrg(
  admin: SupabaseClient,
  clientOrgId: string,
): Promise<string> {
  const { data } = await admin
    .from("acc_firm_service_clients")
    .select("company_name")
    .eq("client_org_id", clientOrgId)
    .limit(1)
    .maybeSingle();
  if (data) return (data as { company_name: string }).company_name;

  const { data: org } = await admin
    .from("organizations")
    .select("name")
    .eq("id", clientOrgId)
    .maybeSingle();
  return (org as { name?: string } | null)?.name ?? "ลูกค้า";
}

/** ส่งโดยอ้าง org ของลูกค้า (ใช้จาก hook ฝั่ง accounting ที่รู้แค่ org_id) */
export async function notifyClientGroupByOrg(
  admin: SupabaseClient,
  clientOrgId: string,
  args: Omit<NotifyArgs, "serviceClientId">,
): Promise<NotifyResult> {
  const { data } = await admin
    .from("acc_firm_service_clients")
    .select("id")
    .eq("client_org_id", clientOrgId)
    .limit(1)
    .maybeSingle();
  if (!data) return { sent: false, reason: "not_linked" };
  return notifyClientGroup(admin, {
    ...args,
    serviceClientId: (data as { id: string }).id,
  });
}

// ── Flex cards (ตาม docs/line-flex-card-guide.md — header CHARCOAL พื้นเรียบ) ──

const CHARCOAL = "#3C3B3D";
const INK = "#1A1A1B";
const INK_2 = "#656D78";
const INK_3 = "#9CA3AF";

function bubble(title: string, bodyContents: unknown[]) {
  return {
    type: "bubble",
    header: {
      type: "box",
      layout: "horizontal",
      backgroundColor: CHARCOAL,
      paddingAll: "14px",
      contents: [
        { type: "text", text: title, color: "#ffffff", weight: "bold", size: "md", wrap: true },
      ],
    },
    body: {
      type: "box",
      layout: "vertical",
      spacing: "sm",
      paddingAll: "18px",
      contents: bodyContents,
    },
  };
}

function chip(text: string, bg: string, color: string) {
  return {
    type: "box",
    layout: "horizontal",
    backgroundColor: bg,
    cornerRadius: "8px",
    paddingAll: "10px",
    margin: "sm",
    contents: [{ type: "text", text, size: "sm", color, wrap: true }],
  };
}

function buildLinkedFlex(companyName: string, enabledLabels: string[]) {
  return bubble("✅ เชื่อมกลุ่มสำเร็จ", [
    { type: "text", text: `🏢 ${companyName}`, size: "sm", color: INK, wrap: true },
    chip("กลุ่มนี้จะได้รับอัปเดตงานบัญชี/ภาษีจากสำนักงาน", "#E6F1FB", "#0C447C"),
    {
      type: "text",
      text: enabledLabels.length
        ? `เรื่องที่จะแจ้ง:\n• ${enabledLabels.join("\n• ")}`
        : "ยังไม่ได้เปิดหัวข้อแจ้งเตือน — ทีมงานตั้งค่าได้จากหน้าลูกค้า",
      size: "xs",
      wrap: true,
      color: INK_2,
      margin: "md",
    },
    { type: "separator", margin: "md" },
    {
      type: "text",
      text: "พิมพ์ /สถานะ เพื่อดูสถานะยื่นภาษีล่าสุด · /help ดูคำสั่งทั้งหมด",
      size: "xxs",
      wrap: true,
      color: INK_3,
      margin: "md",
    },
  ]);
}

/** การ์ดอัปเดตทั่วไป — ใช้กับทุก event (หัวข้อ + บรรทัดรายละเอียด + หมายเหตุ) */
export function buildUpdateFlex(args: {
  title: string;
  companyName: string;
  highlight?: string;
  highlightTone?: "info" | "success" | "warning";
  lines?: string[];
  footnote?: string;
}): LineMessage {
  const tone = args.highlightTone ?? "info";
  const toneColors: Record<string, [string, string]> = {
    info: ["#E6F1FB", "#0C447C"],
    success: ["#F2FCF9", "#1E7A63"],
    warning: ["#FFFCF3", "#8A6516"],
  };
  const [bg, fg] = toneColors[tone];

  const contents: unknown[] = [
    { type: "text", text: `🏢 ${args.companyName}`, size: "sm", color: INK, wrap: true },
  ];
  if (args.highlight) contents.push(chip(args.highlight, bg, fg));
  if (args.lines?.length) {
    contents.push({
      type: "text",
      text: args.lines.join("\n"),
      size: "sm",
      wrap: true,
      color: INK_2,
      margin: "md",
    });
  }
  if (args.footnote) {
    contents.push({ type: "separator", margin: "md" });
    contents.push({
      type: "text",
      text: args.footnote,
      size: "xxs",
      wrap: true,
      color: INK_3,
      margin: "md",
    });
  }

  return {
    type: "flex",
    altText: `${args.title} — ${args.companyName}`,
    contents: bubble(args.title, contents),
  };
}
