"use client";

// _reports-client.tsx — รายงาน (วิเคราะห์ย้อนหลัง + breakdown + export CSV) — spec §5 #6
// filter: ช่วงเดือน (dynamic จาก start_date จริง) + บริษัท (SegmentedControl)
// section: (A) กำไร realized/pending · (B) split 89/P2P · (C) by department · (D) by stage
// export = CSV จริง (สร้าง Blob ฝั่ง client) · ทุกเงิน tabular · empty/no-match §5d

import { useMemo, useState } from "react";
import Link from "next/link";
import {
  BarChart3,
  Plus,
  Download,
  TrendingUp,
  Clock,
  Landmark,
  Building2,
  Layers,
} from "lucide-react";
import { PageShell } from "@/components/ui/page-shell";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Text } from "@/components/ui/typography";
import { StatCard } from "@/components/ui/stat-card";
import { CustomSelect } from "@/components/ui/custom-select";
import { SegmentedControl } from "@/components/ui/segmented";
import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
  TableFooter,
} from "@/components/ui/table";
import { toast } from "@/lib/toast";
import { STAGE_LABELS, STAGE_ORDER } from "@/lib/gov-procure/stage";
import type {
  GovProcureOrder,
  GovProcureSettings,
  GovProcureRole,
  Company,
  Stage,
} from "@/lib/gov-procure/types";
import {
  GovProcureProvider,
  useData,
  fmtMoney,
  fmtNum,
  pipelineValue,
  profitSplit,
} from "../_components";

type CompanyFilter = "all" | "89 Global Work" | "P2P Supply";

const COMPANY_OPTIONS: { value: CompanyFilter; label: string }[] = [
  { value: "all", label: "รวมทุกบริษัท" },
  { value: "89 Global Work", label: "89 Global Work" },
  { value: "P2P Supply", label: "P2P Supply" },
];

