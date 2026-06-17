"use client";

import React, { useEffect, useRef, useState, useTransition } from "react";
import { ThaiDatePicker } from "@/components/ui/thai-date-picker";
import { getCashFlowAction, type CashFlowRow } from "@/lib/finance/report-actions";
import cn from "@core/utils/class-names";

function fmt(n: number) {
  return n.toLocaleString("th-TH", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

const SECTIONS: { key: string; label: string }[] = [
  { key: "operating", label: "กระแสเงินสดจากกิจกรรมดำเนินงาน" },
  { key: "investing", label: "กระแสเงินสดจากกิจกรรมลงทุน" },
  { key: "financing", label: "กระแสเงินสดจากกิจกรรมจัดหาเงิน" },
];

export function CashFlowClient(props: {
  organizationId: string;
  initialStartDate: string;
  initialEndDate: string;
  initialRows: CashFlowRow[];
}) {
  const [startDate, setStartDate] = useState(props.initialStartDate);
  const [endDate, setEndDate]     = useState(props.initialEndDate);
  const [rows, setRows]           = useState<CashFlowRow[]>(props.initialRows);
  const [error, setError]         = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const orgId = props.organizationId;

  // โหลดรายงานใหม่อัตโนมัติเมื่อเปลี่ยนช่วงวันที่ (ข้ามรอบแรกเพราะมีข้อมูลจาก server แล้ว)
  const didMount = useRef(false);
  useEffect(() => {
    if (!didMount.current) { didMount.current = true; return; }
    setError(null);
    startTransition(async () => {
      const res = await getCashFlowAction(orgId, startDate, endDate);
      if (!res.error) setRows(res.rows);
      else setError(res.error);
    });
  }, [orgId, startDate, endDate]);

  const bySection = (key: string) =>
    rows.filter((r) => r.section === key).sort((a, b) => a.sortOrder - b.sortOrder);

  const subtotal = (key: string) =>
    bySection(key).reduce((s, r) => s + r.amount, 0);

  const netChange = SECTIONS.reduce((s, sec) => s + subtotal(sec.key), 0);

  return (
    <div className="grid gap-4">
      {/* Controls */}
      <div className="flex flex-wrap items-end gap-3">
        <div className="grid gap-1">
          <div className="text-xs text-slate-500">ตั้งแต่วันที่</div>
          <ThaiDatePicker value={startDate} onChange={(v) => setStartDate(v)} className="h-9 w-40" />
        </div>
        <div className="grid gap-1">
          <div className="text-xs text-slate-500">ถึงวันที่</div>
          <ThaiDatePicker value={endDate} onChange={(v) => setEndDate(v)} className="h-9 w-40" />
        </div>
        {pending && <span className="text-xs text-slate-400">กำลังโหลด…</span>}
      </div>

      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</div>
      )}

      <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
        {SECTIONS.map((sec, si) => {
          const items = bySection(sec.key);
          const sub   = subtotal(sec.key);
          return (
            <div key={sec.key}>
              {/* Section header */}
              <div className="bg-slate-50 px-5 py-2.5 text-sm font-semibold text-slate-800 border-b border-slate-100">
                {sec.label}
              </div>
              {/* Items */}
              {items.length === 0 ? (
                <div className="px-5 py-3 text-sm text-slate-400 italic">ไม่มีรายการ</div>
              ) : (
                items.map((row) => (
                  <div key={row.label} className="flex items-center justify-between px-5 py-2.5 text-sm border-b border-slate-50">
                    <span className="text-slate-700 pl-4">{row.label}</span>
                    <span className={cn("tabular-nums font-medium", row.amount < 0 ? "text-red-600" : "text-slate-800")}>
                      {row.amount < 0 ? `(${fmt(Math.abs(row.amount))})` : fmt(row.amount)}
                    </span>
                  </div>
                ))
              )}
              {/* Subtotal */}
              <div className="flex items-center justify-between px-5 py-3 text-sm font-semibold border-b border-slate-200 bg-slate-50/50">
                <span className="text-slate-900">กระแสเงินสดสุทธิจากกิจกรรม{sec.key === "operating" ? "ดำเนินงาน" : sec.key === "investing" ? "ลงทุน" : "จัดหาเงิน"}</span>
                <span className={cn("tabular-nums", sub < 0 ? "text-red-600" : "text-emerald-700")}>
                  {sub < 0 ? `(${fmt(Math.abs(sub))})` : fmt(sub)}
                </span>
              </div>
            </div>
          );
        })}

        {/* Grand total */}
        <div className="flex items-center justify-between px-5 py-4 border-t-2 border-slate-200">
          <span className="text-base font-semibold text-slate-900">กระแสเงินสดสุทธิ (เพิ่มขึ้น / ลดลง)</span>
          <span className={cn("text-lg font-bold tabular-nums", netChange < 0 ? "text-red-600" : "text-emerald-700")}>
            {netChange < 0 ? `(${fmt(Math.abs(netChange))})` : fmt(netChange)}
          </span>
        </div>
      </div>
    </div>
  );
}
