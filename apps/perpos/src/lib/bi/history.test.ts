/**
 * เทสของ "ประวัติแชทต้องแสดงซ้ำได้ครบ" (contract §3.1 ข้อ 5 + §6.4)
 *
 * ครอบ 4 กฎที่ผิดแล้วผู้ใช้เห็นตัวเลขโดยไม่รู้ที่มา:
 *  1. บันทึกคำตอบ = เขียน `bi_messages.answer_meta` ครบ 5 ส่วน (นิยาม/คำถามต่อ/วิธีคำนวณ/ถูกตัด/สถานะ)
 *  2. metric `no_summarize` → ตัดเฉพาะค่าที่ผู้ใช้กรอกใน `work.params` — **`definition_line` ห้ามหาย**
 *  3. `listVisibleMetrics` ต้องคืนหน่วย + มิติ ให้หน้า "ถามอะไรได้บ้าง" แสดงได้
 *  4. `getThread` ต้องแนบ 👍/👎 จาก `bi_query_log` กลับมาถูกข้อความ (query เดียว ไม่ N+1)
 *
 * ⚠️ ห้ามยิง Supabase/Gemini จริง — mock ทั้งชั้น DB และชั้น AI
 */

import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { askBi, BiThreadNotFoundError } from "./ask";
import { listVisibleMetrics, suggestMetrics } from "./metrics";
import { matchMetrics, vatCounterpartKey, type BiMetricCandidate } from "./resolver";
import type { RunMetricResult } from "./runner";
import {
  appendMessage,
  getThread,
  isMessageOwnedBy,
  listThreads,
  sanitizeAnswerMeta,
} from "./threads";
import type { BiAnswerMeta } from "./types";

// ─── mock Supabase (chainable) ─────────────────────────────────────────────

interface MockOpts {
  lists?: Record<string, unknown[]>;
  singles?: Record<string, unknown>;
  /** ผลลัพธ์ของ RPC ตามชื่อ (นอกเหนือจาก `incr_bi_usage` ที่ default = true) */
  rpc?: Record<string, unknown>;
}

function makeAdmin(opts: MockOpts = {}) {
  const inserted: Array<{ table: string; payload: Record<string, unknown> }> = [];
  const calls: Array<{ table: string; method: string; args: unknown[] }> = [];

  const query = (table: string) => {
    let lastInsert: Record<string, unknown> | null = null;
    /** เงื่อนไข `.eq()` ที่ถูกยิงมา — mock บังคับใช้จริง เพื่อให้เทสสิทธิ์มีความหมาย */
    const conds: Array<[string, unknown]> = [];
    /** แถวที่ "ไม่มีคีย์นั้น" ถือว่าผ่าน (fixture ไม่ต้องใส่ครบทุกคอลัมน์) */
    const match = (row: Record<string, unknown>) =>
      conds.every(([k, v]) => !(k in row) || row[k] === v);

    const track =
      (method: string) =>
      (...args: unknown[]) => {
        calls.push({ table, method, args });
        return q;
      };
    const q: Record<string, unknown> = {
      select: track("select"),
      eq: (...args: unknown[]) => {
        calls.push({ table, method: "eq", args });
        conds.push([String(args[0]), args[1]]);
        return q;
      },
      in: track("in"),
      contains: track("contains"),
      order: track("order"),
      limit: track("limit"),
      not: track("not"),
      update: track("update"),
      insert: (payload: Record<string, unknown>) => {
        lastInsert = payload;
        inserted.push({ table, payload });
        return q;
      },
      single: () =>
        Promise.resolve({
          data: {
            id: "msg-1",
            ...((opts.singles?.[table] as object) ?? {}),
            ...(lastInsert ?? {}),
          },
          error: null,
        }),
      maybeSingle: () => {
        const row = opts.singles?.[table] as Record<string, unknown> | undefined;
        return Promise.resolve({ data: row && match(row) ? row : null, error: null });
      },
      then: (res: (v: unknown) => unknown, rej?: (e: unknown) => unknown) => {
        const rows = (opts.lists?.[table] ?? []) as Array<Record<string, unknown>>;
        return Promise.resolve({ data: rows.filter(match), error: null }).then(res, rej);
      },
    };
    return q;
  };

  return {
    inserted,
    calls,
    client: {
      from: (table: string) => query(table),
      rpc: (name: string) =>
        Promise.resolve({
          data:
            opts.rpc && name in opts.rpc ? opts.rpc[name] : name === "incr_bi_usage" ? true : null,
          error: null,
        }),
    } as never,
  };
}

