"use client";

import React, { useCallback, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "rizzui";
import { Title, Text } from "rizzui/typography";
import TablePagination from "@core/components/table/pagination";
import { getCoreRowModel, getPaginationRowModel, useReactTable } from "@tanstack/react-table";
import TableSearch from "@/components/table/table-search";

import { useAuth } from "@/app/shared/auth-provider";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";

type CustomerRel = { name: string } | null;

type OrderRow = {
  id: string;
  display_id: string | null;
  customer_id: string;
  status: string;
  total: number;
  paid_amount: number;
  remaining_amount: number;
  created_at: string;
  customers?: CustomerRel;
};

type ServiceProgress = { total: number; done: number };

function asMoney(n: number) {
  const v = Number.isFinite(n) ? n : 0;
  return v.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function customerNameFromRel(rel: CustomerRel) {
  return rel?.name ?? "-";
}

function statusLabel(status: string) {
  if (status === "draft") return "ร่าง";
  if (status === "in_progress") return "กำลังดำเนินการ";
  if (status === "completed") return "เสร็จสิ้น";
  if (status === "cancelled") return "ยกเลิก";
  return status || "-";
}

export default function ManageOrdersPage() {
  const { role, userId } = useAuth();
  const supabase = useMemo(() => createSupabaseBrowserClient(), []);
  const router = useRouter();
  const topRef = useRef<HTMLDivElement | null>(null);

  const [loading, setLoading] = useState(false);
  const [rows, setRows] = useState<OrderRow[]>([]);
  const [progressByOrderId, setProgressByOrderId] = useState<Record<string, ServiceProgress>>({});
  const [error, setError] = useState<string | null>(null);
  const [pagination, setPagination] = useState({ pageIndex: 0, pageSize: 10 });
  const [search, setSearch] = useState("");
  const [showClosedOnly, setShowClosedOnly] = useState(false);

  const canUsePage = role === "admin" || role === "operation";

  const refresh = useCallback(() => {
    Promise.resolve().then(async () => {
      if (!userId) return;
      setLoading(true);
      setError(null);

      const { data: payRows, error: payErr } = await supabase
        .from("order_payments")
        .select("order_id,amount,slip_url,slip_storage_provider,slip_storage_path,confirmed_at")
        .eq("installment_no", 1)
        .gt("amount", 0)
        .not("confirmed_at", "is", null);
      if (payErr) {
        setError(payErr.message);
        setRows([]);
        setLoading(false);
        return;
      }

      const orderIds = Array.from(
        new Set(
          ((payRows ?? []) as any[])
            .map((r) => String((r as any).order_id ?? "").trim())
            .filter((x) => x.length > 0)
        )
      );

      if (orderIds.length === 0) {
        setRows([]);
        setLoading(false);
        return;
      }

      const { data: ordRows, error: ordErr } = await supabase
        .from("orders")
        .select(
          "id,display_id,customer_id,status,total,paid_amount,remaining_amount,created_at,customers(name)",
        )
        .in("id", orderIds)
        .eq("status", showClosedOnly ? "completed" : "in_progress")
        .order("created_at", { ascending: false });
      if (ordErr) {
        setError(ordErr.message);
        setRows([]);
        setLoading(false);
        return;
      }

      const list = ((ordRows ?? []) as unknown as OrderRow[]) ?? [];
      setRows(list);

      const { data: itemRows, error: itemErr } = await supabase
        .from("order_items")
        .select("order_id,ops_status")
        .in("order_id", list.map((x) => x.id));
      if (itemErr) {
        setProgressByOrderId({});
        setLoading(false);
        return;
      }

      const prog: Record<string, ServiceProgress> = {};
      for (const r of (itemRows ?? []) as any[]) {
        const oid = String(r.order_id ?? "");
        if (!oid) continue;
        if (!prog[oid]) prog[oid] = { total: 0, done: 0 };
        prog[oid].total += 1;
        if (r.ops_status === "done") prog[oid].done += 1;
      }
      setProgressByOrderId(prog);
      setLoading(false);
    });
  }, [showClosedOnly, supabase, userId]);

  React.useEffect(() => {
    refresh();
  }, [refresh]);

  React.useEffect(() => {
    setPagination((p) => ({ ...p, pageIndex: 0 }));
  }, [rows.length, search]);

  const filteredRows = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter((r) => {
      const hay = [
        r.display_id,
        customerNameFromRel(r.customers ?? null),
        r.status,
        r.total,
        r.paid_amount,
        r.remaining_amount,
      ]
        .map((x) => String(x ?? "").toLowerCase())
        .join(" ");
      return hay.includes(q);
    });
  }, [rows, search]);

  const table = useReactTable({
    data: filteredRows,
    columns: useMemo(() => [{ accessorKey: "id" }], []),
    state: { pagination },
    onPaginationChange: setPagination,
    getCoreRowModel: getCoreRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
  });

  if (!canUsePage) {
    return (
      <div>
        <Title as="h1" className="text-lg font-semibold text-gray-900">
          จัดการออเดอร์
        </Title>
        <div className="mt-3 rounded-xl border border-gray-200 bg-white p-4 text-sm text-gray-700">หน้านี้สำหรับทีมงานปฏิบัติการเท่านั้น</div>
      </div>
    );
  }

  return (
    <div ref={topRef}>
      <div className="flex flex-col justify-between gap-3 md:flex-row md:items-end">
        <div>
          <Title as="h1" className="text-lg font-semibold text-gray-900">
            จัดการออเดอร์
          </Title>
          <Text className="mt-1 text-sm text-gray-600">แสดงเฉพาะออเดอร์ที่ชำระงวดแรกแล้ว</Text>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <TableSearch value={search} onChange={setSearch} disabled={loading} />
          <Button variant="outline" onClick={() => setShowClosedOnly((v) => !v)} disabled={loading}>
            {showClosedOnly ? "แสดงออเดอร์ที่กำลังดำเนินการ" : "แสดงออเดอร์ที่ปิดแล้ว"}
          </Button>
        </div>
      </div>

      {error ? <div className="mt-4 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">{error}</div> : null}

      <div className="mt-4 overflow-hidden rounded-xl border border-gray-200 bg-white">
        <div className="overflow-x-auto">
          <div className="min-w-[980px] overflow-hidden rounded-xl">
            <div className="grid grid-cols-[0.8fr_1.25fr_0.75fr_0.8fr_0.85fr_0.85fr_0.85fr] gap-3 border-b border-gray-200 bg-gray-50 px-4 py-2 text-xs font-semibold text-gray-600">
              <div>ID</div>
              <div>ลูกค้า</div>
              <div>บริการ</div>
              <div>สถานะ</div>
              <div className="text-right">ยอดสุทธิ</div>
              <div className="text-right">ยอดชำระแล้ว</div>
              <div className="text-right">ยอดคงเหลือ</div>
            </div>
            {rows.length === 0 ? (
              <div className="px-4 py-8 text-sm text-gray-500">{loading ? "กำลังโหลด..." : "ยังไม่มีข้อมูล"}</div>
            ) : (
              table.getRowModel().rows.map((row) => {
                const r = row.original as OrderRow;
                return (
                  <div
                    key={r.id}
                    role="button"
                    tabIndex={0}
                    className="grid grid-cols-[0.8fr_1.25fr_0.75fr_0.8fr_0.85fr_0.85fr_0.85fr] items-center gap-3 border-b border-gray-100 px-4 py-3 transition-colors hover:bg-gray-50 last:border-b-0"
                    onClick={() => router.push(`/manage-orders/${r.id}`)}
                    onKeyDown={(e) => {
                      if (e.key !== "Enter") return;
                      router.push(`/manage-orders/${r.id}`);
                    }}
                  >
                    <div className="text-sm font-medium text-gray-900">{r.display_id ?? "-"}</div>
                    <div className="text-sm font-medium text-gray-900">{customerNameFromRel(r.customers ?? null)}</div>
                    <div className="text-sm text-gray-700">
                      {(() => {
                        const p = progressByOrderId[r.id] ?? { total: 0, done: 0 };
                        return p.total ? `${p.done}/${p.total}` : "-";
                      })()}
                    </div>
                    <div className="text-sm text-gray-700">{statusLabel(r.status)}</div>
                    <div className="text-right text-sm font-medium text-gray-900">{asMoney(Number(r.total ?? 0))}</div>
                    <div className="text-right text-sm text-gray-700">{asMoney(Number(r.paid_amount ?? 0))}</div>
                    <div className="text-right text-sm text-gray-700">{asMoney(Number(r.remaining_amount ?? 0))}</div>
                  </div>
                );
              })
            )}
          </div>
        </div>
        <TablePagination table={table} />
      </div>
    </div>
  );
}
