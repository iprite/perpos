import { describe, it, expect } from "vitest";
import {
  actualCost,
  billingAmountFromPercent,
  billingInvoiceBase,
  billingPlanTotals,
  boqLineTotals,
  boqTotals,
  committedCost,
  costDrift,
  documentVatBreakdown,
  effectiveMaterialCost,
  progressPct,
  resolveMargin,
  summarizePortfolio,
  summarizeProject,
  sumDefined,
  unitCostTotal,
  unitPrice,
} from "./project-metrics";
import type { ProjectStatus, PurchaseRequestStatus } from "./types";

describe("margin 4 ชั้น", () => {
  it("เฉพาะเจาะจงกว่าชนะ: บรรทัด > รายการ > หมวด > โครงการ > บริษัท", () => {
    expect(
      resolveMargin({ item: 5, priceBook: 10, category: 15, project: 20, company: 25 }),
    ).toEqual({
      pct: 5,
      source: "item",
    });
    expect(resolveMargin({ priceBook: 10, category: 15, project: 20, company: 25 }).pct).toBe(10);
    expect(resolveMargin({ category: 15, project: 20, company: 25 })).toEqual({
      pct: 15,
      source: "category",
    });
    expect(resolveMargin({ project: 20, company: 25 })).toEqual({ pct: 20, source: "project" });
    expect(resolveMargin({ company: 25 })).toEqual({ pct: 25, source: "company" });
  });

  it("margin = 0 ที่ตั้งไว้จริง ต้องชนะชั้นล่าง (0 ไม่ใช่ 'ไม่ได้ตั้ง')", () => {
    expect(resolveMargin({ category: 0, company: 25 })).toEqual({ pct: 0, source: "category" });
  });

  it("ไม่ตั้งเลย → 0% (ขายเท่าทุน) ไม่ใช่ NaN", () => {
    expect(resolveMargin({})).toEqual({ pct: 0, source: "company" });
  });
});

describe("ราคาต่อหน่วยและยอดบรรทัด BOQ", () => {
  it("ต้นทุนรวม = วัสดุ + ค่าแรง + ค่าดำเนินการ", () => {
    expect(unitCostTotal({ material: 11.5, labor: 8, overhead: 2.25 })).toBe(21.75);
  });

  it("ราคาขาย = ต้นทุน × (1+margin)", () => {
    expect(unitPrice({ material: 100, labor: 0, overhead: 0 }, 20)).toBe(120);
    expect(unitPrice({ material: 21.75, labor: 0, overhead: 0 }, 15)).toBe(25.01);
  });

  it("ยอดบรรทัดครบชุด และต้นทุน ≤ ราคาขายเสมอเมื่อ margin ≥ 0", () => {
    const t = boqLineTotals(120, { material: 11.5, labor: 8, overhead: 2.25 }, 20);
    expect(t.unit_cost).toBe(21.75);
    expect(t.unit_price).toBe(26.1);
    expect(t.cost_amount).toBe(2610);
    expect(t.amount).toBe(3132);
    expect(t.cost_amount).toBeLessThan(t.amount);
  });

  it("BOQ ว่าง → ยอดรวมเป็น null ไม่ใช่ 0", () => {
    expect(boqTotals([])).toEqual({ total_amount: null, total_cost: null, counted: 0 });
  });

  it("ยอดรวม BOQ บวกถูกและบอกจำนวนแถวที่นับ", () => {
    expect(
      boqTotals([
        { amount: 3132, cost_amount: 2610 },
        { amount: 1000, cost_amount: 800 },
      ]),
    ).toEqual({
      total_amount: 4132,
      total_cost: 3410,
      counted: 2,
    });
  });
});

