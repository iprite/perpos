/**
 * เทสของ `compareVendorQuotes` — ตัวเลขที่ AI เอาไปเรียบเรียง ต้องถูกก่อน
 * กฎที่คุมไว้: ไม่มีราคา = ข้าม (ไม่ตีเป็น 0) · เทียบไม่ได้ = null · ไม่ตัดสินใจแทนคน
 */

import { describe, expect, it } from "vitest";
import { compareVendorQuotes } from "./project-metrics";

const items = [
  { id: "i1", name: "สายไฟ THW 2.5", unit: "ม.", qty: 100 },
  { id: "i2", name: "เบรกเกอร์ 32A", unit: "ตัว", qty: 4 },
];

const quotes = [
  {
    id: "q1",
    vendor_name: "ร้าน ก",
    status: "received",
    total_amount: 1200,
    delivery_days: 3,
    credit_terms: "เครดิต 30 วัน",
  },
  {
    id: "q2",
    vendor_name: "ร้าน ข",
    status: "received",
    total_amount: 1000,
    delivery_days: 14,
    credit_terms: null,
  },
];

describe("compareVendorQuotes", () => {
  it("หาเจ้าที่ถูกสุดรายบรรทัดและภาพรวม + ส่วนต่าง", () => {
    const res = compareVendorQuotes({
      items,
      quotes,
      quoteItems: [
        { quote_id: "q1", pr_item_id: "i1", unit_cost: 10 },
        { quote_id: "q2", pr_item_id: "i1", unit_cost: 8 },
        { quote_id: "q1", pr_item_id: "i2", unit_cost: 50 },
        { quote_id: "q2", pr_item_id: "i2", unit_cost: 55 },
      ],
    });

    expect(res.cheapest_vendor_name).toBe("ร้าน ข");
    expect(res.cheapest_total).toBe(1000);
    expect(res.total_spread).toBe(200);

    const wire = res.lines.find((l) => l.pr_item_id === "i1")!;
    expect(wire.cheapest_vendor_name).toBe("ร้าน ข");
    expect(wire.cheapest_unit_cost).toBe(8);
    expect(wire.spread).toBe(2);

    const byVendor = new Map(res.vendors.map((v) => [v.quote_id, v]));
    expect(byVendor.get("q1")!.cheapest_lines).toBe(1);
    expect(byVendor.get("q2")!.cheapest_lines).toBe(1);
    expect(byVendor.get("q1")!.priced_lines).toBe(2);
  });

  it("บรรทัดที่ไม่มีใครเสนอราคา → null ทุกช่อง และถูกรายงานแยก (ห้ามตีเป็น 0)", () => {
    const res = compareVendorQuotes({
      items,
      quotes,
      quoteItems: [{ quote_id: "q1", pr_item_id: "i1", unit_cost: 10 }],
    });
    const breaker = res.lines.find((l) => l.pr_item_id === "i2")!;
    expect(breaker.cheapest_unit_cost).toBeNull();
    expect(breaker.spread).toBeNull();
    expect(res.unpriced_line_names).toEqual(["เบรกเกอร์ 32A"]);
  });

  it("มีเจ้าเดียวเสนอราคาบรรทัดนั้น → spread = null (เทียบไม่ได้ ไม่ใช่ 0)", () => {
    const res = compareVendorQuotes({
      items,
      quotes: [quotes[0]],
      quoteItems: [{ quote_id: "q1", pr_item_id: "i1", unit_cost: 10 }],
    });
    expect(res.lines[0].spread).toBeNull();
    expect(res.total_spread).toBeNull();
    expect(res.cheapest_vendor_name).toBe("ร้าน ก");
  });

  it("ไม่มีใบเสนอราคาเลย → ไม่มีเจ้าถูกสุด", () => {
    const res = compareVendorQuotes({ items, quotes: [], quoteItems: [] });
    expect(res.cheapest_quote_id).toBeNull();
    expect(res.cheapest_total).toBeNull();
    expect(res.unpriced_line_names).toHaveLength(2);
  });
});
