// metrics/page.tsx — "ถามอะไรได้บ้าง" (semantic layer ที่จับต้องได้)
// full server component: list metric ที่ verified + role นี้เห็นได้ (ไม่มี mutation → ไม่ต้อง client)

import Link from "next/link";
import { BookOpen, MessageSquareQuote, Sparkles } from "lucide-react";
import { PageShell } from "@/components/ui/page-shell";
import { Button } from "@/components/ui/button";
import { StatCard } from "@/components/ui/stat-card";
import { StatusBadge } from "@/components/ui/badge";
import { Text, Title } from "@/components/ui/typography";
import type {
  BiMetricSummary,
  ChartType,
  MetricUnit,
  ModuleScope,
  TimeGrain,
} from "@/lib/bi/types";
import { loadVisibleMetrics, requireBiPage } from "../_components/guard";

const SCOPE_LABEL: Record<ModuleScope, string> = {
  gov_procure: "จัดซื้อครุภัณฑ์ภาครัฐ",
  accounting: "บัญชีและภาษี",
  core: "ข้อมูลทั่วไป",
};

const CHART_LABEL: Record<ChartType, string> = {
  stat: "ตัวเลขสรุป",
  line: "กราฟเส้น (ตามเวลา)",
  bar: "กราฟแท่ง (ตามหมวด)",
  donut: "กราฟวงแหวน (สัดส่วน)",
  funnel: "ผังขั้นตอน",
  table: "ตารางรายการ",
  stacked_bar: "แท่งซ้อน (สองมิติ)",
  heatmap: "ตารางความเข้ม",
};

const UNIT_LABEL: Record<MetricUnit, string> = {
  thb: "บาท",
  count: "จำนวน (รายการ)",
  days: "วัน",
  percent: "เปอร์เซ็นต์",
};

const TIME_GRAIN_LABEL: Record<TimeGrain, string> = {
  day: "รายวัน",
  week: "รายสัปดาห์",
  month: "รายเดือน",
  quarter: "รายไตรมาส",
  fiscal_year: "ปีงบประมาณ",
  year: "รายปี",
};

export default async function BiMetricsPage({ params }: { params: Promise<{ orgSlug: string }> }) {
  const { orgSlug } = await params;
  const ctx = await requireBiPage(orgSlug);
  const metrics = await loadVisibleMetrics(ctx);

  const groups = new Map<ModuleScope, BiMetricSummary[]>();
  for (const m of metrics) {
    const list = groups.get(m.module_scope) ?? [];
    list.push(m);
    groups.set(m.module_scope, list);
  }

  return (
    <PageShell
      title="ถามอะไรได้บ้าง"
      description="รายการตัวชี้วัดที่ระบบยืนยันนิยามแล้ว — กดปุ่มเพื่อถามด้วยคำถามนั้นได้ทันที"
      icon={<BookOpen className="h-6 w-6" />}
      width="default"
      actions={
        <Button variant="outline" size="sm" asChild>
          <Link href={`/${orgSlug}/bi`}>
            <Sparkles className="mr-1.5 h-4 w-4" />
            ไปห้องถาม-ตอบ
          </Link>
        </Button>
      }
    >
      {metrics.length === 0 ? (
        <EmptyMetrics orgSlug={orgSlug} />
      ) : (
        <div className="space-y-6">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <StatCard
              icon={<BookOpen className="h-4 w-4" />}
              label="ตัวชี้วัดที่ถามได้"
              value={String(metrics.length)}
              tone="info"
              valueColored
            />
            <StatCard
              icon={<MessageSquareQuote className="h-4 w-4" />}
              label="กลุ่มข้อมูล"
              value={String(groups.size)}
              tone="neutral"
            />
            <StatCard
              icon={<Sparkles className="h-4 w-4" />}
              label="บทบาทของคุณ"
              value={
                ctx.role === "owner" ? "เจ้าของ" : ctx.role === "analyst" ? "นักวิเคราะห์" : "ผู้ชม"
              }
              tone="neutral"
            />
          </div>

          {Array.from(groups.entries()).map(([scope, list]) => (
            <section key={scope} className="space-y-2.5">
              <div className="flex items-center gap-2 px-1">
                <Title as="h2" className="text-sm font-semibold text-gray-900">
                  {SCOPE_LABEL[scope] ?? scope}
                </Title>
                <StatusBadge tone="neutral">{list.length} ตัวชี้วัด</StatusBadge>
              </div>

              <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
                {list.map((m) => (
                  <MetricCard key={m.key} metric={m} orgSlug={orgSlug} />
                ))}
              </div>
            </section>
          ))}
        </div>
      )}
    </PageShell>
  );
}

