"use client";

/**
 * แท็บ "เครื่องเซิร์ฟเวอร์" ของ /admin/mail — การใช้ทรัพยากรของเครื่องเมล (Contabo)
 *
 * 🪤 ตัวเลขทุกตัวมาจาก **heartbeat ของเครื่องเอง** ไม่ใช่ Contabo API (API ของ Contabo
 *    ไม่มี usage ให้ดึง — ดูเหตุผลเต็มใน lib/mail/server-metrics.ts)
 *    ⇒ heartbeat ขาด = การ์ดขึ้น "—" ไม่ใช่ 0 (ไม่มีข้อมูล ≠ ว่าง)
 */

import { useMemo, useState } from "react";
import {
  Activity,
  AlertTriangle,
  Archive,
  Cpu,
  Database,
  HardDrive,
  MemoryStick,
  Network,
  Timer,
} from "lucide-react";
import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { SegmentedControl } from "@/components/ui/segmented";
import { StatCard } from "@/components/ui/stat-card";
import { StatusBadge } from "@/components/ui/badge";
import type { MailServerMetrics } from "@/lib/mail/server-metrics-types";
// 🪤 สูตร/ชนิดต้องมาจาก `-calc` (ไม่มี server-only) — import จาก server-metrics.ts ตรง ๆ หน้าจะพัง
import {
  daysUntilDiskFull,
  diskGrowthPerDay,
  trafficDelta,
  type MailServerSample,
} from "@/lib/mail/server-metrics-calc";

const RANGES = [
  { value: "24h", label: "24 ชม.", hours: 24 },
  { value: "7d", label: "7 วัน", hours: 24 * 7 },
  { value: "30d", label: "30 วัน", hours: 24 * 30 },
] as const;
type Range = (typeof RANGES)[number]["value"];

/** heartbeat มาทุก 5 นาที — เกินนี้ถือว่าค่าที่เห็นไม่ใช่ปัจจุบัน */
const STALE_MS = 20 * 60 * 1000;
const DISK_WARN_PCT = 85;
const MEM_WARN_PCT = 90;

function fmtBytes(bytes: number | null, digits = 1): string {
  if (bytes === null) return "—";
  const units = ["B", "KB", "MB", "GB", "TB"];
  let v = Math.abs(bytes);
  let i = 0;
  while (v >= 1024 && i < units.length - 1) {
    v /= 1024;
    i += 1;
  }
  return `${(bytes < 0 ? -v : v).toFixed(i === 0 ? 0 : digits)} ${units[i]}`;
}

function fmtPct(n: number | null): string {
  return n === null ? "—" : `${n.toFixed(0)}%`;
}

function fmtUptime(seconds: number | null): string {
  if (seconds === null) return "—";
  const d = Math.floor(seconds / 86_400);
  const h = Math.floor((seconds % 86_400) / 3600);
  return d > 0 ? `${d} วัน ${h} ชม.` : `${h} ชม.`;
}

function fmtTime(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleString("th-TH", { dateStyle: "medium", timeStyle: "short" });
}

function tone(pct: number | null, warn: number): "info" | "warning" | "negative" {
  if (pct === null) return "info";
  if (pct >= warn) return "negative";
  if (pct >= warn - 15) return "warning";
  return "info";
}

