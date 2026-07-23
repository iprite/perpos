// queue-order.ts — จัดลำดับคิวพิมพ์อัตโนมัติแบบ **rule-based** (ไม่ใช่ AI)
//
// contract v3 §5: การจัดลำดับคิวอยู่ในรายการ "ไม่ทำด้วย AI" (cost control) → ที่นี่เป็นกฎตายตัวล้วน
// ห้ามติดป้าย/สื่อสารในหน้าเว็บว่าเป็น AI — ระบบเรียงให้ตามกฎที่อธิบายได้ทุกบรรทัด
//
// กฎเรียง (บนลงล่าง):
//   1) งานที่เลยกำหนดส่งแล้ว
//   2) งานด่วน (priority = rush)
//   3) ใกล้กำหนดส่งก่อน
//   4) งานที่ใช้ผ้าชนิดเดียวกันอยู่ติดกัน (ลดเวลาเปลี่ยนม้วนผ้า)

import type { OrderPriority } from "../_fixtures/types";

export interface QueueCandidate {
  orderId: string;
  orderNo: string;
  priority: OrderPriority;
  dueDate: string | null;
  pieces: number;
  fabricType: string | null;
}

export interface QueuePlanItem {
  orderId: string;
  orderNo: string;
  /** เหตุผลที่ถูกจัดไว้ตำแหน่งนี้ (อ้างกฎตรง ๆ) */
  reason: string;
}

export interface QueuePlan {
  summary: string;
  items: QueuePlanItem[];
}

function dueValue(due: string | null): number {
  if (!due) return Number.MAX_SAFE_INTEGER;
  const t = new Date(due).getTime();
  return Number.isNaN(t) ? Number.MAX_SAFE_INTEGER : t;
}

function daysLeft(due: string | null): number | null {
  if (!due) return null;
  const t = new Date(due);
  if (Number.isNaN(t.getTime())) return null;
  t.setHours(0, 0, 0, 0);
  const now = new Date();
  now.setHours(0, 0, 0, 0);
  return Math.round((t.getTime() - now.getTime()) / (24 * 60 * 60 * 1000));
}

/** จัดลำดับคิวพิมพ์ตามกฎด้านบน — ผลลัพธ์เป็นข้อเสนอ ผู้ใช้ต้องกด "ใช้ลำดับนี้" เอง */
export function buildQueuePlan(input: QueueCandidate[]): QueuePlan {
  const sorted = [...input].sort((a, b) => {
    const aLate = (daysLeft(a.dueDate) ?? 99) < 0 ? 0 : 1;
    const bLate = (daysLeft(b.dueDate) ?? 99) < 0 ? 0 : 1;
    if (aLate !== bLate) return aLate - bLate;
    const aRush = a.priority === "rush" ? 0 : 1;
    const bRush = b.priority === "rush" ? 0 : 1;
    if (aRush !== bRush) return aRush - bRush;
    const due = dueValue(a.dueDate) - dueValue(b.dueDate);
    if (due !== 0) return due;
    return (a.fabricType ?? "").localeCompare(b.fabricType ?? "");
  });

  const items = sorted.map((row, idx) => {
    const left = daysLeft(row.dueDate);
    const prev = sorted[idx - 1];
    const sameFabric = prev && prev.fabricType && prev.fabricType === row.fabricType;
    let reason: string;
    if (left !== null && left < 0) {
      reason = `เลยกำหนดส่งมาแล้ว ${Math.abs(left)} วัน — กฎข้อ 1 ให้ขึ้นเครื่องก่อน`;
    } else if (row.priority === "rush") {
      reason = `งานด่วน${left === null ? "" : ` เหลืออีก ${left} วัน`} — กฎข้อ 2`;
    } else if (left !== null && left <= 2) {
      reason = `ใกล้ถึงกำหนดส่ง (เหลือ ${left} วัน) พิมพ์วันนี้ยังทันแพ็คและส่ง — กฎข้อ 3`;
    } else if (sameFabric) {
      reason = `ใช้ผ้าชนิดเดียวกับงานก่อนหน้า (${row.fabricType}) — กฎข้อ 4 ต่อคิวเลยไม่ต้องเปลี่ยนม้วนผ้า`;
    } else {
      reason = `ยังมีเวลา${left === null ? "" : ` ${left} วัน`} — จัดไว้หลังงานเร่ง`;
    }
    return { orderId: row.orderId, orderNo: row.orderNo, reason };
  });

  const rushCount = input.filter((r) => r.priority === "rush").length;
  const lateCount = input.filter((r) => (daysLeft(r.dueDate) ?? 99) < 0).length;

  return {
    summary:
      input.length === 0
        ? "ไม่มีงานในคิวให้จัดลำดับ"
        : `เรียง ${input.length} งาน: ดันงานเลยกำหนด ${lateCount} งาน และงานด่วน ${rushCount} งานขึ้นก่อน แล้วจับงานผ้าชนิดเดียวกันไว้ติดกันเพื่อลดเวลาเปลี่ยนม้วนผ้า`,
    items,
  };
}
