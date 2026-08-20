import { describe, expect, it } from "vitest";

import { parseRerankScores } from "./rerank";

/**
 * reranker ตัดสินว่า chunk ไหนเข้า prompt — ผลที่โมเดลคืนมาเชื่อไม่ได้ 100%
 * index ที่หลุดช่วงแล้วไม่กรอง = หยิบ `candidates[i]` เป็น undefined → prompt มี "undefined" ปน
 */
describe("parseRerankScores", () => {
  it("เรียงจากคะแนนมากไปน้อย", () => {
    const out = parseRerankScores(
      [
        { i: 0, score: 0.2 },
        { i: 1, score: 0.9 },
        { i: 2, score: 0.5 },
      ],
      3,
    );
    expect(out.map((s) => s.i)).toEqual([1, 2, 0]);
  });

  it("ทิ้ง index ที่หลุดช่วง / ไม่ใช่จำนวนเต็ม", () => {
    const out = parseRerankScores(
      [
        { i: 5, score: 1 },
        { i: -1, score: 1 },
        { i: 1.5, score: 1 },
        { i: 1, score: 0.4 },
      ],
      3,
    );
    expect(out).toEqual([{ i: 1, score: 0.4 }]);
  });

  it("ทิ้งคะแนนที่ไม่ใช่ตัวเลข และตัดคะแนนให้อยู่ในช่วง 0–1", () => {
    const out = parseRerankScores(
      [
        { i: 0, score: "ดีมาก" },
        { i: 1, score: 7 },
        { i: 2, score: -3 },
      ],
      3,
    );
    expect(out).toEqual([
      { i: 1, score: 1 },
      { i: 2, score: 0 },
    ]);
  });

  it("index ซ้ำเก็บชิ้นแรก (กันหยิบ chunk เดิมซ้ำเข้า context)", () => {
    const out = parseRerankScores(
      [
        { i: 0, score: 0.8 },
        { i: 0, score: 0.1 },
      ],
      2,
    );
    expect(out).toEqual([{ i: 0, score: 0.8 }]);
  });

  it("รับรูปแบบ { scores: [...] } ที่โมเดลบางครั้งห่อมาให้", () => {
    expect(parseRerankScores({ scores: [{ i: 1, score: 0.7 }] }, 2)).toEqual([
      { i: 1, score: 0.7 },
    ]);
  });

  it("ผลลัพธ์ที่ใช้ไม่ได้ → รายการว่าง (ผู้เรียกจะ fail-open ไปใช้ลำดับเดิม)", () => {
    expect(parseRerankScores(null, 3)).toEqual([]);
    expect(parseRerankScores("ไม่เกี่ยวเลย", 3)).toEqual([]);
    expect(parseRerankScores([{ nope: 1 }], 3)).toEqual([]);
  });
});
