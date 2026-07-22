"use client";

// use-shipments-state.ts — state ของหน้าจัดส่ง
// พัสดุทั้งหมดอยู่ใน data-context (state กลาง) → บันทึก COD/เลขพัสดุแล้วหน้าภาพรวม/การเงินขยับตาม
// การเปลี่ยนสถานะ "ออเดอร์" ยังผ่าน data-context + guard ใน order-flow.ts เสมอ

import { useCallback, useMemo } from "react";
import { useMattiiData } from "../_components";
import type {
  MattiiCustomer,
  MattiiOrder,
  MattiiShipment,
  ShipmentCarrier,
  ShipmentStatus,
} from "../_fixtures/types";

export interface ShipmentRow {
  key: string;
  shipment: MattiiShipment;
  /** true = ยังไม่ได้สร้างรายการส่งจริง (ออเดอร์แพ็คแล้วแต่ยังไม่ลงข้อมูลจัดส่ง) */
  isDraft: boolean;
  order: MattiiOrder | undefined;
  customer: MattiiCustomer | undefined;
}

export interface ShipmentFormInput {
  carrier: ShipmentCarrier;
  recipientName: string;
  recipientPhone: string;
  addressSnapshot: string;
  shippingCost: number;
  codAmount: number;
}

/** ลำดับสถานะพัสดุบนเส้นปกติ (mock การอัปเดตจากขนส่ง) */
const TRACKING_FLOW: ShipmentStatus[] = [
  "pending",
  "label_created",
  "picked_up",
  "in_transit",
  "delivered",
];

const TRACKING_TEXT: Record<ShipmentStatus, string> = {
  pending: "สร้างรายการส่งแล้ว รอเลขพัสดุ",
  label_created: "ได้เลขพัสดุจากขนส่งแล้ว",
  picked_up: "ขนส่งเข้ารับพัสดุแล้ว",
  in_transit: "อยู่ระหว่างขนส่ง",
  delivered: "ส่งสำเร็จ ลูกค้ารับของแล้ว",
  failed: "ส่งไม่สำเร็จ",
  returned: "พัสดุตีกลับ",
};

const nowIso = () => new Date().toISOString();
let seq = 1;

