import { describe, it, expect, afterEach } from "vitest";
import { getRecallBotUsdPerHour, recallCostUsd } from "./recall-cost";

describe("recallCostUsd", () => {
  it("1 ชม. (3600s) = rate default 0.50 USD", () => {
    expect(recallCostUsd(3600)).toBeCloseTo(0.5, 6);
  });

  it("30 นาที (1800s) = 0.25 USD", () => {
    expect(recallCostUsd(1800)).toBeCloseTo(0.25, 6);
  });

  it("0 / ติดลบ / ไม่ใช่ตัวเลข = 0", () => {
    expect(recallCostUsd(0)).toBe(0);
    expect(recallCostUsd(-100)).toBe(0);
    expect(recallCostUsd(NaN)).toBe(0);
    expect(recallCostUsd(Infinity)).toBe(0);
  });
});

describe("getRecallBotUsdPerHour (env fallback)", () => {
  const saved = { ...process.env };
  afterEach(() => {
    process.env = { ...saved };
  });

  it("default 0.50 เมื่อไม่มี env", () => {
    delete process.env.RECALL_BOT_USD_PER_HOUR;
    expect(getRecallBotUsdPerHour()).toBe(0.5);
  });

  it("override จาก env เมื่อ > 0", () => {
    process.env.RECALL_BOT_USD_PER_HOUR = "0.8";
    expect(getRecallBotUsdPerHour()).toBe(0.8);
    process.env.RECALL_BOT_USD_PER_HOUR = "0";
    expect(getRecallBotUsdPerHour()).toBe(0.5);
  });
});
