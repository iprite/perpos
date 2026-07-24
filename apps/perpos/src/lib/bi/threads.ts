/**
 * lib/bi/threads.ts — ประวัติแชท BI (ต่อ org ต่อผู้ใช้)
 *
 * ใช้ร่วมกันระหว่างหน้า (SSR) และ route handler (CONTEXT §5 ข้อ 4)
 * ทุก query กรอง `org_id` เสมอ — ห้ามให้ข้อมูลข้าม org ไม่ว่ากรณีใด
 *
 * ⚠️ **ตาราง `bi_*` ถูก REVOKE จาก anon/authenticated** → อ่าน/เขียนได้ผ่าน **service-role
 * เท่านั้น** · หน้า SSR ห้ามยิง `createSupabaseServerClient` (RLS client) ใส่ตารางเหล่านี้ตรง ๆ
 * ต้องเรียกฟังก์ชันในไฟล์นี้ และ **ตรวจ membership/role ด้วย `getModuleRoleForCurrentUser`
 * ก่อนเสมอ** (service-role ไม่มี RLS มาช่วยแล้ว — ด่านสิทธิ์คือโค้ดฝั่งเรา)
 *
 * ═══ กฎเหล็กของไฟล์นี้ (ห้ามผ่อน) ═══════════════════════════════════════════
 * ตาราง `bi_*` ถูก REVOKE จาก `authenticated` → **ทุก read path วิ่งผ่าน service-role
 * → policy `bi_threads_select` (`created_by = auth.uid()`) ไม่ทำงาน**
 * ดังนั้น **ทุกฟังก์ชันที่อ่านบทสนทนา/ข้อความต้องกรอง `created_by` ด้วยตัวเอง**
 * (`profileId` เป็นพารามิเตอร์บังคับ — ห้ามทำเป็น optional / ห้าม default เป็น null)
 * ไม่ใช่เจ้าของ = คืน `null` (ให้ caller ตอบ 404) **ห้ามตอบ 403** ที่เป็นการยืนยันว่ามีอยู่จริง
 * ═══════════════════════════════════════════════════════════════════════════
 */

import type { createAdminClient } from "@/app/api/_lib/supabase";
import {
  ANSWER_STATUSES,
  FEEDBACK_VALUES,
  type AnswerSource,
  type AnswerStatus,
  type BiAnswerMeta,
  type BiChartSpec,
  type BiClarify,
  type BiMessage,
  type BiMetricParams,
  type BiThread,
  type BiThreadPreferences,
  type BiWork,
  type FeedbackValue,
  type MessageRole,
} from "./types";

type Admin = ReturnType<typeof createAdminClient>;

const THREAD_COLS =
  "id, org_id, created_by, title, last_message_at, preferences, created_at, updated_at";
/** คอลัมน์ของ `bi_messages` ก่อนมี `answer_meta` — ใช้เป็น fallback ระหว่าง migration ยังไม่ลง */
const MESSAGE_COLS_LEGACY =
  "id, org_id, thread_id, role, content, metric_key, params, chart_spec, result_rows, result_row_count, source, created_by, created_at";
const MESSAGE_COLS = `${MESSAGE_COLS_LEGACY}, answer_meta`;

/** true = ฐานยังไม่มีคอลัมน์ `answer_meta` (migration ของ db-designer ยังไม่ลง) */
function isMissingAnswerMeta(message: string): boolean {
  return /answer_meta/i.test(message) && /(column|does not exist|schema cache)/i.test(message);
}

/** จำนวนข้อความสูงสุดที่ดึงกลับต่อ thread */
export const MAX_THREAD_MESSAGES = 200;

export interface ListThreadsOptions {
  /**
   * เจ้าของบทสนทนา — **บังคับ** (บทสนทนาเป็นของส่วนตัวรายคน ไม่ใช่ของ org)
   * ห้ามทำเป็น optional: service-role ข้าม RLS → นี่คือด่านเดียวที่กันคนอื่นเห็น thread
   */
  profileId: string;
  limit?: number;
}

