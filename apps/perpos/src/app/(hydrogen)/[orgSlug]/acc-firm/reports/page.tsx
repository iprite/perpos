"use client";

import { useEffect, useState, useCallback, useMemo } from "react";
import { useParams, useRouter } from "next/navigation";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import cn from "@core/utils/class-names";
import { Button } from "@/components/ui/button";
import { CustomSelect } from "@/components/ui/custom-select";
import { PageShell } from "@/components/ui/page-shell";
import { StatCard } from "@/components/ui/stat-card";
import { StatusBadge, type BadgeTone } from "@/components/ui/badge";
import { Text } from "@/components/ui/typography";
import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
  TableLoading,
} from "@/components/ui/table";
import {
  BarChart3,
  AlertTriangle,
  Clock,
  FileText,
  Building2,
  CalendarDays,
  CheckSquare,
  CheckCircle2,
} from "lucide-react";
import type { ActionableInvoice, ClientSummaryRow } from "@/app/api/acc-firm/reports/route";
import type {
  TaxCalendarResponse,
  TaxFilingRow,
  TaxKind,
  FilingState,
} from "@/lib/acc-firm/tax-calendar";

// ── Helpers ────────────────────────────────────────────────────────────────────
function fmtK(n: number) {
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1) + "M";
  if (n >= 1_000) return (n / 1_000).toFixed(1) + "K";
  return n.toLocaleString("th-TH");
}

function fmtDate(d: string | null) {
  if (!d) return "—";
  const [y, m, day] = d.split("-").map(Number);
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
  return `${day} ${TH[m]} ${y + 543}`;
}

const BUCKET_CONFIG: Record<string, { label: string; tone: BadgeTone; icon: React.ReactNode }> = {
  overdue: { label: "เกินกำหนด", tone: "danger", icon: <AlertTriangle className="h-3 w-3" /> },
  due_soon: { label: "ใกล้ครบกำหนด", tone: "warning", icon: <Clock className="h-3 w-3" /> },
  draft: { label: "Draft", tone: "neutral", icon: <FileText className="h-3 w-3" /> },
  open: { label: "Open", tone: "info", icon: <CheckSquare className="h-3 w-3" /> },
};

// ── Tax calendar helpers (F1 — สถานะการยื่นจริงจาก acc_tax_filings) ──────────────
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

/** งวด (เดือน/ปี พ.ศ.) แบบสั้น */
function fmtPeriod(year: number, month: number) {
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
  return `${TH[month]} ${year + 543}`;
}

/** เงินเต็ม "1,234.56 ฿" — ยอดลบ U+2212 */
function fmtMoney(v: number) {
  const sign = v < 0 ? "−" : "";
  return `${sign}${Math.abs(v).toLocaleString("th-TH", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })} ฿`;
}

