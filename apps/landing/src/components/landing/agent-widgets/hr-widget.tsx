"use client";

import React, { useState } from "react";
import { Sparkles, Calendar, CheckCircle2, ShieldAlert, Sliders } from "lucide-react";

interface Shift {
  name: string;
  hours: number;
  rate: number;
  ot: number;
  cost: number;
  status: "overwork" | "ok" | "optimized";
}

const INEFFICIENT_SHIFTS: Shift[] = [
  { name: "คุณสมชาย", hours: 52, rate: 100, ot: 12, cost: 6800, status: "overwork" },
  { name: "คุณสมศรี", hours: 40, rate: 100, ot: 0, cost: 4000, status: "ok" },
  { name: "Mr. John", hours: 48, rate: 150, ot: 8, cost: 8400, status: "overwork" },
  { name: "Ms. Mary", hours: 56, rate: 120, ot: 16, cost: 9360, status: "overwork" }
];

const OPTIMIZED_SHIFTS: Shift[] = [
  { name: "คุณสมชาย", hours: 40, rate: 100, ot: 0, cost: 4000, status: "optimized" },
  { name: "คุณสมศรี", hours: 40, rate: 100, ot: 0, cost: 4000, status: "optimized" },
  { name: "Mr. John", hours: 40, rate: 150, ot: 0, cost: 6000, status: "optimized" },
  { name: "Ms. Mary", hours: 40, rate: 120, ot: 0, cost: 4800, status: "optimized" }
];

