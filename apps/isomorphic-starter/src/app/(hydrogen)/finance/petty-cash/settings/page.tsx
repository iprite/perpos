"use client";

import React, { useCallback, useMemo, useState } from "react";
import Link from "next/link";
import toast from "react-hot-toast";
import { Button, Input } from "rizzui";
import { Title, Text } from "rizzui/typography";

import { useAuth } from "@/app/shared/auth-provider";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";

type SettingsRow = { id: number; low_balance_threshold: number; in_app_alert_enabled: boolean };
type CategoryRow = { id: string; name: string; is_active: boolean; sort_order: number };

export default function PettyCashSettingsPage() {
  const { role } = useAuth();
  const supabase = useMemo(() => createSupabaseBrowserClient(), []);
  const canUsePage = role === "admin" || role === "sale" || role === "operation";
  const canWrite = role === "admin" || role === "operation";

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [settings, setSettings] = useState<SettingsRow | null>(null);
  const [categories, setCategories] = useState<CategoryRow[]>([]);
  const [newCategory, setNewCategory] = useState("");

  const loadAll = useCallback(async () => {
    if (!canUsePage) return;
    setLoading(true);
    setError(null);
    try {
      const [sRes, cRes] = await Promise.all([
        supabase.from("petty_cash_settings").select("id,low_balance_threshold,in_app_alert_enabled").eq("id", 1).single(),
        supabase.from("petty_cash_categories").select("id,name,is_active,sort_order").order("sort_order", { ascending: true }).limit(500),
      ]);
      if (sRes.error) throw new Error(sRes.error.message);
      if (cRes.error) throw new Error(cRes.error.message);
      setSettings(sRes.data as any);
      setCategories((cRes.data ?? []) as any);
      setLoading(false);
    } catch (e: any) {
      setLoading(false);
      setError(e?.message ?? "โหลดข้อมูลไม่สำเร็จ");
    }
  }, [canUsePage, supabase]);

  React.useEffect(() => {
    loadAll();
  }, [loadAll]);

  if (!canUsePage) {
    return (
      <div className="p-6">
        <Title as="h2" className="text-lg font-semibold">
          ไม่อนุญาตให้เข้าถึง
        </Title>
        <Text className="mt-1 text-sm text-gray-600">หน้านี้สำหรับทีมภายในเท่านั้น</Text>
      </div>
    );
  }

  return (
    <div className="p-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <Title as="h2" className="text-lg font-semibold">
            ตั้งค่าเงินสดย่อย
          </Title>
          <Text className="mt-1 text-sm text-gray-600">กำหนดเกณฑ์แจ้งเตือนและหมวดหมู่</Text>
        </div>
        <Link href="/finance/petty-cash" className="inline-flex">
          <Button variant="outline">กลับ</Button>
        </Link>
      </div>

      {error ? <div className="mt-4 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">{error}</div> : null}

      <div className="mt-4 grid gap-4">
        <div className="rounded-xl border border-gray-200 bg-white p-4">
          <div className="text-sm font-semibold text-gray-900">เกณฑ์เงินเหลือน้อย</div>
          <div className="mt-1 text-xs text-gray-500">แสดงแถบเตือนเมื่อยอดคงเหลือน้อยกว่าเกณฑ์นี้</div>
          <div className="mt-3 grid gap-2 md:grid-cols-3">
            <Input
              label="จำนวนเงิน"
              value={String(settings?.low_balance_threshold ?? "")}
              onChange={(e) => setSettings((prev) => ({ ...(prev ?? { id: 1, low_balance_threshold: 0, in_app_alert_enabled: true }), low_balance_threshold: Number(e.target.value || 0) }) as any)}
              inputMode="decimal"
              disabled={loading || !canWrite}
            />
            <div className="md:col-span-2 flex items-end gap-2">
              <Button
                disabled={loading || !canWrite}
                onClick={async () => {
                  setLoading(true);
                  setError(null);
                  try {
                    const { error } = await supabase
                      .from("petty_cash_settings")
                      .update({ low_balance_threshold: Number(settings?.low_balance_threshold ?? 0) })
                      .eq("id", 1);
                    if (error) throw new Error(error.message);
                    toast.success("บันทึกแล้ว");
                    setLoading(false);
                    await loadAll();
                  } catch (e: any) {
                    setLoading(false);
                    setError(e?.message ?? "บันทึกไม่สำเร็จ");
                  }
                }}
              >
                บันทึก
              </Button>
              <Button
                variant="outline"
                disabled={loading || !canWrite}
                onClick={async () => {
                  setLoading(true);
                  setError(null);
                  try {
                    const next = !Boolean(settings?.in_app_alert_enabled ?? true);
                    const { error } = await supabase.from("petty_cash_settings").update({ in_app_alert_enabled: next }).eq("id", 1);
                    if (error) throw new Error(error.message);
                    toast.success(next ? "เปิดแจ้งเตือนแล้ว" : "ปิดแจ้งเตือนแล้ว");
                    setLoading(false);
                    await loadAll();
                  } catch (e: any) {
                    setLoading(false);
                    setError(e?.message ?? "บันทึกไม่สำเร็จ");
                  }
                }}
              >
                {settings?.in_app_alert_enabled ? "ปิดแจ้งเตือน" : "เปิดแจ้งเตือน"}
              </Button>
            </div>
          </div>
          {!canWrite ? <div className="mt-3 text-xs text-gray-600">คุณมีสิทธิ์ดูข้อมูลเท่านั้น</div> : null}
        </div>

        <div className="rounded-xl border border-gray-200 bg-white p-4">
          <div className="text-sm font-semibold text-gray-900">หมวดหมู่</div>
          <div className="mt-1 text-xs text-gray-500">ใช้สำหรับจัดระเบียบรายการ “ใช้เงิน”</div>

          <div className="mt-3 flex flex-wrap gap-2">
            <Input placeholder="เพิ่มหมวดหมู่ใหม่" value={newCategory} onChange={(e) => setNewCategory(e.target.value)} disabled={loading || !canWrite} />
            <Button
              disabled={loading || !canWrite || !newCategory.trim()}
              onClick={async () => {
                setLoading(true);
                setError(null);
                try {
                  const { error } = await supabase.from("petty_cash_categories").insert({ name: newCategory.trim(), is_active: true, sort_order: 999 });
                  if (error) throw new Error(error.message);
                  setNewCategory("");
                  toast.success("เพิ่มหมวดหมู่แล้ว");
                  setLoading(false);
                  await loadAll();
                } catch (e: any) {
                  setLoading(false);
                  setError(e?.message ?? "เพิ่มไม่สำเร็จ");
                }
              }}
            >
              เพิ่ม
            </Button>
          </div>

          <div className="mt-3 overflow-hidden rounded-lg border border-gray-200">
            <div className="grid grid-cols-[1fr_0.7fr_0.6fr] gap-3 bg-gray-50 px-3 py-2 text-xs font-semibold text-gray-600">
              <div>ชื่อ</div>
              <div>สถานะ</div>
              <div className="text-right">จัดการ</div>
            </div>
            {categories.length === 0 ? <div className="p-4 text-sm text-gray-600">ยังไม่มีหมวดหมู่</div> : null}
            {categories.map((c) => (
              <div key={c.id} className="grid grid-cols-[1fr_0.7fr_0.6fr] gap-3 border-t border-gray-100 px-3 py-2 text-sm">
                <div className="text-gray-900">{c.name}</div>
                <div className="text-gray-700">{c.is_active ? "ใช้งาน" : "ปิด"}</div>
                <div className="flex justify-end gap-2">
                  <button
                    type="button"
                    className="text-sm font-medium text-gray-900 underline disabled:opacity-50"
                    disabled={loading || !canWrite}
                    onClick={async () => {
                      setLoading(true);
                      setError(null);
                      try {
                        const { error } = await supabase.from("petty_cash_categories").update({ is_active: !c.is_active }).eq("id", c.id);
                        if (error) throw new Error(error.message);
                        setLoading(false);
                        await loadAll();
                      } catch (e: any) {
                        setLoading(false);
                        setError(e?.message ?? "แก้ไขไม่สำเร็จ");
                      }
                    }}
                  >
                    {c.is_active ? "ปิด" : "เปิด"}
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

