"use client";

import React, { useCallback, useMemo, useState } from "react";
import { Button, Input } from "rizzui";
import { Title, Text } from "rizzui/typography";
import TablePagination from "@core/components/table/pagination";
import { getCoreRowModel, getPaginationRowModel, useReactTable } from "@tanstack/react-table";
import TableSearch from "@/components/table/table-search";

import { useAuth } from "@/app/shared/auth-provider";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";

type CustomerRow = {
  id: string;
  name: string;
  contact_name: string | null;
  phone: string | null;
  email: string | null;
  created_at: string;
  updated_at?: string;
};

export default function MyCustomersPage() {
  const { userId } = useAuth();
  const supabase = useMemo(() => createSupabaseBrowserClient(), []);

  const [loading, setLoading] = useState(false);
  const [rows, setRows] = useState<CustomerRow[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [pagination, setPagination] = useState({ pageIndex: 0, pageSize: 10 });
  const [search, setSearch] = useState("");

  const [name, setName] = useState("");
  const [contactName, setContactName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");

  const refresh = useCallback(() => {
    Promise.resolve().then(async () => {
      setLoading(true);
      setError(null);
      const base = supabase.from("customers").select("id,name,contact_name,phone,email,created_at,updated_at");
      const res = await base.order("updated_at", { ascending: false }).order("created_at", { ascending: false });
      if (res.error) {
        const msg = String(res.error.message ?? "");
        if (msg.includes("customers.updated_at") || (msg.includes("updated_at") && msg.toLowerCase().includes("does not exist"))) {
          const fallback = await supabase.from("customers").select("id,name,contact_name,phone,email,created_at").order("created_at", { ascending: false });
          if (fallback.error) {
            setError(fallback.error.message);
            setRows([]);
            setLoading(false);
            return;
          }
          setRows((fallback.data ?? []) as CustomerRow[]);
          setLoading(false);
          return;
        }
        setError(msg || "โหลดข้อมูลไม่สำเร็จ");
        setRows([]);
        setLoading(false);
        return;
      }
      setRows((res.data ?? []) as CustomerRow[]);
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
      const hay = [r.name, r.contact_name, r.phone, r.email]
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
    <div>
      <div className="flex flex-col justify-between gap-3 md:flex-row md:items-end">
        <div>
          <Title as="h1" className="text-lg font-semibold text-gray-900">
            นายจ้างของฉัน
          </Title>
          <Text className="mt-1 text-sm text-gray-600">เฉพาะลูกค้าที่คุณดูแล (ตามสิทธิ์ RLS)</Text>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <TableSearch value={search} onChange={setSearch} disabled={loading} />
          <Button variant="outline" onClick={() => refresh()} disabled={loading}>
            รีเฟรช
          </Button>
        </div>
      </div>

      <div className="mt-5 grid gap-3 rounded-xl border border-gray-200 bg-white p-4">
        <div className="text-sm font-semibold text-gray-900">เพิ่มลูกค้า</div>
        <div className="grid gap-3 md:grid-cols-2">
          <Input label="ชื่อลูกค้า" value={name} onChange={(e) => setName(e.target.value)} />
          <Input label="ชื่อผู้ติดต่อ" value={contactName} onChange={(e) => setContactName(e.target.value)} />
          <Input label="โทรศัพท์" value={phone} onChange={(e) => setPhone(e.target.value)} />
          <Input label="อีเมล" value={email} onChange={(e) => setEmail(e.target.value)} inputMode="email" />
        </div>
        <div>
          <Button
            onClick={async () => {
              setLoading(true);
              setError(null);
              const { error: e } = await supabase.from("customers").insert({
                name: name.trim(),
                contact_name: contactName.trim() || null,
                phone: phone.trim() || null,
                email: email.trim() || null,
                created_by_profile_id: userId,
              });
              if (e) {
                setError(e.message);
                setLoading(false);
                return;
              }
              setName("");
              setContactName("");
              setPhone("");
              setEmail("");
              setLoading(false);
              refresh();
            }}
            disabled={loading || name.trim().length === 0}
          >
            บันทึก
          </Button>
        </div>
      </div>

      {error ? <div className="mt-4 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">{error}</div> : null}

      <div className="mt-4 overflow-hidden rounded-xl border border-gray-200 bg-white">
        <div className="grid grid-cols-[1.2fr_0.8fr_0.7fr_0.9fr] gap-3 border-b border-gray-200 bg-gray-50 px-4 py-2 text-xs font-semibold text-gray-600">
          <div>ลูกค้า</div>
          <div>ผู้ติดต่อ</div>
          <div>โทรศัพท์</div>
          <div>อีเมล</div>
        </div>
        {rows.length === 0 ? (
          <div className="px-4 py-8 text-sm text-gray-500">{loading ? "กำลังโหลด..." : "ยังไม่มีข้อมูล"}</div>
        ) : (
          table.getRowModel().rows.map((row) => {
            const r = row.original as CustomerRow;
            return (
              <div key={r.id} className="grid grid-cols-[1.2fr_0.8fr_0.7fr_0.9fr] gap-3 border-b border-gray-100 px-4 py-3 last:border-b-0">
                <div className="text-sm font-medium text-gray-900">{r.name}</div>
                <div className="text-sm text-gray-700">{r.contact_name ?? "-"}</div>
                <div className="text-sm text-gray-700">{r.phone ?? "-"}</div>
                <div className="text-sm text-gray-700">{r.email ?? "-"}</div>
              </div>
            );
          })
        )}
        <TablePagination table={table} />
      </div>
    </div>
  );
}
