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
  payFile,
  setPayOpen,
  setPayAmount,
  setPayFile,
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
  payFile: File | null;
  setPayOpen: (v: boolean) => void;
  setPayAmount: (v: string) => void;
  setPayFile: (v: File | null) => void;
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
    const now = new Date().toISOString();
    const { error: updErr } = await supabase
      .from("orders")
      .update({ status: "completed", closed_at: now, closed_by_profile_id: userId })
      .eq("id", orderId);
    if (updErr) {
      setError(updErr.message);
      setLoading(false);
      return;
    }
    await addEvent("order_closed", "ปิดออเดอร์", "orders", orderId);
    setLoading(false);
    toast.success("ปิดออเดอร์แล้ว");
    refresh();
  }, [addEvent, canCloseOrder, confirm, orderId, refresh, setError, setLoading, supabase, userId]);

  const openAddInstallment = useCallback(() => {
    setPayAmount("");
    setPayFile(null);
    setPayOpen(true);
  }, [setPayAmount, setPayFile, setPayOpen]);

  const recordInstallment = useCallback(async () => {
    const amtNum = Number(payAmount || 0);
    const amt = Number.isFinite(amtNum) ? amtNum : 0;
    if (!orderId || !payFile || amt <= 0) return;
    setLoading(true);
    setError(null);
    const form = new FormData();
    form.set("orderId", orderId);
    form.set("installmentNo", String(nextInstallmentNo));
    form.set("amount", String(amt));
    form.set("file", payFile);
    const res = await fetch("/api/orders/installment-payment", { method: "POST", body: form });
    if (!res.ok) {
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      setError(data.error || "บันทึกการชำระเงินไม่สำเร็จ");
      setLoading(false);
      return;
    }
    await addEvent("payment_recorded", `บันทึกการชำระงวด ${nextInstallmentNo}: ${asMoney(amt)} บาท`, "orders", orderId);
    setPayOpen(false);
    setPayAmount("");
    setPayFile(null);
    setLoading(false);
    refresh();
    topRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  }, [addEvent, nextInstallmentNo, orderId, payAmount, payFile, refresh, setError, setLoading, setPayAmount, setPayFile, setPayOpen, topRef]);

  return { startService, doneService, closeOrder, openAddInstallment, recordInstallment };
}
