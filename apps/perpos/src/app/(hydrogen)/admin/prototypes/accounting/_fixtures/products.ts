// products.ts — acc_products (master catalog สินค้าและบริการ)
// ~10 รายการ ผสม good + service บริบทธุรกิจไทย SME
// code: SVC-xxx (service) / PRD-xxx (good)
// is_active: 1-2 ตัว false เพื่อโชว์ filter

import type { AccProduct } from "./types";
import { MOCK_ORG_ID } from "./org-settings";

const ORG = MOCK_ORG_ID;

export const mockProducts: AccProduct[] = [
  // ---- บริการ (service) ----
  {
    id: "prd-svc001",
    org_id: ORG,
    kind: "service",
    code: "SVC-001",
    name: "ออกแบบโลโก้และ Brand Identity",
    unit: "งาน",
    unit_price: 30000.0,
    is_active: true,
    description: "ออกแบบโลโก้พร้อม Brand Identity Package: สี, ฟอนต์, ชุดไอคอน",
    created_at: "2026-01-10T09:00:00.000Z",
  },
  {
    id: "prd-svc002",
    org_id: ORG,
    kind: "service",
    code: "SVC-002",
    name: "ออกแบบกราฟิกและสื่อประชาสัมพันธ์",
    unit: "ชิ้น",
    unit_price: 2800.0,
    is_active: true,
    description: "ออกแบบ Banner, Flyer, Poster, Packaging ต่อชิ้น",
    created_at: "2026-01-10T09:00:00.000Z",
  },
  {
    id: "prd-svc003",
    org_id: ORG,
    kind: "service",
    code: "SVC-003",
    name: "ออกแบบ UX/UI เว็บไซต์และแอปพลิเคชัน",
    unit: "งาน",
    unit_price: 45000.0,
    is_active: true,
    description: "ออกแบบ Wireframe, Mockup, Prototype ครบ Flow (ราคาเริ่มต้นต่องาน)",
    created_at: "2026-01-15T09:00:00.000Z",
  },
  {
    id: "prd-svc004",
    org_id: ORG,
    kind: "service",
    code: "SVC-004",
    name: "พัฒนาซอฟต์แวร์และระบบ",
    unit: "งาน",
    unit_price: 55000.0,
    is_active: true,
    description: "พัฒนา Web App, Mobile App, Dashboard ระบบบริหารจัดการ (ราคาเริ่มต้น)",
    created_at: "2026-02-01T09:00:00.000Z",
  },
  {
    id: "prd-svc005",
    org_id: ORG,
    kind: "service",
    code: "SVC-005",
    name: "ค่าบริการ Retainer รายเดือน",
    unit: "เดือน",
    unit_price: 18000.0,
    is_active: true,
    description: "บริการดูแลและพัฒนาต่อเนื่องรายเดือน: support + minor feature + ประชุมรายสัปดาห์",
    created_at: "2026-02-01T09:00:00.000Z",
  },
  {
    id: "prd-svc006",
    org_id: ORG,
    kind: "service",
    code: "SVC-006",
    name: "ที่ปรึกษาธุรกิจและ Digital Strategy",
    unit: "ชั่วโมง",
    unit_price: 3500.0,
    is_active: true,
    description: "ให้คำปรึกษาด้านกลยุทธ์ดิจิทัล, วิเคราะห์ตลาด, วาง roadmap",
    created_at: "2026-02-15T09:00:00.000Z",
  },
  {
    id: "prd-svc007",
    org_id: ORG,
    kind: "service",
    code: "SVC-007",
    name: "อบรม Workshop ทีม (ออนไลน์/ออนไซต์)",
    unit: "วัน",
    unit_price: 25000.0,
    is_active: false, // ปิดชั่วคราว (โชว์ filter is_active=false)
    description: "อบรม Design Thinking, UX Research, Figma Workshop ต่อวันสูงสุด 20 คน",
    created_at: "2026-03-01T09:00:00.000Z",
  },

  // ---- สินค้า (good) ----
  {
    id: "prd-gd001",
    org_id: ORG,
    kind: "good",
    code: "PRD-001",
    name: "ชุดอุปกรณ์สำนักงาน (Starter Kit)",
    unit: "ชุด",
    unit_price: 1890.0,
    is_active: true,
    description: "ชุดอุปกรณ์สำหรับพนักงานใหม่: แฟ้ม, ปากกา, โน้ตบุ๊กบริษัท, แก้วน้ำ",
    created_at: "2026-03-10T09:00:00.000Z",
  },
  {
    id: "prd-gd002",
    org_id: ORG,
    kind: "good",
    code: "PRD-002",
    name: "หนังสือ 'Design for Business'",
    unit: "เล่ม",
    unit_price: 590.0,
    is_active: true,
    description: "หนังสือคู่มือการออกแบบธุรกิจ ฉบับภาษาไทย พิมพ์ครั้งที่ 3 (2569)",
    created_at: "2026-04-01T09:00:00.000Z",
  },
  {
    id: "prd-gd003",
    org_id: ORG,
    kind: "good",
    code: "PRD-003",
    name: "ใบอนุญาตซอฟต์แวร์ (Perpetual License)",
    unit: "ใบอนุญาต",
    unit_price: 12500.0,
    is_active: false, // ยกเลิกขายแล้ว เปลี่ยนเป็น subscription
    description:
      "ใบอนุญาตถาวรสำหรับซอฟต์แวร์ออกแบบ (รุ่น 2.x — ยกเลิกจำหน่าย เปลี่ยนเป็น SaaS แล้ว)",
    created_at: "2026-01-01T09:00:00.000Z",
  },
];

/**
 * helper — ค้นหา product จาก id (สำหรับ UI แสดง product_id → ชื่อ/unit/ราคา)
 * คืน undefined ถ้าไม่พบ
 */
export function productById(id: string): AccProduct | undefined {
  return mockProducts.find((p) => p.id === id);
}
