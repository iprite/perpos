// points.ts — golf_point_transactions ledger (append-only) — [D3]
// earn ตาม points_earned = floor(paid_amount/20) × plan.points_multiplier (ตั้งค่า mock 1 แต้ม/20 ฿ — P2 defer)
// หมายเหตุ: points_balance บน golf_members = denormalized (recompute ได้จาก ledger) — ตัวอย่างนี้
// ทำให้ ledger ของ gm-001/gm-003/gm-016/gm-018 sum ตรงกับ points_balance ที่ seed ไว้เป๊ะ (โชว์ recompute ได้จริง)
// สมาชิกรายอื่นให้ ledger ตัวแทน (1 entry) ไม่ได้ reconcile ทุกคน — เพียงพอสำหรับ demo ledger UI
import type { GolfPointTransaction } from "./types";

const ORG = "org-golf-greenvalley";

export const golfPointTransactions: GolfPointTransaction[] = [
  // gm-001 คุณสมชาย (1,450 แต้ม รวม)
  { id: "pt-001-1", org_id: ORG, member_id: "gm-001", txn_type: "earn", points: 700, booking_id: null, description: "เล่น 18 หลุม +700 แต้ม (Gold ×2)", created_by: null, created_at: "2026-03-01T04:00:00.000Z" },
  { id: "pt-001-2", org_id: ORG, member_id: "gm-001", txn_type: "earn", points: 500, booking_id: null, description: "เล่น 18 หลุม +500 แต้ม (Gold ×2)", created_by: null, created_at: "2026-05-01T04:00:00.000Z" },
  { id: "pt-001-3", org_id: ORG, member_id: "gm-001", txn_type: "earn", points: 250, booking_id: null, description: "เล่น 18 หลุม +250 แต้ม (Gold ×2)", created_by: null, created_at: "2026-06-15T04:00:00.000Z" },

  // gm-003 คุณธนกฤต (3,200 แต้ม รวม — ประวัติ earn หลายรายการตามที่ ai-strategist ระบุ)
  { id: "pt-003-1", org_id: ORG, member_id: "gm-003", txn_type: "earn", points: 1200, booking_id: null, description: "เล่น 18 หลุม +1,200 แต้ม (Gold ×2, มัดจำ+ค่าบริการรวมสูง)", created_by: null, created_at: "2026-02-01T04:00:00.000Z" },
  { id: "pt-003-2", org_id: ORG, member_id: "gm-003", txn_type: "earn", points: 900, booking_id: null, description: "เล่น 18 หลุม +900 แต้ม (Gold ×2)", created_by: null, created_at: "2026-03-15T04:00:00.000Z" },
  { id: "pt-003-3", org_id: ORG, member_id: "gm-003", txn_type: "redeem", points: -300, booking_id: null, description: "แลกตะกร้าฟรี −300 แต้ม", created_by: "staff-noi", created_at: "2026-04-02T05:00:00.000Z" },
  { id: "pt-003-4", org_id: ORG, member_id: "gm-003", txn_type: "earn", points: 800, booking_id: null, description: "เล่น 18 หลุม +800 แต้ม (Gold ×2)", created_by: null, created_at: "2026-05-10T04:00:00.000Z" },
  { id: "pt-003-5", org_id: ORG, member_id: "gm-003", txn_type: "earn", points: 600, booking_id: null, description: "เล่น 18 หลุม +600 แต้ม (Gold ×2)", created_by: null, created_at: "2026-06-20T04:00:00.000Z" },

  // gm-004 คุณนภัสสร (Silver, 620 แต้ม)
  { id: "pt-004-1", org_id: ORG, member_id: "gm-004", txn_type: "earn", points: 620, booking_id: null, description: "เล่น 18 หลุม +620 แต้ม (Silver ×1)", created_by: null, created_at: "2026-04-20T04:00:00.000Z" },

  // gm-006 คุณกิตติศักดิ์ (Platinum, 5,100 แต้ม)
  { id: "pt-006-1", org_id: ORG, member_id: "gm-006", txn_type: "earn", points: 3000, booking_id: null, description: "เล่น 18 หลุม +3,000 แต้ม (Platinum ×3)", created_by: null, created_at: "2026-02-10T04:00:00.000Z" },
  { id: "pt-006-2", org_id: ORG, member_id: "gm-006", txn_type: "earn", points: 2100, booking_id: null, description: "เล่น 18 หลุม +2,100 แต้ม (Platinum ×3)", created_by: null, created_at: "2026-05-18T04:00:00.000Z" },

  // gm-007 คุณพิมพ์ชนก (Silver, 340 แต้ม)
  { id: "pt-007-1", org_id: ORG, member_id: "gm-007", txn_type: "earn", points: 340, booking_id: null, description: "เล่น 18 หลุม +340 แต้ม (Silver ×1)", created_by: null, created_at: "2026-05-25T04:00:00.000Z" },

  // gm-010 คุณธีรพงษ์ (Gold, 1,890 แต้ม)
  { id: "pt-010-1", org_id: ORG, member_id: "gm-010", txn_type: "earn", points: 1200, booking_id: null, description: "เล่น 18 หลุม +1,200 แต้ม (Gold ×2)", created_by: null, created_at: "2026-03-08T04:00:00.000Z" },
  { id: "pt-010-2", org_id: ORG, member_id: "gm-010", txn_type: "earn", points: 690, booking_id: null, description: "เล่น 18 หลุม +690 แต้ม (Gold ×2)", created_by: null, created_at: "2026-06-01T04:00:00.000Z" },

  // gm-013 คุณพิศมัย (VIP ไม่มีแพ็กเกจ, 80 แต้ม — earn อัตราปกติ ×1)
  { id: "pt-013-1", org_id: ORG, member_id: "gm-013", txn_type: "earn", points: 80, booking_id: null, description: "เล่น 18 หลุม +80 แต้ม (VIP ×1 — ไม่มีแพ็กเกจ)", created_by: null, created_at: "2026-05-05T04:00:00.000Z" },

  // gm-016 คุณสุพัตรา (Silver, 210 แต้ม — โชว์ earn+redeem)
  { id: "pt-016-1", org_id: ORG, member_id: "gm-016", txn_type: "earn", points: 300, booking_id: null, description: "เล่น 18 หลุม +300 แต้ม (Silver ×1)", created_by: null, created_at: "2026-04-11T04:00:00.000Z" },
  { id: "pt-016-2", org_id: ORG, member_id: "gm-016", txn_type: "redeem", points: -90, booking_id: null, description: "แลกส่วนลดแคดดี้ −90 แต้ม", created_by: "staff-noi", created_at: "2026-05-02T05:00:00.000Z" },

  // gm-018 คุณชัยวัฒน์ (Gold หมดอายุ, 950 แต้ม — โชว์ adjust)
  { id: "pt-018-1", org_id: ORG, member_id: "gm-018", txn_type: "earn", points: 1000, booking_id: null, description: "เล่น 18 หลุม +1,000 แต้ม (Gold ×2)", created_by: null, created_at: "2026-01-20T04:00:00.000Z" },
  { id: "pt-018-2", org_id: ORG, member_id: "gm-018", txn_type: "adjust", points: -50, booking_id: null, description: "ปรับแก้แต้มคลาดเคลื่อนจากระบบเก่า −50 แต้ม", created_by: "staff-noi", created_at: "2026-02-01T05:00:00.000Z" },

  // gm-021 คุณอภิสิทธิ์ (Gold, 1,120 แต้ม)
  { id: "pt-021-1", org_id: ORG, member_id: "gm-021", txn_type: "earn", points: 1120, booking_id: null, description: "เล่น 18 หลุม +1,120 แต้ม (Gold ×2)", created_by: null, created_at: "2026-04-28T04:00:00.000Z" },

  // gm-025 คุณสมบัติ (VIP, 40 แต้ม)
  { id: "pt-025-1", org_id: ORG, member_id: "gm-025", txn_type: "earn", points: 40, booking_id: null, description: "เล่น 18 หลุม +40 แต้ม (VIP ×1)", created_by: null, created_at: "2026-06-08T04:00:00.000Z" },

  // gm-030 คุณปรีชา (Platinum, 4,300 แต้ม)
  { id: "pt-030-1", org_id: ORG, member_id: "gm-030", txn_type: "earn", points: 2600, booking_id: null, description: "เล่น 18 หลุม +2,600 แต้ม (Platinum ×3)", created_by: null, created_at: "2026-03-22T04:00:00.000Z" },
  { id: "pt-030-2", org_id: ORG, member_id: "gm-030", txn_type: "earn", points: 1700, booking_id: null, description: "เล่น 18 หลุม +1,700 แต้ม (Platinum ×3)", created_by: null, created_at: "2026-06-10T04:00:00.000Z" },

  // gm-033 คุณนงลักษณ์ (Silver หมดอายุ, 150 แต้ม)
  { id: "pt-033-1", org_id: ORG, member_id: "gm-033", txn_type: "earn", points: 150, booking_id: null, description: "เล่น 18 หลุม +150 แต้ม (Silver ×1)", created_by: null, created_at: "2026-02-15T04:00:00.000Z" },
];
