"use client";

import { useCallback } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";
import toast from "react-hot-toast";

import { asMoney, serviceNameFromRel, type OrderItemRow } from "./_types";
import { useConfirmDialog } from "@/app/shared/confirm-dialog/provider";

export function useManageOrderActions({
  orderId,
  userId,
  supabase,
  refresh,
  setLoading,
  setError,
  topRef,
  nextInstallmentNo,
  payAmount,
  setPayOpen,
  setPayAmount,
  canCloseOrder,
}: {
  orderId: string;
  userId: string | null;
  supabase: SupabaseClient;
  refresh: () => void;
  setLoading: (v: boolean) => void;
  setError: (v: string | null) => void;
  topRef: React.RefObject<HTMLDivElement | null>;
  nextInstallmentNo: number;
  payAmount: string;
  setPayOpen: (v: boolean) => void;
  setPayAmount: (v: string) => void;
  canCloseOrder: boolean;
}) {
  const confirm = useConfirmDialog();

  const addEvent = useCallback(
    async (event_type: string, message: string, entity_table?: string, entity_id?: string) => {
      if (!orderId) return;
      await supabase.from("order_events").insert({
        order_id: orderId,
        event_type,
        message,
        entity_table: entity_table ?? null,
        entity_id: entity_id ?? null,
        created_by_profile_id: userId,
      });
    },
    [orderId, supabase, userId]
  );

  const startService = useCallback(
    async (it: OrderItemRow) => {
      setLoading(true);
      setError(null);
      const now = new Date().toISOString();
      const { error: updErr } = await supabase
        .from("order_items")
        .update({
          ops_status: "in_progress",
          ops_started_at: now,
          ops_updated_at: now,
          ops_updated_by_profile_id: userId,
        })
        .eq("id", it.id);
      if (updErr) {
        setError(updErr.message);
        setLoading(false);
        return;
      }
      await addEvent("service_started", `เริ่มดำเนินการบริการ: ${serviceNameFromRel(it.services ?? null)}`, "order_items", it.id);
      setLoading(false);
      refresh();
    },
    [addEvent, refresh, setError, setLoading, supabase, userId]
  );

  const doneService = useCallback(
    async (it: OrderItemRow) => {
      const ok = await confirm({ title: "ยืนยันเสร็จสิ้นบริการ", message: "ยืนยันว่าเสร็จสิ้นบริการนี้แล้ว?", confirmText: "ยืนยัน" });
      if (!ok) return;
      setLoading(true);
      setError(null);
      const now = new Date().toISOString();
      const { error: updErr } = await supabase
        .from("order_items")
        .update({
          ops_status: "done",
          ops_completed_at: now,
          ops_updated_at: now,
          ops_updated_by_profile_id: userId,
        })
        .eq("id", it.id);
      if (updErr) {
        setError(updErr.message);
        setLoading(false);
        return;
      }
      await addEvent("service_completed", `เสร็จสิ้นบริการ: ${serviceNameFromRel(it.services ?? null)}`, "order_items", it.id);
      setLoading(false);
      toast.success("บันทึกแล้ว");
      refresh();
    },
    [addEvent, confirm, refresh, setError, setLoading, supabase, userId]
  );

  const closeOrder = useCallback(async () => {
    if (!canCloseOrder) return;
    const ok = await confirm({ title: "ยืนยันปิดออเดอร์", message: "ยืนยันปิดออเดอร์นี้หรือไม่?", confirmText: "ปิดออเดอร์" });
    if (!ok) return;
    setLoading(true);
    setError(null);
    try {
      const sessionRes = await supabase.auth.getSession();
      const token = sessionRes.data.session?.access_token;
      if (!token) throw new Error("ยังไม่ได้เข้าสู่ระบบ");
      const res = await fetch("/api/orders/close", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ orderId }),
      });
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) throw new Error(data.error || "ปิดออเดอร์ไม่สำเร็จ");

      try {
        const lineRes = await fetch("/api/line/employer/send", {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
          body: JSON.stringify({ kind: "order", id: orderId }),
        });
        const lineData = (await lineRes.json().catch(() => ({}))) as any;
        if (!lineRes.ok) {
          const msg = String(lineData.error ?? "");
          if (!msg.toLowerCase().includes("not connected")) toast(msg || "ส่ง LINE ไม่สำเร็จ");
        }
      } catch {
      }

      setLoading(false);
      toast.success("ปิดออเดอร์แล้ว");
      refresh();
    } catch (e: any) {
      setError(e?.message ?? "ปิดออเดอร์ไม่สำเร็จ");
      setLoading(false);
    }
  }, [canCloseOrder, confirm, orderId, refresh, setError, setLoading, supabase]);

  const openAddInstallment = useCallback(() => {
    setPayAmount("");
    setPayOpen(true);
  }, [setPayAmount, setPayOpen]);

  const billInstallment = useCallback(async () => {
    const amtNum = Number(String(payAmount ?? "").replaceAll(",", "").trim() || 0);
    const amt = Number.isFinite(amtNum) ? amtNum : 0;
    if (!orderId || amt <= 0) return;
    setLoading(true);
    setError(null);
    const res = await fetch("/api/invoices/create-from-order-installment", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ orderId, installmentNo: nextInstallmentNo, amount: amt }),
    });
    if (!res.ok) {
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      setError(data.error || "ออกใบแจ้งหนี้ไม่สำเร็จ");
      setLoading(false);
      return;
    }
    const data = (await res.json().catch(() => ({}))) as { invoiceId?: string; invoiceNo?: string | null };
    const invoiceId = String(data.invoiceId ?? "").trim();
    await addEvent(
      "installment_billed",
      `วางบิลงวด ${nextInstallmentNo} (ฐาน): ${asMoney(amt)} บาท${data.invoiceNo ? ` (${data.invoiceNo})` : ""}`,
      invoiceId ? "invoices" : "orders",
      invoiceId || orderId,
    );
    setPayOpen(false);
    setPayAmount("");
    setLoading(false);
    refresh();
    topRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    if (invoiceId) window.open(`/invoices/${invoiceId}`, "_blank", "noopener,noreferrer");
  }, [addEvent, nextInstallmentNo, orderId, payAmount, refresh, setError, setLoading, setPayAmount, setPayOpen, topRef]);

  return { startService, doneService, closeOrder, openAddInstallment, billInstallment };
}
