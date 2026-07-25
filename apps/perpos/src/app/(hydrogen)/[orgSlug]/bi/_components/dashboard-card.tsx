"use client";

/**
 * DashboardCard — การ์ดหนึ่งใบบนแดชบอร์ด (Phase 3)
 *
 * กติกาที่ห้ามพลาด (contract §3):
 *  - **ไม่มีปุ่มรีเฟรช** (P3-D3) — การ์ดคำนวณเองตอนเปิดหน้า/เปลี่ยนช่วงเวลา
 *  - สถานะ ≠ `ok` แสดงได้เฉพาะ `title` ที่ผู้ใช้ตั้ง + ข้อความมาตรฐานจากเซิร์ฟเวอร์
 *    **ห้ามเดา/แสดง metric_key · ห้ามโชว์ error ดิบ**
 *  - แสดง **บรรทัดนิยาม** ทุกใบ (§3.1 ข้อ 5) · มี `compare` ต้องโชว์ส่วนต่างเทียบช่วงก่อน
 *  - กราฟเรนเดอร์ตาม `result.chart.type` ที่เซิร์ฟเวอร์ตัดสิน (ไม่ใช่ค่าที่ผู้ใช้เลือก — R10)
 */

import * as React from "react";
import {
  ArrowDown,
  ArrowUp,
  ChevronDown,
  ChevronUp,
  CircleAlert,
  Minus,
  Pencil,
  TriangleAlert,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { CustomSelect } from "@/components/ui/custom-select";
import { StatusBadge } from "@/components/ui/badge";
import { Text, Title } from "@/components/ui/typography";
import { formatMetricValue } from "@/lib/bi/format";
import { metricDirectionOf } from "@/lib/bi/metric-direction";
import type {
  BiCardResult,
  BiDashboardItem,
  BiDirectResult,
  BiPeriodParam,
  ChartType,
} from "@/lib/bi/types";
import { ChartRenderer } from "./chart-renderer";
import { RawRows } from "./raw-rows";
import { CoverageLine, DefinitionLine } from "./answer-card";
import { coverageOf } from "./coverage";
import type { BiDrillMetricInfo } from "./guard";
import cn from "@core/utils/class-names";

/** ช่วงเวลาที่เลือกได้บนการ์ด — ค่าที่เกินความสามารถของ metric จะถูกเซิร์ฟเวอร์ปฏิเสธพร้อมข้อความไทย */
export const PERIOD_PRESETS: Array<{ value: string; label: string; period: BiPeriodParam }> = [
  { value: "month:0", label: "เดือนนี้", period: { grain: "month", offset: 0 } },
  { value: "month:-1", label: "เดือนที่แล้ว", period: { grain: "month", offset: -1 } },
  { value: "quarter:0", label: "ไตรมาสนี้", period: { grain: "quarter", offset: 0 } },
  { value: "year:0", label: "ปีนี้", period: { grain: "year", offset: 0 } },
  {
    value: "fiscal_year:0",
    label: "ปีงบประมาณนี้",
    period: { grain: "fiscal_year", offset: 0 },
  },
];

function periodKeyOf(period?: BiPeriodParam | null): string {
  if (!period?.grain) return "";
  if (period.from || period.to) return `custom:${period.from ?? ""}~${period.to ?? ""}`;
  return `${period.grain}:${period.offset ?? 0}`;
}

const GRAIN_LABEL_TH: Record<string, string> = {
  day: "วัน",
  week: "สัปดาห์",
  month: "เดือน",
  quarter: "ไตรมาส",
  year: "ปี",
  fiscal_year: "ปีงบประมาณ",
};

function thaiDate(iso?: string): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString("th-TH", { day: "numeric", month: "short", year: "numeric" });
}

