"use client";

import React, { useState } from "react";
import { Sliders, ShieldCheck, AlertTriangle, TrendingUp, HelpCircle } from "lucide-react";

export default function SimulatorWidget() {
  // Baseline values (in Baht)
  const BASELINE_REVENUE = 1500000;
  const BASELINE_COGS = 900000; // 60% of revenue
  const BASELINE_OPEX = 350000;

  // State sliders
  const [priceChange, setPriceChange] = useState<number>(5); // -20% to +20%
  const [cogsChange, setCogsChange] = useState<number>(10); // -20% to +50%
  const [opexChange, setOpexChange] = useState<number>(0); // -50% to +100%

  // Simulated calculations
  const simRevenue = Math.round(BASELINE_REVENUE * (1 + priceChange / 100));
  const simCogs = Math.round(BASELINE_COGS * (1 + cogsChange / 100));
  const simOpex = Math.round(BASELINE_OPEX * (1 + opexChange / 100));
  const simProfit = simRevenue - simCogs - simOpex;
  const simMargin = simRevenue > 0 ? (simProfit / simRevenue) * 100 : 0;

  // Baseline profit/margin for comparison
  const baseProfit = BASELINE_REVENUE - BASELINE_COGS - BASELINE_OPEX; // 250,000
  const baseMargin = (baseProfit / BASELINE_REVENUE) * 100; // 16.6%

  // Risk calculation & commentary
  let statusText = "Healthy - ปานกลาง";
  let statusColor = "text-blue-600 bg-blue-50 border-blue-100";
  let indicatorColor = "bg-blue-500";
  let advisorQuote = "โครงสร้างต้นทุนและอัตรากำไรอยู่ในเกณฑ์มาตรฐาน แนะนำให้ควบคุมต้นทุนคงที่ (OpEx) ต่อไป";

  if (simMargin > 20) {
    statusText = "Excellent - แข็งแกร่งสูง";
    statusColor = "text-emerald-700 bg-emerald-50 border-emerald-100";
    indicatorColor = "bg-emerald-500";
    advisorQuote = "กระแสเงินสดแข็งแกร่งมาก! นี่เป็นโอกาสที่ดีในการขยายสาขาหรือสร้างสินค้าใหม่เพิ่มเติมเนื่องจากมีส่วนต่างความปลอดภัย (Safety Margin) สูง";
  } else if (simMargin >= 10 && simMargin <= 20) {
    statusText = "Stable - ปลอดภัย";
    statusColor = "text-cyan-700 bg-cyan-50 border-cyan-100";
    indicatorColor = "bg-cyan-500";
    advisorQuote = "ธุรกิจสามารถดำเนินการได้อย่างปกติ แนะนำประเมินคู่แข่งและเพิ่มยอดขายเชิงรุกเพื่อรักษาเกณฑ์กำไรระดับนี้";
  } else if (simMargin >= 0 && simMargin < 10) {
    statusText = "Warning - จุดคุ้มทุนต่ำ";
    statusColor = "text-amber-700 bg-amber-50 border-amber-100";
    indicatorColor = "bg-amber-500";
    advisorQuote = "ความปลอดภัยทางการเงินต่ำลงอย่างเห็นได้ชัด การเพิ่มขึ้นของต้นทุนสินค้าอีกเพียงเล็กน้อยอาจส่งผลให้ขาดทุน ควรเตรียมเจรจาซัพพลายเออร์ใหม่";
  } else {
    statusText = "Critical - ความเสี่ยงขาดทุนสะสม";
    statusColor = "text-rose-700 bg-rose-50 border-rose-100";
    indicatorColor = "bg-rose-500";
    advisorQuote = "วิกฤต! ค่าใช้จ่ายและต้นทุนรวมเกินกว่ารายรับ แนะนำลดค่าใช้จ่ายไม่จำเป็นเร่งด่วน หรือปรับราคาขายเพื่อครอบคลุม COGS";
  }

  return (
    <div className="w-full rounded-2xl border border-slate-200 bg-white overflow-hidden shadow-lg flex flex-col min-h-[500px] text-slate-700 font-sans">
      {/* Header */}
      <div className="bg-slate-50 border-b border-slate-200 px-4 py-3 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="w-2.5 h-2.5 rounded-full bg-cyan-600 animate-pulse" />
          <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">What-If Risk Simulator</span>
        </div>
        <span className="text-[10px] bg-cyan-50 border border-cyan-100 text-cyan-700 px-2 py-0.5 rounded-full font-bold">
          Real-Time Forecasting
        </span>
      </div>

      <div className="p-5 flex-1 flex flex-col justify-between gap-5 text-xs">
        {/* Controls Layout */}
        <div className="space-y-4">
          <div className="text-slate-500 font-semibold mb-2">ปรับค่าพารามิเตอร์จำลอง:</div>

          {/* Pricing slider */}
          <div className="space-y-1.5">
            <div className="flex justify-between font-medium">
              <span>การปรับเปลี่ยนราคาขายเฉลี่ย (Avg. Selling Price)</span>
              <span className={`font-bold ${priceChange >= 0 ? "text-emerald-600" : "text-rose-600"}`}>
                {priceChange >= 0 ? `+${priceChange}%` : `${priceChange}%`}
              </span>
            </div>
            <input
              type="range"
              min="-20"
              max="20"
              value={priceChange}
              onChange={(e) => setPriceChange(Number(e.target.value))}
              className="w-full h-1.5 bg-slate-100 rounded-lg appearance-none cursor-pointer accent-indigo-600"
            />
          </div>

          {/* COGS slider */}
          <div className="space-y-1.5">
            <div className="flex justify-between font-medium">
              <span>การปรับเปลี่ยนต้นทุนวัตถุดิบ (COGS Change)</span>
              <span className={`font-bold ${cogsChange > 0 ? "text-rose-600" : cogsChange < 0 ? "text-emerald-600" : "text-slate-650"}`}>
                {cogsChange >= 0 ? `+${cogsChange}%` : `${cogsChange}%`}
              </span>
            </div>
            <input
              type="range"
              min="-20"
              max="50"
              value={cogsChange}
              onChange={(e) => setCogsChange(Number(e.target.value))}
              className="w-full h-1.5 bg-slate-100 rounded-lg appearance-none cursor-pointer accent-indigo-600"
            />
          </div>

          {/* OpEx slider */}
          <div className="space-y-1.5">
            <div className="flex justify-between font-medium">
              <span>การปรับเปลี่ยนงบดำเนินงาน/โฆษณา (OpEx Change)</span>
              <span className={`font-bold ${opexChange > 0 ? "text-rose-600" : opexChange < 0 ? "text-emerald-600" : "text-slate-650"}`}>
                {opexChange >= 0 ? `+${opexChange}%` : `${opexChange}%`}
              </span>
            </div>
            <input
              type="range"
              min="-30"
              max="100"
              value={opexChange}
              onChange={(e) => setOpexChange(Number(e.target.value))}
              className="w-full h-1.5 bg-slate-100 rounded-lg appearance-none cursor-pointer accent-indigo-600"
            />
          </div>
        </div>

        {/* Live Calculation Outcomes */}
        <div className="border-t border-b border-slate-100 py-3.5 space-y-3.5">
          <div className="grid grid-cols-2 gap-4">
            {/* Revenue comparison */}
            <div>
              <div className="text-[9px] text-slate-400 font-bold uppercase tracking-wider">ประมาณการรายรับรายเดือน</div>
              <div className="text-sm font-black text-slate-800 mt-0.5">
                {simRevenue.toLocaleString()} บาท
              </div>
              <div className="text-[10px] text-slate-400">
                เดิม: {BASELINE_REVENUE.toLocaleString()} บาท
              </div>
            </div>

            {/* Net profit comparison */}
            <div>
              <div className="text-[9px] text-slate-400 font-bold uppercase tracking-wider">ประมาณการกำไรสุทธิ</div>
              <div className={`text-sm font-black mt-0.5 ${simProfit >= 0 ? "text-emerald-600" : "text-rose-600"}`}>
                {simProfit.toLocaleString()} บาท
              </div>
              <div className="text-[10px] text-slate-400">
                เดิม: {baseProfit.toLocaleString()} บาท
              </div>
            </div>
          </div>

          {/* Progress / Ratio Bar */}
          <div className="space-y-1.5">
            <div className="flex justify-between text-[10px] font-bold">
              <span className="text-slate-400">อัตรากำไรขั้นสุทธิ (Simulated Net Profit Margin)</span>
              <span className={simMargin >= 0 ? "text-emerald-600" : "text-rose-600"}>
                {simMargin.toFixed(1)}%
              </span>
            </div>
            <div className="w-full h-2.5 bg-slate-100 rounded-full overflow-hidden flex">
              {simMargin > 0 ? (
                <>
                  <div
                    className={`${indicatorColor} h-full transition-all duration-300`}
                    style={{ width: `${Math.min(simMargin, 100)}%` }}
                  />
                  <div className="bg-slate-200 h-full flex-1" />
                </>
              ) : (
                <div
                  className="bg-rose-500 h-full transition-all duration-300"
                  style={{ width: "100%" }}
                />
              )}
            </div>
            <div className="flex justify-between text-[9px] text-slate-400 scale-95 origin-left">
              <span>ฐานอ้างอิงเดิม: {baseMargin.toFixed(1)}%</span>
              {simMargin - baseMargin !== 0 && (
                <span className={simMargin - baseMargin > 0 ? "text-emerald-600 font-bold" : "text-rose-600 font-bold"}>
                  {simMargin - baseMargin > 0 ? `+${(simMargin - baseMargin).toFixed(1)}%` : `${(simMargin - baseMargin).toFixed(1)}%`}
                </span>
              )}
            </div>
          </div>
        </div>

        {/* AI advisor alert & recommendation */}
        <div className={`rounded-xl border p-3 flex gap-2.5 items-start transition-all duration-300 ${statusColor}`}>
          <div className="shrink-0 mt-0.5">
            {simMargin >= 10 ? (
              <ShieldCheck size={16} className="text-emerald-600" />
            ) : (
              <AlertTriangle size={16} className="text-rose-600" />
            )}
          </div>
          <div className="space-y-1">
            <div className="font-bold text-[10px] uppercase tracking-wider flex items-center gap-1.5">
              <span>สถานะจำลอง: {statusText}</span>
            </div>
            <p className="text-[10px] leading-relaxed opacity-90 font-medium font-sans">
              {advisorQuote}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
