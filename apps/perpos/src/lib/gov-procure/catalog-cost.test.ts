import { describe, it, expect } from "vitest";
import {
  estimateCost,
  estimateJobCost,
  chunkCount,
  formatThb,
  CHUNK_SIZE,
  MAX_ITEMS_PER_JOB,
  MAX_ACTIVE_JOBS_PER_ORG,
  DAILY_TOKEN_BUDGET,
  MAX_TOKENS,
  type CatalogPricing,
} from "./catalog-cost";

// เรตคงที่สำหรับเทส math (ไม่พึ่ง env)
const P: CatalogPricing = {
  inputUsdPerMTok: 0.3,
  outputUsdPerMTok: 2.5,
  usdThbRate: 36,
};

describe("estimateCost", () => {
  it("คิด input/output แยกเรต แล้วแปลงเป็นบาท", () => {
    // 1,000,000 in → $0.30 · 1,000,000 out → $2.50 → รวม $2.80 × 36 = ฿100.80
    const c = estimateCost(1_000_000, 1_000_000, P);
    expect(c.usd).toBeCloseTo(2.8, 10);
    expect(c.thb).toBeCloseTo(100.8, 10);
  });

  it("ค่าติดลบ/NaN ถูกปัดเป็น 0 (ไม่คืนต้นทุนติดลบ)", () => {
    const c = estimateCost(-500, Number.NaN, P);
    expect(c.inputTokens).toBe(0);
    expect(c.outputTokens).toBe(0);
    expect(c.usd).toBe(0);
    expect(c.thb).toBe(0);
  });
});

describe("chunkCount", () => {
  it("84 รายการ chunk ละ 8 = 11 call", () => {
    expect(chunkCount(84)).toBe(11);
    expect(chunkCount(8)).toBe(1);
    expect(chunkCount(0)).toBe(0);
  });
});

describe("estimateJobCost", () => {
  it("ชุด 84 รายการ ≈ ฿4 (ตาม C6 — ~฿4.1)", () => {
    const c = estimateJobCost(84, P);
    expect(c.thb).toBeGreaterThan(3);
    expect(c.thb).toBeLessThan(6);
  });
});

describe("ค่าคงที่เพดาน (A-8)", () => {
  it("ตรงกับ contract", () => {
    expect(MAX_ITEMS_PER_JOB).toBe(300);
    expect(MAX_ACTIVE_JOBS_PER_ORG).toBe(2);
    expect(DAILY_TOKEN_BUDGET).toBe(1_500_000);
    expect(CHUNK_SIZE).toBe(8);
    expect(MAX_TOKENS).toBe(8000);
  });
});

describe("formatThb", () => {
  it("รูปแบบไทย 2 ตำแหน่ง + สัญลักษณ์บาท", () => {
    expect(formatThb(4.0712)).toBe("4.07 ฿");
    expect(formatThb(Number.NaN)).toBe("0.00 ฿");
  });
});
