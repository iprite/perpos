/**
 * เทสของ "การ์ดแดชบอร์ด = เส้นทางที่แยกขาดจากคำถามจริง" (Phase 3 · P3-D2 · R6/R9)
 *
 * กฎที่ผิดแล้วเสียหายทันที:
 *  1. เปิดแดชบอร์ดหลายการ์ด **ห้าม** ขยับโควตาคำถาม AI (`incr_bi_usage`) — ต้องนับที่
 *     `incr_bi_dashboard_usage` และนับ **ต่อคำขอ ไม่ใช่ต่อการ์ด**
 *  2. การ์ดรันด้วย role ของ **คนที่กำลังดู** ไม่ใช่ role ของคนที่ปักหมุด
 *  3. metric ถูกปิด/ไม่มีสิทธิ์ → ข้อความไทยมาตรฐาน **ไม่ใช่ error ดิบ** และไม่หลุด metadata ของ metric
 *  4. log ลง `bi_query_log` ด้วย `source='dashboard'` (ห้ามปนกับคำถามจริง)
 *  5. ช่วงเทียบยิงขนาน และล้มเหลวแล้วผลหลักยังออก
 */

import { describe, expect, it, vi } from "vitest";
import { cardStateFromError, incrDashboardUsage, runCards, runDirect, BiRunError } from "./run";
import type { RunMetricResult } from "./runner";
import type { BiDashboardItem, BiRole } from "./types";

const ORG = "org-1";
const ME = "me";

const METRIC_ROW = {
  key: "gov_procure.order_count",
  label_th: "จำนวนใบงาน",
  definition_th: "จำนวนใบงานจัดซื้อทั้งหมดในช่วงที่เลือก",
  synonyms: [],
  dimensions: [{ key: "company", label_th: "บริษัท", column: "company" }],
  time_grains: ["month"],
  comparisons: ["none", "prev_period"],
  filters: [{ key: "company", label_th: "บริษัท", column: "company", type: "text_list" }],
  default_view: { period: "this_month" },
  chart_hint: "stat",
  unit: "count",
  unit_decimals: 0,
  param_schema: {},
  max_period_months: 12,
  no_summarize: false,
  time_basis: "created_at",
  module_scope: "gov_procure",
  allowed_roles: ["owner", "analyst"],
  status: "verified",
};

interface AdminOpts {
  metrics?: Array<Record<string, unknown>>;
  /** ผลของ RPC ตามชื่อ */
  rpc?: Record<string, unknown>;
}

function makeAdmin(opts: AdminOpts = {}) {
  const inserted: Array<{ table: string; payload: Record<string, unknown> }> = [];
  const rpcCalls: Array<{ name: string; args: Record<string, unknown> }> = [];

  const query = (table: string) => {
    const conds: Array<[string, unknown]> = [];
    const contains: Array<[string, unknown[]]> = [];
    const ins: Array<[string, unknown[]]> = [];

    const rows = table === "bi_metrics" ? (opts.metrics ?? [METRIC_ROW]) : [];
    const match = (row: Record<string, unknown>) =>
      conds.every(([k, v]) => row[k] === v) &&
      ins.every(([k, vals]) => vals.includes(row[k] as never)) &&
      contains.every(([k, vals]) =>
        vals.every((v) => (row[k] as unknown[] | undefined)?.includes(v)),
      );

    const q: Record<string, unknown> = {
      select: () => q,
      eq: (k: string, v: unknown) => {
        conds.push([k, v]);
        return q;
      },
      in: (k: string, v: unknown[]) => {
        ins.push([k, v]);
        return q;
      },
      contains: (k: string, v: unknown[]) => {
        contains.push([k, v]);
        return q;
      },
      order: () => q,
      limit: () => q,
      insert: (payload: Record<string, unknown>) => {
        inserted.push({ table, payload });
        return Promise.resolve({ data: payload, error: null });
      },
      maybeSingle: () => Promise.resolve({ data: rows.filter(match)[0] ?? null, error: null }),
      then: (res: (v: unknown) => unknown, rej?: (e: unknown) => unknown) =>
        Promise.resolve({ data: rows.filter(match), error: null }).then(res, rej),
    };
    return q;
  };

  return {
    inserted,
    rpcCalls,
    client: {
      from: (t: string) => query(t),
      rpc: (name: string, args: Record<string, unknown>) => {
        rpcCalls.push({ name, args });
        return Promise.resolve({
          data: opts.rpc && name in opts.rpc ? opts.rpc[name] : null,
          error: null,
        });
      },
    } as never,
  };
}

