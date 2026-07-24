/**
 * เทสของกฎ BI ที่ "ผิดแล้วเสียหาย" (AGENTS §Conventions — ท่าเดียวกับ accounting-rules.test.ts)
 *
 * ครอบ 6 กฎที่ contract ระบุว่าห้ามพัง:
 *  1. params นอก allowlist = reject ทันที (ไม่ fallback เงียบ) · เกินเพดานช่วงเวลา = ตัด + แจ้ง
 *  2. LLM ผลิตตัวเลขที่ไม่มีใน result set = ทิ้งคำตอบ ใช้ bullet ที่ระบบประกอบเอง
 *  3. `no_summarize` / grain รายการ = **ไม่เรียก LLM เลย** (data boundary §5)
 *  4. เกิน rate limit = `refused`
 *  5. metric ที่ยังไม่ verified = `refused` ("ยังไม่มีนิยามที่ยืนยัน")
 *  6. payload ต้องมี `definition_line` + `work` เสมอ · retrieval ว่างเพราะยังไม่ embed = แจ้งให้ไป embed
 *
 * ⚠️ ห้ามยิง Supabase/Gemini จริงในเทส — mock ทั้งชั้น DB และชั้น AI
 */

import { describe, expect, it, vi } from "vitest";
import { askBi } from "./ask";
import { buildDefinitionLine, narrateAnswer, verifyBulletNumbers } from "./answer";
import { sanitizeIntent } from "./intent";
import type { BiMetricCandidate } from "./resolver";
import {
  classifyRunError,
  computeResultShape,
  runMetric as runMetricFn,
  validateParams,
  type RunMetricResult,
} from "./runner";

// ─── fixtures ──────────────────────────────────────────────────────────────

const metric: BiMetricCandidate = {
  key: "gov_procure.pipeline_value_incl_vat",
  label_th: "มูลค่าพอร์ตรวม (รวม VAT)",
  definition_th: "ผลรวมยอดเสนอราคารวม VAT ของทุกใบงานในช่วงที่เลือก",
  synonyms: ["มูลค่าพอร์ต"],
  dimensions: [
    { key: "stage", label_th: "ขั้นตอน", column: "stage" },
    { key: "company", label_th: "บริษัทรับงาน", column: "company" },
  ],
  time_grains: ["month", "quarter", "year"],
  comparisons: ["none", "prev_period"],
  filters: [{ key: "company", label_th: "บริษัทรับงาน", column: "company", type: "text_list" }],
  default_view: { chart_type: "stat", period: "this_year" } as BiMetricCandidate["default_view"],
  chart_hint: "stat",
  unit: "thb",
  param_schema: {},
  max_period_months: 12,
  no_summarize: false,
  similarity: 0.82,
};

function runResult(over: Partial<RunMetricResult> = {}): RunMetricResult {
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
    },
    effective_params: { date_from: "2026-01-01", date_to: "2026-12-31", limit: 1000 },
    ...over,
  };
}

/** mock Supabase client แบบ chainable — คืนผลตามตารางที่กำหนด */
function makeAdmin(opts: { rateAllowed?: boolean; lists?: Record<string, unknown[]> } = {}) {
  const lists = opts.lists ?? {};
  const singles: Record<string, unknown> = {
    bi_threads: { id: "thread-1", org_id: "org-1", created_by: "user-1", preferences: {} },
    bi_messages: { id: "msg-1", org_id: "org-1", thread_id: "thread-1", role: "assistant" },
  };

  const inserted: Array<{ table: string; payload: unknown }> = [];

  const query = (table: string) => {
    const noop = () => q;
    const q: Record<string, unknown> = {
      select: noop,
      eq: noop,
      neq: noop,
      in: noop,
      contains: noop,
      order: noop,
      limit: noop,
      not: noop,
      update: noop,
      delete: noop,
      insert: (payload: unknown) => {
        inserted.push({ table, payload });
        return q;
      },
      single: () => Promise.resolve({ data: singles[table] ?? {}, error: null }),
      maybeSingle: () => Promise.resolve({ data: singles[table] ?? null, error: null }),
      then: (res: (v: unknown) => unknown, rej?: (e: unknown) => unknown) =>
        Promise.resolve({ data: lists[table] ?? [], error: null }).then(res, rej),
    };
    return q;
  };

  return {
    inserted,
    client: {
      from: (table: string) => query(table),
      rpc: (name: string) =>
        Promise.resolve({
          data: name === "incr_bi_usage" ? (opts.rateAllowed ?? true) : null,
          error: null,
        }),
    } as never,
  };
}