describe("ต้นทุนจริง", () => {
  it("นับการเบิกใช้ (issue) หักด้วยของที่คืนกลับคลัง — รับเข้า/โอน ไม่นับ", () => {
    const r = actualCost(
      [
        { movement_type: "receive", total_cost: 50000 },
        { movement_type: "transfer", total_cost: 20000 },
        { movement_type: "issue", total_cost: 12000 },
        { movement_type: "issue", total_cost: 3000 },
        { movement_type: "return", total_cost: 500 },
      ],
      [],
    );
    // 12,000 + 3,000 − 500 (ของที่คืนกลับคลัง)
    expect(r.value).toBe(14500);
    expect(r.counted).toBe(3);
  });

  it("ของที่เบิกไปแล้วคืนกลับคลัง ต้องหักออกจากต้นทุนโครงการ", () => {
    const r = actualCost(
      [
        { movement_type: "issue", total_cost: 12000 },
        { movement_type: "return", total_cost: 2500 },
      ],
      [],
    );
    expect(r.value).toBe(9500);
    expect(r.counted).toBe(2);
  });

  it("รวมต้นทุนที่ไม่ผ่านคลัง (ค่าแรง/ผู้รับเหมาช่วง)", () => {
    const r = actualCost(
      [{ movement_type: "issue", total_cost: 15000 }],
      [{ amount: 8000 }, { amount: 2500 }],
    );
    expect(r.value).toBe(25500);
    expect(r.counted).toBe(3);
  });
});

describe("ต้นทุนผูกพัน (committed)", () => {
  const prs: { id: string; status: PurchaseRequestStatus }[] = [
    { id: "p1", status: "approved" },
    { id: "p2", status: "draft" },
    { id: "p3", status: "cancelled" },
    { id: "p4", status: "received" },
  ];

  it("นับเฉพาะ PR ที่อนุมัติ/สั่งซื้อ/รับบางส่วน และเฉพาะส่วนที่ยังไม่ได้รับ", () => {
    const r = committedCost(prs, [
      { pr_id: "p1", qty: 100, received_qty: 40, selected_unit_cost: 10, estimated_unit_cost: 12 },
      { pr_id: "p2", qty: 50, received_qty: 0, selected_unit_cost: 10, estimated_unit_cost: null },
      { pr_id: "p3", qty: 50, received_qty: 0, selected_unit_cost: 10, estimated_unit_cost: null },
      { pr_id: "p4", qty: 50, received_qty: 50, selected_unit_cost: 10, estimated_unit_cost: null },
    ]);
    expect(r.value).toBe(600); // (100-40) × 10
    expect(r.counted).toBe(1);
  });

  it("ไม่มีราคาที่เลือก → ใช้ราคาประเมิน", () => {
    expect(
      committedCost(prs, [
        {
          pr_id: "p1",
          qty: 10,
          received_qty: 0,
          selected_unit_cost: null,
          estimated_unit_cost: 25,
        },
      ]).value,
    ).toBe(250);
  });

  it("ไม่มีราคาเลย → ไม่เดา (ไม่นับเข้ายอด)", () => {
    expect(
      committedCost(prs, [
        {
          pr_id: "p1",
          qty: 10,
          received_qty: 0,
          selected_unit_cost: null,
          estimated_unit_cost: null,
        },
      ]),
    ).toEqual({ value: 0, counted: 0 });
  });

  it("รับของเกินที่สั่ง ไม่ทำให้ยอดติดลบ", () => {
    expect(
      committedCost(prs, [
        {
          pr_id: "p1",
          qty: 10,
          received_qty: 15,
          selected_unit_cost: 100,
          estimated_unit_cost: null,
        },
      ]).value,
    ).toBe(0);
  });
});