function runResult(over: Partial<RunMetricResult> = {}): RunMetricResult {
  return {
    rows: [{ dimension: null, value: 12 }],
    row_count: 1,
    sql: "SELECT ...",
    elapsed_ms: 8,
    truncated: false,
    metric: {
      key: METRIC_ROW.key,
      label_th: METRIC_ROW.label_th,
      definition_th: METRIC_ROW.definition_th,
      time_basis: "created_at",
      unit: "count",
      unit_decimals: 0,
      chart_hint: "stat",
      status: "verified",
      no_summarize: false,
      includes: [],
      excludes: [],
    },
    effective_params: {},
    ...over,
  };
}

function item(over: Partial<BiDashboardItem> = {}): BiDashboardItem {
  return {
    id: "item-1",
    org_id: ORG,
    dashboard_id: "dash-1",
    title: "จำนวนใบงานเดือนนี้",
    metric_key: METRIC_ROW.key,
    params: {},
    chart_type: null,
    position: 0,
    created_at: "2026-07-01T00:00:00Z",
    updated_at: null,
    ...over,
  };
}

const SCOPES = ["core", "gov_procure"] as const;

// ─── R6: โควตาต้องแยกจากคำถาม AI ──────────────────────────────────────────

describe("โควตาของการ์ดแยกจากโควตาคำถาม AI (R6)", () => {
  it("เปิดแดชบอร์ด 8 การ์ด → ไม่เรียก incr_bi_usage เลย", async () => {
    const { client, rpcCalls } = makeAdmin();
    const runMetric = vi.fn(async () => runResult());
    const items = Array.from({ length: 8 }, (_, i) => item({ id: `item-${i}` }));

    const results = await runCards({
      admin: client,
      orgId: ORG,
      profileId: ME,
      role: "owner",
      items,
      scopes: [...SCOPES],
      runMetric,
      log: false,
    });

    expect(results).toHaveLength(8);
    expect(results.every((r) => r.state === "ok")).toBe(true);
    expect(rpcCalls.some((c) => c.name === "incr_bi_usage")).toBe(false);
  });

  it("นับ dashboard usage ครั้งเดียวต่อคำขอ (ไม่ใช่ต่อการ์ด)", async () => {
    const { client, rpcCalls } = makeAdmin({ rpc: { incr_bi_dashboard_usage: true } });
    const allowed = await incrDashboardUsage(client, ORG, ME);
    expect(allowed).toBe(true);
    expect(rpcCalls.filter((c) => c.name === "incr_bi_dashboard_usage")).toHaveLength(1);
    expect(rpcCalls[0].args.p_org_id).toBe(ORG);
    expect(rpcCalls[0].args.p_profile_id).toBe(ME);
  });

  it("degrade: RPC ยังไม่ลงฐาน → ถือว่าผ่าน ไม่ทำให้หน้าพัง", async () => {
    const client = {
      rpc: async () => ({ data: null, error: { message: "function does not exist" } }),
    } as never;
    expect(await incrDashboardUsage(client, ORG, ME)).toBe(true);
    const bySqlstate = {
      rpc: async () => ({ data: null, error: { code: "42883", message: "undefined_function" } }),
    } as never;
    expect(await incrDashboardUsage(bySqlstate, ORG, ME)).toBe(true);
  });

  it("RPC พังด้วยเหตุอื่น → fail-closed (ห้ามให้เพดานหายเงียบ ๆ)", async () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    const timeout = {
      rpc: async () => ({
        data: null,
        error: { code: "57014", message: "canceling statement due to statement timeout" },
      }),
    } as never;
    expect(await incrDashboardUsage(timeout, ORG, ME)).toBe(false);

    const thrown = {
      rpc: async () => {
        throw new Error("network unreachable");
      },
    } as never;
    expect(await incrDashboardUsage(thrown, ORG, ME)).toBe(false);
    expect(spy).toHaveBeenCalledTimes(2);
    spy.mockRestore();
  });

  it("เกินเพดาน (RPC คืน false) → ไม่ผ่าน", async () => {
    const { client } = makeAdmin({ rpc: { incr_bi_dashboard_usage: false } });
    expect(await incrDashboardUsage(client, ORG, ME)).toBe(false);
  });
});

