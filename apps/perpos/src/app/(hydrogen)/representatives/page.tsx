"use client";

import React, { useCallback, useMemo, useRef, useState } from "react";

import { Button } from "rizzui";
import { Title, Text } from "rizzui/typography";
import TablePagination from "@core/components/table/pagination";
import { getCoreRowModel, getPaginationRowModel, useReactTable } from "@tanstack/react-table";
import TableSearch from "@/components/table/table-search";

import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import { RepresentativeEditModal } from "@/app/(hydrogen)/representatives/_components/representative-edit-modal";

type RepresentativeRow = {
  id: string;
  rep_code: string;
  prefix: string | null;
  first_name: string | null;
  last_name: string | null;
  phone: string | null;
  gender: string | null;
  id_card_no: string | null;
  status: string | null;
  photo: string | null;
  email: string | null;
  created_at: string;
};

export default function RepresentativesPage() {
  const supabase = useMemo(() => createSupabaseBrowserClient(), []);
  const topRef = useRef<HTMLDivElement | null>(null);

  const isMissingEmailColumnError = useCallback((message: string | null | undefined) => {
    const m = (message ?? "").toLowerCase();
    if (!m) return false;
    return m.includes("company_representatives.email") || (m.includes("column") && m.includes("email") && m.includes("does not exist"));
  }, []);

  const normalizePhotoUrl = useCallback((value: string | null | undefined) => {
    const v = (value ?? "").trim();
    if (!v) return null;
    if (v.startsWith("//")) return `https:${v}`;
    return v;
  }, []);

  const genderLabel = useCallback((value: string | null | undefined) => {
    const v = (value ?? "").trim();
    if (!v) return "-";
    if (v.toLowerCase() === "male") return "ชาย";
    if (v.toLowerCase() === "female") return "หญิง";
    return v;
  }, []);

  const normalizeGender = useCallback((value: string) => {
    const v = value.trim();
    if (!v) return "";
    if (v.toLowerCase() === "male") return "ชาย";
    if (v.toLowerCase() === "female") return "หญิง";
    return v;
  }, []);

  const normalizeStatus = useCallback((value: string) => {
    const v = value.trim();
    if (!v) return "";
    if (v === "ปกติ") return "ปกติ";
    if (v === "พักใช้") return "พักใช้";
    if (v === "ยกเลิกถาวร") return "ยกเลิกถาวร";
    if (v === "ไม่ปกติ") return "พักใช้";
    return v;
  }, []);

  const [loading, setLoading] = useState(false);
  const [rows, setRows] = useState<RepresentativeRow[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [pagination, setPagination] = useState({ pageIndex: 0, pageSize: 10 });
  const [search, setSearch] = useState("");

  const [editOpen, setEditOpen] = useState(false);
  const [editing, setEditing] = useState<RepresentativeRow | null>(null);

  const refresh = useCallback(() => {
    Promise.resolve().then(async () => {
      setLoading(true);
      setError(null);
      const resWithEmail = await supabase
        .from("company_representatives")
        .select("id,rep_code,prefix,first_name,last_name,phone,gender,id_card_no,status,photo,email,created_at")
        .order("rep_code", { ascending: true });

      if (resWithEmail.error && isMissingEmailColumnError(resWithEmail.error.message)) {
        const resWithoutEmail = await supabase
          .from("company_representatives")
          .select("id,rep_code,prefix,first_name,last_name,phone,gender,id_card_no,status,photo,created_at")
          .order("rep_code", { ascending: true });
        if (resWithoutEmail.error) {
          setError(resWithoutEmail.error.message);
          setRows([]);
          setLoading(false);
          return;
        }
        const mapped = (resWithoutEmail.data ?? []).map((r) => ({ ...r, email: null })) as RepresentativeRow[];
        setRows(mapped);
        setLoading(false);
        return;
      }

      if (resWithEmail.error) {
        setError(resWithEmail.error.message);
        setRows([]);
        setLoading(false);
        return;
      }

      setRows((resWithEmail.data ?? []) as RepresentativeRow[]);
      setLoading(false);
    });
  }, [isMissingEmailColumnError, supabase]);

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
      const hay = [r.rep_code, r.first_name, r.last_name, r.phone, r.gender, r.id_card_no, r.status]
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
            ตัวแทนบริษัท
          </Title>
          <Text className="mt-1 text-sm text-gray-600">จัดการรายชื่อตัวแทนของบริษัท</Text>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <TableSearch value={search} onChange={setSearch} disabled={loading} />
          <Button
            variant="outline"
            onClick={() => {
              setEditing(null);
              setEditOpen(true);
              topRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
            }}
            disabled={loading}
          >
            เพิ่มตัวแทนบริษัท
          </Button>
        </div>
      </div>

      {error ? <div className="mt-4 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">{error}</div> : null}

      <RepresentativeEditModal
        open={editOpen}
        onClose={() => {
          setEditOpen(false);
          setEditing(null);
        }}
        initial={editing}
        supabase={supabase}
        onSaved={() => refresh()}
      />

      <div className="mt-4 overflow-hidden rounded-xl border border-gray-200 bg-white">
        <div className="grid grid-cols-[44px_0.35fr_0.8fr_0.7fr_0.55fr_0.55fr_0.45fr] gap-3 border-b border-gray-200 bg-gray-50 px-4 py-2 text-xs font-semibold text-gray-600">
          <div>รูป</div>
          <div>รหัส</div>
          <div>ชื่อ</div>
          <div>อีเมล</div>
          <div>เบอร์โทร</div>
          <div>เลขบัตร</div>
          <div>สถานะ</div>
        </div>
        {rows.length === 0 ? (
          <div className="px-4 py-8 text-sm text-gray-500">{loading ? "กำลังโหลด..." : "ยังไม่มีข้อมูล"}</div>
        ) : (
          table.getRowModel().rows.map((row) => {
            const r = row.original as RepresentativeRow;
            return (
            <div
              key={r.id}
              role="button"
              tabIndex={0}
              className="grid cursor-pointer grid-cols-[44px_0.35fr_0.8fr_0.7fr_0.55fr_0.55fr_0.45fr] items-center gap-3 border-b border-gray-100 px-4 py-3 last:border-b-0 transition-colors hover:bg-gray-100 active:bg-gray-200"
              onClick={() => {
                setEditing(r);
                setEditOpen(true);
              }}
              onKeyDown={(e) => {
                if (e.key !== "Enter") return;
                setEditing(r);
                setEditOpen(true);
              }}
            >
              <div className="h-11 w-11 overflow-hidden rounded-xl border border-gray-200 bg-gray-50">
                {normalizePhotoUrl(r.photo) ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    alt="รูปตัวแทน"
                    src={normalizePhotoUrl(r.photo) ?? ""}
                    className="h-full w-full object-cover"
                  />
                ) : null}
              </div>
              <div className="text-sm font-medium text-gray-900">{r.rep_code}</div>
              <div className="text-sm text-gray-700">
                {[r.prefix, r.first_name, r.last_name].filter(Boolean).join(" ") || "-"}
              </div>
              <div className="truncate text-sm text-gray-700">{r.email || "-"}</div>
              <div className="text-sm text-gray-700">{r.phone || "-"}</div>
              <div className="text-sm text-gray-700">{r.id_card_no || "-"}</div>
              <div className="text-sm text-gray-700">{normalizeStatus(r.status ?? "") || "-"}</div>
            </div>
            );
          })
        )}
        <TablePagination table={table} />
      </div>
    </div>
  );
}
