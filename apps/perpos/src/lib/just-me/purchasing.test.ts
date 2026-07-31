/**
 * เทสจัดซื้อ — กฎที่ "ผิดแล้วเสียเงินจริง"
 *  1. ยอดสั่งซื้อสะสมเทียบปริมาณใน BOQ (สั่งเกินโดยไม่มีใครรู้ = ต้นทุนบานปลาย)
 *  2. สถานะรับของ (บอกว่ารับครบทั้งที่ยังขาด = จ่ายเงินผู้ขายเกิน)
 *  3. ยอดหัวใบขอซื้อ/ใบเสนอราคา (ยอดผิด = เทียบราคาผิดเจ้า)
 */

import { describe, expect, it } from "vitest";
import { buildPrItemRow, findBoqOverages, overageMessage, receiveStatus } from "./purchasing";
import { prTotals, quoteTotal } from "./project-metrics";

const boq = new Map([
  ["b1", { qty: 100, name: "สายไฟ THW 2.5" }],
  ["b2", { qty: 10, name: "กล้อง CCTV" }],
]);

describe("findBoqOverages — ยอด PR ต่อบรรทัด BOQ", () => {
  it("สั่งพอดี/น้อยกว่าที่ถอดไว้ → ไม่มีรายการเกิน", () => {
    expect(findBoqOverages([{ boq_item_id: "b1", qty: 100 }], boq, new Map())).toEqual([]);
    expect(findBoqOverages([{ boq_item_id: "b1", qty: 40 }], boq, new Map([["b1", 60]]))).toEqual(
      [],
    );
  });

  it("นับรวมกับใบก่อนหน้าที่ยังไม่ยกเลิก แล้วบอกยอดที่เกิน", () => {
    const over = findBoqOverages([{ boq_item_id: "b1", qty: 30 }], boq, new Map([["b1", 90]]));
    expect(over).toHaveLength(1);
    expect(over[0]).toMatchObject({
      boq_item_id: "b1",
      boq_qty: 100,
      ordered_qty: 90,
      requested_qty: 30,
      over_qty: 20,
    });
    expect(overageMessage(over)).toContain("เกิน 20");
  });

  it("รวมหลายบรรทัดของ boq_item เดียวกันในใบเดียว ก่อนเทียบ", () => {
    const over = findBoqOverages(
      [
        { boq_item_id: "b2", qty: 6 },
        { boq_item_id: "b2", qty: 6 },
      ],
      boq,
      new Map(),
    );
    expect(over).toHaveLength(1);
    expect(over[0].over_qty).toBeCloseTo(2);
  });

  it("บรรทัดที่ไม่ผูก BOQ (ซื้อเข้าคลังกลาง) ไม่อยู่ในกฎนี้", () => {
    expect(findBoqOverages([{ boq_item_id: null, qty: 999 }], boq, new Map())).toEqual([]);
  });
});

describe("receiveStatus — สถานะหลังรับของ (คิดจากบรรทัดจริง)", () => {
  it("ยังไม่ได้รับอะไรเลย → null (คงสถานะเดิม)", () => {
    expect(receiveStatus([{ qty: 10, received_qty: 0 }])).toBeNull();
  });

  it("ได้บางส่วน → partially_received", () => {
    expect(
      receiveStatus([
        { qty: 10, received_qty: 10 },
        { qty: 5, received_qty: 0 },
      ]),
    ).toBe("partially_received");
  });

  it("ครบทุกบรรทัด → received", () => {
    expect(
      receiveStatus([
        { qty: 10, received_qty: 10 },
        { qty: 5, received_qty: 5 },
      ]),
    ).toBe("received");
  });

  it("ไม่มีบรรทัดเลย → null (ห้ามบอกว่ารับครบ)", () => {
    expect(receiveStatus([])).toBeNull();
  });
});

describe("buildPrItemRow", () => {
  const base = { name: "สายไฟ", unit: "เมตร" };

  it("ตัดช่องว่าง + คงค่าที่ผูกกลับ BOQ", () => {
    const res = buildPrItemRow({
      ...base,
      name: "  สายไฟ  ",
      qty: "25",
      estimated_unit_cost: "12.5",
      boq_item_id: "b1",
    });
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.row.name).toBe("สายไฟ");
    expect(res.row.qty).toBe(25);
    expect(res.row.estimated_unit_cost).toBe(12.5);
    expect(res.row.boq_item_id).toBe("b1");
  });

  it("ไม่ได้กรอกราคาประเมิน → null (ไม่ใช่ 0)", () => {
    const res = buildPrItemRow({ ...base, qty: 1, estimated_unit_cost: "" });
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.row.estimated_unit_cost).toBeNull();
  });

  it("ปฏิเสธปริมาณ/ชื่อ/หน่วย/ราคาที่ผิด", () => {
    expect(buildPrItemRow({ ...base, qty: 0 }).ok).toBe(false);
    expect(buildPrItemRow({ ...base, qty: -3 }).ok).toBe(false);
    expect(buildPrItemRow({ ...base, name: " ", qty: 1 }).ok).toBe(false);
    expect(buildPrItemRow({ ...base, unit: "", qty: 1 }).ok).toBe(false);
    expect(buildPrItemRow({ ...base, qty: 1, estimated_unit_cost: -1 }).ok).toBe(false);
  });
});

describe("ยอดเงินของจัดซื้อ (project-metrics)", () => {
  it("prTotals คิดจากบรรทัด — ไม่มีราคาที่เลือกเลย → null ไม่ใช่ 0", () => {
    const totals = prTotals([
      { qty: 10, estimated_unit_cost: 12.5, selected_unit_cost: null },
      { qty: 2, estimated_unit_cost: 100, selected_unit_cost: null },
    ]);
    expect(totals.total_estimated_cost).toBe(325);
    expect(totals.total_selected_cost).toBeNull();
  });

  it("prTotals นับเฉพาะบรรทัดที่มีราคา", () => {
    const totals = prTotals([
      { qty: 10, estimated_unit_cost: 10, selected_unit_cost: 9 },
      { qty: 5, estimated_unit_cost: null, selected_unit_cost: null },
    ]);
    expect(totals.total_estimated_cost).toBe(100);
    expect(totals.total_selected_cost).toBe(90);
  });

  it("quoteTotal — ยังไม่กรอกราคาเลย → null", () => {
    expect(quoteTotal([{ unit_cost: null, qty: 5 }])).toBeNull();
    expect(
      quoteTotal([
        { unit_cost: 10, qty: 5 },
        { unit_cost: null, qty: 5 },
      ]),
    ).toBe(50);
  });
});
