"use client";

import React, { useState } from "react";
import { Coins, Sparkles, AlertCircle, ArrowUpRight } from "lucide-react";
import { translations } from "./locales";

export default function CostSimulator({ lang = "th" }: { lang?: "th" | "en" }) {
  const [txVolume, setTxVolume] = useState<number>(12000); // Default 12,000 transactions/month
  const t = translations[lang].costSimulator;

  // Calculations:
  // 1. Traditional ERP licensing:
  // 30 seats * 2,500 THB/seat/month = 75,000 THB
  // Plus implementation amortized: 15,000 THB/month
  // Plus support & updates: 10,000 THB/month
  // Total traditional ERP cost: 100,000 THB/month flat
  const traditionalCost = 100000;

  // 2. PERPOS Serverless model:
  // Base serverless platform fee: 3,200 THB/month
  // Charge per transactional job: 1.25 THB per job
  const costPerTx = 1.25;
  const perposCost = Math.round(3200 + txVolume * costPerTx);

  const savingsPercentage = Math.round(((traditionalCost - perposCost) / traditionalCost) * 100);

  return (
    <div className="w-full bg-[#f8fafc]/50 border border-slate-200 rounded-3xl p-6 lg:p-8 space-y-6 text-slate-700">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-250/60 pb-5">
        <div className="text-left">
          <h3 className="text-xl font-bold text-slate-800 flex items-center gap-2">
            <Coins className="text-blue-600" size={20} />
            {t.title}
          </h3>
          <p className="text-xs text-slate-500 mt-1 leading-relaxed">
            {t.desc}
          </p>
        </div>
        <div className="flex items-center gap-1.5 px-3 py-1 rounded-full bg-blue-50 border border-blue-100 text-[10px] text-blue-600 font-semibold w-fit">
          <Sparkles size={11} />
          {t.badge}
        </div>
      </div>

      {/* Slider Input Block */}
      <div className="space-y-4 text-left">
        <div className="flex justify-between items-end">
          <span className="text-xs text-slate-500 font-medium">{t.volumeLabel}</span>
          <span className="text-lg font-bold text-slate-800 bg-blue-50/50 border border-blue-100 px-3 py-1 rounded-lg">
            {txVolume.toLocaleString()} <span className="text-xs text-slate-500 font-normal">{t.unit}</span>
          </span>
        </div>

        <input
          type="range"
          min="1000"
          max="50000"
          step="1000"
          value={txVolume}
          onChange={(e) => setTxVolume(parseInt(e.target.value))}
          className="w-full h-2 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-blue-600 focus:outline-none"
        />

        <div className="flex justify-between text-[10px] text-slate-400">
          <span>{t.smallSme}</span>
          <span>{t.medSme}</span>
          <span>{t.largeSme}</span>
        </div>
      </div>

      {/* Comparison Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 pt-2 text-left">
        {/* Traditional ERP Card */}
        <div className="bg-white border border-slate-200 rounded-2xl p-5 space-y-3 shadow-sm">
          <div className="text-[10px] text-slate-400 font-semibold uppercase tracking-wider">
            {t.tradTitle}
          </div>
          <div className="space-y-1">
            <div className="text-2xl font-bold text-slate-450 line-through">
              {traditionalCost.toLocaleString()} <span className="text-xs text-slate-400 font-normal">THB / {lang === "th" ? "เดือน" : "month"}</span>
            </div>
            <p className="text-[10px] text-slate-550 leading-relaxed">
              {t.tradDesc}
            </p>
          </div>
          <div className="border-t border-slate-100 pt-3 text-[10px] text-slate-400 space-y-1 font-sans">
            {t.tradPoints.map((p, idx) => (
              <div key={idx}>{p}</div>
            ))}
          </div>
        </div>

        {/* PERPOS Card */}
        <div className="bg-gradient-to-br from-blue-50/60 to-cyan-50/20 border border-blue-200 rounded-2xl p-5 space-y-3 shadow-md relative overflow-hidden">
          <div className="absolute top-4 right-4 bg-emerald-100 border border-emerald-200 text-emerald-700 text-[10px] px-2 py-0.5 rounded-md font-bold flex items-center gap-1">
            {t.saveBadge} {savingsPercentage}%
            <ArrowUpRight size={11} className="rotate-45" />
          </div>

          <div className="text-[10px] text-blue-600 font-bold uppercase tracking-wider">
            {t.perposTitle}
          </div>
          <div className="space-y-1">
            <div className="text-3xl font-extrabold text-blue-700">
              {perposCost.toLocaleString()} <span className="text-xs text-blue-500 font-normal">THB / {lang === "th" ? "เดือน" : "month"}</span>
            </div>
            <p className="text-[10px] text-slate-650 leading-relaxed">
              {t.perposDesc}
            </p>
          </div>
          <div className="border-t border-blue-100 pt-3 text-[10px] text-slate-550 space-y-1 font-sans">
            <div>{t.perposPoints[0]}</div>
            <div>{t.perposPoints[1].replace("{volume}", txVolume.toLocaleString())}</div>
            <div className="text-emerald-600 font-bold">{t.perposPoints[2].replace("{saving}", (traditionalCost - perposCost).toLocaleString())}</div>
          </div>
        </div>
      </div>

      {/* Info Warning Alert */}
      <div className="bg-blue-50/40 border border-blue-100 rounded-xl p-4 flex gap-3 text-[10px] text-slate-550 text-left">
        <AlertCircle className="text-blue-500 shrink-0 mt-0.5" size={16} />
        <p className="leading-relaxed font-sans">
          <strong className="text-slate-800 font-bold">{t.alertTitle}</strong> {t.alertDesc}
        </p>
      </div>
    </div>
  );
}
