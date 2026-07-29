"use client";

/**
 * Dashboard สำนักงานบัญชี — **หน้าเดียวของภาพรวมทั้งสำนักงาน**
 *
 * ยุบ "รายงานรวม" (/acc-firm/reports) เข้ามาเป็นแท็บในหน้านี้ (2026-07-29)
 * ข้อมูล 3 แหล่ง: /api/acc-firm/dashboard (KPI+บักเก็ตต่อลูกค้า) · /api/acc-firm/reports
 * (ใบแจ้งหนี้ที่ต้องตาม) · /api/acc-firm/tax-calendar (สถานะยื่นภาษีจริง)
 */

import { useEffect, useState, useCallback, useMemo } from "react";
import { useParams, useRouter } from "next/navigation";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { PageShell } from "@/components/ui/page-shell";
import { StatCard } from "@/components/ui/stat-card";
import { SegmentedControl } from "@/components/ui/segmented";
import { CustomSelect } from "@/components/ui/custom-select";
import { FilterBar, FilterClear } from "@/components/ui/filter-bar";
import { StatusBadge, type BadgeTone } from "@/components/ui/badge";
import { Text } from "@/components/ui/typography";
import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
  TableEmpty,
  TableLoading,
} from "@/components/ui/table";
import { TablePager, usePagination } from "@/components/ui/table-pager";
import {
  LayoutDashboard,
  Filter,
  Building2,
  Users,
  Wallet,
  AlertTriangle,
  Clock,
  FileText,
  CalendarDays,
  CheckSquare,
  CheckCircle2,
} from "lucide-react";
import type { ActionableInvoice } from "@/app/api/acc-firm/reports/route";
import type {
  TaxCalendarResponse,
  TaxFilingRow,
  TaxKind,
  FilingState,
} from "@/lib/acc-firm/tax-calendar";

// ── Types ─────────────────────────────────────────────────────────────────────
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

type TabKey = "clients" | "pending" | "calendar";

