"use client";

import React, { useEffect, useMemo, useState } from "react";
import dayjs from "dayjs";
import { Button, Input, Textarea } from "rizzui";
import AppSelect from "@core/ui/app-select";
import { DatePicker } from "@core/ui/datepicker";
import { Modal } from "@core/modal-views/modal";

import type { SupabaseClient } from "@supabase/supabase-js";

export type PaymentTransactionRow = {
  id: string;
  order_id: string | null;
  poa_request_id: string | null;
  txn_type: "INCOME" | "EXPENSE";
  source_type: "CUSTOMER" | "AGENT_POA" | "OPS";
  amount: number;
  currency: string;
  txn_date: string;
  expense_name: string | null;
  note: string | null;
  source_table?: string | null;
  source_id?: string | null;
};

type OrderOption = { value: string; label: string };

function LabeledSelect({
  label,
  value,
  placeholder,
  options,
  disabled,
  searchable,
  onChange,
}: {
  label: string;
  value: string;
  placeholder: string;
  options: OrderOption[];
  disabled?: boolean;
  searchable?: boolean;
  onChange: (value: string) => void;
}) {
  return (
    <AppSelect
      label={label}
      placeholder={placeholder}
      options={options}
      value={value}
      onChange={(v: string) => onChange(v)}
      getOptionValue={(o) => o.value}
      displayValue={(selected) => options.find((o) => o.value === selected)?.label ?? ""}
      disabled={disabled}
      selectClassName="h-10 px-3"
      inPortal={false}
      searchable={searchable}
    />
  );
}

function ensureOption(options: OrderOption[], value: string) {
  const v = value.trim();
  if (!v) return options;
  if (options.some((o) => o.value === v)) return options;
  return [{ value: v, label: v }, ...options];
}

