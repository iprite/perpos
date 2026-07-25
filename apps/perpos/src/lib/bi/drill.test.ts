/**
 * เทสของ drill-down (Phase 3 · P3-D3)
 *
 * กฎ: มิติที่คลิกต้องอยู่ใน `filters` ของ metric รายละเอียดเท่านั้น — ไม่มี = คืน `null`
 * (UI ต้องไม่ให้คลิก) **ห้ามเดาชื่อคอลัมน์เอง** เพราะ RPC จะปฏิเสธและผู้ใช้เห็น error ดิบ
 */

import { describe, expect, it } from "vitest";
import { buildDrillParams, detailMetricFor, DETAIL_METRIC_BY_SCOPE } from "./drill";
import type { BiMetricCandidate } from "./resolver";

const detailMetric: Pick<BiMetricCandidate, "key" | "filters"> = {
  key: "gov_procure.orders_detail",
  filters: [
    { key: "stage", label_th: "ขั้นตอน", column: "stage", type: "text_list" },
    { key: "company", label_th: "บริษัท", column: "company", type: "text_list" },
    { key: "customer_name", label_th: "ลูกค้า", column: "customer_name", type: "text" },
  ],
};

describe("เลือก metric รายละเอียดของ scope", () => {
  it("gov_procure → orders_detail (metric ที่ verified แล้ว ไม่สร้างใหม่)", () => {
    expect(detailMetricFor("gov_procure.order_count")).toBe(DETAIL_METRIC_BY_SCOPE.gov_procure);
  });

  it("scope ที่ยังไม่มี metric รายละเอียด → null", () => {
    expect(detailMetricFor("accounting.revenue_incl_vat")).toBeNull();
    expect(detailMetricFor("core.something")).toBeNull();
    expect(detailMetricFor("ไม่รู้จัก")).toBeNull();
  });

  it("metric รายละเอียดเองไม่ต้องเจาะต่อ", () => {
    expect(detailMetricFor("gov_procure.orders_detail")).toBeNull();
  });
});

describe("buildDrillParams", () => {
  it("มิติที่คลิกไม่มีใน filters ของ metric รายละเอียด → null", () => {
    expect(
      buildDrillParams(detailMetric, {}, { dimension: "department", value: "ฝ่ายจัดซื้อ" }),
    ).toBeNull();
  });

  it("ค่าว่าง → null (ไม่ยิง query มั่ว)", () => {
    expect(buildDrillParams(detailMetric, {}, { dimension: "stage", value: "" })).toBeNull();
  });

  it("คงช่วงเวลาเดิม + ฟิลเตอร์เดิม แล้วเติมฟิลเตอร์ของจุดที่คลิก", () => {
    const target = buildDrillParams(
      detailMetric,
      {
        period: { grain: "month", from: "2026-07-01", to: "2026-07-31" },
        filters: { company: ["ก"], department: ["ไม่รองรับ"] },
      },
      { dimension: "stage", value: "รอเสนอราคา" },
    );

    expect(target).toEqual({
      metric_key: "gov_procure.orders_detail",
      params: {
        period: { grain: "month", from: "2026-07-01", to: "2026-07-31" },
        comparison: "none",
        // `department` ไม่อยู่ใน allowlist ของ metric รายละเอียด → ถูกตัดทิ้ง
        filters: { company: ["ก"], stage: ["รอเสนอราคา"] },
      },
    });
  });

  it("filter ชนิด text ส่งเป็นสตริง ไม่ใช่ array", () => {
    const target = buildDrillParams(
      detailMetric,
      {},
      { dimension: "customer_name", value: "บริษัท ก" },
    );
    expect(target?.params.filters).toEqual({ customer_name: "บริษัท ก" });
  });
});
