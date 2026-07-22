"use client";

// data-context.tsx — MattiiDataProvider: client state กลางของ prototype (seed จาก _fixtures)
// mutation ทุกหน้าเห็นผลร่วมกัน (เปลี่ยนสถานะออเดอร์ → หน้าผลิต/จัดส่ง/รายงานเห็นทันที)
// mock ล้วน — refresh แล้ว reset ได้ ไม่ต่อ DB/API
//
// import: import { useMattiiData } from "../_components";

import React, { createContext, useContext, useMemo, useState } from "react";
import {
  MOCK_ORG_ID,
  ORDER_STATUS_LABEL,
  activities as seedActivities,
  conversations as seedConversations,
  customers as seedCustomers,
  designJobs as seedDesignJobs,
  designVersions as seedDesignVersions,
  integrations as seedIntegrations,
  machines as seedMachines,
  materials as seedMaterials,
  messages as seedMessages,
  orderCosts as seedOrderCosts,
  orderItems as seedOrderItems,
  orders as seedOrders,
  payments as seedPayments,
  printJobs as seedPrintJobs,
  productSizes as seedProductSizes,
  products as seedProducts,
  qcRecords as seedQcRecords,
  shipments as seedShipments,
  staff as seedStaff,
  stockMovements as seedStockMovements,
} from "../_fixtures";
import type {
  ActivityType,
  MattiiActivity,
  MattiiConversation,
  MattiiCustomer,
  MattiiDesignJob,
  MattiiDesignVersion,
  MattiiIntegration,
  MattiiMachine,
  MattiiMaterial,
  MattiiMessage,
  MattiiOrder,
  MattiiOrderCost,
  MattiiOrderItem,
  MattiiPayment,
  MattiiPrintJob,
  MattiiProduct,
  MattiiProductSize,
  MattiiQcRecord,
  MattiiShipment,
  MattiiStaff,
  MattiiStockMovement,
  OrderStatus,
} from "../_fixtures/types";
import { NEXT_ACTION } from "./order-flow";
import { recalcOrderTotals, round2 } from "./money";
import { packConsumption, piecesOf, printConsumption } from "./stock-recipe";

export interface NewOrderItemInput {
  product_id: string | null;
  product_size_id: string | null;
  item_name: string;
  size_label: string;
  width_cm: number | null;
  length_cm: number | null;
  fabric_type: string | null;
  edge_finish: MattiiOrderItem["edge_finish"];
  pattern_name: string | null;
  qty: number;
  unit_price: number;
  unit_cost: number;
  fabric_usage_sqm: number;
  spec_note: string | null;
}

export interface NewDesignVersionInput {
  file_name: string;
  note: string | null;
  uploaded_by_id: string;
}

export interface NewStockMovementInput {
  material_id: string;
  move_type: MattiiStockMovement["move_type"];
  /** + รับเข้า/คืน · − ตัดออก/ของเสีย */
  qty_delta: number;
  reason?: string | null;
  order_id?: string | null;
  print_job_id?: string | null;
  staff_id?: string | null;
}

export interface NewOrderCostInput {
  order_id: string;
  cost_category: MattiiOrderCost["cost_category"];
  label: string;
  amount: number;
  source?: MattiiOrderCost["source"];
  stock_movement_id?: string | null;
  note?: string | null;
}

export interface NewQcRecordInput {
  order_id: string;
  result: MattiiQcRecord["result"];
  defect_type?: MattiiQcRecord["defect_type"];
  defect_note?: string | null;
  defect_qty?: number;
  /** 🔒 owner-only — มูลค่าของเสีย */
  defect_cost?: number;
  package_count?: number;
  checked_by_id?: string;
}

export interface NewPrintJobInput {
  order_id: string;
  machine_id?: string | null;
  design_version_id?: string | null;
  pieces: number;
  is_reprint?: boolean;
  reprint_of_job_id?: string | null;
  material_note?: string | null;
}

export interface NewOrderInput {
  customer_id: string;
  source_channel: MattiiOrder["source_channel"];
  design_source: MattiiOrder["design_source"];
  priority: MattiiOrder["priority"];
  due_date: string | null;
  is_cod: boolean;
  note: string | null;
}

interface MattiiData {
  // ── data ──
  orders: MattiiOrder[];
  orderItems: MattiiOrderItem[];
  orderCosts: MattiiOrderCost[];
  customers: MattiiCustomer[];
  staff: MattiiStaff[];
  products: MattiiProduct[];
  productSizes: MattiiProductSize[];
  designJobs: MattiiDesignJob[];
  designVersions: MattiiDesignVersion[];
  machines: MattiiMachine[];
  printJobs: MattiiPrintJob[];
  qcRecords: MattiiQcRecord[];
  shipments: MattiiShipment[];
  payments: MattiiPayment[];
  materials: MattiiMaterial[];
  stockMovements: MattiiStockMovement[];
  conversations: MattiiConversation[];
  messages: MattiiMessage[];
  integrations: MattiiIntegration[];
  activities: MattiiActivity[];