// ─── fixtures ──────────────────────────────────────────────────────────────

const metric: BiMetricCandidate = {
  key: "gov_procure.pipeline_value_incl_vat",
  label_th: "มูลค่าพอร์ตรวม (รวม VAT)",
  definition_th: "ผลรวมยอดเสนอราคารวม VAT ของทุกใบงานในช่วงที่เลือก",
  synonyms: [],
  dimensions: [{ key: "company", label_th: "บริษัทรับงาน", column: "company" }],
  time_grains: ["month", "quarter", "year"],
  comparisons: ["none"],
  filters: [{ key: "company", label_th: "บริษัทรับงาน", column: "company", type: "text_list" }],
  default_view: { chart_type: "stat" } as BiMetricCandidate["default_view"],
  chart_hint: "stat",
  unit: "thb",
  param_schema: {},
  max_period_months: 12,
  no_summarize: false,
  similarity: 0.9,
};

function runResult(over: Partial<RunMetricResult["metric"]> = {}): RunMetricResult {
  return {
    rows: [{ dimension: null, value: 1250000 }],
    row_count: 1,
    sql: "WITH __p AS (...) SELECT ...",
    elapsed_ms: 12,
    truncated: false,
    metric: {
      key: metric.key,
      label_th: metric.label_th,
      definition_th: metric.definition_th,
      time_basis: "start_date",
      unit: "thb",
      unit_decimals: 2,
      chart_hint: "stat",
      status: "verified",
      no_summarize: false,
      includes: [],
      excludes: [],
      ...over,
    },
    effective_params: { date_from: "2026-01-01", date_to: "2026-12-31", limit: 1000 },
  };
}

const baseInput = {
  orgId: "org-1",
  profileId: "user-1",
  role: "owner" as const,
  question: "มูลค่าพอร์ตรวม VAT ปีนี้เท่าไร",
};

function baseDeps(admin: never, over: Partial<RunMetricResult["metric"]> = {}) {
  return {
    admin,
    resolveOrgScopes: async () => ["gov_procure" as const],
    embedQuestion: async () => ({ values: new Array(768).fill(0), estimatedTokens: 10 }),
    matchMetrics: async () => [metric],
    extractIntent: async () => ({
      metric_key: metric.key,
      params: { comparison: "none" as const, filters: { company: ["บริษัทลับ จำกัด"] } },
      confidence: 0.9,
      needs_clarify: false,
      clarify_reason: "",
      usage: { tokenIn: 100, tokenOut: 20, model: "gemini-2.5-flash" },
    }),
    runMetric: async () => runResult(over),
    narrateAnswer: async () => ({
      bullets: ["มูลค่าพอร์ตรวม 1,250,000.00 ฿"],
      follow_ups: ["ขอดูแยกตามบริษัทรับงาน"],
      usage: { tokenIn: 200, tokenOut: 40, model: "gemini-2.5-flash" },
      source: "llm" as const,
    }),
  };
}

function assistantInsert(inserted: Array<{ table: string; payload: Record<string, unknown> }>) {
  const row = inserted
    .filter((i) => i.table === "bi_messages" && i.payload.role === "assistant")
    .pop();
  expect(row).toBeTruthy();
  return row!.payload.answer_meta as Record<string, unknown>;
}

// ─── 1) answer_meta ถูกเขียนครบ + อ่านกลับได้ ──────────────────────────────

