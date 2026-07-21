"use client";

// data-context.tsx — GolfDataProvider: cross-page mock state (Context store)
// seed จาก _fixtures/* ตอน mount → mutator อัปเดต store ในหน่วยความจำ
// ทุกหน้าที่ subscribe เห็นผลทันที (workflow จอง→ยืนยัน→เช็คอิน→จบ/no-show ข้ามหน้าจริง)
//
// import: import { GolfDataProvider, useGolfData } from "../_components/data-context";

import React, { createContext, useContext, useMemo, useState } from "react";
import {
  golfMembers as seedMembers,
  golfResources as seedResources,
  golfPriceItems as seedPrices,
  allGolfBookings as seedBookings,
  golfMembershipPlans as seedPlans,
  golfPointTransactions as seedPoints,
  golfSettings as seedSettings,
  GOLF_ORG_ID,
} from "../_fixtures";
import type {
  GolfMember,
  GolfResource,
  GolfPriceItem,
  GolfBooking,
  GolfMembershipPlan,
  GolfPointTransaction,
  GolfSettings,
  GolfBookingStatus,
  GolfPaymentStatus,
  GolfPaymentMethod,
} from "../_fixtures/types";
import { TODAY_ISO } from "./format";

export type NewBooking = Omit<GolfBooking, "id" | "org_id" | "created_at" | "updated_at">;
export type NewMember = Omit<GolfMember, "id" | "org_id" | "created_at" | "updated_at">;

interface ReceivePaymentInput {
  amount: number;
  method: GolfPaymentMethod;
  status: GolfPaymentStatus; // deposit_paid | paid
}

interface GolfData {
  members: GolfMember[];
  resources: GolfResource[];
  priceItems: GolfPriceItem[];
  bookings: GolfBooking[];
  plans: GolfMembershipPlan[];
  points: GolfPointTransaction[];
  settings: GolfSettings;

  // ─── bookings ───
  addBooking: (input: NewBooking) => GolfBooking;
  updateBooking: (id: string, patch: Partial<GolfBooking>) => void;
  setBookingStatus: (id: string, status: GolfBookingStatus) => void;
  confirmBooking: (id: string) => void;
  checkInBooking: (id: string) => void;
  completeBooking: (id: string) => void;
  cancelBooking: (id: string, reason: string) => void;
  markNoShow: (id: string) => void;
  receivePayment: (id: string, input: ReceivePaymentInput) => void;

  // ─── members ───
  addMember: (input: NewMember) => GolfMember;
  updateMember: (id: string, patch: Partial<GolfMember>) => void;

  // ─── membership plans + subscribe ───
  addPlan: (input: Omit<GolfMembershipPlan, "id" | "org_id" | "created_at" | "updated_at">) => void;
  updatePlan: (id: string, patch: Partial<GolfMembershipPlan>) => void;
  deletePlan: (id: string) => void;
  subscribeMember: (memberId: string, planId: string) => void;

  // ─── points ledger ───
  addPointTxn: (
    input: Omit<GolfPointTransaction, "id" | "org_id" | "created_at">,
  ) => void;

  // ─── pricing catalog ───
  addPriceItem: (input: Omit<GolfPriceItem, "id" | "org_id" | "created_at" | "updated_at">) => void;
  updatePriceItem: (id: string, patch: Partial<GolfPriceItem>) => void;
  deletePriceItem: (id: string) => void;

  // ─── settings ───
  updateSettings: (patch: Partial<GolfSettings>) => void;
}

const Ctx = createContext<GolfData | null>(null);

let counter = 1;
const uid = (prefix: string) => `${prefix}-new-${Date.now()}-${counter++}`;

/** เพิ่ม N เดือนจาก ISO date */
function addMonthsIso(iso: string, months: number): string {
  const d = new Date(iso);
  d.setUTCMonth(d.getUTCMonth() + months);
  return d.toISOString().slice(0, 10);
}