  // ── mutators: ออเดอร์ ──
  /** สร้างออเดอร์ใหม่ (สถานะ draft) — คืนออเดอร์ที่สร้าง */
  addOrder: (input: NewOrderInput) => MattiiOrder;
  /** เดินไปสถานะถัดไปตาม NEXT_ACTION — คืนข้อความสำหรับ toast (null = ทำไม่ได้) */
  advanceOrder: (orderId: string) => string | null;
  /** เปลี่ยนสถานะแบบระบุปลายทาง (ใช้กับ action รอง เช่น ย้อนกลับไปแก้ลาย / QC ไม่ผ่าน) */
  moveOrder: (orderId: string, to: OrderStatus, message: string) => void;
  holdOrder: (orderId: string, reason: string) => void;
  unholdOrder: (orderId: string) => void;
  cancelOrder: (orderId: string, reason: string) => void;
  updateOrder: (orderId: string, patch: Partial<MattiiOrder>) => void;

  // ── mutators: รายการพรมในออเดอร์ ──
  addOrderItem: (orderId: string, input: NewOrderItemInput) => void;
  updateOrderItem: (itemId: string, patch: Partial<MattiiOrderItem>) => void;
  removeOrderItem: (itemId: string) => void;

  // ── mutators: งานแบบลาย & เวอร์ชันไฟล์ (ใช้ร่วมกันทั้ง /design และ /production) ──
  /** งานแบบของออเดอร์นี้ (ถ้ามี) */
  designJobOfOrder: (orderId: string) => MattiiDesignJob | undefined;
  /** สร้างงานแบบให้ออเดอร์ถ้ายังไม่มี — คืนงานแบบที่ใช้งานได้ (undefined = ไม่พบออเดอร์) */
  ensureDesignJob: (orderId: string) => MattiiDesignJob | undefined;
  patchDesignJob: (jobId: string, patch: Partial<MattiiDesignJob>) => void;
  /** เพิ่มเวอร์ชันไฟล์ลายใหม่ (mock upload) — คืนเวอร์ชันที่สร้าง */
  addDesignVersion: (
    jobId: string,
    input: NewDesignVersionInput,
  ) => MattiiDesignVersion | undefined;
  patchDesignVersion: (versionId: string, patch: Partial<MattiiDesignVersion>) => void;

  // ── mutators: วัสดุ & สต๊อก (ใช้ร่วมทั้ง /materials และการตัดสต๊อกอัตโนมัติ) ──
  /** บันทึกความเคลื่อนไหวสต๊อก 1 แถว + อัปเดต qty_on_hand/stock_value ของวัสดุ */
  addStockMovement: (input: NewStockMovementInput) => MattiiStockMovement | undefined;
  /** เพิ่มต้นทุนต่อออเดอร์ (🔒 owner-only surface) + ดันยอด total_cost/gross_profit ของออเดอร์ */
  addOrderCost: (input: NewOrderCostInput) => MattiiOrderCost | undefined;

  // ── mutators: งานผลิต (QC / รอบพิมพ์) ──
  /** บันทึกผลตรวจคุณภาพ 1 รอบ (รายงานของเสียในหน้ารายงานอ่านจากที่นี่) */
  addQcRecord: (input: NewQcRecordInput) => MattiiQcRecord;
  /** เปิดรอบพิมพ์ใหม่ (เช่น พิมพ์ซ้ำหลัง QC ไม่ผ่าน) — ดันอัตราพิมพ์ซ้ำใน KPI */
  addPrintJob: (input: NewPrintJobInput) => MattiiPrintJob;

  // ── mutators: การเงิน ──
  addPayment: (row: MattiiPayment) => void;
  patchPayment: (paymentId: string, patch: Partial<MattiiPayment>) => void;

  // ── mutators: จัดส่ง ──
  addShipment: (row: MattiiShipment) => void;
  patchShipment: (shipmentId: string, patch: Partial<MattiiShipment>) => void;

  // ── timeline ──
  addActivity: (
    orderId: string | null,
    type: ActivityType,
    message: string,
    actorLabel?: string,
  ) => void;

  // ── helper อ่านข้อมูลที่ใช้บ่อย ──
  itemsOfOrder: (orderId: string) => MattiiOrderItem[];
  activitiesOfOrder: (orderId: string) => MattiiActivity[];
  customerOf: (customerId: string) => MattiiCustomer | undefined;
  staffOf: (staffId: string | null) => MattiiStaff | undefined;
}

const Ctx = createContext<MattiiData | null>(null);

