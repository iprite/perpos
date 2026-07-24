/**
 * เทสของ "แดชบอร์ดส่วนตัว" (Phase 3 · P3-D1 · R1)
 *
 * ครอบกฎที่ผิดแล้วข้อมูลรั่ว/ของหาย:
 *  1. คนอื่นเปิดแดชบอร์ดของเรา → ไม่เจอ (caller ตอบ 404) **ห้าม 403 ที่ยืนยันว่ามีอยู่**
 *  2. ทุก query ต้องกรอง `org_id` **และ** `created_by` ด้วยตัวเอง (ตาราง REVOKE แล้ว RLS ไม่ช่วย)
 *  3. แตะ item ได้ต่อเมื่อผ่าน ownership ของแดชบอร์ดก่อน
 *  4. เพดานจำนวนแดชบอร์ด/การ์ด · ย้ายลำดับ · แดชบอร์ดตั้งต้น (ปักหมุดครั้งแรก)
 *  5. degrade: ฐานยังไม่มีคอลัมน์ `updated_at` ของ item → ถอยไป select ชุดเดิมได้
 */

import { describe, expect, it } from "vitest";
import {
  BiDashboardLimitError,
  createDashboard,
  deleteDashboard,
  deleteItem,
  ensureDefaultDashboard,
  getDashboard,
  isDashboardOwnedBy,
  listDashboards,
  moveItem,
  pinItem,
  updateItem,
} from "./dashboards";
import { DEFAULT_DASHBOARD_NAME, MAX_DASHBOARDS_PER_USER } from "./types";

// ─── mock Supabase (เก็บสถานะจริง เพื่อให้เทสสิทธิ์มีความหมาย) ──────────────

interface StoreOpts {
  /** คอลัมน์ที่ "ฐานยังไม่มี" ต่อตาราง — select ที่ขอคอลัมน์นี้จะได้ error เหมือน PostgREST */
  missingColumns?: Record<string, string[]>;
}

function makeAdmin(tables: Record<string, Array<Record<string, unknown>>>, opts: StoreOpts = {}) {
  let seq = 0;
  const calls: Array<{ table: string; conds: Array<[string, unknown]> }> = [];

  const query = (table: string) => {
    const rows = (tables[table] ??= []);
    const conds: Array<[string, unknown]> = [];
    const ins: Array<[string, unknown[]]> = [];
    let mode: "select" | "insert" | "update" | "delete" = "select";
    let payload: Record<string, unknown> = {};
    let missing: string | null = null;

    const match = (row: Record<string, unknown>) =>
      conds.every(([k, v]) => row[k] === v) &&
      ins.every(([k, vals]) => vals.includes(row[k] as never));

    const affected = () => rows.filter(match);

    const settle = (): { data: unknown; error: { message: string } | null } => {
      if (missing) {
        return {
          data: null,
          error: { message: `column bi.${missing} does not exist (schema cache)` },
        };
      }
      if (mode === "insert") return { data: payload, error: null };
      if (mode === "update") {
        const hit = affected();
        for (const row of hit) Object.assign(row, payload);
        return { data: hit, error: null };
      }
      if (mode === "delete") {
        const hit = affected();
        for (const row of hit) rows.splice(rows.indexOf(row), 1);
        return { data: hit, error: null };
      }
      return { data: affected(), error: null };
    };

    const q: Record<string, unknown> = {
      select: (cols?: string) => {
        for (const col of opts.missingColumns?.[table] ?? []) {
          if (typeof cols === "string" && cols.includes(col)) missing = col;
        }
        return q;
      },
      eq: (k: string, v: unknown) => {
        conds.push([k, v]);
        return q;
      },
      in: (k: string, v: unknown[]) => {
        ins.push([k, v]);
        return q;
      },
      contains: () => q,
      order: () => q,
      limit: () => q,
      insert: (p: Record<string, unknown>) => {
        mode = "insert";
        payload = { id: `${table}-${++seq}`, created_at: `2026-07-24T00:0${seq}:00Z`, ...p };
        rows.push(payload);
        return q;
      },
      update: (p: Record<string, unknown>) => {
        mode = "update";
        payload = p;
        return q;
      },
      delete: () => {
        mode = "delete";
        return q;
      },
      single: () => Promise.resolve(settle()),
      maybeSingle: () => {
        const res = settle();
        const data = Array.isArray(res.data) ? ((res.data[0] as unknown) ?? null) : res.data;
        return Promise.resolve({ data, error: res.error });
      },
      then: (res: (v: unknown) => unknown, rej?: (e: unknown) => unknown) => {
        calls.push({ table, conds: [...conds] });
        const settled = settle();
        return Promise.resolve({
          data: Array.isArray(settled.data) ? settled.data : [settled.data],
          error: settled.error,
        }).then(res, rej);
      },
    };
    return q;
  };

  return { calls, client: { from: (t: string) => query(t) } as never };
}