export async function listThreads(
  admin: Admin,
  orgId: string,
  opts: ListThreadsOptions,
): Promise<BiThread[]> {
  if (!opts.profileId) return [];

  const q = admin
    .from("bi_threads")
    .select(THREAD_COLS)
    .eq("org_id", orgId)
    .eq("created_by", opts.profileId)
    .order("last_message_at", { ascending: false, nullsFirst: false })
    .order("created_at", { ascending: false })
    .limit(Math.min(Math.max(opts.limit ?? 50, 1), 200));

  const { data, error } = await q;
  if (error) throw new Error(`listThreads: ${error.message}`);
  return (data ?? []).map(normalizeThread);
}

/**
 * บทสนทนา + ข้อความ — **เฉพาะของเจ้าของ (`profileId`) เท่านั้น**
 *
 * `profileId` บังคับ: service-role ข้าม RLS → ถ้าไม่กรอง `created_by` เอง viewer/analyst
 * จะเปิด thread ของ owner แล้วเห็น `result_rows` ของ metric ที่ตัวเองไม่มีสิทธิ์
 * ไม่ใช่เจ้าของ / ไม่มีอยู่ → `null` (caller ตอบ 404 เหมือนกันทั้งสองกรณี)
 */
export async function getThread(
  admin: Admin,
  orgId: string,
  threadId: string,
  profileId: string,
): Promise<{ thread: BiThread; messages: BiMessage[] } | null> {
  if (!profileId) return null;

  const { data: thread, error } = await admin
    .from("bi_threads")
    .select(THREAD_COLS)
    .eq("org_id", orgId)
    .eq("id", threadId)
    .eq("created_by", profileId)
    .maybeSingle();
  if (error) throw new Error(`getThread: ${error.message}`);
  // ไม่เจอ = ไม่มี หรือ ไม่ใช่ของเรา — แยกไม่ออกโดยตั้งใจ (ห้ามยืนยันการมีอยู่)
  if (!thread) return null;

  const selectMessages = (cols: string) =>
    admin
      .from("bi_messages")
      .select(cols)
      .eq("org_id", orgId)
      .eq("thread_id", threadId)
      // ชั้นที่สอง (defense-in-depth): thread ถูกพิสูจน์ว่าเป็นของ profileId แล้ว
      // และทุกข้อความใน thread ถูกเขียนด้วย `created_by = ผู้ถาม` เสมอ (ask.ts)
      .eq("created_by", profileId)
      .order("created_at", { ascending: true })
      .limit(MAX_THREAD_MESSAGES);

  let { data: messages, error: msgErr } = await selectMessages(MESSAGE_COLS);
  if (msgErr && isMissingAnswerMeta(msgErr.message)) {
    ({ data: messages, error: msgErr } = await selectMessages(MESSAGE_COLS_LEGACY));
  }
  if (msgErr) throw new Error(`getThread messages: ${msgErr.message}`);

  const normalized = (messages ?? []).map(normalizeMessage);

  // 👍/👎 ที่เคยกดไว้ — query เดียวสำหรับทุกข้อความใน thread (ห้าม N+1)
  const feedbackByMessage = await loadFeedback(
    admin,
    orgId,
    normalized.filter((m) => m.role === "assistant").map((m) => m.id),
  );
  for (const m of normalized) m.feedback = feedbackByMessage.get(m.id) ?? null;

  return { thread: normalizeThread(thread), messages: normalized };
}

/**
 * map `message_id → feedback` จาก `bi_query_log` (กรอง org เสมอ)
 * ล้มเหลว = ไม่ใช่เรื่องคอขาดบาดตาย → คืน map ว่าง ให้ปุ่มกลับไปเป็นสถานะ "ยังไม่ให้คะแนน"
 */
