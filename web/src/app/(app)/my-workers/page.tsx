"use client";

import React, { useEffect, useMemo, useState } from "react";

import { useRole } from "@/app/providers";
import { cn } from "@/lib/cn";
import { createSupabaseBrowserClient } from "@/lib/supabase/browser";
import type { Customer, Worker } from "@/lib/supabase/types";

export default function MyWorkersPage() {
  const { role, user } = useRole();
  const supabase = useMemo(() => createSupabaseBrowserClient(), []);

  const [customers, setCustomers] = useState<Customer[]>([]);
  const [rows, setRows] = useState<Worker[]>([]);
  const [loading, setLoading] = useState(true);
  const [fullName, setFullName] = useState("");
  const [customerId, setCustomerId] = useState<string>("");
  const [passportNo, setPassportNo] = useState("");
  const [nationality, setNationality] = useState("");
  const [error, setError] = useState<string | null>(null);

  const canCreate = fullName.trim().length > 0;

  useEffect(() => {
    const load = async () => {
      if (!user) return;
      setLoading(true);

      const custQuery = supabase
        .from("customers")
        .select("id,name,contact_name,phone,email,created_by_profile_id,created_at")
        .order("created_at", { ascending: false });
      const { data: custData } =
        role === "representative" ? await custQuery.eq("created_by_profile_id", user.id) : await custQuery;
      setCustomers((custData as Customer[]) ?? []);

      const workerQuery = supabase
        .from("workers")
        .select("id,customer_id,full_name,passport_no,nationality,created_by_profile_id,created_at")
        .order("created_at", { ascending: false });
      const { data, error: qErr } =
        role === "representative" ? await workerQuery.eq("created_by_profile_id", user.id) : await workerQuery;
      if (qErr) {
        setError(qErr.message);
        setRows([]);
      } else {
        setError(null);
        setRows((data as Worker[]) ?? []);
      }

      setLoading(false);
    };
    load();
  }, [role, supabase, user]);

  return (
    <div>
      <div className="flex items-end justify-between gap-4">
        <div>
          <div className="text-lg font-semibold">แรงงานของฉัน</div>
          <div className="mt-1 text-sm text-[color:var(--color-muted)]">จัดการรายการแรงงานที่คุณดูแล</div>
        </div>
      </div>

      <div className="mt-4 rounded-xl border bg-[color:var(--color-surface)] p-4">
        <div className="text-sm font-semibold">เพิ่มแรงงาน</div>
        <div className="mt-3 grid grid-cols-1 gap-3 md:grid-cols-2">
          <input
            className="h-10 rounded-md border bg-[color:var(--color-surface-2)] px-3 text-sm"
            placeholder="ชื่อ-สกุล*"
            value={fullName}
            onChange={(e) => setFullName(e.target.value)}
          />
          <select
            className="h-10 rounded-md border bg-[color:var(--color-surface-2)] px-3 text-sm"
            value={customerId}
            onChange={(e) => setCustomerId(e.target.value)}
          >
            <option value="">เลือกนายจ้าง/ลูกค้า (ไม่บังคับ)</option>
            {customers.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
          <input
            className="h-10 rounded-md border bg-[color:var(--color-surface-2)] px-3 text-sm"
            placeholder="เลขพาสปอร์ต"
            value={passportNo}
            onChange={(e) => setPassportNo(e.target.value)}
          />
          <input
            className="h-10 rounded-md border bg-[color:var(--color-surface-2)] px-3 text-sm"
            placeholder="สัญชาติ"
            value={nationality}
            onChange={(e) => setNationality(e.target.value)}
          />
        </div>

        <div className="mt-3 flex items-center justify-end gap-3">
          <button
            type="button"
            className="h-10 rounded-md bg-[color:var(--color-primary)] px-4 text-sm font-medium text-[color:var(--color-primary-foreground)] hover:opacity-90 transition disabled:opacity-50"
            disabled={!canCreate}
            onClick={async () => {
              if (!user) return;
              const payload = {
                full_name: fullName.trim(),
                customer_id: customerId || null,
                passport_no: passportNo.trim() || null,
                nationality: nationality.trim() || null,
                created_by_profile_id: role === "representative" ? user.id : null,
              };
              const { error: insErr } = await supabase.from("workers").insert(payload);
              if (insErr) {
                setError(insErr.message);
                return;
              }
              setFullName("");
              setCustomerId("");
              setPassportNo("");
              setNationality("");
              const workerQuery = supabase
                .from("workers")
                .select("id,customer_id,full_name,passport_no,nationality,created_by_profile_id,created_at")
                .order("created_at", { ascending: false });
              const { data } =
                role === "representative" ? await workerQuery.eq("created_by_profile_id", user.id) : await workerQuery;
              setRows((data as Worker[]) ?? []);
            }}
          >
            บันทึก
          </button>
        </div>

        {error ? <div className="mt-3 text-sm text-red-600">{error}</div> : null}
      </div>

      <div className="mt-4 rounded-xl border bg-[color:var(--color-surface)]">
        <div className="p-4 flex items-center justify-between">
          <div className="text-sm font-semibold">รายการ</div>
          <div className="text-xs text-[color:var(--color-muted)]">{loading ? "กำลังโหลด..." : `${rows.length} รายการ`}</div>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-left text-[color:var(--color-muted)]">
              <tr className="border-t">
                <th className="px-4 py-3 font-medium">ชื่อแรงงาน</th>
                <th className="px-4 py-3 font-medium">นายจ้าง/ลูกค้า</th>
                <th className="px-4 py-3 font-medium">พาสปอร์ต</th>
                <th className="px-4 py-3 font-medium">สัญชาติ</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => {
                const c = customers.find((x) => x.id === r.customer_id);
                return (
                  <tr key={r.id} className={cn("border-t", "hover:bg-[color:var(--color-surface-2)] transition")}>
                    <td className="px-4 py-3 font-medium">{r.full_name}</td>
                    <td className="px-4 py-3">{c?.name ?? "-"}</td>
                    <td className="px-4 py-3">{r.passport_no ?? "-"}</td>
                    <td className="px-4 py-3">{r.nationality ?? "-"}</td>
                  </tr>
                );
              })}
              {!loading && rows.length === 0 ? (
                <tr className="border-t">
                  <td className="px-4 py-6 text-[color:var(--color-muted)]" colSpan={4}>
                    ยังไม่มีข้อมูล
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