describe("ความคืบหน้า", () => {
  const items = [
    { id: "a", qty: 100, amount: 90000 },
    { id: "b", qty: 10, amount: 10000 },
  ];

  it("ยังไม่มีบันทึกเลย → null (ห้ามคืน 0%)", () => {
    expect(progressPct(items, [])).toBeNull();
    expect(progressPct([], [])).toBeNull();
  });

  it("ถ่วงน้ำหนักด้วยราคาขาย ไม่ใช่จำนวนบรรทัด", () => {
    const p = progressPct(items, [
      {
        boq_item_id: "a",
        progress_date: "2026-07-01",
        done_qty: 50,
        percent: null,
        created_at: "2026-07-01",
      },
    ]);
    expect(p).toBeCloseTo(0.45, 5); // 50% ของบรรทัดที่มีน้ำหนัก 90%
  });

  it("ใช้บันทึกล่าสุดต่อบรรทัด", () => {
    const p = progressPct(items, [
      {
        boq_item_id: "a",
        progress_date: "2026-07-01",
        done_qty: 50,
        percent: null,
        created_at: "2026-07-01",
      },
      {
        boq_item_id: "a",
        progress_date: "2026-07-20",
        done_qty: 100,
        percent: null,
        created_at: "2026-07-20",
      },
    ]);
    expect(p).toBeCloseTo(0.9, 5);
  });

  it("บันทึกเกินปริมาณ ไม่ทำให้เกิน 100%", () => {
    const p = progressPct(items, [
      {
        boq_item_id: "a",
        progress_date: "2026-07-20",
        done_qty: 500,
        percent: null,
        created_at: "x",
      },
      {
        boq_item_id: "b",
        progress_date: "2026-07-20",
        done_qty: 50,
        percent: null,
        created_at: "x",
      },
    ]);
    expect(p).toBe(1);
  });

  it("บรรทัดที่วัดปริมาณไม่ได้ ใช้ percent", () => {
    const p = progressPct(items, [
      {
        boq_item_id: "b",
        progress_date: "2026-07-20",
        done_qty: null,
        percent: 50,
        created_at: "x",
      },
    ]);
    expect(p).toBeCloseTo(0.05, 5);
  });
});

describe("สรุปเงินของโครงการ", () => {
  const base = {
    usage: [{ movement_type: "issue" as const, total_cost: 200000 }],
    otherCosts: [{ amount: 50000 }],
    prs: [{ id: "p1", status: "approved" as PurchaseRequestStatus }],
    prItems: [
      {
        pr_id: "p1",
        qty: 100,
        received_qty: 0,
        selected_unit_cost: 300,
        estimated_unit_cost: null,
      },
    ],
    boqItems: [{ id: "a", qty: 100, amount: 1000000 }],
    progress: [
      {
        boq_item_id: "a",
        progress_date: "2026-07-20",
        done_qty: 50,
        percent: null,
        created_at: "x",
      },
    ],
    billings: [
      { amount: 300000, status: "invoiced" as const },
      { amount: 200000, status: "planned" as const },
    ],
  };

  it("คิดครบทุกตัวและกำไรคาดการณ์หักทั้ง actual + committed + งานที่เหลือ", () => {
    const s = summarizeProject({
      project: { status: "in_progress", contract_amount: 1000000, budget_cost: 700000 },
      ...base,
    });
    expect(s.actual_cost).toBe(250000);
    expect(s.committed_cost).toBe(30000);
    expect(s.progress_pct).toBe(0.5);
    // 250,000 + 30,000 + (700,000 × 50%)
    expect(s.forecast_cost).toBe(630000);
    expect(s.forecast_profit).toBe(370000);
    expect(s.forecast_margin_pct).toBeCloseTo(0.37, 5);
    expect(s.cost_variance).toBe(-420000);
    expect(s.over_budget).toBe(false);
    expect(s.billed_amount).toBe(300000);
    expect(s.unbilled_amount).toBe(700000);
  });

  it("ยังไม่อนุมัติ BOQ (ไม่มีงบ) → forecast/variance เป็น null ไม่ใช่ 0", () => {
    const s = summarizeProject({
      project: { status: "boq", contract_amount: null, budget_cost: null },
      ...base,
    });
    expect(s.forecast_cost).toBeNull();
    expect(s.forecast_profit).toBeNull();
    expect(s.cost_variance).toBeNull();
    expect(s.unbilled_amount).toBeNull();
    expect(s.over_budget).toBe(false);
  });

  it("ใช้เกินงบ → variance เป็นบวกและติดธง", () => {
    const s = summarizeProject({
      project: { status: "in_progress", contract_amount: 1000000, budget_cost: 200000 },
      ...base,
    });
    expect(s.cost_variance).toBe(80000);
    expect(s.over_budget).toBe(true);
  });

  it("กำไรจริงคิดเฉพาะโครงการที่ปิดแล้ว", () => {
    const open = summarizeProject({
      project: { status: "in_progress", contract_amount: 1000000, budget_cost: 700000 },
      ...base,
    });
    expect(open.actual_profit).toBeNull();
    const done = summarizeProject({
      project: { status: "closed", contract_amount: 1000000, budget_cost: 700000 },
      ...base,
    });
    expect(done.actual_profit).toBe(750000);
  });

  it("ยังไม่บันทึกความคืบหน้า → ตีว่างานที่เหลือยังไม่ทำ (ไม่ใช่เสร็จหมด)", () => {
    const s = summarizeProject({
      project: { status: "in_progress", contract_amount: 1000000, budget_cost: 700000 },
      ...base,
      progress: [],
    });
    expect(s.progress_pct).toBeNull();
    expect(s.forecast_cost).toBe(980000); // 250,000 + 30,000 + 700,000 เต็ม
  });

  it("มูลค่าสัญญา 0 → ไม่คิดอัตรากำไร (ห้ามหารศูนย์)", () => {
    const s = summarizeProject({
      project: { status: "in_progress", contract_amount: 0, budget_cost: 700000 },
      ...base,
    });
    expect(s.forecast_margin_pct).toBeNull();
  });
});

