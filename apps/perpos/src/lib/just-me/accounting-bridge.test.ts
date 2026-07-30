import { describe, expect, it } from "vitest";
import {
  buildInvoicePayload,
  buildQuotationPayload,
  payloadSubtotal,
  type AccDocumentPayload,
} from "./accounting-bridge";

/** คีย์ต้นทุน/กำไรที่ **ห้าม** ปรากฏในเอกสารที่ส่งให้ลูกค้าเด็ดขาด */
const FORBIDDEN = [
  "material_unit_cost",
  "labor_unit_cost",
  "overhead_unit_cost",
  "cost_amount",
  "margin_pct",
  "margin_source",
  "unit_cost",
  "budget_cost",
  "total_cost",
];

function assertNoCostLeak(payload: AccDocumentPayload) {
  const json = JSON.stringify(payload);
  for (const key of FORBIDDEN) expect(json).not.toContain(key);
}

const project = { project_code: "JM-2569-001", name: "ติดตั้งระบบไฟฟ้าอาคาร A" };
const boq = { revision_no: 2, title: "ฉบับส่งลูกค้า" };

const items = [
  {
    name: "สายไฟ THW 2.5",
    unit: "เมตร",
    qty: 100,
    unit_price: 24,
    amount: 2400,
    cost_amount: 2000,
    material_unit_cost: 20,
    labor_unit_cost: 0,
    overhead_unit_cost: 0,
    margin_pct: 20,
    margin_source: "company" as const,
    category_id: "cat-elec",
    sort_order: 1,
  },
  {
    name: "เบรกเกอร์ 32A",
    unit: "ตัว",
    qty: 4,
    unit_price: 550,
    amount: 2200,
    cost_amount: 1800,
    material_unit_cost: 450,
    labor_unit_cost: 0,
    overhead_unit_cost: 0,
    margin_pct: 22.2,
    margin_source: "item" as const,
    category_id: "cat-elec",
    sort_order: 2,
  },
  {
    name: "ค่าแรงติดตั้งกล้อง",
    unit: "จุด",
    qty: 8,
    unit_price: 900,
    amount: 7200,
    cost_amount: 6000,
    material_unit_cost: 0,
    labor_unit_cost: 750,
    overhead_unit_cost: 0,
    margin_pct: 20,
    margin_source: "category" as const,
    category_id: "cat-cctv",
    sort_order: 3,
  },
  {
    name: "ค่าขนส่งหน้างาน",
    unit: "งาน",
    qty: 1,
    unit_price: 1500,
    amount: 1500,
    cost_amount: 1200,
    material_unit_cost: 0,
    labor_unit_cost: 0,
    overhead_unit_cost: 1200,
    margin_pct: 25,
    margin_source: "project" as const,
    category_id: null,
    sort_order: 4,
  },
];

const TOTAL = 2400 + 2200 + 7200 + 1500; // 13,300

const baseOpts = {
  orgId: "org-1",
  contactId: "contact-1",
  issueDate: "2026-08-01",
  vatEnabled: true,
  categoryNames: new Map([
    ["cat-elec", "งานระบบไฟฟ้า"],
    ["cat-cctv", "งาน CCTV"],
  ]),
};

