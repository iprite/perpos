/**
 * เทสสูตรเงินของหน้า "ต้นทุนต่อองค์กร" — ผิดแล้วตั้งราคาขายผิดตาม
 * (ตามกฎ repo: กฎที่ผิดแล้วเสียเงินต้องมีเทสคุม)
 */

import { describe, it, expect } from "vitest";
import { prorateFixedCosts, normalizeUsageDays, type FixedCostRow } from "./usage";

const row = (id: string, month: string, amountUsd: number): FixedCostRow => ({
  id,
  month,
  label: id,
  amountUsd,
  allocation: "pro_rata",
  note: null,
});

describe("prorateFixedCosts", () => {
  it("ช่วงที่คลุมทั้งเดือน → คิดเต็มจำนวน", () => {
    const p = prorateFixedCosts(
      [row("a", "2026-06-01", 30)],
      new Date("2026-05-15T00:00:00Z"),
      new Date("2026-07-15T00:00:00Z"),
    );
    expect(p.get("a")).toBeCloseTo(30, 6);
  });

  it("ช่วงทับครึ่งเดือน → คิดครึ่งเดียว", () => {
    // มิ.ย. มี 30 วัน · ทับ 15 วัน = 50%
    const p = prorateFixedCosts(
      [row("a", "2026-06-01", 30)],
      new Date("2026-06-16T00:00:00Z"),
      new Date("2026-07-01T00:00:00Z"),
    );
    expect(p.get("a")).toBeCloseTo(15, 6);
  });

  it("ช่วงไม่ทับเดือนนั้นเลย → 0 (ไม่ใช่ค่าเต็ม)", () => {
    const p = prorateFixedCosts(
      [row("a", "2026-01-01", 100)],
      new Date("2026-06-01T00:00:00Z"),
      new Date("2026-07-01T00:00:00Z"),
    );
    expect(p.get("a")).toBe(0);
  });

  it("ช่วงคร่อมสองเดือน → รวมกันได้เท่ากับ 1 เดือนพอดี", () => {
    // 30 วันล่าสุดที่คร่อม มิ.ย./ก.ค. — ทั้งคู่เดือนละ $30
    const from = new Date("2026-06-16T00:00:00Z");
    const to = new Date("2026-07-16T00:00:00Z");
    const p = prorateFixedCosts(
      [row("jun", "2026-06-01", 30), row("jul", "2026-07-01", 31)],
      from,
      to,
    );
    // มิ.ย.: ทับ 15/30 = 15 · ก.ค.: ทับ 15/31 ของ 31 = 15
    expect((p.get("jun") ?? 0) + (p.get("jul") ?? 0)).toBeCloseTo(30, 6);
  });

  it("ช่วง 90 วัน ไม่กวาดต้นทุนของเดือนที่ทับแค่บางส่วนมาเต็มจำนวน", () => {
    const from = new Date("2026-04-16T00:00:00Z");
    const to = new Date("2026-07-15T00:00:00Z");
    const rows = [
      row("apr", "2026-04-01", 30), // ทับ 15/30
      row("may", "2026-05-01", 31), // ทับเต็ม
      row("jun", "2026-06-01", 30), // ทับเต็ม
      row("jul", "2026-07-01", 31), // ทับ 14/31
    ];
    const p = prorateFixedCosts(rows, from, to);
    const total = rows.reduce((s, r) => s + (p.get(r.id) ?? 0), 0);
    const naive = rows.reduce((s, r) => s + r.amountUsd, 0); // ท่าเดิมที่ผิด
    expect(p.get("apr")).toBeCloseTo(15, 6);
    expect(p.get("may")).toBeCloseTo(31, 6);
    expect(total).toBeLessThan(naive);
    expect(total).toBeCloseTo(15 + 31 + 30 + 14, 6);
  });

  it("ไม่มีรายการ → map ว่าง ไม่ throw", () => {
    expect(prorateFixedCosts([], new Date(), new Date()).size).toBe(0);
  });
});

describe("normalizeUsageDays", () => {
  it("ค่าปกติผ่านตรง ๆ", () => {
    expect(normalizeUsageDays("7")).toBe(7);
    expect(normalizeUsageDays("90")).toBe(90);
  });

  it("ค่าเพี้ยน/ว่าง → 30", () => {
    expect(normalizeUsageDays(undefined)).toBe(30);
    expect(normalizeUsageDays("abc")).toBe(30);
  });

  it("clamp 1..365 — กันคนยิง ?days=99999 แล้วสแกนทั้งตาราง", () => {
    expect(normalizeUsageDays("0")).toBe(1);
    expect(normalizeUsageDays("-5")).toBe(1);
    expect(normalizeUsageDays("99999")).toBe(365);
  });
});