describe("งวดงาน", () => {
  it("รวมงวดที่ยังไม่ยกเลิก และบอกยอดที่เหลือวางบิลได้", () => {
    const r = billingPlanTotals(1000000, [
      { amount: 300000, status: "invoiced" },
      { amount: 400000, status: "planned" },
      { amount: 500000, status: "cancelled" },
    ]);
    expect(r.planned).toBe(700000);
    expect(r.remaining).toBe(300000);
    expect(r.exceeds).toBe(false);
  });

  it("วางแผนเกินมูลค่าสัญญา → ติดธง", () => {
    const r = billingPlanTotals(1000000, [
      { amount: 700000, status: "planned" },
      { amount: 400000, status: "planned" },
    ]);
    expect(r.remaining).toBe(-100000);
    expect(r.exceeds).toBe(true);
  });

  it("ยังไม่มีสัญญา → ไม่บอกยอดคงเหลือ (null) และไม่ฟ้องว่าเกิน", () => {
    const r = billingPlanTotals(null, [{ amount: 400000, status: "planned" }]);
    expect(r.remaining).toBeNull();
    expect(r.exceeds).toBe(false);
  });

  it("แปลง % ของสัญญาเป็นจำนวนเงิน", () => {
    expect(billingAmountFromPercent(1000000, 30)).toBe(300000);
    expect(billingAmountFromPercent(null, 30)).toBeNull();
    expect(billingAmountFromPercent(1000000, null)).toBeNull();
  });
});

describe("VAT ของเอกสารที่จะออก", () => {
  it("กิจการจด VAT → แตกฐาน/VAT/รวม ที่ 7%", () => {
    expect(documentVatBreakdown(100000, true)).toEqual({
      base: 100000,
      vat: 7000,
      total: 107000,
      vat_rate_pct: 7,
    });
  });

  it("กิจการไม่จด VAT → ไม่มี VAT และยอดรวมเท่าฐาน", () => {
    expect(documentVatBreakdown(100000, false)).toEqual({
      base: 100000,
      vat: 0,
      total: 100000,
      vat_rate_pct: 0,
    });
  });

  it("ยังไม่มียอด → null ไม่ใช่ 0", () => {
    expect(documentVatBreakdown(null, true)).toBeNull();
    expect(documentVatBreakdown(undefined, false)).toBeNull();
  });

  it("ปัดสองตำแหน่งไม่ให้เพี้ยนจากจุดลอย", () => {
    expect(documentVatBreakdown(1234.56, true)).toEqual({
      base: 1234.56,
      vat: 86.42,
      total: 1320.98,
      vat_rate_pct: 7,
    });
  });

  it("อัตราที่ส่งมาไม่สมเหตุผล → กลับไปใช้ 7%", () => {
    expect(documentVatBreakdown(100, true, 0)?.vat).toBe(7);
    expect(documentVatBreakdown(100, true, Number.NaN)?.vat).toBe(7);
    expect(documentVatBreakdown(100, true, 10)?.vat).toBe(10);
  });

  it("ฐานของงวด: ไม่หักเงินประกัน = ยอดเต็ม · หัก = ลดลงตามที่หัก", () => {
    expect(billingInvoiceBase(300000, 15000, "note")).toBe(300000);
    expect(billingInvoiceBase(300000, 15000, "discount")).toBe(285000);
    expect(billingInvoiceBase(300000, null, "discount")).toBe(300000);
    expect(billingInvoiceBase(null, 15000, "note")).toBeNull();
  });
});