const baseInput = {
  orgId: "org-1",
  profileId: "user-1",
  role: "owner" as const,
  question: "มูลค่าพอร์ตรวม VAT ปีนี้เท่าไร",
};

function baseDeps(admin: never) {
  return {
    admin,
    resolveOrgScopes: async () => ["gov_procure" as const],
    embedQuestion: async () => ({ values: new Array(768).fill(0), estimatedTokens: 10 }),
    matchMetrics: async () => [metric],
    extractIntent: async () => ({
      metric_key: metric.key,
      params: { comparison: "none" as const, vat_basis: "incl_vat" as const },
      confidence: 0.9,
      needs_clarify: false,
      clarify_reason: "",
      usage: { tokenIn: 300, tokenOut: 60, model: "gemini-2.5-flash" },
    }),
    runMetric: async () => runResult(),
    narrateAnswer: async () => ({
      bullets: ["มูลค่าพอร์ตรวม 1,250,000.00 ฿"],
      follow_ups: ["ขอดูแยกตามบริษัทรับงาน"],
      usage: { tokenIn: 400, tokenOut: 80, model: "gemini-2.5-flash" },
      source: "llm" as const,
    }),
  };
}

// ─── 1) validateParams — allowlist + เพดานช่วงเวลา ─────────────────────────

describe("validateParams — allowlist (§3.2)", () => {
  it("reject มิติที่ไม่อยู่ใน allowlist (ไม่ fallback เงียบ)", () => {
    const res = validateParams(metric, { dimension: "customer_name" });
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error).toContain("customer_name");
  });

  it("reject filter key ที่ไม่อยู่ใน allowlist", () => {
    const res = validateParams(metric, { filters: { secret_column: "x" } });
    expect(res.ok).toBe(false);
  });

  it("reject time_grain ที่ metric ไม่รองรับ", () => {
    const res = validateParams(metric, { time_grain: "day" });
    expect(res.ok).toBe(false);
  });

  it("reject การเทียบเป้า (target) ที่ยังไม่รองรับ", () => {
    const res = validateParams(metric, { comparison: "target" });
    expect(res.ok).toBe(false);
  });

  it("ยอมรับมิติ/ตัวกรองที่อยู่ใน allowlist", () => {
    const res = validateParams(metric, { dimension: "company", filters: { company: ["P2P"] } });
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.params.dimension).toBe("company");
      expect(res.rpcParams.dimension).toBe("company");
    }
  });

  it("ช่วงเวลาเกิน max_period_months → ตัด + แจ้งผู้ใช้ (ห้ามตัดเงียบ)", () => {
    const res = validateParams(
      metric,
      { period: { grain: "day", from: "2020-01-01", to: "2026-07-24" } },
      { today: "2026-07-24" },
    );
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.period?.capped).toBe(true);
      expect(res.period?.from).toBe("2025-07-25");
      expect(res.notices.join(" ")).toContain("เพดาน");
    }
  });
});

describe("sanitizeIntent — LLM ส่งคีย์นอก allowlist มา = ถูกตัดทิ้ง", () => {
  it("ตัด dimension/filter ที่ metric ไม่ได้ประกาศ และปฏิเสธ metric_key ที่ไม่ได้อยู่ใน candidates", () => {
    const intent = sanitizeIntent(
      {
        metric_key: "gov_procure.secret_metric",
        params: { dimension: "salary", filters: { drop_table: "x" } },
        confidence: 0.99,
        needs_clarify: false,
      },
      [metric],
    );
    expect(intent.metric_key).toBeNull();
    expect(intent.needs_clarify).toBe(true);
    expect(intent.params.dimension).toBeUndefined();
    expect(intent.params.filters).toBeUndefined();
  });
});

// ─── 2) guard ตัวเลขที่ LLM แต่งเอง ────────────────────────────────────────