async function loadFeedback(
  admin: Admin,
  orgId: string,
  messageIds: string[],
): Promise<Map<string, FeedbackValue>> {
  const map = new Map<string, FeedbackValue>();
  const ids = messageIds.filter(Boolean);
  if (ids.length === 0) return map;

  const { data, error } = await admin
    .from("bi_query_log")
    .select("message_id, feedback")
    .eq("org_id", orgId)
    .in("message_id", ids)
    .not("feedback", "is", null);

  if (error) {
    console.error("[bi] loadFeedback failed:", error.message);
    return map;
  }

  for (const row of (data ?? []) as Array<Record<string, unknown>>) {
    const id = typeof row.message_id === "string" ? row.message_id : "";
    const fb = row.feedback;
    if (id && typeof fb === "string" && (FEEDBACK_VALUES as readonly string[]).includes(fb)) {
      map.set(id, fb as FeedbackValue);
    }
  }
  return map;
}

/**
 * thread นี้เป็นของ `profileId` จริงหรือไม่ (org เดียวกัน)
 *
 * ใช้ก่อน "เขียน" ลง thread ที่ client ระบุมา (`POST /api/bi/ask` ส่ง `threadId` มาได้)
 * ไม่มีด่านนี้ = สมาชิก bi คนอื่นที่รู้ thread id จะแปะข้อความลงบทสนทนาของคนอื่น
 * และอ่าน `preferences` / `metric_key` ล่าสุดของเขาได้
 */
export async function isThreadOwnedBy(
  admin: Admin,
  orgId: string,
  threadId: string,
  profileId: string,
): Promise<boolean> {
  if (!threadId || !profileId) return false;

  const { data, error } = await admin
    .from("bi_threads")
    .select("id")
    .eq("org_id", orgId)
    .eq("id", threadId)
    .eq("created_by", profileId)
    .maybeSingle();
  if (error) throw new Error(`isThreadOwnedBy: ${error.message}`);
  return Boolean(data);
}

/**
 * ข้อความนี้อยู่ใน thread ของ `profileId` จริงหรือไม่ (org เดียวกัน)
 *
 * ใช้ก่อน "เขียน" อะไรที่ผูกกับข้อความ (เช่น 👍/👎 ใน `bi_query_log`) — ไม่มีด่านนี้
 * ผู้ใช้คนหนึ่งจะแก้ feedback ของคำตอบคนอื่นได้ เพราะ service-role ข้าม RLS
 */
export async function isMessageOwnedBy(
  admin: Admin,
  orgId: string,
  messageId: string,
  profileId: string,
): Promise<boolean> {
  if (!messageId || !profileId) return false;

  const { data: msg, error } = await admin
    .from("bi_messages")
    .select("thread_id")
    .eq("org_id", orgId)
    .eq("id", messageId)
    .maybeSingle();
  if (error) throw new Error(`isMessageOwnedBy: ${error.message}`);

  const threadId = (msg as { thread_id?: string } | null)?.thread_id;
  if (!threadId) return false;

  const { data: thread, error: thErr } = await admin
    .from("bi_threads")
    .select("id")
    .eq("org_id", orgId)
    .eq("id", threadId)
    .eq("created_by", profileId)
    .maybeSingle();
  if (thErr) throw new Error(`isMessageOwnedBy thread: ${thErr.message}`);

  return Boolean(thread);
}

export interface CreateThreadInput {
  orgId: string;
  createdBy: string;
  title?: string | null;
  preferences?: BiThreadPreferences;
}

export async function createThread(admin: Admin, input: CreateThreadInput): Promise<BiThread> {
  const { data, error } = await admin
    .from("bi_threads")
    .insert({
      org_id: input.orgId,
      created_by: input.createdBy,
      title: input.title?.slice(0, 120) ?? null,
      preferences: input.preferences ?? {},
    })
    .select(THREAD_COLS)
    .single();
  if (error) throw new Error(`createThread: ${error.message}`);
  return normalizeThread(data);
}