const ORG = "org-1";
const ME = "me";
const OTHER = "other";

function dashboardRow(over: Record<string, unknown> = {}) {
  return {
    id: "dash-1",
    org_id: ORG,
    name: "ของฉัน",
    created_by: ME,
    created_at: "2026-07-01T00:00:00Z",
    updated_at: "2026-07-01T00:00:00Z",
    ...over,
  };
}

function itemRow(over: Record<string, unknown> = {}) {
  return {
    id: "item-1",
    org_id: ORG,
    dashboard_id: "dash-1",
    title: "งานค้าง",
    metric_key: "gov_procure.order_count",
    params: {},
    chart_type: null,
    position: 0,
    created_at: "2026-07-01T00:00:00Z",
    updated_at: "2026-07-01T00:00:00Z",
    ...over,
  };
}

// ─── ownership (R1) ────────────────────────────────────────────────────────

describe("แดชบอร์ดเป็นของส่วนตัวรายคน", () => {
  it("คนอื่นเปิดแดชบอร์ดของเรา → ไม่เจอ (404 ไม่ใช่ 403)", async () => {
    const { client } = makeAdmin({ bi_dashboards: [dashboardRow()] });
    expect(await getDashboard(client, ORG, "dash-1", OTHER)).toBeNull();
    expect(await isDashboardOwnedBy(client, ORG, "dash-1", OTHER)).toBe(false);
    expect(await isDashboardOwnedBy(client, ORG, "dash-1", ME)).toBe(true);
  });

  it("ข้าม org ไม่ได้แม้จะเป็นเจ้าของ", async () => {
    const { client } = makeAdmin({ bi_dashboards: [dashboardRow()] });
    expect(await getDashboard(client, "org-2", "dash-1", ME)).toBeNull();
  });

  it("ทุก query กรอง org_id + created_by เสมอ", async () => {
    const { client, calls } = makeAdmin({ bi_dashboards: [dashboardRow()] });
    await listDashboards(client, ORG, ME);
    const call = calls.find((c) => c.table === "bi_dashboards");
    const keys = (call?.conds ?? []).map(([k]) => k);
    expect(keys).toContain("org_id");
    expect(keys).toContain("created_by");
  });

  it("profileId ว่าง = ไม่คืนอะไรเลย (ห้าม default เป็น null แล้วหลุด)", async () => {
    const { client } = makeAdmin({ bi_dashboards: [dashboardRow()] });
    expect(await listDashboards(client, ORG, "")).toEqual([]);
    expect(await getDashboard(client, ORG, "dash-1", "")).toBeNull();
    expect(await deleteDashboard(client, ORG, "dash-1", "")).toBe(false);
  });

  it("การ์ดถูกแตะได้เฉพาะเมื่อผ่าน ownership ของแดชบอร์ดก่อน", async () => {
    const store = { bi_dashboards: [dashboardRow()], bi_dashboard_items: [itemRow()] };
    const { client } = makeAdmin(store);

    expect(
      await pinItem(client, {
        orgId: ORG,
        dashboardId: "dash-1",
        profileId: OTHER,
        metricKey: "gov_procure.order_count",
      }),
    ).toBeNull();
    expect(await updateItem(client, ORG, "dash-1", "item-1", OTHER, { title: "x" })).toBeNull();
    expect(await moveItem(client, ORG, "dash-1", "item-1", OTHER, "up")).toBeNull();
    expect(await deleteItem(client, ORG, "dash-1", "item-1", OTHER)).toBe(false);
    // ของเดิมไม่ถูกแตะเลย
    expect(store.bi_dashboard_items).toHaveLength(1);
    expect(store.bi_dashboard_items[0].title).toBe("งานค้าง");
  });
});

// ─── CRUD ──────────────────────────────────────────────────────────────────

