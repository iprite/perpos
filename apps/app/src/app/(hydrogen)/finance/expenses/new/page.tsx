"use client";

import { useRouter, useSearchParams } from "next/navigation";
import React, { useCallback, useMemo, useState } from "react";
import dayjs from "dayjs";
import toast from "react-hot-toast";
import { Button, Input, Textarea } from "rizzui";
import { Title, Text } from "rizzui/typography";
import AppSelect from "@core/ui/app-select";
import { DatePicker } from "@core/ui/datepicker";

import { useAuth } from "@/app/shared/auth-provider";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";

type OrderOption = { value: string; label: string };

function LabeledSelect({
  label,
  value,
  placeholder,
  options,
  disabled,
  onChange,
}: {
  label: string;
  value: string;
  placeholder: string;
  options: OrderOption[];
  disabled?: boolean;
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
    />
  );
}

export default function NewExpensePage() {
  const { role, userId } = useAuth();
  const canUsePage = role === "admin" || role === "sale" || role === "operation";
  const supabase = useMemo(() => createSupabaseBrowserClient(), []);
  const router = useRouter();
  const params = useSearchParams();

  const initialOrderId = useMemo(() => String(params.get("orderId") ?? "").trim(), [params]);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [txnDate, setTxnDate] = useState(dayjs().format("YYYY-MM-DD"));
  const [amount, setAmount] = useState("");
  const [expenseName, setExpenseName] = useState("");
  const [note, setNote] = useState("");
  const [orderId, setOrderId] = useState(initialOrderId);

  const [orders, setOrders] = useState<OrderOption[]>([]);

  const refreshOrders = useCallback(() => {
    Promise.resolve().then(async () => {
      if (!canUsePage) return;
      const { data, error: e } = await supabase
        .from("orders")
        .select("id,display_id,customers(name)")
        .order("created_at", { ascending: false })
        .limit(200);
      if (e) return;
      const list = ((data ?? []) as any[]).map((o) => {
        const title = [o.display_id || o.id, o.customers?.name].filter(Boolean).join(" • ");
        return { value: String(o.id), label: title || String(o.id) };
      });
      setOrders(list);
    });
  }, [canUsePage, supabase]);

  React.useEffect(() => {
    refreshOrders();
  }, [refreshOrders]);

  const canSave = useMemo(() => {
    const n = Number(amount);
    return Number.isFinite(n) && n >= 0 && !!txnDate && !!expenseName.trim();
  }, [amount, expenseName, txnDate]);

  if (!canUsePage) {
    return (
      <div className="p-6">
        <Title as="h1" className="text-lg font-semibold text-gray-900">
          บันทึกรายจ่าย
        </Title>
        <Text className="mt-2 text-sm text-gray-600">คุณไม่มีสิทธิ์เข้าหน้านี้</Text>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-[1200px] px-4 py-6">
      <div className="flex flex-col justify-between gap-3 md:flex-row md:items-end">
        <div>
          <Title as="h1" className="text-lg font-semibold text-gray-900">
            บันทึกรายจ่าย
          </Title>
          <Text className="mt-1 text-sm text-gray-600">บันทึกรายจ่ายงานปฏิบัติการและเลือกผูกออเดอร์ได้</Text>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button
            variant="outline"
            onClick={() => {
              if (initialOrderId) router.push(`/manage-orders/${encodeURIComponent(initialOrderId)}`);
              else router.push("/finance");
            }}
            disabled={loading}
          >
            ยกเลิก
          </Button>
        </div>
      </div>

      {error ? <div className="mt-4 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">{error}</div> : null}

      <div className="mt-5 grid gap-4 lg:grid-cols-[1fr_360px]">
        <div className="rounded-xl border border-gray-200 bg-white p-5">
          <div className="grid gap-3 md:grid-cols-2">
            <div className="md:col-span-2">
              <Input label="ชื่อรายจ่าย" value={expenseName} onChange={(e) => setExpenseName(e.target.value)} disabled={loading} />
            </div>
            <div>
              <div className="text-sm font-medium text-gray-700">วันที่รายจ่าย</div>
              <DatePicker
                selected={txnDate ? dayjs(txnDate).toDate() : null}
                onChange={(date: Date | null) => setTxnDate(date ? dayjs(date).format("YYYY-MM-DD") : "")}
                placeholderText="Select Date"
                disabled={loading}
              />
            </div>
            <Input label="จำนวนเงิน" value={amount} onChange={(e) => setAmount(e.target.value)} inputMode="decimal" disabled={loading} />
            <div className="md:col-span-2">
              <Textarea label="หมายเหตุ" value={note} onChange={(e) => setNote(e.target.value)} disabled={loading} />
            </div>
          </div>
        </div>

        <div className="rounded-xl border border-gray-200 bg-white p-5">
          <div className="text-sm font-semibold text-gray-900">ผูกออเดอร์</div>
          <div className="mt-3">
            <LabeledSelect
              label="เลือกออเดอร์ (ถ้ามี)"
              value={orderId}
              placeholder="-"
              options={[{ value: "", label: "-" }, ...orders]}
              disabled={loading}
              onChange={setOrderId}
            />
          </div>
          <div className="mt-4 rounded-xl border border-gray-200 bg-gray-50 p-4">
            <div className="text-xs font-semibold text-gray-600">ก่อนบันทึก</div>
            <div className="mt-2 grid gap-1 text-sm">
              <div className="flex items-center justify-between gap-3">
                <div className="text-gray-600">ประเภท</div>
                <div className="font-semibold text-red-700">รายจ่าย</div>
              </div>
              <div className="flex items-center justify-between gap-3">
                <div className="text-gray-600">ยอด</div>
                <div className="font-semibold text-gray-900">{Number(amount || 0).toLocaleString()} บาท</div>
              </div>
            </div>
          </div>

          <div className="mt-4 flex flex-wrap justify-end gap-2">
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
                    order_id: orderId.trim() || null,
                    poa_request_id: null,
                    txn_type: "EXPENSE",
                    source_type: "OPS",
                    amount: n,
                    currency: "THB",
                    txn_date: txnDate,
                    expense_name: expenseName.trim(),
                    note: note.trim() || null,
                    created_by_profile_id: userId,
                  };
                  const { error: e } = await supabase.from("payment_transactions").insert(payload);
                  if (e) throw new Error(e.message);
                  toast.success("บันทึกรายจ่ายแล้ว");
                  setLoading(false);
                  if (orderId.trim()) router.push(`/manage-orders/${encodeURIComponent(orderId.trim())}`);
                  else router.push("/finance");
                } catch (e: any) {
                  setLoading(false);
                  setError(e?.message ?? "บันทึกไม่สำเร็จ");
                }
              }}
              disabled={loading || !canSave}
              className="whitespace-nowrap"
            >
              บันทึก
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