export interface AppendMessageInput {
  orgId: string;
  threadId: string;
  role: MessageRole;
  content: string;
  metricKey?: string | null;
  params?: BiMetricParams | null;
  chartSpec?: BiChartSpec | null;
  resultRows?: Array<Record<string, unknown>> | null;
  resultRowCount?: number | null;
  source?: AnswerSource;
  createdBy?: string | null;
  /**
   * 5 ส่วนของคำตอบที่ต้องแสดงซ้ำได้เมื่อเปิดประวัติเก่า (§3.1 ข้อ 5)
   * — เขียนลง `bi_messages.answer_meta` ทุกครั้งที่บันทึกคำตอบของผู้ช่วย
   */
  answerMeta?: BiAnswerMeta | null;
  /**
   * true = metric เป็น `no_summarize` → ตัดค่าที่ผู้ใช้กรอก (`work.params.filters`) ออกก่อนเก็บ
   * **`definition_line` ยังต้องอยู่ครบเสมอ** (กฎเหล็ก — ห้ามตัด)
   */
  redactWorkParams?: boolean;
}

export async function appendMessage(admin: Admin, input: AppendMessageInput): Promise<BiMessage> {
  const answerMeta = input.answerMeta
    ? sanitizeAnswerMeta(input.answerMeta, { redactWorkParams: input.redactWorkParams })
    : null;

  const payload: Record<string, unknown> = {
    org_id: input.orgId,
    thread_id: input.threadId,
    role: input.role,
    content: input.content,
    metric_key: input.metricKey ?? null,
    params: input.params ?? null,
    chart_spec: input.chartSpec ?? null,
    result_rows: input.resultRows ?? null,
    result_row_count: input.resultRowCount ?? null,
    source: input.source ?? "web",
    created_by: input.createdBy ?? null,
  };

  const insert = (withMeta: boolean) =>
    admin
      .from("bi_messages")
      .insert(withMeta ? { ...payload, answer_meta: answerMeta ?? {} } : payload)
      .select(withMeta ? MESSAGE_COLS : MESSAGE_COLS_LEGACY)
      .single();

  let { data, error } = await insert(true);
  if (error && isMissingAnswerMeta(error.message)) ({ data, error } = await insert(false));
  if (error) throw new Error(`appendMessage: ${error.message}`);

  await admin
    .from("bi_threads")
    .update({ last_message_at: new Date().toISOString() })
    .eq("org_id", input.orgId)
    .eq("id", input.threadId)
    // แตะได้เฉพาะ thread ของผู้เขียนเอง (LINE/web ส่ง createdBy เสมอ)
    .eq("created_by", input.createdBy ?? "");

  return normalizeMessage(data);
}

/**
 * preference ระดับ thread (D1) — อ่านจากคอลัมน์ `bi_threads.preferences`
 * `profileId` บังคับ: กันอ่านค่าที่ผู้ใช้คนอื่นเคยเลือกไว้ (service-role ข้าม RLS)
 */
export async function getThreadPreferences(
  admin: Admin,
  orgId: string,
  threadId: string,
  profileId: string,
): Promise<BiThreadPreferences> {
  if (!profileId) return {};
  const { data } = await admin
    .from("bi_threads")
    .select("preferences")
    .eq("org_id", orgId)
    .eq("id", threadId)
    .eq("created_by", profileId)
    .maybeSingle();
  return normalizePreferences((data as { preferences?: unknown } | null)?.preferences);
}

/** บันทึกตัวเลือกที่ผู้ใช้เพิ่งเลือก (merge ของเดิม) — ถามซ้ำใน thread เดิมไม่ได้ */
export async function setThreadPreferences(
  admin: Admin,
  orgId: string,
  threadId: string,
  profileId: string,
  patch: BiThreadPreferences,
): Promise<BiThreadPreferences> {
  if (!profileId) return {};
  const current = await getThreadPreferences(admin, orgId, threadId, profileId);
  const merged = { ...current, ...patch };
  const { error } = await admin
    .from("bi_threads")
    .update({ preferences: merged })
    .eq("org_id", orgId)
    .eq("id", threadId)
    .eq("created_by", profileId)
    .select("id");
  if (error) throw new Error(`setThreadPreferences: ${error.message}`);
  return merged;
}

