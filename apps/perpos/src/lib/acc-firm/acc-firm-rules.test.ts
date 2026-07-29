/**
 * เทสกฎของสำนักงานบัญชีที่ "ผิดแล้วเสียเงิน / ผิดกำหนดยื่น"
 *   - summarizeServiceFees → ตัวเลขรายได้ค่าบริการบนหน้าลูกค้า
 *   - deriveState          → สถานะยื่นภาษีบนปฏิทินภาษี (เกินกำหนด/รอยื่น)
 */
import { describe, expect, it } from "vitest";
import { summarizeServiceFees, LATEST_FEE_YEAR } from "./billing";
import { deriveState } from "./tax-calendar";
import type { ServiceClient } from "@/app/api/acc-firm/service-clients/route";

/** ลูกค้าจำลอง — ใส่เฉพาะช่องที่สูตรใช้ ที่เหลือเป็นค่า default ที่ไม่กระทบผล */
function client(over: Partial<ServiceClient> & { id: string }): ServiceClient {
  return {
    client_code: over.id,
    company_name: `บริษัท ${over.id}`,
    fee_2023: null,
    fee_2024: null,
    fee_2025: null,
    fee_2026: null,
    fee_yearly: null,
    billing_note: null,
    svc_invoice: false,
    svc_billing: false,
    svc_expense: false,
    svc_sso: false,
    svc_pp30: false,
    svc_pnd: false,
    svc_pnd51: false,
    svc_pnd50: false,
    svc_close_f: false,
    note: null,
    is_active: true,
    created_at: "2026-01-01T00:00:00Z",
    tax_id: null,
    entity_type: null,
    vat_registered: false,
    fiscal_year_end_month: 12,
    fiscal_year_end_day: 31,
    storage_location: null,
    dbd_relocation_notified: false,
    client_org_id: null,
    engagement: null,
    updated_at: "2026-01-01T00:00:00Z",
    updated_by: null,
    updated_by_name: null,
    ...over,
  } as ServiceClient;
}

describe("summarizeServiceFees — รายได้ค่าบริการของสำนักงาน", () => {
  it("รวมยอดปีนี้/ปีก่อน และคิด YoY ถูกต้อง", () => {
    const s = summarizeServiceFees(
      [
        client({ id: "A", fee_2025: 1000, fee_2026: 1500 }),
        client({ id: "B", fee_2025: 1000, fee_2026: 500 }),
      ],
      2026,
    );
    expect(s.totalThisYear).toBe(2000);
    expect(s.totalLastYear).toBe(2000);
    expect(s.yoyPct).toBe(0);
  });

  it("ปีก่อน = 0 → YoY เป็น null (ห้ามหารศูนย์แล้วโชว์ Infinity)", () => {
    const s = summarizeServiceFees([client({ id: "A", fee_2026: 900 })], 2026);
    expect(s.totalLastYear).toBe(0);
    expect(s.yoyPct).toBeNull();
  });

  it("ลูกค้าที่ยังไม่ตั้งค่าบริการปีนี้ = รายได้รั่ว (นับเฉพาะที่ยังใช้งาน)", () => {
    const s = summarizeServiceFees(
      [
        client({ id: "A", fee_2026: 1000 }),
        client({ id: "B", fee_2026: 0 }),
        client({ id: "C", fee_2026: null }),
        client({ id: "D", fee_2026: null, is_active: false }), // ยกเลิกแล้ว ไม่นับ
      ],
      2026,
    );
    expect(s.unbilledClients.map((c) => c.clientCode).sort()).toEqual(["B", "C"]);
  });

  it("ปีเกินคอลัมน์ที่มี → clamp ลงปีล่าสุด + เตือน (ไม่เงียบ)", () => {
    const s = summarizeServiceFees([client({ id: "A", fee_2026: 1200 })], LATEST_FEE_YEAR + 2);
    expect(s.feeYear).toBe(LATEST_FEE_YEAR);
    expect(s.totalThisYear).toBe(1200);
    expect(s.yearWarning).toBeTruthy();
  });
});

describe("deriveState — สถานะยื่นภาษี", () => {
  const today = "2026-07-29";

  it("ยื่นแล้ว = done ไม่ว่ากำหนดจะผ่านไปแล้วก็ตาม", () => {
    expect(deriveState("filed", "2026-07-15", today)).toBe("done");
  });

  it("พร้อมยื่นแต่ยังไม่ยื่น = ready (ยังไม่ถือว่าเกินกำหนด)", () => {
    expect(deriveState("ready", "2026-07-15", today)).toBe("ready");
  });

  it("ร่าง + เลยกำหนด = overdue", () => {
    expect(deriveState("draft", "2026-07-28", today)).toBe("overdue");
  });

  it("ร่าง + ครบกำหนดวันนี้ = ยังไม่เกิน (pending)", () => {
    expect(deriveState("draft", today, today)).toBe("pending");
  });

  it("ร่าง + ยังไม่ถึงกำหนด = pending", () => {
    expect(deriveState("draft", "2026-08-15", today)).toBe("pending");
  });
});
