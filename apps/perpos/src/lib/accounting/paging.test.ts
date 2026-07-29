import { describe, expect, it } from "vitest";
import { fetchAllRows } from "./paging";

/** จำลอง PostgREST: ตอบตามช่วง range ที่ขอ จากชุดข้อมูลจำลอง */
function fakeTable(total: number) {
  const all = Array.from({ length: total }, (_, i) => ({ id: i }));
  const calls: Array<[number, number]> = [];
  const page = (from: number, to: number) => {
    calls.push([from, to]);
    return Promise.resolve({ data: all.slice(from, to + 1), error: null });
  };
  return { page, calls };
}

describe("fetchAllRows — ยอดรวมต้องไม่หายเงียบจาก max-rows ของ PostgREST", () => {
  it("ดึงครบทุกแถวเมื่อข้อมูลเกินหนึ่งก้อน", async () => {
    const t = fakeTable(2_500);
    const { rows, truncated } = await fetchAllRows(t.page, { chunkSize: 1_000 });
    expect(rows).toHaveLength(2_500);
    expect(truncated).toBe(false);
    expect(t.calls).toEqual([
      [0, 999],
      [1000, 1999],
      [2000, 2999],
    ]);
  });

  it("หยุดทันทีเมื่อก้อนสุดท้ายไม่เต็ม (ไม่ยิง query เกินจำเป็น)", async () => {
    const t = fakeTable(10);
    const { rows } = await fetchAllRows(t.page, { chunkSize: 1_000 });
    expect(rows).toHaveLength(10);
    expect(t.calls).toHaveLength(1);
  });

  it("ข้อมูลพอดีขอบก้อน → ยิงเพิ่มอีกรอบแล้วจบ", async () => {
    const t = fakeTable(1_000);
    const { rows, truncated } = await fetchAllRows(t.page, { chunkSize: 1_000 });
    expect(rows).toHaveLength(1_000);
    expect(truncated).toBe(false);
    expect(t.calls).toHaveLength(2);
  });

  it("ชนเพดาน maxRows → บอก truncated (ห้ามกลืนเงียบ)", async () => {
    const t = fakeTable(5_000);
    const { rows, truncated } = await fetchAllRows(t.page, { chunkSize: 1_000, maxRows: 2_000 });
    expect(rows).toHaveLength(2_000);
    expect(truncated).toBe(true);
  });

  it("query error → throw (ห้ามคืนยอดที่ขาดแถว)", async () => {
    await expect(
      fetchAllRows(() => Promise.resolve({ data: null, error: { message: "boom" } })),
    ).rejects.toThrow("boom");
  });
});