// ── Main page ──────────────────────────────────────────────────────────────────
export default function AccFirmReportsPage() {
  const { orgSlug } = useParams<{ orgSlug: string }>();
  const router = useRouter();
  const supabase = useMemo(() => createSupabaseBrowserClient(), []);

  const [orgId, setOrgId] = useState("");
  const [loading, setLoading] = useState(true);
  const [actionable, setActionable] = useState<ActionableInvoice[]>([]);
  const [clientSummary, setClientSummary] = useState<ClientSummaryRow[]>([]);
  const [asOf, setAsOf] = useState("");
  const [tab, setTab] = useState<"pending" | "calendar" | "summary">("pending");
  const [filterBucket, setFilterBucket] = useState<string>("");
  const [filterOrg, setFilterOrg] = useState<string>("");
  // F1: ปฏิทินภาษีจาก acc_tax_filings (สถานะจริง)
  const [taxCalendar, setTaxCalendar] = useState<TaxCalendarResponse | null>(null);

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
    setOrgId(org.id);
    const tok = sess.session.access_token;
    const headers = { Authorization: `Bearer ${tok}` };

    const [res, taxRes] = await Promise.all([
      fetch(`/api/acc-firm/reports?orgId=${org.id}`, { headers }),
      fetch(`/api/acc-firm/tax-calendar?orgId=${org.id}`, { headers }),
    ]);
    if (res.ok) {
      const json = await res.json();
      setActionable(json.actionableInvoices ?? []);
      setClientSummary(json.clientSummary ?? []);
      setAsOf(json.asOf ?? "");
    }
    if (taxRes.ok) {
      setTaxCalendar((await taxRes.json()) as TaxCalendarResponse);
    }
    setLoading(false);
  }, [supabase, orgSlug]);

  useEffect(() => {
    load();
  }, [load]);

  // Filtered actionable invoices
  const filteredActionable = useMemo(() => {
    let list = actionable;
    if (filterBucket) list = list.filter((i) => i.bucket === filterBucket);
    if (filterOrg) list = list.filter((i) => i.orgId === filterOrg);
    return list;
  }, [actionable, filterBucket, filterOrg]);

  // Totals
  const totals = useMemo(
    () => ({
      overdue: actionable.filter((i) => i.bucket === "overdue").length,
      overdueAmount: actionable
        .filter((i) => i.bucket === "overdue")
        .reduce((s, i) => s + i.totalAmount, 0),
      due_soon: actionable.filter((i) => i.bucket === "due_soon").length,
      draft: actionable.filter((i) => i.bucket === "draft").length,
      // ภาษีเกินกำหนด (สถานะจริง) — แทน "Tax deadline 14 วัน" ลม ๆ เดิม
      taxOverdue: taxCalendar?.summary.overdue ?? 0,
      taxPending: taxCalendar?.summary.pending ?? 0,
    }),
    [actionable, taxCalendar],
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

  const orgOptions = useMemo(
    () => clientSummary.map((c) => ({ value: c.orgId, label: c.orgName })),
    [clientSummary],
  );

  return (
    <PageShell
      width="full"
      icon={<BarChart3 className="h-6 w-6" />}
      title="รายงานรวม"
      description={`ภาพรวมงานค้างและ deadline ภาษีข้าม client orgs${thMonth ? ` · ${thMonth}` : ""}`}
    >
      {/* KPI strip */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard
          icon={<AlertTriangle className="h-4 w-4" />}
          label="Invoice เกินกำหนด"
          value={loading ? "…" : String(totals.overdue)}
          sub={loading ? undefined : `ยอดค้าง ${fmtMoney(totals.overdueAmount)}`}
          tone="negative"
          valueColored
        />
        <StatCard
          icon={<Clock className="h-4 w-4" />}
          label="ใกล้ครบกำหนด"
          value={loading ? "…" : String(totals.due_soon)}
          tone="warning"
        />
        <StatCard
          icon={<FileText className="h-4 w-4" />}
          label="Draft invoices"
          value={loading ? "…" : String(totals.draft)}
          tone="neutral"
        />
        <StatCard
          icon={<CalendarDays className="h-4 w-4" />}
          label="ภาษีเกินกำหนด"
          value={loading ? "…" : String(totals.taxOverdue)}
          sub={loading ? undefined : `รอยื่นอีก ${totals.taxPending} รายการ`}
          tone={totals.taxOverdue > 0 ? "negative" : "info"}
          valueColored
        />
      </div>

      {/* Tabs (§4 — row เดียว ล้นแล้วเลื่อน) */}
      <div className="flex gap-1.5 overflow-x-auto rounded-xl border border-gray-200 bg-white p-1.5 shadow-sm [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {(
          [
            { key: "pending", label: "งานค้าง", icon: <AlertTriangle className="h-4 w-4" /> },
            { key: "calendar", label: "ปฏิทินภาษี", icon: <CalendarDays className="h-4 w-4" /> },
            { key: "summary", label: "สรุปต่อ Client", icon: <Building2 className="h-4 w-4" /> },
          ] as const
        ).map((t) => (
          <Button
            key={t.key}
            size="sm"
            variant={tab === t.key ? "secondary" : "ghost"}
            className={cn(
              "shrink-0 whitespace-nowrap",
              tab === t.key && "bg-gray-100 text-gray-900",
            )}
            onClick={() => setTab(t.key)}
          >
            <span className="mr-1.5">{t.icon}</span>
            {t.label}
          </Button>
        ))}
      </div>

      {/* ── Tab: งานค้าง ─────────────────────────────────────────────────────── */}
      {tab === "pending" && (
        <div className="space-y-3">
          {/* Filters */}
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs text-slate-400">กรอง:</span>
            {(["", "overdue", "due_soon", "draft"] as const).map((b) => (
              <button
                key={b}
                onClick={() => setFilterBucket(b)}
                className={`rounded-full border px-2.5 py-1 text-xs transition-colors ${
                  filterBucket === b
                    ? "border-teal-600 bg-teal-600 text-white"
                    : "border-slate-200 text-slate-500 hover:border-slate-300"
                }`}
              >
                {b === "" ? "ทั้งหมด" : BUCKET_CONFIG[b].label}
              </button>
            ))}
            <span className="h-4 w-px bg-slate-200" />
            <CustomSelect
              value={filterOrg}
              onChange={setFilterOrg}
              options={[{ value: "", label: "ทุก Client" }, ...orgOptions]}
              className="w-44"
            />
          </div>

          {!loading && filteredActionable.length === 0 ? (
            <div className="space-y-1 rounded-xl border bg-white p-8 text-center">
              <CheckSquare className="mx-auto h-8 w-8 text-green-200" />
              <p className="text-sm text-slate-300">ไม่มีงานค้างในขณะนี้ 🎉</p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>สถานะ</TableHead>
                  <TableHead>Client</TableHead>
                  <TableHead>เลขที่</TableHead>
                  <TableHead>ลูกค้า</TableHead>
                  <TableHead>วันที่ออก</TableHead>
                  <TableHead>ครบกำหนด</TableHead>
                  <TableHead align="right">จำนวนเงิน</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loading ? (
                  <TableLoading colSpan={7} />
                ) : (
                  filteredActionable.map((inv) => {
                    const bCfg = BUCKET_CONFIG[inv.bucket];
                    return (
                      <TableRow
                        key={inv.id}
                        clickable
                        onClick={() => router.push(`/${inv.orgSlug}/accounting/invoices`)}
                      >
                        <TableCell>
                          <StatusBadge tone={bCfg.tone}>
                            {bCfg.icon} {bCfg.label}
                          </StatusBadge>
                        </TableCell>
                        <TableCell className="text-xs font-medium text-slate-700">
                          {inv.orgName}
                        </TableCell>
                        <TableCell className="font-mono text-xs text-slate-500">
                          {inv.invoiceNo ?? "—"}
                        </TableCell>
                        <TableCell className="max-w-[140px] truncate text-xs text-slate-700">
                          {inv.contactName}
                        </TableCell>
                        <TableCell className="text-xs text-slate-400">
                          {fmtDate(inv.issueDate)}
                        </TableCell>
                        <TableCell
                          className={`text-xs font-medium ${inv.bucket === "overdue" ? "text-red-600" : inv.bucket === "due_soon" ? "text-amber-600" : "text-slate-400"}`}
                        >
                          {fmtDate(inv.dueDate)}
                        </TableCell>
                        <TableCell
                          align="right"
                          tabular
                          className="text-xs font-semibold text-slate-800"
                        >
                          ฿{inv.totalAmount.toLocaleString("th-TH", { minimumFractionDigits: 2 })}
                        </TableCell>
                      </TableRow>
                    );
                  })
                )}
              </TableBody>
            </Table>
          )}
        </div>
      )}

      {/* ── Tab: ปฏิทินภาษี (สถานะการยื่นจริงจาก acc_tax_filings) ────────────────── */}
      {tab === "calendar" && (
        <div className="space-y-3">
          {/* สรุปสถานะการยื่น */}
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
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
              value={loading ? "…" : String(taxCalendar?.summary.overdue ?? 0)}
              tone="negative"
              valueColored
            />
            <StatCard
              icon={<CalendarDays className="h-4 w-4" />}
              label="รอดำเนินการ"
              value={loading ? "…" : String(taxCalendar?.summary.pending ?? 0)}
              tone="neutral"
            />
          </div>

          {!loading && (taxCalendar?.rows.length ?? 0) === 0 ? (
            <div className="flex flex-col items-center justify-center rounded-xl border border-gray-200 bg-white py-16 text-center shadow-sm">
              <div className="mb-4 rounded-full bg-gray-100 p-4">
                <CalendarDays className="h-8 w-8 text-gray-400" />
              </div>
              <Text className="text-sm font-medium text-gray-900">ยังไม่มีรายการยื่นภาษี</Text>
              <Text className="mt-1 max-w-sm text-sm text-gray-500">
                เมื่อ client org บันทึกแบบภาษี (ภ.พ.30 / ภ.ง.ด.) ในงวดนี้ สถานะจะแสดงที่นี่
              </Text>
              <Button
                size="sm"
                variant="outline"
                className="mt-4"
                onClick={() => router.push(`/${orgSlug}/acc-firm/clients`)}
              >
                จัดการ Client Orgs
              </Button>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Client</TableHead>
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
                  (taxCalendar?.rows ?? []).map((r, i) => (
                    <TaxCalendarRow key={`${r.orgId}-${r.taxKind}-${r.periodMonth}-${i}`} row={r} />
                  ))
                )}
              </TableBody>
            </Table>
          )}
        </div>
      )}

      {/* ── Tab: สรุปต่อ Client ───────────────────────────────────────────────── */}
      {tab === "summary" &&
        (!loading && clientSummary.length === 0 ? (
          <div className="rounded-xl border bg-white p-8 text-center text-sm text-slate-300">
            ไม่มี client orgs
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Client</TableHead>
                <TableHead align="center">เกินกำหนด</TableHead>
                <TableHead align="center">ใกล้ครบ</TableHead>
                <TableHead align="center">Draft</TableHead>
                <TableHead align="center">Open</TableHead>
                <TableHead align="right">ยอดค้างชำระ</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                <TableLoading colSpan={6} />
              ) : (
                clientSummary.map((c) => (
                  <TableRow
                    key={c.orgId}
                    clickable
                    onClick={() => router.push(`/${c.orgSlug}/accounting`)}
                    className={c.overdue > 0 ? "bg-red-50/30" : ""}
                  >
                    <TableCell>
                      <p className="font-semibold text-slate-800">{c.orgName}</p>
                      <p className="text-xs text-slate-400">{c.orgSlug}</p>
                    </TableCell>
                    <TableCell align="center" tabular>
                      {c.overdue > 0 ? (
                        <span className="font-bold text-red-600">{c.overdue}</span>
                      ) : (
                        <span className="text-slate-200">—</span>
                      )}
                    </TableCell>
                    <TableCell align="center" tabular>
                      {c.due_soon > 0 ? (
                        <span className="font-bold text-amber-600">{c.due_soon}</span>
                      ) : (
                        <span className="text-slate-200">—</span>
                      )}
                    </TableCell>
                    <TableCell align="center" tabular>
                      {c.draft > 0 ? (
                        <span className="text-gray-500">{c.draft}</span>
                      ) : (
                        <span className="text-slate-200">—</span>
                      )}
                    </TableCell>
                    <TableCell align="center" tabular>
                      {c.open > 0 ? (
                        <span className="text-blue-600">{c.open}</span>
                      ) : (
                        <span className="text-slate-200">—</span>
                      )}
                    </TableCell>
                    <TableCell align="right" tabular>
                      {c.totalOverdue > 0 ? (
                        <span className="font-bold text-red-600">฿{fmtK(c.totalOverdue)}</span>
                      ) : (
                        <span className="text-slate-200">—</span>
                      )}
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        ))}
    </PageShell>
  );
}