// ─── R9: role ของคนดู + สถานะการ์ด ────────────────────────────────────────

describe("การ์ดใช้ role ของคนที่กำลังดู (R9)", () => {
  it("ส่ง role ของผู้ดูเข้า RPC ไม่ใช่ของคนที่ปักหมุด", async () => {
    const { client } = makeAdmin();
    const runMetric = vi.fn(async (_input: { role: BiRole; allowDraft?: boolean }) => runResult());

    await runDirect({
      admin: client,
      orgId: ORG,
      profileId: ME,
      role: "analyst",
      metricKey: METRIC_ROW.key,
      scopes: [...SCOPES],
      runMetric: runMetric as never,
      log: false,
    });

    expect(runMetric.mock.calls[0][0]).toMatchObject({ role: "analyst", allowDraft: false });
  });

  it("role ที่ไม่อยู่ใน allowed_roles → หา metric ไม่เจอ (ไม่บอกใบ้ว่ามีอยู่)", async () => {
    const { client } = makeAdmin();
    const viewer: BiRole = "viewer";
    await expect(
      runDirect({
        admin: client,
        orgId: ORG,
        profileId: ME,
        role: viewer,
        metricKey: METRIC_ROW.key,
        scopes: [...SCOPES],
        runMetric: vi.fn(async () => runResult()),
        log: false,
      }),
    ).rejects.toBeInstanceOf(BiRunError);
  });

  it("metric ถูกปิด (draft) → ข้อความไทย ไม่ใช่ error ดิบ และไม่หลุดชื่อ metric", async () => {
    const { client } = makeAdmin();
    const runMetric = vi.fn(async () => {
      throw new Error("run_bi_metric: metric ยังไม่ verified (draft)");
    });

    const [card] = await runCards({
      admin: client,
      orgId: ORG,
      profileId: ME,
      role: "owner",
      items: [item({ title: "การ์ดของฉัน" })],
      scopes: [...SCOPES],
      runMetric,
      log: false,
    });

    expect(card.state).toBe("metric_unavailable");
    expect(card.message).toBe("ตัวชี้วัดนี้ถูกปิดชั่วคราว");
    expect(card.result).toBeNull();
    expect(card.title).toBe("การ์ดของฉัน");
    expect(JSON.stringify(card)).not.toContain(METRIC_ROW.key);
    expect(JSON.stringify(card)).not.toContain(METRIC_ROW.definition_th);
  });

  it("ผู้ใช้ถูกลดสิทธิ์ภายหลัง → forbidden พร้อมข้อความไทย", async () => {
    const { client } = makeAdmin();
    const runMetric = vi.fn(async () => {
      throw new Error("run_bi_metric: allowed_roles ไม่มีสิทธิ์");
    });

    const [card] = await runCards({
      admin: client,
      orgId: ORG,
      profileId: ME,
      role: "owner",
      items: [item()],
      scopes: [...SCOPES],
      runMetric,
      log: false,
    });

    expect(card.state).toBe("forbidden");
    expect(card.message).toBe("คุณไม่มีสิทธิ์ดูการ์ดนี้");
  });

  it("การ์ดใบหนึ่งพังไม่ทำให้ใบอื่นพัง", async () => {
    const { client } = makeAdmin();
    let call = 0;
    const runMetric = vi.fn(async () => {
      if (++call === 1) throw new Error("boom");
      return runResult();
    });

    const results = await runCards({
      admin: client,
      orgId: ORG,
      profileId: ME,
      role: "owner",
      items: [item({ id: "a" }), item({ id: "b" })],
      scopes: [...SCOPES],
      runMetric,
      log: false,
    });

    expect(results.map((r) => r.state).sort()).toEqual(["error", "ok"]);
  });

  it("cardStateFromError แยกสามกรณีออกจากกัน", () => {
    expect(cardStateFromError("allowed_roles ไม่ผ่าน")).toBe("forbidden");
    expect(cardStateFromError("metric ยัง draft")).toBe("metric_unavailable");
    expect(cardStateFromError("canceling statement")).toBe("error");
  });
});

