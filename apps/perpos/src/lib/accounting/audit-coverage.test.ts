import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

/**
 * ด่านกันลืม — ทุก route ของ `accounting` ที่ "เขียนข้อมูล" ต้องทิ้งร่องรอย
 *
 * ร่องรอยการแก้บัญชีเขียนจากชั้นแอปแบบระบุ actor/firm ชัดเจน (ไม่ใช้ DB trigger เพราะ
 * trigger ไม่รู้ว่า "ทำในนามสำนักงานใด" และ session GUC สลับคนได้บน connection pool
 * ดู lib/accounting/audit.ts) — ข้อเสียของท่านี้คือ **route ใหม่ลืมเรียกได้**
 * เทสนี้ปิดช่องนั้น: เจอ handler ที่เขียนข้อมูลแล้วไม่มี logAccountingAudit → แดง
 */

const API_DIR = join(process.cwd(), "src/app/api/accounting");
const MUTATING = /export async function (POST|PUT|PATCH|DELETE)\b/;

/** route ที่ยกเว้นได้ พร้อมเหตุผล — เพิ่มได้เฉพาะเมื่ออธิบายได้ว่าทำไมไม่ต้องมีร่องรอย */
const EXEMPT: Record<string, string> = {
  "payroll-bridge/route.ts":
    "สะพานจากโมดูล payroll (เรียกด้วย CRON_SECRET ไม่ใช่ผู้ใช้) — ร่องรอยอยู่ฝั่ง payroll run",
};

function walk(dir: string): string[] {
  const out: string[] = [];
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) out.push(...walk(full));
    else if (name === "route.ts") out.push(full);
  }
  return out;
}

describe("ร่องรอยการแก้ไขบัญชี — ความครอบคลุม", () => {
  const files = walk(API_DIR);

  it("เจอ route ของ accounting (กันเทสผ่านเพราะหาไฟล์ไม่เจอ)", () => {
    expect(files.length).toBeGreaterThan(20);
  });

  it("ทุก route ที่เขียนข้อมูลต้องเรียก logAccountingAudit", () => {
    const missing: string[] = [];
    for (const file of files) {
      const src = readFileSync(file, "utf8");
      if (!MUTATING.test(src)) continue;
      const rel = file.slice(API_DIR.length + 1);
      if (EXEMPT[rel]) continue;
      if (!src.includes("logAccountingAudit(")) missing.push(rel);
    }
    expect(missing, `route ที่เขียนข้อมูลแต่ไม่ทิ้งร่องรอย:\n${missing.join("\n")}`).toEqual([]);
  });

  it("รายการยกเว้นต้องชี้ไปยังไฟล์ที่มีอยู่จริง (กันรายการค้างหลังไฟล์ถูกลบ/ย้าย)", () => {
    const rels = new Set(files.map((f) => f.slice(API_DIR.length + 1)));
    for (const key of Object.keys(EXEMPT)) expect(rels, `ยกเว้น ${key}`).toContain(key);
  });
});