describe("เตือนราคาซื้อขยับ", () => {
  it("ยังไม่เคยรับทราบฐาน → ไม่เตือน (ไม่ใช่ขยับ 100%)", () => {
    expect(costDrift(12, null, 10)).toEqual({ pct: null, alert: false });
  });

  it("ขยับเกินเกณฑ์ → เตือน (ทั้งขึ้นและลง)", () => {
    expect(costDrift(11.5, 10, 10).alert).toBe(true);
    expect(costDrift(8.5, 10, 10).alert).toBe(true);
    expect(costDrift(10.5, 10, 10).alert).toBe(false);
  });

  it("ฐานเป็น 0 → ไม่หารศูนย์", () => {
    expect(costDrift(10, 0, 10)).toEqual({ pct: null, alert: false });
  });
});

describe("ต้นทุนวัสดุที่ใช้จริง", () => {
  it("โหมด auto ใช้ต้นทุนเฉลี่ยจากคลัง", () => {
    expect(
      effectiveMaterialCost({
        material_cost_mode: "auto",
        material_unit_cost_manual: 99,
        avg_cost: 11,
      }),
    ).toBe(11);
  });

  it("โหมด manual ใช้ค่าที่ตั้งไว้ ไม่สนคลัง", () => {
    expect(
      effectiveMaterialCost({
        material_cost_mode: "manual",
        material_unit_cost_manual: 99,
        avg_cost: 11,
      }),
    ).toBe(99);
  });

  it("คลังยังไม่มีต้นทุน → null (ห้ามคิดราคาขายจากทุน 0)", () => {
    expect(
      effectiveMaterialCost({
        material_cost_mode: "auto",
        material_unit_cost_manual: null,
        avg_cost: null,
      }),
    ).toBeNull();
    expect(
      effectiveMaterialCost({ material_cost_mode: "manual", material_unit_cost_manual: null }),
    ).toBeNull();
  });
});

describe("รวมข้ามโครงการ", () => {
  const mk = (
    status: ProjectStatus,
    contract: number | null,
    budget: number | null,
    actual: number,
    over = false,
  ) => ({
    status,
    summary: {
      contract_amount: contract,
      budget_cost: budget,
      actual_cost: actual,
      actual_counted: 1,
      committed_cost: 0,
      progress_pct: null,
      forecast_cost: null,
      forecast_profit: null,
      forecast_margin_pct: null,
      actual_profit: null,
      cost_variance: null,
      billed_amount: 0,
      unbilled_amount: contract,
      over_budget: over,
    },
  });

  it("ตัดโครงการที่ยกเลิก/ไม่ได้งานออกจากทุกยอด", () => {
    const r = summarizePortfolio([
      mk("in_progress", 1000000, 700000, 250000),
      mk("lost", 5000000, 4000000, 0),
      mk("cancelled", 9000000, 8000000, 0),
    ]);
    expect(r.projects_counted).toBe(1);
    expect(r.contract_total).toBe(1000000);
    expect(r.actual_total).toBe(250000);
  });

  it("ไม่มีโครงการที่มีสัญญาเลย → ยอดรวมเป็น null ไม่ใช่ 0", () => {
    const r = summarizePortfolio([mk("survey", null, null, 0)]);
    expect(r.contract_total).toBeNull();
    expect(r.budget_total).toBeNull();
    expect(r.actual_total).toBe(0);
  });

  it("นับจำนวนโครงการที่ใช้เกินงบ", () => {
    const r = summarizePortfolio([
      mk("in_progress", 1000000, 700000, 900000, true),
      mk("in_progress", 500000, 400000, 100000, false),
    ]);
    expect(r.over_budget_count).toBe(1);
  });
});

describe("ตัวช่วยพื้นฐาน", () => {
  it("sumDefined: ไม่มีค่าเลย → null", () => {
    expect(sumDefined([null, undefined])).toBeNull();
    expect(sumDefined([])).toBeNull();
  });

  it("sumDefined: ข้ามค่าที่ไม่มี แต่ 0 ต้องนับ", () => {
    expect(sumDefined([10, null, 0, 5])).toBe(15);
  });
});