let counter = 1;
const uid = (prefix: string) => `${prefix}-new-${Date.now()}-${counter++}`;

export function MattiiDataProvider({ children }: { children: React.ReactNode }) {
  const [orders, setOrders] = useState<MattiiOrder[]>(() => seedOrders);
  const [orderItems, setOrderItems] = useState<MattiiOrderItem[]>(() => seedOrderItems);
  const [orderCosts, setOrderCosts] = useState<MattiiOrderCost[]>(() => seedOrderCosts);
  // ชุดข้อมูลอ้างอิงที่ยัง read-only (ข้อมูลหลักที่ prototype ไม่ได้ให้แก้ในรอบนี้)
  const [customers] = useState<MattiiCustomer[]>(() => seedCustomers);
  const [staffList] = useState<MattiiStaff[]>(() => seedStaff);
  const [products] = useState<MattiiProduct[]>(() => seedProducts);
  const [productSizes] = useState<MattiiProductSize[]>(() => seedProductSizes);
  const [designJobs, setDesignJobs] = useState<MattiiDesignJob[]>(() => seedDesignJobs);
  const [designVersions, setDesignVersions] = useState<MattiiDesignVersion[]>(
    () => seedDesignVersions,
  );
  const [machines] = useState<MattiiMachine[]>(() => seedMachines);
  const [printJobs, setPrintJobs] = useState<MattiiPrintJob[]>(() => seedPrintJobs);
  const [qcRecords, setQcRecords] = useState<MattiiQcRecord[]>(() => seedQcRecords);
  const [shipments, setShipments] = useState<MattiiShipment[]>(() => seedShipments);
  const [payments, setPayments] = useState<MattiiPayment[]>(() => seedPayments);
  const [materials, setMaterials] = useState<MattiiMaterial[]>(() => seedMaterials);
  const [stockMovements, setStockMovements] = useState<MattiiStockMovement[]>(
    () => seedStockMovements,
  );
  // กันตัดสต๊อกซ้ำ (idempotent §3.17) — key = `${orderId}:print` / `${orderId}:pack`
  // QC ไม่ผ่าน → ล้าง token ของรอบพิมพ์ เพราะรอบใหม่ต้องตัดวัสดุอีกครั้ง (ของเดิมนับเป็นของเสีย)
  const [stockCutTokens, setStockCutTokens] = useState<Record<string, boolean>>({});
  const [conversations] = useState<MattiiConversation[]>(() => seedConversations);
  const [messages] = useState<MattiiMessage[]>(() => seedMessages);
  const [integrations] = useState<MattiiIntegration[]>(() => seedIntegrations);
  const [activities, setActivities] = useState<MattiiActivity[]>(() => seedActivities);

  const value = useMemo<MattiiData>(() => {
    const now = () => new Date().toISOString();

    const pushActivity = (
      orderId: string | null,
      activity_type: ActivityType,
      message: string,
      actorLabel = "ผู้ใช้ระบบ",
      fromStatus?: OrderStatus,
      toStatus?: OrderStatus,
    ) => {
      const row: MattiiActivity = {
        id: uid("act"),
        org_id: MOCK_ORG_ID,
        order_id: orderId,
        activity_type,
        actor_id: null,
        actor_label: actorLabel,
        from_status: fromStatus ?? null,
        to_status: toStatus ?? null,
        message,
        meta: {},
        occurred_at: now(),
        created_at: now(),
      };
      setActivities((prev) => [row, ...prev]);
    };

    /** อัปเดตสถานะ + milestone timestamp ที่เกี่ยวข้อง */
    const applyStatus = (order: MattiiOrder, to: OrderStatus): MattiiOrder => {
      const patch: Partial<MattiiOrder> = { status: to, updated_at: now() };
      if (to === "confirmed" && !order.confirmed_at) patch.confirmed_at = now();
      if (to === "cf_approved" && !order.cf_approved_at) patch.cf_approved_at = now();
      if (to === "qc" && !order.printed_at) patch.printed_at = now();
      if (to === "shipped" && !order.shipped_at) patch.shipped_at = now();
      if (to === "delivered" && !order.delivered_at) patch.delivered_at = now();
      return { ...order, ...patch };
    };

    const nextOrderNo = (): string => {
      const max = orders.reduce((m, o) => {
        const n = Number(o.order_no.split("-").pop());
        return Number.isFinite(n) && n > m ? n : m;
      }, 0);
      return `MT-2026-${String(max + 1).padStart(4, "0")}`;
    };

    const addOrder: MattiiData["addOrder"] = (input) => {
      const row: MattiiOrder = {
        id: uid("ord"),
        org_id: MOCK_ORG_ID,
        order_no: nextOrderNo(),
        customer_id: input.customer_id,
        conversation_id: null,
        source_channel: input.source_channel,
        status: "draft",
        priority: input.priority,
        design_source: input.design_source,
        sale_staff_id: null,
        due_date: input.due_date,
        promised_ship_date: null,
        subtotal: 0,
        discount_amount: 0,
        shipping_fee: 0,
        rush_fee: 0,
        total_amount: 0,
        paid_amount: 0,
        outstanding_amount: 0,
        total_cost: 0,
        gross_profit: 0,
        margin_percent: 0,
        is_cod: input.is_cod,
        cancel_reason: null,
        hold_reason: null,
        previous_status: null,
        note: input.note,
        confirmed_at: null,
        cf_approved_at: null,
        printed_at: null,
        shipped_at: null,
        delivered_at: null,
        created_at: now(),
        updated_at: now(),
      };
      setOrders((prev) => [row, ...prev]);
      pushActivity(row.id, "system", `สร้างออเดอร์ ${row.order_no} (ฉบับร่าง)`);
      return row;
    };

    const designJobOfOrder: MattiiData["designJobOfOrder"] = (orderId) =>
      designJobs.find((j) => j.order_id === orderId);

    const nextDesignJobNo = (): string => {
      const max = designJobs.reduce((m, j) => {
        const n = Number(j.job_no.split("-").pop());
        return Number.isFinite(n) && n > m ? n : m;
      }, 0);
      return `DSN-${String(max + 1).padStart(4, "0")}`;
    };

    /** สร้างงานแบบให้ออเดอร์ถ้ายังไม่มี (Contract §3.7: confirmed → designing ต้องมีงานแบบ) */
    const ensureDesignJob: MattiiData["ensureDesignJob"] = (orderId) => {
      const existing = designJobs.find((j) => j.order_id === orderId);
      if (existing) return existing;
      const order = orders.find((o) => o.id === orderId);
      if (!order) return undefined;
      const row: MattiiDesignJob = {
        id: uid("dsj"),
        org_id: MOCK_ORG_ID,
        order_id: orderId,
        job_no: nextDesignJobNo(),
        design_source: order.design_source,
        status: "queued",
        assigned_designer_id: null,
        brief: order.note,
        cf_status: "not_sent",
        revision_count: 0,
        approved_version_id: null,
        due_at: order.due_date,
        started_at: null,
        approved_at: null,
        created_at: now(),
        updated_at: now(),
      };
      setDesignJobs((prev) => [row, ...prev]);
      pushActivity(orderId, "system", `สร้างงานแบบ ${row.job_no} เข้าคิวทีมกราฟิกอัตโนมัติ`);
      return row;
    };

    const patchDesignJob: MattiiData["patchDesignJob"] = (jobId, patch) =>
      setDesignJobs((prev) =>
        prev.map((j) => (j.id === jobId ? { ...j, ...patch, updated_at: now() } : j)),
      );

    const addDesignVersion: MattiiData["addDesignVersion"] = (jobId, input) => {
      const job = designJobs.find((j) => j.id === jobId);
      if (!job) return undefined;
      const nextNo =
        designVersions
          .filter((v) => v.design_job_id === jobId)
          .reduce((m, v) => Math.max(m, v.version_no), 0) + 1;
      const row: MattiiDesignVersion = {
        id: uid("dvr"),
        org_id: job.org_id,
        design_job_id: jobId,
        version_no: nextNo,
        file_name: input.file_name,
        file_url: null,
        preview_url: null,
        file_size_kb: 4200,
        dpi: 300,
        uploaded_by_id: input.uploaded_by_id,
        uploaded_by_role: "designer",
        cf_status: "not_sent",
        cf_sent_at: null,
        cf_responded_at: null,
        customer_feedback: null,
        is_print_ready: false,
        note: input.note,
        created_at: now(),
        updated_at: now(),
      };
      setDesignVersions((prev) => [...prev, row]);
      return row;
    };

    const patchDesignVersion: MattiiData["patchDesignVersion"] = (versionId, patch) =>
      setDesignVersions((prev) =>
        prev.map((v) => (v.id === versionId ? { ...v, ...patch, updated_at: now() } : v)),
      );

    // ── สต๊อก & ต้นทุน ─────────────────────────────────────────────────────
    const money2 = (n: number) => Math.round(n * 100) / 100;
    const qty3 = (n: number) => Math.round(n * 1000) / 1000;

    const addStockMovement: MattiiData["addStockMovement"] = (input) => {
      const material = materials.find((m) => m.id === input.material_id);
      if (!material) return undefined;
      const nextQty = qty3(material.qty_on_hand + input.qty_delta);
      const row: MattiiStockMovement = {
        id: uid("mov"),
        org_id: MOCK_ORG_ID,
        material_id: material.id,
        move_type: input.move_type,
        qty_delta: qty3(input.qty_delta),
        qty_after: nextQty,
        unit_cost_at_move: material.unit_cost,
        total_cost: money2(Math.abs(input.qty_delta) * material.unit_cost),
        order_id: input.order_id ?? null,
        print_job_id: input.print_job_id ?? null,
        staff_id: input.staff_id ?? null,
        reason: input.reason ?? null,
        occurred_at: now(),
        created_at: now(),
        updated_at: now(),
      };
      setStockMovements((prev) => [row, ...prev]);
      setMaterials((prev) =>
        prev.map((m) =>
          m.id === material.id
            ? {
                ...m,
                qty_on_hand: nextQty,
                stock_value: money2(nextQty * m.unit_cost),
                updated_at: now(),
              }
            : m,
        ),
      );
      return row;
    };

    /** ดันต้นทุน/กำไรของออเดอร์ตามยอดต้นทุนที่เพิ่มเข้ามา (total_cost = ผลรวม order_costs) */
    const bumpOrderCostTotal = (orderId: string, amount: number) => {
      if (amount === 0) return;
      setOrders((prev) =>
        prev.map((o) => {
          if (o.id !== orderId) return o;
          const totalCost = money2(o.total_cost + amount);
          const gross = money2(o.total_amount - totalCost);
          return {
            ...o,
            total_cost: totalCost,
            gross_profit: gross,
            margin_percent: o.total_amount > 0 ? money2((gross / o.total_amount) * 100) : 0,
            updated_at: now(),
          };
        }),
      );
    };

    const addOrderCost: MattiiData["addOrderCost"] = (input) => {
      const row: MattiiOrderCost = {
        id: uid("ocst"),
        org_id: MOCK_ORG_ID,
        order_id: input.order_id,
        cost_category: input.cost_category,
        label: input.label,
        amount: money2(input.amount),
        source: input.source ?? "manual",
        stock_movement_id: input.stock_movement_id ?? null,
        note: input.note ?? null,
        created_at: now(),
        updated_at: now(),
      };
      setOrderCosts((prev) => [...prev, row]);
      bumpOrderCostTotal(input.order_id, row.amount);
      return row;
    };

    /**
     * ตัดสต๊อกตามจุดใน Contract §3.17 — จุด A (พิมพ์เสร็จ) / จุด B (แพ็คเสร็จ)
     * idempotent ด้วย token ต่อออเดอร์ต่อจุด · สร้าง movement + ลด qty_on_hand + order_cost(auto_stock)
     */
    const consumeStock = (orderId: string, point: "print" | "pack") => {
      const token = `${orderId}:${point}`;
      if (stockCutTokens[token]) return;
      const order = orders.find((o) => o.id === orderId);
      if (!order) return;
      const items = orderItems.filter((it) => it.order_id === orderId);
      if (items.length === 0) return;

      const qc = qcRecords.filter((q) => q.order_id === orderId);
      // จำนวนกล่องมาจากรอบที่ตรวจ "ผ่าน" (รอบที่ไม่ผ่านยังไม่ได้แพ็ค) — ไม่มีข้อมูลถือเป็น 1 กล่อง
      const packageCount =
        qc.filter((q) => q.result === "pass").slice(-1)[0]?.package_count ??
        qc[qc.length - 1]?.package_count ??
        1;
      const lines =
        point === "print"
          ? printConsumption(items, materials)
          : packConsumption(packageCount, piecesOf(items), materials);
      if (lines.length === 0) return;

      const moveType = point === "print" ? "consume_print" : "consume_pack";
      const movements: MattiiStockMovement[] = [];
      const costs: MattiiOrderCost[] = [];
      // ยอดคงเหลือระหว่างชุด (กันกรณีวัสดุตัวเดียวถูกตัดหลายบรรทัด → qty_after ต้องต่อเนื่อง)
      const runningQty = new Map<string, number>();
      let costTotal = 0;

      for (const line of lines) {
        const before = runningQty.get(line.material.id) ?? line.material.qty_on_hand;
        const after = qty3(before - line.qty);
        runningQty.set(line.material.id, after);
        const movement: MattiiStockMovement = {
          id: uid("mov"),
          org_id: MOCK_ORG_ID,
          material_id: line.material.id,
          move_type: moveType,
          qty_delta: qty3(-line.qty),
          qty_after: after,
          unit_cost_at_move: line.material.unit_cost,
          total_cost: money2(line.qty * line.material.unit_cost),
          order_id: orderId,
          print_job_id: null,
          staff_id: null,
          reason:
            point === "print"
              ? `ตัดวัสดุผลิตอัตโนมัติ (${order.order_no}) — ${line.label}`
              : `ตัดวัสดุแพ็คอัตโนมัติ (${order.order_no}) — ${line.label}`,
          occurred_at: now(),
          created_at: now(),
          updated_at: now(),
        };
        movements.push(movement);
        costTotal = money2(costTotal + movement.total_cost);
        costs.push({
          id: uid("ocst"),
          org_id: MOCK_ORG_ID,
          order_id: orderId,
          cost_category: "material",
          label: line.label,
          amount: movement.total_cost,
          source: "auto_stock",
          stock_movement_id: movement.id,
          note: point === "print" ? "ตัดตอนพิมพ์เสร็จ" : "ตัดตอนแพ็คเสร็จ",
          created_at: now(),
          updated_at: now(),
        });
      }

      setStockMovements((prev) => [...movements.slice().reverse(), ...prev]);
      setMaterials((prev) =>
        prev.map((m) => {
          const after = runningQty.get(m.id);
          if (after === undefined) return m;
          return {
            ...m,
            qty_on_hand: after,
            stock_value: money2(after * m.unit_cost),
            updated_at: now(),
          };
        }),
      );
      setOrderCosts((prev) => [...prev, ...costs]);
      bumpOrderCostTotal(orderId, costTotal);
      setStockCutTokens((prev) => ({ ...prev, [token]: true }));
      pushActivity(
        orderId,
        "stock",
        point === "print"
          ? `ตัดวัสดุผลิตออกจากสต๊อก: ${lines.map((l) => l.label).join(" · ")}`
          : `ตัดวัสดุแพ็คออกจากสต๊อก: ${lines.map((l) => l.label).join(" · ")}`,
        "ระบบ",
      );
    };

    /** QC ไม่ผ่าน → วัสดุรอบก่อนเป็นของเสีย (ไม่คืนสต๊อก) และรอบพิมพ์ใหม่ต้องตัดอีกครั้ง */
    const resetPrintCutToken = (orderId: string) =>
      setStockCutTokens((prev) => {
        if (!prev[`${orderId}:print`]) return prev;
        const next = { ...prev };
        delete next[`${orderId}:print`];
        return next;
      });

    const addQcRecord: MattiiData["addQcRecord"] = (input) => {
      const row: MattiiQcRecord = {
        id: uid("qcr"),
        org_id: MOCK_ORG_ID,
        order_id: input.order_id,
        print_job_id: null,
        checked_by_id: input.checked_by_id ?? "",
        checked_at: now(),
        result: input.result,
        defect_type: input.defect_type ?? null,
        defect_note: input.defect_note ?? null,
        defect_qty: input.defect_qty ?? 0,
        defect_cost: input.defect_cost ?? 0,
        photo_url: null,
        packing_status: "not_packed",
        packed_by_id: null,
        packed_at: null,
        package_count: input.package_count ?? 1,
        weight_kg: null,
        created_at: now(),
        updated_at: now(),
      };
      setQcRecords((prev) => [...prev, row]);
      return row;
    };

    const addPrintJob: MattiiData["addPrintJob"] = (input) => {
      const max = printJobs.reduce((m, p) => {
        const n = Number(p.job_no.split("-").pop());
        return Number.isFinite(n) && n > m ? n : m;
      }, 0);
      const row: MattiiPrintJob = {
        id: uid("pjb"),
        org_id: MOCK_ORG_ID,
        order_id: input.order_id,
        job_no: `PRT-${String(max + 1).padStart(4, "0")}`,
        machine_id: input.machine_id ?? null,
        design_version_id: input.design_version_id ?? null,
        status: "queued",
        queue_position: printJobs.filter((p) => p.status === "queued").length + 1,
        is_reprint: input.is_reprint ?? false,
        reprint_of_job_id: input.reprint_of_job_id ?? null,
        operator_id: null,
        planned_start_at: null,
        started_at: null,
        finished_at: null,
        pieces: input.pieces,
        material_note: input.material_note ?? null,
        created_at: now(),
        updated_at: now(),
      };
      setPrintJobs((prev) => [...prev, row]);
      return row;
    };

    const addPayment: MattiiData["addPayment"] = (row) => setPayments((prev) => [row, ...prev]);

    const patchPayment: MattiiData["patchPayment"] = (paymentId, patch) =>
      setPayments((prev) =>
        prev.map((p) => (p.id === paymentId ? { ...p, ...patch, updated_at: now() } : p)),
      );

    const addShipment: MattiiData["addShipment"] = (row) => setShipments((prev) => [...prev, row]);

    const patchShipment: MattiiData["patchShipment"] = (shipmentId, patch) =>
      setShipments((prev) =>
        prev.map((s) => (s.id === shipmentId ? { ...s, ...patch, updated_at: now() } : s)),
      );

    const advanceOrder: MattiiData["advanceOrder"] = (orderId) => {
      const order = orders.find((o) => o.id === orderId);
      if (!order) return null;
      const next = NEXT_ACTION[order.status];
      if (!next) return null;
      setOrders((prev) => prev.map((o) => (o.id === orderId ? applyStatus(o, next.to) : o)));
      // Contract §3.7: ยืนยันออเดอร์ → สร้างงานแบบอัตโนมัติ · และเข้าช่วง "ทำลาย" ต้องมีงานแบบเสมอ
      if (next.to === "confirmed" || next.to === "designing") ensureDesignJob(orderId);
      // Contract §3.17 จุดตัดสต๊อก: A = พิมพ์เสร็จ (printing → qc) · B = แพ็คเสร็จ (packing → ready_to_ship)
      if (order.status === "printing" && next.to === "qc") consumeStock(orderId, "print");
      if (order.status === "packing" && next.to === "ready_to_ship") consumeStock(orderId, "pack");
      pushActivity(
        orderId,
        "status_change",
        `${ORDER_STATUS_LABEL[order.status]} → ${ORDER_STATUS_LABEL[next.to]}`,
        "ผู้ใช้ระบบ",
        order.status,
        next.to,
      );
      return `${order.order_no}: ${ORDER_STATUS_LABEL[next.to]}`;
    };

    const moveOrder: MattiiData["moveOrder"] = (orderId, to, message) => {
      const order = orders.find((o) => o.id === orderId);
      if (!order) return;
      setOrders((prev) => prev.map((o) => (o.id === orderId ? applyStatus(o, to) : o)));
      if (to === "designing") ensureDesignJob(orderId);
      // QC ไม่ผ่าน (qc → printing): วัสดุรอบก่อน = ของเสีย ไม่คืนสต๊อก แต่รอบพิมพ์ใหม่ต้องตัดอีกครั้ง (§3.17)
      if (order.status === "qc" && to === "printing") resetPrintCutToken(orderId);
      // เดินหน้าด้วยเส้นทางรอง (เช่นสั่งจากหน้าอื่น) ก็ต้องตัดสต๊อกที่จุดเดียวกันเสมอ
      if (order.status === "printing" && to === "qc") consumeStock(orderId, "print");
      if (order.status === "packing" && to === "ready_to_ship") consumeStock(orderId, "pack");
      pushActivity(orderId, "status_change", message, "ผู้ใช้ระบบ", order.status, to);
    };

    const holdOrder: MattiiData["holdOrder"] = (orderId, reason) => {
      const order = orders.find((o) => o.id === orderId);
      if (!order) return;
      setOrders((prev) =>
        prev.map((o) =>
          o.id === orderId
            ? {
                ...o,
                status: "on_hold",
                previous_status: o.status,
                hold_reason: reason,
                updated_at: now(),
              }
            : o,
        ),
      );
      pushActivity(
        orderId,
        "status_change",
        `พักงานชั่วคราว — ${reason}`,
        "ผู้ใช้ระบบ",
        order.status,
        "on_hold",
      );
    };

    const unholdOrder: MattiiData["unholdOrder"] = (orderId) => {
      const order = orders.find((o) => o.id === orderId);
      if (!order) return;
      const back: OrderStatus = order.previous_status ?? "confirmed";
      setOrders((prev) =>
        prev.map((o) =>
          o.id === orderId
            ? { ...o, status: back, previous_status: null, hold_reason: null, updated_at: now() }
            : o,
        ),
      );
      pushActivity(
        orderId,
        "status_change",
        `ปลดพักงาน → ${ORDER_STATUS_LABEL[back]}`,
        "ผู้ใช้ระบบ",
        "on_hold",
        back,
      );
    };

    const cancelOrder: MattiiData["cancelOrder"] = (orderId, reason) => {
      const order = orders.find((o) => o.id === orderId);
      if (!order) return;
      setOrders((prev) =>
        prev.map((o) =>
          o.id === orderId
            ? {
                ...o,
                status: "cancelled",
                previous_status: o.status,
                cancel_reason: reason,
                updated_at: now(),
              }
            : o,
        ),
      );
      pushActivity(
        orderId,
        "status_change",
        `ยกเลิกออเดอร์ — ${reason}`,
        "ผู้ใช้ระบบ",
        order.status,
        "cancelled",
      );
    };

    const updateOrder: MattiiData["updateOrder"] = (orderId, patch) =>
      setOrders((prev) =>
        prev.map((o) => (o.id === orderId ? { ...o, ...patch, updated_at: now() } : o)),
      );

    /** คำนวณยอดออเดอร์ใหม่จากรายการล่าสุด */
    const syncTotals = (orderId: string, items: MattiiOrderItem[]) => {
      const order = orders.find((o) => o.id === orderId);
      if (!order) return;
      const mine = items.filter((it) => it.order_id === orderId);
      const totals = recalcOrderTotals(order, mine);
      const totalCost = round2(mine.reduce((s, it) => s + it.unit_cost * it.qty, 0));
      const gross = round2(totals.total_amount - totalCost);
      setOrders((prev) =>
        prev.map((o) =>
          o.id === orderId
            ? {
                ...o,
                ...totals,
                total_cost: totalCost > 0 ? totalCost : o.total_cost,
                gross_profit: totalCost > 0 ? gross : o.gross_profit,
                margin_percent:
                  totalCost > 0 && totals.total_amount > 0
                    ? round2((gross / totals.total_amount) * 100)
                    : o.margin_percent,
                updated_at: now(),
              }
            : o,
        ),
      );
    };

    const addOrderItem: MattiiData["addOrderItem"] = (orderId, input) => {
      const mine = orderItems.filter((it) => it.order_id === orderId);
      const row: MattiiOrderItem = {
        id: uid("oit"),
        org_id: MOCK_ORG_ID,
        order_id: orderId,
        line_no: mine.length + 1,
        product_id: input.product_id,
        product_size_id: input.product_size_id,
        item_name: input.item_name,
        size_label: input.size_label,
        width_cm: input.width_cm,
        length_cm: input.length_cm,
        fabric_type: input.fabric_type,
        edge_finish: input.edge_finish,
        pattern_name: input.pattern_name,
        qty: input.qty,
        unit_price: input.unit_price,
        unit_cost: input.unit_cost,
        line_total: round2(input.qty * input.unit_price),
        fabric_usage_sqm: input.fabric_usage_sqm,
        options: {},
        spec_note: input.spec_note,
        created_at: now(),
        updated_at: now(),
      };
      const next = [...orderItems, row];
      setOrderItems(next);
      syncTotals(orderId, next);
      pushActivity(orderId, "note", `เพิ่มรายการ: ${row.item_name} ${row.size_label} × ${row.qty}`);
    };

    const updateOrderItem: MattiiData["updateOrderItem"] = (itemId, patch) => {
      const target = orderItems.find((it) => it.id === itemId);
      if (!target) return;
      const merged: MattiiOrderItem = { ...target, ...patch, updated_at: now() };
      merged.line_total = round2(merged.qty * merged.unit_price);
      const next = orderItems.map((it) => (it.id === itemId ? merged : it));
      setOrderItems(next);
      syncTotals(target.order_id, next);
      pushActivity(target.order_id, "note", `แก้ไขรายการ: ${merged.item_name}`);
    };

    const removeOrderItem: MattiiData["removeOrderItem"] = (itemId) => {
      const target = orderItems.find((it) => it.id === itemId);
      if (!target) return;
      const next = orderItems.filter((it) => it.id !== itemId);
      setOrderItems(next);
      syncTotals(target.order_id, next);
      pushActivity(target.order_id, "note", `ลบรายการ: ${target.item_name}`);
    };

    const addActivity: MattiiData["addActivity"] = (orderId, type, message, actorLabel) =>
      pushActivity(orderId, type, message, actorLabel);

    return {
      orders,
      orderItems,
      orderCosts,
      customers,
      staff: staffList,
      products,
      productSizes,
      designJobs,
      designVersions,
      machines,
      printJobs,
      qcRecords,
      shipments,
      payments,
      materials,
      stockMovements,
      conversations,
      messages,
      integrations,
      activities,

      addOrder,
      advanceOrder,
      moveOrder,
      holdOrder,
      unholdOrder,
      cancelOrder,
      updateOrder,
      addOrderItem,
      updateOrderItem,
      removeOrderItem,
      designJobOfOrder,
      ensureDesignJob,
      patchDesignJob,
      addDesignVersion,
      patchDesignVersion,
      addStockMovement,
      addOrderCost,
      addQcRecord,
      addPrintJob,
      addPayment,
      patchPayment,
      addShipment,
      patchShipment,
      addActivity,

      itemsOfOrder: (orderId) =>
        orderItems.filter((it) => it.order_id === orderId).sort((a, b) => a.line_no - b.line_no),
      activitiesOfOrder: (orderId) =>
        activities
          .filter((a) => a.order_id === orderId)
          .sort((a, b) => b.occurred_at.localeCompare(a.occurred_at)),
      customerOf: (customerId) => customers.find((c) => c.id === customerId),
      staffOf: (staffId) => (staffId ? staffList.find((s) => s.id === staffId) : undefined),
    };
  }, [
    orders,
    orderItems,
    orderCosts,
    customers,
    staffList,
    products,
    productSizes,
    designJobs,
    designVersions,
    machines,
    printJobs,
    qcRecords,
    shipments,
    payments,
    materials,
    stockMovements,
    conversations,
    messages,
    integrations,
    activities,
    stockCutTokens,
  ]);

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useMattiiData(): MattiiData {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useMattiiData ต้องใช้ภายใน <MattiiDataProvider>");
  return ctx;
}
