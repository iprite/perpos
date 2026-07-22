// เทสของ "ค้นชื่อสินค้าในคลังแบบใกล้เคียง" (fuzzy) — 2 เรื่องที่ผิดแล้วเจ็บ:
//   1) **threshold** — ต่ำไป = เสนอของคนละตัวให้คนกดผิด · สูงไป = คลังไม่ถูกใช้ (เสียคุณค่าฟีเจอร์)
//   2) **degrade** — ถ้ายังไม่ได้ apply migration (extension/RPC ยังไม่มี) ต้องเงียบ ไม่ล้ม

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  normalizeName,
  suggestProductsByNames,
  suggestProductsByName,
  FUZZY_MIN_SCORE,
} from "./catalog-products";

// ---------------------------------------------------------------------------
// จำลอง pg_trgm ฝั่ง TS เพื่อ "เลือก threshold จากตัวเลข ไม่ใช่จากการเดา"
//
// อัลกอริทึมเดียวกับ pg_trgm (trgm_op.c):
//   - แต่ละคำถูก pad เป็น "␠␠<word>␠" แล้วตัดหน้าต่างละ 3 อักขระ  → "abc" = {"  a"," ab","abc","bc "}
//   - similarity = |A∩B| / (|A|+|B|−|A∩B|)  (ชุด trigram ที่ไม่ซ้ำ)
// ต่างจากของจริงตรง: ที่นี่ตัดคำด้วย "ช่องว่าง" อย่างเดียว ซึ่งถูกต้องสำหรับ `name_key`
//   (ผ่าน gov_procure_normalize_name มาแล้ว → เหลือแค่ตัวอักษร/ตัวเลข/ช่องว่าง)
// ⚠️ เป็นการจำลอง — หลัง apply migration ต้องรันคิวรี verify ข้อ 4 ในไฟล์
//    20260722210000_gov_procure_catalog_search.sql เทียบกับ similarity() ของจริง
// ---------------------------------------------------------------------------
function trigramSet(nameKey: string): Set<string> {
  const out = new Set<string>();
  for (const word of nameKey.split(" ").filter(Boolean)) {
    const padded = `  ${word} `;
    for (let i = 0; i + 3 <= padded.length; i += 1) out.add(padded.slice(i, i + 3));
  }
  return out;
}

function trigramSimilarity(a: string, b: string): number {
  const A = trigramSet(normalizeName(a));
  const B = trigramSet(normalizeName(b));
  if (A.size === 0 || B.size === 0) return 0;
  let inter = 0;
  // forEach: tsconfig ของแอป target ต่ำกว่า es2015 → for…of บน Set ต้องใช้ downlevelIteration
  A.forEach((t) => {
    if (B.has(t)) inter += 1;
  });
  return inter / (A.size + B.size - inter);
}

describe("threshold ของ fuzzy match (ชื่อจริงจาก TOR vs ชื่อในคลัง)", () => {
  it("ชื่อเดียวกันเป๊ะ = 1", () => {
    expect(trigramSimilarity("ปากกาเจล 0.5 น้ำเงิน", "ปากกาเจล 0.5 น้ำเงิน")).toBe(1);
  });

  // ── ควรเจอ (คนละสำนวน แต่ของชิ้นเดียวกัน) ──────────────────────────────
  it.each([
    ["ปากกาเจล 0.5 น้ำเงิน", "ปากกาหมึกเจล สีน้ำเงิน ขนาด 0.5 มม."],
    ["กระดาษ A4 80 แกรม", "กระดาษถ่ายเอกสาร A4 80 แกรม Double A"],
  ])("ต้องเสนอ: %s ↔ %s", (tor, library) => {
    const score = trigramSimilarity(tor, library);
    expect(score).toBeGreaterThan(FUZZY_MIN_SCORE);
    expect(score).toBeGreaterThan(0.35); // มีระยะห่างจากเกณฑ์จริง ไม่ใช่ผ่านฉิวเฉียด
  });

  // ── ห้ามเจอ (ขึ้นต้นเหมือนกันแต่คนละสินค้า = อันตรายที่สุด) ─────────────
  it.each([
    ["ปากกาเจล 0.5 น้ำเงิน", "ปากกาไวท์บอร์ด สีดำ"],
    ["กระดาษ A4 80 แกรม", "กระดาษชำระ ม้วนใหญ่"],
  ])("ห้ามเสนอ: %s ↔ %s", (tor, other) => {
    const score = trigramSimilarity(tor, other);
    expect(score).toBeLessThan(FUZZY_MIN_SCORE);
    expect(score).toBeLessThan(0.25);
  });

  it("กลุ่มที่ควรเจอ ต้องได้คะแนนมากกว่ากลุ่มที่ห้ามเจออย่างชัดเจน", () => {
    const good = trigramSimilarity("ปากกาเจล 0.5 น้ำเงิน", "ปากกาหมึกเจล สีน้ำเงิน ขนาด 0.5 มม.");
    const bad = trigramSimilarity("ปากกาเจล 0.5 น้ำเงิน", "ปากกาไวท์บอร์ด สีดำ");
    expect(good - bad).toBeGreaterThan(0.15);
    // 0.30 ต้องอยู่ระหว่างสองกลุ่ม (และเท่ากับพื้นของ operator `%` ของ pg_trgm)
    expect(FUZZY_MIN_SCORE).toBeGreaterThan(bad);
    expect(FUZZY_MIN_SCORE).toBeLessThan(good);
  });
});

// ---------------------------------------------------------------------------
// suggestProductsByNames — สัญญากับ caller
// ---------------------------------------------------------------------------

type RpcArgs = Record<string, unknown>;

