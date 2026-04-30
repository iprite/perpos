"use client";

import React, { useCallback, useMemo, useRef, useState } from "react";
import dayjs from "dayjs";
import toast from "react-hot-toast";
import { Button } from "rizzui";
import { Title, Text } from "rizzui/typography";
import { Modal } from "@core/modal-views/modal";

import TableSearch from "@/components/table/table-search";
import { useAuth } from "@/app/shared/auth-provider";
import { useConfirmDialog } from "@/app/shared/confirm-dialog/provider";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";

import { TransactionModal, type PaymentTransactionRow } from "@/components/finance/transaction-modal";
import { FinanceFilters } from "@/components/finance/finance-filters";
import { FinanceTransactionsTable } from "@/components/finance/finance-transactions-table";

type OrderMini = { id: string; display_id: string | null; customers?: { name: string | null } | null };

function money(n: number) {
  const x = Number.isFinite(n) ? n : 0;
  return x.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

async function getSignedStorageUrl(params: { supabase: any; table: string; id: string; disposition: "inline" | "attachment" }) {
  const sessionRes = await params.supabase.auth.getSession();
  const token = sessionRes.data.session?.access_token;
  if (!token) throw new Error("ยังไม่ได้เข้าสู่ระบบ");
  const res = await fetch("/api/storage/signed-url", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ table: params.table, id: params.id, disposition: params.disposition }),
  });
  if (!res.ok) {
    const data = (await res.json().catch(() => ({}))) as { error?: string };
    throw new Error(data.error || "ขอ signed url ไม่สำเร็จ");
  }
  const data = (await res.json()) as { ok: true; url: string };
  return data.url;
}