describe("answer_meta — ประวัติต้องแสดงซ้ำได้ครบ 5 ส่วน (§3.1 ข้อ 5)", () => {
  it("askBi เขียน definition_line / follow_ups / work / truncated / answer_status ลง bi_messages", async () => {
    const admin = makeAdmin();
    const answer = await askBi(baseInput, baseDeps(admin.client));

    const meta = assistantInsert(admin.inserted);
    expect(meta.definition_line).toBe(answer.definition_line);
    expect(meta.definition_line).not.toBe("");
    expect(meta.follow_ups).toEqual(answer.follow_ups);
    expect(meta.truncated).toBe(false);
    expect(meta.answer_status).toBe("answered");
    const work = meta.work as Record<string, unknown>;
    expect(work.sql).toContain("SELECT");
    expect(work.row_count).toBe(1);
    expect(work.elapsed_ms).toBe(12);
  });

  it("appendMessage → normalizeMessage อ่าน answer_meta กลับมาได้ครบ", async () => {
    const admin = makeAdmin();
    const meta: BiAnswerMeta = {
      definition_line: "นิยาม: มูลค่าพอร์ตรวม · ช่วงเวลา: ปี 2569",
      follow_ups: ["ขอดูแยกตามบริษัท"],
      work: { sql: "SELECT 1", params: { time_grain: "month" }, elapsed_ms: 9, row_count: 3 },
      truncated: true,
      answer_status: "answered",
      clarify: null,
    };

    const saved = await appendMessage(admin.client, {
      orgId: "org-1",
      threadId: "thread-1",
      role: "assistant",
      content: "…",
      answerMeta: meta,
    });

    expect(saved.answer_meta).toEqual(meta);
    expect(saved.feedback).toBeNull();
  });

  it("ข้อความเก่าที่ answer_meta ว่าง ({}) → null (ไม่ทำ UI พัง)", async () => {
    const admin = makeAdmin({
      singles: {
        bi_threads: { id: "thread-1", org_id: "org-1", created_by: "user-1", preferences: {} },
      },
      lists: {
        bi_messages: [
          {
            id: "m-old",
            org_id: "org-1",
            thread_id: "thread-1",
            role: "assistant",
            content: "x",
            answer_meta: {},
          },
        ],
      },
    });

    const res = await getThread(admin.client, "org-1", "thread-1", "user-1");
    expect(res?.messages[0].answer_meta).toBeNull();
  });
});

// ─── 2) no_summarize — ตัดค่าที่ผู้ใช้กรอก แต่ห้ามตัดนิยาม ────────────────

describe("no_summarize — definition_line ต้องไม่หาย", () => {
  it("askBi กับ metric no_summarize ยังเก็บ definition_line แต่ตัด work.params.filters", async () => {
    const admin = makeAdmin();
    const answer = await askBi(baseInput, baseDeps(admin.client, { no_summarize: true }));

    const meta = assistantInsert(admin.inserted);
    expect(meta.definition_line).toBe(answer.definition_line);
    expect(String(meta.definition_line).length).toBeGreaterThan(0);

    const work = meta.work as { params: Record<string, unknown> };
    expect(work.params.filters).toBeUndefined();
    // ค่าที่ผู้ใช้กรอกยังอยู่ใน payload รอบนี้ (UI ต้องแสดงได้) — แต่ไม่ถูกเก็บค้าง
    expect(answer.work?.params.filters).toBeDefined();
  });

  it("sanitizeAnswerMeta: redact ตัดเฉพาะ filters — sql/นิยาม/สถานะยังครบ", () => {
    const meta: BiAnswerMeta = {
      definition_line: "นิยาม: เงินเดือนพนักงาน · ช่วงเวลา: มิ.ย. 2569",
      follow_ups: [],
      work: {
        sql: "SELECT ...",
        params: { time_grain: "month", filters: { employee: ["นายทดสอบ"] } },
        elapsed_ms: 5,
        row_count: 40,
      },
      truncated: false,
      answer_status: "answered",
      clarify: null,
    };

    const safe = sanitizeAnswerMeta(meta, { redactWorkParams: true });
    expect(safe.definition_line).toBe(meta.definition_line);
    expect(safe.work?.sql).toBe("SELECT ...");
    expect(safe.work?.params.time_grain).toBe("month");
    expect(safe.work?.params.filters).toBeUndefined();
    expect(safe.answer_status).toBe("answered");
    // ห้ามแก้ object ต้นทาง (payload ที่ส่งกลับ UI รอบนี้ต้องครบ)
    expect(meta.work?.params.filters).toBeDefined();
  });
});

// ─── 3) listVisibleMetrics — หน่วย + มิติ ──────────────────────────────────

