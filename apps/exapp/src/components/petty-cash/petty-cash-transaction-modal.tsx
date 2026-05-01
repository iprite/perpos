"use client";

import React, { useEffect, useMemo, useState } from "react";
import dayjs from "dayjs";
import { Button, Input, Textarea } from "rizzui";
import AppSelect from "@core/ui/app-select";
import { DatePicker } from "@core/ui/datepicker";
import { Modal } from "@core/modal-views/modal";

import type { SupabaseClient } from "@supabase/supabase-js";

type TxnType = "TOP_UP" | "SPEND";

export type PettyCashTransactionRow = {
  id: string;
  txn_type: TxnType;
  amount: number;
  occurred_at: string;
  category_name: string | null;
  title: string | null;
  receipt_object_path: string | null;
  receipt_file_name: string | null;
};

type CategoryRow = { id: string; name: string; is_active: boolean; sort_order: number };

async function uploadReceipt(params: { supabase: SupabaseClient; txnId: string; file: File }) {
  const safeName = params.file.name.replace(/\s+/g, "_");
  const path = `petty-cash/receipts/${params.txnId}/${safeName}`;
  const { error } = await params.supabase.storage.from("petty_cash_receipts").upload(path, params.file, {
    upsert: true,
    contentType: params.file.type || undefined,
  });
  if (error) throw new Error(error.message);
  return { path, fileName: params.file.name };
}

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
  options: { value: string; label: string }[];
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
      searchable={searchable}
      inPortal={false}
      selectClassName="h-10 px-3"
    />
  );
}

