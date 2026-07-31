import { describe, expect, it } from "vitest";
import {
  buildAdjustments,
  lineDiff,
  summarizeStockCount,
  type JustMeStockCountItem,
} from "./stock-count";

function line(p: Partial<JustMeStockCountItem> & { item_id: string }): JustMeStockCountItem {
  return {
    id: p.id ?? `l-${p.item_id}`,
    org_id: "org",
    count_id: "count",
    item_id: p.item_id,
    system_qty: p.system_qty ?? 0,
    counted_qty: p.counted_qty ?? null,
    note: p.note ?? null,
  };
}

describe("lineDiff", () => {
  it("ยังไม่ได้นับ (null) ≠ นับได้ 0", () => {
    expect(lineDiff({ system_qty: 10, counted_qty: null })).toBeNull();
    expect(lineDiff({ system_qty: 10, counted_qty: 0 })).toBe(-10);
  });

  it("ของขาดเป็นลบ ของเกินเป็นบวก", () => {
    expect(lineDiff({ system_qty: 10, counted_qty: 7 })).toBe(-3);
    expect(lineDiff({ system_qty: 10, counted_qty: 12 })).toBe(2);
  });

  it("เศษทศนิยมจิ๋วถือว่าตรงกัน (ไม่สร้างรายการปรับยอดขยะ)", () => {
    expect(lineDiff({ system_qty: 10, counted_qty: 10.00001 })).toBe(0);
  });
});

describe("summarizeStockCount", () => {
  const lines = [
    line({ item_id: "a", system_qty: 10, counted_qty: 7 }), // ขาด 3
    line({ item_id: "b", system_qty: 5, counted_qty: 8 }), // เกิน 3
    line({ item_id: "c", system_qty: 4, counted_qty: 4 }), // ตรง
    line({ item_id: "d", system_qty: 9, counted_qty: null }), // ยังไม่นับ
  ];

  it("นับบรรทัดที่นับแล้ว/ที่ต่าง แยกของขาดกับของเกิน", () => {
    const s = summarizeStockCount(lines, new Map());
    expect(s.totalLines).toBe(4);
    expect(s.countedLines).toBe(3);
    expect(s.diffLines).toBe(2);
    expect(s.shortageQty).toBe(3);
    expect(s.surplusQty).toBe(3);
  });

  it("มูลค่าผลต่างใช้ต้นทุนเฉลี่ยต่อวัสดุ", () => {
    const s = summarizeStockCount(
      lines,
      new Map([
        ["a", 100],
        ["b", 50],
      ]),
    );
    expect(s.diffValue).toBe(-150); // -3*100 + 3*50
  });

  it("ไม่รู้ต้นทุนเลย → มูลค่าเป็น null ไม่ใช่ 0", () => {
    expect(summarizeStockCount(lines, new Map()).diffValue).toBeNull();
    expect(summarizeStockCount(lines).diffValue).toBeNull();
  });

  it("ไม่มีบรรทัดที่ต่าง → มูลค่าเป็น null", () => {
    const s = summarizeStockCount(
      [line({ item_id: "a", system_qty: 3, counted_qty: 3 })],
      new Map([["a", 10]]),
    );
    expect(s.diffLines).toBe(0);
    expect(s.diffValue).toBeNull();
  });
});

describe("buildAdjustments", () => {
  it("ผลต่าง + = รับเข้า · − = เบิกออก และข้ามบรรทัดที่ยังไม่นับ/ตรงกัน", () => {
    const res = buildAdjustments([
      line({ item_id: "a", system_qty: 10, counted_qty: 7, note: "ของหายที่ไซต์" }),
      line({ item_id: "b", system_qty: 5, counted_qty: 8, note: "เจอของในตู้" }),
      line({ item_id: "c", system_qty: 4, counted_qty: 4 }),
      line({ item_id: "d", system_qty: 9, counted_qty: null }),
    ]);
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.adjustments).toHaveLength(2);
    expect(res.adjustments[0]).toMatchObject({ type: "issue", qty: 3, itemId: "a" });
    expect(res.adjustments[1]).toMatchObject({ type: "receive", qty: 3, itemId: "b" });
  });

  it("ผลต่าง ≠ 0 แต่ไม่มีเหตุผล → บล็อกพร้อมชื่อรายการ", () => {
    const res = buildAdjustments(
      [line({ item_id: "a", system_qty: 10, counted_qty: 7 })],
      () => "สายไฟ THW 2.5",
    );
    expect(res.ok).toBe(false);
    if (res.ok) return;
    expect(res.error).toContain("สายไฟ THW 2.5");
  });

  it("ไม่มีรายการที่ต่างเลย → ไม่ต้องลงบัญชี", () => {
    const res = buildAdjustments([line({ item_id: "a", system_qty: 4, counted_qty: 4 })]);
    expect(res.ok).toBe(false);
  });
});
