"use client";

import React, { useEffect, useMemo, useState } from "react";

import { useRole } from "@/app/providers";
import { cn } from "@/lib/cn";
import { createSupabaseBrowserClient } from "@/lib/supabase/browser";
import type { Customer, PoaRequest, PoaRequestType } from "@/lib/supabase/types";

type PoaRow = {
  id: string;
  customerName: string;
  typeName: string;
  workerCount: number;
  totalPrice: number;
  status: PoaRequest["status"];
  createdAt: string;
  reason: string | null;
};

type PoaRequestJoin = {
  id: string;
  worker_count: number;
  total_price: number;
  status: PoaRequest["status"];
  created_at: string;
  reason: string | null;
  customers: { name: string } | { name: string }[] | null;
  poa_request_types: { name: string } | { name: string }[] | null;
};

function mapJoinRows(data: PoaRequestJoin[], query: string) {
  const mapped: PoaRow[] = data.map((r) => {
    const customerObj = Array.isArray(r.customers) ? r.customers[0] : r.customers;
    const typeObj = Array.isArray(r.poa_request_types) ? r.poa_request_types[0] : r.poa_request_types;
    const customerName = customerObj?.name ?? "-";
    const typeName = typeObj?.name ?? "-";
    return {
      id: r.id,
      customerName,
      typeName,
      workerCount: r.worker_count,
      totalPrice: r.total_price,
      status: r.status,
      createdAt: new Date(r.created_at).toLocaleString("th-TH"),
      reason: r.reason ?? null,
    };
  });

  const trimmed = query.trim().toLowerCase();
  return trimmed.length
    ? mapped.filter(
        (x) =>
          x.customerName.toLowerCase().includes(trimmed) ||
          x.typeName.toLowerCase().includes(trimmed) ||
          x.id.toLowerCase().includes(trimmed),
      )
    : mapped;
}

function statusLabel(s: PoaRequest["status"]) {
  switch (s) {
    case "submitted":
      return "ส่งแล้ว";
    case "need_info":
      return "ต้องการข้อมูลเพิ่ม";
    case "issued":
      return "ออกหนังสือแล้ว";
    case "rejected":
      return "ปฏิเสธ";
  }
}

function badgeClass(s: PoaRequest["status"]) {
  if (s === "submitted") return "bg-sky-50 text-sky-700 border-sky-200";
  if (s === "need_info") return "bg-amber-50 text-amber-700 border-amber-200";
  if (s === "issued") return "bg-emerald-50 text-emerald-700 border-emerald-200";
  return "bg-rose-50 text-rose-700 border-rose-200";
}