const TH_MONTHS_SHORT = [
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

/** month options (dynamic) จาก start_date จริงของ orders — ล่าสุดก่อน */
function buildMonthOptions(orders: GovProcureOrder[]): { value: string; label: string }[] {
  const set = new Set<string>();
  for (const o of orders) {
    if (o.start_date) set.add(o.start_date.slice(0, 7));
  }
  const opts = Array.from(set)
    .sort((a, b) => (a < b ? 1 : -1))
    .map((m) => {
      const [y, mm] = m.split("-");
      const label = `${TH_MONTHS_SHORT[Number(mm) - 1]} ${Number(y) + 543}`;
      return { value: m, label };
    });
  return [{ value: "all", label: "ทุกช่วงเวลา" }, ...opts];
}

export function ReportsClient({
  orders,
  settings,
  orgId,
  orgSlug,
  role,
}: {
  orders: GovProcureOrder[];
  settings: GovProcureSettings;
  orgId: string;
  orgSlug: string;
  role: GovProcureRole;
}) {
  return (
    <GovProcureProvider
      orgId={orgId}
      orgSlug={orgSlug}
      role={role}
      initialOrders={orders}
      initialSettings={settings}
    >
      <ReportsBody />
    </GovProcureProvider>
  );
}

function ReportsBody() {
  const { orders, orgSlug } = useData();
  const base = `/${orgSlug}/gov-procure`;

  const [company, setCompany] = useState<CompanyFilter>("all");
  const [month, setMonth] = useState<string>("all");

  const monthOptions = useMemo(() => buildMonthOptions(orders), [orders]);

  const filtered = useMemo(() => {
    return orders.filter((o) => {
      if (company !== "all" && o.company !== company) return false;
      if (month !== "all") {
        if (!o.start_date || o.start_date.slice(0, 7) !== month) return false;
      }
      return true;
    });
  }, [orders, company, month]);

  const summary = useMemo(() => {
    const profit = profitSplit(filtered);
    return {
      count: filtered.length,
      value: pipelineValue(filtered),
      realized: profit.realized,
      pending: profit.pending,
      total: profit.total,
    };
  }, [filtered]);

  const byCompany = useMemo(() => rollupByCompany(filtered), [filtered]);
  const byDept = useMemo(() => rollupByDepartment(filtered), [filtered]);
  const byStage = useMemo(() => rollupByStage(filtered), [filtered]);

  const hasData = orders.length > 0;
  const hasFiltered = filtered.length > 0;

  function handleExport() {
    const header = [
      "ลำดับ",
      "หน่วยงาน",
      "กอง",
      "บริษัท",
      "QT",
      "รายการ",
      "สถานะ",
      "ยอดเสนอราคา",
      "กำไรสุทธิ89",
    ];
    const escape = (v: unknown) => `"${String(v ?? "").replace(/"/g, '""')}"`;
    const lines = filtered.map((o) =>
      [
        o.seq_no ?? "",
        o.customer_name,
        o.department ?? "",
        o.company ?? "",
        o.qt_reference ?? "",
        o.product_description ?? "",
        STAGE_LABELS[o.stage],
        o.price_incl_vat ?? "",
        o.net_profit_89 ?? "",
      ]
        .map(escape)
        .join(","),
    );
    const csv = "﻿" + [header.map(escape).join(","), ...lines].join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `gov-procure-report-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success(`ดาวน์โหลดรายงานแล้ว (${fmtNum(summary.count)} งาน)`);
  }

  return (
    <PageShell
      width="full"
      icon={<BarChart3 className="h-6 w-6" />}
      title="รายงาน"
      description="วิเคราะห์ย้อนหลัง — กำไรรับรู้/รอรับรู้ แยกตามบริษัท กอง และช่วงเวลา พร้อมส่งออกรายงาน"
      actions={
        hasData ? (
          <Button variant="outline" onClick={handleExport} disabled={!hasFiltered}>
            <Download className="mr-1.5 h-4 w-4" /> ส่งออก CSV
          </Button>
        ) : undefined
      }
    >
      <div className="space-y-5">
        {!hasData ? (
          <EmptyReport base={base} />
        ) : (
          <>
            {/* ── ตัวกรอง ── */}
            <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
              <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
                <div>
                  <Label>บริษัท</Label>
                  <div className="mt-1">
                    <SegmentedControl<CompanyFilter>
                      value={company}
                      onChange={setCompany}
                      options={COMPANY_OPTIONS}
                      ariaLabel="เลือกบริษัท"
                    />
                  </div>
                </div>
                <div className="w-full sm:w-56">
                  <Label htmlFor="gp-report-month">ช่วงเวลา (เดือนที่เริ่มงาน)</Label>
                  <CustomSelect
                    value={month}
                    onChange={setMonth}
                    options={monthOptions}
                    className="mt-1 w-full"
                  />
                </div>
              </div>
              <Text className="mt-3 text-xs text-gray-500">
                แสดง {fmtNum(summary.count)} งาน จากทั้งหมด {fmtNum(orders.length)} งาน
                {company !== "all" || month !== "all" ? " (ตามตัวกรอง)" : ""}
              </Text>
            </div>

            {/* (A) กำไร realized vs pending */}
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <StatCard
                icon={<Landmark className="h-4 w-4" />}
                label="มูลค่าพอร์ต (ตามกรอง)"
                value={fmtMoney(summary.value)}
                sub={`${fmtNum(summary.count)} งาน`}
                tone="info"
                valueColored
              />
              <StatCard
                icon={<TrendingUp className="h-4 w-4" />}
                label="กำไรรับรู้แล้ว"
                value={fmtMoney(summary.realized)}
                sub="งานรับเช็ค/ปิดแล้ว"
                tone="positive"
                valueColored
              />
              <StatCard
                icon={<Clock className="h-4 w-4" />}
                label="กำไรรอรับรู้"
                value={fmtMoney(summary.pending)}
                sub="งานที่ยังไม่ปิด"
                tone="neutral"
              />
              <StatCard
                icon={<BarChart3 className="h-4 w-4" />}
                label="กำไรรวม 89"
                value={fmtMoney(summary.total)}
                sub="รับรู้ + รอรับรู้"
                tone="primary"
              />
            </div>

            {!hasFiltered ? (
              <NoMatch
                onClear={() => {
                  setCompany("all");
                  setMonth("all");
                }}
              />
            ) : (
              <>
                <CompanySplitSection rows={byCompany} totalValue={summary.value} />
                <DepartmentSection
                  rows={byDept}
                  totalValue={summary.value}
                  totalProfit={summary.total}
                />
                <StageSection rows={byStage} />
              </>
            )}
          </>
        )}
      </div>
    </PageShell>
  );
}

// ── (B) Company split ──
interface CompanyRow {
  company: Company | "unassigned";
  label: string;
  count: number;
  value: number;
  profit: number;
}

function rollupByCompany(orders: GovProcureOrder[]): CompanyRow[] {
  const keys: (Company | "unassigned")[] = ["89 Global Work", "P2P Supply", "unassigned"];
  const rows = keys.map((key) => {
    const inGroup = orders.filter((o) =>
      key === "unassigned" ? o.company == null : o.company === key,
    );
    return {
      company: key,
      label: key === "unassigned" ? "ไม่ระบุบริษัท" : key,
      count: inGroup.length,
      value: inGroup.reduce((s, o) => s + (o.price_incl_vat ?? 0), 0),
      profit: inGroup.reduce((s, o) => s + (o.net_profit_89 ?? 0), 0),
    };
  });
  return rows.filter((r) => r.count > 0);
}

function CompanySplitSection({ rows, totalValue }: { rows: CompanyRow[]; totalValue: number }) {
  const totals = rows.reduce(
    (acc, r) => ({
      count: acc.count + r.count,
      value: acc.value + r.value,
      profit: acc.profit + r.profit,
    }),
    { count: 0, value: 0, profit: 0 },
  );

  return (
    <div>
      <div className="mb-2.5 flex flex-wrap items-center justify-between gap-2 px-1">
        <div className="flex items-center gap-1.5 text-sm font-semibold text-gray-900">
          <Building2 className="h-4 w-4 text-primary" />
          แบ่งตามบริษัท (89 Global Work / P2P Supply)
        </div>
        <div className="flex flex-wrap items-center gap-3 text-xs text-gray-500">
          <span className="inline-flex items-center gap-1.5">
            <span className="h-2 w-2 rounded-full bg-blue-400" aria-hidden />
            89 Global Work
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="h-2 w-2 rounded-full bg-violet-400" aria-hidden />
            P2P Supply
          </span>
        </div>
      </div>
      <Table className="shadow-sm">
        <TableHeader>
          <TableRow>
            <TableHead>บริษัท</TableHead>
            <TableHead align="right">จำนวนงาน</TableHead>
            <TableHead align="right">มูลค่ารวม</TableHead>
            <TableHead align="right">สัดส่วน</TableHead>
            <TableHead align="right">กำไรสุทธิ 89</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((r) => (
            <TableRow key={r.company}>
              <TableCell>
                <span className="inline-flex items-center gap-2">
                  <span
                    className={`h-2 w-2 rounded-full ${
                      r.company === "89 Global Work"
                        ? "bg-blue-400"
                        : r.company === "P2P Supply"
                          ? "bg-violet-400"
                          : "bg-gray-300"
                    }`}
                    aria-hidden
                  />
                  {r.label}
                </span>
              </TableCell>
              <TableCell align="right" className="tabular-nums">
                {fmtNum(r.count)} งาน
              </TableCell>
              <TableCell align="right" tabular>
                {fmtMoney(r.value)}
              </TableCell>
              <TableCell align="right" className="tabular-nums text-gray-500">
                {totalValue > 0 ? `${Math.round((r.value / totalValue) * 100)}%` : "—"}
              </TableCell>
              <TableCell align="right" tabular>
                {fmtMoney(r.profit)}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
        <TableFooter>
          <TableRow>
            <TableCell className="font-semibold text-gray-900">รวม</TableCell>
            <TableCell align="right" className="tabular-nums font-semibold text-gray-900">
              {fmtNum(totals.count)} งาน
            </TableCell>
            <TableCell align="right" tabular className="font-semibold text-gray-900">
              {fmtMoney(totals.value)}
            </TableCell>
            <TableCell align="right" className="font-semibold text-gray-500">
              100%
            </TableCell>
            <TableCell align="right" tabular className="font-semibold text-gray-900">
              {fmtMoney(totals.profit)}
            </TableCell>
          </TableRow>
        </TableFooter>
      </Table>
    </div>
  );
}

// ── (C) By department ──
interface DeptRow {
  department: string;
  count: number;
  value: number;
  profit: number;
}

function rollupByDepartment(orders: GovProcureOrder[]): DeptRow[] {
  const map = new Map<string, DeptRow>();
  for (const o of orders) {
    const key = o.department ?? "ไม่ระบุกอง";
    const row = map.get(key) ?? { department: key, count: 0, value: 0, profit: 0 };
    row.count += 1;
    row.value += o.price_incl_vat ?? 0;
    row.profit += o.net_profit_89 ?? 0;
    map.set(key, row);
  }
  return Array.from(map.values()).sort((a, b) => b.value - a.value);
}

function DepartmentSection({
  rows,
  totalValue,
  totalProfit,
}: {
  rows: DeptRow[];
  totalValue: number;
  totalProfit: number;
}) {
  const totalCount = rows.reduce((s, r) => s + r.count, 0);
  return (
    <div>
      <div className="mb-2.5 flex items-center gap-1.5 px-1 text-sm font-semibold text-gray-900">
        <Layers className="h-4 w-4 text-primary" />
        แบ่งตามกอง (หน่วยงาน)
      </div>
      <Table className="shadow-sm">
        <TableHeader>
          <TableRow>
            <TableHead>กอง</TableHead>
            <TableHead align="right">จำนวนงาน</TableHead>
            <TableHead align="right">มูลค่ารวม</TableHead>
            <TableHead align="right">กำไรสุทธิ 89</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((r) => (
            <TableRow key={r.department}>
              <TableCell>{r.department}</TableCell>
              <TableCell align="right" className="tabular-nums">
                {fmtNum(r.count)} งาน
              </TableCell>
              <TableCell align="right" tabular>
                {fmtMoney(r.value)}
              </TableCell>
              <TableCell align="right" tabular>
                {fmtMoney(r.profit)}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
        <TableFooter>
          <TableRow>
            <TableCell className="font-semibold text-gray-900">รวม</TableCell>
            <TableCell align="right" className="tabular-nums font-semibold text-gray-900">
              {fmtNum(totalCount)} งาน
            </TableCell>
            <TableCell align="right" tabular className="font-semibold text-gray-900">
              {fmtMoney(totalValue)}
            </TableCell>
            <TableCell align="right" tabular className="font-semibold text-gray-900">
              {fmtMoney(totalProfit)}
            </TableCell>
          </TableRow>
        </TableFooter>
      </Table>
    </div>
  );
}

// ── (D) By stage ──
interface StageRow {
  stage: Stage;
  count: number;
  value: number;
}

function rollupByStage(orders: GovProcureOrder[]): StageRow[] {
  return STAGE_ORDER.map((stage) => {
    const inStage = orders.filter((o) => o.stage === stage);
    return {
      stage,
      count: inStage.length,
      value: inStage.reduce((s, o) => s + (o.price_incl_vat ?? 0), 0),
    };
  });
}

function StageSection({ rows }: { rows: StageRow[] }) {
  const totalCount = rows.reduce((s, r) => s + r.count, 0);
  const totalValue = rows.reduce((s, r) => s + r.value, 0);
  return (
    <div>
      <div className="mb-2.5 flex items-center gap-1.5 px-1 text-sm font-semibold text-gray-900">
        <BarChart3 className="h-4 w-4 text-primary" />
        แบ่งตามสถานะงาน
      </div>
      <Table className="shadow-sm">
        <TableHeader>
          <TableRow>
            <TableHead>สถานะ</TableHead>
            <TableHead align="right">จำนวนงาน</TableHead>
            <TableHead align="right">มูลค่ารวม</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((r) => (
            <TableRow key={r.stage}>
              <TableCell>{STAGE_LABELS[r.stage]}</TableCell>
              <TableCell align="right" className="tabular-nums">
                {fmtNum(r.count)} งาน
              </TableCell>
              <TableCell align="right" tabular>
                {fmtMoney(r.value)}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
        <TableFooter>
          <TableRow>
            <TableCell className="font-semibold text-gray-900">รวม</TableCell>
            <TableCell align="right" className="tabular-nums font-semibold text-gray-900">
              {fmtNum(totalCount)} งาน
            </TableCell>
            <TableCell align="right" tabular className="font-semibold text-gray-900">
              {fmtMoney(totalValue)}
            </TableCell>
          </TableRow>
        </TableFooter>
      </Table>
    </div>
  );
}

// ── empty / no-match ──
function EmptyReport({ base }: { base: string }) {
  return (
    <div className="flex flex-col items-center justify-center rounded-xl border border-gray-200 bg-white py-16 text-center">
      <div className="mb-4 rounded-full bg-gray-100 p-4">
        <BarChart3 className="h-8 w-8 text-gray-400" />
      </div>
      <Text className="text-sm font-medium text-gray-900">ยังไม่มีข้อมูลพอทำรายงาน</Text>
      <Text className="mt-1 max-w-sm text-sm text-gray-500">
        เมื่อมีงานจัดซื้อในพอร์ต ระบบจะสรุปกำไร แยกตามบริษัท กอง และช่วงเวลาให้อัตโนมัติ
      </Text>
      <Button className="mt-4" size="sm" asChild>
        <Link href={`${base}/orders?new=1`}>
          <Plus className="mr-1.5 h-4 w-4" /> สร้างงานแรก
        </Link>
      </Button>
    </div>
  );
}

function NoMatch({ onClear }: { onClear: () => void }) {
  return (
    <div className="flex flex-col items-center justify-center rounded-xl border border-gray-200 bg-white py-14 text-center">
      <div className="mb-3 rounded-full bg-gray-100 p-3">
        <BarChart3 className="h-7 w-7 text-gray-400" />
      </div>
      <Text className="text-sm font-medium text-gray-900">ไม่พบงานตามเงื่อนไข</Text>
      <Text className="mt-1 text-sm text-gray-500">ลองปรับตัวกรองบริษัทหรือช่วงเวลา</Text>
      <Button className="mt-4" size="sm" variant="outline" onClick={onClear}>
        ล้างตัวกรอง
      </Button>
    </div>
  );
}
