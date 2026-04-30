"use client";

import React, { useCallback, useMemo, useState } from "react";
import { Button, Input } from "rizzui";
import { Title, Text } from "rizzui/typography";
import AppSelect from "@core/ui/app-select";
import TablePagination from "@core/components/table/pagination";
import { getCoreRowModel, getPaginationRowModel, useReactTable } from "@tanstack/react-table";
import TableSearch from "@/components/table/table-search";

import { useAuth } from "@/app/shared/auth-provider";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";

type CustomerOption = { id: string; name: string };
type WorkerRow = {
  id: string;
  full_name: string;
  customer_id: string | null;
  passport_no: string | null;
  nationality: string | null;
  created_at: string;
};

export default function MyWorkersPage() {
  const { userId } = useAuth();
  const supabase = useMemo(() => createSupabaseBrowserClient(), []);

  const [loading, setLoading] = useState(false);
  const [rows, setRows] = useState<WorkerRow[]>([]);
  const [customers, setCustomers] = useState<CustomerOption[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [pagination, setPagination] = useState({ pageIndex: 0, pageSize: 10 });
  const [search, setSearch] = useState("");

  const [fullName, setFullName] = useState("");
  const [customerId, setCustomerId] = useState<string>("");
  const [passportNo, setPassportNo] = useState("");
  const [nationality, setNationality] = useState("MM");

  const customerOptions = useMemo(() => customers.map((c) => ({ label: c.name, value: c.id })), [customers]);

  const refresh = useCallback(() => {
    Promise.resolve().then(async () => {
      setLoading(true);
      setError(null);

      const [custRes, workerRes] = await Promise.all([
        supabase.from("customers").select("id,name").order("updated_at", { ascending: false }).order("created_at", { ascending: false }),
        supabase
          .from("workers")
          .select("id,full_name,customer_id,passport_no,nationality,created_at")
          .order("created_at", { ascending: false }),
      ]);

      const firstError = workerRes.error;
      if (custRes.error) {
        const msg = String(custRes.error.message ?? "");
        if (msg.includes("customers.updated_at") || (msg.includes("updated_at") && msg.toLowerCase().includes("does not exist"))) {
          const fallback = await supabase.from("customers").select("id,name").order("created_at", { ascending: false });
          if (!fallback.error) setCustomers(((fallback.data ?? []) as CustomerOption[]) ?? []);
        }
      }
      if (firstError) {
        setError(firstError.message);
        setRows([]);
        setCustomers([]);
        setLoading(false);
        return;
      }

      if (!custRes.error) setCustomers(((custRes.data ?? []) as CustomerOption[]) ?? []);
      setRows(((workerRes.data ?? []) as WorkerRow[]) ?? []);
      setLoading(false);
    });
  }, [supabase]);

  React.useEffect(() => {
    setPagination((p) => ({ ...p, pageIndex: 0 }));
  }, [rows.length, search]);

  const filteredRows = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter((r) => {
      const customerName = r.customer_id ? customers.find((c) => c.id === r.customer_id)?.name ?? r.customer_id : "";
      const hay = [r.full_name, customerName, r.passport_no, r.nationality]
        .map((x) => String(x ?? "").toLowerCase())
        .join(" ");
      return hay.includes(q);
    });
  }, [customers, rows, search]);

  const table = useReactTable({
    data: filteredRows,
    columns: useMemo(() => [{ accessorKey: "id" }], []),
    state: { pagination },
    onPaginationChange: setPagination,
    getCoreRowModel: getCoreRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
  });

  return (
    <div>
      <div className="flex flex-col justify-between gap-3 md:flex-row md:items-end">
        <div>
          <Title as="h1" className="text-lg font-semibold text-gray-900">
            แรงงานของฉัน
          </Title>
          <Text className="mt-1 text-sm text-gray-600">เฉพาะแรงงานที่คุณดูแล (ตามสิทธิ์ RLS)</Text>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <TableSearch value={search} onChange={setSearch} disabled={loading} />
          <Button variant="outline" onClick={() => refresh()} disabled={loading}>
            รีเฟรช
          </Button>
        </div>
      </div>

      <div className="mt-5 grid gap-3 rounded-xl border border-gray-200 bg-white p-4">
        <div className="text-sm font-semibold text-gray-900">เพิ่มแรงงาน</div>
        <div className="grid gap-3 md:grid-cols-2">
          <Input label="ชื่อ-นามสกุล" value={fullName} onChange={(e) => setFullName(e.target.value)} />
          <div>
            <AppSelect
              label="ลูกค้า"
              placeholder="เลือก"
              options={customerOptions}
              value={customerId}
              onChange={(v: string) => setCustomerId(v)}
              getOptionValue={(o) => o.value}
              displayValue={(selected) => customerOptions.find((o) => o.value === selected)?.label ?? ""}
              selectClassName="h-10 px-3"
            />
          </div>
          <Input label="Passport No." value={passportNo} onChange={(e) => setPassportNo(e.target.value)} />
          <Input label="สัญชาติ" value={nationality} onChange={(e) => setNationality(e.target.value)} />
        </div>
        <div>
          <Button
            onClick={async () => {
              setLoading(true);
              setError(null);
              const { error: e } = await supabase.from("workers").insert({
                full_name: fullName.trim(),
                customer_id: customerId || null,
                passport_no: passportNo.trim() || null,
                nationality: nationality.trim() || null,
                created_by_profile_id: userId,
              });
              if (e) {
                setError(e.message);
                setLoading(false);
                return;
              }
              setFullName("");
              setCustomerId("");
              setPassportNo("");
              setNationality("MM");
              setLoading(false);
              refresh();
            }}
            disabled={loading || fullName.trim().length === 0}
          >
            บันทึก
          </Button>
        </div>
      </div>

      {error ? <div className="mt-4 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">{error}</div> : null}

      <div className="mt-4 overflow-hidden rounded-xl border border-gray-200 bg-white">
        <div className="overflow-x-auto">
          <div className="min-w-[920px]">
            <div className="grid grid-cols-[1.2fr_0.8fr_0.6fr_0.4fr] gap-3 border-b border-gray-200 bg-gray-50 px-4 py-2 text-xs font-semibold text-gray-600">
              <div>แรงงาน</div>
              <div>ลูกค้า</div>
              <div>Passport</div>
              <div>สัญชาติ</div>
            </div>
            {rows.length === 0 ? (
              <div className="px-4 py-8 text-sm text-gray-500">{loading ? "กำลังโหลด..." : "ยังไม่มีข้อมูล"}</div>
            ) : (
              table.getRowModel().rows.map((row) => {
                const r = row.original as WorkerRow;
                return (
                  <div key={r.id} className="grid grid-cols-[1.2fr_0.8fr_0.6fr_0.4fr] gap-3 border-b border-gray-100 px-4 py-3 last:border-b-0">
                    <div className="text-sm font-medium text-gray-900">{r.full_name}</div>
                    <div className="text-sm text-gray-700">
                      {r.customer_id ? customers.find((c) => c.id === r.customer_id)?.name ?? r.customer_id : "-"}
                    </div>
                    <div className="text-sm text-gray-700">{r.passport_no ?? "-"}</div>
                    <div className="text-sm text-gray-700">{r.nationality ?? "-"}</div>
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