describe("listVisibleMetrics — หน้า 'ถามอะไรได้บ้าง' ต้องได้หน่วยและมิติ", () => {
  it("คืน unit / unit_decimals / dimensions / time_grains / time_basis / status", async () => {
    const admin = makeAdmin({
      lists: {
        bi_metrics: [
          {
            key: "gov_procure.pipeline_value_incl_vat",
            label_th: "มูลค่าพอร์ตรวม (รวม VAT)",
            definition_th: "ผลรวมยอดเสนอราคา",
            chart_hint: "stat",
            module_scope: "gov_procure",
            unit: "thb",
            unit_decimals: 2,
            dimensions: [{ key: "company", label_th: "บริษัทรับงาน", column: "gp.company" }],
            time_grains: ["month", "quarter", "bogus"],
            time_basis: "start_date",
            status: "verified",
          },
        ],
      },
    });

    const [m] = await listVisibleMetrics({
      admin: admin.client,
      scopes: ["gov_procure"],
      role: "owner",
    });

    expect(m.unit).toBe("thb");
    expect(m.unit_decimals).toBe(2);
    expect(m.dimensions).toEqual([{ key: "company", label_th: "บริษัทรับงาน" }]);
    expect(m.time_grains).toEqual(["month", "quarter"]); // ค่าที่ไม่รู้จักถูกกรองทิ้ง
    expect(m.time_basis).toBe("start_date");
    expect(m.status).toBe("verified");
    // ชื่อคอลัมน์จริงต้องไม่หลุดออกไปหน้าเว็บ
    expect(JSON.stringify(m)).not.toContain("gp.company");
  });

  it("หน่วยที่ไม่รู้จัก → count (ไม่ปล่อยค่าดิบไปให้ formatter)", async () => {
    const admin = makeAdmin({
      lists: { bi_metrics: [{ key: "core.x", label_th: "x", definition_th: "x", unit: "usd" }] },
    });
    const [m] = await listVisibleMetrics({ admin: admin.client, scopes: ["core"], role: "viewer" });
    expect(m.unit).toBe("count");
    expect(m.dimensions).toEqual([]);
  });
});

// ─── 4) feedback จากประวัติ ────────────────────────────────────────────────

describe("getThread — 👍/👎 กลับมาถูกข้อความ", () => {
  it("แนบ feedback จาก bi_query_log ตาม message_id (query เดียว)", async () => {
    const admin = makeAdmin({
      singles: {
        bi_threads: { id: "thread-1", org_id: "org-1", created_by: "user-1", preferences: {} },
      },
      lists: {
        bi_messages: [
          { id: "m-1", org_id: "org-1", thread_id: "thread-1", role: "user", content: "ถาม" },
          {
            id: "m-2",
            org_id: "org-1",
            thread_id: "thread-1",
            role: "assistant",
            content: "ตอบ 1",
          },
          {
            id: "m-3",
            org_id: "org-1",
            thread_id: "thread-1",
            role: "assistant",
            content: "ตอบ 2",
          },
        ],
        bi_query_log: [
          { message_id: "m-3", feedback: "down" },
          { message_id: "m-2", feedback: "up" },
          { message_id: "m-9", feedback: "up" },
        ],
      },
    });

    const res = await getThread(admin.client, "org-1", "thread-1", "user-1");
    const byId = new Map(res!.messages.map((m) => [m.id, m.feedback]));
    expect(byId.get("m-2")).toBe("up");
    expect(byId.get("m-3")).toBe("down");
    expect(byId.get("m-1")).toBeNull();

    // query เดียว: ยิง bi_query_log ครั้งเดียว และกรอง org_id เสมอ
    const logSelects = admin.calls.filter(
      (c) => c.table === "bi_query_log" && c.method === "select",
    );
    expect(logSelects).toHaveLength(1);
    expect(
      admin.calls.some(
        (c) => c.table === "bi_query_log" && c.method === "eq" && c.args[0] === "org_id",
      ),
    ).toBe(true);
  });

  it("ไม่มีข้อความของผู้ช่วย → ไม่ยิง bi_query_log เลย", async () => {
    const admin = makeAdmin({
      singles: {
        bi_threads: { id: "thread-1", org_id: "org-1", created_by: "user-1", preferences: {} },
      },
      lists: {
        bi_messages: [
          { id: "m-1", org_id: "org-1", thread_id: "thread-1", role: "user", content: "ถาม" },
        ],
      },
    });

    await getThread(admin.client, "org-1", "thread-1", "user-1");
    expect(admin.calls.some((c) => c.table === "bi_query_log")).toBe(false);
  });
});

// ─── 5) เจ้าของบทสนทนา — service-role ข้าม RLS ด่านจริงคือโค้ดนี้ ─────────

