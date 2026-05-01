"use client";

import Link from "next/link";
import React, { useCallback, useMemo, useRef, useState } from "react";
import { Button } from "rizzui";
import { Title, Text } from "rizzui/typography";
import TablePagination from "@core/components/table/pagination";
import { getCoreRowModel, useReactTable } from "@tanstack/react-table";
import TableSearch from "@/components/table/table-search";

import { useAuth } from "@/app/shared/auth-provider";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import { resolvePoaUnitPricePerWorker } from "@/components/poa/poa-pricing";
import { CreateRequestModal } from "@/app/(hydrogen)/my-poa-requests/_components/create-request-modal";
import { RequestDetailModal } from "@/app/(hydrogen)/my-poa-requests/_components/request-detail-modal";

type TypeOption = { id: string; name: string; base_price: number; is_active: boolean };

type ItemRow = {
  id: string;
  poa_request_type_id: string;
  unit_price_per_worker: number;
  worker_count: number;
  total_price: number;
  payment_status: string;
  poa_request_types?: { id: string; name: string; base_price: number } | null;
};

type PoaRow = {
  id: string;
  display_id: string | null;
  import_temp_id: string | null;
  poa_request_type_id: string | null;
  representative_profile_id: string | null;
  representative_rep_code: string | null;
  representative_name: string | null;
  employer_name: string | null;
  employer_tax_id: string | null;
  employer_tel: string | null;
  employer_type: string | null;
  employer_address: string | null;
  worker_count: number;
  worker_male: number | null;
  worker_female: number | null;
  worker_nation: string | null;
  worker_type: string | null;
  unit_price: number | null;
  total_price: number | null;
  status: string;
  created_at: string;
  poa_request_items?: ItemRow[];
};

function statusLabel(s: string) {
  if (s === "draft") return "ร่าง";
  if (s === "submitted") return "รอชำระ";
  if (s === "paid") return "ชำระแล้ว";
  if (s === "completed") return "สร้าง PDF แล้ว";
  if (s === "need_info") return "ขอข้อมูลเพิ่ม";
  if (s === "rejected") return "ปฏิเสธ";
  if (s === "cancelled") return "ยกเลิก";
  if (s === "issued") return "ออกหนังสือแล้ว";
  return s;
}

function sumTotal(items: ItemRow[] | undefined) {
  return (items ?? []).reduce((acc, x) => acc + Number(x.total_price ?? 0), 0);
}

function resolveTotal(row: PoaRow) {
  const fromItems = sumTotal(row.poa_request_items);
  if (fromItems > 0) return fromItems;
  const t = Number(row.total_price ?? 0);
  return Number.isFinite(t) ? t : 0;
}

