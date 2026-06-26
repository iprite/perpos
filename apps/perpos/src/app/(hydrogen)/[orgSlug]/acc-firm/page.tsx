"use client";

import { useEffect, useState, useCallback, useMemo } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { PageShell } from "@/components/ui/page-shell";
import {
  LayoutDashboard,
  Calculator,
  ArrowRight,
  ArrowUpRight,
  Building2,
  BookOpenText,
  Users,
  CheckCircle2,
  Clock,
  AlertTriangle,
  TrendingUp,
  TrendingDown,
  FileText,
} from "lucide-react";

type InvoiceBucket = { count: number; amount: number };
type ClientSummary = {
  id: string;
  client_org: { id: string; name: string; slug: string };
  modules_managed: string[];
  status: string;
  invoices: {
    draft: InvoiceBucket;
    overdue: InvoiceBucket;
    due_soon: InvoiceBucket;
    open: InvoiceBucket;
  };
  kpi: { revenue: number; expense: number };
};

function fmtK(n: number) {
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1) + "M";
  if (n >= 1_000) return (n / 1_000).toFixed(1) + "K";
  return n.toLocaleString("th-TH");
}

function StatChip({
  icon,
  label,
  count,
  amount,
  variant = "default",
}: {
  icon: React.ReactNode;
  label: string;
  count: number;
  amount: number;
  variant?: "default" | "danger" | "warn" | "muted";
}) {
  const cls = {
    default: "bg-slate-50 text-slate-600 border-slate-100",
    danger: "bg-red-50  text-red-700  border-red-100",
    warn: "bg-amber-50 text-amber-700 border-amber-100",
    muted: "bg-gray-50  text-gray-500  border-gray-100",
  }[variant];
  if (count === 0) return null;
  return (
    <div className={`flex items-center gap-1.5 rounded-lg border px-2 py-1 text-xs ${cls}`}>
      {icon}
      <span className="font-medium">{label}</span>
      <span className="font-bold">{count}</span>
      {amount > 0 && <span className="opacity-70">฿{fmtK(amount)}</span>}
    </div>
  );
}