// ── แถวปฏิทินภาษี (F1) ───────────────────────────────────────────────────────────
function TaxCalendarRow({ row }: { row: TaxFilingRow }) {
  const router = useRouter();
  const badge = FILING_STATE_BADGE[row.state];
  const amount = row.taxKind === "pp30" ? row.netPayable : row.whtTotal;
  return (
    <TableRow clickable onClick={() => router.push(`/${row.orgSlug}/accounting`)}>
      <TableCell>
        <p className="font-medium text-gray-800">{row.orgName}</p>
        <p className="text-xs text-gray-400">{row.orgSlug}</p>
      </TableCell>
      <TableCell className="text-sm text-gray-700">{TAX_KIND_LABEL[row.taxKind]}</TableCell>
      <TableCell className="text-sm tabular-nums text-gray-600">
        {fmtPeriod(row.periodYear, row.periodMonth)}
      </TableCell>
      <TableCell className="text-sm tabular-nums text-gray-600">{fmtDate(row.dueDate)}</TableCell>
      <TableCell align="center">
        <StatusBadge tone={badge.tone}>{badge.label}</StatusBadge>
      </TableCell>
      <TableCell align="right" tabular>
        {amount != null ? fmtMoney(amount) : "—"}
      </TableCell>
    </TableRow>
  );
}