export default function MyPoaRequestsPage() {
  const { role, userId } = useAuth();
  const supabase = useMemo(() => createSupabaseBrowserClient(), []);
  const topRef = useRef<HTMLDivElement | null>(null);

  const [loading, setLoading] = useState(false);
  const [rows, setRows] = useState<PoaRow[]>([]);
  const [types, setTypes] = useState<TypeOption[]>([]);
  const [error, setError] = useState<string | null>(null);

  const [pagination, setPagination] = useState({ pageIndex: 0, pageSize: 10 });
  const [totalCount, setTotalCount] = useState(0);
  const [search, setSearch] = useState("");

  const [createOpen, setCreateOpen] = useState(false);
  const [detailOpen, setDetailOpen] = useState(false);
  const [detailId, setDetailId] = useState<string | null>(null);

  const canUsePage = role === "representative";

  const [resolvedTypePriceById, setResolvedTypePriceById] = useState<Map<string, number>>(new Map());

  const typeById = useMemo(() => new Map(types.map((t) => [t.id, t])), [types]);
  React.useEffect(() => {
    Promise.resolve().then(async () => {
      if (!userId) return;
      if (types.length === 0) {
        setResolvedTypePriceById(new Map());
        return;
      }
      const { data: myRep } = await supabase.from("company_representatives").select("rep_code").eq("profile_id", userId).maybeSingle();
      const repCode = String((myRep as any)?.rep_code ?? "").trim();
      if (!repCode) {
        setResolvedTypePriceById(new Map());
        return;
      }
      const entries = await Promise.all(
        types.map(async (t) => {
          const resolved = await resolvePoaUnitPricePerWorker({ supabase, repCode, poaRequestTypeId: t.id, fallbackUnitPrice: Number(t.base_price ?? 0) });
          return [t.id, resolved.unit] as const;
        }),
      );
      setResolvedTypePriceById(new Map(entries));
    });
  }, [supabase, types, userId]);

  const refresh = useCallback(() => {
    Promise.resolve().then(async () => {
      if (!userId) return;
      setLoading(true);
      setError(null);

      const from = pagination.pageIndex * pagination.pageSize;
      const to = from + pagination.pageSize - 1;

      const { data: myRep, error: myRepErr } = await supabase
        .from("company_representatives")
        .select("rep_code")
        .eq("profile_id", userId)
        .maybeSingle();
      if (myRepErr) {
        setError(myRepErr.message);
        setLoading(false);
        return;
      }
      const myRepCode = String((myRep as any)?.rep_code ?? "").trim();
      if (!myRepCode) {
        setError("ไม่พบ rep_code ของตัวแทน (กรุณาให้แอดมินผูกตัวแทนกับผู้ใช้)");
        setLoading(false);
        return;
      }
      const isLead = myRepCode.endsWith("-00");
      const teamPrefix = myRepCode.slice(0, 3);

      const poaRes = await (() => {
        let q = supabase
          .from("poa_requests")
          .select(
            "id,display_id,import_temp_id,poa_request_type_id,representative_profile_id,representative_rep_code,representative_name,employer_name,employer_tax_id,employer_tel,employer_type,employer_address,worker_count,worker_male,worker_female,worker_nation,worker_type,unit_price,total_price,status,created_at,poa_request_items(id,poa_request_type_id,unit_price_per_worker,worker_count,total_price,payment_status,poa_request_types(id,name,base_price))",
          )
          .order("created_at", { ascending: false })
          .range(from, to);
        if (isLead) {
          q = q.like("representative_rep_code", `${teamPrefix}-%`);
        } else {
          q = q.eq("representative_rep_code", myRepCode);
        }
        return q;
      })();

      const firstError = poaRes.error;
      if (firstError) {
        setError(firstError.message);
        setRows([]);
        setLoading(false);
        return;
      }

      setRows((((poaRes.data ?? []) as unknown) as PoaRow[]) ?? []);
      setLoading(false);

      Promise.resolve().then(async () => {
        let q = supabase.from("poa_requests").select("id", { count: "estimated", head: true });
        if (isLead) {
          q = q.like("representative_rep_code", `${teamPrefix}-%`);
        } else {
          q = q.eq("representative_rep_code", myRepCode);
        }
        const countRes = await q;
        if (!countRes.error) setTotalCount(countRes.count ?? 0);
      });
    });
  }, [pagination.pageIndex, pagination.pageSize, supabase, userId]);

  const refreshTypes = useCallback(() => {
    Promise.resolve().then(async () => {
      const { data, error: e } = await supabase
        .from("poa_request_types")
        .select("id,name,base_price,is_active")
        .order("created_at", { ascending: false });
      if (e) return;
      setTypes(((data ?? []) as TypeOption[]) ?? []);
    });
  }, [supabase]);

  React.useEffect(() => {
    setPagination((p) => (p.pageIndex === 0 ? p : { ...p, pageIndex: 0 }));
  }, [pagination.pageSize]);

  React.useEffect(() => {
    setPagination((p) => ({ ...p, pageIndex: 0 }));
  }, [search]);

  const displayRows = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter((r) => {
      const typeName = r.poa_request_items?.[0]?.poa_request_types?.name ?? "";
      const hay = [r.display_id, r.import_temp_id, r.employer_name, typeName, r.status]
        .map((x) => String(x ?? "").toLowerCase())
        .join(" ");
      return hay.includes(q);
    });
  }, [rows, search]);

  const table = useReactTable({
    data: displayRows,
    columns: useMemo(() => [{ accessorKey: "id" }], []),
    state: { pagination },
    onPaginationChange: setPagination,
    manualPagination: true,
    pageCount: Math.max(1, Math.ceil(Math.max(0, totalCount) / Math.max(1, pagination.pageSize))),
    getCoreRowModel: getCoreRowModel(),
  });

  React.useEffect(() => {
    refresh();
  }, [refresh]);

  React.useEffect(() => {
    refreshTypes();
  }, [refreshTypes]);

  if (!canUsePage) {
    return (
      <div>
        <Title as="h1" className="text-lg font-semibold text-gray-900">
          คำขอ POA
        </Title>
        <div className="mt-3 rounded-xl border border-gray-200 bg-white p-4 text-sm text-gray-700">
          หน้านี้สำหรับตัวแทนเท่านั้น
          <div className="mt-2">
            <Link className="text-blue-600 hover:underline" href="/poa-requests">
              ไปหน้าจัดการคำขอ
            </Link>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div ref={topRef}>
      <CreateRequestModal
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        supabase={supabase}
        userId={userId}
        types={types}
        resolvedTypePriceById={resolvedTypePriceById}
        onCreated={() => refresh()}
      />

      <RequestDetailModal
        open={detailOpen}
        onClose={() => {
          setDetailOpen(false);
          setDetailId(null);
        }}
        supabase={supabase}
        userId={userId}
        requestId={detailId}
        types={types}
        onChanged={() => refresh()}
      />

      <div className="flex flex-col justify-between gap-3 md:flex-row md:items-end">
        <div>
          <Title as="h1" className="text-lg font-semibold text-gray-900">
            คำขอ POA
          </Title>
          <Text className="mt-1 text-sm text-gray-600">รายการคำขอของคุณเท่านั้น</Text>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <TableSearch value={search} onChange={setSearch} disabled={loading} />
          <Button
            variant="outline"
            onClick={() => {
              setCreateOpen(true);
            }}
            disabled={loading}
          >
            ส่งคำขอใหม่
          </Button>
        </div>
      </div>

      {error ? <div className="mt-4 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">{error}</div> : null}

      <div className="mt-4 overflow-hidden rounded-xl border border-gray-200 bg-white">
        <div className="grid grid-cols-[1.2fr_0.7fr_0.35fr_0.45fr_0.6fr] gap-3 border-b border-gray-200 bg-gray-50 px-4 py-2 text-xs font-semibold text-gray-600">
          <div>นายจ้าง</div>
          <div>หนังสือมอบอำนาจ</div>
          <div className="text-center">จำนวน</div>
          <div className="text-center">ยอดรวม</div>
          <div className="text-center">สถานะ</div>
        </div>
        {displayRows.length === 0 ? (
          <div className="px-4 py-8 text-sm text-gray-500">{loading ? "กำลังโหลด..." : "ยังไม่มีข้อมูล"}</div>
        ) : (
          displayRows.map((r) => (
            <div
              key={r.id}
              role="button"
              tabIndex={0}
              className="grid grid-cols-[1.2fr_0.7fr_0.35fr_0.45fr_0.6fr] gap-3 border-b border-gray-100 px-4 py-3 last:border-b-0 cursor-pointer transition-colors hover:bg-gray-100 active:bg-gray-200"
              onClick={() => {
                setDetailId(r.id);
                setDetailOpen(true);
              }}
              onKeyDown={(e) => {
                if (e.key !== "Enter") return;
                setDetailId(r.id);
                setDetailOpen(true);
              }}
            >
              <div>
                <div className="text-sm font-medium text-gray-900">{r.employer_name ?? "-"}</div>
                <div className="mt-0.5 text-xs text-gray-500">{r.display_id ?? r.import_temp_id ?? r.id}</div>
              </div>
              <div className="min-w-0">
                {(() => {
                  const fromItem = r.poa_request_items?.[0]?.poa_request_types ?? null;
                  const fromRequest = r.poa_request_type_id ? (typeById.get(r.poa_request_type_id) ?? null) : null;
                  const name = fromItem?.name ?? fromRequest?.name ?? "-";
                  const price = Number(r.poa_request_items?.[0]?.unit_price_per_worker ?? fromItem?.base_price ?? fromRequest?.base_price ?? 0);
                  return (
                    <>
                      <div className="truncate text-sm font-medium text-gray-900">{name}</div>
                      <div className="mt-0.5 truncate text-xs text-gray-500">ราคา/คน: {price.toLocaleString()}</div>
                    </>
                  );
                })()}
              </div>
              <div className="flex items-center justify-center text-sm text-gray-900 tabular-nums">
                {Number(r.worker_count ?? 0).toLocaleString()}
              </div>
              <div className="flex items-center justify-center text-sm text-gray-900 tabular-nums">{sumTotal(r.poa_request_items).toLocaleString()}</div>
              <div className="flex items-center justify-center gap-2">
                <div className="text-sm text-gray-700">{statusLabel(r.status)}</div>
              </div>
            </div>
          ))
        )}
        <TablePagination table={table} />
      </div>
    </div>
  );
}