describe("verifyBulletNumbers — ห้าม LLM ผลิตตัวเลขที่ไม่มีใน result set", () => {
  const rows = [
    { dimension: "P2P Supply", value: 600000 },
    { dimension: "89 Global Work", value: 400000 },
  ];

  it("ผ่านเมื่อใช้ค่าจริง + ยอดรวม + สัดส่วน", () => {
    const res = verifyBulletNumbers(
      ["ยอดรวม 1,000,000.00 ฿", "P2P Supply 600,000.00 ฿ คิดเป็น 60.0% ของทั้งหมด"],
      rows,
    );
    expect(res.ok).toBe(true);
  });

  it("ไม่ผ่านเมื่อมีตัวเลขที่ไม่ได้มาจากผลลัพธ์", () => {
    const res = verifyBulletNumbers(["คาดว่าไตรมาสหน้าจะแตะ 2,500,000.00 ฿"], rows);
    expect(res.ok).toBe(false);
    expect(res.offending).toContain(2500000);
  });

  it("ยอดลบที่ใช้ U+2212 ถูกอ่านเป็นตัวเลขติดลบ", () => {
    const res = verifyBulletNumbers(["ลดลง −200,000.00 ฿"], rows);
    expect(res.ok).toBe(true);
  });
});

describe("narrateAnswer — fallback เมื่อ guard ตีตก", () => {
  const meta = runResult().metric;

  it("LLM แต่งตัวเลข → ใช้ bullet ที่ระบบประกอบเอง (source=rule)", async () => {
    const chat = vi.fn(async () => ({
      text: JSON.stringify({ bullets: ["ยอดพุ่งถึง 9,999,999 ฿"], follow_ups: [] }),
      inputTokens: 100,
      outputTokens: 20,
      model: "gemini-2.5-flash",
      provider: "gemini" as const,
      latencyMs: 10,
    }));

    const res = await narrateAnswer({
      question: "มูลค่าพอร์ตเท่าไร",
      metric: meta,
      candidate: metric,
      rows: [{ dimension: null, value: 1250000 }],
      period: null,
      chat: chat as never,
    });

    expect(chat).toHaveBeenCalledTimes(1);
    expect(res.source).toBe("rule");
    expect(res.bullets.join(" ")).toContain("1,250,000.00 ฿");
    expect(res.fallback_reason).toContain("9999999");
  });

  it("LLM ใช้ตัวเลขจริง → ใช้คำตอบของ LLM (source=llm) และยัง log token", async () => {
    const chat = vi.fn(async () => ({
      text: JSON.stringify({
        bullets: ["มูลค่าพอร์ตรวม 1,250,000.00 ฿"],
        follow_ups: ["ขอดูแยกตามขั้นตอน"],
      }),
      inputTokens: 120,
      outputTokens: 30,
      model: "gemini-2.5-flash",
      provider: "gemini" as const,
      latencyMs: 10,
    }));

    const res = await narrateAnswer({
      question: "มูลค่าพอร์ตเท่าไร",
      metric: meta,
      candidate: metric,
      rows: [{ dimension: null, value: 1250000 }],
      period: null,
      chat: chat as never,
    });

    expect(res.source).toBe("llm");
    expect(res.usage.tokenIn).toBe(120);
  });
});

// ─── 3) data boundary — ห้ามส่งข้อมูลรายการเข้า LLM ────────────────────────

describe("data boundary (§5) — ไม่เรียก LLM เมื่อเป็นข้อมูลระดับรายการ", () => {
  it("no_summarize=true → ไม่เรียก LLM เลย", async () => {
    const chat = vi.fn();
    const res = await narrateAnswer({
      question: "ขอรายการงานทั้งหมด",
      metric: { ...runResult().metric, no_summarize: true },
      candidate: metric,
      rows: [{ dimension: "งาน A", value: 100 }],
      period: null,
      chat: chat as never,
    });
    expect(chat).not.toHaveBeenCalled();
    expect(res.source).toBe("rule");
    expect(res.usage.tokenIn).toBe(0);
  });

  it("grain เป็นรายการ (detail) → ไม่เรียก LLM เลย", async () => {
    const chat = vi.fn();
    const res = await narrateAnswer({
      question: "ขอรายการงาน",
      metric: runResult().metric,
      candidate: metric,
      rows: [{ dimension: "งาน A", value: 100 }],
      period: null,
      isDetailGrain: true,
      chat: chat as never,
    });
    expect(chat).not.toHaveBeenCalled();
    expect(res.source).toBe("rule");
  });

  it("metric ที่ลงท้าย _detail ถูกจัดเป็น grain รายการเสมอ", () => {
    const shape = computeResultShape({
      rows: [{ dimension: "งาน A", value: 1 }],
      metricKey: "gov_procure.orders_detail",
      chartHint: "table",
    });
    expect(shape.isDetailGrain).toBe(true);
  });
});

