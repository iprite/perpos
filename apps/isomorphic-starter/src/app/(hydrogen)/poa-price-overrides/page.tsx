"use client";

import React, { useCallback, useMemo, useRef, useState } from "react";
import toast from "react-hot-toast";
import { Button, Input } from "rizzui";
import { Title, Text } from "rizzui/typography";
import AppSelect from "@core/ui/app-select";
import TablePagination from "@core/components/table/pagination";
import { getCoreRowModel, getPaginationRowModel, useReactTable } from "@tanstack/react-table";
import TableSearch from "@/components/table/table-search";
import { useConfirmDialog } from "@/app/shared/confirm-dialog/provider";

import { createSupabaseBrowserClient } from "@/lib/supabase/client";

type OverrideRow = {
  id: string;
  rep_code: string;
  poa_request_type_id: string;
  unit_price_per_worker: number;
  active: boolean;
  created_at: string;
  updated_at: string;
};

type TypeRow = { id: string; name: string; base_price: number; is_active: boolean };
type RepRow = { rep_code: string; prefix: string | null; first_name: string | null; last_name: string | null; status: string | null };

const activeOptions = [
  { label: "active", value: "active" },
  { label: "inactive", value: "inactive" },
];

function repDisplayName(r: RepRow | null) {
  if (!r) return "-";
  const prefix = String(r.prefix ?? "").trim();
  const first = String(r.first_name ?? "").trim();
  const last = String(r.last_name ?? "").trim();
  const full = `${prefix}${first} ${last}`.trim();
  return full || r.rep_code || "-";
}