/** ข้อความไทยของช่วงเวลาใด ๆ — ใช้กับค่าที่ไม่ตรง preset (ห้ามปล่อยให้ select ว่าง) */
export function describePeriod(period?: BiPeriodParam | null): string {
  if (!period?.grain) return "";
  if (period.from || period.to) {
    return `ช่วงที่กำหนดเอง ${thaiDate(period.from)}${period.to ? ` – ${thaiDate(period.to)}` : ""}`.trim();
  }
  const preset = PERIOD_PRESETS.find((p) => p.value === `${period.grain}:${period.offset ?? 0}`);
  if (preset) return preset.label;

  const grain = GRAIN_LABEL_TH[period.grain] ?? period.grain;
  const offset = period.offset ?? 0;
  if (offset === 0) return `${grain}นี้`;
  if (offset === -1) return `${grain}ที่แล้ว`;
  if (offset < 0) return `ย้อนหลัง ${Math.abs(offset)} ${grain}`;
  return `ถัดไป ${offset} ${grain}`;
}

/** ตัวเลือกของ select — เติมค่าปัจจุบันเข้าไปด้วยถ้าไม่ตรง preset (กัน placeholder หลอกตา) */
function periodOptionsOf(period?: BiPeriodParam | null): Array<{ value: string; label: string }> {
  const options = PERIOD_PRESETS.map((p) => ({ value: p.value, label: p.label }));
  const key = periodKeyOf(period);
  if (key && !options.some((o) => o.value === key)) {
    options.unshift({ value: key, label: describePeriod(period) });
  }
  return options;
}

export interface DashboardCardProps {
  item: BiDashboardItem;
  /** ผลจากเซิร์ฟเวอร์ — `null` = ยังไม่ได้คำนวณ */
  result: BiCardResult | null;
  loading: boolean;
  canWrite: boolean;
  canMoveUp: boolean;
  canMoveDown: boolean;
  /** metric รายละเอียดที่เจาะต่อได้ (ไม่มี = คลิกจุดบนกราฟไม่ได้) */
  drill?: BiDrillMetricInfo;
  /** true = เปิดแดชบอร์ดครบเพดานของวันนี้ → การ์ดยัง "ไม่ได้คำนวณ" (ไม่ใช่ "กำลังโหลด") */
  quotaExceeded?: boolean;
  onMove: (direction: "up" | "down") => void;
  onEdit: () => void;
  onChangePeriod: (period: BiPeriodParam) => void;
  onDrill: (point: { dimension: string; value: string }) => void;
}

export function DashboardCard(props: DashboardCardProps) {
  const { item, result, loading, canWrite } = props;
  const ok = result?.state === "ok" && result.result;
  const heading = item.title?.trim() || (ok ? result!.result!.metric.label_th : "การ์ด");
  // ⚠️ ตัวเลือกช่วงเวลาอ่านจาก `item.params` (ไม่ใช่ `result.params`) — การ์ดที่รันไม่ผ่าน
  // ต้องยังเปลี่ยนช่วงกลับได้ ไม่งั้นผู้ใช้ตันถาวรจนกว่าจะลบการ์ดทิ้ง
  const hasPeriod = Boolean(item.params.period?.grain);

  return (
    <section className="flex min-w-0 flex-col gap-3 rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
      <header className="flex items-start justify-between gap-2">
        {/* หัวข้อไทยยาว ๆ บนจอ 375px: ตัดคำตามช่องว่างก่อน (break-words) + ไม่ใส่ยัติภังค์
            → ไม่ตกบรรทัดกลางคำ และไม่ดันความกว้างการ์ด */}
        <Title
          as="h3"
          className="min-w-0 hyphens-none break-words text-sm font-medium text-gray-900"
        >
          {heading}
        </Title>
        {canWrite ? (
          <div className="flex shrink-0 items-center gap-0.5">
            <Button
              variant="ghost"
              size="icon"
              aria-label="ย้ายการ์ดขึ้น"
              disabled={!props.canMoveUp || loading}
              onClick={() => props.onMove("up")}
            >
              <ChevronUp className="h-4 w-4" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              aria-label="ย้ายการ์ดลง"
              disabled={!props.canMoveDown || loading}
              onClick={() => props.onMove("down")}
            >
              <ChevronDown className="h-4 w-4" />
            </Button>
            <Button variant="ghost" size="icon" aria-label="แก้ไขการ์ด" onClick={props.onEdit}>
              <Pencil className="h-4 w-4" />
            </Button>
          </div>
        ) : null}
      </header>

      {hasPeriod && canWrite ? (
        <div className="flex flex-wrap items-center gap-2">
          <Text className="text-xs text-gray-500">ช่วงเวลา</Text>
          <CustomSelect
            className="w-44"
            value={periodKeyOf(item.params.period)}
            placeholder="เลือกช่วงเวลา"
            onChange={(v) => {
              const preset = PERIOD_PRESETS.find((p) => p.value === v);
              if (preset) props.onChangePeriod(preset.period);
            }}
            options={periodOptionsOf(item.params.period)}
          />
        </div>
      ) : null}

      {loading ? (
        <CardSkeleton />
      ) : !result ? (
        <CardNotice
          message={
            props.quotaExceeded
              ? "ยังไม่ได้คำนวณ — เปิดแดชบอร์ดครบเพดานของวันนี้แล้ว"
              : "ยังไม่ได้คำนวณการ์ดนี้"
          }
          badge="ยังไม่ได้คำนวณ"
          tone="neutral"
        />
      ) : result.state !== "ok" || !result.result ? (
        <CardNotice
          message={result.message}
          badge={
            result.state === "forbidden"
              ? "สิทธิ์ไม่พอ"
              : result.state === "metric_unavailable"
                ? "ตัวชี้วัดปิดชั่วคราว"
                : "แสดงผลไม่สำเร็จ"
          }
          tone={result.state === "error" ? "warning" : "neutral"}
        />
      ) : (
        <CardBody {...props} data={result.result} />
      )}
    </section>
  );
}