export function useShipmentsState() {
  const { shipments, orders, customers, advanceOrder, addActivity, addShipment, patchShipment } =
    useMattiiData();

  const rows = useMemo<ShipmentRow[]>(() => {
    const withOrder = shipments.map<ShipmentRow>((s) => {
      const order = orders.find((o) => o.id === s.order_id);
      return {
        key: s.id,
        shipment: s,
        isDraft: false,
        order,
        customer: order ? customers.find((c) => c.id === order.customer_id) : undefined,
      };
    });

    // ออเดอร์ที่แพ็คเสร็จรอส่ง แต่ยังไม่มีรายการจัดส่ง → แถว "ยังไม่ได้สร้างรายการส่ง"
    const covered = new Set(withOrder.map((r) => r.shipment.order_id));
    const drafts = orders
      .filter((o) => o.status === "ready_to_ship" && !covered.has(o.id))
      .map<ShipmentRow>((order) => {
        const customer = customers.find((c) => c.id === order.customer_id);
        const draft: MattiiShipment = {
          id: `draft-${order.id}`,
          org_id: order.org_id,
          order_id: order.id,
          carrier: "jt",
          tracking_no: null,
          status: "pending",
          shipnity_order_ref: null,
          recipient_name: customer?.full_name ?? customer?.display_name ?? "",
          recipient_phone: customer?.phone ?? "",
          address_snapshot: [
            customer?.address_line,
            customer?.subdistrict,
            customer?.district,
            customer?.province,
            customer?.postcode,
          ]
            .filter(Boolean)
            .join(" "),
          shipping_cost: 0,
          cod_amount: order.is_cod ? order.outstanding_amount : 0,
          cod_collected: false,
          label_created_at: null,
          picked_up_at: null,
          delivered_at: null,
          last_synced_at: null,
          tracking_events: [],
          created_at: order.updated_at,
          updated_at: order.updated_at,
        };
        return { key: draft.id, shipment: draft, isDraft: true, order, customer };
      });

    return [...drafts, ...withOrder].sort((a, b) =>
      b.shipment.updated_at.localeCompare(a.shipment.updated_at),
    );
  }, [shipments, orders, customers]);

  /** สร้างรายการจัดส่งจากออเดอร์ที่แพ็คเสร็จแล้ว */
  const createShipment = useCallback(
    (row: ShipmentRow, input: ShipmentFormInput) => {
      const record: MattiiShipment = {
        ...row.shipment,
        id: `shp-new-${Date.now()}-${seq++}`,
        carrier: input.carrier,
        recipient_name: input.recipientName,
        recipient_phone: input.recipientPhone,
        address_snapshot: input.addressSnapshot,
        shipping_cost: input.shippingCost,
        cod_amount: input.codAmount,
        status: "pending",
        tracking_events: [{ at: nowIso(), status: "pending", description: TRACKING_TEXT.pending }],
        created_at: nowIso(),
        updated_at: nowIso(),
      };
      addShipment(record);
      addActivity(
        row.shipment.order_id,
        "shipment",
        `สร้างรายการจัดส่ง (${input.carrier === "pickup" ? "ลูกค้ามารับเอง" : "ผ่านขนส่ง"})`,
      );
      return record;
    },
    [addActivity, addShipment],
  );

  /** แก้ไขรายการจัดส่งที่มีอยู่ */
  const updateShipment = useCallback(
    (row: ShipmentRow, input: ShipmentFormInput) => {
      patchShipment(row.shipment.id, {
        carrier: input.carrier,
        recipient_name: input.recipientName,
        recipient_phone: input.recipientPhone,
        address_snapshot: input.addressSnapshot,
        shipping_cost: input.shippingCost,
        cod_amount: input.codAmount,
      });
      addActivity(row.shipment.order_id, "shipment", "แก้ไขข้อมูลการจัดส่ง");
    },
    [addActivity, patchShipment],
  );

  /**
   * ซิงก์เลขพัสดุจาก Shipnity — **action ที่เขียนข้อมูล ไม่ใช่ปุ่มรีเฟรชหน้าจอ**
   * คืนจำนวนรายการที่ได้เลขพัสดุใหม่
   */
  const syncTrackingNumbers = useCallback(() => {
    const targets = rows.filter(
      (r) => !r.isDraft && r.shipment.status === "pending" && !r.shipment.tracking_no,
    );
    targets.forEach((r, idx) => {
      const seqNo = String(idx + 1).padStart(3, "0");
      const trackingNo = `JT2026TH${r.shipment.order_id.replace(/\D/g, "").padStart(4, "0")}${seqNo}`;
      patchShipment(r.shipment.id, {
        tracking_no: trackingNo,
        shipnity_order_ref: `SHN-${r.order?.order_no ?? r.shipment.order_id}`,
        status: "label_created",
        label_created_at: nowIso(),
        last_synced_at: nowIso(),
        tracking_events: [
          ...r.shipment.tracking_events,
          {
            at: nowIso(),
            status: "label_created",
            description: "ซิงก์เลขพัสดุจาก Shipnity สำเร็จ",
          },
        ],
      });
      addActivity(
        r.shipment.order_id,
        "shipment",
        `ได้เลขพัสดุ ${trackingNo} จากการซิงก์ Shipnity`,
      );
    });
    return targets.length;
  }, [rows, patchShipment, addActivity]);

  /** อัปเดตสถานะพัสดุทีละขั้น (mock webhook จากขนส่ง) */
  const advanceTracking = useCallback(
    (row: ShipmentRow): ShipmentStatus | null => {
      const idx = TRACKING_FLOW.indexOf(row.shipment.status);
      if (idx < 0 || idx >= TRACKING_FLOW.length - 1) return null;
      const next = TRACKING_FLOW[idx + 1];
      patchShipment(row.shipment.id, {
        status: next,
        last_synced_at: nowIso(),
        ...(next === "label_created" ? { label_created_at: nowIso() } : {}),
        ...(next === "picked_up" ? { picked_up_at: nowIso() } : {}),
        ...(next === "delivered" ? { delivered_at: nowIso() } : {}),
        tracking_events: [
          ...row.shipment.tracking_events,
          { at: nowIso(), status: next, description: TRACKING_TEXT[next] },
        ],
      });
      if (next === "delivered" && row.order?.status === "shipped") {
        advanceOrder(row.order.id);
      }
      return next;
    },
    [advanceOrder, patchShipment],
  );

  /** บันทึกว่าเก็บเงินปลายทางแล้ว */
  const markCodCollected = useCallback(
    (row: ShipmentRow) => {
      patchShipment(row.shipment.id, { cod_collected: true });
      addActivity(
        row.shipment.order_id,
        "payment",
        `บันทึกเก็บเงินปลายทางแล้ว ${row.shipment.cod_amount.toFixed(2)} บาท`,
      );
    },
    [addActivity, patchShipment],
  );

  return {
    rows,
    createShipment,
    updateShipment,
    syncTrackingNumbers,
    advanceTracking,
    markCodCollected,
  };
}

export { TRACKING_TEXT };
