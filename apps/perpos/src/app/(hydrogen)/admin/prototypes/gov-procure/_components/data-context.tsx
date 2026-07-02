"use client";

// data-context.tsx — GovProcureDataProvider: cross-page mock state (Context store)
// seed จาก _fixtures (orders/settings) ตอน mount → mutator อัปเดต store ในหน่วยความจำ
// ทุกหน้าที่ subscribe เห็นผลทันที (workflow สร้าง→เลื่อน stage→ค้างรับ→ปิดงาน ข้ามหน้าจริง)
// mirror hotel/_components/data-context.tsx · ไม่ต่อ DB/API จริง (prototype)
//
// import: import { GovProcureDataProvider, useData } from "../_components/data-context";

import React, { createContext, useContext, useMemo, useState } from "react";
import { GOV_PROCURE_ORDERS } from "../_fixtures/orders";
import { DEFAULT_GOV_PROCURE_SETTINGS } from "../_fixtures/settings";
import type {
  GovProcureOrder,
  GovProcureSettings,
  Stage,
  Company,
} from "../_fixtures/types";

const ORG_ID = "org-gov-procure-demo";
const CREATED_BY = "profile-owner-da";

/** input ตอนสร้างงานใหม่ — เริ่มที่ stage quotation, การเงินกรอกทีหลังได้ */
export interface NewOrderInput {
  customer_name: string;
  department: string | null;
  company: Company | null;
  qt_reference: string | null;
  product_description: string | null;
  start_date: string | null;
  price_incl_vat: number | null;
  cost_price: number | null;
  notes: string | null;
}

interface GovProcureData {
  orders: GovProcureOrder[];
  settings: GovProcureSettings;

  // ─── mutators ───
  addOrder: (input: NewOrderInput) => GovProcureOrder;
  updateOrder: (id: string, patch: Partial<GovProcureOrder>) => void;
  deleteOrder: (id: string) => void;
  /** เลื่อน stage + set วันหมุด (dialog pre-fill today, spec §4.1) */
  updateStage: (id: string, stage: Stage, milestone?: Partial<GovProcureOrder>) => void;
  /** ปิดงาน (manual close — spec §4 closed) */
  closeOrder: (id: string) => void;

  updateSettings: (patch: Partial<GovProcureSettings>) => void;
}

const Ctx = createContext<GovProcureData | null>(null);

let counter = 1;
const uid = (prefix: string) => `${prefix}-new-${Date.now()}-${counter++}`;

function nextSeqNo(orders: GovProcureOrder[]): number {
  const max = orders.reduce((m, o) => (o.seq_no != null && o.seq_no > m ? o.seq_no : m), 0);
  return max + 1;
}

export function GovProcureDataProvider({ children }: { children: React.ReactNode }) {
  const [orders, setOrders] = useState<GovProcureOrder[]>(() => GOV_PROCURE_ORDERS);
  const [settings, setSettings] = useState<GovProcureSettings>(
    () => DEFAULT_GOV_PROCURE_SETTINGS,
  );

  const value = useMemo<GovProcureData>(() => {
    const now = () => new Date().toISOString();

    const addOrder: GovProcureData["addOrder"] = (input) => {
      const gross =
        input.price_incl_vat != null && input.cost_price != null
          ? input.price_incl_vat - input.cost_price
          : null;
      const order: GovProcureOrder = {
        id: uid("gp"),
        org_id: ORG_ID,
        created_by: CREATED_BY,
        seq_no: nextSeqNo(orders),
        customer_name: input.customer_name,
        department: input.department,
        company: input.company,
        qt_reference: input.qt_reference,
        product_description: input.product_description,
        start_date: input.start_date,
        price_incl_vat: input.price_incl_vat,
        price_excl_vat: null,
        withholding_tax: null,
        net_receivable: input.price_incl_vat,
        cost_price: input.cost_price,
        gross_profit: gross,
        security_deposit: null,
        transfer_date: null,
        transfer_round1: null,
        transfer_round2: null,
        customer_change: null,
        customer_change_slip: null,
        petty_cash: null,
        petty_cash_slip: null,
        transport_buy: null,
        transport_sell: null,
        transport_other: null,
        operate_89: null,
        total_cost_89: null,
        net_profit_89: gross,
        profit_pct: null,
        commission_base_profit: null,
        commission_amount: null,
        commission_wht: null,
        commission_net_payable: null,
        commission_slip: null,
        contract_date: null,
        payment_order_date: null,
        delivery_date: null,
        receipt_date: null,
        finance_payment_date: null,
        support_payment_date: null,
        commission_payment_date: null,
        stage: "quotation",
        stage_manual_override: false,
        notes: input.notes,
        created_at: now(),
        updated_at: now(),
        attachments: [],
      };
      setOrders((prev) => [order, ...prev]);
      return order;
    };

    const updateOrder: GovProcureData["updateOrder"] = (id, patch) =>
      setOrders((prev) =>
        prev.map((o) => (o.id === id ? { ...o, ...patch, updated_at: now() } : o)),
      );

    const deleteOrder: GovProcureData["deleteOrder"] = (id) =>
      setOrders((prev) => prev.filter((o) => o.id !== id));

    const updateStage: GovProcureData["updateStage"] = (id, stage, milestone) =>
      setOrders((prev) =>
        prev.map((o) =>
          o.id === id
            ? {
                ...o,
                ...milestone,
                stage,
                // เลื่อนแบบไม่ระบุวัน = manual override (spec §4.1 soft path)
                stage_manual_override:
                  milestone && Object.keys(milestone).length > 0 ? o.stage_manual_override : true,
                updated_at: now(),
              }
            : o,
        ),
      );

    const closeOrder: GovProcureData["closeOrder"] = (id) =>
      setOrders((prev) =>
        prev.map((o) =>
          o.id === id
            ? { ...o, stage: "closed", stage_manual_override: true, updated_at: now() }
            : o,
        ),
      );

    const updateSettings: GovProcureData["updateSettings"] = (patch) =>
      setSettings((prev) => ({ ...prev, ...patch, updated_at: now() }));

    return {
      orders,
      settings,
      addOrder,
      updateOrder,
      deleteOrder,
      updateStage,
      closeOrder,
      updateSettings,
    };
  }, [orders, settings]);

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useData(): GovProcureData {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useData ต้องใช้ภายใน <GovProcureDataProvider>");
  return ctx;
}
