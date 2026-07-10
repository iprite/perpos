"use client";

// _dashboard-client.tsx — แดชบอร์ด (ภาพรวม) client view
// hierarchy: (1) StatCard KPI · (2) การ์ดเงินค้างรับ/overdue เด่น · (3) pipeline summary · (4) AI brief
// ทุกตัวเลขคำนวณจาก orders (rule ล้วน) · tabular · empty/loading states §5d

import Link from "next/link";
import { useMemo } from "react";
import {
  LayoutDashboard,
  Plus,
  Wallet,
  TrendingUp,
  Clock,
  AlertTriangle,
  CircleDollarSign,
  ChevronRight,
  CheckCircle2,
  PackageOpen,
} from "lucide-react";
import { PageShell } from "@/components/ui/page-shell";
import { Button } from "@/components/ui/button";
import { StatCard } from "@/components/ui/stat-card";
import { Text } from "@/components/ui/typography";
import { STAGE_LABELS, STAGE_TONE } from "@/lib/gov-procure/stage";
import type { GovProcureOrder, GovProcureSettings, GovProcureRole } from "@/lib/gov-procure/types";
import {
  GovProcureProvider,
  useData,
  useRole,
  fmtMoney,
  fmtNum,
  pipelineValue,
  profitSplit,
  receivableSummary,
  pipelineByStage,
} from "./_components";
import { OverdueBadge, CompanyBadge } from "./_components/badges";
import { AiSummaryBox } from "./_components/ai-summary-box";

// สีแท่ง mini bar ต่อ tone (utility class จากพาเลตต์)
const STAGE_BAR: Record<string, string> = {
  neutral: "bg-gray-300",
  info: "bg-blue-400",
  warning: "bg-amber-400",
  success: "bg-green-500",
};

export function DashboardClient({
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
      <DashboardBody />
    </GovProcureProvider>
  );
}

function DashboardBody() {
  const { orders, settings, orgSlug } = useData();
  const { canWrite } = useRole();
  const base = `/${orgSlug}/gov-procure`;

  const kpi = useMemo(() => {
    const pipeline = pipelineValue(orders);
    const profit = profitSplit(orders);
    const recv = receivableSummary(orders, settings.sla_threshold);
    const byStage = pipelineByStage(orders);
    const maxStageValue = Math.max(1, ...byStage.map((s) => s.value));
    return { pipeline, profit, recv, byStage, maxStageValue };
  }, [orders, settings.sla_threshold]);

  const { recv } = kpi;
  const hasOrders = orders.length > 0;

  return (
    <PageShell
      width="full"
      icon={<LayoutDashboard className="h-6 w-6" />}
      title="จัดซื้อครุภัณฑ์ภาครัฐ"
      description="ภาพรวมพอร์ตงานจัดซื้อ — สุขภาพพอร์ต เงินค้างรับ และงานที่ต้องเร่งจัดการ"
      actions={
        canWrite ? (
          <Button asChild>
            <Link href={`${base}/orders?new=1`}>
              <Plus className="mr-1.5 h-4 w-4" /> สร้างงานใหม่
            </Link>
          </Button>
        ) : undefined
      }
    >
      <div className="space-y-5">
        {!hasOrders ? (
          <EmptyPortfolio canWrite={canWrite} base={base} />
        ) : (
          <>
            {/* (1) KPI */}
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <StatCard
                icon={<CircleDollarSign className="h-4 w-4" />}
                label="มูลค่าพอร์ตรวม"
                value={fmtMoney(kpi.pipeline)}
                sub={`${fmtNum(orders.length)} งานทั้งหมด`}
                tone="info"
                valueColored
              />
              <StatCard
                icon={<Wallet className="h-4 w-4" />}
                label="เงินค้างรับ"
                value={fmtMoney(recv.totalAmount)}
                sub={`${fmtNum(recv.list.length)} งานส่งของแล้ว รอรับเช็ค`}
                tone={recv.overdueCount > 0 ? "warning" : "neutral"}
                valueColored={recv.overdueCount > 0}
              />
              <StatCard
                icon={<TrendingUp className="h-4 w-4" />}
                label="กำไรรับรู้แล้ว"
                value={fmtMoney(kpi.profit.realized)}
                sub="งานรับเช็ค/ปิดแล้ว"
                tone="positive"
                valueColored
              />
              <StatCard
                icon={<Clock className="h-4 w-4" />}
                label="กำไรรอรับรู้"
                value={fmtMoney(kpi.profit.pending)}
                sub="งานที่ยังไม่ปิด"
                tone="neutral"
              />
            </div>

            {/* (2) การ์ดเงินค้างรับ / overdue เด่น */}
            <ReceivablesHighlight recv={recv} base={base} />

            {/* (3) pipeline summary */}
            <PipelineSummary byStage={kpi.byStage} maxValue={kpi.maxStageValue} base={base} />

            {/* (4) AI brief — ยิง /api/gov-procure/ai/brief จริง */}
            <AiSummaryBox />
          </>
        )}
      </div>
    </PageShell>
  );
}

