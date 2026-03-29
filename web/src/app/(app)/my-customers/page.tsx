"use client";

import React, { useEffect, useMemo, useState } from "react";

import { useRole } from "@/app/providers";
import { cn } from "@/lib/cn";
import { createSupabaseBrowserClient } from "@/lib/supabase/browser";
import type { Customer } from "@/lib/supabase/types";

export default function MyCustomersPage() {
  const { role, user } = useRole();
  const supabase = useMemo(() => createSupabaseBrowserClient(), []);

  const [rows, setRows] = useState<Customer[]>([]);
  const [loading, setLoading] = useState(true);
  const [name, setName] = useState("");
  const [contactName, setContactName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [error, setError] = useState<string | null>(null);

  const canCreate = name.trim().length > 0;

  useEffect(() => {
    const load = async () => {
      if (!user) return;
      setLoading(true);
      const query = supabase
        .from("customers")
        .select("id,name,contact_name,phone,email,created_by_profile_id,created_at")
        .order("created_at", { ascending: false });
      const { data, error: qErr } =
        role === "representative"
          ? await query.eq("created_by_profile_id", user.id)
          : await query;
      if (qErr) {
        setError(qErr.message);
        setRows([]);
      } else {
        setError(null);
        setRows((data as Customer[]) ?? []);
      }
      setLoading(false);
    };
    load();
  }, [role, supabase, user]);

  return (
    <div>
      <div className="flex items-end justify-between gap-4">
        <div>
          <div className="text-lg font-semibold">นายจ้าง/ลูกค้าของฉัน</div>
          <div className="mt-1 text-sm text-[color:var(--color-muted)]">จัดการรายชื่อนายจ้าง/ลูกค้าที่คุณดูแล</div>
        </div>
      </div>

      <div className="mt-4 rounded-xl border bg-[color:var(--color-surface)] p-4">
        <div className="text-sm font-semibold">เพิ่มนายจ้าง/ลูกค้า</div>
        <div className="mt-3 grid grid-cols-1 gap-3 md:grid-cols-2">
          <input
            className="h-10 rounded-md border bg-[color:var(--color-surface-2)] px-3 text-sm"
            placeholder="ชื่อบริษัท*"
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
          <input
            className="h-10 rounded-md border bg-[color:var(--color-surface-2)] px-3 text-sm"
            placeholder="ผู้ติดต่อ"
            value={contactName}
            onChange={(e) => setContactName(e.target.value)}
          />
          <input
            className="h-10 rounded-md border bg-[color:var(--color-surface-2)] px-3 text-sm"
            placeholder="เบอร์โทร"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
          />
          <input
            className="h-10 rounded-md border bg-[color:var(--color-surface-2)] px-3 text-sm"
            placeholder="อีเมล"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
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
                name: name.trim(),
                contact_name: contactName.trim() || null,
                phone: phone.trim() || null,
                email: email.trim() || null,
                created_by_profile_id: role === "representative" ? user.id : null,
              };
              const { error: insErr } = await supabase.from("customers").insert(payload);
              if (insErr) {
                setError(insErr.message);
                return;
              }
              setName("");
              setContactName("");
              setPhone("");
              setEmail("");
              const { data } = await supabase
                .from("customers")
                .select("id,name,contact_name,phone,email,created_by_profile_id,created_at")
                .order("created_at", { ascending: false });
              setRows((data as Customer[]) ?? []);
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
                <th className="px-4 py-3 font-medium">ชื่อบริษัท</th>
                <th className="px-4 py-3 font-medium">ผู้ติดต่อ</th>
                <th className="px-4 py-3 font-medium">เบอร์โทร</th>
                <th className="px-4 py-3 font-medium">อีเมล</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id} className={cn("border-t", "hover:bg-[color:var(--color-surface-2)] transition")}>
                  <td className="px-4 py-3 font-medium">{r.name}</td>
                  <td className="px-4 py-3">{r.contact_name ?? "-"}</td>
                  <td className="px-4 py-3">{r.phone ?? "-"}</td>
                  <td className="px-4 py-3">{r.email ?? "-"}</td>
                </tr>
              ))}
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