export function PettyCashTransactionModal({
  open,
  mode,
  supabase,
  userId,
  role,
  loading,
  setLoading,
  setError,
  categories,
  initial,
  onSaved,
  onClose,
}: {
  open: boolean;
  mode: "create" | "edit";
  supabase: SupabaseClient;
  userId: string | null;
  role: string | null;
  loading: boolean;
  setLoading: (v: boolean) => void;
  setError: (v: string | null) => void;
  categories: CategoryRow[];
  initial: Partial<PettyCashTransactionRow> | null;
  onSaved: () => void;
  onClose: () => void;
}) {
  const canWrite = role === "admin" || role === "operation";

  const [txnType, setTxnType] = useState<TxnType>(((initial?.txn_type as any) ?? "SPEND") as TxnType);
  const [amount, setAmount] = useState(String(initial?.amount ?? ""));
  const [occurredAt, setOccurredAt] = useState(String(initial?.occurred_at ?? dayjs().format("YYYY-MM-DD")));
  const [categoryName, setCategoryName] = useState(String(initial?.category_name ?? ""));
  const [title, setTitle] = useState(String((initial as any)?.title ?? ""));
  const [file, setFile] = useState<File | null>(null);

  useEffect(() => {
    if (!open) return;
    setTxnType((((initial?.txn_type as any) ?? "SPEND") as TxnType) === "TOP_UP" ? "TOP_UP" : "SPEND");
    setAmount(initial?.amount != null ? String(initial.amount) : "");
    setOccurredAt(String(initial?.occurred_at ?? dayjs().format("YYYY-MM-DD")));
    setCategoryName(String(initial?.category_name ?? ""));
    setTitle(String((initial as any)?.title ?? ""));
    setFile(null);
  }, [open, mode, (initial as any)?.id]);

  const typeOptions = useMemo(() => [{ value: "TOP_UP", label: "เติมเงิน" }, { value: "SPEND", label: "ใช้เงิน" }], []);
  const categoryOptions = useMemo(() => {
    const active = categories.filter((c) => c.is_active).sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0));
    return [{ value: "", label: "-" }, ...active.map((c) => ({ value: c.name, label: c.name }))];
  }, [categories]);

  const canSubmit = useMemo(() => {
    const n = Number(amount);
    if (!canWrite) return false;
    if (!Number.isFinite(n) || n <= 0) return false;
    if (!occurredAt) return false;
    if (txnType === "SPEND" && !categoryName.trim()) return false;
    if (!title.trim()) return false;
    return true;
  }, [amount, canWrite, categoryName, occurredAt, title, txnType]);

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
            <div className="text-base font-semibold text-gray-900">{mode === "edit" ? "แก้ไขรายการเงินสดย่อย" : "บันทึกรายการเงินสดย่อย"}</div>
            <div className="mt-1 text-sm text-gray-600">เติมเงิน/ใช้เงิน พร้อมรายละเอียดเพื่อดูยอดคงเหลือ</div>
          </div>
          <Button size="sm" variant="outline" onClick={onClose} disabled={loading} className="whitespace-nowrap">
            ปิด
          </Button>
        </div>

        {!canWrite ? <div className="mt-4 rounded-lg border border-gray-200 bg-gray-50 p-3 text-sm text-gray-700">คุณมีสิทธิ์ดูข้อมูลเท่านั้น</div> : null}

        <div className="mt-4 grid gap-3">
          <div className="grid gap-2 md:grid-cols-2">
            <LabeledSelect label="ประเภท" value={txnType} placeholder="-" options={typeOptions} disabled={loading || !canWrite} onChange={(v) => setTxnType(v === "TOP_UP" ? "TOP_UP" : "SPEND")} />
            <Input label="จำนวนเงิน" value={amount} onChange={(e) => setAmount(e.target.value)} inputMode="decimal" disabled={loading || !canWrite} />
          </div>

          <div className="grid gap-2 md:grid-cols-2">
            <div>
              <div className="text-sm font-medium text-gray-700">วันที่</div>
              <DatePicker
                selected={occurredAt ? dayjs(occurredAt).toDate() : null}
                onChange={(date: Date | null) => setOccurredAt(date ? dayjs(date).format("YYYY-MM-DD") : "")}
                placeholderText="Select Date"
                disabled={loading || !canWrite}
              />
            </div>
            {txnType === "SPEND" ? (
              <LabeledSelect
                label="หมวดหมู่"
                value={categoryName}
                placeholder="-"
                options={categoryOptions}
                searchable
                disabled={loading || !canWrite}
                onChange={(v) => setCategoryName(v)}
              />
            ) : (
              <div />
            )}
          </div>

          <Textarea label="รายการ" value={title} onChange={(e) => setTitle(e.target.value)} disabled={loading || !canWrite} />

          <div>
            <div className="text-sm font-medium text-gray-700">หลักฐาน (ถ้ามี)</div>
            <div className="mt-2">
              <input
                type="file"
                accept="image/*,application/pdf"
                disabled={loading || !canWrite}
                onChange={(e) => setFile(e.target.files?.[0] ?? null)}
              />
              {file ? <div className="mt-1 text-xs text-gray-600">{file.name}</div> : null}
            </div>
          </div>

          <div className="flex flex-wrap gap-2">
            <Button
              disabled={loading || !canSubmit}
              onClick={async () => {
                if (!userId) {
                  setError("กรุณาเข้าสู่ระบบใหม่");
                  return;
                }
                setLoading(true);
                setError(null);
                try {
                  const n = Number(amount);
                  const payload: any = {
                    txn_type: txnType,
                    amount: Math.max(0, n),
                    occurred_at: occurredAt,
                    category_name: txnType === "SPEND" ? (categoryName.trim() || null) : null,
                    title: title.trim() || null,
                    note: null,
                  };

                  let txnId = String(initial?.id ?? "");
                  if (mode === "create") {
                    const { data, error } = await supabase
                      .from("petty_cash_transactions")
                      .insert({ ...payload, created_by_profile_id: userId })
                      .select("id")
                      .single();
                    if (error) throw new Error(error.message);
                    txnId = String((data as any)?.id);
                  } else {
                    if (!txnId) throw new Error("ไม่พบรายการ");
                    const { error } = await supabase.from("petty_cash_transactions").update(payload).eq("id", txnId);
                    if (error) throw new Error(error.message);
                  }

                  if (file && txnId) {
                    const uploaded = await uploadReceipt({ supabase, txnId, file });
                    const { error } = await supabase
                      .from("petty_cash_transactions")
                      .update({ receipt_object_path: uploaded.path, receipt_file_name: uploaded.fileName })
                      .eq("id", txnId);
                    if (error) throw new Error(error.message);
                  }

                  setLoading(false);
                  onSaved();
                } catch (e: any) {
                  setLoading(false);
                  setError(e?.message ?? "บันทึกไม่สำเร็จ");
                }
              }}
            >
              บันทึก
            </Button>
            <Button variant="outline" disabled={loading} onClick={onClose}>
              ยกเลิก
            </Button>
          </div>
        </div>
      </div>
    </Modal>
  );
}