// ─── 4–6) askBi — สถานะครบตาม enum + payload ครบ ───────────────────────────

describe("askBi — สถานะและ payload (§6.4)", () => {
  it("เกิน rate limit → refused (ไม่เรียก AI ต่อ)", async () => {
    const { client } = makeAdmin({ rateAllowed: false });
    const deps = baseDeps(client);
    const embedSpy = vi.fn(deps.embedQuestion);

    const res = await askBi(baseInput, { ...deps, embedQuestion: embedSpy as never });

    expect(res.status).toBe("refused");
    expect(embedSpy).not.toHaveBeenCalled();
    expect(res.answer.bullets.join(" ")).toContain("เพดาน");
  });

  it("metric ที่ยังไม่ verified → refused พร้อมข้อความ 'ยังไม่มีนิยามที่ยืนยัน'", async () => {
    const { client } = makeAdmin();
    const draft = runResult();
    draft.metric.status = "draft";

    const res = await askBi(baseInput, { ...baseDeps(client), runMetric: async () => draft });

    expect(res.status).toBe("refused");
    expect(res.answer.bullets.join(" ")).toContain("ยังไม่มีนิยามที่ยืนยัน");
  });

  it("ตอบได้ → payload มี definition_line + work + chart + truncated เสมอ", async () => {
    const { client, inserted } = makeAdmin();

    const res = await askBi(baseInput, baseDeps(client));

    expect(res.status).toBe("answered");
    expect(res.definition_line).toContain("นิยาม:");
    expect(res.work?.sql).toBeTruthy();
    expect(res.work?.row_count).toBe(1);
    // work.params ต้องเป็นค่าที่ RPC ใช้จริง (effective_params)
    expect(res.work?.params.period?.from).toBe("2026-01-01");
    expect(res.chart?.type).toBe("stat");
    expect(res.truncated).toBe(false);
    expect(res.metric?.time_basis).toBe("start_date");

    // ต้อง log ลง bi_query_log ทุกครั้ง พร้อม token/cost
    const log = inserted.find((i) => i.table === "bi_query_log")?.payload as Record<
      string,
      unknown
    >;
    expect(log).toBeTruthy();
    expect(log.answer_status).toBe("answered");
    expect(log.token_in).toBe(700);
    expect(Number(log.cost_usd)).toBeGreaterThan(0);
    expect(log.org_id).toBe("org-1");
  });

  it("intent ไม่มั่นใจ → clarify พร้อมตัวเลือก ไม่ยิง SQL", async () => {
    const { client } = makeAdmin();
    const runSpy = vi.fn(async () => runResult());

    const res = await askBi(baseInput, {
      ...baseDeps(client),
      runMetric: runSpy as never,
      extractIntent: async () => ({
        metric_key: null,
        params: {},
        confidence: 0.2,
        needs_clarify: true,
        clarify_reason: "ยังไม่ชัดว่าต้องการมูลค่าแบบไหน",
        usage: { tokenIn: 100, tokenOut: 20, model: "gemini-2.5-flash" },
      }),
    });

    expect(res.status).toBe("clarify");
    expect(res.clarify?.options.length).toBeGreaterThan(0);
    expect(runSpy).not.toHaveBeenCalled();
  });

  it("D1: มูลค่าที่มีทั้ง incl/excl VAT และคำถามไม่ระบุ → clarify ให้เลือกฐาน", async () => {
    const { client } = makeAdmin();
    const exclSibling: BiMetricCandidate = {
      ...metric,
      key: "gov_procure.pipeline_value_excl_vat",
      label_th: "มูลค่าพอร์ตรวม (ก่อน VAT)",
      similarity: 0.81,
    };

    const res = await askBi(
      { ...baseInput, question: "มูลค่าพอร์ตปีนี้เท่าไร" },
      {
        ...baseDeps(client),
        matchMetrics: async () => [metric, exclSibling],
        extractIntent: async () => ({
          metric_key: metric.key,
          params: { comparison: "none" as const, vat_basis: null },
          confidence: 0.9,
          needs_clarify: false,
          clarify_reason: "",
          usage: { tokenIn: 100, tokenOut: 20, model: "gemini-2.5-flash" },
        }),
      },
    );

    expect(res.status).toBe("clarify");
    expect(res.answer.bullets.join(" ")).toContain("ก่อนภาษี");
    expect(res.clarify?.options.map((o) => o.metric_key)).toEqual([
      "gov_procure.pipeline_value_incl_vat",
      "gov_procure.pipeline_value_excl_vat",
    ]);
  });

  it("D1: คำถามระบุ 'รวม VAT' ชัดเจน → ไม่ถามซ้ำ ตอบเลย", async () => {
    const { client } = makeAdmin();
    const exclSibling: BiMetricCandidate = {
      ...metric,
      key: "gov_procure.pipeline_value_excl_vat",
      label_th: "มูลค่าพอร์ตรวม (ก่อน VAT)",
      similarity: 0.81,
    };

    const res = await askBi(
      { ...baseInput, question: "มูลค่าพอร์ตรวม VAT ปีนี้เท่าไร" },
      {
        ...baseDeps(client),
        matchMetrics: async () => [metric, exclSibling],
        extractIntent: async () => ({
          metric_key: metric.key,
          params: { comparison: "none" as const, vat_basis: null },
          confidence: 0.9,
          needs_clarify: false,
          clarify_reason: "",
          usage: { tokenIn: 100, tokenOut: 20, model: "gemini-2.5-flash" },
        }),
      },
    );

    expect(res.status).toBe("answered");
    expect(res.metric?.key).toBe("gov_procure.pipeline_value_incl_vat");
  });

  it("retrieval ว่างทั้งที่มี metric verified → no_match พร้อมบอกให้รัน bi:embed", async () => {
    const { client } = makeAdmin();

    const res = await askBi(baseInput, {
      ...baseDeps(client),
      matchMetrics: async () => [],
      listVisibleMetrics: async () => [
        {
          key: metric.key,
          label_th: metric.label_th,
          definition_th: metric.definition_th,
          chart_hint: "stat" as const,
          module_scope: "gov_procure" as const,
          unit: "thb" as const,
          unit_decimals: 2,
          dimensions: [{ key: "company", label_th: "บริษัทรับงาน" }],
          time_grains: ["month" as const],
          time_basis: "start_date",
          status: "verified" as const,
        },
      ],
      // ตรวจสถานะดัชนีจากฐานจริง: verified มี แต่ยังไม่ถูกฝัง embedding เลย
      checkIndexHealth: async () => ({ visible: 1, embedded: 0 }),
    });

    expect(res.status).toBe("no_match");
    const text = res.answer.bullets.join(" ");
    // ผู้ใช้ได้คำแนะนำเชิงการกระทำ (แจ้งผู้ดูแล) — ไม่ใช่ชื่อคำสั่ง/รายละเอียดภายในระบบ
    expect(text).toContain("ผู้ดูแลระบบ");
    expect(text).not.toContain("bi:embed");
    expect(text).not.toContain("embedding");
  });

  it("params นอก allowlist ที่หลุดมาถึง runner → error (ไม่ยิง SQL)", async () => {
    const { client } = makeAdmin();
    const runSpy = vi.fn(async () => runResult());

    const res = await askBi(baseInput, {
      ...baseDeps(client),
      runMetric: runSpy as never,
      extractIntent: async () => ({
        metric_key: metric.key,
        params: { dimension: "customer_name" },
        confidence: 0.9,
        needs_clarify: false,
        clarify_reason: "",
        usage: { tokenIn: 100, tokenOut: 20, model: "gemini-2.5-flash" },
      }),
    });

    expect(res.status).toBe("error");
    expect(runSpy).not.toHaveBeenCalled();
  });
});

