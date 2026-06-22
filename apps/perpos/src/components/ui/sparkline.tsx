"use client";

/**
 * Sparkline — กราฟเส้นจิ๋วในการ์ด (trend) ไม่มีแกน/ป้าย
 * ใช้ใน <StatCard spark=…> เพื่อบอกแนวโน้มต่องวด · สีตาม tone
 */

import { ResponsiveContainer, AreaChart, Area } from "recharts";
import type { StatTone } from "./stat-card";

const STROKE: Record<StatTone, string> = {
  neutral: "#656d78",
  primary: "#3c3b3d",
  info: "#3c3b3d",
  positive: "#16a34a",
  negative: "#dc2626",
  warning: "#d97706",
};

export function Sparkline({
  data,
  tone = "neutral",
  height = 32,
}: {
  /** ค่าตามลำดับเวลา (เก่า→ใหม่) */
  data: number[];
  tone?: StatTone;
  height?: number;
}) {
  if (!data || data.length < 2) return null;
  const stroke = STROKE[tone];
  const series = data.map((v, i) => ({ i, v }));
  const gid = `spark-${tone}`;

  return (
    <div style={{ height }} className="mt-2 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={series} margin={{ top: 2, right: 0, left: 0, bottom: 0 }}>
          <defs>
            <linearGradient id={gid} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={stroke} stopOpacity={0.18} />
              <stop offset="100%" stopColor={stroke} stopOpacity={0} />
            </linearGradient>
          </defs>
          <Area
            type="monotone"
            dataKey="v"
            stroke={stroke}
            strokeWidth={1.5}
            fill={`url(#${gid})`}
            isAnimationActive={false}
            dot={false}
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}
