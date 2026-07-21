"use client";

/**
 * LiveRelativeTime — เวลาที่ผ่านมาแบบนับสด ("เมื่อสักครู่", "3 นาทีที่แล้ว")
 * tick เองทุก 15 วิ เพื่อให้ความรู้สึก "ข้อมูลสด" บนหน้า dashboard/monitor
 *   <>อัปเดต <LiveRelativeTime iso={data.computed_at} /></>
 */

import { useEffect, useState } from "react";

function relativeTh(iso: string, now: number): string {
  const diff = now - new Date(iso).getTime();
  if (!Number.isFinite(diff) || diff < 0) return "เมื่อสักครู่";
  const s = Math.floor(diff / 1000);
  if (s < 10) return "เมื่อสักครู่";
  if (s < 60) return `${s} วินาทีที่แล้ว`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m} นาทีที่แล้ว`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h} ชม.ที่แล้ว`;
  return new Date(iso).toLocaleDateString("th-TH", { day: "numeric", month: "short" });
}

export function LiveRelativeTime({ iso }: { iso: string }) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 15_000);
    return () => clearInterval(t);
  }, []);
  return <span suppressHydrationWarning>{relativeTh(iso, now)}</span>;
}
