// contacts.ts — acc_contacts ~8 ลูกค้า/ผู้ขาย/ทั้งสอง
// ชื่อธุรกิจไทยสมจริง บริบท SME กาแฟ/ออกแบบ/รับเหมาเล็ก

import type { AccContact } from "./types";
import { MOCK_ORG_ID } from "./org-settings";

const ORG = MOCK_ORG_ID;

export const mockContacts: AccContact[] = [
  // ลูกค้า (customer)
  {
    id: "cnt-c01",
    org_id: ORG,
    kind: "customer",
    name: "บริษัท ไทยดีไซน์ สตูดิโอ จำกัด",
    tax_id: "0105561098234",
    branch: "สำนักงานใหญ่",
    address: "88/12 ถนนสีลม แขวงสีลม เขตบางรัก กรุงเทพฯ 10500",
    phone: "02-234-5678",
    email: "ap@thaidesignstudio.co.th",
    created_at: "2026-01-10T08:00:00.000Z",
  },
  {
    id: "cnt-c02",
    org_id: ORG,
    kind: "customer",
    name: "ร้านกาแฟ บ้านเช้า",
    tax_id: null,
    branch: null,
    address: "45 ถนนนิมมานเหมินท์ เชียงใหม่ 50200",
    phone: "081-234-5678",
    email: null,
    created_at: "2026-01-15T08:00:00.000Z",
  },
  {
    id: "cnt-c03",
    org_id: ORG,
    kind: "customer",
    name: "ห้างหุ้นส่วน วังทองก่อสร้าง",
    tax_id: "0303564009876",
    branch: "สำนักงานใหญ่",
    address: "99/5 ถนนเพชรเกษม เขตบางแค กรุงเทพฯ 10160",
    phone: "02-456-7890",
    email: "contact@wangthong.co.th",
    created_at: "2026-02-01T08:00:00.000Z",
  },
  {
    id: "cnt-c04",
    org_id: ORG,
    kind: "customer",
    name: "คุณสมชาย วงศ์สุข (บุคคลธรรมดา)",
    tax_id: "1103700123456",
    branch: null,
    address: "12 ซอยลาดพร้าว 15 กรุงเทพฯ 10230",
    phone: "089-876-5432",
    email: "somchai.wong@gmail.com",
    created_at: "2026-02-10T08:00:00.000Z",
  },

  // ผู้ขาย (vendor)
  {
    id: "cnt-v01",
    org_id: ORG,
    kind: "vendor",
    name: "บริษัท ซัพพลายดี จำกัด",
    tax_id: "0105554432100",
    branch: "สำนักงานใหญ่",
    address: "200 ถนนพหลโยธิน เขตจตุจักร กรุงเทพฯ 10900",
    phone: "02-554-3210",
    email: "order@supplydee.co.th",
    created_at: "2026-01-05T08:00:00.000Z",
  },
  {
    id: "cnt-v02",
    org_id: ORG,
    kind: "vendor",
    name: "ร้านค้าวัสดุก่อสร้าง พงษ์เจริญ",
    tax_id: null,
    branch: null,
    address: "334 ถนนบางนา-ตราด กรุงเทพฯ 10260",
    phone: "02-334-5566",
    email: null,
    created_at: "2026-01-20T08:00:00.000Z",
  },
  {
    id: "cnt-v03",
    org_id: ORG,
    kind: "vendor",
    name: "บริษัท ออนไลน์โฆษณา จำกัด",
    tax_id: "0105567891011",
    branch: "สำนักงานใหญ่",
    address: "888 อาคาร One Bangkok ชั้น 22 กรุงเทพฯ 10330",
    phone: "02-888-9900",
    email: "billing@onlineads.co.th",
    created_at: "2026-02-15T08:00:00.000Z",
  },

  // ทั้งลูกค้าและผู้ขาย (both)
  {
    id: "cnt-b01",
    org_id: ORG,
    kind: "both",
    name: "บริษัท ครีเอทีฟ เน็ตเวิร์ค จำกัด",
    tax_id: "0105553344556",
    branch: "สำนักงานใหญ่",
    address: "99 ถนนสุขุมวิท แขวงคลองเตย เขตคลองเตย กรุงเทพฯ 10110",
    phone: "02-123-4500",
    email: "finance@creativenetwork.co.th",
    created_at: "2026-01-08T08:00:00.000Z",
  },
];

/** map id → contact name (สะดวก join ใน UI) */
export const contactNameById: Record<string, string> = Object.fromEntries(
  mockContacts.map((c) => [c.id, c.name]),
);
