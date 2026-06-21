/**
 * Page Load Performance — guard test (มาตรฐานบังคับ, ดู AGENTS.md §Page Load Performance)
 *
 * ยืนยัน "รากฐาน" ที่ทำให้ทุกหน้าไม่หน่วง — ถ้าใครรื้อ CI จะ fail:
 *   1. loading.tsx baseline + รายโซน ต้องมี (skeleton ตอน navigate ครอบทุกหน้า)
 *   2. AuthGuard ต้องอยู่ "ข้างใน" HydrogenLayout (gate เฉพาะ content — ไม่บล็อก shell)
 *
 * หมายเหตุ: นี่ไม่ได้บังคับ "ทุกหน้าเป็น server component" (ขึ้นกับชนิดหน้า — ดูคัมภีร์)
 * แต่ล็อก invariant ที่พังเงียบได้ง่ายและกระทบทั้งแอป
 */

import { describe, it, expect } from "vitest";
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";

const APP = join(process.cwd(), "src", "app");

describe("page load performance standard (AGENTS.md §Page Load Performance)", () => {
  it("มี loading.tsx baseline + รายโซน (skeleton ตอน navigate)", () => {
    const required = [
      "(hydrogen)/loading.tsx", // baseline ครอบทุกหน้า protected
      "(hydrogen)/admin/loading.tsx",
      "(hydrogen)/assistant/loading.tsx",
      "(hydrogen)/[orgSlug]/loading.tsx",
    ];
    const missing = required.filter((p) => !existsSync(join(APP, p)));
    expect(missing, `ขาด loading.tsx (ดู AGENTS.md): ${missing.join(", ")}`).toEqual([]);
  });

  it("AuthGuard อยู่ข้างใน HydrogenLayout (gate เฉพาะ content — ไม่บล็อก shell)", () => {
    const layout = readFileSync(join(APP, "(hydrogen)", "layout.tsx"), "utf8");
    const hydrogenIdx = layout.indexOf("<HydrogenLayout");
    const authGuardIdx = layout.indexOf("<AuthGuard");

    expect(hydrogenIdx, "ไม่พบ <HydrogenLayout> ใน (hydrogen)/layout.tsx").toBeGreaterThanOrEqual(
      0,
    );
    expect(authGuardIdx, "ไม่พบ <AuthGuard> ใน (hydrogen)/layout.tsx").toBeGreaterThanOrEqual(0);
    // HydrogenLayout ต้องเปิดก่อน AuthGuard = AuthGuard ถูกห่ออยู่ข้างใน shell
    expect(
      hydrogenIdx,
      'AuthGuard ต้องอยู่ "ข้างใน" HydrogenLayout — อย่าย้ายมาครอบทั้ง shell (จะกลับไปบล็อกทั้งจอ)',
    ).toBeLessThan(authGuardIdx);
  });
});