describe("runMetric — RPC เป็นด่านสุดท้ายของ RBAC/verified", () => {
  function captureAdmin(result: unknown, error: { message: string } | null = null) {
    const calls: Array<{ name: string; args: Record<string, unknown> }> = [];
    const admin = {
      rpc: (name: string, args: Record<string, unknown>) => {
        calls.push({ name, args });
        return Promise.resolve({ data: result, error });
      },
    } as never;
    return { admin, calls };
  }

  it("ส่ง p_role ของผู้ถาม + p_allow_draft=false ทุกครั้งใน path ผู้ใช้จริง", async () => {
    const { admin, calls } = captureAdmin(runResult());
    await runMetricFn({
      admin,
      orgId: "org-1",
      metricKey: metric.key,
      rpcParams: { limit: 1000 },
      role: "analyst",
    });
    expect(calls[0].name).toBe("run_bi_metric");
    expect(calls[0].args.p_role).toBe("analyst");
    expect(calls[0].args.p_allow_draft).toBe(false);
    expect(calls[0].args.p_org_id).toBe("org-1");
  });

  it("ไม่มี role = ไม่ยิง RPC", async () => {
    const { admin, calls } = captureAdmin(runResult());
    await expect(
      runMetricFn({
        admin,
        orgId: "org-1",
        metricKey: metric.key,
        rpcParams: {},
        role: "" as never,
      }),
    ).rejects.toThrow();
    expect(calls.length).toBe(0);
  });

  it("classifyRunError แปลง error ของ RPC เป็นข้อความไทย (ไม่หลุด SQL)", () => {
    expect(classifyRunError("run_bi_metric: role viewer ไม่อยู่ใน allowed_roles").status).toBe(
      "refused",
    );
    expect(classifyRunError("run_bi_metric: metric ยังไม่ verified").status).toBe("refused");
    expect(classifyRunError("canceling statement due to statement timeout").text).toContain(
      "ใช้เวลานานเกินกำหนด",
    );
    expect(classifyRunError("boom").text).not.toContain("boom");
  });
});