describe("CRUD แดชบอร์ด + การ์ด", () => {
  it("list คืนจำนวนการ์ดของแต่ละใบ (query เดียว ไม่ N+1)", async () => {
    const { client } = makeAdmin({
      bi_dashboards: [dashboardRow(), dashboardRow({ id: "dash-2", name: "อีกใบ" })],
      bi_dashboard_items: [itemRow(), itemRow({ id: "item-2" })],
    });
    const list = await listDashboards(client, ORG, ME);
    expect(list.map((d) => [d.id, d.item_count])).toEqual([
      ["dash-1", 2],
      ["dash-2", 0],
    ]);
  });

  it("ปักหมุดครั้งแรกได้ 'แดชบอร์ดของฉัน' อัตโนมัติ แล้วครั้งถัดไปใช้ใบเดิม", async () => {
    const store: Record<string, Array<Record<string, unknown>>> = { bi_dashboards: [] };
    const { client } = makeAdmin(store);

    const first = await ensureDefaultDashboard(client, ORG, ME);
    expect(first.name).toBe(DEFAULT_DASHBOARD_NAME);
    expect(first.created_by).toBe(ME);

    const again = await ensureDefaultDashboard(client, ORG, ME);
    expect(again.id).toBe(first.id);
    expect(store.bi_dashboards).toHaveLength(1);
  });

  it("เกินเพดานจำนวนแดชบอร์ด → error ภาษาไทย (ไม่ใช่ error ดิบ)", async () => {
    const rows = Array.from({ length: MAX_DASHBOARDS_PER_USER }, (_, i) =>
      dashboardRow({ id: `dash-${i}` }),
    );
    const { client } = makeAdmin({ bi_dashboards: rows });
    await expect(
      createDashboard(client, { orgId: ORG, profileId: ME, name: "ใหม่" }),
    ).rejects.toBeInstanceOf(BiDashboardLimitError);
  });

  it("ปักหมุดต่อท้ายเสมอ (position นับต่อจากใบสุดท้าย)", async () => {
    const { client } = makeAdmin({
      bi_dashboards: [dashboardRow()],
      bi_dashboard_items: [itemRow({ position: 0 }), itemRow({ id: "item-2", position: 1 })],
    });
    const item = await pinItem(client, {
      orgId: ORG,
      dashboardId: "dash-1",
      profileId: ME,
      metricKey: "gov_procure.order_count",
      title: "  ใหม่  ",
    });
    expect(item?.position).toBe(2);
    expect(item?.title).toBe("ใหม่");
  });

  it("ย้ายลำดับขึ้น = สลับกับใบก่อนหน้า และ position กลายเป็น 0..n-1", async () => {
    const store = {
      bi_dashboards: [dashboardRow()],
      bi_dashboard_items: [
        itemRow({ id: "a", position: 0 }),
        itemRow({ id: "b", position: 5 }),
        itemRow({ id: "c", position: 9 }),
      ],
    };
    const { client } = makeAdmin(store);
    const moved = await moveItem(client, ORG, "dash-1", "b", ME, "up");
    expect(moved?.position).toBe(0);
    const byId = Object.fromEntries(store.bi_dashboard_items.map((r) => [r.id, r.position]));
    expect(byId).toEqual({ b: 0, a: 1, c: 2 });
  });

  it("ลบการ์ด/แดชบอร์ดของคนอื่นไม่ได้ แต่ของตัวเองได้", async () => {
    const store = { bi_dashboards: [dashboardRow()], bi_dashboard_items: [itemRow()] };
    const { client } = makeAdmin(store);
    expect(await deleteItem(client, ORG, "dash-1", "item-1", ME)).toBe(true);
    expect(store.bi_dashboard_items).toHaveLength(0);
    expect(await deleteDashboard(client, ORG, "dash-1", OTHER)).toBe(false);
    expect(await deleteDashboard(client, ORG, "dash-1", ME)).toBe(true);
  });

  it("degrade: ฐานยังไม่มี `updated_at` ของการ์ด → ถอยไปคอลัมน์ชุดเดิมได้", async () => {
    const { client } = makeAdmin(
      { bi_dashboards: [dashboardRow()], bi_dashboard_items: [itemRow()] },
      { missingColumns: { bi_dashboard_items: ["updated_at"] } },
    );
    const result = await getDashboard(client, ORG, "dash-1", ME);
    expect(result?.items).toHaveLength(1);
    expect(result?.items[0].metric_key).toBe("gov_procure.order_count");
  });
});
