"use client";

import React, { useCallback, useMemo, useRef, useState } from "react";
import { Button } from "rizzui";
import { Title, Text } from "rizzui/typography";
import TablePagination from "@core/components/table/pagination";
import { getCoreRowModel, getPaginationRowModel, useReactTable } from "@tanstack/react-table";

import { useAuth } from "@/app/shared/auth-provider";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import { Modal } from "@core/modal-views/modal";
import AppSelect from "@core/ui/app-select";
import { customerNameFromRel, dateTH, durationLabel, serviceGroupLabel, statusBadgeClass, statusLabel, type ServiceJobRow } from "./_utils";

function firstRel<T>(rel: T | T[] | null | undefined): T | null {
  if (!rel) return null;
  if (Array.isArray(rel)) return (rel[0] ?? null) as any;
  return rel as any;
}

type SummaryRow = { group_key: string; status_key: string; job_count: number };

export default function ServiceJobsPage() {
  const { role, userId } = useAuth();
  const supabase = useMemo(() => createSupabaseBrowserClient(), []);
  const topRef = useRef<HTMLDivElement | null>(null);

  const canUsePage = role === "admin" || role === "sale" || role === "operation";

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [rows, setRows] = useState<ServiceJobRow[]>([]);
  const [totalCount, setTotalCount] = useState(0);
  const [workerCountByItemId, setWorkerCountByItemId] = useState<Record<string, number>>({});

  const [summaryByGroup, setSummaryByGroup] = useState<{ mou: number; general: number }>({ mou: 0, general: 0 });
  const [summaryByStatus, setSummaryByStatus] = useState<{ not_started: number; in_progress: number; done: number }>({
    not_started: 0,
    in_progress: 0,
    done: 0,
  });

  const [groupFilter, setGroupFilter] = useState<"mou" | "general" | null>(null);
  const [statusFilter, setStatusFilter] = useState<"not_started" | "in_progress" | "done" | null>(null);
  const [search, setSearch] = useState("");

  const [detailOpen, setDetailOpen] = useState(false);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailRow, setDetailRow] = useState<ServiceJobRow | null>(null);
  const [detailStatus, setDetailStatus] = useState<"not_started" | "in_progress" | "done">("not_started");
  const [detailNote, setDetailNote] = useState("");
  const [detailWorkers, setDetailWorkers] = useState<{ id: string; full_name: string; passport_no: string | null; wp_number: string | null }[]>([]);
  const statusOptions = useMemo(
    () => [
      { value: "not_started", label: "ยังไม่เริ่ม" },
      { value: "in_progress", label: "กำลังดำเนินการ" },
      { value: "done", label: "เสร็จสิ้น" },
    ],
    [],
  );

  const [pagination, setPagination] = useState({ pageIndex: 0, pageSize: 10 });

  const loadSummary = useCallback(() => {
    Promise.resolve().then(async () => {
      if (!canUsePage) return;
      try {
        const { data, error: e } = await supabase.rpc("service_jobs_summary");
        if (e) return;
        const list = (data ?? []) as SummaryRow[];

        let mou = 0;
        let general = 0;
        let ns = 0;
        let ip = 0;
        let done = 0;

        for (const r of list) {
          const g = String((r as any).group_key ?? "");
          const s = String((r as any).status_key ?? "");
          const c = Number((r as any).job_count ?? 0);
          if (g === "mou") mou += c;
          else general += c;
          if (s === "not_started") ns += c;
          else if (s === "in_progress") ip += c;
          else if (s === "done") done += c;
        }

        setSummaryByGroup({ mou, general });
        setSummaryByStatus({ not_started: ns, in_progress: ip, done });
      } catch {
        return;
      }
    });
  }, [canUsePage, supabase]);

  const openDetail = useCallback(
    async (r: ServiceJobRow) => {
      setError(null);
      setDetailRow(r);
      setDetailStatus((String((r as any).ops_status ?? "not_started") as any) || "not_started");
      setDetailNote(String((r as any).ops_note ?? ""));
      setDetailWorkers([]);
      setDetailOpen(true);
      setDetailLoading(true);
      try {
        const itemId = String((r as any).id ?? "").trim();
        if (!itemId) {
          setDetailLoading(false);
          return;
        }
        const linkRes = await supabase.from("order_item_workers").select("worker_id").eq("order_item_id", itemId).limit(5000);
        if (linkRes.error) throw linkRes.error;
        const workerIds = ((linkRes.data ?? []) as any[]).map((x) => String(x.worker_id ?? "").trim()).filter(Boolean);
        if (!workerIds.length) {
          setDetailWorkers([]);
          setDetailLoading(false);
          return;
        }
        const wRes = await supabase.from("workers").select("id,full_name,passport_no,wp_number").in("id", workerIds).limit(5000);
        if (wRes.error) throw wRes.error;
        setDetailWorkers((((wRes.data ?? []) as any[]) ?? []).map((x) => ({
          id: String(x.id),
          full_name: String(x.full_name ?? "-"),
          passport_no: x.passport_no ? String(x.passport_no) : null,
          wp_number: x.wp_number ? String(x.wp_number) : null,
        })));
      } catch (e: any) {
        setError(e?.message ?? "โหลดรายการแรงงานไม่สำเร็จ");
        setDetailWorkers([]);
      }
      setDetailLoading(false);
    },
    [supabase]
  );

  const saveDetail = useCallback(async () => {
    if (!detailRow?.id) return;
    if (!userId) {
      setError("ไม่พบผู้ใช้งาน");
      return;
    }
    setDetailLoading(true);
    setError(null);
    const now = new Date().toISOString();
    const currentStatus = String((detailRow as any).ops_status ?? "not_started");
    const nextStatus = detailStatus;
    const patch: any = {
      ops_status: nextStatus,
      ops_note: detailNote.trim() || null,
      ops_updated_at: now,
      ops_updated_by_profile_id: userId,
    };
    const startedAt = (detailRow as any).ops_started_at ? String((detailRow as any).ops_started_at) : null;
    const completedAt = (detailRow as any).ops_completed_at ? String((detailRow as any).ops_completed_at) : null;
    if (nextStatus === "in_progress") {
      if (!startedAt) patch.ops_started_at = now;
      patch.ops_completed_at = null;
    }
    if (nextStatus === "done") {
      if (!startedAt) patch.ops_started_at = now;
      patch.ops_completed_at = now;
    }
    if (nextStatus === "not_started") {
      patch.ops_started_at = null;
      patch.ops_completed_at = null;
    }

    const updRes = await supabase.from("order_items").update(patch).eq("id", detailRow.id);
    if (updRes.error) {
      setError(updRes.error.message);
      setDetailLoading(false);
      return;
    }

    setRows((prev) =>
      prev.map((x) =>
        x.id === detailRow.id
          ? ({
              ...x,
              ops_status: nextStatus,
              ops_note: patch.ops_note,
              ops_started_at: patch.ops_started_at ?? startedAt,
              ops_completed_at: patch.ops_completed_at ?? completedAt,
            } as any)
          : x,
      ),
    );
    setDetailOpen(false);
    setDetailRow(null);
    setDetailWorkers([]);
    setDetailLoading(false);
    loadSummary();
  }, [detailNote, detailRow, detailStatus, loadSummary, supabase, userId]);

  const refresh = useCallback(() => {
    Promise.resolve().then(async () => {
      if (!canUsePage) return;
      setLoading(true);
      setError(null);

      try {
        const from = pagination.pageIndex * pagination.pageSize;
        const to = from + pagination.pageSize - 1;

        const baseSelect =
          "id,order_id,created_at,ops_status,ops_started_at,ops_completed_at,ops_note,orders(display_id,customers(name)),services!inner(name,service_group_code)";

        const q = search.trim();
        const qValue = q.replaceAll(",", " ").replaceAll("%", "");
        const pat = qValue ? `%${qValue}%` : "";

        let query: any = supabase
          .from("order_items")
          .select(baseSelect, { count: "estimated" })
          .order("created_at", { ascending: false })
          .range(from, to);
        if (statusFilter) query = query.eq("ops_status", statusFilter);
        if (groupFilter === "mou") query = query.eq("services.service_group_code", "mou");
        if (groupFilter === "general") query = query.neq("services.service_group_code", "mou");
        if (qValue) {
          const orFilter = `services.name.ilike.${pat},orders.display_id.ilike.${pat},orders.customers.name.ilike.${pat},ops_note.ilike.${pat}`;
          query = query.or(orFilter);
        }
        let res: any = await query;

        if (res.error && String(res.error.message ?? "").includes("ops_note")) {
          const fallbackSelect =
            "id,order_id,created_at,ops_status,ops_started_at,ops_completed_at,orders(display_id,customers(name)),services!inner(name,service_group_code)";
          let q2: any = supabase
            .from("order_items")
            .select(fallbackSelect, { count: "estimated" })
            .order("created_at", { ascending: false })
            .range(from, to);
          if (statusFilter) q2 = q2.eq("ops_status", statusFilter);
          if (groupFilter === "mou") q2 = q2.eq("services.service_group_code", "mou");
          if (groupFilter === "general") q2 = q2.neq("services.service_group_code", "mou");
          if (qValue) {
            const orFilter = `services.name.ilike.${pat},orders.display_id.ilike.${pat},orders.customers.name.ilike.${pat}`;
            q2 = q2.or(orFilter);
          }
          res = await q2;
        }

        if (res.error) {
          setError(res.error.message);
          setRows([]);
          setTotalCount(0);
          setWorkerCountByItemId({});
          setLoading(false);
          return;
        }

        const list = ((res.data ?? []) as unknown as ServiceJobRow[]) ?? [];
        setRows(list);
        setTotalCount(Number(res.count ?? 0));

        const itemIds = list.map((x) => String(x.id ?? "")).filter(Boolean);
        if (!itemIds.length) {
          setWorkerCountByItemId({});
          setLoading(false);
          return;
        }

        const linkRes = await supabase.from("order_item_workers").select("order_item_id").in("order_item_id", itemIds).limit(5000);
        if (linkRes.error) {
          setWorkerCountByItemId({});
          setLoading(false);
          return;
        }

        const counts: Record<string, number> = {};
        for (const r of (linkRes.data ?? []) as any[]) {
          const oid = String(r.order_item_id ?? "");
          if (!oid) continue;
          counts[oid] = (counts[oid] ?? 0) + 1;
        }
        setWorkerCountByItemId(counts);
        setLoading(false);
      } catch (e: any) {
        setError(e?.message ?? "โหลดข้อมูลไม่สำเร็จ");
        setRows([]);
        setTotalCount(0);
        setWorkerCountByItemId({});
        setLoading(false);
      }
    });
  }, [canUsePage, groupFilter, pagination.pageIndex, pagination.pageSize, search, statusFilter, supabase]);

  React.useEffect(() => {
    setPagination((p) => ({ ...p, pageIndex: 0 }));
  }, [groupFilter, search, statusFilter]);

  React.useEffect(() => {
    loadSummary();
  }, [loadSummary]);

  React.useEffect(() => {
    refresh();
  }, [refresh]);

  const table = useReactTable({
    data: rows,
    columns: useMemo(() => [{ accessorKey: "id" }], []),
    state: { pagination },
    onPaginationChange: setPagination,
    manualPagination: true,
    pageCount: Math.max(1, Math.ceil(Math.max(0, totalCount) / Math.max(1, pagination.pageSize))),
    getCoreRowModel: getCoreRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
  });

  if (!canUsePage) {
    return (
      <div>
        <Title as="h1" className="text-lg font-semibold text-gray-900">
          รายการงานบริการ
        </Title>
        <div className="mt-3 rounded-xl border border-gray-200 bg-white p-4 text-sm text-gray-700">หน้านี้สำหรับทีมงานเท่านั้น</div>
      </div>
    );
  }

  const totalJobs = summaryByGroup.mou + summaryByGroup.general;

  return (
    <div ref={topRef}>
      <div className="flex flex-col justify-between gap-3 md:flex-row md:items-end">
        <div>
          <Title as="h1" className="text-lg font-semibold text-gray-900">
            รายการงานบริการ
          </Title>
          <Text className="mt-1 text-sm text-gray-600">งานบริการทั้งหมดข้ามทุกออเดอร์ พร้อมสรุปตามกลุ่มและสถานะ</Text>
        </div>
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <div className="rounded-xl border border-gray-200 bg-white p-4">
          <div className="text-sm font-semibold text-gray-900">สรุปตามกลุ่มงาน</div>
          <div className="mt-3 grid gap-2 text-sm">
            <button
              type="button"
              className={`flex items-center justify-between rounded-lg px-2 py-1.5 text-left hover:bg-gray-50 ${
                groupFilter === "mou" ? "border border-gray-200 bg-gray-50" : "border border-transparent"
              }`}
              onClick={() => setGroupFilter((prev) => (prev === "mou" ? null : "mou"))}
            >
              <div className="text-gray-600">MOU</div>
              <div className="font-semibold text-gray-900 tabular-nums">{summaryByGroup.mou.toLocaleString()}</div>
            </button>
            <button
              type="button"
              className={`flex items-center justify-between rounded-lg px-2 py-1.5 text-left hover:bg-gray-50 ${
                groupFilter === "general" ? "border border-gray-200 bg-gray-50" : "border border-transparent"
              }`}
              onClick={() => setGroupFilter((prev) => (prev === "general" ? null : "general"))}
            >
              <div className="text-gray-600">General</div>
              <div className="font-semibold text-gray-900 tabular-nums">{summaryByGroup.general.toLocaleString()}</div>
            </button>
            <div className="mt-1 flex items-center justify-between border-t border-gray-100 pt-2">
              <div className="text-gray-600">รวม</div>
              <div className="font-semibold text-gray-900 tabular-nums">{totalJobs.toLocaleString()}</div>
            </div>
            {groupFilter ? (
              <div className="pt-1">
                <button type="button" className="text-xs font-semibold text-gray-600 hover:underline" onClick={() => setGroupFilter(null)}>
                  ล้างตัวกรองกลุ่มงาน
                </button>
              </div>
            ) : null}
          </div>
        </div>

        <div className="rounded-xl border border-gray-200 bg-white p-4">
          <div className="text-sm font-semibold text-gray-900">สรุปตามสถานะ</div>
          <div className="mt-3 grid gap-2 text-sm">
            <button
              type="button"
              className={`flex items-center justify-between rounded-lg px-2 py-1.5 text-left hover:bg-gray-50 ${
                statusFilter === "not_started" ? "border border-gray-200 bg-gray-50" : "border border-transparent"
              }`}
              onClick={() => setStatusFilter((prev) => (prev === "not_started" ? null : "not_started"))}
            >
              <div className="text-gray-600">ยังไม่เริ่ม</div>
              <div className="font-semibold text-gray-900 tabular-nums">{summaryByStatus.not_started.toLocaleString()}</div>
            </button>
            <button
              type="button"
              className={`flex items-center justify-between rounded-lg px-2 py-1.5 text-left hover:bg-gray-50 ${
                statusFilter === "in_progress" ? "border border-gray-200 bg-gray-50" : "border border-transparent"
              }`}
              onClick={() => setStatusFilter((prev) => (prev === "in_progress" ? null : "in_progress"))}
            >
              <div className="text-gray-600">กำลังดำเนินการ</div>
              <div className="font-semibold text-gray-900 tabular-nums">{summaryByStatus.in_progress.toLocaleString()}</div>
            </button>
            <button
              type="button"
              className={`flex items-center justify-between rounded-lg px-2 py-1.5 text-left hover:bg-gray-50 ${
                statusFilter === "done" ? "border border-gray-200 bg-gray-50" : "border border-transparent"
              }`}
              onClick={() => setStatusFilter((prev) => (prev === "done" ? null : "done"))}
            >
              <div className="text-gray-600">เสร็จสิ้น</div>
              <div className="font-semibold text-gray-900 tabular-nums">{summaryByStatus.done.toLocaleString()}</div>
            </button>
            {statusFilter ? (
              <div className="pt-1">
                <button type="button" className="text-xs font-semibold text-gray-600 hover:underline" onClick={() => setStatusFilter(null)}>
                  ล้างตัวกรองสถานะ
                </button>
              </div>
            ) : null}
          </div>
        </div>
      </div>

      {error ? <div className="mt-4 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">{error}</div> : null}

      <div className="mt-4 overflow-hidden rounded-xl border border-gray-200 bg-white">
        <div className="flex flex-col gap-2 border-b border-gray-200 bg-white px-4 py-3 md:flex-row md:items-center md:justify-between">
          <div className="text-sm font-semibold text-gray-900">รายการงานบริการ</div>
          <div className="flex w-full flex-col gap-2 md:w-auto md:flex-row md:items-center">
            <input
              className="h-9 w-full rounded-md border border-gray-200 bg-white px-3 text-sm md:w-[320px]"
              placeholder="ค้นหาชื่องาน/เลขออเดอร์/ลูกค้า/หมายเหตุ"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
        </div>
        <div className="overflow-x-auto">
          <div className="min-w-[1100px] overflow-hidden rounded-xl">
            <div className="grid grid-cols-[1.25fr_1fr_0.55fr_0.55fr_1.1fr_0.95fr] gap-3 border-b border-gray-200 bg-gray-50 px-4 py-2 text-xs font-semibold text-gray-600">
              <div>ชื่องาน</div>
              <div>ลูกค้า</div>
              <div className="text-center">กลุ่มงาน</div>
              <div className="text-center">แรงงาน</div>
              <div>สถานะ/หมายเหตุ</div>
              <div>ระยะเวลา/วันเริ่ม</div>
            </div>

            {rows.length === 0 ? (
              <div className="px-4 py-8 text-sm text-gray-500">
                {loading ? "กำลังโหลด..." : "ไม่พบข้อมูล"}
                {groupFilter ? <div className="mt-1 text-xs text-gray-400">ตัวกรองกลุ่มงาน: {groupFilter === "mou" ? "MOU" : "General"}</div> : null}
                {statusFilter ? <div className="mt-1 text-xs text-gray-400">ตัวกรองสถานะ: {statusLabel(statusFilter)}</div> : null}
                {search.trim() ? <div className="mt-1 text-xs text-gray-400">ค้นหา: {search.trim()}</div> : null}
              </div>
            ) : (
              table.getRowModel().rows.map((row) => {
                const r = row.original as ServiceJobRow;
                const orderRel = firstRel(r.orders as any);
                const serviceRel = firstRel(r.services as any);
                const serviceName = String(serviceRel?.name ?? "-") || "-";
                const orderNo = String(orderRel?.display_id ?? "-") || "-";
                const customerName = customerNameFromRel((orderRel as any)?.customers ?? null);
                const group = serviceGroupLabel((serviceRel as any)?.service_group_code ?? null);
                const workerCount = workerCountByItemId[r.id] ?? 0;
                const note = String((r as any)?.ops_note ?? "").trim();

                return (
                  <div
                    key={r.id}
                    role="button"
                    tabIndex={0}
                    className="grid cursor-pointer grid-cols-[1.25fr_1fr_0.55fr_0.55fr_1.1fr_0.95fr] items-start gap-3 border-b border-gray-100 px-4 py-3 outline-none hover:bg-gray-50 last:border-b-0 focus:bg-gray-50"
                    onClick={() => openDetail(r)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" || e.key === " ") openDetail(r);
                    }}
                  >
                    <div>
                      <div className="text-sm font-medium text-gray-900">{serviceName}</div>
                      <div className="mt-0.5 text-xs text-gray-500">ออเดอร์ {orderNo}</div>
                    </div>

                    <div className="text-sm text-gray-900">{customerName}</div>

                    <div className="text-center text-sm text-gray-700">{group}</div>

                    <div className="text-center text-sm font-medium text-gray-900 tabular-nums">{workerCount.toLocaleString()}</div>

                    <div>
                      <span
                        className={`inline-flex items-center rounded-full border px-2 py-1 text-xs font-semibold ${statusBadgeClass(
                          r.ops_status,
                        )}`}
                      >
                        {statusLabel(r.ops_status)}
                      </span>
                      <div className="mt-1 text-xs text-gray-600">{note ? note : "-"}</div>
                    </div>

                    <div>
                      <div className="text-sm font-medium text-gray-900">{durationLabel(r.ops_started_at, r.ops_completed_at)}</div>
                      <div className="mt-0.5 text-xs text-gray-600">เริ่ม {dateTH(r.ops_started_at)}</div>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>
        <TablePagination table={table} />
      </div>

      <Modal
        isOpen={detailOpen}
        onClose={() => {
          setDetailOpen(false);
          setDetailRow(null);
          setDetailWorkers([]);
          setDetailLoading(false);
          setDetailNote("");
          setDetailStatus("not_started");
        }}
      >
        <div className="rounded-xl bg-white p-5">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div>
              <div className="text-base font-semibold text-gray-900">งานบริการ</div>
              <div className="mt-1 text-sm text-gray-600">ปรับสถานะ อัปเดทหมายเหตุ และดูรายการแรงงาน</div>
            </div>
            <Button variant="outline" size="sm" onClick={() => setDetailOpen(false)} disabled={detailLoading}>
              ปิด
            </Button>
          </div>

          {detailRow ? (
            <div className="mt-3 rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-sm text-gray-700">
              <div className="font-semibold text-gray-900">{String(firstRel((detailRow as any).services as any)?.name ?? "-")}</div>
              <div className="mt-0.5 text-xs text-gray-600">ออเดอร์ {String(firstRel((detailRow as any).orders as any)?.display_id ?? "-")}</div>
              <div className="mt-0.5 text-xs text-gray-600">ลูกค้า {customerNameFromRel((firstRel((detailRow as any).orders as any) as any)?.customers ?? null)}</div>
            </div>
          ) : null}

          <div className="mt-4 grid gap-3">
            <div>
              <div className="text-sm font-medium text-gray-700">สถานะ</div>
              <div className="mt-2">
                <AppSelect
                  options={statusOptions}
                  value={detailStatus}
                  onChange={(v: string) => setDetailStatus(v as any)}
                  getOptionValue={(o) => o.value}
                  displayValue={(selected) => statusOptions.find((o) => o.value === selected)?.label ?? ""}
                  inPortal={false}
                />
              </div>
            </div>
            <div>
              <div className="text-sm font-medium text-gray-700">หมายเหตุ</div>
              <textarea
                className="mt-2 min-h-[110px] w-full rounded-md border border-gray-200 bg-white px-3 py-2 text-sm"
                value={detailNote}
                onChange={(e) => setDetailNote(e.target.value)}
                disabled={detailLoading || !detailRow}
              />
            </div>
            <div>
              <div className="text-sm font-medium text-gray-700">แรงงาน</div>
              <div className="mt-2 rounded-lg border border-gray-200 bg-white">
                {detailLoading ? (
                  <div className="px-3 py-3 text-sm text-gray-600">กำลังโหลด...</div>
                ) : detailWorkers.length === 0 ? (
                  <div className="px-3 py-3 text-sm text-gray-600">ยังไม่มีแรงงาน</div>
                ) : (
                  <div>
                    <div className="grid grid-cols-[1fr_160px_160px] gap-3 border-b border-gray-200 bg-gray-50 px-3 py-2 text-xs font-semibold text-gray-600">
                      <div>ชื่อแรงงาน</div>
                      <div>Passport</div>
                      <div>WP</div>
                    </div>
                    <div className="divide-y divide-gray-100">
                      {detailWorkers
                        .slice()
                        .sort((a, b) => a.full_name.localeCompare(b.full_name))
                        .map((w) => (
                          <div key={w.id} className="grid grid-cols-[1fr_160px_160px] gap-3 px-3 py-2 text-sm">
                            <div className="min-w-0 truncate font-medium text-gray-900">{w.full_name}</div>
                            <div className="min-w-0 truncate text-gray-700">{w.passport_no ?? "-"}</div>
                            <div className="min-w-0 truncate text-gray-700">{w.wp_number ?? "-"}</div>
                          </div>
                        ))}
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>

          <div className="mt-5 flex flex-wrap justify-end gap-2">
            {detailRow ? (
              <span
                className={`mr-auto inline-flex items-center rounded-full border px-2 py-1 text-xs font-semibold ${statusBadgeClass(
                  detailStatus,
                )}`}
              >
                {statusLabel(detailStatus)}
              </span>
            ) : null}
            <Button onClick={saveDetail} disabled={detailLoading || !detailRow}>
              บันทึก
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