/**
 * metric + params ของคำตอบล่าสุดใน thread — ให้คำถามต่อเนื่อง ("แล้วเดือนก่อนล่ะ") ทำงานได้
 * `profileId` บังคับ: ห้ามให้คนอื่นอ่าน metric/params ล่าสุดของเจ้าของ thread
 */
export async function lastAssistantTurn(
  admin: Admin,
  orgId: string,
  threadId: string,
  profileId: string,
): Promise<{ metric_key: string; params: BiMetricParams } | null> {
  if (!profileId) return null;
  const { data } = await admin
    .from("bi_messages")
    .select("metric_key, params")
    .eq("org_id", orgId)
    .eq("thread_id", threadId)
    .eq("created_by", profileId)
    .eq("role", "assistant")
    .not("metric_key", "is", null)
    .order("created_at", { ascending: false })
    .limit(1);

  const row = (data ?? [])[0] as { metric_key?: string; params?: unknown } | undefined;
  if (!row?.metric_key) return null;
  return { metric_key: row.metric_key, params: (row.params ?? {}) as BiMetricParams };
}

// ─── answer_meta ───────────────────────────────────────────────────────────

/**
 * เตรียม `answer_meta` ก่อนเก็บลง DB
 *
 * - `work.sql` เก็บได้ (เป็น SQL template ไม่ใช่ข้อมูลธุรกิจ)
 * - `work.params.filters` = ค่าที่ผู้ใช้กรอก → ตัดทิ้งเมื่อ metric เป็น `no_summarize`
 * - **`definition_line` ห้ามตัดทุกกรณี** (contract §3.1 ข้อ 5)
 *
 * DB (trigger ของ db-designer) เป็นด่านสุดท้าย — ถ้าซ้อนกันให้ผลลัพธ์ฝั่ง DB ชนะ
 */
export function sanitizeAnswerMeta(
  meta: BiAnswerMeta,
  opts: { redactWorkParams?: boolean } = {},
): BiAnswerMeta {
  const work = meta.work ? sanitizeWork(meta.work, opts.redactWorkParams === true) : null;
  return {
    definition_line: String(meta.definition_line ?? ""),
    follow_ups: (meta.follow_ups ?? []).map((f) => String(f)).slice(0, 10),
    work,
    truncated: Boolean(meta.truncated),
    answer_status: meta.answer_status ?? null,
    clarify: meta.clarify ? trimClarify(meta.clarify) : null,
  };
}

/** เก็บเท่าที่การ์ดตัวเลือกใช้จริง — นิยามยาว ๆ ไม่ต้องค้างในประวัติทั้งก้อน */
const CLARIFY_MAX_OPTIONS = 5;
const CLARIFY_DEFINITION_MAX = 300;

function trimClarify(clarify: BiClarify): BiClarify {
  return {
    question: String(clarify.question ?? "").slice(0, 200),
    options: (clarify.options ?? []).slice(0, CLARIFY_MAX_OPTIONS).map((o) => ({
      metric_key: String(o.metric_key ?? ""),
      label_th: String(o.label_th ?? ""),
      definition_th: String(o.definition_th ?? "").slice(0, CLARIFY_DEFINITION_MAX),
    })),
  };
}

function sanitizeWork(work: BiWork, redact: boolean): BiWork {
  if (!redact) return work;
  const { filters: _filters, ...rest } = work.params ?? {};
  void _filters;
  return { ...work, params: rest };
}

