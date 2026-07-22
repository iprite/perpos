import { describe, it, expect } from "vitest";
import {
  parseCatalogPaste,
  parseCatalogCsv,
  parseQty,
  splitColumns,
  toArabicDigits,
} from "./catalog-parse";

/** ข้อความ paste จำลอง 84 บรรทัด (คั่นด้วย 2+ ช่องว่าง) */
function build84Lines(): string {
  return Array.from(
    { length: 84 },
    (_, i) => `สินค้าทดสอบรายการที่ ${i + 1}   ${i + 1}  แพ็ค`,
  ).join("\n");
}

describe("parseCatalogPaste", () => {
  it("แยก 84 บรรทัดได้ครบ + seq_no ไล่ 1..84", () => {
    const r = parseCatalogPaste(build84Lines());
    expect(r.rows).toHaveLength(84);
    expect(r.issues).toHaveLength(0);
    expect(r.totalLines).toBe(84);
    expect(r.rows[0]).toMatchObject({ seq_no: 1, qty: 1, unit: "แพ็ค" });
    expect(r.rows[83]).toMatchObject({ seq_no: 84, qty: 84, unit: "แพ็ค" });
  });

  it("บรรทัดที่แยกไม่ได้ถูกคืนใน issues (ไม่ทิ้งเงียบ) และไม่กิน seq_no", () => {
    const text = [
      "ปากกาเจล Pentel BLN-105\t12\tด้าม",
      "รายการที่ไม่มีจำนวนเลย",
      "กระดาษโน้ต Post-it 3M   5   แพ็ค",
    ].join("\n");
    const r = parseCatalogPaste(text);

    expect(r.rows).toHaveLength(2);
    expect(r.issues).toHaveLength(1);
    expect(r.issues[0].lineNo).toBe(2);
    expect(r.issues[0].raw).toBe("รายการที่ไม่มีจำนวนเลย");
    expect(r.rows.map((x) => x.seq_no)).toEqual([1, 2]);
  });

  it("รองรับ TAB, เลขไทย, คอมมาหลักพัน, และเลขลำดับหน้าบรรทัด", () => {
    const text = ["1. แฟ้มสันกว้าง Horse No.22\t๑๒\tเล่ม", "2) เทียนพรรษา   1,200   เล่ม"].join(
      "\n",
    );
    const r = parseCatalogPaste(text);
    expect(r.issues).toHaveLength(0);
    expect(r.rows[0]).toMatchObject({
      name: "แฟ้มสันกว้าง Horse No.22",
      qty: 12,
      unit: "เล่ม",
    });
    expect(r.rows[1]).toMatchObject({ name: "เทียนพรรษา", qty: 1200, unit: "เล่ม" });
  });

  it("บรรทัดเดียวช่องว่างเดียว → อ่านจำนวน/หน่วยท้ายบรรทัดได้", () => {
    const r = parseCatalogPaste("ปากกาลูกลื่น 24 ด้าม");
    expect(r.issues).toHaveLength(0);
    expect(r.rows[0]).toMatchObject({ name: "ปากกาลูกลื่น", qty: 24, unit: "ด้าม" });
  });

  it("บรรทัดว่างถูกข้ามเงียบ (ไม่นับเป็น issue)", () => {
    const r = parseCatalogPaste("\n\nสินค้า A   1   ชิ้น\n\n");
    expect(r.rows).toHaveLength(1);
    expect(r.issues).toHaveLength(0);
    expect(r.totalLines).toBe(1);
  });

  it("startSeq ต่อท้ายรายการเดิมได้", () => {
    const r = parseCatalogPaste("สินค้า A   1   ชิ้น", { startSeq: 85 });
    expect(r.rows[0].seq_no).toBe(85);
  });
});

describe("parseCatalogCsv", () => {
  it("ข้าม header + แยกคอลัมน์ ชื่อ/จำนวน/หน่วย", () => {
    const csv = ["ชื่อสินค้า,จำนวน,หน่วย", '"ปากกา, สีน้ำเงิน",12,ด้าม', "ยางลบ,5,ก้อน"].join("\n");
    const r = parseCatalogCsv(csv);
    expect(r.rows).toHaveLength(2);
    expect(r.rows[0]).toMatchObject({ name: "ปากกา, สีน้ำเงิน", qty: 12, unit: "ด้าม" });
    expect(r.issues).toHaveLength(0);
  });
});

describe("helpers", () => {
  it("parseQty รองรับคอมมา/เลขไทย และปฏิเสธข้อความ", () => {
    expect(parseQty("1,200")).toBe(1200);
    expect(parseQty("๑๒")).toBe(12);
    expect(parseQty("สิบสอง")).toBeNull();
  });

  it("splitColumns ใช้ TAB ก่อน แล้วค่อย 2+ ช่องว่าง", () => {
    expect(splitColumns("a\tb\tc")).toEqual(["a", "b", "c"]);
    expect(splitColumns("a   b  c")).toEqual(["a", "b", "c"]);
    expect(splitColumns("a b c")).toEqual(["a b c"]);
  });

  it("toArabicDigits แปลงเลขไทย", () => {
    expect(toArabicDigits("๐๑๒๓๔๕๖๗๘๙")).toBe("0123456789");
  });
});
