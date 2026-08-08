import { describe, expect, it } from "vitest";

import { ALL_MODULES, getModuleRoles, mapOrgRoleToModuleRole, ORG_ROLES } from "./modules";

// mapOrgRoleToModuleRole ตัดสิน "ระดับสิทธิ์" ที่ backfill แจกให้สมาชิกอัตโนมัติ —
// ผิดแล้วคนได้สิทธิ์เกิน (เขียนบัญชี/อนุมัติจ่ายเงิน) หรือขาด (เห็นเมนูแต่ทำอะไรไม่ได้)
describe("mapOrgRoleToModuleRole", () => {
  it("คืน role ที่มีอยู่จริงในโมดูลเสมอ ทุกคู่ (module × org role)", () => {
    for (const m of ALL_MODULES) {
      const keys = m.roles.map((r) => r.key);
      for (const orgRole of ORG_ROLES) {
        const mapped = mapOrgRoleToModuleRole(m.key, orgRole);
        expect(keys, `${m.key} × ${orgRole}`).toContain(mapped);
      }
    }
  });

  it("โมดูลที่มี role ชื่อเดียวกับ org role ใช้ตรง ๆ (tmc)", () => {
    expect(mapOrgRoleToModuleRole("tmc", "admin")).toBe("admin");
    expect(mapOrgRoleToModuleRole("tmc", "team_member")).toBe("team_member");
  });

  it("org owner/admin → role สูงสุดของโมดูล", () => {
    expect(mapOrgRoleToModuleRole("accounting", "owner")).toBe("owner");
    expect(mapOrgRoleToModuleRole("accounting", "admin")).toBe("owner");
    expect(mapOrgRoleToModuleRole("hrm", "admin")).toBe("owner");
  });

  it("team_lead → เขียนได้แต่ไม่ใช่สูงสุด", () => {
    expect(mapOrgRoleToModuleRole("accounting", "team_lead")).toBe("accountant");
    expect(mapOrgRoleToModuleRole("hrm", "team_lead")).toBe("hr");
  });

  it("team_member → อ่านอย่างเดียวเมื่อโมดูลมี role นั้น", () => {
    for (const key of ["accounting", "hrm", "crm", "acc_firm", "bi"]) {
      const mapped = mapOrgRoleToModuleRole(key, "team_member");
      const def = getModuleRoles(key).find((r) => r.key === mapped);
      expect(def?.canWrite, `${key} team_member ต้องเขียนไม่ได้`).toBe(false);
    }
  });

  it("โมดูลที่ไม่รู้จัก → null (ผู้เรียก fallback เอง)", () => {
    expect(mapOrgRoleToModuleRole("does_not_exist", "admin")).toBeNull();
  });
});