/** กราฟเส้นเดียว — ค่าที่ไม่มีข้อมูลถูกตัดออกก่อน (recharts จะได้ไม่ลากลงศูนย์) */
function Chart({
  data,
  unit,
  color,
  title,
  format,
}: {
  data: { t: string; v: number }[];
  unit: string;
  color: string;
  title: string;
  format: (v: number) => string;
}) {
  return (
    <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
      <p className="mb-3 text-sm font-medium text-gray-900">{title}</p>
      {data.length < 2 ? (
        <div className="flex h-[180px] items-center justify-center text-sm text-gray-400">
          ยังเก็บข้อมูลไม่พอวาดกราฟ
        </div>
      ) : (
        <ResponsiveContainer width="100%" height={180}>
          <AreaChart data={data} margin={{ top: 4, right: 8, bottom: 0, left: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#F5F7FA" vertical={false} />
            <XAxis
              dataKey="t"
              tick={{ fontSize: 11, fill: "#656D78" }}
              tickLine={false}
              axisLine={false}
              minTickGap={40}
            />
            <YAxis
              tick={{ fontSize: 11, fill: "#656D78" }}
              tickLine={false}
              axisLine={false}
              width={52}
              tickFormatter={format}
            />
            <Tooltip
              formatter={(v: number | string) => [`${format(Number(v))} ${unit}`.trim(), ""]}
              contentStyle={{ fontSize: 12, borderRadius: 8, borderColor: "#CCD1D9" }}
            />
            <Area
              type="monotone"
              dataKey="v"
              stroke={color}
              fill={color}
              fillOpacity={0.12}
              strokeWidth={2}
            />
          </AreaChart>
        </ResponsiveContainer>
      )}
    </div>
  );
}

export function AdminMailServerTab({ metrics }: { metrics: MailServerMetrics }) {
  const [range, setRange] = useState<Range>("7d");
  const hours = RANGES.find((r) => r.value === range)?.hours ?? 168;

  const series = useMemo(() => {
    const cutoff = Date.now() - hours * 3_600_000;
    return metrics.series.filter((s) => new Date(s.takenAt).getTime() >= cutoff);
  }, [metrics.series, hours]);

  const latest = metrics.latest;
  const heartbeatAge = metrics.heartbeatAt
    ? Date.now() - new Date(metrics.heartbeatAt).getTime()
    : null;
  const stale = heartbeatAge === null || heartbeatAge > STALE_MS;

  const memPct =
    latest?.memUsedMb != null && latest?.memTotalMb
      ? (latest.memUsedMb / latest.memTotalMb) * 100
      : null;
  const cpuPct =
    latest?.load1 != null && latest?.cpuCount ? (latest.load1 / latest.cpuCount) * 100 : null;

  const growth = useMemo(() => diskGrowthPerDay(series), [series]);
  const daysLeft = daysUntilDiskFull(latest, growth);
  const traffic = useMemo(() => trafficDelta(series), [series]);

  const label = (s: MailServerSample) =>
    new Date(s.takenAt).toLocaleString("th-TH", {
      day: "2-digit",
      month: "short",
      hour: "2-digit",
      minute: "2-digit",
    });

  const pick = (get: (s: MailServerSample) => number | null) =>
    series.filter((s) => get(s) !== null).map((s) => ({ t: label(s), v: get(s) as number }));

  const issueList = Object.values(metrics.issues);

  return (
    <div className="space-y-4">
      {stale && (
        <div className="flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          <div>
            <p className="font-medium">
              {metrics.heartbeatAt
                ? `ไม่ได้รับสัญญาณจากเครื่องมา ${Math.round((heartbeatAge ?? 0) / 60_000)} นาที`
                : "ยังไม่เคยได้รับสัญญาณจากเครื่องเมล"}
            </p>
            <p className="mt-0.5 text-xs">
              ตัวเลขด้านล่างเป็นค่าล่าสุดที่เคยได้ ไม่ใช่สถานะปัจจุบัน — ตรวจ{" "}
              <code className="rounded bg-amber-100 px-1">stalwart-heartbeat.timer</code> บนเครื่อง
            </p>
          </div>
        </div>
      )}

      {issueList.length > 0 && (
        <div className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">
          <p className="mb-1 flex items-center gap-2 font-medium">
            <AlertTriangle className="h-4 w-4" /> ปัญหาที่ตรวจพบรอบล่าสุด (
            {fmtTime(metrics.lastCheckAt)})
          </p>
          <ul className="ms-6 list-disc space-y-0.5">
            {issueList.map((m) => (
              <li key={m}>{m}</li>
            ))}
          </ul>
        </div>
      )}

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          icon={<HardDrive className="h-4 w-4" />}
          label="ดิสก์ที่ใช้"
          value={fmtPct(latest?.diskPct ?? null)}
          sub={
            latest?.diskUsedBytes != null && latest?.diskTotalBytes != null
              ? `${fmtBytes(latest.diskUsedBytes)} จาก ${fmtBytes(latest.diskTotalBytes, 0)}`
              : "ยังไม่มีข้อมูล"
          }
          tone={tone(latest?.diskPct ?? null, DISK_WARN_PCT)}
          valueColored
        />
        <StatCard
          icon={<MemoryStick className="h-4 w-4" />}
          label="หน่วยความจำ"
          value={fmtPct(memPct)}
          sub={
            latest?.memUsedMb != null && latest?.memTotalMb != null
              ? `${latest.memUsedMb.toLocaleString("th-TH")} / ${latest.memTotalMb.toLocaleString("th-TH")} MB`
              : "ยังไม่มีข้อมูล"
          }
          tone={tone(memPct, MEM_WARN_PCT)}
          valueColored
        />
        <StatCard
          icon={<Cpu className="h-4 w-4" />}
          label="ภาระ CPU (1 นาที)"
          value={cpuPct === null ? "—" : `${cpuPct.toFixed(0)}%`}
          sub={
            latest?.load1 != null
              ? `load ${latest.load1.toFixed(2)} · ${latest.cpuCount ?? "?"} คอร์`
              : "ยังไม่มีข้อมูล"
          }
          tone={tone(cpuPct, 100)}
          valueColored
        />
        <StatCard
          icon={<Database className="h-4 w-4" />}
          label="ฐานข้อมูลเมล"
          value={fmtBytes(latest?.storeBytes ?? null)}
          sub={
            growth === null
              ? "ยังประเมินอัตราโตไม่ได้"
              : growth > 0
                ? `ดิสก์โต ${fmtBytes(growth)}/วัน${daysLeft !== null ? ` · เต็มใน ~${daysLeft} วัน` : ""}`
                : `ดิสก์ลดลง ${fmtBytes(-growth)}/วัน`
          }
          tone="info"
        />
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          icon={<Activity className="h-4 w-4" />}
          label="บริการ Stalwart"
          value={
            latest?.serviceActive === null || latest === null
              ? "—"
              : latest.serviceActive
                ? "ทำงาน"
                : "หยุด"
          }
          sub={`สัญญาณล่าสุด ${fmtTime(metrics.heartbeatAt)}`}
          tone={latest?.serviceActive === false ? "negative" : "positive"}
          valueColored
        />
        <StatCard
          icon={<Network className="h-4 w-4" />}
          label={`ทราฟฟิกในช่วง ${RANGES.find((r) => r.value === range)?.label}`}
          value={traffic ? fmtBytes(traffic.rx + traffic.tx) : "—"}
          sub={
            traffic
              ? `เข้า ${fmtBytes(traffic.rx)} · ออก ${fmtBytes(traffic.tx)}`
              : "ยังไม่มีข้อมูล"
          }
          tone="info"
        />
        <StatCard
          icon={<Archive className="h-4 w-4" />}
          label="สำรองข้อมูลล่าสุด"
          value={
            latest?.backupAgeHours == null ? "—" : `${Math.round(latest.backupAgeHours)} ชม.ก่อน`
          }
          sub={
            latest?.backupSizeMb == null
              ? "ยังไม่มีข้อมูล"
              : `ขนาด ${latest.backupSizeMb.toFixed(0)} MB`
          }
          tone={
            latest?.backupAgeHours != null && latest.backupAgeHours > 30 ? "negative" : "positive"
          }
          valueColored
        />
        <StatCard
          icon={<Timer className="h-4 w-4" />}
          label="เปิดเครื่องต่อเนื่อง"
          value={fmtUptime(latest?.uptimeSeconds ?? null)}
          sub={
            latest?.smtp25Listening === null || latest === null
              ? "ไม่ทราบสถานะพอร์ต 25"
              : latest.smtp25Listening
                ? "พอร์ต 25 กำลังฟังอยู่"
                : "ไม่มีอะไรฟังพอร์ต 25"
          }
          tone={latest?.smtp25Listening === false ? "negative" : "info"}
        />
      </div>

      <div className="flex items-center justify-between gap-3">
        <SegmentedControl
          value={range}
          onChange={(v) => setRange(v as Range)}
          ariaLabel="ช่วงเวลาที่ดู"
          options={RANGES.map((r) => ({ value: r.value, label: r.label }))}
        />
        <span className="text-xs text-gray-500">เก็บสถิติทุก 5 นาที · ย้อนหลังได้ 30 วัน</span>
      </div>

      <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
        <Chart
          title="ดิสก์ที่ใช้ (%)"
          data={pick((s) => s.diskPct)}
          unit="%"
          color="#5D9CEC"
          format={(v) => v.toFixed(0)}
        />
        <Chart
          title="ขนาดฐานข้อมูลเมล"
          data={pick((s) => (s.storeBytes === null ? null : s.storeBytes / (1024 * 1024 * 1024)))}
          unit="GB"
          color="#48CFAD"
          format={(v) => v.toFixed(1)}
        />
        <Chart
          title="หน่วยความจำที่ใช้ (%)"
          data={pick((s) =>
            s.memUsedMb === null || !s.memTotalMb ? null : (s.memUsedMb / s.memTotalMb) * 100,
          )}
          unit="%"
          color="#8067B7"
          format={(v) => v.toFixed(0)}
        />
        <Chart
          title="ภาระ CPU (load 1 นาที)"
          data={pick((s) => s.load1)}
          unit=""
          color="#FC6E51"
          format={(v) => v.toFixed(2)}
        />
      </div>

      {!latest && (
        <div className="flex flex-col items-center justify-center rounded-xl border border-gray-200 bg-white py-16 text-center">
          <div className="mb-4 rounded-full bg-gray-100 p-4">
            <HardDrive className="h-8 w-8 text-gray-400" />
          </div>
          <h3 className="text-sm font-medium text-gray-900">ยังไม่มีข้อมูลการใช้ทรัพยากร</h3>
          <p className="mt-1 max-w-md text-sm text-gray-500">
            ตัวส่งสัญญาณบนเครื่องเมลยังไม่ได้ติดตั้ง (หรือหยุดทำงาน) — ติดตั้งด้วย{" "}
            <code className="rounded bg-gray-100 px-1">scripts/mail-heartbeat.sh</code> แล้วรอ 5
            นาที
          </p>
        </div>
      )}

      <p className="text-xs text-gray-400">
        Contabo ไม่มี API ให้ดึงการใช้ทรัพยากร — ตัวเลขทั้งหมดมาจากเครื่องเมลรายงานเข้ามาเอง
        {latest?.serviceActive === false && (
          <StatusBadge tone="danger" className="ms-2">
            service หยุด
          </StatusBadge>
        )}
      </p>
    </div>
  );
}
