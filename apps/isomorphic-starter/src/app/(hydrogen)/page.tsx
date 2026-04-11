"use client";

import React, { useCallback, useMemo, useState } from "react";
import { Title, Text } from "rizzui/typography";

import { MonthlyOrdersSection } from "@/app/shared/dashboard/monthly-orders-section";
import { MonthlyPoaPaymentsSection } from "@/app/shared/dashboard/monthly-poa-payments-section";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";

type Stats = {
  expiring30: number;
  expired: number;
  ordersPending: number;
  poaSubmitted: number;
  ordersTotal: number;
  ordersClosed: number;
  ordersOpen: number;
  poaReceivedThisMonth: number;
};

function StatCard({ title, value, hint }: { title: string; value: string; hint?: string }) {
  return (
    <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
      <div className="text-sm text-gray-500">{title}</div>
      <div className="mt-2 text-2xl font-semibold text-gray-900">{value}</div>
      {hint ? <div className="mt-1 text-xs text-gray-500">{hint}</div> : null}
    </div>
  );
}

export default function DashboardPage() {
  const supabase = useMemo(() => createSupabaseBrowserClient(), []);

  const [loading, setLoading] = useState(false);
  const [stats, setStats] = useState<Stats | null>(null);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(() => {
    Promise.resolve().then(async () => {
      setLoading(true);
      setError(null);
      try {

        const today = new Date();
        const yyyy = today.getFullYear();
        const mm = String(today.getMonth() + 1).padStart(2, "0");
        const dd = String(today.getDate()).padStart(2, "0");
        const todayStr = `${yyyy}-${mm}-${dd}`;
        const in30 = new Date(today);
        in30.setDate(in30.getDate() + 30);
        const in30Str = `${in30.getFullYear()}-${String(in30.getMonth() + 1).padStart(2, "0")}-${String(in30.getDate()).padStart(2, "0")}`;

        const startThisMonth = new Date(today.getFullYear(), today.getMonth(), 1);
        const startThisMonthStr = startThisMonth.toISOString().slice(0, 10);
        const startNextMonth = new Date(today.getFullYear(), today.getMonth() + 1, 1);
        const startNextMonthStr = startNextMonth.toISOString().slice(0, 10);

        const [expiringRes, expiredRes, ordersPendingRes, poaRes, ordersTotalRes, ordersClosedRes, poaPaymentsRes] = await Promise.all([
          supabase
            .from("worker_documents")
            .select("id", { count: "exact" })
            .gte("expiry_date", todayStr)
            .lte("expiry_date", in30Str)
            .range(0, 0),
          supabase
            .from("worker_documents")
            .select("id", { count: "exact" })
            .lt("expiry_date", todayStr)
            .range(0, 0),
          supabase
            .from("orders")
            .select("id", { count: "exact" })
            .eq("status", "pending_approval"),
          supabase
            .from("poa_requests")
            .select("id", { count: "exact" })
            .eq("status", "submitted"),
          supabase.from("orders").select("id", { count: "exact" }).range(0, 0),
          supabase
            .from("orders")
            .select("id", { count: "exact" })
            .in("status", ["completed", "cancelled"])
            .range(0, 0),
          supabase
            .from("poa_item_payments")
            .select("amount,paid_date", { count: "estimated" })
            .eq("status", "confirmed")
            .gte("paid_date", startThisMonthStr)
            .lt("paid_date", startNextMonthStr)
            .order("paid_date", { ascending: true }),
        ]);

        const firstError = expiringRes.error ?? expiredRes.error ?? ordersPendingRes.error ?? poaRes.error;
        if (firstError) {
          setError(firstError.message);
          setStats(null);
          setLoading(false);
          return;
        }

        const ordersTotal = ordersTotalRes.error ? 0 : (ordersTotalRes.count ?? 0);
        const ordersClosed = ordersClosedRes.error ? 0 : (ordersClosedRes.count ?? 0);
        const ordersOpen = Math.max(0, ordersTotal - ordersClosed);

        const poaReceivedThisMonth = poaPaymentsRes.error
          ? 0
          : ((poaPaymentsRes.data ?? []) as Array<{ amount: number | string | null }>).reduce((sum, r) => {
              const n = Number(r.amount ?? 0);
              return sum + (Number.isFinite(n) ? n : 0);
            }, 0);

        setStats({
          expiring30: expiringRes.count ?? 0,
          expired: expiredRes.count ?? 0,
          ordersPending: ordersPendingRes.count ?? 0,
          poaSubmitted: poaRes.count ?? 0,
          ordersTotal,
          ordersClosed,
          ordersOpen,
          poaReceivedThisMonth,
        });
        setLoading(false);
      } catch (e: any) {
        setError(e?.message ?? "โหลดข้อมูลไม่สำเร็จ");
        setStats(null);
        setLoading(false);
      }
    });
  }, [supabase]);

  return (
    <div>
      <div className="flex flex-col justify-between gap-3 md:flex-row md:items-end">
        <div>
          <Title as="h1" className="text-lg font-semibold text-gray-900">
            แดชบอร์ด
          </Title>
          <Text className="mt-1 text-sm text-gray-600">สรุปเอกสารใกล้หมดอายุและงานค้างในระบบ</Text>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            className="h-9 rounded-md border border-gray-200 bg-white px-3 text-sm font-medium text-gray-700 hover:bg-gray-50"
            onClick={() => refresh()}
            disabled={loading}
          >
            รีเฟรช
          </button>
        </div>
      </div>

      {error ? <div className="mt-4 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">{error}</div> : null}

      <MonthlyOrdersSection poaReceivedThisMonth={stats?.poaReceivedThisMonth} />

      <MonthlyPoaPaymentsSection />

      <div className="mt-5 grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-4">
        <StatCard
          title="เอกสารหมดอายุภายใน 30 วัน"
          value={loading || !stats ? "-" : stats.expiring30.toLocaleString()}
          hint="จาก worker_documents"
        />
        <StatCard title="เอกสารหมดอายุแล้ว" value={loading || !stats ? "-" : stats.expired.toLocaleString()} />
        <StatCard title="คำสั่งซื้อรออนุมัติ" value={loading || !stats ? "-" : stats.ordersPending.toLocaleString()} />
        <StatCard title="คำขอ POA ส่งแล้ว" value={loading || !stats ? "-" : stats.poaSubmitted.toLocaleString()} />
      </div>
    </div>
  );
}