export default function PoaPriceOverridesPage() {
  const confirmDialog = useConfirmDialog();
  const supabase = useMemo(() => createSupabaseBrowserClient(), []);
  const topRef = useRef<HTMLDivElement | null>(null);

  const [loading, setLoading] = useState(false);
  const [rows, setRows] = useState<OverrideRow[]>([]);
  const [types, setTypes] = useState<TypeRow[]>([]);
  const [reps, setReps] = useState<RepRow[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [pagination, setPagination] = useState({ pageIndex: 0, pageSize: 10 });
  const [search, setSearch] = useState("");

  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);

  const [repCode, setRepCode] = useState("");
  const [typeId, setTypeId] = useState("");
  const [unitPrice, setUnitPrice] = useState("0");
  const [isActive, setIsActive] = useState(true);

  const typeById = useMemo(() => new Map(types.map((t) => [t.id, t])), [types]);
  const repByCode = useMemo(() => new Map(reps.map((r) => [String(r.rep_code ?? "").trim(), r])), [reps]);

  const repOptions = useMemo(
    () =>
      reps
        .map((r) => ({
          value: String(r.rep_code ?? "").trim(),
          label: `${String(r.rep_code ?? "").trim()} • ${repDisplayName(r)}`,
        }))
        .filter((x) => x.value),
    [reps],
  );

  const typeOptions = useMemo(
    () =>
      types
        .filter((t) => t.is_active)
        .map((t) => ({ value: t.id, label: `${t.name} • ราคาเริ่มต้น/คน: ${Number(t.base_price ?? 0).toLocaleString()}` })),
    [types],
  );

  const resetForm = useCallback(() => {
    setEditingId(null);
    setRepCode("");
    setTypeId("");
    setUnitPrice("0");
    setIsActive(true);
  }, []);

  const refresh = useCallback(() => {
    Promise.resolve().then(async () => {
      setLoading(true);
      setError(null);
      try {
        const [ovRes, typesRes, repsRes] = await Promise.all([
          supabase
            .from("poa_request_type_rep_price_overrides")
            .select("id,rep_code,poa_request_type_id,unit_price_per_worker,active,created_at,updated_at")
            .order("updated_at", { ascending: false })
            .order("id", { ascending: false }),
          supabase.from("poa_request_types").select("id,name,base_price,is_active").order("name", { ascending: true }),
          supabase
            .from("company_representatives")
            .select("rep_code,prefix,first_name,last_name,status")
            .not("rep_code", "is", null)
            .order("rep_code", { ascending: true })
            .limit(5000),
        ]);
        const firstErr = ovRes.error ?? typesRes.error ?? repsRes.error;
        if (firstErr) {
          setError(firstErr.message);
          setRows([]);
          setTypes([]);
          setReps([]);
          setLoading(false);
          return;
        }
        setRows((ovRes.data ?? []) as OverrideRow[]);
        setTypes((typesRes.data ?? []) as TypeRow[]);
        setReps((repsRes.data ?? []) as RepRow[]);
        setLoading(false);
      } catch (e: any) {
        setError(e?.message ?? "โหลดข้อมูลไม่สำเร็จ");
        setRows([]);
        setTypes([]);
        setReps([]);
        setLoading(false);
      }
    });
  }, [supabase]);

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
      const t = typeById.get(r.poa_request_type_id);
      const rep = repByCode.get(String(r.rep_code ?? "").trim()) ?? null;
      const hay = [r.rep_code, repDisplayName(rep), t?.name, r.unit_price_per_worker, r.active ? "active" : "inactive"]
        .map((x) => String(x ?? "").toLowerCase())
        .join(" ");
      return hay.includes(q);
    });
  }, [repByCode, rows, search, typeById]);

  const table = useReactTable({
    data: filteredRows,
    columns: useMemo(() => [{ accessorKey: "id" }], []),
    state: { pagination },
    onPaginationChange: setPagination,
    getCoreRowModel: getCoreRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
  });

  return (
    <div ref={topRef}>
      <div className="flex flex-col justify-between gap-3 md:flex-row md:items-end">
        <div>
          <Title as="h1" className="text-lg font-semibold text-gray-900">
            หนังสือมอบอำนาจ
          </Title>
          <Text className="mt-1 text-sm text-gray-600">ตั้งค่าราคาพิเศษรายตัวแทน (เช่น MOU 500 แทน 1,000)</Text>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <TableSearch value={search} onChange={setSearch} disabled={loading} />
          <Button
            variant="outline"
            onClick={() => {
              resetForm();
              setShowForm(true);
              topRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
            }}
            disabled={loading}
          >
            เพิ่มราคาพิเศษ
          </Button>
        </div>
      </div>

      {showForm ? (
        <div className="mt-5 grid gap-3 rounded-xl border border-gray-200 bg-white p-4">
          <div className="text-sm font-semibold text-gray-900">{editingId ? "แก้ไขราคาพิเศษ" : "เพิ่มราคาพิเศษ"}</div>
          <div className="grid gap-3 md:grid-cols-2">
            <AppSelect
              label="ตัวแทน"
              placeholder="เลือก"
              options={repOptions}
              value={repCode}
              onChange={(v: string) => setRepCode(v)}
              getOptionValue={(o) => o.value}
              displayValue={(selected) => repOptions.find((o) => o.value === selected)?.label ?? ""}
              disabled={loading}
              selectClassName="h-10 px-3"
            />
            <AppSelect
              label="หนังสือมอบอำนาจ"
              placeholder="เลือก"
              options={typeOptions}
              value={typeId}
              onChange={(v: string) => setTypeId(v)}
              getOptionValue={(o) => o.value}
              displayValue={(selected) => typeOptions.find((o) => o.value === selected)?.label ?? ""}
              disabled={loading}
              selectClassName="h-10 px-3"
            />
            <Input label="ราคาพิเศษ/คน" value={unitPrice} onChange={(e) => setUnitPrice(e.target.value)} inputMode="decimal" />
            <div>
              <AppSelect
                label="สถานะ"
                placeholder="เลือก"
                options={activeOptions}
                value={isActive ? "active" : "inactive"}
                onChange={(v: string) => setIsActive(v === "active")}
                getOptionValue={(o) => o.value}
                displayValue={(selected) => activeOptions.find((o) => o.value === selected)?.label ?? ""}
                disabled={loading}
                selectClassName="h-10 px-3"
              />
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button
              onClick={async () => {
                setLoading(true);
                setError(null);
                try {
                  const rep = repCode.trim();
                  const t = typeId.trim();
                  if (!rep || !t) throw new Error("กรุณาเลือกตัวแทนและประเภทหนังสือมอบอำนาจ");
                  const unit = Number(unitPrice || 0);
                  if (!Number.isFinite(unit) || unit < 0) throw new Error("ราคาพิเศษไม่ถูกต้อง");

                  const payload: any = {
                    rep_code: rep,
                    poa_request_type_id: t,
                    unit_price_per_worker: unit,
                    active: isActive,
                    updated_at: new Date().toISOString(),
                  };

                  const { error: e } = await supabase
                    .from("poa_request_type_rep_price_overrides")
                    .upsert([editingId ? { ...payload, id: editingId } : payload], { onConflict: "rep_code,poa_request_type_id" });
                  if (e) throw new Error(e.message);

                  toast.success(editingId ? "อัปเดตแล้ว" : "บันทึกแล้ว");
                  resetForm();
                  setShowForm(false);
                  setLoading(false);
                  refresh();
                } catch (err: any) {
                  setError(err?.message ?? "บันทึกไม่สำเร็จ");
                  setLoading(false);
                }
              }}
              disabled={loading || repCode.trim().length === 0 || typeId.trim().length === 0}
            >
              {editingId ? "อัปเดต" : "บันทึก"}
            </Button>
            <Button
              variant="outline"
              onClick={async () => {
                if (!editingId) return;
                const ok = await confirmDialog({ title: "ยืนยันการลบ", message: "ต้องการลบราคาพิเศษนี้หรือไม่?", confirmText: "ลบ", tone: "danger" });
                if (!ok) return;
                setLoading(true);
                setError(null);
                const { error: e } = await supabase.from("poa_request_type_rep_price_overrides").delete().eq("id", editingId);
                if (e) {
                  setError(e.message);
                  setLoading(false);
                  return;
                }
                toast.success("ลบแล้ว");
                resetForm();
                setShowForm(false);
                setLoading(false);
                refresh();
              }}
              disabled={loading || !editingId}
            >
              ลบ
            </Button>
            <Button
              variant="outline"
              onClick={() => {
                resetForm();
                setShowForm(false);
              }}
              disabled={loading}
            >
              ยกเลิก
            </Button>
          </div>
        </div>
      ) : null}

      {error ? <div className="mt-4 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">{error}</div> : null}

      <div className="mt-4 overflow-hidden rounded-xl border border-gray-200 bg-white">
        <div className="grid grid-cols-[0.9fr_1.2fr_0.6fr_0.4fr] gap-3 border-b border-gray-200 bg-gray-50 px-4 py-2 text-xs font-semibold text-gray-600">
          <div>ตัวแทน</div>
          <div>หนังสือมอบอำนาจ</div>
          <div className="text-right">ราคาพิเศษ/คน</div>
          <div className="text-center">สถานะ</div>
        </div>
        {table.getRowModel().rows.length === 0 ? (
          <div className="px-4 py-8 text-sm text-gray-500">{loading ? "กำลังโหลด..." : "ยังไม่มีข้อมูล"}</div>
        ) : (
          table.getRowModel().rows.map((r) => {
            const row = r.original as OverrideRow;
            const type = typeById.get(row.poa_request_type_id) ?? null;
            const rep = repByCode.get(String(row.rep_code ?? "").trim()) ?? null;
            return (
              <div
                key={row.id}
                role="button"
                tabIndex={0}
                className="grid grid-cols-[0.9fr_1.2fr_0.6fr_0.4fr] gap-3 border-b border-gray-100 px-4 py-3 last:border-b-0 cursor-pointer transition-colors hover:bg-gray-100 active:bg-gray-200"
                onClick={() => {
                  setEditingId(row.id);
                  setRepCode(String(row.rep_code ?? ""));
                  setTypeId(String(row.poa_request_type_id ?? ""));
                  setUnitPrice(String(row.unit_price_per_worker ?? 0));
                  setIsActive(!!row.active);
                  setShowForm(true);
                  topRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
                }}
                onKeyDown={(e) => {
                  if (e.key !== "Enter") return;
                  setEditingId(row.id);
                  setRepCode(String(row.rep_code ?? ""));
                  setTypeId(String(row.poa_request_type_id ?? ""));
                  setUnitPrice(String(row.unit_price_per_worker ?? 0));
                  setIsActive(!!row.active);
                  setShowForm(true);
                  topRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
                }}
              >
                <div className="min-w-0">
                  <div className="truncate text-sm font-medium text-gray-900">{row.rep_code}</div>
                  <div className="mt-0.5 truncate text-xs text-gray-500">{repDisplayName(rep)}</div>
                </div>
                <div className="min-w-0">
                  <div className="truncate text-sm font-medium text-gray-900">{type?.name ?? "-"}</div>
                  <div className="mt-0.5 truncate text-xs text-gray-500">ราคาเริ่มต้น/คน: {Number(type?.base_price ?? 0).toLocaleString()}</div>
                </div>
                <div className="text-right text-sm text-gray-900">{Number(row.unit_price_per_worker ?? 0).toLocaleString()}</div>
                <div className="text-center text-sm text-gray-700">{row.active ? "active" : "inactive"}</div>
              </div>
            );
          })
        )}
        <TablePagination table={table} />
      </div>
    </div>
  );
}