export default function FinancePage() {
  const { role, userId } = useAuth();
  const supabase = useMemo(() => createSupabaseBrowserClient(), []);
  const confirmDialog = useConfirmDialog();
  const topRef = useRef<HTMLDivElement | null>(null);

  const canUsePage = role === "admin" || role === "sale" || role === "operation";

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [rows, setRows] = useState<PaymentTransactionRow[]>([]);
  const [ordersById, setOrdersById] = useState<Record<string, OrderMini>>({});

  const [dateStart, setDateStart] = useState(dayjs().add(-30, "day").format("YYYY-MM-DD"));
  const [dateEnd, setDateEnd] = useState(dayjs().format("YYYY-MM-DD"));
  const [txnType, setTxnType] = useState<string>("");
  const [sourceType, setSourceType] = useState<string>("");
  const [search, setSearch] = useState("");

  const [expenseOpen, setExpenseOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [editing, setEditing] = useState<PaymentTransactionRow | null>(null);

  const [slipOpen, setSlipOpen] = useState(false);
  const [slipLoading, setSlipLoading] = useState(false);
  const [slipUrl, setSlipUrl] = useState<string | null>(null);
  const [slipDownloadUrl, setSlipDownloadUrl] = useState<string | null>(null);
  const [slipError, setSlipError] = useState<string | null>(null);

  const orderOptions = useMemo(() => {
    return Object.values(ordersById)
      .map((o) => {
        const title = [o.display_id || o.id, o.customers?.name].filter(Boolean).join(" • ");
        return { value: o.id, label: title || o.id };
      })
      .sort((a, b) => a.label.localeCompare(b.label));
  }, [ordersById]);

  const totals = useMemo(() => {
    const income = rows.filter((r) => r.txn_type === "INCOME").reduce((acc, r) => acc + Number(r.amount ?? 0), 0);
    const expense = rows.filter((r) => r.txn_type === "EXPENSE").reduce((acc, r) => acc + Number(r.amount ?? 0), 0);
    return { income, expense, net: income - expense };
  }, [rows]);

  const refresh = useCallback(() => {
    Promise.resolve().then(async () => {
      if (!canUsePage) return;
      setLoading(true);
      setError(null);

      let q = supabase
        .from("payment_transactions")
        .select("id,order_id,poa_request_id,txn_type,source_type,amount,currency,txn_date,expense_name,note,source_table,source_id")
        .order("txn_date", { ascending: false })
        .order("created_at", { ascending: false })
        .limit(500);

      if (dateStart) q = q.gte("txn_date", dateStart);
      if (dateEnd) q = q.lte("txn_date", dateEnd);
      if (txnType) q = q.eq("txn_type", txnType);
      if (sourceType) q = q.eq("source_type", sourceType);

      const s = search.trim();
      if (s) q = q.or(`expense_name.ilike.%${s}%,note.ilike.%${s}%`);

      const { data, error: e } = await q;
      if (e) {
        setError(e.message);
        setRows([]);
        setLoading(false);
        return;
      }
      const nextRows = ((data ?? []) as any[]) as PaymentTransactionRow[];
      setRows(nextRows);

      const orderIds = Array.from(new Set(nextRows.map((r) => String(r.order_id ?? "").trim()).filter(Boolean)));
      if (orderIds.length === 0) {
        setOrdersById((prev) => prev);
        setLoading(false);
        return;
      }
      const { data: ord, error: oe } = await supabase
        .from("orders")
        .select("id,display_id,customers(name)")
        .in("id", orderIds)
        .limit(500);
      if (!oe) {
        const map: Record<string, OrderMini> = {};
        for (const o of (ord ?? []) as any[]) map[String(o.id)] = o as OrderMini;
        setOrdersById((prev) => ({ ...prev, ...map }));
      }
      setLoading(false);
    });
  }, [canUsePage, dateEnd, dateStart, search, sourceType, supabase, txnType]);

  const refreshOrderCatalog = useCallback(() => {
    Promise.resolve().then(async () => {
      if (!canUsePage) return;
      const { data, error: e } = await supabase
        .from("orders")
        .select("id,display_id,customers(name)")
        .order("created_at", { ascending: false })
        .limit(200);
      if (e) return;
      const map: Record<string, OrderMini> = {};
      for (const o of (data ?? []) as any[]) map[String(o.id)] = o as OrderMini;
      setOrdersById((prev) => ({ ...map, ...prev }));
    });
  }, [canUsePage, supabase]);

  React.useEffect(() => {
    refresh();
  }, [refresh]);

  React.useEffect(() => {
    refreshOrderCatalog();
  }, [refreshOrderCatalog]);

  if (!canUsePage) {
    return (
      <div className="p-6">
        <Title as="h1" className="text-lg font-semibold text-gray-900">
          ธุรกรรมการเงิน
        </Title>
        <Text className="mt-2 text-sm text-gray-600">คุณไม่มีสิทธิ์เข้าหน้านี้</Text>
      </div>
    );
  }

  return (
    <div ref={topRef}>
      <div className="flex flex-col justify-between gap-3 md:flex-row md:items-end">
        <div>
          <Title as="h1" className="text-lg font-semibold text-gray-900">
            ธุรกรรมการเงิน
          </Title>
          <Text className="mt-1 text-sm text-gray-600">บันทึกรายรับ/รายจ่ายและคำนวณกำไรสุทธิรายออเดอร์</Text>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <TableSearch value={search} onChange={setSearch} disabled={loading} />
          <Button
            onClick={() => {
              setExpenseOpen(true);
            }}
            disabled={loading}
          >
            บันทึกรายจ่าย
          </Button>
        </div>
      </div>

      {error ? <div className="mt-4 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">{error}</div> : null}

      <div className="mt-5 grid gap-3 md:grid-cols-3">
        <div className="rounded-xl border border-gray-200 bg-white p-4">
          <div className="text-sm font-semibold text-gray-900">รวมรายรับ</div>
          <div className="mt-2 text-2xl font-semibold text-green-700 tabular-nums">{money(totals.income)}</div>
        </div>
        <div className="rounded-xl border border-gray-200 bg-white p-4">
          <div className="text-sm font-semibold text-gray-900">รวมรายจ่าย</div>
          <div className="mt-2 text-2xl font-semibold text-red-700 tabular-nums">{money(totals.expense)}</div>
        </div>
        <div className="rounded-xl border border-gray-200 bg-white p-4">
          <div className="text-sm font-semibold text-gray-900">ยอดสุทธิ</div>
          <div className="mt-2 text-2xl font-semibold text-gray-900 tabular-nums">{money(totals.net)}</div>
        </div>
      </div>

      <div className="mt-4">
        <FinanceFilters
          loading={loading}
          dateStart={dateStart}
          dateEnd={dateEnd}
          txnType={txnType}
          sourceType={sourceType}
          onChangeDateStart={setDateStart}
          onChangeDateEnd={setDateEnd}
          onChangeTxnType={setTxnType}
          onChangeSourceType={setSourceType}
          onRefresh={() => refresh()}
          onReset={() => {
            setTxnType("");
            setSourceType("");
            setSearch("");
            setDateStart(dayjs().add(-30, "day").format("YYYY-MM-DD"));
            setDateEnd(dayjs().format("YYYY-MM-DD"));
          }}
        />
      </div>

      <div className="mt-4">
        <FinanceTransactionsTable
          rows={rows}
          ordersById={ordersById}
          loading={loading}
          onEdit={(row) => {
            setEditing(row);
            setEditOpen(true);
          }}
          onViewSlip={async (row) => {
            const table = String((row as any).source_table ?? "").trim();
            const id = String((row as any).source_id ?? "").trim();
            if (!table || !id) {
              toast.error("ไม่พบข้อมูลสลิป");
              return;
            }
            const resolvedTable = table === "order_payments" ? "order_payments" : table === "poa_item_payments" ? "poa_item_payments" : "";
            if (!resolvedTable) {
              toast.error("ยังไม่รองรับแหล่งที่มาสลิปนี้");
              return;
            }
            setSlipOpen(true);
            setSlipLoading(true);
            setSlipError(null);
            setSlipUrl(null);
            setSlipDownloadUrl(null);
            try {
              const url = await getSignedStorageUrl({ supabase, table: resolvedTable, id, disposition: "inline" });
              const downloadUrl = await getSignedStorageUrl({ supabase, table: resolvedTable, id, disposition: "attachment" });
              setSlipUrl(url);
              setSlipDownloadUrl(downloadUrl);
              setSlipLoading(false);
            } catch (e: any) {
              setSlipLoading(false);
              setSlipError(e?.message ?? "เปิดสลิปไม่สำเร็จ");
            }
          }}
          onDelete={async (row) => {
            const ok = await confirmDialog({ title: "ยืนยันการลบ", message: "ต้องการลบรายการนี้หรือไม่?", confirmText: "ลบ", tone: "danger" });
            if (!ok) return;
            setLoading(true);
            setError(null);
            try {
              const { error: de } = await supabase.from("payment_transactions").delete().eq("id", row.id);
              if (de) throw new Error(de.message);
              toast.success("ลบแล้ว");
              setLoading(false);
              refresh();
            } catch (e: any) {
              setLoading(false);
              setError(e?.message ?? "ลบไม่สำเร็จ");
            }
          }}
        />
      </div>

      <TransactionModal
        open={expenseOpen}
        mode="create"
        variant="expense"
        supabase={supabase as any}
        userId={userId}
        loading={loading}
        setLoading={setLoading}
        setError={setError}
        orderOptions={orderOptions}
        initial={{ txn_type: "EXPENSE", source_type: "OPS", amount: 0, txn_date: dayjs().format("YYYY-MM-DD") }}
        onSaved={() => {
          toast.success("บันทึกรายจ่ายแล้ว");
          setExpenseOpen(false);
          refresh();
        }}
        onClose={() => setExpenseOpen(false)}
      />

      <TransactionModal
        open={editOpen}
        mode="edit"
        supabase={supabase as any}
        userId={userId}
        loading={loading}
        setLoading={setLoading}
        setError={setError}
        orderOptions={orderOptions}
        initial={editing}
        onSaved={() => {
          toast.success("อัปเดตแล้ว");
          setEditOpen(false);
          setEditing(null);
          refresh();
        }}
        onClose={() => {
          setEditOpen(false);
          setEditing(null);
        }}
      />

      <Modal
        isOpen={slipOpen}
        onClose={() => {
          if (slipLoading) return;
          setSlipOpen(false);
          setSlipLoading(false);
          setSlipUrl(null);
          setSlipDownloadUrl(null);
          setSlipError(null);
        }}
        size="lg"
        rounded="md"
      >
        <div className="rounded-xl bg-white p-5">
          <div className="flex items-center justify-between gap-2">
            <div className="min-w-0 truncate text-base font-semibold text-gray-900">สลิปการชำระเงิน</div>
            <div className="flex shrink-0 gap-2">
              <Button
                variant="outline"
                onClick={() => {
                  if (!slipDownloadUrl) return;
                  window.open(slipDownloadUrl, "_blank", "noopener,noreferrer");
                }}
                disabled={slipLoading || !slipDownloadUrl}
              >
                ดาวน์โหลด
              </Button>
              <Button
                variant="outline"
                onClick={() => {
                  setSlipOpen(false);
                  setSlipLoading(false);
                  setSlipUrl(null);
                  setSlipDownloadUrl(null);
                  setSlipError(null);
                }}
                disabled={slipLoading}
              >
                ปิด
              </Button>
            </div>
          </div>

          {slipError ? <div className="mt-4 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">{slipError}</div> : null}

          <div className="mt-4 overflow-hidden rounded-lg border border-gray-200 bg-gray-50">
            {slipUrl ? (
              <iframe src={slipUrl} className="h-[70vh] w-full" />
            ) : slipLoading ? (
              <div className="p-6 text-sm text-gray-600">กำลังโหลด...</div>
            ) : (
              <div className="p-6 text-sm text-gray-600">ไม่พบไฟล์</div>
            )}
          </div>
        </div>
      </Modal>
    </div>
  );
}