/** (2) การ์ดเงินค้างรับ / overdue — สะดุดตาเมื่อ overdue>0 · คลิก→receivables */
function ReceivablesHighlight({
  recv,
  base,
}: {
  recv: ReturnType<typeof receivableSummary>;
  base: string;
}) {
  if (recv.overdueCount === 0) {
    return (
      <Link
        href={`${base}/receivables`}
        className="flex items-center gap-3 rounded-xl border border-green-200 bg-green-50 p-4 transition-colors hover:bg-green-100/60"
      >
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-green-100 text-green-600">
          <CheckCircle2 className="h-5 w-5" />
        </span>
        <div className="min-w-0 flex-1">
          <Text className="text-sm font-semibold text-green-800">ไม่มีเงินค้างรับเกินกำหนด</Text>
          <Text className="text-xs text-green-700">
            {recv.list.length > 0
              ? `มีงานรอรับเช็ค ${fmtNum(recv.list.length)} งาน (${fmtMoney(recv.totalAmount)}) แต่ยังอยู่ในกำหนด SLA`
              : "ทุกงานที่ส่งของแล้วรับเช็คครบ"}
          </Text>
        </div>
        <ChevronRight className="h-5 w-5 shrink-0 text-green-500" />
      </Link>
    );
  }

  const top = recv.list.filter((r) => r.overdue).slice(0, 3);
  return (
    <div className="rounded-xl border border-red-200 bg-red-50/70 p-4 sm:p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-start gap-3">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-red-100 text-red-600">
            <AlertTriangle className="h-5 w-5" />
          </span>
          <div>
            <Text className="text-sm font-semibold text-gray-900">
              เงินค้างรับเกินกำหนด {fmtNum(recv.overdueCount)} งาน
            </Text>
            <Text className="text-xs text-gray-600">
              รวมยอด{" "}
              <span className="font-semibold tabular-nums text-red-600">
                {fmtMoney(recv.overdueAmount)}
              </span>{" "}
              ที่ควรเร่งทวงกับหน่วยงาน
            </Text>
          </div>
        </div>
        <Button variant="outline" size="sm" asChild>
          <Link href={`${base}/receivables`}>
            ดูเงินค้างรับทั้งหมด <ChevronRight className="ml-1 h-4 w-4" />
          </Link>
        </Button>
      </div>

      <ul className="mt-3 space-y-2">
        {top.map((r) => (
          <li
            key={r.order.id}
            className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-red-100 bg-white px-3 py-2"
          >
            <div className="min-w-0">
              <Text className="truncate text-sm font-medium text-gray-900">
                {r.order.product_description ?? "—"}
              </Text>
              <div className="mt-0.5 flex flex-wrap items-center gap-1.5 text-xs text-gray-500">
                <span>{r.order.department ?? "ไม่ระบุกอง"}</span>
                <span aria-hidden>·</span>
                <CompanyBadge company={r.order.company} />
              </div>
            </div>
            <div className="flex items-center gap-2">
              <OverdueBadge days={r.agingDays} />
              <span className="tabular-nums text-sm font-semibold text-red-600">
                {fmtMoney(r.amount)}
              </span>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}

/** (3) pipeline summary — 6 stage: จำนวน + มูลค่า + mini bar · คลิก stage → pipeline */
function PipelineSummary({
  byStage,
  maxValue,
  base,
}: {
  byStage: ReturnType<typeof pipelineByStage>;
  maxValue: number;
  base: string;
}) {
  return (
    <div>
      <div className="mb-2.5 flex items-center justify-between px-1">
        <div className="text-sm font-semibold text-gray-900">ไปป์ไลน์ตามสถานะงาน</div>
        <Link
          href={`${base}/pipeline`}
          className="inline-flex items-center text-xs font-medium text-primary hover:underline"
        >
          เปิดบอร์ดไปป์ไลน์ <ChevronRight className="ml-0.5 h-3.5 w-3.5" />
        </Link>
      </div>
      <div className="grid grid-cols-1 gap-2 rounded-xl border border-gray-200 bg-white p-3 shadow-sm sm:grid-cols-2 lg:grid-cols-3">
        {byStage.map((s) => (
          <Link
            key={s.stage}
            href={`${base}/pipeline`}
            className="rounded-lg border border-gray-100 p-3 transition-colors hover:bg-gray-50"
          >
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium text-gray-700">{STAGE_LABELS[s.stage]}</span>
              <span className="tabular-nums text-xs font-semibold text-gray-500">
                {fmtNum(s.count)} งาน
              </span>
            </div>
            <div className="mt-1.5 h-1.5 w-full overflow-hidden rounded-full bg-gray-100">
              <div
                className={`h-full rounded-full ${STAGE_BAR[STAGE_TONE[s.stage]] ?? "bg-gray-300"}`}
                style={{ width: `${Math.round((s.value / maxValue) * 100)}%` }}
              />
            </div>
            <div className="mt-1.5 tabular-nums text-sm font-semibold text-gray-900">
              {fmtMoney(s.value)}
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}

/** empty: พอร์ตว่าง → CTA สร้างงานแรก (spec §5d Dashboard empty) */
function EmptyPortfolio({ canWrite, base }: { canWrite: boolean; base: string }) {
  return (
    <div className="flex flex-col items-center justify-center rounded-xl border border-gray-200 bg-white py-16 text-center">
      <div className="mb-4 rounded-full bg-gray-100 p-4">
        <PackageOpen className="h-8 w-8 text-gray-400" />
      </div>
      <Text className="text-sm font-medium text-gray-900">ยังไม่มีงานในพอร์ต</Text>
      <Text className="mt-1 max-w-sm text-sm text-gray-500">
        เริ่มจากสร้างงานจัดซื้อชิ้นแรก แล้วติดตามสถานะตั้งแต่เสนอราคาจนถึงรับเช็คได้ในที่เดียว
      </Text>
      {canWrite && (
        <Button className="mt-4" size="sm" asChild>
          <Link href={`${base}/orders?new=1`}>
            <Plus className="mr-1.5 h-4 w-4" /> สร้างงานแรก
          </Link>
        </Button>
      )}
    </div>
  );
}