export function TransactionModal({
  open,
  mode,
  supabase,
  userId,
  loading,
  setLoading,
  setError,
  orderOptions,
  variant = "full",
  fixedOrderId = null,
  initial,
  onSaved,
  onClose,
}: {
  open: boolean;
  mode: "create" | "edit";
  supabase: SupabaseClient;
  userId: string | null;
  loading: boolean;
  setLoading: (v: boolean) => void;
  setError: (v: string | null) => void;
  orderOptions: OrderOption[];
  variant?: "full" | "expense";
  fixedOrderId?: string | null;
  initial: Partial<PaymentTransactionRow> | null;
  onSaved: () => void;
  onClose: () => void;
}) {
  const title = (() => {
    if (variant === "expense") return mode === "edit" ? "แก้ไขรายจ่าย" : "บันทึกรายจ่าย";
    return mode === "edit" ? "แก้ไขธุรกรรม" : "เพิ่มธุรกรรม";
  })();

  const isExpenseOnly = variant === "expense";

  const [txnType, setTxnType] = useState<PaymentTransactionRow["txn_type"]>(() => {
    if (isExpenseOnly) return "EXPENSE";
    return ((initial?.txn_type as any) ?? "EXPENSE") as any;
  });
  const [sourceType, setSourceType] = useState<PaymentTransactionRow["source_type"]>(() => {
    if (isExpenseOnly) return "OPS";
    return ((initial?.source_type as any) ?? "OPS") as any;
  });
  const [amount, setAmount] = useState(String(initial?.amount ?? ""));
  const [txnDate, setTxnDate] = useState(String(initial?.txn_date ?? ""));
  const [orderId, setOrderId] = useState(String(fixedOrderId ?? initial?.order_id ?? ""));
  const [poaRequestId, setPoaRequestId] = useState(String(initial?.poa_request_id ?? ""));
  const [expenseName, setExpenseName] = useState(String(initial?.expense_name ?? ""));
  const [note, setNote] = useState(String(initial?.note ?? ""));

  const [orderCatalog, setOrderCatalog] = useState<OrderOption[]>([]);

  useEffect(() => {
    if (!open) return;
    if (fixedOrderId) return;
    Promise.resolve().then(async () => {
      const { data, error } = await supabase
        .from("orders")
        .select("id,display_id,customers(name)")
        .order("created_at", { ascending: false })
        .limit(200);
      if (error) {
        setError(error.message);
        return;
      }
      const list = ((data ?? []) as any[]).map((o) => {
        const title = [o.display_id || o.id, o.customers?.name].filter(Boolean).join(" • ");
        return { value: String(o.id), label: title || String(o.id) };
      });
      setOrderCatalog(list);
    });
  }, [fixedOrderId, open, setError, supabase]);

  const safeOrderOptions = useMemo(() => {
    const base = orderCatalog.length ? orderCatalog : orderOptions;
    return ensureOption([{ value: "", label: "-" }, ...base], fixedOrderId ?? orderId);
  }, [fixedOrderId, orderCatalog, orderId, orderOptions]);

  const txnTypeOptions = useMemo(
    () => [
      { value: "INCOME", label: "รายรับ" },
      { value: "EXPENSE", label: "รายจ่าย" },
    ],
    [],
  );
  const sourceTypeOptions = useMemo(
    () => [
      { value: "CUSTOMER", label: "ลูกค้า" },
      { value: "AGENT_POA", label: "POA ตัวแทน" },
      { value: "OPS", label: "งานปฏิบัติการ" },
    ],
    [],
  );

  const canSubmit = useMemo(() => {
    const n = Number(amount);
    if (!Number.isFinite(n) || n < 0) return false;
    if (!txnDate || !txnType || !sourceType) return false;
    if (txnType === "EXPENSE" && !expenseName.trim()) return false;
    return true;
  }, [amount, expenseName, sourceType, txnDate, txnType]);

  return (
    <Modal
      isOpen={open}
      onClose={() => {
        if (loading) return;
        onClose();
      }}
      size="lg"
      rounded="md"
    >
      <div className="rounded-xl bg-white p-5">
        <div className="flex items-start justify-between gap-2">
          <div>
            <div className="text-base font-semibold text-gray-900">{title}</div>
            <div className="mt-1 text-sm text-gray-600">บันทึกรายรับ/รายจ่ายเพื่อคำนวณกำไรสุทธิรายออเดอร์</div>
          </div>
          <Button size="sm" variant="outline" onClick={onClose} disabled={loading} className="whitespace-nowrap">
            ปิด
          </Button>
        </div>

        <div className="mt-4 grid gap-3">
          {txnType === "EXPENSE" ? (
            <div className="grid gap-2 md:grid-cols-2">
              <Input label="ชื่อรายจ่าย" value={expenseName} onChange={(e) => setExpenseName(e.target.value)} disabled={loading} />
              <LabeledSelect
                label="ผูกออเดอร์ (ถ้ามี)"
                value={orderId}
                placeholder="-"
                options={safeOrderOptions}
                disabled={!!fixedOrderId}
                searchable
                onChange={(v) => setOrderId(v)}
              />
            </div>
          ) : null}

          {!isExpenseOnly ? (
            <div className="grid gap-2 md:grid-cols-2">
              <LabeledSelect
                label="ประเภท"
                value={txnType}
                placeholder="-"
                options={txnTypeOptions as any}
                disabled={loading}
                onChange={(v) => {
                  const next = v === "INCOME" ? "INCOME" : "EXPENSE";
                  setTxnType(next);
                  if (next === "EXPENSE" && sourceType !== "OPS") setSourceType("OPS");
                }}
              />
              <LabeledSelect
                label="แหล่งที่มา"
                value={sourceType}
                placeholder="-"
                options={sourceTypeOptions as any}
                disabled={loading || txnType === "EXPENSE"}
                onChange={(v) => {
                  const next = v === "CUSTOMER" ? "CUSTOMER" : v === "AGENT_POA" ? "AGENT_POA" : "OPS";
                  setSourceType(next);
                }}
              />
            </div>
          ) : null}

          <div className="grid gap-2 md:grid-cols-2">
            <Input label="จำนวนเงิน" value={amount} onChange={(e) => setAmount(e.target.value)} inputMode="decimal" disabled={loading} />
            <div>
              <div className="text-sm font-medium text-gray-700">วันที่</div>
              <DatePicker
                selected={txnDate ? dayjs(txnDate).toDate() : null}
                onChange={(date: Date | null) => setTxnDate(date ? dayjs(date).format("YYYY-MM-DD") : "")}
                placeholderText="Select Date"
                disabled={loading}
              />
            </div>
          </div>

          <div className="grid gap-2 md:grid-cols-2">
            {txnType !== "EXPENSE" ? (
              <LabeledSelect
                label="ผูกออเดอร์ (ถ้ามี)"
                value={orderId}
                placeholder="-"
                options={safeOrderOptions}
                disabled={!!fixedOrderId}
                searchable
                onChange={(v) => setOrderId(v)}
              />
            ) : null}
            {!isExpenseOnly && txnType !== "EXPENSE" ? (
              <Input label="POA Request ID (ถ้ามี)" value={poaRequestId} onChange={(e) => setPoaRequestId(e.target.value)} disabled={loading} />
            ) : null}
          </div>

          <Textarea label="หมายเหตุ" value={note} onChange={(e) => setNote(e.target.value)} disabled={loading} />

          <div className="flex flex-wrap justify-end gap-2">
            <Button
              onClick={async () => {
                if (!userId) {
                  setError("กรุณาเข้าสู่ระบบใหม่");
                  return;
                }
                const n = Number(amount);
                if (!Number.isFinite(n) || n < 0) {
                  setError("จำนวนเงินไม่ถูกต้อง");
                  return;
                }
                if (!txnDate) {
                  setError("กรุณาเลือกวันที่");
                  return;
                }
                setLoading(true);
                setError(null);
                try {
                  const payload = {
                    order_id: (fixedOrderId ?? orderId).trim() || null,
                    poa_request_id: isExpenseOnly ? null : poaRequestId.trim() || null,
                    txn_type: isExpenseOnly ? "EXPENSE" : txnType,
                    source_type: isExpenseOnly ? "OPS" : sourceType,
                    amount: n,
                    currency: "THB",
                    txn_date: txnDate,
                    expense_name: (isExpenseOnly || txnType === "EXPENSE") && expenseName.trim() ? expenseName.trim() : null,
                    note: note.trim() || null,
                  };
                  if (mode === "edit") {
                    const id = String(initial?.id ?? "").trim();
                    if (!id) throw new Error("ไม่พบรายการที่ต้องการแก้ไข");
                    const { error } = await supabase.from("payment_transactions").update(payload).eq("id", id);
                    if (error) throw new Error(error.message);
                  } else {
                    const { error } = await supabase.from("payment_transactions").insert({ ...payload, created_by_profile_id: userId });
                    if (error) throw new Error(error.message);
                  }
                  setLoading(false);
                  onSaved();
                } catch (e: any) {
                  setLoading(false);
                  setError(e?.message ?? "บันทึกไม่สำเร็จ");
                }
              }}
              disabled={loading || !canSubmit}
              className="whitespace-nowrap"
            >
              บันทึก
            </Button>
            <Button variant="outline" onClick={onClose} disabled={loading} className="whitespace-nowrap">
              ยกเลิก
            </Button>
          </div>
        </div>
      </div>
    </Modal>
  );
}