/** ชนิดกราฟที่ ChartRenderer ส่ง `onPointClick` ให้จริง — ชนิดอื่นกดไม่ติด (ห้ามชวนให้กด) */
const CLICKABLE_CHART_TYPES: ChartType[] = ["bar", "donut", "funnel"];

function CardBody({ data, drill, onDrill }: DashboardCardProps & { data: BiDirectResult }) {
  const dimension = data.params.dimension ?? null;
  const coverage = React.useMemo(() => coverageOf(data.rows), [data.rows]);
  const canDrill = Boolean(
    drill &&
    dimension &&
    drill.filters.some((f) => f.key === dimension) &&
    data.chart?.x &&
    CLICKABLE_CHART_TYPES.includes(data.chart.type),
  );

  return (
    <>
      {data.truncated ? (
        <div className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2">
          <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />
          <Text className="text-xs leading-5 text-amber-700">
            ตัวเลขนี้ยังไม่ครบทุกแถว — ระบบตัดผลที่เพดาน กรุณาแคบช่วงเวลาหรือเงื่อนไขลง
          </Text>
        </div>
      ) : null}

      {data.chart ? (
        <ChartRenderer
          spec={data.chart}
          rows={data.rows}
          onPointClick={
            canDrill && dimension ? (p) => onDrill({ dimension, value: p.value }) : undefined
          }
        />
      ) : null}

      {canDrill ? (
        <Text className="px-1 text-xs text-gray-500">กดแท่งเพื่อดูรายการเบื้องหลัง</Text>
      ) : null}

      {/* ความครอบคลุม — กับดัก D1: ถ้าไม่บอกจำนวนใบที่นับได้ ผู้ใช้จะเอา "รวม VAT" ลบ
          "ก่อน VAT" แล้วเข้าใจว่าส่วนต่างคือภาษี ซึ่งผิด (logic เดียวกับหน้าแชท) */}
      {coverage ? <CoverageLine coverage={coverage} /> : null}

      <CompareLine data={data} />

      <RawRows
        rows={data.rows}
        rowCount={data.row_count}
        columnLabels={columnLabelsOf(data)}
        title="ข้อมูลดิบของการ์ดนี้"
      />

      <DefinitionLine text={data.definition_line} />
    </>
  );
}

/** ผลรวมของ measure หลักในผลลัพธ์ (ใช้เทียบช่วงก่อนแบบ deterministic) */
function sumMeasure(rows: Array<Record<string, unknown>>, key: string): number | null {
  let total = 0;
  let found = false;
  for (const r of rows) {
    const v = Number(r[key]);
    if (Number.isFinite(v)) {
      total += v;
      found = true;
    }
  }
  return found ? total : null;
}

