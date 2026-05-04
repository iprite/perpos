"use client";

import React, { useCallback, useMemo, useState } from "react";
import { Button, Input, Switch } from "rizzui";
import { Title, Text } from "rizzui/typography";

import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import { withBasePath } from "@/utils/base-path";

type PermissionRow = { function_key: string; allowed: boolean };

const defaultFunctionKeys = [
  "bot.news.request",
  "bot.news.latest",
  "bot.finance.income_add",
  "bot.finance.expense_add",
  "bot.calendar.add",
  "bot.calendar.today",
  "admin.users.manage",
  "admin.permissions.manage",
  "admin.news_agent.manage",
  "admin.delivery.manage",
];

export default function AdminPermissionsPage() {
  const supabase = useMemo(() => createSupabaseBrowserClient(), []);

  const [userId, setUserId] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [items, setItems] = useState<PermissionRow[]>(defaultFunctionKeys.map((k) => ({ function_key: k, allowed: false })));

  const authHeader = useCallback(async () => {
    const { data } = await supabase.auth.getSession();
    const token = data.session?.access_token;
    if (!token) throw new Error("ยังไม่ได้เข้าสู่ระบบ");
    return { Authorization: `Bearer ${token}` };
  }, [supabase]);

  const load = useCallback(async () => {
    const id = userId.trim();
    if (!id) return;
    setLoading(true);
    setError(null);
    try {
      const headers = await authHeader();
      const res = await fetch(withBasePath(`/api/admin/users/permissions?userId=${encodeURIComponent(id)}`), { headers });
      const json = await res.json().catch(() => null);
      if (!res.ok) {
        setError(String(json?.error ?? "โหลดสิทธิ์ไม่สำเร็จ"));
        setLoading(false);
        return;
      }
      const rows = (json?.items ?? []) as PermissionRow[];
      const map = new Map(rows.map((r) => [r.function_key, Boolean(r.allowed)]));
      setItems(defaultFunctionKeys.map((k) => ({ function_key: k, allowed: map.get(k) ?? false })));
      setLoading(false);
    } catch (e: any) {
      setError(e?.message ?? "โหลดสิทธิ์ไม่สำเร็จ");
      setLoading(false);
    }
  }, [authHeader, userId]);

  const save = useCallback(async () => {
    const id = userId.trim();
    if (!id) return;
    setLoading(true);
    setError(null);
    try {
      const headers = await authHeader();
      const res = await fetch(withBasePath("/api/admin/users/permissions"), {
        method: "PUT",
        headers: { ...headers, "content-type": "application/json" },
        body: JSON.stringify({ userId: id, items }),
      });
      const json = await res.json().catch(() => null);
      if (!res.ok) {
        setError(String(json?.error ?? "บันทึกสิทธิ์ไม่สำเร็จ"));
        setLoading(false);
        return;
      }
      setLoading(false);
    } catch (e: any) {
      setError(e?.message ?? "บันทึกสิทธิ์ไม่สำเร็จ");
      setLoading(false);
    }
  }, [authHeader, items, userId]);

  return (
    <div>
      <div>
        <Title as="h1" className="text-lg font-semibold text-gray-900">
          สิทธิ์รายฟังก์ชัน
        </Title>
        <Text className="mt-1 text-sm text-gray-600">กำหนดว่า user คนไหนใช้ฟังก์ชันไหนได้บ้าง</Text>
      </div>

      <div className="mt-5 rounded-2xl border border-gray-200 bg-white p-5">
        <div className="grid grid-cols-1 gap-3 md:grid-cols-[1fr_120px_120px] md:items-end">
          <Input label="User ID" value={userId} onChange={(e) => setUserId(e.target.value)} placeholder="uuid" disabled={loading} />
          <Button variant="outline" onClick={() => void load()} disabled={loading}>
            โหลด
          </Button>
          <Button className="bg-indigo-600 text-white hover:bg-indigo-500" onClick={() => void save()} disabled={loading}>
            บันทึก
          </Button>
        </div>

        {error ? <div className="mt-4 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">{error}</div> : null}

        <div className="mt-5 space-y-3">
          {items.map((it) => (
            <div key={it.function_key} className="flex items-center justify-between gap-3 rounded-xl border border-gray-200 px-4 py-3">
              <div className="min-w-0">
                <div className="truncate text-sm font-medium text-gray-900">{it.function_key}</div>
              </div>
              <Switch
                checked={it.allowed}
                onChange={(e: any) =>
                  setItems((prev) =>
                    prev.map((x) =>
                      x.function_key === it.function_key
                        ? { ...x, allowed: Boolean(e?.target?.checked ?? e) }
                        : x,
                    ),
                  )
                }
                disabled={loading}
              />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