function fakeClient(
  impl: (fn: string, args: RpcArgs) => Promise<{ data: unknown; error: unknown }>,
  calls: { fn: string; args: RpcArgs }[] = [],
): SupabaseClient {
  return {
    rpc: (fn: string, args: RpcArgs) => {
      calls.push({ fn, args });
      return impl(fn, args);
    },
  } as unknown as SupabaseClient;
}

describe("suggestProductsByNames", () => {
  beforeEach(() => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("ยังไม่ได้ apply migration (RPC ไม่มี) → Map ว่าง ไม่ throw", async () => {
    const client = fakeClient(async () => ({
      data: null,
      error: {
        code: "42883",
        message: "function public.gov_procure_match_products does not exist",
      },
    }));
    const res = await suggestProductsByNames(client, "o1", ["ปากกาเจล"]);
    expect(res.size).toBe(0);
    expect(console.warn).toHaveBeenCalled();
  });

  it("RPC โยน exception (network/permission) → Map ว่าง ไม่ throw", async () => {
    const client = fakeClient(async () => {
      throw new Error("permission denied for function gov_procure_match_products");
    });
    const res = await suggestProductsByNames(client, "o1", ["ปากกาเจล"]);
    expect(res.size).toBe(0);
  });

  it("suggestProductsByName คืน [] อย่างสงบเมื่อ RPC ยังไม่มี", async () => {
    const client = fakeClient(async () => ({
      data: null,
      error: { code: "42883", message: "does not exist" },
    }));
    expect(await suggestProductsByName(client, "o1", "ปากกาเจล")).toEqual([]);
  });

  it("ไม่ยิง RPC เลยเมื่อไม่มีชื่อที่ใช้ได้ (ว่าง/สัญลักษณ์ล้วน)", async () => {
    const calls: { fn: string; args: RpcArgs }[] = [];
    const client = fakeClient(async () => ({ data: [], error: null }), calls);
    const res = await suggestProductsByNames(client, "o1", ["", "   ", "---"]);
    expect(res.size).toBe(0);
    expect(calls).toHaveLength(0);
  });

  it("ส่งชื่อไม่ซ้ำ + clamp threshold ที่ 0.3 (ต่ำกว่านี้ `%` ไม่คืนอยู่ดี)", async () => {
    const calls: { fn: string; args: RpcArgs }[] = [];
    const client = fakeClient(async () => ({ data: [], error: null }), calls);
    await suggestProductsByNames(client, "o1", ["ปากกาเจล", "ปากกาเจล", "แฟ้ม"], {
      threshold: 0.05,
    });
    expect(calls).toHaveLength(1);
    expect(calls[0].fn).toBe("gov_procure_match_products");
    expect(calls[0].args.p_names).toEqual(["ปากกาเจล", "แฟ้ม"]);
    expect(calls[0].args.p_threshold).toBe(FUZZY_MIN_SCORE);
    expect(calls[0].args.p_org_id).toBe("o1");
  });

  it("จัดกลุ่มตามชื่อที่ส่งไป + เรียงคะแนนมาก→น้อย + ตั้งธง exact ถูกต้อง", async () => {
    const client = fakeClient(async () => ({
      data: [
        {
          input_name: "ปากกาเจล 0.5 น้ำเงิน",
          product_id: "p-low",
          name: "ปากกาลูกลื่น 0.5 น้ำเงิน",
          brand_model: null,
          image_path: null,
          last_unit_price: null,
          score: 0.34,
        },
        {
          input_name: "ปากกาเจล 0.5 น้ำเงิน",
          product_id: "p-high",
          name: "ปากกาหมึกเจล สีน้ำเงิน ขนาด 0.5 มม.",
          brand_model: "Pentel BLN-105",
          image_path: "o1/products/p-high/x.png",
          last_unit_price: "15.5",
          score: "0.44",
        },
        {
          input_name: "แฟ้ม Horse No.22",
          product_id: "p-exact",
          name: "แฟ้ม  Horse  No.22",
          brand_model: null,
          image_path: null,
          last_unit_price: null,
          score: 1,
        },
      ],
      error: null,
    }));

    const res = await suggestProductsByNames(client, "o1", [
      "ปากกาเจล 0.5 น้ำเงิน",
      "แฟ้ม Horse No.22",
    ]);

    const pens = res.get("ปากกาเจล 0.5 น้ำเงิน")!;
    expect(pens.map((s) => s.product.id)).toEqual(["p-high", "p-low"]);
    expect(pens[0].score).toBeCloseTo(0.44);
    expect(pens[0].product.last_unit_price).toBe(15.5);
    expect(pens[0].exact).toBe(false); // ใกล้เคียง ≠ ตรงเป๊ะ → ห้ามถูกมองว่า auto-apply ได้

    const folder = res.get("แฟ้ม Horse No.22")!;
    expect(folder[0].exact).toBe(true); // normalize แล้วตรงกัน (ต่างแค่ช่องว่าง)
  });

  it("จำกัดจำนวนข้อเสนอแนะตาม limit ที่ขอ", async () => {
    const client = fakeClient(async () => ({
      data: [1, 2, 3, 4].map((i) => ({
        input_name: "ปากกาเจล",
        product_id: `p${i}`,
        name: `ปากกาเจลรุ่น ${i}`,
        brand_model: null,
        image_path: null,
        last_unit_price: null,
        score: 0.9 - i / 100,
      })),
      error: null,
    }));
    const res = await suggestProductsByNames(client, "o1", ["ปากกาเจล"], { limit: 2 });
    expect(res.get("ปากกาเจล")).toHaveLength(2);
    expect(res.get("ปากกาเจล")!.map((s) => s.product.id)).toEqual(["p1", "p2"]);
  });
});