describe("ownership — bi_* อ่านผ่าน service-role → ต้องกรอง created_by เอง", () => {
  const ownerThread = {
    id: "thread-1",
    org_id: "org-1",
    created_by: "user-A",
    preferences: {},
  };
  const messages = [
    {
      id: "m-1",
      org_id: "org-1",
      thread_id: "thread-1",
      role: "assistant",
      content: "กำไรสุทธิ 1.2 ล้าน",
    },
  ];

  it("ผู้ใช้ B เปิด thread ของผู้ใช้ A → ไม่ได้ข้อมูล (null = 404 ไม่ใช่ 403)", async () => {
    const admin = makeAdmin({
      singles: { bi_threads: ownerThread },
      lists: { bi_messages: messages },
    });

    const res = await getThread(admin.client, "org-1", "thread-1", "user-B");
    expect(res).toBeNull();
    // ต้องกรองที่ query ไม่ใช่กรองในหน่วยความจำ
    expect(
      admin.calls.some(
        (c) =>
          c.table === "bi_threads" &&
          c.method === "eq" &&
          c.args[0] === "created_by" &&
          c.args[1] === "user-B",
      ),
    ).toBe(true);
  });

  it("เจ้าของเปิดเองได้ตามปกติ", async () => {
    const admin = makeAdmin({
      singles: { bi_threads: ownerThread },
      lists: { bi_messages: messages },
    });
    const res = await getThread(admin.client, "org-1", "thread-1", "user-A");
    expect(res?.messages).toHaveLength(1);
  });

  it("profileId ว่าง = ไม่ให้ข้อมูล (กันเผลอส่ง null จาก SSR)", async () => {
    const admin = makeAdmin({ singles: { bi_threads: ownerThread } });
    expect(await getThread(admin.client, "org-1", "thread-1", "")).toBeNull();
    expect(await listThreads(admin.client, "org-1", { profileId: "" })).toEqual([]);
  });

  it("listThreads คืนเฉพาะบทสนทนาของเจ้าของ", async () => {
    const admin = makeAdmin({
      lists: {
        bi_threads: [
          { id: "t-A", org_id: "org-1", created_by: "user-A" },
          { id: "t-B", org_id: "org-1", created_by: "user-B" },
        ],
      },
    });

    const threads = await listThreads(admin.client, "org-1", { profileId: "user-B" });
    expect(threads.map((t) => t.id)).toEqual(["t-B"]);
  });

  it("isMessageOwnedBy: ข้อความของคนอื่น = false (ปุ่ม 👍/👎 ข้ามเจ้าของถูกปฏิเสธ)", async () => {
    const admin = makeAdmin({
      singles: {
        bi_messages: { id: "m-1", org_id: "org-1", thread_id: "thread-1" },
        bi_threads: ownerThread,
      },
    });

    expect(await isMessageOwnedBy(admin.client, "org-1", "m-1", "user-B")).toBe(false);
    expect(await isMessageOwnedBy(admin.client, "org-1", "m-1", "user-A")).toBe(true);
  });

  it("askBi: ผู้ใช้ B ส่ง threadId ของ A → โยน BiThreadNotFoundError และไม่เขียนอะไรลง thread ของ A", async () => {
    const admin = makeAdmin({ singles: { bi_threads: ownerThread } });

    await expect(
      askBi({ ...baseInput, profileId: "user-B", threadId: "thread-1" }, baseDeps(admin.client)),
    ).rejects.toBeInstanceOf(BiThreadNotFoundError);

    // ห้ามมีข้อความ/ล็อก/โควตาถูกแตะเลย (ด่านอยู่ก่อน rate-limit)
    expect(admin.inserted).toHaveLength(0);
  });

  it("askBi: เจ้าของส่ง threadId ของตัวเอง → ทำงานปกติ", async () => {
    const admin = makeAdmin({
      singles: { bi_threads: { ...ownerThread, created_by: baseInput.profileId } },
    });

    const answer = await askBi({ ...baseInput, threadId: "thread-1" }, baseDeps(admin.client));
    expect(answer.status).toBe("answered");
    expect(admin.inserted.some((i) => i.table === "bi_messages")).toBe(true);
  });

  it("isMessageOwnedBy: org อื่น / ไม่มีข้อความ = false", async () => {
    const admin = makeAdmin({
      singles: {
        bi_messages: { id: "m-1", org_id: "org-1", thread_id: "thread-1" },
        bi_threads: ownerThread,
      },
    });
    expect(await isMessageOwnedBy(admin.client, "org-2", "m-1", "user-A")).toBe(false);
    expect(await isMessageOwnedBy(admin.client, "org-1", "", "user-A")).toBe(false);
  });
});

