import { describe, expect, it } from "vitest";

import { FIRM_ACCESS_MODULES, firmRoleToClientRole } from "./firm-access";

// สิทธิ์ที่สำนักงานบัญชีได้ใน org ลูกค้า = สิทธิ์ที่คนนอกองค์กรได้กับข้อมูลการเงินของคนอื่น
// กว้างเกิน = สำนักงานแก้ตั้งค่าภาษี/ข้อมูลผู้เสียภาษีของลูกค้าได้ · แคบเกิน = ทำบัญชีไม่ได้
describe("firm access — สิทธิ์ที่สำนักงานบัญชีได้ในองค์กรลูกค้า", () => {
  it("ไม่มีทางได้ owner — ตั้งค่าองค์กรของลูกค้าต้องอยู่กับลูกค้าเสมอ", () => {
    for (const role of ["owner", "admin", "accountant", "viewer", "อะไรก็ตาม"]) {
      expect(firmRoleToClientRole(role), `acc_firm role = ${role}`).not.toBe("owner");
    }
  });

  it("ทีมที่เขียนได้ → accountant (ลงบัญชี/ปิดงวดได้)", () => {
    expect(firmRoleToClientRole("owner")).toBe("accountant");
    expect(firmRoleToClientRole("accountant")).toBe("accountant");
    expect(firmRoleToClientRole("admin")).toBe("accountant");
  });

  it("viewer ของสำนักงาน → viewer ของลูกค้า (อ่านอย่างเดียว)", () => {
    expect(firmRoleToClientRole("viewer")).toBe("viewer");
  });

  it("ขอบเขตโมดูล = accounting เท่านั้น — ไม่แตะ CRM/HR/คลังของลูกค้า", () => {
    expect([...FIRM_ACCESS_MODULES]).toEqual(["accounting"]);
  });
});
