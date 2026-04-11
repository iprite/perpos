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

type TypeRow = {
  id: string;
  name: string;
  base_price: number;
  is_active: boolean;
  created_at: string;
};

const activeOptions = [
  { label: "active", value: "active" },
  { label: "inactive", value: "inactive" },
];

export default function PoaRequestTypesPage() {
  const confirmDialog = useConfirmDialog();
  const supabase = useMemo(() => createSupabaseBrowserClient(), []);
  const topRef = useRef<HTMLDivElement | null>(null);

  const [loading, setLoading] = useState(false);
  const [rows, setRows] = useState<TypeRow[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [pagination, setPagination] = useState({ pageIndex: 0, pageSize: 10 });
  const [search, setSearch] = useState("");

  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);

  const [name, setName] = useState("");
  const [basePrice, setBasePrice] = useState("0");
  const [isActive, setIsActive] = useState(true);

  const resetForm = useCallback(() => {
    setEditingId(null);
    setName("");
    setBasePrice("0");
    setIsActive(true);
  }, []);

  const refresh = useCallback(() => {
    Promise.resolve().then(async () => {
      setLoading(true);
      setError(null);
      const { data, error: e } = await supabase
        .from("poa_request_types")
        .select("id,name,base_price,is_active,created_at")
        .order("created_at", { ascending: false });
      if (e) {
        setError(e.message);
        setRows([]);
        setLoading(false);
        return;
      }
      setRows((data ?? []) as TypeRow[]);
      setLoading(false);
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
      const hay = [r.name, r.base_price, r.is_active ? "active" : "inactive"]
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

  return (
    <div ref={topRef}>
      <div className="flex flex-col justify-between gap-3 md:flex-row md:items-end">
        <div>
          <Title as="h1" className="text-lg font-semibold text-gray-900">
            หนังสือมอบอำนาจ
          </Title>
          <Text className="mt-1 text-sm text-gray-600">กำหนดรายการหนังสือมอบอำนาจและราคา</Text>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <TableSearch value={search} onChange={setSearch} disabled={loading} />
          <Button
            variant="outline"
            onClick={() => {
              resetForm();
              setShowForm(true);
              topRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
              window.setTimeout(() => {
                (document.getElementById("poa-type-name") as HTMLInputElement | null)?.focus?.();
              }, 50);
            }}
            disabled={loading}
          >
            เพิ่มหนังสือมอบอำนาจ
          </Button>
        </div>
      </div>

      {showForm ? (
        <div className="mt-5 grid gap-3 rounded-xl border border-gray-200 bg-white p-4">
          <div className="text-sm font-semibold text-gray-900">{editingId ? "แก้ไขหนังสือมอบอำนาจ" : "เพิ่มหนังสือมอบอำนาจ"}</div>
          <div className="grid gap-3 md:grid-cols-2">
            <Input id="poa-type-name" label="ชื่อ" value={name} onChange={(e) => setName(e.target.value)} />
            <Input label="ราคา" value={basePrice} onChange={(e) => setBasePrice(e.target.value)} inputMode="decimal" />
            <div>
              <AppSelect
                label="สถานะ"
                placeholder="เลือก"
                options={activeOptions}
                value={isActive ? "active" : "inactive"}
                onChange={(v: string) => setIsActive(v === "active")}
                getOptionValue={(o) => o.value}
                displayValue={(selected) => activeOptions.find((o) => o.value === selected)?.label ?? ""}
                selectClassName="h-10 px-3"
              />
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button
              onClick={async () => {
                setLoading(true);
                setError(null);
                const base = Number(basePrice || 0);
                const payload = {
                  name: name.trim(),
                  base_price: Number.isFinite(base) ? base : 0,
                  is_active: isActive,
                };

                const { error: e } = editingId
                  ? await supabase.from("poa_request_types").update(payload).eq("id", editingId)
                  : await supabase.from("poa_request_types").insert(payload);

                if (e) {
                  setError(e.message);
                  setLoading(false);
                  return;
                }

                toast.success(editingId ? "อัปเดตแล้ว" : "บันทึกแล้ว");
                resetForm();
                setShowForm(false);
                setLoading(false);
                refresh();
              }}
              disabled={loading || name.trim().length === 0}
            >
              {editingId ? "อัปเดต" : "บันทึก"}
            </Button>
            <Button
              variant="outline"
              onClick={async () => {
                if (!editingId) return;
                const ok = await confirmDialog({ title: "ยืนยันการลบ", message: "ต้องการลบรายการนี้หรือไม่?", confirmText: "ลบ", tone: "danger" });
                if (!ok) return;
                setLoading(true);
                setError(null);
                const { error: e } = await supabase.from("poa_request_types").delete().eq("id", editingId);
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
        <div className="grid grid-cols-[1.2fr_0.6fr_0.5fr] gap-3 border-b border-gray-200 bg-gray-50 px-4 py-2 text-xs font-semibold text-gray-600">
          <div>รายการ</div>
          <div>ราคา</div>
          <div>สถานะ</div>
        </div>
        {rows.length === 0 ? (
          <div className="px-4 py-8 text-sm text-gray-500">{loading ? "กำลังโหลด..." : "ยังไม่มีข้อมูล"}</div>
        ) : (
          table.getRowModel().rows.map((row) => {
            const r = row.original as TypeRow;
            return (
            <div
              key={r.id}
              role="button"
              tabIndex={0}
              className="grid cursor-pointer grid-cols-[1.2fr_0.6fr_0.5fr] gap-3 border-b border-gray-100 px-4 py-3 last:border-b-0 transition-colors hover:bg-gray-100 active:bg-gray-200"
              onClick={() => {
                setEditingId(r.id);
                setShowForm(true);
                setName(r.name ?? "");
                setBasePrice(String(r.base_price ?? 0));
                setIsActive(!!r.is_active);
                topRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
                window.setTimeout(() => {
                  (document.getElementById("poa-type-name") as HTMLInputElement | null)?.focus?.();
                }, 50);
              }}
              onKeyDown={(e) => {
                if (e.key !== "Enter") return;
                setEditingId(r.id);
                setShowForm(true);
                setName(r.name ?? "");
                setBasePrice(String(r.base_price ?? 0));
                setIsActive(!!r.is_active);
                topRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
                window.setTimeout(() => {
                  (document.getElementById("poa-type-name") as HTMLInputElement | null)?.focus?.();
                }, 50);
              }}
            >
              <div>
                <div className="text-sm font-medium text-gray-900">{r.name}</div>
              </div>
              <div className="text-sm text-gray-900">{Number(r.base_price ?? 0).toLocaleString()}</div>
              <div className="text-sm text-gray-700">{r.is_active ? "active" : "inactive"}</div>
            </div>
            );
          })
        )}
        <TablePagination table={table} />
      </div>
    </div>
  );
}
