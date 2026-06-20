import { describe, it, expect, afterEach } from "vitest";
import {
  getSttPricing,
  estimateGeminiCostUsd,
  exactCostUsdFromTokens,
  usdToThb,
  costPerMinuteThb,
  type SttPricing,
} from "./stt-cost";

// pricing คงที่สำหรับเทส math (ไม่พึ่ง env) — ตัวเลขกลม ๆ คำนวณมือได้
const P: SttPricing = {
  audioInputUsdPerMTok: 1.0,
  textInputUsdPerMTok: 0.3,
  outputUsdPerMTok: 2.5,
  audioTokensPerSec: 32,
  outputTokensPerJob: 3000,
  usdThbRate: 35,
};

describe("estimateGeminiCostUsd", () => {
  it("คิด audio (วินาที×32 tok) + output (jobs×3000 tok) ถูกต้อง", () => {
    // 60s → 1920 audio tok → 0.00192 USD ; 1 job → 3000 out tok → 0.0075 USD
    expect(estimateGeminiCostUsd({ seconds: 60, jobs: 1 }, P)).toBeCloseTo(0.00942, 6);
  });

  it("0 วินาที 0 งาน = 0", () => {
    expect(estimateGeminiCostUsd({ seconds: 0, jobs: 0 }, P)).toBe(0);
  });

  it("ค่าติดลบถูก clamp เป็น 0 (กันคิดต้นทุนติดลบ)", () => {
    expect(estimateGeminiCostUsd({ seconds: -100, jobs: -5 }, P)).toBe(0);
  });
});

describe("exactCostUsdFromTokens", () => {
  it("รวม audio + text + output ตามราคาแต่ละชนิด", () => {
    // 1M audio*1.0 + 1M text*0.3 + 1M out*2.5 = 3.8
    expect(
      exactCostUsdFromTokens(
        { audioInputTokens: 1_000_000, textInputTokens: 1_000_000, outputTokens: 1_000_000 },
        P,
      ),
    ).toBeCloseTo(3.8, 6);
  });

  it("token ติดลบ clamp เป็น 0", () => {
    expect(
      exactCostUsdFromTokens({ audioInputTokens: -1, textInputTokens: -1, outputTokens: -1 }, P),
    ).toBe(0);
  });
});

describe("usdToThb", () => {
  it("คูณอัตราแลกเปลี่ยน", () => {
    expect(usdToThb(2, P)).toBe(70);
  });
});

describe("costPerMinuteThb", () => {
  it("คืน 0 เมื่อไม่มีนาที (กันหารศูนย์)", () => {
    expect(costPerMinuteThb({ seconds: 0, jobs: 0 }, P)).toBe(0);
    expect(costPerMinuteThb({ seconds: -10, jobs: 1 }, P)).toBe(0);
  });

  it("ต้นทุน/นาที = ต้นทุนรวม(THB) ÷ นาที", () => {
    // 60s,1job → USD 0.00942 → THB 0.3297 ; ÷1 นาที = 0.3297
    expect(costPerMinuteThb({ seconds: 60, jobs: 1 }, P)).toBeCloseTo(0.3297, 4);
  });
});

describe("getSttPricing (env fallback)", () => {
  const saved = { ...process.env };
  afterEach(() => {
    process.env = { ...saved };
  });

  it("ใช้ค่า default เมื่อไม่มี env", () => {
    delete process.env.STT_GEMINI_AUDIO_INPUT_USD_PER_M;
    delete process.env.STT_USD_THB_RATE;
    const p = getSttPricing();
    expect(p.audioInputUsdPerMTok).toBe(1.0);
    expect(p.usdThbRate).toBe(35);
  });

  it("override จาก env (เฉพาะค่า > 0)", () => {
    process.env.STT_USD_THB_RATE = "40";
    expect(getSttPricing().usdThbRate).toBe(40);
    // ค่าเสีย/<=0 → ตก default
    process.env.STT_USD_THB_RATE = "0";
    expect(getSttPricing().usdThbRate).toBe(35);
    process.env.STT_USD_THB_RATE = "abc";
    expect(getSttPricing().usdThbRate).toBe(35);
  });
});
