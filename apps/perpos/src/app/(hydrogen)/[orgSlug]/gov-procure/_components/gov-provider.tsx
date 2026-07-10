"use client";

// gov-provider.tsx — production data + role provider (แทน data-context + role-context เดิม)
// seed จาก SSR props (orders/settings + role) → mutator ยิง API จริง (POST/PUT/DELETE/PATCH)
// สำเร็จแล้วอัปเดต local state (ทุกหน้าที่ subscribe เห็นผลทันทีในหน้าเดียว · refresh = re-fetch จาก SSR)
// hooks: useData() (orders/settings + mutators) · useRole() (สิทธิ์จาก role จริง — ไม่มี switcher)
// import: import { GovProcureProvider, useData, useRole } from "./gov-provider";

import React, { createContext, useContext, useMemo, useState } from "react";
import { govApi } from "./api";
import type {
  GovProcureOrder,
  GovProcureSettings,
  GovProcureRole,
  Stage,
} from "@/lib/gov-procure/types";

interface GovData {
  orgId: string;
  orgSlug: string;
  orders: GovProcureOrder[];
  settings: GovProcureSettings;

  // ─── mutators (async — ยิง API จริง, throw เมื่อ error) ───
  addOrder: (payload: Record<string, unknown>) => Promise<GovProcureOrder>;
  updateOrder: (id: string, payload: Record<string, unknown>) => Promise<GovProcureOrder>;
  deleteOrder: (id: string) => Promise<void>;
  /** เลื่อน stage — opts: milestone_date (ระบุวัน) หรือ skip_date (เลื่อนโดยไม่ระบุวัน) */
  updateStage: (
    id: string,
    stage: Stage,
    opts?: { milestone_date?: string; skip_date?: boolean },
  ) => Promise<GovProcureOrder>;
  /** ปิดงาน (manual close — spec §4 closed) */
  closeOrder: (id: string) => Promise<GovProcureOrder>;
  updateSettings: (patch: Partial<GovProcureSettings>) => Promise<GovProcureSettings>;
}

interface GovRoleCtx {
  role: GovProcureRole;
  /** owner/manager/staff เขียนได้ · viewer อ่านอย่างเดียว */
  canWrite: boolean;
  /** owner/manager แก้การเงินได้ · staff ถูกล็อก field การเงิน */
  canEditFinance: boolean;
  /** owner/manager จัดการตั้งค่าได้ (B2) */
  canManageSettings: boolean;
  /** ลบได้เฉพาะ owner/manager (staff/viewer ห้ามลบ) */
  canDelete: boolean;
  /** viewer = อ่านอย่างเดียวทั้งโมดูล */
  isViewer: boolean;
}

const DataCtx = createContext<GovData | null>(null);
const RoleCtx = createContext<GovRoleCtx | null>(null);

export function GovProcureProvider({
  orgId,
  orgSlug,
  role,
  initialOrders,
  initialSettings,
  children,
}: {
  orgId: string;
  orgSlug: string;
  role: GovProcureRole;
  initialOrders: GovProcureOrder[];
  initialSettings: GovProcureSettings;
  children: React.ReactNode;
}) {
  const [orders, setOrders] = useState<GovProcureOrder[]>(initialOrders);
  const [settings, setSettings] = useState<GovProcureSettings>(initialSettings);

  const data = useMemo<GovData>(() => {
    const q = `?orgId=${encodeURIComponent(orgId)}`;

    const addOrder: GovData["addOrder"] = async (payload) => {
      const { order } = await govApi<{ order: GovProcureOrder }>(
        `/api/gov-procure/orders${q}`,
        "POST",
        payload,
      );
      setOrders((prev) => [order, ...prev]);
      return order;
    };

    const updateOrder: GovData["updateOrder"] = async (id, payload) => {
      const { order } = await govApi<{ order: GovProcureOrder }>(
        `/api/gov-procure/orders/${id}${q}`,
        "PUT",
        payload,
      );
      setOrders((prev) => prev.map((o) => (o.id === id ? order : o)));
      return order;
    };

    const deleteOrder: GovData["deleteOrder"] = async (id) => {
      await govApi(`/api/gov-procure/orders/${id}${q}`, "DELETE");
      setOrders((prev) => prev.filter((o) => o.id !== id));
    };

    const updateStage: GovData["updateStage"] = async (id, stage, opts) => {
      const { order } = await govApi<{ order: GovProcureOrder }>(
        `/api/gov-procure/orders/${id}/stage${q}`,
        "PATCH",
        {
          stage,
          ...(opts?.milestone_date ? { milestone_date: opts.milestone_date } : {}),
          ...(opts?.skip_date ? { skip_date: true } : {}),
        },
      );
      setOrders((prev) => prev.map((o) => (o.id === id ? order : o)));
      return order;
    };

    const closeOrder: GovData["closeOrder"] = async (id) => updateStage(id, "closed");

    const updateSettings: GovData["updateSettings"] = async (patch) => {
      const { settings: saved } = await govApi<{ settings: GovProcureSettings }>(
        `/api/gov-procure/settings${q}`,
        "PUT",
        patch,
      );
      setSettings(saved);
      return saved;
    };

    return {
      orgId,
      orgSlug,
      orders,
      settings,
      addOrder,
      updateOrder,
      deleteOrder,
      updateStage,
      closeOrder,
      updateSettings,
    };
  }, [orgId, orgSlug, orders, settings]);

  const roleCtx = useMemo<GovRoleCtx>(
    () => ({
      role,
      canWrite: role === "owner" || role === "manager" || role === "staff",
      canEditFinance: role === "owner" || role === "manager",
      canManageSettings: role === "owner" || role === "manager",
      canDelete: role === "owner" || role === "manager",
      isViewer: role === "viewer",
    }),
    [role],
  );

  return (
    <RoleCtx.Provider value={roleCtx}>
      <DataCtx.Provider value={data}>{children}</DataCtx.Provider>
    </RoleCtx.Provider>
  );
}

export function useData(): GovData {
  const ctx = useContext(DataCtx);
  if (!ctx) throw new Error("useData ต้องใช้ภายใน <GovProcureProvider>");
  return ctx;
}

export function useRole(): GovRoleCtx {
  const ctx = useContext(RoleCtx);
  if (!ctx) throw new Error("useRole ต้องใช้ภายใน <GovProcureProvider>");
  return ctx;
}
