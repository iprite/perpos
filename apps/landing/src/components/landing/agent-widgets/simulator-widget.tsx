"use client";

import React, { useState } from "react";
import { Sliders, ShieldCheck, AlertTriangle } from "lucide-react";
import { useLanguage } from "../language-context";

export default function SimulatorWidget() {
  const { lang } = useLanguage();
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
  let statusText = lang === "th" ? "Healthy - ปานกลาง" : "Healthy - Moderate";
  let statusColor = "text-blue-700 bg-blue-50 border-blue-100";
  let indicatorColor = "bg-blue-500";
  let advisorQuote = lang === "th"
    ? "โครงสร้างต้นทุนและอัตรากำไรอยู่ในเกณฑ์มาตรฐาน แนะนำให้ควบคุมต้นทุนคงที่ (OpEx) ต่อไป"
    : "Cost structure and margins are within standard baseline. Advise maintaining control over fixed OpEx costs.";

  if (simMargin > 20) {
    statusText = lang === "th" ? "Excellent - แข็งแกร่งสูง" : "Excellent - Strong margin";
    statusColor = "text-emerald-700 bg-emerald-50 border-emerald-100";
    indicatorColor = "bg-emerald-500";
    advisorQuote = lang === "th"
      ? "กระแสเงินสดแข็งแกร่งมาก! นี่เป็นโอกาสที่ดีในการขยายสาขาหรือสร้างสินค้าใหม่เพิ่มเติมเนื่องจากมีส่วนต่างความปลอดภัย (Safety Margin) สูง"
      : "Excellent cash flow forecast! This is an ideal window to scale product lines or expand branches with a comfortable safety margin.";
  } else if (simMargin >= 10 && simMargin <= 20) {
    statusText = lang === "th" ? "Stable - ปลอดภัย" : "Stable - Safe bounds";
    statusColor = "text-cyan-700 bg-cyan-50 border-cyan-100";
    indicatorColor = "bg-cyan-500";
    advisorQuote = lang === "th"
      ? "ธุรกิจสามารถดำเนินการได้อย่างปกติ แนะนำประเมินคู่แข่งและเพิ่มยอดขายเชิงรุกเพื่อรักษาเกณฑ์กำไรระดับนี้"
      : "Business operates under normal safe boundaries. Monitor competitor moves and drive active sales to sustain this profit margin.";
  } else if (simMargin >= 0 && simMargin < 10) {
    statusText = lang === "th" ? "Warning - จุดคุ้มทุนต่ำ" : "Warning - Low safety margin";
    statusColor = "text-amber-700 bg-amber-50 border-amber-100";
    indicatorColor = "bg-amber-500";
    advisorQuote = lang === "th"
      ? "ความปลอดภัยทางการเงินต่ำลงอย่างเห็นได้ชัด การเพิ่มขึ้นของต้นทุนสินค้าอีกเพียงเล็กน้อยอาจส่งผลให้ขาดทุน ควรเตรียมเจรจาซัพพลายเออร์ใหม่"
      : "Financial safety margin has dropped significantly. Any minor increase in material costs could lead to losses. Renegotiate with suppliers.";
  } else {
    statusText = lang === "th" ? "Critical - ความเสี่ยงขาดทุนสะสม" : "Critical - Net Operating Loss";
    statusColor = "text-rose-700 bg-rose-50 border-rose-100";
    indicatorColor = "bg-rose-500";
    advisorQuote = lang === "th"
      ? "วิกฤต! ค่าใช้จ่ายและต้นทุนรวมเกินกว่ารายรับ แนะนำลดค่าใช้จ่ายไม่จำเป็นเร่งด่วน หรือปรับราคาขายเพื่อครอบคลุม COGS"
      : "Critical! Total operating expenses and COGS exceed simulated revenue. Immediate cost-cutting or pricing adjustments required.";
  }

  const t = {
    paramLabel: lang === "th" ? "ปรับค่าพารามิเตอร์จำลอง:" : "Adjust Simulation Parameters:",
    priceLabel: lang === "th" ? "การปรับเปลี่ยนราคาขายเฉลี่ย (Avg. Selling Price)" : "Average Selling Price Adjustment",
    cogsLabel: lang === "th" ? "การปรับเปลี่ยนต้นทุนวัตถุดิบ (COGS Change)" : "Cost of Goods Sold (COGS) Change",
    opexLabel: lang === "th" ? "การปรับเปลี่ยนงบดำเนินงาน/โฆษณา (OpEx Change)" : "Operating Expenses (OpEx) Change",
    estRevenue: lang === "th" ? "ประมาณการรายรับรายเดือน" : "Projected Monthly Revenue",
    estProfit: lang === "th" ? "ประมาณการกำไรสุทธิ" : "Projected Net Profit",
    original: lang === "th" ? "เดิม:" : "Original:",
    currency: lang === "th" ? "บาท" : "THB",
    marginLabel: lang === "th" ? "อัตรากำไรสุทธิ (Simulated Net Profit Margin)" : "Simulated Net Profit Margin",
    baselineMargin: lang === "th" ? "ฐานอ้างอิงเดิม:" : "Baseline Margin:",
    statusLabel: lang === "th" ? "สถานะจำลอง: " : "Simulated Status: "
  };

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
          <div className="text-slate-500 font-semibold mb-2">{t.paramLabel}</div>

          {/* Pricing slider */}
          <div className="space-y-1.5 text-left">
            <div className="flex justify-between font-medium">
              <span>{t.priceLabel}</span>
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
              className="w-full h-1.5 bg-slate-100 rounded-lg appearance-none cursor-pointer accent-[#292e91]"
            />
          </div>

          {/* COGS slider */}
          <div className="space-y-1.5 text-left">
            <div className="flex justify-between font-medium">
              <span>{t.cogsLabel}</span>
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
              className="w-full h-1.5 bg-slate-100 rounded-lg appearance-none cursor-pointer accent-[#292e91]"
            />
          </div>

          {/* OpEx slider */}
          <div className="space-y-1.5 text-left">
            <div className="flex justify-between font-medium">
              <span>{t.opexLabel}</span>
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
              className="w-full h-1.5 bg-slate-100 rounded-lg appearance-none cursor-pointer accent-[#292e91]"
            />
          </div>
        </div>

        {/* Live Calculation Outcomes */}
        <div className="border-t border-b border-slate-100 py-3.5 space-y-3.5 text-left">
          <div className="grid grid-cols-2 gap-4">
            {/* Revenue comparison */}
            <div>
              <div className="text-[9px] text-slate-400 font-bold uppercase tracking-wider">{t.estRevenue}</div>
              <div className="text-sm font-black text-slate-800 mt-0.5 font-mono">
                {simRevenue.toLocaleString()} {t.currency}
              </div>
              <div className="text-[10px] text-slate-400 font-mono">
                {t.original} {BASELINE_REVENUE.toLocaleString()} {t.currency}
              </div>
            </div>

            {/* Net profit comparison */}
            <div>
              <div className="text-[9px] text-slate-400 font-bold uppercase tracking-wider">{t.estProfit}</div>
              <div className={`text-sm font-black mt-0.5 font-mono ${simProfit >= 0 ? "text-emerald-600" : "text-rose-600"}`}>
                {simProfit.toLocaleString()} {t.currency}
              </div>
              <div className="text-[10px] text-slate-400 font-mono">
                {t.original} {baseProfit.toLocaleString()} {t.currency}
              </div>
            </div>
          </div>

          {/* Progress / Ratio Bar */}
          <div className="space-y-1.5">
            <div className="flex justify-between text-[10px] font-bold">
              <span className="text-slate-400">{t.marginLabel}</span>
              <span className={`font-mono ${simMargin >= 0 ? "text-emerald-600" : "text-rose-600"}`}>
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
              <span className="font-mono">{t.baselineMargin} {baseMargin.toFixed(1)}%</span>
              {simMargin - baseMargin !== 0 && (
                <span className={`font-mono font-bold ${simMargin - baseMargin > 0 ? "text-emerald-600" : "text-rose-600"}`}>
                  {simMargin - baseMargin > 0 ? `+${(simMargin - baseMargin).toFixed(1)}%` : `${(simMargin - baseMargin).toFixed(1)}%`}
                </span>
              )}
            </div>
          </div>
        </div>

        {/* AI advisor alert & recommendation */}
        <div className={`rounded-xl border p-3 flex gap-2.5 items-start transition-all duration-300 ${statusColor} text-left`}>
          <div className="shrink-0 mt-0.5">
            {simMargin >= 10 ? (
              <ShieldCheck size={16} className="text-emerald-650" />
            ) : (
              <AlertTriangle size={16} className="text-rose-655" />
            )}
          </div>
          <div className="space-y-1">
            <div className="font-bold text-[10px] uppercase tracking-wider flex items-center gap-1.5">
              <span>{t.statusLabel}{statusText}</span>
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
