"use client";

import React, { useState } from "react";
import { Sparkles, MessageSquare, Terminal, BarChart3, TrendingUp, RefreshCw, Send } from "lucide-react";

interface QueryOption {
  question: string;
  sql: string;
  chartType: "bar" | "line" | "pie";
  data: { label: string; value: number; color: string }[];
  insight: string;
}

const QUERY_OPTIONS: QueryOption[] = [
  {
    question: "ขอยอดขายแยกตามแผนกในปีนี้",
    sql: "SELECT category, SUM(amount) FROM sales_invoice_items JOIN sales_invoices ON invoice_id = sales_invoices.id WHERE EXTRACT(YEAR FROM created_at) = 2026 GROUP BY category;",
    chartType: "bar",
    data: [
      { label: "เครื่องดื่ม", value: 340000, color: "bg-blue-500" },
      { label: "ขนม/ของแห้ง", value: 210000, color: "bg-cyan-500" },
      { label: "ของสด", value: 480000, color: "bg-emerald-500" },
      { label: "เครื่องเขียน", value: 120000, color: "bg-violet-500" },
    ],
    insight: "แผนก 'ของสด' มียอดขายสูงสุด คิดเป็น 41.7% ของพอร์ต โดยเติบโตขึ้น 12% MoM จากอานิสงส์วัตถุดิบนำเข้าช่วงเทศกาล",
  },
  {
    question: "วิเคราะห์แนวโน้มกำไรขั้นต้น 4 เดือนล่าสุด",
    sql: "SELECT TO_CHAR(date, 'Mon') as month, SUM(revenue - cost) as profit FROM financial_summaries GROUP BY month ORDER BY min(date);",
    chartType: "line",
    data: [
      { label: "ม.ค.", value: 145000, color: "bg-blue-500" },
      { label: "ก.พ.", value: 168000, color: "bg-blue-500" },
      { label: "มี.ค.", value: 189000, color: "bg-blue-500" },
      { label: "เม.ย.", value: 232000, color: "bg-blue-500" },
    ],
    insight: "อัตรากำไรขั้นต้นปรับตัวสูงขึ้นต่อเนื่องเฉลี่ย 18% ต่อเดือน เนื่องจากการเจรจาขอลดราคาส่งกับซัพพลายเออร์หลักสำเร็จ",
  },
  {
    question: "คาดการณ์กระแสเงินสดในอีก 30 วันข้างหน้า",
    sql: "SELECT date, cash_balance FROM forecast_cash_flow(30);",
    chartType: "pie", // We'll show a donut balance ratio or indicator
    data: [
      { label: "เงินสดรับคาดการณ์", value: 650000, color: "bg-emerald-500" },
      { label: "เงินสดจ่ายคงที่", value: 320000, color: "bg-rose-500" },
      { label: "เงินสดสำรองปลอดภัย", value: 150000, color: "bg-amber-500" },
    ],
    insight: "คาดว่าจะมี Net Cash Inflow เป็นบวก 330,000 บาท ใน 30 วันข้างหน้า ปราศจากความเสี่ยงด้านสภาพคล่อง แนะนำลงทุนระยะสั้น",
  },
];