describe("buildQuotationPayload", () => {
  it("default = สรุปตามหมวดงาน · ยอดรวมเท่ากับ Σ amount ของ BOQ", () => {
    const payload = buildQuotationPayload(project, boq, items, baseOpts);
    expect(payload.doc_type).toBe("quotation");
    expect(payload.lines).toHaveLength(3); // ไฟฟ้า / CCTV / ไม่มีหมวด
    expect(payload.lines.map((l) => l.item_name)).toEqual([
      "งานระบบไฟฟ้า",
      "งาน CCTV",
      "งานอื่น ๆ",
    ]);
    expect(payload.lines[0].unit_price).toBe(4600);
    expect(payload.lines.every((l) => l.qty === 1)).toBe(true);
    expect(payloadSubtotal(payload)).toBe(TOTAL);
  });

  it("โหมด item = บรรทัดต่อรายการ · ยอดรวมยังเท่าเดิม", () => {
    const payload = buildQuotationPayload(project, boq, items, {
      ...baseOpts,
      groupBy: "item",
    });
    expect(payload.lines).toHaveLength(items.length);
    expect(payload.lines[0]).toMatchObject({ item_name: "สายไฟ THW 2.5", qty: 100, unit: "เมตร" });
    expect(payloadSubtotal(payload)).toBe(TOTAL);
  });

  it("ไม่มีคอลัมน์ต้นทุน/margin หลุดออกไปทั้งสองโหมด", () => {
    assertNoCostLeak(buildQuotationPayload(project, boq, items, baseOpts));
    assertNoCostLeak(buildQuotationPayload(project, boq, items, { ...baseOpts, groupBy: "item" }));
  });

  it("หมวดที่ไม่รู้จักชื่อ → ใช้ป้าย 'งานอื่น ๆ' (ไม่ใช่ id ดิบ)", () => {
    const payload = buildQuotationPayload(project, boq, items, {
      ...baseOpts,
      categoryNames: new Map(),
    });
    expect(payload.lines.every((l) => l.item_name === "งานอื่น ๆ")).toBe(true);
    expect(payloadSubtotal(payload)).toBe(TOTAL);
  });

  it("BOQ ว่าง → โยน error ภาษาไทย (ห้ามออกเอกสารเปล่า)", () => {
    expect(() => buildQuotationPayload(project, boq, [], baseOpts)).toThrow(/ยังไม่มีรายการ/);
  });

  it("อ้างอิงเลข revision + รหัสโครงการไว้ในหมายเหตุ", () => {
    const payload = buildQuotationPayload(project, boq, items, baseOpts);
    expect(payload.note).toContain("BOQ ฉบับที่ 2");
    expect(payload.note).toContain("JM-2569-001");
  });
});

const billing = {
  seq: 2,
  title: "งวดที่ 2 — เดินท่อร้อยสายเสร็จ",
  amount: 400_000,
  retention_amount: 20_000,
  percent_of_contract: 40,
  due_date: "2026-09-15",
};

describe("buildInvoicePayload", () => {
  it("1 งวด = 1 บรรทัด · ยอดตรงกับยอดงวด · default = ใบแจ้งหนี้", () => {
    const payload = buildInvoicePayload(project, billing, baseOpts);
    expect(payload.doc_type).toBe("invoice");
    expect(payload.lines).toHaveLength(1);
    expect(payload.lines[0].unit_price).toBe(400_000);
    expect(payloadSubtotal(payload)).toBe(400_000);
    expect(payload.due_date).toBe("2026-09-15");
  });

  it("retention โหมด note = ไม่ลดยอด แต่ต้องเขียนไว้ในหมายเหตุ", () => {
    const payload = buildInvoicePayload(project, billing, baseOpts);
    expect(payload.lines[0].discount).toBe(0);
    expect(payloadSubtotal(payload)).toBe(400_000);
    expect(payload.note).toContain("ยังไม่ได้หัก");
  });

  it("retention โหมด discount = หักออกจากยอดผ่านช่องส่วนลด", () => {
    const payload = buildInvoicePayload(project, billing, {
      ...baseOpts,
      retentionMode: "discount",
    });
    expect(payload.lines[0].discount).toBe(20_000);
    expect(payload.lines[0].discount_type).toBe("amount");
    expect(payloadSubtotal(payload)).toBe(380_000);
  });

  it("retention มากกว่ายอดงวด (โหมด discount) → ปฏิเสธ", () => {
    expect(() =>
      buildInvoicePayload(
        project,
        { ...billing, retention_amount: 500_000 },
        { ...baseOpts, retentionMode: "discount" },
      ),
    ).toThrow(/เงินประกันผลงาน/);
  });

  it("งวดที่ยอดเป็น 0 → ออกเอกสารไม่ได้", () => {
    expect(() => buildInvoicePayload(project, { ...billing, amount: 0 }, baseOpts)).toThrow(
      /ยังไม่มียอดเงิน/,
    );
  });

  it("ออกเป็นใบกำกับภาษีได้เมื่อผู้ใช้เลือก · ไม่มีต้นทุนหลุด", () => {
    const payload = buildInvoicePayload(project, billing, {
      ...baseOpts,
      docType: "tax_invoice",
    });
    expect(payload.doc_type).toBe("tax_invoice");
    assertNoCostLeak(payload);
  });

  it("ไม่มีชื่องวด → ใช้ 'งวดที่ N' แทน", () => {
    const payload = buildInvoicePayload(project, { ...billing, title: null }, baseOpts);
    expect(payload.lines[0].item_name).toBe("งวดที่ 2");
  });
});