// ─── 6) D1 — คู่ฐาน VAT ต้องอยู่ครบเสมอ (ห้าม default เงียบ) ───────────────

describe("matchMetrics — ดึงคู่ VAT ที่หลุด top-N มาด้วย (D1 §11)", () => {
  const inclRow = {
    key: "gov_procure.pipeline_value_incl_vat",
    label_th: "มูลค่าพอร์ตรวม (รวม VAT)",
    definition_th: "รวมภาษี",
    similarity: 0.82,
  };
  const exclRow = {
    key: "gov_procure.pipeline_value_excl_vat",
    label_th: "มูลค่าพอร์ตรวม (ก่อน VAT)",
    definition_th: "ก่อนภาษี",
    module_scope: "gov_procure",
    status: "verified",
  };

  it("ติดมาตัวเดียว → ต่อท้ายคู่ของมัน (คะแนนต่ำกว่าเล็กน้อย ไม่แย่งอันดับหนึ่ง)", async () => {
    const admin = makeAdmin({
      rpc: { match_bi_metrics: [inclRow] },
      lists: { bi_metrics: [exclRow] },
    });

    const res = await matchMetrics({
      admin: admin.client,
      embedding: new Array(768).fill(0),
      scopes: ["gov_procure"],
      role: "owner",
    });

    expect(res.map((c) => c.key)).toEqual([inclRow.key, exclRow.key]);
    expect(res[0].similarity).toBeGreaterThan(res[1].similarity);
  });

  it("มีครบทั้งคู่แล้ว → ไม่ยิง DB เพิ่ม", async () => {
    const admin = makeAdmin({
      rpc: { match_bi_metrics: [inclRow, { ...exclRow, similarity: 0.8 }] },
    });

    const res = await matchMetrics({
      admin: admin.client,
      embedding: new Array(768).fill(0),
      scopes: ["gov_procure"],
      role: "owner",
    });

    expect(res).toHaveLength(2);
    expect(admin.calls.some((c) => c.table === "bi_metrics")).toBe(false);
  });

  it("metric ที่ไม่ใช่ตระกูล VAT → ไม่มี counterpart", () => {
    expect(vatCounterpartKey("core.headcount")).toBeNull();
    expect(vatCounterpartKey("gov_procure.pipeline_value_incl_vat")).toBe(
      "gov_procure.pipeline_value_excl_vat",
    );
  });
});

// ─── 7) เส้นทาง "ตอบไม่ได้" — 3 บั๊กที่ QA เจอบนเบราว์เซอร์จริง ─────────────

