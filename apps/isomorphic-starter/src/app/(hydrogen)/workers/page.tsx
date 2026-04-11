"use client";

import React, { useCallback, useMemo, useRef, useState } from "react";
import Image from "next/image";
import { Button } from "rizzui";
import { Title, Text } from "rizzui/typography";
import AppSelect from "@core/ui/app-select";
import TablePagination from "@core/components/table/pagination";
import { getCoreRowModel, useReactTable } from "@tanstack/react-table";

import { useAuth } from "@/app/shared/auth-provider";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import { WorkerEditModal } from "@/app/(hydrogen)/workers/_components/worker-edit-modal";

type CustomerOption = { id: string; name: string };
type WorkerRow = {
  id: string;
  full_name: string;
  customer_id: string | null;
  passport_no: string | null;
  passport_expire_date: string | null;
  nationality: string | null;
  birth_date: string | null;
  os_sex: string | null;
  profile_pic_url: string | null;
  visa_number: string | null;
  visa_exp_date: string | null;
  wp_number: string | null;
  wp_expire_date: string | null;
  wp_type: string | null;
  created_at: string;
};

type WorkerSearchField = "name" | "employer" | "passport_wp";

export default function WorkersPage() {
  const { role, userId } = useAuth();
  const supabase = useMemo(() => createSupabaseBrowserClient(), []);
  const topRef = useRef<HTMLDivElement | null>(null);

  const [loading, setLoading] = useState(false);
  const [rows, setRows] = useState<WorkerRow[]>([]);
  const [customers, setCustomers] = useState<CustomerOption[]>([]);
  const [error, setError] = useState<string | null>(null);

  const [editOpen, setEditOpen] = useState(false);
  const [editing, setEditing] = useState<WorkerRow | null>(null);

  const [pagination, setPagination] = useState({ pageIndex: 0, pageSize: 10 });
  const [totalCount, setTotalCount] = useState(0);
  const [searchDraft, setSearchDraft] = useState("");
  const [searchApplied, setSearchApplied] = useState("");
  const [searchFieldDraft, setSearchFieldDraft] = useState<WorkerSearchField>("name");
  const [searchFieldApplied, setSearchFieldApplied] = useState<WorkerSearchField>("name");

  const refresh = useCallback(() => {
    Promise.resolve().then(async () => {
      setLoading(true);
      setError(null);

      const from = pagination.pageIndex * pagination.pageSize;
      const to = from + pagination.pageSize - 1;

      const q = searchApplied.trim();

      let workerQuery = supabase
        .from("workers")
        .select(
          "id,full_name,customer_id,passport_no,passport_expire_date,nationality,birth_date,os_sex,profile_pic_url,visa_number,visa_exp_date,wp_number,wp_expire_date,wp_type,created_at",
          { count: "estimated" },
        )
        .order("created_at", { ascending: false });

      if (q) {
        const like = `%${q.replaceAll("%", "\\%").replaceAll("_", "\\_")}%`;
        if (searchFieldApplied === "name") {
          workerQuery = workerQuery.ilike("full_name", like);
        } else if (searchFieldApplied === "passport_wp") {
          workerQuery = workerQuery.or([`passport_no.ilike.${like}`, `wp_number.ilike.${like}`].join(","));
        } else if (searchFieldApplied === "employer") {
          const custRes = await supabase.from("customers").select("id").ilike("name", like).limit(500);
          if (custRes.error) {
            setError(custRes.error.message);
            setRows([]);
            setTotalCount(0);
            setLoading(false);
            return;
          }
          const ids = (custRes.data ?? []).map((x: any) => String(x.id)).filter(Boolean);
          if (ids.length === 0) {
            setRows([]);
            setTotalCount(0);
            setLoading(false);
            return;
          }
          workerQuery = workerQuery.in("customer_id", ids);
        }
      }

      const workerRes = await workerQuery.range(from, to);
      if (workerRes.error) {
        setError(workerRes.error.message);
        setRows([]);
        setLoading(false);
        return;
      }

      setRows(((workerRes.data ?? []) as WorkerRow[]) ?? []);
      setTotalCount(workerRes.count ?? 0);
      setLoading(false);
    });
  }, [pagination.pageIndex, pagination.pageSize, searchApplied, searchFieldApplied, supabase]);

  const refreshCustomers = useCallback(() => {
    Promise.resolve().then(async () => {
      const { data, error: e } = await supabase.from("customers").select("id,name").order("created_at", { ascending: false });
      if (e) return;
      setCustomers(((data ?? []) as CustomerOption[]) ?? []);
    });
  }, [supabase]);

  React.useEffect(() => {
    refresh();
  }, [refresh]);

  React.useEffect(() => {
    refreshCustomers();
  }, [refreshCustomers]);

  React.useEffect(() => {
    if (pagination.pageIndex === 0) return;
    setPagination((p) => ({ ...p, pageIndex: 0 }));
  }, [pagination.pageSize]);

  React.useEffect(() => {
    setPagination((p) => ({ ...p, pageIndex: 0 }));
  }, [searchApplied, searchFieldApplied]);

  const canEdit = role !== "employer";

  const table = useReactTable({
    data: rows,
    columns: useMemo(() => [{ accessorKey: "id" }], []),
    state: { pagination },
    onPaginationChange: setPagination,
    manualPagination: true,
    pageCount: Math.max(1, Math.ceil(Math.max(0, totalCount) / Math.max(1, pagination.pageSize))),
    getCoreRowModel: getCoreRowModel(),
  });

  return (
    <div ref={topRef}>
      <div className="flex flex-col justify-between gap-3 md:flex-row md:items-end">
        <div>
          <Title as="h1" className="text-lg font-semibold text-gray-900">
            แรงงาน
          </Title>
          <Text className="mt-1 text-sm text-gray-600">ข้อมูลแรงงานต่างด้าวและความสัมพันธ์กับลูกค้า</Text>
        </div>

        {canEdit ? (
          <div className="flex flex-wrap gap-2">
            <div className="w-full md:w-44">
              <AppSelect
                placeholder="ค้นหาจาก"
                options={[
                  { label: "ชื่อแรงงาน", value: "name" },
                  { label: "นายจ้าง", value: "employer" },
                  { label: "Passport/WP", value: "passport_wp" },
                ]}
                value={searchFieldDraft}
                onChange={(v: WorkerSearchField) => setSearchFieldDraft(v)}
                getOptionValue={(o) => o.value}
                displayValue={(selected) => (selected === "name" ? "ชื่อแรงงาน" : selected === "employer" ? "นายจ้าง" : "Passport/WP")}
                selectClassName="h-10 px-3"
                inPortal={false}
                disabled={loading}
              />
            </div>

            <div className="relative w-full md:w-72">
              <input
                value={searchDraft}
                onChange={(e) => setSearchDraft(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key !== "Enter") return;
                  setSearchApplied(searchDraft.trim());
                  setSearchFieldApplied(searchFieldDraft);
                }}
                placeholder="คำค้นหา..."
                disabled={loading}
                className="h-10 w-full rounded-md border border-gray-200 bg-white px-3 text-sm text-gray-900 placeholder:text-gray-400 focus:border-blue-600 focus:outline-none focus:ring-2 focus:ring-blue-100 disabled:cursor-not-allowed disabled:bg-gray-50 disabled:text-gray-500"
              />
            </div>

            <Button
              onClick={() => {
                setSearchApplied(searchDraft.trim());
                setSearchFieldApplied(searchFieldDraft);
              }}
              disabled={loading}
            >
              ค้นหา
            </Button>
            <Button
              variant="outline"
              onClick={() => {
                setSearchDraft("");
                setSearchApplied("");
                setSearchFieldDraft("name");
                setSearchFieldApplied("name");
              }}
              disabled={loading}
            >
              ล้าง
            </Button>
            <Button
              variant="outline"
              onClick={() => {
                setEditing(null);
                setEditOpen(true);
              }}
              disabled={loading}
            >
              เพิ่ม
            </Button>
          </div>
        ) : null}
      </div>

      {error ? <div className="mt-4 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">{error}</div> : null}

      <WorkerEditModal
        open={editOpen}
        onClose={() => {
          setEditOpen(false);
          setEditing(null);
        }}
        initial={editing}
        supabase={supabase}
        role={role}
        userId={userId}
        customers={customers}
        onSaved={() => refresh()}
      />

      <div className="mt-4 overflow-hidden rounded-xl border border-gray-200 bg-white">
        <div className="overflow-x-auto">
          <div className="min-w-[1200px]">
            <div className="grid grid-cols-[1.2fr_1fr_1.4fr] gap-3 border-b border-gray-200 bg-gray-50 px-4 py-2 text-xs font-semibold text-gray-600">
              <div>แรงงาน</div>
              <div>นายจ้าง</div>
              <div>พาสปอร์ต/ใบอนุญาติทำงาน</div>
            </div>

            {rows.length === 0 ? (
              <div className="px-4 py-8 text-sm text-gray-500">{loading ? "กำลังโหลด..." : "ยังไม่มีข้อมูล"}</div>
            ) : (
              table.getRowModel().rows.map((row) => {
                const r = row.original as WorkerRow;
                return (
                  <div
                    key={r.id}
                    role={canEdit ? "button" : undefined}
                    tabIndex={canEdit ? 0 : undefined}
                    className={
                      "grid grid-cols-[1.2fr_1fr_1.4fr] gap-3 border-b border-gray-100 px-4 py-3 last:border-b-0" +
                      (canEdit ? " cursor-pointer transition-colors hover:bg-gray-100 active:bg-gray-200" : "")
                    }
                    onClick={() => {
                      if (!canEdit) return;
                      setEditing(r);
                      setEditOpen(true);
                    }}
                    onKeyDown={(e) => {
                      if (e.key !== "Enter") return;
                      if (!canEdit) return;
                      setEditing(r);
                      setEditOpen(true);
                    }}
                  >
                    <div>
                      <div className="flex items-center gap-3">
                        {r.profile_pic_url ? (
                          <Image
                            src={r.profile_pic_url}
                            alt={r.full_name}
                            width={36}
                            height={36}
                            unoptimized
                            className="h-9 w-9 rounded-lg border border-gray-200 object-cover"
                          />
                        ) : (
                          <div className="h-9 w-9 rounded-lg border border-gray-200 bg-gray-50" />
                        )}
                        <div>
                          <div className="text-sm font-medium text-gray-900">{r.full_name}</div>
                          <div className="mt-0.5 truncate whitespace-nowrap text-xs text-gray-500">
                            {(() => {
                              const nat = String(r.nationality ?? "").trim();
                              const birth = r.birth_date ? `เกิด ${r.birth_date}` : "";
                              if (nat && birth) return `${nat} • ${birth}`;
                              if (nat) return nat;
                              if (birth) return birth;
                              return "-";
                            })()}
                          </div>
                        </div>
                      </div>
                    </div>
                    <div>
                      <div className="text-sm text-gray-900">
                        {r.customer_id ? customers.find((c) => c.id === r.customer_id)?.name ?? r.customer_id : "-"}
                      </div>
                      <div className="mt-0.5 text-xs text-gray-500">{r.os_sex ?? ""}</div>
                    </div>
                    <div>
                      <div className="mt-0.5 grid gap-0.5 text-xs text-gray-500">
                        {r.passport_no || r.passport_expire_date ? (
                          <div className="whitespace-nowrap">
                            {r.passport_no ? `P ${r.passport_no}` : "P"}
                            {r.passport_expire_date ? ` • หมดอายุ ${r.passport_expire_date}` : ""}
                          </div>
                        ) : null}
                        {r.wp_number || r.wp_expire_date ? (
                          <div className="whitespace-nowrap">
                            {r.wp_number ? `WP ${r.wp_number}` : "WP"}
                            {r.wp_expire_date ? ` • หมดอายุ ${r.wp_expire_date}` : ""}
                          </div>
                        ) : null}
                        {!r.passport_no && !r.passport_expire_date && !r.wp_number && !r.wp_expire_date ? (
                          <div className="whitespace-nowrap">-</div>
                        ) : null}
                      </div>
                    </div>
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