// ── Helpers ───────────────────────────────────────────────────────────────────
const TH_MONTH = [
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

/** เงินย่อ "฿1.2M" — ใช้เฉพาะการ์ด KPI ที่พื้นที่จำกัด */
function fmtK(n: number) {
  if (Math.abs(n) >= 1_000_000) return `฿${(n / 1_000_000).toFixed(1)}M`;
  if (Math.abs(n) >= 1_000) return `฿${(n / 1_000).toFixed(1)}K`;
  return `฿${n.toLocaleString("th-TH")}`;
}

/** เงินเต็ม "1,234.56 ฿" — ยอดลบ U+2212 */
function fmtMoney(v: number) {
  const sign = v < 0 ? "−" : "";
  return `${sign}${Math.abs(v).toLocaleString("th-TH", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })} ฿`;
}

function fmtDate(d: string | null) {
  if (!d) return "—";
  const [y, m, day] = d.split("-").map(Number);
  return `${day} ${TH_MONTH[m]} ${y + 543}`;
}

function fmtPeriod(year: number, month: number) {
  return `${TH_MONTH[month]} ${year + 543}`;
}

const BUCKET_CONFIG: Record<string, { label: string; tone: BadgeTone; icon: React.ReactNode }> = {
  overdue: { label: "เกินกำหนด", tone: "danger", icon: <AlertTriangle className="h-3 w-3" /> },
  due_soon: { label: "ใกล้ครบกำหนด", tone: "warning", icon: <Clock className="h-3 w-3" /> },
  draft: { label: "ฉบับร่าง", tone: "neutral", icon: <FileText className="h-3 w-3" /> },
  open: { label: "รอชำระ", tone: "info", icon: <CheckSquare className="h-3 w-3" /> },
};

const TAX_KIND_LABEL: Record<TaxKind, string> = {
  pp30: "ภ.พ.30",
  pnd1: "ภ.ง.ด.1",
  pnd3: "ภ.ง.ด.3",
  pnd53: "ภ.ง.ด.53",
};

const FILING_STATE_BADGE: Record<FilingState, { tone: BadgeTone; label: string }> = {
  done: { tone: "success", label: "ยื่นแล้ว" },
  ready: { tone: "warning", label: "พร้อมยื่น" },
  overdue: { tone: "danger", label: "เกินกำหนด" },
  pending: { tone: "neutral", label: "รอดำเนินการ" },
};

// ── Page ──────────────────────────────────────────────────────────────────────
export default function AccFirmDashboardPage() {
  const { orgSlug } = useParams<{ orgSlug: string }>();
  const router = useRouter();
  const supabase = useMemo(() => createSupabaseBrowserClient(), []);

  const [loading, setLoading] = useState(true);
  const [asOf, setAsOf] = useState("");
  const [summaries, setSummaries] = useState<ClientSummary[]>([]);
  const [actionable, setActionable] = useState<ActionableInvoice[]>([]);
  const [taxCalendar, setTaxCalendar] = useState<TaxCalendarResponse | null>(null);
  /** true = ข้อมูลที่ดึงมาชนเพดาน → ตัวเลขสรุปยังไม่ครบ ต้องเตือนผู้ใช้ */
  const [truncated, setTruncated] = useState(false);
  /** จำนวนลูกค้าในทะเบียนทั้งหมด — ใช้บอกว่าแดชบอร์ดครอบคลุมกี่รายจากทั้งหมด */
  const [registryCount, setRegistryCount] = useState<number | null>(null);

  const [tab, setTab] = useState<TabKey>("clients");
  const [showSummary, setShowSummary] = useState(true);
  const [showFilters, setShowFilters] = useState(false);
  const [filterBucket, setFilterBucket] = useState("");
  const [filterOrg, setFilterOrg] = useState("");

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
    const headers = { Authorization: `Bearer ${sess.session.access_token}` };

    const [dashRes, repRes, taxRes, regRes] = await Promise.all([
      fetch(`/api/acc-firm/dashboard?orgId=${org.id}`, { headers }),
      fetch(`/api/acc-firm/reports?orgId=${org.id}`, { headers }),
      fetch(`/api/acc-firm/tax-calendar?orgId=${org.id}`, { headers }),
      // ใช้เทียบว่า "ที่เห็นบนแดชบอร์ด" เป็นกี่รายจากทะเบียนทั้งหมด (กันเข้าใจผิดว่าเป็นภาพรวมทุกราย)
      fetch(`/api/acc-firm/service-clients?orgId=${org.id}`, { headers }),
    ]);
    if (regRes.ok) {
      const json = (await regRes.json()) as { clients?: unknown[] };
      setRegistryCount(json.clients?.length ?? 0);
    }
    let cut = false;
    if (dashRes.ok) {
      const json = await dashRes.json();
      setSummaries(json.summaries ?? []);
      setAsOf(json.asOf ?? "");
      cut = cut || !!json.truncated;
    }
    if (repRes.ok) {
      const json = await repRes.json();
      setActionable(json.actionableInvoices ?? []);
      cut = cut || !!json.truncated;
    }
    setTruncated(cut);
    if (taxRes.ok) setTaxCalendar((await taxRes.json()) as TaxCalendarResponse);
    setLoading(false);
  }, [supabase, orgSlug]);

  useEffect(() => {
    load();
  }, [load]);

  // ── รวมยอดทั้งสำนักงาน ─────────────────────────────────────────────────────
  const totals = useMemo(
    () =>
      summaries.reduce(
        (acc, s) => ({
          clients: acc.clients + 1,
          revenue: acc.revenue + s.kpi.revenue,
          expense: acc.expense + s.kpi.expense,
          overdueCount: acc.overdueCount + s.invoices.overdue.count,
          overdueAmount: acc.overdueAmount + s.invoices.overdue.amount,
        }),
        { clients: 0, revenue: 0, expense: 0, overdueCount: 0, overdueAmount: 0 },
      ),
    [summaries],
  );

  const dueSoonCount = useMemo(
    () => actionable.filter((i) => i.bucket === "due_soon").length,
    [actionable],
  );
  const taxOverdue = taxCalendar?.summary.overdue ?? 0;
  const taxPending = taxCalendar?.summary.pending ?? 0;

  const thMonth = useMemo(() => {
    if (!asOf) return "";
    const [y, m] = asOf.split("-").map(Number);
    return `${TH_MONTH[m]} ${y + 543}`;
  }, [asOf]);

  // ── แท็บ: ภาพรวมลูกค้า ─────────────────────────────────────────────────────
  const clientPager = usePagination(summaries, { resetKey: tab });

  // ── แท็บ: งานค้าง ──────────────────────────────────────────────────────────
  const orgOptions = useMemo(
    () => summaries.map((s) => ({ value: s.client_org.id, label: s.client_org.name })),
    [summaries],
  );
  const filteredActionable = useMemo(() => {
    let list = actionable;
    if (filterBucket) list = list.filter((i) => i.bucket === filterBucket);
    if (filterOrg) list = list.filter((i) => i.orgId === filterOrg);
    return list;
  }, [actionable, filterBucket, filterOrg]);
  const actionPager = usePagination(filteredActionable, {
    resetKey: `${filterBucket}${filterOrg}`,
  });
  const hasFilter = !!filterBucket || !!filterOrg;

  // ── แท็บ: ปฏิทินภาษี ───────────────────────────────────────────────────────
  const taxRows = taxCalendar?.rows ?? [];
  const taxPager = usePagination(taxRows, { resetKey: tab });

  return (
    <PageShell
      width="full"
      icon={<LayoutDashboard className="h-6 w-6" />}
      title="Dashboard"
      description={`ภาพรวมงานของสำนักงานบัญชี — เฉพาะลูกค้าที่เชื่อมระบบแล้ว${
        thMonth ? ` · ${thMonth}` : ""
      }`}
      actions={
        <>
          <Button
            variant={showSummary ? "secondary" : "outline"}
            size="icon"
            title={showSummary ? "ซ่อนการ์ดสรุป" : "แสดงการ์ดสรุป"}
            aria-expanded={showSummary}
            onClick={() => setShowSummary((v) => !v)}
          >
            <LayoutDashboard className="h-4 w-4" />
          </Button>
          {tab === "pending" && (
            <Button
              variant={showFilters || hasFilter ? "secondary" : "outline"}
              size="icon"
              title="ตัวกรอง"
              className="relative"
              onClick={() => setShowFilters((v) => !v)}
            >
              <Filter className="h-4 w-4" />
              {hasFilter && (
                <span className="absolute -right-0.5 -top-0.5 h-2 w-2 rounded-full bg-amber-500" />
              )}
            </Button>
          )}
        </>
      }
    >
      {/* KPI ทั้งสำนักงาน */}
      <div
        className={showSummary ? "grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4" : "hidden"}
      >
        <StatCard
          icon={<Building2 className="h-4 w-4" />}
          label="ลูกค้าที่เชื่อมระบบ"
          value={loading ? "…" : totals.clients.toLocaleString("th-TH")}
          sub={
            loading
              ? undefined
              : registryCount != null
                ? `จากทะเบียนทั้งหมด ${registryCount} ราย`
                : "กำลังดูแลอยู่"
          }
          tone="info"
        />
        <StatCard
          icon={<Wallet className="h-4 w-4" />}
          label={`รายได้ลูกค้ารวม${thMonth ? ` (${thMonth})` : ""}`}
          value={loading ? "…" : fmtK(totals.revenue)}
          sub={loading ? undefined : `ค่าใช้จ่ายรวม ${fmtK(totals.expense)}`}
          tone="positive"
          valueColored
        />
        <StatCard
          icon={<AlertTriangle className="h-4 w-4" />}
          label="ใบแจ้งหนี้เกินกำหนด"
          value={loading ? "…" : totals.overdueCount.toLocaleString("th-TH")}
          sub={
            loading
              ? undefined
              : totals.overdueAmount > 0
                ? `ยอดค้าง ${fmtMoney(totals.overdueAmount)}`
                : `ใกล้ครบกำหนดอีก ${dueSoonCount} ใบ`
          }
          tone={totals.overdueCount > 0 ? "negative" : "positive"}
          valueColored
        />
        <StatCard
          icon={<CalendarDays className="h-4 w-4" />}
          label="ภาษีเกินกำหนดยื่น"
          value={loading ? "…" : taxOverdue.toLocaleString("th-TH")}
          sub={loading ? undefined : `รอยื่นอีก ${taxPending} รายการ`}
          tone={taxOverdue > 0 ? "negative" : "info"}
          valueColored
        />
      </div>

      {truncated && (
        <div className="flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 p-3">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />
          <Text className="text-xs text-amber-800">
            ข้อมูลมีมากเกินกว่าที่ดึงมาได้ในครั้งเดียว — ตัวเลขสรุปด้านบน
            <span className="font-semibold">ยังไม่ครบทั้งหมด</span> ให้ดูรายงานของแต่ละลูกค้าประกอบ
          </Text>
        </div>
      )}

      <SegmentedControl<TabKey>
        value={tab}
        onChange={setTab}
        ariaLabel="มุมมองแดชบอร์ด"
        options={[
          { value: "clients", label: "ภาพรวมลูกค้า", icon: <Building2 className="h-4 w-4" /> },
          { value: "pending", label: "งานค้าง", icon: <AlertTriangle className="h-4 w-4" /> },
          { value: "calendar", label: "ปฏิทินภาษี", icon: <CalendarDays className="h-4 w-4" /> },
        ]}
      />

      {/* ── ภาพรวมลูกค้า ─────────────────────────────────────────────────────── */}
      {tab === "clients" && (
        <div className="space-y-3">
          <Table stickyHeader fillViewport>
            <TableHeader sticky>
              <TableRow>
                <TableHead>ลูกค้า</TableHead>
                <TableHead align="right">รายได้</TableHead>
                <TableHead align="right">ค่าใช้จ่าย</TableHead>
                <TableHead align="right">กำไร</TableHead>
                <TableHead align="center">เกินกำหนด</TableHead>
                <TableHead align="center">ใกล้ครบ</TableHead>
                <TableHead align="center">ฉบับร่าง</TableHead>
                <TableHead align="right">ยอดค้างชำระ</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                <TableLoading colSpan={8} />
              ) : summaries.length === 0 ? (
                <TableEmpty colSpan={8}>
                  ยังไม่มีลูกค้าที่เชื่อมระบบ
                  {registryCount ? ` (ทะเบียนมี ${registryCount} ราย)` : ""} —
                  เปิดการเชื่อมได้ในหน้า “ลูกค้า”
                </TableEmpty>
              ) : (
                clientPager.rows.map((s) => {
                  const net = s.kpi.revenue - s.kpi.expense;
                  return (
                    <TableRow
                      key={s.id}
                      clickable
                      onClick={() => router.push(`/${s.client_org.slug}/accounting`)}
                    >
                      <TableCell>
                        <p className="font-medium text-gray-800">{s.client_org.name}</p>
                        <p className="text-xs text-gray-400">{s.client_org.slug}</p>
                      </TableCell>
                      <TableCell align="right" tabular className="text-gray-800">
                        {fmtMoney(s.kpi.revenue)}
                      </TableCell>
                      <TableCell align="right" tabular className="text-gray-600">
                        {fmtMoney(s.kpi.expense)}
                      </TableCell>
                      <TableCell
                        align="right"
                        tabular
                        className={
                          net >= 0 ? "font-medium text-green-600" : "font-medium text-red-600"
                        }
                      >
                        {fmtMoney(net)}
                      </TableCell>
                      <TableCell align="center" tabular>
                        {s.invoices.overdue.count > 0 ? (
                          <span className="font-semibold text-red-600">
                            {s.invoices.overdue.count}
                          </span>
                        ) : (
                          <span className="text-gray-300">—</span>
                        )}
                      </TableCell>
                      <TableCell align="center" tabular>
                        {s.invoices.due_soon.count > 0 ? (
                          <span className="font-semibold text-amber-600">
                            {s.invoices.due_soon.count}
                          </span>
                        ) : (
                          <span className="text-gray-300">—</span>
                        )}
                      </TableCell>
                      <TableCell align="center" tabular>
                        {s.invoices.draft.count > 0 ? (
                          <span className="text-gray-600">{s.invoices.draft.count}</span>
                        ) : (
                          <span className="text-gray-300">—</span>
                        )}
                      </TableCell>
                      <TableCell align="right" tabular>
                        {s.invoices.overdue.amount > 0 ? (
                          <span className="font-medium text-red-600">
                            {fmtMoney(s.invoices.overdue.amount)}
                          </span>
                        ) : (
                          <span className="text-gray-300">—</span>
                        )}
                      </TableCell>
                    </TableRow>
                  );
                })
              )}
            </TableBody>
          </Table>
          {!loading && <TablePager pager={clientPager} unit="ราย" />}
        </div>
      )}

      {/* ── งานค้าง ──────────────────────────────────────────────────────────── */}
      {tab === "pending" && (
        <div className="space-y-3">
          {showFilters && (
            <FilterBar>
              <SegmentedControl
                value={filterBucket}
                onChange={setFilterBucket}
                ariaLabel="ประเภทงานค้าง"
                options={[
                  { value: "", label: "ทั้งหมด" },
                  { value: "overdue", label: "เกินกำหนด" },
                  { value: "due_soon", label: "ใกล้ครบกำหนด" },
                  { value: "draft", label: "ฉบับร่าง" },
                ]}
              />
              <CustomSelect
                value={filterOrg}
                onChange={setFilterOrg}
                options={[{ value: "", label: "ทุกลูกค้า" }, ...orgOptions]}
                className="w-48"
              />
              <FilterClear
                disabled={!hasFilter}
                onClick={() => {
                  setFilterBucket("");
                  setFilterOrg("");
                }}
              />
            </FilterBar>
          )}

          <Table stickyHeader fillViewport>
            <TableHeader sticky>
              <TableRow>
                <TableHead>สถานะ</TableHead>
                <TableHead>ลูกค้า</TableHead>
                <TableHead>เลขที่</TableHead>
                <TableHead>ผู้ซื้อ</TableHead>
                <TableHead>วันที่ออก</TableHead>
                <TableHead>ครบกำหนด</TableHead>
                <TableHead align="right">จำนวนเงิน</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                <TableLoading colSpan={7} />
              ) : filteredActionable.length === 0 ? (
                <TableEmpty colSpan={7}>ไม่มีงานค้างในขณะนี้</TableEmpty>
              ) : (
                actionPager.rows.map((inv) => {
                  const cfg = BUCKET_CONFIG[inv.bucket];
                  return (
                    <TableRow
                      key={inv.id}
                      clickable
                      onClick={() => router.push(`/${inv.orgSlug}/accounting/invoices`)}
                    >
                      <TableCell>
                        <StatusBadge tone={cfg.tone}>
                          {cfg.icon} {cfg.label}
                        </StatusBadge>
                      </TableCell>
                      <TableCell className="text-gray-800">{inv.orgName}</TableCell>
                      <TableCell className="font-mono text-xs text-gray-500">
                        {inv.invoiceNo ?? "—"}
                      </TableCell>
                      <TableCell className="max-w-[180px] truncate text-gray-700">
                        {inv.contactName}
                      </TableCell>
                      <TableCell className="text-gray-500">{fmtDate(inv.issueDate)}</TableCell>
                      <TableCell
                        className={
                          inv.bucket === "overdue"
                            ? "font-medium text-red-600"
                            : inv.bucket === "due_soon"
                              ? "font-medium text-amber-600"
                              : "text-gray-500"
                        }
                      >
                        {fmtDate(inv.dueDate)}
                      </TableCell>
                      <TableCell align="right" tabular className="font-medium text-gray-800">
                        {fmtMoney(inv.totalAmount)}
                      </TableCell>
                    </TableRow>
                  );
                })
              )}
            </TableBody>
          </Table>
          {!loading && <TablePager pager={actionPager} unit="ใบ" />}
        </div>
      )}

      {/* ── ปฏิทินภาษี ───────────────────────────────────────────────────────── */}
      {tab === "calendar" && (
        <div className="space-y-3">
          <div className={showSummary ? "grid grid-cols-2 gap-3 lg:grid-cols-4" : "hidden"}>
            <StatCard
              icon={<CheckCircle2 className="h-4 w-4" />}
              label="ยื่นแล้ว"
              value={loading ? "…" : String(taxCalendar?.summary.done ?? 0)}
              tone="positive"
            />
            <StatCard
              icon={<Clock className="h-4 w-4" />}
              label="พร้อมยื่น"
              value={loading ? "…" : String(taxCalendar?.summary.ready ?? 0)}
              tone="warning"
            />
            <StatCard
              icon={<AlertTriangle className="h-4 w-4" />}
              label="เกินกำหนด"
              value={loading ? "…" : String(taxOverdue)}
              tone="negative"
              valueColored
            />
            <StatCard
              icon={<CalendarDays className="h-4 w-4" />}
              label="รอดำเนินการ"
              value={loading ? "…" : String(taxPending)}
              tone="neutral"
            />
          </div>

          {!loading && taxRows.length === 0 ? (
            <div className="flex flex-col items-center justify-center rounded-xl border border-gray-200 bg-white py-16 text-center shadow-sm">
              <div className="mb-4 rounded-full bg-gray-100 p-4">
                <CalendarDays className="h-8 w-8 text-gray-400" />
              </div>
              <Text className="text-sm font-medium text-gray-900">ยังไม่มีรายการยื่นภาษี</Text>
              <Text className="mt-1 max-w-sm text-sm text-gray-500">
                เมื่อลูกค้าบันทึกแบบภาษี (ภ.พ.30 / ภ.ง.ด.) ในงวดนี้ สถานะจะแสดงที่นี่
              </Text>
              <Button
                size="sm"
                variant="outline"
                className="mt-4"
                onClick={() => router.push(`/${orgSlug}/acc-firm/clients`)}
              >
                <Users className="mr-1 h-4 w-4" /> ไปที่ทะเบียนลูกค้า
              </Button>
            </div>
          ) : (
            <>
              <Table stickyHeader fillViewport>
                <TableHeader sticky>
                  <TableRow>
                    <TableHead>ลูกค้า</TableHead>
                    <TableHead>ประเภทภาษี</TableHead>
                    <TableHead>งวด</TableHead>
                    <TableHead>กำหนดยื่น</TableHead>
                    <TableHead align="center">สถานะ</TableHead>
                    <TableHead align="right">จำนวนเงิน</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {loading ? (
                    <TableLoading colSpan={6} />
                  ) : (
                    taxPager.rows.map((r, i) => (
                      <TaxCalendarRow
                        key={`${r.orgId}-${r.taxKind}-${r.periodMonth}-${i}`}
                        row={r}
                        onOpen={() => router.push(`/${r.orgSlug}/accounting`)}
                      />
                    ))
                  )}
                </TableBody>
              </Table>
              {!loading && <TablePager pager={taxPager} unit="รายการ" />}
            </>
          )}
        </div>
      )}
    </PageShell>
  );
}

function TaxCalendarRow({ row, onOpen }: { row: TaxFilingRow; onOpen: () => void }) {
  const badge = FILING_STATE_BADGE[row.state];
  const amount = row.taxKind === "pp30" ? row.netPayable : row.whtTotal;
  return (
    <TableRow clickable onClick={onOpen}>
      <TableCell>
        <p className="font-medium text-gray-800">{row.orgName}</p>
        <p className="text-xs text-gray-400">{row.orgSlug}</p>
      </TableCell>
      <TableCell className="text-gray-700">{TAX_KIND_LABEL[row.taxKind]}</TableCell>
      <TableCell className="tabular-nums text-gray-600">
        {fmtPeriod(row.periodYear, row.periodMonth)}
      </TableCell>
      <TableCell className="tabular-nums text-gray-600">{fmtDate(row.dueDate)}</TableCell>
      <TableCell align="center">
        <StatusBadge tone={badge.tone}>{badge.label}</StatusBadge>
      </TableCell>
      <TableCell align="right" tabular>
        {amount != null ? fmtMoney(amount) : "—"}
      </TableCell>
    </TableRow>
  );
}