describe("askBi — ผลของ RPC guard + การเก็บข้อมูลรายแถว", () => {
  it("RPC ปฏิเสธเพราะ role ไม่มีสิทธิ์ → refused พร้อมข้อความไทย", async () => {
    const { client } = makeAdmin();
    const res = await askBi(baseInput, {
      ...baseDeps(client),
      runMetric: async () => {
        throw new Error("run_bi_metric: role viewer ไม่อยู่ใน allowed_roles ของ metric");
      },
    });
    expect(res.status).toBe("refused");
    expect(res.answer.bullets.join(" ")).toContain("ไม่มีสิทธิ์");
    expect(res.answer.bullets.join(" ")).not.toContain("run_bi_metric");
  });

  it("metric no_summarize → ไม่เก็บ result_rows ลง bi_messages (แต่ payload ยังมี rows)", async () => {
    const { client, inserted } = makeAdmin();
    const sensitive = runResult({ rows: [{ dimension: "นักลงทุน ก", value: 50000 }] });
    sensitive.metric.no_summarize = true;

    const res = await askBi(baseInput, {
      ...baseDeps(client),
      runMetric: async () => sensitive,
      narrateAnswer: async () => ({
        bullets: ["ดูรายละเอียดจากตาราง"],
        follow_ups: [],
        usage: { tokenIn: 0, tokenOut: 0, model: "" },
        source: "rule" as const,
      }),
    });

    expect(res.status).toBe("answered");
    expect(res.rows.length).toBe(1);
    const assistantMsg = inserted
      .filter((i) => i.table === "bi_messages")
      .map((i) => i.payload as Record<string, unknown>)
      .find((p) => p.role === "assistant");
    expect(assistantMsg?.result_rows).toBeNull();
    expect(assistantMsg?.result_row_count).toBe(1);
  });
});

describe("buildDefinitionLine", () => {
  it("มีทั้งนิยามและช่วงเวลาเสมอ (§3.1 ข้อ 5)", () => {
    const line = buildDefinitionLine(runResult().metric, {
      grain: "year",
      from: "2026-01-01",
      to: "2026-12-31",
      label_th: "ปี 2569 (ปีปฏิทิน)",
      capped: false,
    });
    expect(line).toContain("นิยาม:");
    expect(line).toContain("ช่วงเวลา:");
    expect(line).toContain("2569");
  });
});
