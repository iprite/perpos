"use client";

// use-production-state.ts — รวมข้อมูลที่การ์ดงานผลิต 1 ใบต้องใช้ (ออเดอร์ + รายการพรม + เวอร์ชันที่ CF + เครื่อง)
// สถานะออเดอร์ยังเปลี่ยนผ่าน data-context + guard ใน order-flow.ts เสมอ
// ส่วนที่ data-context ยังไม่มี setter (เครื่องพิมพ์/ลำดับคิว/บันทึกของเสีย) เก็บเป็น state ของหน้านี้

import { useCallback, useMemo, useState } from "react";
import { useMattiiData } from "../_components";
import type {
  MattiiCustomer,
  MattiiMachine,
  MattiiOrder,
  MattiiOrderItem,
  QcDefectType,
} from "../_fixtures/types";

export interface ProductionCard {
  order: MattiiOrder;
  customer: MattiiCustomer | undefined;
  items: MattiiOrderItem[];
  /** จำนวนผืนรวมของออเดอร์ */
  pieces: number;
  /** ชื่อลายหลักที่จะพิมพ์ */
  patternLabel: string;
  /** ขนาดของรายการหลัก */
  sizeLabel: string;
  /** จำนวนรายการที่เหลือ (ถ้ามีมากกว่า 1 แบบในออเดอร์) */
  extraItemCount: number;
  /** เวอร์ชันไฟล์ลายที่ลูกค้ายืนยัน — null = ยังไม่ทราบเลขเวอร์ชัน */
  cfVersionNo: number | null;
  cfFileName: string | null;
  /** ลูกค้ายืนยันลายแล้วหรือยัง (fallback: ออเดอร์มี cf_approved_at = ยืนยันแล้วแน่นอน) */
  cfConfirmed: boolean;
  machine: MattiiMachine | undefined;
  fabricType: string | null;
  /** ผ้าที่ต้องใช้รวม (ตร.ม.) — ใช้ในข้อความตัดสต๊อกตอนพิมพ์เสร็จ */
  fabricSqm: number;
  /** จำนวนกล่องที่ใช้ตอนแพ็ค */
  packageCount: number;
  /** เคยพิมพ์ซ้ำมาก่อน */
  hasReprint: boolean;
}

export interface DefectLogRow {
  id: string;
  orderId: string;
  orderNo: string;
  defectType: QcDefectType;
  defectQty: number;
  defectNote: string;
  /** 🔒 owner-only — หน้าอื่นต้องไม่แสดงถ้าไม่ใช่เจ้าของ */
  defectCost: number;
  at: string;
}

