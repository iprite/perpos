"use client";

import React, { useCallback, useEffect, useMemo, useState } from "react";
import { Title, Text } from "rizzui/typography";
import { ClipboardList, DollarSign, Users } from "lucide-react";

import { MonthlyOrdersSection } from "@/app/shared/dashboard/monthly-orders-section";
import { MonthlyPoaPaymentsSection } from "@/app/shared/dashboard/monthly-poa-payments-section";
import { useAuth } from "@/app/shared/auth-provider";
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

function moneyTHB(v: number) {
  return v.toLocaleString("th-TH", { style: "currency", currency: "THB", maximumFractionDigits: 0 });
}

function EmployerKpiCard({
  title,
  value,
  hint,
  loading,
  icon,
}: {
  title: string;
  value: string;
  hint: string;
  loading: boolean;
  icon: React.ReactNode;
}) {
  return (
    <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="text-sm font-medium text-gray-600">{title}</div>
          <div className="mt-2">
            {loading ? <div className="h-9 w-32 animate-pulse rounded-md bg-gray-100" /> : <div className="text-3xl font-semibold text-gray-900">{value}</div>}
          </div>
          <div className="mt-2 text-xs text-gray-500">{hint}</div>
        </div>
        <div className="flex h-10 w-10 items-center justify-center rounded-lg border border-gray-200 bg-gray-50 text-gray-700">{icon}</div>
      </div>
    </div>
  );
}