describe('askBi — path "ตอบไม่ได้" ต้องแยกสาเหตุให้ขาด', () => {
  const verifiedMetric = {
    key: "gov_procure.pipeline_value_incl_vat",
    label_th: "มูลค่าพอร์ตรวม (รวม VAT)",
    definition_th: "ผลรวมยอดเสนอราคา",
    chart_hint: "stat" as const,
    module_scope: "gov_procure" as const,
    unit: "thb" as const,
    unit_decimals: 2,
    dimensions: [],
    time_grains: ["month" as const],
    time_basis: "start_date",
    status: "verified" as const,
  };

  const draftProfit = {
    ...verifiedMetric,
    key: "gov_procure.profit_realized",
    label_th: "กำไรที่รับรู้แล้ว",
    definition_th: "กำไรจากงานที่ปิดแล้ว (ยังรอเจ้าของธุรกิจยืนยันนิยาม)",
    status: "draft" as const,
    synonyms: ["กำไร", "profit"],
  };

  const noCandidateDeps = (admin: never, over: Record<string, unknown> = {}) => ({
    ...baseDeps(admin),
    matchMetrics: async () => [],
    listVisibleMetrics: async () => [verifiedMetric],
    listDraftMetrics: async () => [draftProfit],
    checkIndexHealth: async () => ({ visible: 1, embedded: 1 }),
    ...over,
  });

  it("คำถามนอกขอบเขต + embedding ครบ → ปฏิเสธสุภาพ (ห้ามบอกว่าระบบยังตั้งค่าไม่เสร็จ)", async () => {
    const admin = makeAdmin();
    const res = await askBi(
      { ...baseInput, question: "อากาศวันนี้เป็นไง" },
      noCandidateDeps(admin.client),
    );

    const text = res.answer.bullets.join(" ");
    expect(res.status).toBe("no_match");
    expect(text).toContain("นอกเรื่องที่ระบบดูแล");
    expect(text).not.toContain("ยังตั้งค่า");
    const log = admin.inserted.find((i) => i.table === "bi_query_log")!;
    expect(log.payload.error_message).toBeNull();
  });

  it("embedding ยังว่างจริง (embedded=0) เท่านั้น → บอกว่าระบบยังตั้งค่าไม่เสร็จ", async () => {
    const admin = makeAdmin();
    const res = await askBi(
      { ...baseInput, question: "อากาศวันนี้เป็นไง" },
      noCandidateDeps(admin.client, {
        checkIndexHealth: async () => ({ visible: 14, embedded: 0 }),
      }),
    );

    expect(res.answer.bullets.join(" ")).toContain("ยังตั้งค่าการค้นหาตัวชี้วัดไม่เสร็จ");
    const log = admin.inserted.find((i) => i.table === "bi_query_log")!;
    expect(String(log.payload.error_message)).toContain("embedded=0");
  });

  it("ถาม metric ที่เป็น draft → บอกว่ามีอยู่แต่ยังไม่ยืนยันนิยาม (และไม่รันมัน)", async () => {
    const admin = makeAdmin();
    const res = await askBi(
      { ...baseInput, question: "กำไรเดือนนี้เท่าไร" },
      noCandidateDeps(admin.client),
    );

    const text = res.answer.bullets.join(" ");
    expect(res.status).toBe("refused");
    expect(text).toContain("กำไรที่รับรู้แล้ว");
    expect(text).toContain("ยังไม่ได้ยืนยันนิยาม");
    // ห้ามรัน metric draft: ไม่มี metric/rows/chart กลับไป
    expect(res.metric).toBeNull();
    expect(res.rows).toEqual([]);
    expect(res.chart).toBeNull();
  });

  it("draft ที่ role นี้ไม่มีสิทธิ์เห็น (ไม่อยู่ใน list) → ไม่ถูกเปิดเผย", async () => {
    const admin = makeAdmin();
    const res = await askBi(
      { ...baseInput, role: "viewer", question: "กำไรเดือนนี้เท่าไร" },
      noCandidateDeps(admin.client, { listDraftMetrics: async () => [] }),
    );

    expect(res.status).toBe("no_match");
    expect(res.answer.bullets.join(" ")).not.toContain("กำไรที่รับรู้แล้ว");
  });

  it("candidate คะแนนต่ำกว่าเกณฑ์เสนอ → ไม่เสนอมั่ว (ไม่ใช่ clarify)", async () => {
    const admin = makeAdmin();
    const weak = {
      ...metric,
      key: "gov_procure.investor_repayment",
      label_th: "คืนเงินต้นต่อนักลงทุน",
      similarity: 0.62,
    };

    const res = await askBi(
      { ...baseInput, question: "top หมวดครุภัณฑ์" },
      {
        ...noCandidateDeps(admin.client),
        matchMetrics: async () => [weak],
        extractIntent: async () => ({
          metric_key: null,
          params: {},
          confidence: 0.2,
          needs_clarify: true,
          clarify_reason: "",
          usage: { tokenIn: 10, tokenOut: 2, model: "gemini-2.5-flash" },
        }),
      },
    );

    expect(res.status).toBe("no_match");
    expect(res.clarify).toBeUndefined();
    expect(res.answer.bullets.join(" ")).not.toContain("คืนเงินต้นต่อนักลงทุน");
  });

  it("suggestMetrics: ไม่มีคำตรงกัน → ไม่เสนออะไรเลย", () => {
    expect(suggestMetrics("อากาศวันนี้เป็นไง", [verifiedMetric])).toEqual([]);
    expect(suggestMetrics("ขอดูมูลค่าพอร์ตรวม", [verifiedMetric])).toHaveLength(1);
  });
});