export function GolfDataProvider({ children }: { children: React.ReactNode }) {
  const [members, setMembers] = useState<GolfMember[]>(() => seedMembers);
  const [resources] = useState<GolfResource[]>(() => seedResources);
  const [priceItems, setPriceItems] = useState<GolfPriceItem[]>(() => seedPrices);
  const [bookings, setBookings] = useState<GolfBooking[]>(() => seedBookings);
  const [plans, setPlans] = useState<GolfMembershipPlan[]>(() => seedPlans);
  const [points, setPoints] = useState<GolfPointTransaction[]>(() => seedPoints);
  const [settings, setSettings] = useState<GolfSettings>(() => seedSettings);

  const value = useMemo<GolfData>(() => {
    const now = () => new Date().toISOString();

    const addBooking: GolfData["addBooking"] = (input) => {
      const b: GolfBooking = {
        ...input,
        id: uid("bk"),
        org_id: GOLF_ORG_ID,
        created_at: now(),
        updated_at: now(),
      };
      setBookings((prev) => [b, ...prev]);
      return b;
    };

    const updateBooking: GolfData["updateBooking"] = (id, patch) =>
      setBookings((prev) =>
        prev.map((b) => (b.id === id ? { ...b, ...patch, updated_at: now() } : b)),
      );

    const setBookingStatus: GolfData["setBookingStatus"] = (id, status) =>
      updateBooking(id, { status });

    const confirmBooking: GolfData["confirmBooking"] = (id) =>
      updateBooking(id, { status: "confirmed" });

    const checkInBooking: GolfData["checkInBooking"] = (id) =>
      updateBooking(id, { status: "checked_in", checked_in_at: now() });

    const completeBooking: GolfData["completeBooking"] = (id) => {
      const b = bookings.find((x) => x.id === id);
      updateBooking(id, { status: "completed" });
      // earn แต้ม (rule mock: 1 แต้ม/20 ฿ × points_multiplier ของ plan)
      if (b && b.member_id) {
        const member = members.find((m) => m.id === b.member_id);
        const plan = member?.membership_plan_id
          ? plans.find((p) => p.id === member.membership_plan_id)
          : null;
        const mult = plan?.points_multiplier ?? 1;
        const earned = Math.floor((b.paid_amount ?? b.total_amount ?? 0) / 20) * mult;
        if (member && earned > 0) {
          setPoints((prev) => [
            {
              id: uid("pt"),
              org_id: GOLF_ORG_ID,
              member_id: member.id,
              txn_type: "earn",
              points: earned,
              booking_id: b.id,
              description: `เล่นจบ ${b.booking_ref ?? ""} +${earned} แต้ม`,
              created_by: null,
              created_at: now(),
            },
            ...prev,
          ]);
          setMembers((prev) =>
            prev.map((m) =>
              m.id === member.id
                ? { ...m, points_balance: m.points_balance + earned, updated_at: now() }
                : m,
            ),
          );
        }
      }
    };

    const cancelBooking: GolfData["cancelBooking"] = (id, reason) => {
      const b = bookings.find((x) => x.id === id);
      const refund = (b?.paid_amount ?? 0) > 0;
      updateBooking(id, {
        status: "cancelled",
        cancelled_at: now(),
        cancel_reason: reason,
        ...(refund ? { payment_status: "refunded" as GolfPaymentStatus } : {}),
      });
    };

    const markNoShow: GolfData["markNoShow"] = (id) => {
      const b = bookings.find((x) => x.id === id);
      updateBooking(id, { status: "no_show" });
      if (b?.member_id) {
        setMembers((prev) =>
          prev.map((m) =>
            m.id === b.member_id
              ? { ...m, no_show_count: m.no_show_count + 1, updated_at: now() }
              : m,
          ),
        );
      }
    };

    const receivePayment: GolfData["receivePayment"] = (id, input) => {
      const b = bookings.find((x) => x.id === id);
      const paid = (b?.paid_amount ?? 0) + input.amount;
      updateBooking(id, {
        paid_amount: paid,
        payment_status: input.status,
        payment_method: input.method,
      });
    };

    const addMember: GolfData["addMember"] = (input) => {
      const m: GolfMember = {
        ...input,
        id: uid("gm"),
        org_id: GOLF_ORG_ID,
        created_at: now(),
        updated_at: now(),
      };
      setMembers((prev) => [m, ...prev]);
      return m;
    };
    const updateMember: GolfData["updateMember"] = (id, patch) =>
      setMembers((prev) =>
        prev.map((m) => (m.id === id ? { ...m, ...patch, updated_at: now() } : m)),
      );

    const addPlan: GolfData["addPlan"] = (input) =>
      setPlans((prev) => [
        { ...input, id: uid("plan"), org_id: GOLF_ORG_ID, created_at: now(), updated_at: now() },
        ...prev,
      ]);
    const updatePlan: GolfData["updatePlan"] = (id, patch) =>
      setPlans((prev) => prev.map((p) => (p.id === id ? { ...p, ...patch, updated_at: now() } : p)));
    const deletePlan: GolfData["deletePlan"] = (id) =>
      setPlans((prev) => prev.filter((p) => p.id !== id));

    const subscribeMember: GolfData["subscribeMember"] = (memberId, planId) => {
      const plan = plans.find((p) => p.id === planId);
      if (!plan) return;
      updateMember(memberId, {
        membership_plan_id: plan.id,
        tier: plan.tier,
        member_type: plan.tier === "platinum" ? "vip" : "member",
        membership_expires_at: addMonthsIso(TODAY_ISO, plan.duration_months),
      });
    };

    const addPointTxn: GolfData["addPointTxn"] = (input) => {
      setPoints((prev) => [
        { ...input, id: uid("pt"), org_id: GOLF_ORG_ID, created_at: now() },
        ...prev,
      ]);
      setMembers((prev) =>
        prev.map((m) =>
          m.id === input.member_id
            ? { ...m, points_balance: m.points_balance + input.points, updated_at: now() }
            : m,
        ),
      );
    };

    const addPriceItem: GolfData["addPriceItem"] = (input) =>
      setPriceItems((prev) => [
        ...prev,
        { ...input, id: uid("pi"), org_id: GOLF_ORG_ID, created_at: now(), updated_at: now() },
      ]);
    const updatePriceItem: GolfData["updatePriceItem"] = (id, patch) =>
      setPriceItems((prev) =>
        prev.map((p) => (p.id === id ? { ...p, ...patch, updated_at: now() } : p)),
      );
    const deletePriceItem: GolfData["deletePriceItem"] = (id) =>
      setPriceItems((prev) => prev.filter((p) => p.id !== id));

    const updateSettings: GolfData["updateSettings"] = (patch) =>
      setSettings((prev) => ({ ...prev, ...patch, updated_at: now() }));

    return {
      members,
      resources,
      priceItems,
      bookings,
      plans,
      points,
      settings,
      addBooking,
      updateBooking,
      setBookingStatus,
      confirmBooking,
      checkInBooking,
      completeBooking,
      cancelBooking,
      markNoShow,
      receivePayment,
      addMember,
      updateMember,
      addPlan,
      updatePlan,
      deletePlan,
      subscribeMember,
      addPointTxn,
      addPriceItem,
      updatePriceItem,
      deletePriceItem,
      updateSettings,
    };
  }, [members, resources, priceItems, bookings, plans, points, settings]);

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useGolfData(): GolfData {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useGolfData ต้องใช้ภายใน <GolfDataProvider>");
  return ctx;
}

/** helper: resolve ชื่อผู้จองจาก member_id หรือ contact_name */
export function bookerName(b: GolfBooking, members: GolfMember[]): string {
  if (b.member_id) {
    const m = members.find((x) => x.id === b.member_id);
    if (m) return m.display_name;
  }
  return b.contact_name ?? "ลูกค้า walk-in";
}