function MetricCard({ metric, orgSlug }: { metric: BiMetricSummary; orgSlug: string }) {
  return (
    <div className="flex min-w-0 flex-col gap-3 rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
      <div className="min-w-0 space-y-1.5">
        <Title as="h3" className="text-sm font-medium text-gray-900">
          {metric.label_th}
        </Title>
        <Text className="text-sm leading-6 text-gray-600">{metric.definition_th}</Text>
      </div>

      <dl className="grid grid-cols-1 gap-x-4 gap-y-1.5 sm:grid-cols-2">
        <Field label="หน่วย" value={UNIT_LABEL[metric.unit] ?? metric.unit} />
        <Field
          label="ฐานเวลา"
          value={
            metric.time_basis
              ? metric.time_grains.length > 0
                ? metric.time_grains.map((g) => TIME_GRAIN_LABEL[g] ?? g).join(" · ")
                : "อิงช่วงเวลา"
              : "ภาพ ณ ปัจจุบัน (ไม่อิงช่วงเวลา)"
          }
        />
      </dl>

      <div className="space-y-1.5">
        <Text className="text-xs font-medium text-gray-500">แยกดูได้ตาม</Text>
        {metric.dimensions.length > 0 ? (
          <div className="flex flex-wrap gap-1.5">
            {metric.dimensions.map((d) => (
              <StatusBadge key={d.key} tone="neutral">
                {d.label_th}
              </StatusBadge>
            ))}
          </div>
        ) : (
          <Text className="text-xs text-gray-500">ตัวชี้วัดนี้ดูได้เป็นภาพรวมอย่างเดียว</Text>
        )}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        {metric.chart_hint ? (
          <StatusBadge tone="neutral">
            {CHART_LABEL[metric.chart_hint] ?? metric.chart_hint}
          </StatusBadge>
        ) : null}
        <Text className="font-mono text-xs text-gray-500" title={metric.key}>
          {metric.key}
        </Text>
      </div>

      <div className="mt-auto">
        <Button size="sm" variant="outline" asChild>
          <Link href={`/${orgSlug}/bi?q=${encodeURIComponent(metric.label_th)}`}>
            <MessageSquareQuote className="mr-1.5 h-4 w-4" />
            ถามด้วยคำถามนี้
          </Link>
        </Button>
      </div>
    </div>
  );
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0">
      <dt className="text-xs text-gray-500">{label}</dt>
      <dd className="truncate text-xs text-gray-700">{value}</dd>
    </div>
  );
}

function EmptyMetrics({ orgSlug }: { orgSlug: string }) {
  return (
    <div className="flex flex-col items-center rounded-xl border border-gray-200 bg-white px-4 py-16 text-center shadow-sm">
      <div className="mb-4 rounded-full bg-gray-100 p-4">
        <BookOpen className="h-8 w-8 text-gray-400" />
      </div>
      <Title as="h3" className="text-sm font-medium text-gray-900">
        ยังไม่มีตัวชี้วัดที่ยืนยันนิยามแล้ว
      </Title>
      <Text className="mt-1 max-w-md text-sm text-gray-500">
        ตัวชี้วัดจะถามได้ก็ต่อเมื่อเจ้าของข้อมูลเซ็นรับนิยามแล้วเท่านั้น
        กรุณาติดต่อผู้ดูแลระบบเพื่อเปิดใช้งานตัวชี้วัดสำหรับบทบาทของคุณ
      </Text>
      <Button className="mt-4" size="sm" variant="outline" asChild>
        <Link href={`/${orgSlug}/bi`}>ไปห้องถาม-ตอบ</Link>
      </Button>
    </div>
  );
}