// ─── 8) clarify ต้องอยู่รอดการรีเฟรช ───────────────────────────────────────

describe("answer_meta.clarify — ปุ่มตัวเลือกต้องไม่หายเมื่อเปิดประวัติ", () => {
  it("askBi สถานะ clarify → เก็บ clarify.options ลง answer_meta", async () => {
    const admin = makeAdmin();
    const sibling = {
      ...metric,
      key: "gov_procure.pipeline_value_excl_vat",
      label_th: "มูลค่าพอร์ตรวม (ก่อน VAT)",
    };

    const res = await askBi(baseInput, {
      ...baseDeps(admin.client),
      matchMetrics: async () => [metric, sibling],
      extractIntent: async () => ({
        metric_key: null,
        params: {},
        confidence: 0.4,
        needs_clarify: true,
        clarify_reason: "ต้องการมูลค่าฐานไหน?",
        usage: { tokenIn: 10, tokenOut: 2, model: "gemini-2.5-flash" },
      }),
    });

    expect(res.status).toBe("clarify");
    const meta = assistantInsert(admin.inserted) as { clarify: { options: unknown[] } };
    expect(meta.clarify.options).toHaveLength(2);
    expect(meta.clarify.options[0]).toMatchObject({ metric_key: metric.key });
  });

  it("อ่านกลับจากประวัติได้ครบ + ตัดนิยามยาวเหลือ 300 ตัวอักษร", async () => {
    const admin = makeAdmin();
    const saved = await appendMessage(admin.client, {
      orgId: "org-1",
      threadId: "thread-1",
      role: "assistant",
      content: "เลือกตัวชี้วัด",
      answerMeta: {
        definition_line: "",
        follow_ups: [],
        work: null,
        truncated: false,
        answer_status: "clarify",
        clarify: {
          question: "ต้องการมูลค่าฐานไหน?",
          options: [
            { metric_key: "a.b", label_th: "รวม VAT", definition_th: "x".repeat(500) },
            { metric_key: "", label_th: "ไม่มีคีย์", definition_th: "ต้องถูกกรองทิ้ง" },
          ],
        },
      },
    });

    expect(saved.answer_meta?.clarify?.options).toHaveLength(1);
    expect(saved.answer_meta?.clarify?.options[0].definition_th).toHaveLength(300);
    expect(saved.answer_meta?.answer_status).toBe("clarify");
  });
});

// ─── 9) trigger ฝั่ง DB ต้องไม่ล้าง key ที่ UI ต้องใช้ ──────────────────────
//
//     รีโปนี้ไม่มี Postgres ให้ vitest ยิง → ตรวจแบบ contract invariant:
//     อ่าน migration แล้วยืนยันว่า `fn_bi_strip_sensitive_rows` ล้างเฉพาะ key ที่ "พาแถวข้อมูลมา"
//     (`clarify` เป็น metadata ของ metric ไม่ใช่ข้อมูลธุรกิจ — ต้องรอด ไม่งั้นปุ่มตัวเลือกหายอีก)

describe("fn_bi_strip_sensitive_rows — ล้างเฉพาะ key ที่พาแถวข้อมูล", () => {
  const sql = readFileSync(
    path.resolve(
      __dirname,
      "../../../../../supabase/migrations/20260724092000_bi_messages_answer_meta.sql",
    ),
    "utf8",
  );
  /** key ทั้งหมดที่ถูกถอดออกด้วย `- '<key>'` ในฟังก์ชัน trigger */
  const stripped = new Set(Array.from(sql.matchAll(/-\s*'([a-z_]+)'/g)).map((m) => m[1]));

  it("ล้าง rows/result_rows/sample_rows/preview_rows เท่านั้น", () => {
    expect(stripped).toContain("rows");
    expect(stripped).toContain("result_rows");
    expect(Array.from(stripped).sort()).toEqual([
      "preview_rows",
      "result_rows",
      "rows",
      "sample_rows",
    ]);
  });

  it("ไม่ล้าง clarify / definition_line / follow_ups / work / answer_status", () => {
    for (const key of [
      "clarify",
      "definition_line",
      "follow_ups",
      "work",
      "answer_status",
      "truncated",
    ]) {
      expect(stripped.has(key), `trigger ล้าง ${key} ทิ้ง — UI จะแสดงประวัติไม่ครบ`).toBe(false);
    }
  });
});