export function useProductionState() {
  const {
    orders,
    customers,
    machines,
    printJobs,
    qcRecords,
    designJobs,
    designVersions,
    itemsOfOrder,
  } = useMattiiData();

  const [machineOverride, setMachineOverride] = useState<Record<string, string>>({});
  const [queueOrder, setQueueOrder] = useState<string[]>([]);
  const [defectLog, setDefectLog] = useState<DefectLogRow[]>([]);

  const cards = useMemo<ProductionCard[]>(() => {
    return orders
      .filter((o) => ["cf_approved", "printing", "qc", "packing"].includes(o.status))
      .map((order) => {
        const items = itemsOfOrder(order.id);
        const main = items[0];
        const job = designJobs.find((j) => j.order_id === order.id);
        const versionsOfJob = job
          ? designVersions
              .filter((v) => v.design_job_id === job.id)
              .sort((a, b) => a.version_no - b.version_no)
          : [];
        const approvedById = job?.approved_version_id
          ? versionsOfJob.find((v) => v.id === job.approved_version_id)
          : undefined;
        // กันหลุด: ถ้าออเดอร์ผ่านจุด "ลูกค้ายืนยันแล้ว" (cf_approved_at) ให้ถือว่ายืนยันแล้วเสมอ
        // แม้จะยังหาเวอร์ชันที่ผูกไว้ไม่เจอ — ห้ามล็อกปุ่มพิมพ์ซ้ำซ้อน (blocker B2)
        const approved =
          approvedById ??
          (order.cf_approved_at ? versionsOfJob[versionsOfJob.length - 1] : undefined);
        const cfConfirmed = !!approvedById || !!order.cf_approved_at;
        const jobsOfOrder = printJobs.filter((p) => p.order_id === order.id);
        const lastJob = jobsOfOrder[jobsOfOrder.length - 1];
        const machineId = machineOverride[order.id] ?? lastJob?.machine_id ?? null;
        const qc = qcRecords.filter((q) => q.order_id === order.id);
        return {
          order,
          customer: customers.find((c) => c.id === order.customer_id),
          items,
          pieces: items.reduce((s, it) => s + it.qty, 0),
          patternLabel: main?.pattern_name ?? main?.item_name ?? "ไม่ระบุลาย",
          sizeLabel: main?.size_label ?? "—",
          extraItemCount: Math.max(items.length - 1, 0),
          cfVersionNo: approved?.version_no ?? null,
          cfFileName: approved?.file_name ?? null,
          cfConfirmed,
          machine: machines.find((m) => m.id === machineId),
          fabricType: main?.fabric_type ?? null,
          fabricSqm:
            Math.round(items.reduce((s, it) => s + it.fabric_usage_sqm * it.qty, 0) * 100) / 100,
          // ใช้รอบที่ตรวจผ่านเป็นหลัก (รอบที่ไม่ผ่านไม่ได้แพ็คจึงไม่มีจำนวนกล่องที่จริง)
          packageCount:
            qc.filter((q) => q.result === "pass").slice(-1)[0]?.package_count ??
            qc[qc.length - 1]?.package_count ??
            1,
          hasReprint: jobsOfOrder.some((p) => p.is_reprint),
        };
      });
  }, [
    orders,
    customers,
    machines,
    printJobs,
    qcRecords,
    designJobs,
    designVersions,
    itemsOfOrder,
    machineOverride,
  ]);

  /** เรียงตามลำดับที่ผู้ใช้/AI กำหนดไว้ก่อน แล้วค่อยเรียงตามกำหนดส่ง */
  const sortCards = useCallback(
    (rows: ProductionCard[]) => {
      const rank = new Map(queueOrder.map((id, idx) => [id, idx]));
      return [...rows].sort((a, b) => {
        const ra = rank.get(a.order.id) ?? Number.MAX_SAFE_INTEGER;
        const rb = rank.get(b.order.id) ?? Number.MAX_SAFE_INTEGER;
        if (ra !== rb) return ra - rb;
        if (a.order.priority !== b.order.priority) return a.order.priority === "rush" ? -1 : 1;
        return (a.order.due_date ?? "9999").localeCompare(b.order.due_date ?? "9999");
      });
    },
    [queueOrder],
  );

  const setMachine = useCallback((orderId: string, machineId: string) => {
    setMachineOverride((prev) => ({ ...prev, [orderId]: machineId }));
  }, []);

  const applyQueueOrder = useCallback((orderIds: string[]) => {
    setQueueOrder(orderIds);
  }, []);

  const moveToFront = useCallback((orderId: string) => {
    setQueueOrder((prev) => [orderId, ...prev.filter((id) => id !== orderId)]);
  }, []);

  const moveToBack = useCallback((orderId: string) => {
    setQueueOrder((prev) => [...prev.filter((id) => id !== orderId), orderId]);
  }, []);

  const logDefect = useCallback((row: Omit<DefectLogRow, "id" | "at">) => {
    setDefectLog((prev) => [
      { ...row, id: `qcf-${Date.now()}-${prev.length}`, at: new Date().toISOString() },
      ...prev,
    ]);
  }, []);

  return {
    cards,
    machines,
    sortCards,
    setMachine,
    applyQueueOrder,
    moveToFront,
    moveToBack,
    defectLog,
    logDefect,
  };
}