export default function HrWidget() {
  const [shifts, setShifts] = useState<Shift[]>(INEFFICIENT_SHIFTS);
  const [optimized, setOptimized] = useState(false);
  const [loading, setLoading] = useState(false);

  const runOptimizer = () => {
    setLoading(true);
    setTimeout(() => {
      setShifts(OPTIMIZED_SHIFTS);
      setOptimized(true);
      setLoading(false);
    }, 1500);
  };

  const resetShifts = () => {
    setShifts(INEFFICIENT_SHIFTS);
    setOptimized(false);
  };

  const totalCost = shifts.reduce((sum, s) => sum + s.cost, 0);
  const saving = 28560 - totalCost; // original cost sum of INEFFICIENT_SHIFTS = 28,560

  return (
    <div className="w-full rounded-2xl border border-slate-200 bg-white overflow-hidden shadow-lg flex flex-col min-h-[460px] text-slate-700 font-sans">
      {/* Header */}
      <div className="bg-slate-50 border-b border-slate-200 px-4 py-3 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="w-2.5 h-2.5 rounded-full bg-blue-500 animate-pulse" />
          <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Workforce Scheduler Optimizer</span>
        </div>
        <span className="text-[10px] bg-indigo-50 border border-indigo-100 text-indigo-700 px-2 py-0.5 rounded-full font-bold">
          Compliance Guard Active
        </span>
      </div>

      <div className="p-5 flex-1 space-y-4 text-xs">
        {/* Status indicator */}
        {!optimized ? (
          <div className="p-3.5 rounded-2xl border border-amber-150 bg-amber-50 text-amber-900 flex gap-2.5 items-start text-left leading-relaxed">
            <ShieldAlert className="text-amber-600 shrink-0 mt-0.5 animate-bounce" size={16} />
            <div>
              <h4 className="font-bold">ตรวจพบความผิดปกติของตารางงาน (Compliance Alert)</h4>
              <p className="text-[10px] text-amber-800 mt-0.5 font-sans">
                พนักงาน 3 คน ทำงานล่วงชั่วโมงเกินขีดจำกัดตามกฎหมายแรงงานกำหนด (สูงสุด 48 ชม./สัปดาห์) ทำให้เกิดค่าเบี้ยล่วงเวลา (OT) บานปลายสะสม
              </p>
            </div>
          </div>
        ) : (
          <div className="p-3.5 rounded-2xl border border-emerald-150 bg-emerald-50 text-emerald-900 flex gap-2.5 items-start text-left leading-relaxed animate-scale-up">
            <CheckCircle2 className="text-emerald-600 shrink-0 mt-0.5" size={16} />
            <div>
              <h4 className="font-bold">ตารางกะงานผ่านเกณฑ์ตามกฎหมายแรงงานสำเร็จ!</h4>
              <p className="text-[10px] text-emerald-800 mt-0.5 font-sans">
                AI ทำการเฉลี่ยความต้องการงานให้สมดุล ขจัดค่าล่วงเวลาพนักงานทั้งหมด และสอดคล้องกับความสอดคล้องของกฎหมาย 100%
              </p>
            </div>
          </div>
        )}

        {/* Labor cost summary header */}
        <div className="grid grid-cols-2 gap-3.5 text-center">
          <div className="p-3 rounded-2xl bg-slate-50 border border-slate-200">
            <div className="text-[9px] text-slate-400 font-bold uppercase">Weekly Labor Cost</div>
            <div className="text-base font-black text-slate-800 mt-0.5">{totalCost.toLocaleString()} บาท</div>
          </div>
          <div className="p-3 rounded-2xl bg-slate-50 border border-slate-200 flex flex-col justify-center">
            {optimized ? (
              <>
                <div className="text-[9px] text-emerald-600 font-bold uppercase">Total Cost Savings</div>
                <div className="text-base font-black text-emerald-600 mt-0.5">-{saving.toLocaleString()} บาท (20%)</div>
              </>
            ) : (
              <>
                <div className="text-[9px] text-amber-600 font-bold uppercase">Potential Savings</div>
                <div className="text-base font-black text-amber-600 mt-0.5">~5,700 บาท</div>
              </>
            )}
          </div>
        </div>

        {/* Workforce shift table */}
        <div className="border border-slate-200 rounded-2xl overflow-hidden shadow-sm bg-white">
          <div className="bg-slate-50 border-b border-slate-200 px-3.5 py-2 text-[10px] font-bold text-slate-400 uppercase flex items-center gap-1">
            <Calendar size={12} />
            <span>Weekly Shift Schedule & Overtime</span>
          </div>
          <table className="w-full text-[11px] text-left">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50/50 text-slate-500 font-bold">
                <th className="py-2 px-3">พนักงาน</th>
                <th className="py-2 px-1 text-center">ชม. งาน</th>
                <th className="py-2 px-1 text-center">ชม. OT</th>
                <th className="py-2 px-3 text-right">ค่าแรงสะสม</th>
              </tr>
            </thead>
            <tbody>
              {shifts.map((s, i) => (
                <tr key={i} className={`border-b border-slate-200 ${
                  s.status === "overwork" ? "bg-amber-50/20 text-amber-900" : ""
                } ${
                  s.status === "optimized" ? "bg-emerald-50/10 text-slate-800" : ""
                }`}>
                  <td className="py-2.5 px-3 font-semibold">{s.name}</td>
                  <td className="py-2.5 px-1 text-center font-mono">{s.hours} ชม.</td>
                  <td className="py-2.5 px-1 text-center font-mono text-amber-600 font-bold">{s.ot} ชม.</td>
                  <td className="py-2.5 px-3 text-right font-mono font-bold">{s.cost.toLocaleString()} บาท</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Action button */}
        {!optimized ? (
          <button
            onClick={runOptimizer}
            disabled={loading}
            className="w-full flex items-center justify-center gap-2 rounded-xl bg-brand-gradient hover:opacity-90 text-white font-bold py-3.5 transition-all shadow-md font-sans text-xs"
          >
            {loading ? (
              <>
                <div className="w-4 h-4 rounded-full border-2 border-white/20 border-t-white animate-spin" />
                <span>กำลังจำลองและปรับกะงาน...</span>
              </>
            ) : (
              <>
                <Sliders size={14} />
                <span>จัดกะงานและคำนวณ Payroll อัตโนมัติ (Optimize Shifts)</span>
              </>
            )}
          </button>
        ) : (
          <button
            onClick={resetShifts}
            className="w-full flex items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 font-semibold py-2.5 transition-colors font-sans text-xs"
          >
            <span>รีเซ็ตตารางจำลอง</span>
          </button>
        )}
      </div>
    </div>
  );
}
