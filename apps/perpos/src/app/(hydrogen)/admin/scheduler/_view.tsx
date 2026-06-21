"use client";

/**
 * SchedulerView — ส่วน interactive ของหน้า Scheduler Monitor
 * รับ initialData จาก server component (ไม่มี client waterfall แรก) แล้ว poll /api/admin/scheduler/runs
 * ทุก 60 วิ เพื่อ refresh สถานะสด (cron รันทุก 1 นาที)
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import { CheckCircle2, AlertTriangle, XCircle } from "lucide-react";
import { StatusBadge } from "@/components/ui/badge";
import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
  TableEmpty,
} from "@/components/ui/table";
import { AdminCard } from "../_components/admin-page";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import type { SchedulerData } from "@/lib/admin/scheduler";

const HEALTH = {
  healthy: {
    label: "ทำงานปกติ",
    cls: "bg-green-50 border-green-200 text-green-700",
    icon: <CheckCircle2 className="h-4 w-4" />,
  },
  stale: {
    label: "ล่าช้า (>5 นาที)",
    cls: "bg-amber-50 border-amber-200 text-amber-700",
    icon: <AlertTriangle className="h-4 w-4" />,
  },
  down: {
    label: "ไม่ทำงาน (>30 นาที)",
    cls: "bg-red-50 border-red-200 text-red-700",
    icon: <XCircle className="h-4 w-4" />,
  },
} as const;

function fmtAge(s: number | null) {
  if (s == null) return "ยังไม่เคยรัน";
  if (s < 60) return `${s} วินาทีที่แล้ว`;
  if (s < 3600) return `${Math.round(s / 60)} นาทีที่แล้ว`;
  return `${Math.round(s / 3600)} ชม.ที่แล้ว`;
}

function fmtTs(iso: string) {
  return new Date(iso).toLocaleString("th-TH", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

function Stat({
  label,
  value,
  accent,
}: {
  label: string;
  value: string | number;
  accent?: string;
}) {
  return (
    <div className="rounded-xl border border-gray-200 bg-white p-4">
      <div className="text-xs text-gray-500">{label}</div>
      <div className={`mt-1 text-2xl font-bold tabular-nums ${accent ?? "text-gray-900"}`}>
        {value}
      </div>
    </div>
  );
}

export function SchedulerView({ initialData }: { initialData: SchedulerData }) {
  const supabase = useMemo(() => createSupabaseBrowserClient(), []);
  const [data, setData] = useState<SchedulerData>(initialData);

  const refresh = useCallback(async () => {
    try {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      const res = await fetch("/api/admin/scheduler/runs", {
        headers: { Authorization: `Bearer ${session?.access_token ?? ""}` },
      });
      const json = await res.json();
      if (json?.data) setData(json.data as SchedulerData);
    } catch {
      /* noop — เก็บค่าเดิมไว้ */
    }
  }, [supabase]);

  useEffect(() => {
    const id = setInterval(() => void refresh(), 60_000);
    return () => clearInterval(id);
  }, [refresh]);

  const h = HEALTH[data.health];

  return (
    <div className="space-y-6">
      {/* Health */}
      <div
        className={`flex flex-wrap items-center gap-3 rounded-xl border px-4 py-3 text-sm font-medium ${h.cls}`}
      >
        {h.icon}
        <span>Scheduler: {h.label}</span>
        <span className="font-normal opacity-80">· รันล่าสุด {fmtAge(data.age_seconds)}</span>
        {data.last_ran_at && (
          <span className="font-normal opacity-60">({fmtTs(data.last_ran_at)})</span>
        )}
      </div>

      {/* Summary 24h */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        <Stat label="รัน 24 ชม." value={data.summary.runs_24h} />
        <Stat
          label="รันล้มเหลว"
          value={data.summary.failed_24h}
          accent={data.summary.failed_24h > 0 ? "text-red-600" : undefined}
        />
        <Stat
          label="คิวรออยู่"
          value={data.queue.pending}
          accent={data.queue.pending > 0 ? "text-amber-600" : undefined}
        />
        <Stat label="กำลังประมวลผล" value={data.queue.processing} />
        <Stat label="ปิดงานค้าง (24ช)" value={data.summary.stuck_failed_24h} />
        <Stat label="cleanup (24ช)" value={data.summary.cleaned_24h} />
      </div>

      {/* Run log */}
      <AdminCard title="ประวัติการรันล่าสุด" bodyClassName="p-0">
        <Table wrapperClassName="rounded-none border-0">
          <TableHeader>
            <TableRow>
              <TableHead>เวลา</TableHead>
              <TableHead align="center">สถานะ</TableHead>
              <TableHead align="right">ใช้เวลา</TableHead>
              <TableHead align="right">ปิดงานค้าง</TableHead>
              <TableHead align="right">requeue</TableHead>
              <TableHead align="right">ยอมแพ้</TableHead>
              <TableHead align="right">cleanup</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {data.runs.length === 0 ? (
              <TableEmpty colSpan={7}>ยังไม่มีบันทึกการรัน</TableEmpty>
            ) : (
              data.runs.map((r) => (
                <TableRow key={r.id}>
                  <TableCell className="text-gray-700">{fmtTs(r.ran_at)}</TableCell>
                  <TableCell align="center">
                    {r.ok ? (
                      <StatusBadge tone="success">
                        <CheckCircle2 className="mr-1 h-3 w-3" /> สำเร็จ
                      </StatusBadge>
                    ) : (
                      <StatusBadge tone="danger" title={r.error_message ?? ""}>
                        <XCircle className="mr-1 h-3 w-3" /> ล้มเหลว
                      </StatusBadge>
                    )}
                  </TableCell>
                  <TableCell align="right" tabular className="text-gray-600">
                    {r.duration_ms} ms
                  </TableCell>
                  <TableCell align="right" tabular>
                    {r.stuck_failed || "—"}
                  </TableCell>
                  <TableCell align="right" tabular>
                    {r.requeued || "—"}
                  </TableCell>
                  <TableCell align="right" tabular>
                    {r.requeue_gaveup || "—"}
                  </TableCell>
                  <TableCell align="right" tabular>
                    {r.cleaned_jobs || "—"}
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </AdminCard>
    </div>
  );
}