export default function AccFirmDashboardPage() {
  const { orgSlug } = useParams<{ orgSlug: string }>();
  const supabase = useMemo(() => createSupabaseBrowserClient(), []);

  const [orgId, setOrgId] = useState("");
  const [token, setToken] = useState("");
  const [summaries, setSummaries] = useState<ClientSummary[]>([]);
  const [asOf, setAsOf] = useState("");
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    const [{ data: org }, { data: sess }] = await Promise.all([
      supabase.from("organizations").select("id").eq("slug", orgSlug).single(),
      supabase.auth.getSession(),
    ]);
    if (!org || !sess.session) {
      setLoading(false);
      return;
    }
    const tok = sess.session.access_token;
    setOrgId(org.id);
    setToken(tok);

    const res = await fetch(`/api/acc-firm/dashboard?orgId=${org.id}`, {
      headers: { Authorization: `Bearer ${tok}` },
    });
    if (res.ok) {
      const json = await res.json();
      setSummaries(json.summaries ?? []);
      setAsOf(json.asOf ?? "");
    }
    setLoading(false);
  }, [supabase, orgSlug]);

  useEffect(() => {
    load();
  }, [load]);

  // ── Aggregate totals ───────────────────────────────────────────────────────
  const totals = useMemo(
    () =>
      summaries.reduce(
        (acc, s) => ({
          clients: acc.clients + 1,
          totalRevenue: acc.totalRevenue + s.kpi.revenue,
          totalExpense: acc.totalExpense + s.kpi.expense,
          draftCount: acc.draftCount + s.invoices.draft.count,
          overdueCount: acc.overdueCount + s.invoices.overdue.count,
          overdueAmount: acc.overdueAmount + s.invoices.overdue.amount,
        }),
        {
          clients: 0,
          totalRevenue: 0,
          totalExpense: 0,
          draftCount: 0,
          overdueCount: 0,
          overdueAmount: 0,
        },
      ),
    [summaries],
  );

  const thMonth = useMemo(() => {
    if (!asOf) return "";
    const [y, m] = asOf.split("-").map(Number);
    const TH = [
      "",
      "ม.ค.",
      "ก.พ.",
      "มี.ค.",
      "เม.ย.",
      "พ.ค.",
      "มิ.ย.",
      "ก.ค.",
      "ส.ค.",
      "ก.ย.",
      "ต.ค.",
      "พ.ย.",
      "ธ.ค.",
    ];
    return `${TH[m]} ${y + 543}`;
  }, [asOf]);

  return (
    <PageShell
      width="full"
      icon={<LayoutDashboard className="h-6 w-6" />}
      title="Dashboard"
      description={`สำนักงานบัญชี — ภาพรวม client orgs${thMonth ? ` · ${thMonth}` : ""}`}
      actions={
        <>
          <Link href={`/${orgSlug}/acc-firm/ocr`}>
            <Button
              size="sm"
              variant="outline"
              className="gap-1.5 border-teal-200 text-teal-700 hover:bg-teal-50"
            >
              <FileText className="h-3.5 w-3.5" /> ตรวจทานบิล AI (OCR)
            </Button>
          </Link>
          <Link href={`/${orgSlug}/acc-firm/clients`}>
            <Button size="sm" className="gap-1.5">
              <Calculator className="h-3.5 w-3.5" /> จัดการ Clients
            </Button>
          </Link>
        </>
      }
    >
      {/* ── Summary stat cards ────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <div className="flex items-start gap-3 rounded-xl border border-teal-100 bg-teal-50 p-4">
          <Building2 className="mt-0.5 h-5 w-5 shrink-0 text-teal-500" />
          <div>
            <p className="text-xs font-medium text-slate-500">Client ทั้งหมด</p>
            <p className="text-2xl font-bold text-slate-800">{loading ? "…" : totals.clients}</p>
            <p className="mt-0.5 text-xs text-slate-400">active orgs</p>
          </div>
        </div>

        <div className="flex items-start gap-3 rounded-xl border border-green-100 bg-green-50 p-4">
          <TrendingUp className="mt-0.5 h-5 w-5 shrink-0 text-green-500" />
          <div>
            <p className="text-xs font-medium text-slate-500">รายได้รวม (เดือนนี้)</p>
            <p className="text-2xl font-bold text-slate-800">
              {loading ? "…" : `฿${fmtK(totals.totalRevenue)}`}
            </p>
            <p className="mt-0.5 text-xs text-slate-400">ทุก client</p>
          </div>
        </div>

        <div className="flex items-start gap-3 rounded-xl border border-amber-100 bg-amber-50 p-4">
          <TrendingDown className="mt-0.5 h-5 w-5 shrink-0 text-amber-500" />
          <div>
            <p className="text-xs font-medium text-slate-500">ค่าใช้จ่ายรวม (เดือนนี้)</p>
            <p className="text-2xl font-bold text-slate-800">
              {loading ? "…" : `฿${fmtK(totals.totalExpense)}`}
            </p>
            <p className="mt-0.5 text-xs text-slate-400">ทุก client</p>
          </div>
        </div>

        <div className="flex items-start gap-3 rounded-xl border border-red-100 bg-red-50 p-4">
          <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-red-500" />
          <div>
            <p className="text-xs font-medium text-slate-500">Invoice เกินกำหนด</p>
            <p className="text-2xl font-bold text-slate-800">
              {loading ? "…" : totals.overdueCount}
            </p>
            <p className="mt-0.5 text-xs text-slate-400">
              {totals.overdueAmount > 0 ? `฿${fmtK(totals.overdueAmount)}` : "ไม่มี"}
            </p>
          </div>
        </div>
      </div>

      {/* ── Per-client cards ──────────────────────────────────────────────── */}
      <div>
        <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold text-slate-700">
          <Calculator className="h-4 w-4 text-slate-400" />
          รายละเอียดต่อ Client
        </h2>

        {loading ? (
          <div className="rounded-xl border bg-white p-8 text-center text-sm text-slate-400">
            กำลังโหลด…
          </div>
        ) : summaries.length === 0 ? (
          <div className="space-y-2 rounded-xl border bg-white p-8 text-center text-sm text-slate-300">
            <Building2 className="mx-auto h-8 w-8 text-slate-200" />
            <p>ยังไม่มี active client org</p>
            <Link href={`/${orgSlug}/acc-firm/clients`}>
              <Button size="sm" variant="outline" className="mt-2">
                เพิ่ม Client Org
              </Button>
            </Link>
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
            {summaries.map((s) => {
              const hasOverdue = s.invoices.overdue.count > 0;
              const hasDueSoon = s.invoices.due_soon.count > 0;
              const netProfit = s.kpi.revenue - s.kpi.expense;
              const netPositive = netProfit >= 0;

              return (
                <div
                  key={s.id}
                  className={`space-y-3 rounded-xl border bg-white p-4 transition-shadow hover:shadow-sm ${
                    hasOverdue ? "border-red-200" : ""
                  }`}
                >
                  {/* Card header */}
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex min-w-0 items-center gap-2.5">
                      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-teal-100 bg-teal-50">
                        <Building2 className="h-4 w-4 text-teal-500" />
                      </div>
                      <div className="min-w-0">
                        <p className="truncate font-semibold text-slate-800">{s.client_org.name}</p>
                        <p className="text-xs text-slate-400">{s.client_org.slug}</p>
                      </div>
                    </div>

                    {/* Quick-open links */}
                    <div className="flex shrink-0 gap-1">
                      {s.modules_managed.includes("accounting") && (
                        <Link href={`/${s.client_org.slug}/accounting`} target="_blank">
                          <Button size="sm" variant="outline" className="h-7 gap-1 px-2 text-xs">
                            <BookOpenText className="h-3.5 w-3.5" />
                            บัญชี
                            <ArrowUpRight className="h-3 w-3" />
                          </Button>
                        </Link>
                      )}
                      {s.modules_managed.includes("hrm") && (
                        <Link href={`/${s.client_org.slug}/hrm`} target="_blank">
                          <Button size="sm" variant="outline" className="h-7 gap-1 px-2 text-xs">
                            <Users className="h-3.5 w-3.5" />
                            HR
                            <ArrowUpRight className="h-3 w-3" />
                          </Button>
                        </Link>
                      )}
                    </div>
                  </div>

                  {/* KPI row */}
                  <div className="grid grid-cols-3 gap-2 text-center">
                    <div className="rounded-lg bg-green-50 px-2 py-1.5">
                      <p className="text-xs text-slate-500">รายได้</p>
                      <p className="text-sm font-bold text-green-700">฿{fmtK(s.kpi.revenue)}</p>
                    </div>
                    <div className="rounded-lg bg-amber-50 px-2 py-1.5">
                      <p className="text-xs text-slate-500">ค่าใช้จ่าย</p>
                      <p className="text-sm font-bold text-amber-700">฿{fmtK(s.kpi.expense)}</p>
                    </div>
                    <div
                      className={`rounded-lg px-2 py-1.5 ${netPositive ? "bg-blue-50" : "bg-red-50"}`}
                    >
                      <p className="text-xs text-slate-500">กำไร</p>
                      <p
                        className={`text-sm font-bold ${netPositive ? "text-blue-700" : "text-red-600"}`}
                      >
                        {netPositive ? "" : "-"}฿{fmtK(Math.abs(netProfit))}
                      </p>
                    </div>
                  </div>

                  {/* Invoice status chips */}
                  <div className="flex flex-wrap gap-1.5">
                    <StatChip
                      icon={<AlertTriangle className="h-3 w-3" />}
                      label="เกินกำหนด"
                      count={s.invoices.overdue.count}
                      amount={s.invoices.overdue.amount}
                      variant="danger"
                    />
                    <StatChip
                      icon={<Clock className="h-3 w-3" />}
                      label="ใกล้ครบกำหนด"
                      count={s.invoices.due_soon.count}
                      amount={s.invoices.due_soon.amount}
                      variant="warn"
                    />
                    <StatChip
                      icon={<FileText className="h-3 w-3" />}
                      label="Draft"
                      count={s.invoices.draft.count}
                      amount={s.invoices.draft.amount}
                      variant="muted"
                    />
                    <StatChip
                      icon={<CheckCircle2 className="h-3 w-3" />}
                      label="Open"
                      count={s.invoices.open.count}
                      amount={s.invoices.open.amount}
                      variant="default"
                    />
                    {s.invoices.overdue.count === 0 &&
                      s.invoices.due_soon.count === 0 &&
                      s.invoices.draft.count === 0 &&
                      s.invoices.open.count === 0 && (
                        <span className="text-xs italic text-slate-300">
                          ไม่มี invoice ค้างอยู่
                        </span>
                      )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* ── Bottom quick links ────────────────────────────────────────────── */}
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <Link
          href={`/${orgSlug}/acc-firm/ocr`}
          className="group flex items-center justify-between rounded-xl border bg-white p-4 transition-all hover:border-teal-300 hover:shadow-sm"
        >
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg border border-teal-100 bg-teal-50">
              <FileText className="h-5 w-5 text-teal-600" />
            </div>
            <div>
              <p className="text-sm font-semibold text-slate-800">ระบบบันทึกบัญชีอัจฉริยะ (OCR)</p>
              <p className="text-xs text-slate-400">ตรวจทาน ตรวจสอบคู่บัญชี และอนุมัติเอกสาร AI</p>
            </div>
          </div>
          <ArrowRight className="h-4 w-4 text-slate-300 transition-colors group-hover:text-teal-400" />
        </Link>

        <Link
          href={`/${orgSlug}/acc-firm/clients`}
          className="group flex items-center justify-between rounded-xl border bg-white p-4 transition-all hover:border-teal-300 hover:shadow-sm"
        >
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-teal-100">
              <Calculator className="h-5 w-5 text-teal-600" />
            </div>
            <div>
              <p className="text-sm font-semibold text-slate-800">จัดการ Client Orgs</p>
              <p className="text-xs text-slate-400">เพิ่ม / แก้ไข / ดูรายละเอียด engagement</p>
            </div>
          </div>
          <ArrowRight className="h-4 w-4 text-slate-300 transition-colors group-hover:text-teal-400" />
        </Link>
      </div>
    </PageShell>
  );
}