function CompareLine({ data }: { data: BiDirectResult }) {
  const compare = data.compare;
  const key = data.chart?.series[0]?.key ?? "value";
  if (!compare) return null;

  const current = sumMeasure(data.rows, key);
  const previous = sumMeasure(compare.rows, key);
  if (current === null || previous === null) return null;

  const delta = current - previous;
  const pct = previous !== 0 ? (delta / Math.abs(previous)) * 100 : null;
  const unit = data.metric.unit;
  const decimals = data.chart?.decimals ?? data.metric.unit_decimals;

  // ทิศทาง: "เพิ่มขึ้น" ไม่ได้แปลว่าดีเสมอ (ต้นทุนซื้อ/เงินคืนผู้ลงทุน) →
  // default = กลาง ใช้ลูกศรบอกทิศทาง · ทาสีเฉพาะ metric ที่ประกาศทิศทางไว้ชัด
  const direction = metricDirectionOf(data.metric.key);
  const good =
    direction === null || delta === 0
      ? null
      : direction === "higher_better"
        ? delta > 0
        : delta < 0;
  const tone = good === null ? "text-gray-900" : good ? "text-green-600" : "text-red-600";
  const Icon = delta > 0 ? ArrowUp : delta < 0 ? ArrowDown : Minus;
  const directionLabel =
    delta > 0 ? "เพิ่มขึ้นจากช่วงก่อน" : delta < 0 ? "ลดลงจากช่วงก่อน" : "เท่าเดิมกับช่วงก่อน";

  return (
    <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1 rounded-lg border border-gray-200 bg-gray-50 px-3 py-2">
      <Text className="text-xs text-gray-500">เทียบ{compare.label_th}</Text>
      <span className={cn("inline-flex items-baseline gap-1 text-sm font-medium", tone)}>
        <Icon className="h-3.5 w-3.5 self-center" role="img" aria-label={directionLabel} />
        <span className="font-mono tabular-nums">
          {delta > 0 ? "+" : ""}
          {formatMetricValue(delta, unit, { decimals })}
        </span>
        {pct !== null ? (
          <span className="text-xs tabular-nums">
            ({pct > 0 ? "+" : ""}
            {formatMetricValue(pct, "percent", { decimals: 1 })})
          </span>
        ) : null}
      </span>
      <Text className="text-xs tabular-nums text-gray-500">
        ช่วงก่อน {formatMetricValue(previous, unit, { decimals })}
      </Text>
    </div>
  );
}

/** ชื่อคอลัมน์ไทยของตารางดิบ — เอาจาก chart spec (เหมือน AnswerCard) */
function columnLabelsOf(data: BiDirectResult): Record<string, string> {
  const map: Record<string, string> = {};
  if (!data.chart) return map;
  if (data.chart.x) map[data.chart.x] = data.chart.title;
  for (const s of data.chart.series) map[s.key] = s.label_th;
  return map;
}

function CardNotice({
  message,
  badge,
  tone,
}: {
  message: string | null;
  /** ป้ายสถานะแบบข้อความมาตรฐาน — ห้ามโชว์ error ดิบ/ชื่อ metric */
  badge: string;
  tone: "neutral" | "warning";
}) {
  return (
    <div className="space-y-2 rounded-lg border border-gray-200 bg-gray-50 px-3 py-4">
      <div className="flex items-start gap-2">
        <CircleAlert className="mt-0.5 h-4 w-4 shrink-0 text-gray-500" />
        <Text className="text-sm leading-6 text-gray-700">
          {message ?? "แสดงข้อมูลการ์ดนี้ไม่สำเร็จ"}
        </Text>
      </div>
      <StatusBadge tone={tone}>{badge}</StatusBadge>
    </div>
  );
}

/** ระหว่างคำนวณ — skeleton เท่านั้น (DESIGN §9) */
function CardSkeleton() {
  return (
    <div className="animate-pulse space-y-2.5">
      <div className="h-3 w-1/3 rounded bg-gray-100" />
      <div className="h-40 rounded-lg bg-gray-100" />
      <div className="h-3 w-2/3 rounded bg-gray-100" />
    </div>
  );
}