function normalizeAnswerMeta(v: unknown): BiAnswerMeta | null {
  if (!v || typeof v !== "object" || Array.isArray(v)) return null;
  const o = v as Record<string, unknown>;

  const definitionLine = typeof o.definition_line === "string" ? o.definition_line : "";
  const followUps = Array.isArray(o.follow_ups)
    ? o.follow_ups.filter((f): f is string => typeof f === "string")
    : [];
  const work = normalizeWork(o.work);
  const status =
    typeof o.answer_status === "string" &&
    (ANSWER_STATUSES as readonly string[]).includes(o.answer_status)
      ? (o.answer_status as AnswerStatus)
      : null;

  const clarify = normalizeClarify(o.clarify);

  // แถวเก่า (คอลัมน์ default '{}') = ยังไม่มีข้อมูล → null เพื่อให้ UI แยกออกจาก "มีแต่ว่าง"
  if (!definitionLine && followUps.length === 0 && !work && !status && !clarify) return null;

  return {
    definition_line: definitionLine,
    follow_ups: followUps,
    work,
    truncated: o.truncated === true,
    answer_status: status,
    clarify,
  };
}

function normalizeClarify(v: unknown): BiClarify | null {
  if (!v || typeof v !== "object" || Array.isArray(v)) return null;
  const c = v as Record<string, unknown>;
  const options = (Array.isArray(c.options) ? c.options : [])
    .map((item) => {
      const o = (item ?? {}) as Record<string, unknown>;
      return {
        metric_key: typeof o.metric_key === "string" ? o.metric_key : "",
        label_th: typeof o.label_th === "string" ? o.label_th : "",
        definition_th: typeof o.definition_th === "string" ? o.definition_th : "",
      };
    })
    .filter((o) => o.metric_key && o.label_th);

  if (options.length === 0) return null;
  return { question: typeof c.question === "string" ? c.question : "", options };
}

function normalizeWork(v: unknown): BiWork | null {
  if (!v || typeof v !== "object" || Array.isArray(v)) return null;
  const w = v as Record<string, unknown>;
  if (typeof w.sql !== "string") return null;
  return {
    sql: w.sql,
    params: (w.params ?? {}) as BiMetricParams,
    elapsed_ms: Number.isFinite(Number(w.elapsed_ms)) ? Number(w.elapsed_ms) : 0,
    row_count: Number.isFinite(Number(w.row_count)) ? Number(w.row_count) : 0,
  };
}

// ─── normalizers ───────────────────────────────────────────────────────────

function normalizePreferences(v: unknown): BiThreadPreferences {
  if (!v || typeof v !== "object" || Array.isArray(v)) return {};
  const o = v as Record<string, unknown>;
  const vat = o.vat_basis;
  return vat === "incl_vat" || vat === "excl_vat" ? { vat_basis: vat } : {};
}

function normalizeThread(row: unknown): BiThread {
  const r = (row ?? {}) as Record<string, unknown>;
  return {
    id: String(r.id ?? ""),
    org_id: String(r.org_id ?? ""),
    created_by: String(r.created_by ?? ""),
    title: (r.title ?? null) as string | null,
    last_message_at: (r.last_message_at ?? null) as string | null,
    preferences: normalizePreferences(r.preferences),
    created_at: String(r.created_at ?? ""),
    updated_at: String(r.updated_at ?? ""),
  };
}

function normalizeMessage(row: unknown): BiMessage {
  const r = (row ?? {}) as Record<string, unknown>;
  return {
    id: String(r.id ?? ""),
    org_id: String(r.org_id ?? ""),
    thread_id: String(r.thread_id ?? ""),
    role: (r.role === "assistant" ? "assistant" : "user") as MessageRole,
    content: String(r.content ?? ""),
    metric_key: (r.metric_key ?? null) as string | null,
    params: (r.params ?? null) as BiMetricParams | null,
    chart_spec: (r.chart_spec ?? null) as BiChartSpec | null,
    result_rows: (r.result_rows ?? null) as Array<Record<string, unknown>> | null,
    result_row_count: (r.result_row_count ?? null) as number | null,
    source: (r.source === "line" ? "line" : "web") as AnswerSource,
    created_by: (r.created_by ?? null) as string | null,
    created_at: String(r.created_at ?? ""),
    answer_meta: normalizeAnswerMeta(r.answer_meta),
    // เติมทีหลังใน `getThread` (query เดียวสำหรับทั้ง thread)
    feedback: null,
  };
}
