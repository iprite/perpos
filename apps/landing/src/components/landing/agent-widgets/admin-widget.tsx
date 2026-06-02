"use client";

import React, { useState } from "react";
import { Sparkles, MapPin, CheckCircle2, Navigation, RefreshCw } from "lucide-react";

export default function AdminWidget() {
  const [optimized, setOptimized] = useState(false);
  const [loading, setLoading] = useState(false);

  const runOptimizer = () => {
    setLoading(true);
    setTimeout(() => {
      setOptimized(true);
      setLoading(false);
    }, 1500);
  };

  const resetWidget = () => {
    setOptimized(false);
  };

  return (
    <div className="w-full rounded-2xl border border-slate-200 bg-white overflow-hidden shadow-lg flex flex-col min-h-[460px] text-slate-700 font-sans">
      {/* Header */}
      <div className="bg-slate-50 border-b border-slate-200 px-4 py-3 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="w-2.5 h-2.5 rounded-full bg-blue-500 animate-pulse" />
          <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Fleet & Route Optimizer</span>
        </div>
        <span className="text-[10px] bg-emerald-50 border border-emerald-100 text-emerald-700 px-2 py-0.5 rounded-full font-bold">
          Smart Routing Active
        </span>
      </div>

      <div className="p-5 flex-1 space-y-4 text-xs">
        {/* Route Details Box */}
        <div className="grid grid-cols-2 gap-3 text-center">
          <div className="p-3 rounded-2xl bg-slate-50 border border-slate-200">
            <div className="text-[9px] text-slate-400 font-bold uppercase">ระยะทางขนส่ง (Distance)</div>
            <div className="text-base font-black text-slate-800 mt-0.5">
              {optimized ? "88 กม." : "120 กม."}
            </div>
          </div>
          <div className="p-3 rounded-2xl bg-slate-50 border border-slate-200">
            {optimized ? (
              <>
                <div className="text-[9px] text-emerald-600 font-bold uppercase">ประหยัดเชื้อเพลิง</div>
                <div className="text-base font-black text-emerald-600 mt-0.5">26% (ประหยัด 480 บาท)</div>
              </>
            ) : (
              <>
                <div className="text-[9px] text-slate-400 font-bold uppercase">ค่าขนส่งเฉลี่ย</div>
                <div className="text-base font-black text-slate-800 mt-0.5">1,820 บาท</div>
              </>
            )}
          </div>
        </div>

        {/* Visual Map Simulator (SVG Graph) */}
        <div className="h-[180px] bg-slate-50 rounded-2xl border border-slate-200 relative overflow-hidden flex items-center justify-center">
          {/* SVG Map Lines */}
          <svg className="absolute inset-0 w-full h-full" xmlns="http://www.w3.org/2000/svg">
            {optimized ? (
              // Optimized Path: Home (40, 140) -> A (100, 40) -> B (240, 50) -> C (280, 140) -> Home
              <g>
                <path
                  d="M 40 140 L 100 40 L 240 50 L 280 140 Z"
                  fill="none"
                  stroke="#10b981"
                  strokeWidth="3"
                  strokeDasharray="4"
                  className="animate-dash"
                />
                <path
                  d="M 40 140 L 100 40 L 240 50 L 280 140 Z"
                  fill="none"
                  stroke="#10b981"
                  strokeWidth="1.5"
                  opacity="0.5"
                />
              </g>
            ) : (
              // Inefficient Path: Home -> B -> A -> C -> Home (crossing over each other)
              <g>
                <path
                  d="M 40 140 L 240 50 L 100 40 L 280 140 Z"
                  fill="none"
                  stroke="#94a3b8"
                  strokeWidth="2"
                  opacity="0.8"
                />
              </g>
            )}
          </svg>

          {/* Map Pins */}
          {/* Home */}
          <div className="absolute left-[30px] bottom-[25px] flex flex-col items-center">
            <div className="w-5 h-5 rounded-full bg-slate-800 border-2 border-white flex items-center justify-center text-white shadow">
              <MapPin size={10} />
            </div>
            <span className="text-[8px] bg-slate-800 text-white px-1 rounded mt-0.5 font-bold font-sans">คลัง</span>
          </div>

          {/* Node A */}
          <div className="absolute left-[90px] top-[25px] flex flex-col items-center">
            <div className="w-5 h-5 rounded-full bg-blue-600 border-2 border-white flex items-center justify-center text-white shadow">
              <span className="text-[9px] font-bold">A</span>
            </div>
            <span className="text-[8px] bg-white border border-slate-200 text-slate-600 px-1 rounded mt-0.5 font-bold">ชลบุรี</span>
          </div>

          {/* Node B */}
          <div className="absolute right-[110px] top-[35px] flex flex-col items-center">
            <div className="w-5 h-5 rounded-full bg-blue-600 border-2 border-white flex items-center justify-center text-white shadow">
              <span className="text-[9px] font-bold">B</span>
            </div>
            <span className="text-[8px] bg-white border border-slate-200 text-slate-600 px-1 rounded mt-0.5 font-bold">ระยอง</span>
          </div>

          {/* Node C */}
          <div className="absolute right-[30px] bottom-[25px] flex flex-col items-center">
            <div className="w-5 h-5 rounded-full bg-blue-600 border-2 border-white flex items-center justify-center text-white shadow">
              <span className="text-[9px] font-bold">C</span>
            </div>
            <span className="text-[8px] bg-white border border-slate-200 text-slate-600 px-1 rounded mt-0.5 font-bold">พัทยา</span>
          </div>

          {/* Optimization Metric Overlay */}
          {optimized && (
            <div className="absolute top-3 left-3 bg-emerald-500 text-white px-2 py-0.5 rounded-md font-bold text-[9px] flex items-center gap-1 shadow animate-scale-up">
              <CheckCircle2 size={10} />
              <span>เส้นทางที่ดีที่สุด</span>
            </div>
          )}
        </div>

        {/* Action Button */}
        {!optimized ? (
          <button
            onClick={runOptimizer}
            disabled={loading}
            className="w-full flex items-center justify-center gap-2 rounded-xl bg-brand-gradient hover:opacity-90 text-white font-bold py-3.5 transition-all shadow-md font-sans text-xs"
          >
            {loading ? (
              <>
                <div className="w-4 h-4 rounded-full border-2 border-white/20 border-t-white animate-spin" />
                <span>กำลังวิเคราะห์เส้นทางที่ดีที่สุด...</span>
              </>
            ) : (
              <>
                <Navigation size={14} />
                <span>ค้นหาเส้นทางขนส่งประหยัดสุด (Optimize Route)</span>
              </>
            )}
          </button>
        ) : (
          <button
            onClick={resetWidget}
            className="w-full flex items-center justify-center gap-1.5 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 font-semibold py-2.5 transition-colors font-sans text-xs"
          >
            <RefreshCw size={12} />
            <span>จำลองรอบใหม่</span>
          </button>
        )}
      </div>

      <style dangerouslySetInnerHTML={{ __html: `
        @keyframes dash {
          to {
            stroke-dashoffset: -40;
          }
        }
        .animate-dash {
          animation: dash 1.5s linear infinite;
        }
      ` }} />
    </div>
  );
}