export default function DashboardPage() {
  const { envError, loading: authLoading, role, userId } = useAuth();
  const supabase = useMemo(() => createSupabaseBrowserClient(), []);

  const [loading, setLoading] = useState(false);
  const [stats, setStats] = useState<Stats | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [empLoading, setEmpLoading] = useState(false);
  const [empError, setEmpError] = useState<string | null>(null);
  const [empKpis, setEmpKpis] = useState<{
    ordersCount: number;
    workersCount: number;
    totalSpend: number;
    outstanding: number;
  } | null>(null);

  const refresh = useCallback(() => {
    Promise.resolve().then(async () => {
      if (envError) {
        setError(envError);
        setStats(null);
        setEmpError(envError);
        setEmpKpis(null);
        setLoading(false);
        setEmpLoading(false);
        return;
      }
      if (!userId) return;
      if (!role) return;

      if (role === "employer") {
        setEmpLoading(true);
        setEmpError(null);
        try {
          const [ordersRes, workersRes] = await Promise.all([
            supabase
              .from("orders")
              .select("id", { count: "exact" })
              .neq("status", "draft")
              .range(0, 0),
            supabase.from("workers").select("id", { count: "exact" }).range(0, 0),
          ]);

          const firstError = ordersRes.error ?? workersRes.error;
          if (firstError) {
            setEmpError(firstError.message);
            setEmpKpis(null);
            setEmpLoading(false);
            return;
          }

          let totalSpend = 0;
          let outstanding = 0;
          const pageSize = 1000;
          for (let offset = 0; ; offset += pageSize) {
            const ordersMoneyRes = await supabase
              .from("orders")
              .select("total,remaining_amount")
              .not("status", "in", '("draft","rejected","cancelled")')
              .order("id", { ascending: true })
              .range(offset, offset + pageSize - 1);

            if (ordersMoneyRes.error) {
              setEmpError(ordersMoneyRes.error.message);
              setEmpKpis(null);
              setEmpLoading(false);
              return;
            }

            const rows = (ordersMoneyRes.data ?? []) as Array<{ total: number | string | null; remaining_amount: number | string | null }>;
            for (const r of rows) {
              const totalN = Number(r.total ?? 0);
              if (Number.isFinite(totalN)) totalSpend += totalN;

              const remainingN = Number(r.remaining_amount ?? 0);
              if (Number.isFinite(remainingN)) outstanding += remainingN;
            }

            if (rows.length < pageSize) break;
          }

          setEmpKpis({
            ordersCount: ordersRes.count ?? 0,
            workersCount: workersRes.count ?? 0,
            totalSpend,
            outstanding,
          });
          setEmpLoading(false);
          return;
        } catch (e: any) {
          setEmpError(e?.message ?? "โหลดข้อมูลไม่สำเร็จ");
          setEmpKpis(null);
          setEmpLoading(false);
          return;
        }
      }

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
            .eq("status", "pending_approval")
            .range(0, 0),
          supabase
            .from("poa_requests")
            .select("id", { count: "exact" })
            .eq("status", "submitted")
            .range(0, 0),
          supabase.from("orders").select("id", { count: "exact" }).range(0, 0),
          supabase
            .from("orders")
            .select("id", { count: "exact" })
            .in("status", ["completed", "cancelled"])
            .range(0, 0),
          supabase
            .from("payment_transactions")
            .select("amount,txn_date", { count: "estimated" })
            .eq("txn_type", "INCOME")
            .eq("source_type", "AGENT_POA")
            .gte("txn_date", startThisMonthStr)
            .lt("txn_date", startNextMonthStr),
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
  }, [envError, role, supabase, userId]);

  useEffect(() => {
    if (authLoading) return;
    if (!userId) return;
    if (!role) return;
    refresh();
  }, [authLoading, refresh, role, userId]);

  return (
    <div>
      <div className="flex flex-col justify-between gap-3 md:flex-row md:items-end">
        <div>
          <Title as="h1" className="text-lg font-semibold text-gray-900">
            แดชบอร์ด
          </Title>
          <Text className="mt-1 text-sm text-gray-600">
            {role === "employer" ? "สรุปออเดอร์ แรงงาน ยอดใช้บริการ และยอดค้างชำระ" : "สรุปเอกสารใกล้หมดอายุและงานค้างในระบบ"}
          </Text>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            className="h-9 rounded-md border border-gray-200 bg-white px-3 text-sm font-medium text-gray-700 hover:bg-gray-50"
            onClick={() => refresh()}
            disabled={authLoading || !userId || !role || (role === "employer" ? empLoading : loading)}
          >
            รีเฟรช
          </button>
        </div>
      </div>

      {!role ? (
        <div className="mt-4 rounded-xl border border-gray-200 bg-white p-6">
          <Title as="h2" className="text-base font-semibold text-gray-900">
            กำลังโหลดสิทธิ์ผู้ใช้…
          </Title>
          <Text className="mt-2 text-sm text-gray-600">กรุณารอสักครู่</Text>
        </div>
      ) : role === "employer" ? (
        <>
          {empError ? <div className="mt-4 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">{empError}</div> : null}

          <div className="mt-5 grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-4">
            <EmployerKpiCard
              title="จำนวนออเดอร์"
              value={(empKpis?.ordersCount ?? 0).toLocaleString()}
              hint="ทั้งหมด (ไม่นับ draft)"
              loading={empLoading || !empKpis}
              icon={<ClipboardList className="h-5 w-5" />}
            />
            <EmployerKpiCard
              title="จำนวนแรงงาน"
              value={(empKpis?.workersCount ?? 0).toLocaleString()}
              hint="ทั้งหมด (ตามสิทธิ์ของนายจ้าง)"
              loading={empLoading || !empKpis}
              icon={<Users className="h-5 w-5" />}
            />
            <EmployerKpiCard
              title="ยอดใช้บริการรวม"
              value={moneyTHB(empKpis?.totalSpend ?? 0)}
              hint="ทั้งหมด (จาก orders.total)"
              loading={empLoading || !empKpis}
              icon={<DollarSign className="h-5 w-5" />}
            />
            <EmployerKpiCard
              title="ยอดค้างชำระ"
              value={moneyTHB(empKpis?.outstanding ?? 0)}
              hint="รวมยอดคงเหลือของแต่ละออเดอร์ (orders.remaining_amount)"
              loading={empLoading || !empKpis}
              icon={<DollarSign className="h-5 w-5" />}
            />
          </div>
        </>
      ) : (
        <>
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
        </>
      )}
    </div>
  );
}
