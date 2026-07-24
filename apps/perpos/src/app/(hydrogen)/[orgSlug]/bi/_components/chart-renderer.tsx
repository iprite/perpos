"use client";

/**
 * ChartRenderer — เรนเดอร์คำตอบเป็นกราฟตาม `BiChartSpec.type` (contract §3.3)
 *
 * ชนิดที่รองรับ: stat · line · bar (แนวนอนเมื่อชื่อหมวดยาว — ชื่อไทยยาวเสมอ) ·
 * donut · funnel · stacked_bar · heatmap · table
 *
 * สี: **ห้ามฮาร์ดโค้ด hex** — recharts รับได้แต่ค่าสีจริง (ไม่ใช่ class) จึงอ่าน
 * CSS variable ของพาเลตต์จาก `globals.css` (`--primary-default` = CHARCOAL ฯลฯ)
 * ผ่าน `rgb(var(--…))` → สียังถูกล็อกที่ token เดียวกับทั้งแอป (DESIGN §2)
 */

import * as React from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { collapseToTopN } from "@/lib/bi/chart";
import { formatMetricValue } from "@/lib/bi/format";
import type { BiChartSpec } from "@/lib/bi/types";
import { Text } from "@/components/ui/typography";
import { StatCard } from "@/components/ui/stat-card";
import {
  Table,
  TableBody,
  TableCell,
  TableEmpty,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import cn from "@core/utils/class-names";

type Row = Record<string, unknown>;

/** พาเลตต์กราฟ — อ้าง token ใน globals.css (DESIGN §2) ไม่ใช่ hex ดิบ */
const SERIES_COLORS = [
  "rgb(var(--primary-default))", // CHARCOAL — ชุดหลัก
  "rgb(var(--green-default))", // MINT
  "rgb(var(--orange-default))", // BITTERSWEET
  "rgb(var(--gray-500))", // DARK GRAY
  "rgb(var(--red-default))", // RUBY
  "rgb(var(--orange-dark))", // ส้มเข้ม (gray-300 อ่อนเกินไปบนพื้นขาว — contrast ไม่ผ่าน)
];
const GRID_COLOR = "rgb(var(--gray-200))";
const AXIS_COLOR = "rgb(var(--gray-500))";

/** ความยาวชื่อหมวดที่ถือว่า "ยาว" → สลับ bar เป็นแนวนอน (§3.3) */
const LONG_LABEL_CHARS = 8;

function labelOf(row: Row, key: string | null): string {
  if (!key) return "";
  const v = row[key];
  return v === null || v === undefined ? "—" : String(v);
}

function numberOf(row: Row, key: string): number {
  const n = Number(row[key]);
  return Number.isFinite(n) ? n : 0;
}

/**
 * คลาสตัวเลขในเซลล์ — DESIGN §5 ข้อ 8: `font-mono` ทำให้ตัวอักษรไทยเพี้ยน
 * → หน่วย `days` (ค่าที่ลงท้ายด้วย "วัน") ใช้ `tabular-nums` เฉย ๆ ไม่ใส่ mono
 */
function numberClass(unit: BiChartSpec["unit"]): string {
  return unit === "days" ? "tabular-nums" : "font-mono tabular-nums";
}

/** จัดรูปแบบค่าให้ tooltip/แกน — ใช้ formatter กลางของ BI (ยอดลบ = U+2212) */
function useValueFormatter(spec: BiChartSpec) {
  return React.useCallback(
    (v: number | string) => formatMetricValue(Number(v), spec.unit, { decimals: spec.decimals }),
    [spec.unit, spec.decimals],
  );
}

export function ChartRenderer({
  spec,
  rows,
  emptyMessage = "ไม่มีข้อมูลในช่วงที่เลือก",
}: {
  spec: BiChartSpec;
  rows: Row[];
  /** ข้อความเมื่อไม่มีแถว — เคสประวัติที่ไม่เก็บข้อมูลรายแถวต้องสื่อให้ตรง ไม่ใช่ "ไม่มีข้อมูล" */
  emptyMessage?: string;
}) {
  const fmt = useValueFormatter(spec);

  const data = React.useMemo(() => {
    if (!spec.top_n || !spec.x || spec.series.length === 0) return rows;
    return collapseToTopN(rows, {
      labelKey: spec.x,
      valueKey: spec.series[0].key,
      topN: spec.top_n,
      otherLabel: spec.other_label,
    });
  }, [rows, spec]);

  if (spec.type === "stat") return <StatChart spec={spec} rows={rows} />;
  if (rows.length === 0) {
    return (
      <Text className="rounded-xl border border-gray-200 bg-gray-50 px-4 py-6 text-center text-sm text-gray-500">
        {emptyMessage}
      </Text>
    );
  }

  switch (spec.type) {
    case "line":
      return <LineChartView spec={spec} rows={data} fmt={fmt} />;
    case "donut":
      return <DonutChartView spec={spec} rows={data} fmt={fmt} />;
    case "funnel":
      return <FunnelView spec={spec} rows={data} fmt={fmt} />;
    case "heatmap":
      return <HeatmapView spec={spec} rows={data} fmt={fmt} />;
    case "stacked_bar":
      return <BarChartView spec={spec} rows={data} fmt={fmt} stacked />;
    case "bar":
      return <BarChartView spec={spec} rows={data} fmt={fmt} />;
    case "table":
    default:
      return <ChartTableView spec={spec} rows={data} fmt={fmt} />;
  }
}

// ─── stat ──────────────────────────────────────────────────────────────────

function StatChart({ spec, rows }: { spec: BiChartSpec; rows: Row[] }) {
  const row = rows[0] ?? {};
  const seriesKey = spec.series[0]?.key ?? "";
  const value = numberOf(row, seriesKey);
  const tone = value < 0 ? "negative" : "info";

  return (
    <div className="grid grid-cols-1 gap-3 sm:max-w-sm">
      <StatCard
        label={spec.series[0]?.label_th ?? spec.title}
        value={formatMetricValue(value, spec.unit, { decimals: spec.decimals })}
        tone={tone}
        valueColored
      />
    </div>
  );
}

// ─── line ──────────────────────────────────────────────────────────────────

interface ViewProps {
  spec: BiChartSpec;
  rows: Row[];
  fmt: (v: number | string) => string;
}

function LineChartView({ spec, rows, fmt }: ViewProps) {
  return (
    <ChartFrame>
      <LineChart data={rows} margin={{ top: 8, right: 12, bottom: 4, left: 4 }}>
        <CartesianGrid strokeDasharray="3 3" stroke={GRID_COLOR} vertical={false} />
        <XAxis
          dataKey={spec.x ?? undefined}
          tick={{ fontSize: 11, fill: AXIS_COLOR }}
          tickLine={false}
          axisLine={{ stroke: GRID_COLOR }}
        />
        <YAxis
          tick={{ fontSize: 11, fill: AXIS_COLOR }}
          tickLine={false}
          axisLine={false}
          width={72}
          tickFormatter={(v) => formatMetricValue(Number(v), spec.unit, { withUnit: false })}
        />
        <Tooltip formatter={(v) => fmt(v as number)} />
        {spec.series.length > 1 ? <Legend wrapperStyle={{ fontSize: 12 }} /> : null}
        {spec.series.map((s, i) => (
          <Line
            key={s.key}
            type="monotone"
            dataKey={s.key}
            name={s.label_th}
            stroke={SERIES_COLORS[i % SERIES_COLORS.length]}
            strokeWidth={2}
            dot={false}
          />
        ))}
      </LineChart>
    </ChartFrame>
  );
}

// ─── bar / stacked bar ─────────────────────────────────────────────────────

function BarChartView({ spec, rows, fmt, stacked }: ViewProps & { stacked?: boolean }) {
  // ชื่อหมวดไทยยาว → แนวนอน (§3.3)
  const horizontal = !stacked && rows.some((r) => labelOf(r, spec.x).length > LONG_LABEL_CHARS);

  const height = horizontal ? Math.max(180, rows.length * 38 + 40) : 260;

  return (
    <ChartFrame height={height}>
      <BarChart
        data={rows}
        layout={horizontal ? "vertical" : "horizontal"}
        margin={{ top: 8, right: 16, bottom: 4, left: horizontal ? 8 : 4 }}
      >
        <CartesianGrid
          strokeDasharray="3 3"
          stroke={GRID_COLOR}
          vertical={horizontal}
          horizontal={!horizontal}
        />
        {horizontal ? (
          <>
            <XAxis
              type="number"
              tick={{ fontSize: 11, fill: AXIS_COLOR }}
              tickLine={false}
              axisLine={false}
              tickFormatter={(v) => formatMetricValue(Number(v), spec.unit, { withUnit: false })}
            />
            <YAxis
              type="category"
              dataKey={spec.x ?? undefined}
              tick={{ fontSize: 11, fill: AXIS_COLOR }}
              tickLine={false}
              axisLine={false}
              width={110}
            />
          </>
        ) : (
          <>
            <XAxis
              dataKey={spec.x ?? undefined}
              tick={{ fontSize: 11, fill: AXIS_COLOR }}
              tickLine={false}
              axisLine={{ stroke: GRID_COLOR }}
            />
            <YAxis
              tick={{ fontSize: 11, fill: AXIS_COLOR }}
              tickLine={false}
              axisLine={false}
              width={72}
              tickFormatter={(v) => formatMetricValue(Number(v), spec.unit, { withUnit: false })}
            />
          </>
        )}
        <Tooltip formatter={(v) => fmt(v as number)} cursor={{ fill: "rgb(var(--gray-100))" }} />
        {spec.series.length > 1 ? <Legend wrapperStyle={{ fontSize: 12 }} /> : null}
        {spec.series.map((s, i) => (
          <Bar
            key={s.key}
            dataKey={s.key}
            name={s.label_th}
            stackId={stacked ? "a" : undefined}
            fill={SERIES_COLORS[i % SERIES_COLORS.length]}
            radius={horizontal ? [0, 4, 4, 0] : [4, 4, 0, 0]}
            maxBarSize={44}
          />
        ))}
      </BarChart>
    </ChartFrame>
  );
}

// ─── donut ─────────────────────────────────────────────────────────────────

function DonutChartView({ spec, rows, fmt }: ViewProps) {
  const key = spec.series[0]?.key ?? "";
  return (
    <ChartFrame height={260}>
      <PieChart>
        <Tooltip formatter={(v) => fmt(v as number)} />
        <Legend wrapperStyle={{ fontSize: 12 }} />
        <Pie
          data={rows}
          dataKey={key}
          nameKey={spec.x ?? undefined}
          innerRadius={54}
          outerRadius={88}
          paddingAngle={2}
        >
          {rows.map((r, i) => (
            <Cell
              key={`${labelOf(r, spec.x)}-${i}`}
              fill={SERIES_COLORS[i % SERIES_COLORS.length]}
            />
          ))}
        </Pie>
      </PieChart>
    </ChartFrame>
  );
}

// ─── funnel (แถบลด — pipeline ตามลำดับขั้น) ─────────────────────────────────

function FunnelView({ spec, rows, fmt }: ViewProps) {
  const key = spec.series[0]?.key ?? "";
  const max = Math.max(...rows.map((r) => Math.abs(numberOf(r, key))), 1);

  return (
    <div className="space-y-2">
      {rows.map((r, i) => {
        const value = numberOf(r, key);
        const pct = Math.max(2, Math.round((Math.abs(value) / max) * 100));
        return (
          <div key={`${labelOf(r, spec.x)}-${i}`} className="space-y-1">
            <div className="flex items-baseline justify-between gap-3">
              <Text className="truncate text-sm text-gray-700">{labelOf(r, spec.x)}</Text>
              <Text className={cn("shrink-0 text-sm text-gray-900", numberClass(spec.unit))}>
                {fmt(value)}
              </Text>
            </div>
            <div className="h-2.5 w-full overflow-hidden rounded-full bg-gray-100">
              <div
                className="h-full rounded-full bg-primary transition-all duration-300"
                style={{ width: `${pct}%` }}
              />
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ─── heatmap (สองมิติ × เวลา — ความเข้มตามค่า) ─────────────────────────────

function HeatmapView({ spec, rows, fmt }: ViewProps) {
  const key = spec.series[0]?.key ?? "";
  const max = Math.max(...rows.map((r) => Math.abs(numberOf(r, key))), 1);
  const secondKey = spec.series[1]?.key;

  return (
    <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
      {rows.map((r, i) => {
        const value = numberOf(r, key);
        const ratio = Math.abs(value) / max;
        const tone =
          ratio > 0.75
            ? "bg-primary text-white"
            : ratio > 0.5
              ? "bg-gray-300 text-gray-900"
              : ratio > 0.25
                ? "bg-gray-200 text-gray-900"
                : "bg-gray-100 text-gray-600";
        return (
          <div
            key={`${labelOf(r, spec.x)}-${i}`}
            className={cn("min-w-0 rounded-lg px-3 py-2.5", tone)}
          >
            <div className="truncate text-xs opacity-90">{labelOf(r, spec.x)}</div>
            <div className={cn("text-sm", numberClass(spec.unit))}>{fmt(value)}</div>
            {secondKey ? (
              <div className="truncate text-xs opacity-80">{labelOf(r, secondKey)}</div>
            ) : null}
          </div>
        );
      })}
    </div>
  );
}

// ─── table (มิติเดียวหลาย measure / grain รายการ) ──────────────────────────

function ChartTableView({ spec, rows, fmt }: ViewProps) {
  const cols = spec.series;
  return (
    <Table className="shadow-sm">
      <TableHeader>
        <TableRow>
          {spec.x ? <TableHead>{spec.title}</TableHead> : null}
          {cols.map((c) => (
            <TableHead key={c.key} align="right">
              {c.label_th}
            </TableHead>
          ))}
        </TableRow>
      </TableHeader>
      <TableBody>
        {rows.length === 0 ? (
          <TableEmpty colSpan={cols.length + (spec.x ? 1 : 0)}>
            ไม่มีข้อมูลในช่วงที่เลือก
          </TableEmpty>
        ) : (
          rows.map((r, i) => (
            <TableRow key={`${labelOf(r, spec.x)}-${i}`}>
              {spec.x ? <TableCell>{labelOf(r, spec.x)}</TableCell> : null}
              {cols.map((c) =>
                // เซลล์ผสมเลข+คำไทย ("N วัน") ห้ามใช้ `tabular` (= font-mono) — DESIGN §5 ข้อ 8
                spec.unit === "days" ? (
                  <TableCell key={c.key} align="right" className="tabular-nums">
                    {fmt(numberOf(r, c.key))}
                  </TableCell>
                ) : (
                  <TableCell key={c.key} align="right" tabular>
                    {fmt(numberOf(r, c.key))}
                  </TableCell>
                ),
              )}
            </TableRow>
          ))
        )}
      </TableBody>
    </Table>
  );
}

// ─── frame ─────────────────────────────────────────────────────────────────

function ChartFrame({ children, height = 260 }: { children: React.ReactElement; height?: number }) {
  return (
    <div className="min-w-0" style={{ height }}>
      <ResponsiveContainer width="100%" height="100%">
        {children}
      </ResponsiveContainer>
    </div>
  );
}