export default function ExecutiveWidget() {
  const [selectedIdx, setSelectedIdx] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);
  const [customText, setCustomText] = useState("");
  const [showResult, setShowResult] = useState(false);

  const handleSelectQuery = (idx: number) => {
    setLoading(true);
    setSelectedIdx(idx);
    setShowResult(false);
    setTimeout(() => {
      setLoading(false);
      setShowResult(true);
    }, 1800);
  };

  const handleCustomSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!customText.trim()) return;
    setLoading(true);
    // Find closest index or default to sales (0)
    setSelectedIdx(0);
    setShowResult(false);
    setTimeout(() => {
      setLoading(false);
      setShowResult(true);
    }, 2000);
  };

  const currentQuery = selectedIdx !== null ? QUERY_OPTIONS[selectedIdx] : null;

  return (
    <div className="w-full rounded-2xl border border-slate-200 bg-white overflow-hidden shadow-lg flex flex-col min-h-[500px] text-slate-700 font-sans">
      {/* Header */}
      <div className="bg-slate-50 border-b border-slate-200 px-4 py-3 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="w-2.5 h-2.5 rounded-full bg-indigo-600 animate-pulse" />
          <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Conversational BI Engine</span>
        </div>
        <span className="text-[10px] bg-indigo-50 border border-indigo-100 text-indigo-700 px-2 py-0.5 rounded-full font-bold">
          v1.0 - Live SQL Connection
        </span>
      </div>

      <div className="p-5 flex-1 flex flex-col justify-between gap-4">
        {/* Chat Terminal / Prompt list */}
        <div className="space-y-3">
          <div className="text-xs text-slate-500 font-medium">คำถามยอดนิยม หรือเริ่มถามเพื่อทดลองใช้งาน:</div>
          <div className="flex flex-wrap gap-2">
            {QUERY_OPTIONS.map((opt, idx) => (
              <button
                key={idx}
                onClick={() => handleSelectQuery(idx)}
                disabled={loading}
                className={`text-xs px-3 py-2 rounded-xl border text-left transition-all cursor-pointer ${
                  selectedIdx === idx
                    ? "bg-indigo-50 border-indigo-300 text-indigo-700 font-semibold"
                    : "bg-slate-50 border-slate-200 hover:bg-slate-100 text-slate-600"
                }`}
              >
                {opt.question}
              </button>
            ))}
          </div>

          {/* Prompt input */}
          <form onSubmit={handleCustomSubmit} className="flex gap-2">
            <div className="relative flex-1">
              <input
                type="text"
                value={customText}
                onChange={(e) => setCustomText(e.target.value)}
                placeholder="พิมพ์คำถามธุรกิจ เช่น ขอยอดขายรายเดือน..."
                className="w-full text-xs pl-3 pr-8 py-2.5 rounded-xl border border-slate-200 focus:outline-none focus:border-indigo-500"
              />
              <MessageSquare size={14} className="absolute right-3 top-3 text-slate-400" />
            </div>
            <button
              type="submit"
              className="bg-brand-gradient text-white px-3.5 py-2.5 rounded-xl text-xs font-bold flex items-center justify-center cursor-pointer shadow hover:opacity-95"
            >
              <Send size={14} />
            </button>
          </form>
        </div>

        {/* Console / Output Area */}
        <div className="flex-1 min-h-[220px] rounded-2xl bg-slate-900 border border-slate-800 p-4 font-mono text-slate-350 text-xs flex flex-col justify-between relative overflow-hidden">
          {/* Subtle grid pattern background */}
          <div className="absolute inset-0 bg-[linear-gradient(to_right,#1e293b_1px,transparent_1px),linear-gradient(to_bottom,#1e293b_1px,transparent_1px)] bg-[size:14px_14px] opacity-25 pointer-events-none" />

          {loading && (
            <div className="absolute inset-0 bg-slate-900/90 flex flex-col items-center justify-center gap-3 z-10">
              <div className="flex gap-1.5 items-center">
                <span className="w-2.5 h-2.5 rounded-full bg-indigo-500 animate-bounce [animation-delay:-0.3s]" />
                <span className="w-2.5 h-2.5 rounded-full bg-indigo-400 animate-bounce [animation-delay:-0.15s]" />
                <span className="w-2.5 h-2.5 rounded-full bg-indigo-300 animate-bounce" />
              </div>
              <span className="text-[10px] text-slate-400 animate-pulse">กำลังประมวลผลคำถามภาษาไทยเป็นคำสั่ง SQL...</span>
            </div>
          )}

          {!loading && !showResult && (
            <div className="flex-1 flex flex-col items-center justify-center text-center text-slate-500 py-10">
              <Terminal size={24} className="mb-2 text-slate-600" />
              <p className="text-[11px]">เลือกหัวข้อคำถามด้านบน เพื่อดูกระบวนการแปลงคำสั่งและการเรนเดอร์กราฟรายงาน</p>
            </div>
          )}

          {showResult && currentQuery && (
            <div className="space-y-3 z-10 flex flex-col h-full justify-between">
              {/* SQL translation box */}
              <div className="space-y-1 bg-slate-950 border border-slate-800 rounded-lg p-2.5">
                <div className="flex items-center gap-1.5 text-[9px] font-bold text-indigo-400 uppercase tracking-wider">
                  <Terminal size={10} />
                  <span>TRANSLATED POSTGRESQL QUERY</span>
                </div>
                <div className="text-[10px] text-emerald-400 break-all leading-relaxed whitespace-pre-wrap">
                  {currentQuery.sql}
                </div>
              </div>

              {/* Dynamic Chart Container */}
              <div className="flex-1 flex items-center justify-center py-2 min-h-[100px]">
                {currentQuery.chartType === "bar" && (
                  <div className="w-full flex items-end justify-around h-[90px] px-4 pt-4 border-b border-slate-700">
                    {currentQuery.data.map((item, idx) => {
                      const percentage = (item.value / 480000) * 100;
                      return (
                        <div key={idx} className="flex flex-col items-center gap-1 flex-1 max-w-[60px]">
                          <span className="text-[8px] text-slate-400 font-bold">{(item.value / 1000).toLocaleString()}k</span>
                          <div
                            className={`w-8 rounded-t-md ${item.color} transition-all duration-1000 ease-out`}
                            style={{ height: `${percentage}%` }}
                          />
                          <span className="text-[9px] text-slate-400 truncate w-full text-center mt-0.5">{item.label}</span>
                        </div>
                      );
                    })}
                  </div>
                )}

                {currentQuery.chartType === "line" && (
                  <div className="w-full flex flex-col justify-between h-[90px] px-2">
                    <div className="flex items-end justify-between h-[70px] border-b border-slate-700 relative px-4">
                      {/* Grid Line */}
                      <div className="absolute left-0 right-0 top-1/3 border-t border-slate-800/80" />
                      <div className="absolute left-0 right-0 top-2/3 border-t border-slate-800/80" />

                      {/* SVG Line representation */}
                      <svg className="absolute inset-0 w-full h-[70px] px-8" viewBox="0 0 100 50" preserveAspectRatio="none">
                        <path
                          d="M 5 38 L 35 32 L 65 24 L 95 10"
                          fill="none"
                          stroke="#3b82f6"
                          strokeWidth="2.5"
                          className="animate-draw-path"
                        />
                        {/* Data dots */}
                        <circle cx="5" cy="38" r="2.5" fill="#60a5fa" />
                        <circle cx="35" cy="32" r="2.5" fill="#60a5fa" />
                        <circle cx="65" cy="24" r="2.5" fill="#60a5fa" />
                        <circle cx="95" cy="10" r="2.5" fill="#60a5fa" />
                      </svg>
                    </div>
                    <div className="flex justify-between text-[9px] text-slate-400 px-6 mt-1">
                      {currentQuery.data.map((item, idx) => (
                        <span key={idx}>{item.label} ({Math.round(item.value / 1000)}k)</span>
                      ))}
                    </div>
                  </div>
                )}

                {currentQuery.chartType === "pie" && (
                  <div className="flex gap-4 items-center justify-center w-full px-4">
                    {/* Mock circular progress / Donut chart */}
                    <div className="w-16 h-16 rounded-full border-8 border-slate-800 relative flex items-center justify-center shrink-0">
                      <div className="absolute inset-0 rounded-full border-8 border-emerald-500 border-t-transparent border-r-transparent animate-spin-slow" />
                      <div className="text-[9px] text-slate-300 font-bold">Inflow</div>
                    </div>
                    <div className="grid grid-cols-1 gap-1 text-[9px] text-slate-400 flex-1">
                      {currentQuery.data.map((item, idx) => (
                        <div key={idx} className="flex items-center gap-1.5">
                          <span className={`w-2 h-2 rounded-full ${item.color}`} />
                          <span className="font-semibold text-slate-350">{item.label}:</span>
                          <span>{(item.value / 1000).toLocaleString()}k</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              {/* Strategic Insights */}
              <div className="bg-indigo-950/60 border border-indigo-900/60 rounded-xl p-3 flex gap-2.5 items-start">
                <Sparkles size={14} className="text-indigo-400 shrink-0 mt-0.5" />
                <p className="text-[10px] text-indigo-200 leading-relaxed font-sans">
                  <strong className="text-indigo-100">AI Insight:</strong> {currentQuery.insight}
                </p>
              </div>
            </div>
          )}
        </div>
      </div>

      <style dangerouslySetInnerHTML={{ __html: `
        @keyframes drawPath {
          from {
            stroke-dasharray: 1000;
            stroke-dashoffset: 1000;
          }
          to {
            stroke-dasharray: 1000;
            stroke-dashoffset: 0;
          }
        }
        .animate-draw-path {
          animation: drawPath 1.5s ease-out forwards;
        }
        .animate-spin-slow {
          animation: spin 3s linear infinite;
        }
      ` }} />
    </div>
  );
}