export default function PoaRequestsPage() {
  const { loading: authLoading, role, user } = useRole();
  const supabase = useMemo(() => createSupabaseBrowserClient(), []);

  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<PoaRequest["status"] | "all">("all");
  const [typeFilter, setTypeFilter] = useState<string>("all");
  const [customerFilter, setCustomerFilter] = useState<string>("all");

  const [types, setTypes] = useState<PoaRequestType[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [rows, setRows] = useState<PoaRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [creating, setCreating] = useState(false);
  const [formCustomerId, setFormCustomerId] = useState<string>("");
  const [formTypeId, setFormTypeId] = useState<string>("");
  const [formWorkerCount, setFormWorkerCount] = useState<number>(1);
  const [formReason, setFormReason] = useState<string>("");

  const selectedType = useMemo(() => types.find((t) => t.id === formTypeId) ?? null, [formTypeId, types]);
  const computedTotal = useMemo(() => {
    if (!selectedType) return 0;
    const count = Number.isFinite(formWorkerCount) ? Math.max(0, formWorkerCount) : 0;
    return selectedType.base_price + selectedType.per_worker_price * count;
  }, [formWorkerCount, selectedType]);

  const canCreate = useMemo(() => {
    if (!user || !role) return false;
    return formCustomerId.length > 0 && formTypeId.length > 0 && formWorkerCount > 0;
  }, [formCustomerId, formTypeId, formWorkerCount, role, user]);

  useEffect(() => {
    const loadTypesAndCustomers = async () => {
      if (!user || !role) return;
      setLoading(true);

      const { data: typeData, error: typeErr } = await supabase
        .from("poa_request_types")
        .select("id,name,description,base_price,per_worker_price,is_active,created_at")
        .eq("is_active", true)
        .order("created_at", { ascending: true });
      if (typeErr) {
        setError(typeErr.message);
        setTypes([]);
      } else {
        setTypes((typeData as PoaRequestType[]) ?? []);
      }

      const baseCustomerQuery = supabase
        .from("customers")
        .select("id,name,contact_name,phone,email,created_by_profile_id,created_at")
        .order("created_at", { ascending: false });
      const { data: custData, error: custErr } =
        role === "representative" ? await baseCustomerQuery.eq("created_by_profile_id", user.id) : await baseCustomerQuery;
      if (custErr) {
        setError(custErr.message);
        setCustomers([]);
      } else {
        setCustomers((custData as Customer[]) ?? []);
      }

      setLoading(false);
    };

    if (authLoading) return;
    if (!user) return;
    loadTypesAndCustomers();
  }, [authLoading, role, supabase, user]);

  useEffect(() => {
    const loadRows = async () => {
      if (!user || !role) return;
      setLoading(true);

      let q = supabase
        .from("poa_requests")
        .select(
          "id,customer_id,poa_request_type_id,worker_count,total_price,status,created_at,reason,customers(name),poa_request_types(name)",
        )
        .order("created_at", { ascending: false });

      if (role === "representative") q = q.eq("representative_profile_id", user.id);
      if (statusFilter !== "all") q = q.eq("status", statusFilter);
      if (typeFilter !== "all") q = q.eq("poa_request_type_id", typeFilter);
      if (customerFilter !== "all") q = q.eq("customer_id", customerFilter);

      const { data, error: qErr } = await q;
      if (qErr) {
        setError(qErr.message);
        setRows([]);
        setLoading(false);
        return;
      }

      const filtered = mapJoinRows(((data ?? []) as unknown as PoaRequestJoin[]) ?? [], query);
      setError(null);
      setRows(filtered);
      setLoading(false);
    };

    if (authLoading) return;
    if (!user) return;
    loadRows();
  }, [authLoading, customerFilter, query, role, statusFilter, supabase, typeFilter, user]);

  return (
    <div>
      <div className="flex items-end justify-between gap-4">
        <div>
          <div className="text-lg font-semibold">คำขอ POA</div>
          <div className="mt-1 text-sm text-[color:var(--color-muted)]">ระบุนายจ้าง ประเภทคำขอ จำนวนแรงงาน และระบบคำนวณราคา</div>
        </div>
        <button
          type="button"
          className="h-9 rounded-md bg-[color:var(--color-primary)] px-3 text-sm font-medium text-[color:var(--color-primary-foreground)] hover:opacity-90 transition"
          onClick={() => setCreating((v) => !v)}
        >
          {creating ? "ปิดฟอร์ม" : "สร้างคำขอ POA"}
        </button>
      </div>

      {creating ? (
        <div className="mt-4 rounded-xl border bg-[color:var(--color-surface)] p-4">
          <div className="text-sm font-semibold">สร้างคำขอ POA</div>
          <div className="mt-3 grid grid-cols-1 gap-3 md:grid-cols-2">
            <select
              className="h-10 rounded-md border bg-[color:var(--color-surface-2)] px-3 text-sm"
              value={formCustomerId}
              onChange={(e) => setFormCustomerId(e.target.value)}
            >
              <option value="">เลือกนายจ้าง/ลูกค้า*</option>
              {customers.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
            <select
              className="h-10 rounded-md border bg-[color:var(--color-surface-2)] px-3 text-sm"
              value={formTypeId}
              onChange={(e) => setFormTypeId(e.target.value)}
            >
              <option value="">เลือกเหตุผล/ประเภทคำขอ*</option>
              {types.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
            </select>
            <input
              className="h-10 rounded-md border bg-[color:var(--color-surface-2)] px-3 text-sm"
              value={Number.isFinite(formWorkerCount) ? String(formWorkerCount) : ""}
              onChange={(e) => setFormWorkerCount(Number.parseInt(e.target.value || "0", 10))}
              inputMode="numeric"
              placeholder="จำนวนแรงงาน*"
            />
            <input
              className="h-10 rounded-md border bg-[color:var(--color-surface-2)] px-3 text-sm"
              value={formReason}
              onChange={(e) => setFormReason(e.target.value)}
              placeholder="เหตุผลเพิ่มเติม (optional)"
            />
          </div>

          <div className="mt-3 rounded-lg border bg-[color:var(--color-surface-2)] p-3 text-sm">
            <div className="flex items-center justify-between">
              <div className="font-medium">สรุปราคา</div>
              <div className="font-semibold">{computedTotal.toLocaleString()} บาท</div>
            </div>
            <div className="mt-1 text-xs text-[color:var(--color-muted)]">
              {selectedType
                ? `Base ${selectedType.base_price.toLocaleString()} + ${selectedType.per_worker_price.toLocaleString()} × ${formWorkerCount}`
                : "เลือกประเภทคำขอเพื่อดูราคา"}
            </div>
          </div>

          <div className="mt-3 flex items-center justify-end gap-3">
            <button
              type="button"
              disabled={!canCreate}
              className="h-10 rounded-md bg-[color:var(--color-primary)] px-4 text-sm font-medium text-[color:var(--color-primary-foreground)] hover:opacity-90 transition disabled:opacity-50"
              onClick={async () => {
                if (!user || !selectedType) return;
                setError(null);
                const total = selectedType.base_price + selectedType.per_worker_price * formWorkerCount;
                const payload = {
                  customer_id: formCustomerId,
                  representative_profile_id: user.id,
                  poa_request_type_id: selectedType.id,
                  worker_count: formWorkerCount,
                  reason: formReason.trim() || null,
                  unit_price: selectedType.per_worker_price,
                  total_price: total,
                  status: "submitted" as const,
                };
                const { error: insErr } = await supabase.from("poa_requests").insert(payload);
                if (insErr) {
                  setError(insErr.message);
                  return;
                }
                setCreating(false);
                setFormCustomerId("");
                setFormTypeId("");
                setFormWorkerCount(1);
                setFormReason("");
                const { data } = await supabase
                  .from("poa_requests")
                  .select(
                    "id,customer_id,poa_request_type_id,worker_count,total_price,status,created_at,reason,customers(name),poa_request_types(name)",
                  )
                  .order("created_at", { ascending: false });
                setRows(mapJoinRows(((data ?? []) as unknown as PoaRequestJoin[]) ?? [], ""));
              }}
            >
              ส่งคำขอ
            </button>
          </div>
        </div>
      ) : null}

      <div className="mt-4 rounded-xl border bg-[color:var(--color-surface)]">
        <div className="p-4 flex flex-wrap items-center gap-3">
          <input
            className="h-9 w-full max-w-[320px] rounded-md border bg-[color:var(--color-surface-2)] px-3 text-sm"
            placeholder="ค้นหาเลขที่/ชื่อลูกค้า"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
          <select
            className="h-9 rounded-md border bg-[color:var(--color-surface-2)] px-3 text-sm"
            value={customerFilter}
            onChange={(e) => setCustomerFilter(e.target.value)}
          >
            <option value="all">ทุกนายจ้าง</option>
            {customers.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
          <select
            className="h-9 rounded-md border bg-[color:var(--color-surface-2)] px-3 text-sm"
            value={typeFilter}
            onChange={(e) => setTypeFilter(e.target.value)}
          >
            <option value="all">ทุกประเภท</option>
            {types.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
          </select>
          <select
            className="h-9 rounded-md border bg-[color:var(--color-surface-2)] px-3 text-sm"
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value as PoaRequest["status"] | "all")}
          >
            <option value="all">ทุกสถานะ</option>
            <option value="submitted">ส่งแล้ว</option>
            <option value="need_info">ต้องการข้อมูลเพิ่ม</option>
            <option value="issued">ออกหนังสือแล้ว</option>
            <option value="rejected">ปฏิเสธ</option>
          </select>
        </div>

        {error ? <div className="px-4 pb-2 text-sm text-red-600">{error}</div> : null}

        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-left text-[color:var(--color-muted)]">
              <tr className="border-t">
                <th className="px-4 py-3 font-medium">เลขที่</th>
                <th className="px-4 py-3 font-medium">นายจ้าง/ลูกค้า</th>
                <th className="px-4 py-3 font-medium">ประเภทคำขอ</th>
                <th className="px-4 py-3 font-medium">จำนวนแรงงาน</th>
                <th className="px-4 py-3 font-medium">ราคา</th>
                <th className="px-4 py-3 font-medium">สถานะ</th>
                <th className="px-4 py-3 font-medium">วันที่สร้าง</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.id} className="border-t hover:bg-[color:var(--color-surface-2)] transition">
                  <td className="px-4 py-3 font-medium">{row.id.slice(0, 8).toUpperCase()}</td>
                  <td className="px-4 py-3">{row.customerName}</td>
                  <td className="px-4 py-3">{row.typeName}</td>
                  <td className="px-4 py-3">{row.workerCount}</td>
                  <td className="px-4 py-3">{row.totalPrice.toLocaleString()} บาท</td>
                  <td className="px-4 py-3">
                    <span
                      className={cn(
                        "inline-flex items-center rounded-full border px-2 py-0.5 text-xs",
                        badgeClass(row.status),
                      )}
                    >
                      {statusLabel(row.status)}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-[color:var(--color-muted)]">{row.createdAt}</td>
                </tr>
              ))}
              {!loading && rows.length === 0 ? (
                <tr className="border-t">
                  <td className="px-4 py-6 text-[color:var(--color-muted)]" colSpan={7}>
                    ยังไม่มีข้อมูล
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </div>

      <div className="mt-4 rounded-xl border bg-[color:var(--color-surface)] p-4">
        <div className="text-sm font-semibold">POA Request List (Pricing Catalog) (ตัวอย่าง)</div>
        <div className="mt-2 grid grid-cols-1 gap-3 md:grid-cols-2">
          {types.map((t) => (
            <div key={t.id} className="rounded-lg border bg-[color:var(--color-surface-2)] p-3">
              <div className="text-sm font-medium">{t.name}</div>
              <div className="mt-1 text-xs text-[color:var(--color-muted)]">
                Base {t.base_price.toLocaleString()} บาท + {t.per_worker_price.toLocaleString()} บาท/แรงงาน
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