// ─── log + ผลลัพธ์ ────────────────────────────────────────────────────────

describe("log และ payload ของการรันตรง", () => {
  it("log ลง bi_query_log ด้วย source='dashboard' และไม่มีต้นทุน AI", async () => {
    const { client, inserted } = makeAdmin();
    await runDirect({
      admin: client,
      orgId: ORG,
      profileId: ME,
      role: "owner",
      metricKey: METRIC_ROW.key,
      scopes: [...SCOPES],
      runMetric: vi.fn(async () => runResult()),
    });

    const log = inserted.find((i) => i.table === "bi_query_log");
    expect(log?.payload).toMatchObject({
      source: "dashboard",
      question: METRIC_ROW.key,
      matched_metric_key: METRIC_ROW.key,
      token_in: 0,
      token_out: 0,
      cost_usd: 0,
      thread_id: null,
    });
  });

  it("ไม่เขียน bi_messages เลย (การ์ดไม่ใช่บทสนทนา)", async () => {
    const { client, inserted } = makeAdmin();
    await runDirect({
      admin: client,
      orgId: ORG,
      profileId: ME,
      role: "owner",
      metricKey: METRIC_ROW.key,
      scopes: [...SCOPES],
      runMetric: vi.fn(async () => runResult()),
    });
    expect(inserted.some((i) => i.table === "bi_messages")).toBe(false);
  });

  it("คืนบรรทัดนิยาม + ช่วงเวลาเสมอ (กฎเหล็ก §3.1 ข้อ 5)", async () => {
    const { client } = makeAdmin();
    const result = await runDirect({
      admin: client,
      orgId: ORG,
      profileId: ME,
      role: "owner",
      metricKey: METRIC_ROW.key,
      scopes: [...SCOPES],
      today: new Date("2026-07-15T00:00:00Z"),
      runMetric: vi.fn(async () => runResult()),
      log: false,
    });

    expect(result.definition_line).toContain("นิยาม:");
    expect(result.definition_line).toContain("ช่วงเวลา:");
    expect(result.chart?.type).toBe("stat");
  });

  it("เทียบช่วงก่อน: ยิงขนานสองครั้ง และ fail แล้วผลหลักยังออก", async () => {
    const { client } = makeAdmin();
    const started: string[] = [];
    const releases: Array<() => void> = [];

    const runMetric = vi.fn(async (input: { rpcParams: Record<string, unknown> }) => {
      const from = String(input.rpcParams.date_from ?? "");
      started.push(from);
      if (started.length === 1) {
        // ค้างตัวหลักไว้ก่อน — ถ้าโค้ดเรียงแทนที่จะขนาน ตัวที่สองจะไม่ถูกยิงเลย
        await new Promise<void>((r) => releases.push(r));
        return runResult();
      }
      throw new Error("compare boom");
    });

    const promise = runDirect({
      admin: client,
      orgId: ORG,
      profileId: ME,
      role: "owner",
      metricKey: METRIC_ROW.key,
      params: { period: { grain: "month", offset: 0 }, comparison: "prev_period" },
      scopes: [...SCOPES],
      today: new Date("2026-07-15T00:00:00Z"),
      runMetric: runMetric as never,
      log: false,
    });

    await vi.waitFor(() => expect(started.length).toBe(2));
    releases[0]?.();

    const result = await promise;
    expect(result.rows).toHaveLength(1);
    expect(result.compare).toBeNull();
  });
});
