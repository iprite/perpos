"use client";

import React, { useState } from "react";
import { Terminal, CheckCircle2, AlertTriangle, Sparkles } from "lucide-react";

interface Question {
  id: string;
  label: string;
  queryText: string;
  sql: string;
  response: string;
  chartType: "line" | "bar" | "radial";
}

const PRESET_QUESTIONS: Question[] = [
  {
    id: "cashflow",
    label: "Predict next 30-day Cash Flow",
    queryText: "ช่วยวิเคราะห์และคาดการณ์กระแสเงินสด (Cash Flow) ของบริษัทในอีก 30 วันข้างหน้าหน่อย",
    sql: "SELECT date, SUM(amount) AS net_flow FROM finance_entries WHERE date BETWEEN NOW() AND NOW() + INTERVAL '30 days' GROUP BY 1 ORDER BY 1 ASC;",
    response: "จากการจำลองสถานการณ์การเงิน (What-If Simulation) ของลูกหนี้การค้า (AR) ที่คาดว่าจะเก็บเงินได้ และกำหนดชำระหนี้ฝั่งเจ้าหนี้ (AP) กระแสเงินสดของท่านมีความมั่นคงสูง โดยคาดการณ์ว่ามี Net cash flow เป็นบวกสะสมเพิ่มขึ้น 342,000 THB ภายในสิ้นเดือนนี้",
    chartType: "line"
  },
  {
    id: "sales",
    label: "Analyze top 3 sales drivers this month",
    queryText: "ขอดูปัจจัยที่สร้างรายได้ (Sales Drivers) สูงสุด 3 อันดับแรกของเดือนนี้",
    sql: "SELECT p.name, SUM(oi.quantity * oi.price) AS total_sales FROM order_items oi JOIN products p ON oi.product_id = p.id WHERE oi.created_at >= DATE_TRUNC('month', CURRENT_DATE) GROUP BY 1 ORDER BY 2 DESC LIMIT 3;",
    response: "สินค้าขายดีหลักในเดือนนี้ขับเคลื่อนด้วย 1) สัญญาบริการ Enterprise SaaS (+42%), 2) บริการ Implementation & Setup Service (+28%) และ 3) ระบบ API Gateway Integration สำหรับองค์กร (+18%)",
    chartType: "bar"
  },
  {
    id: "leakage",
    label: "Audit procurement leakage",
    queryText: "ตรวจสอบความผิดปกติและรอยรั่วไหลของการจัดซื้อ (Procurement Leakage)",
    sql: "SELECT supplier_name, COUNT(id) AS double_invoices, SUM(amount) AS potential_loss FROM purchase_invoices WHERE status = 'flagged' GROUP BY 1 HAVING COUNT(id) > 1;",
    response: "ระบบตรวจพบความผิดปกติ (Anomaly Detected) ในกระบวนการสั่งซื้อ: พบใบแจ้งหนี้ซ้ำซ้อน (Duplicate Invoices) จากซัพพลายเออร์อะไหล่ยนต์ 2 รายการ มูลค่าความเสี่ยงรวม 84,200 THB แนะนำให้กดยกเลิกรายการสั่งซื้อซ้ำซ้อนทันที",
    chartType: "radial"
  }
];

export default function ChatTerminal() {
  const [activeQuestion, setActiveQuestion] = useState<Question | null>(null);
  const [isTyping, setIsTyping] = useState(false);
  const [step, setStep] = useState<"idle" | "user" | "sql" | "chart">("idle");

  const handleSelectQuestion = (q: Question) => {
    if (isTyping) return;
    setActiveQuestion(q);
    setStep("user");
    setIsTyping(true);

    // Animate typing flow
    setTimeout(() => {
      setStep("sql");
      setTimeout(() => {
        setStep("chart");
        setIsTyping(false);
      }, 1200);
    }, 1000);
  };

  return (
    <div className="w-full rounded-2xl border border-slate-200 bg-[#f8fafc] shadow-lg overflow-hidden font-mono text-xs text-slate-700">
      {/* Terminal Header */}
      <div className="flex items-center justify-between px-4 py-3 bg-slate-100/80 border-b border-slate-200">
        <div className="flex items-center gap-2">
          <div className="w-3 h-3 rounded-full bg-red-400" />
          <div className="w-3 h-3 rounded-full bg-yellow-400" />
          <div className="w-3 h-3 rounded-full bg-green-400" />
          <span className="ml-2 text-xs font-semibold text-slate-500 flex items-center gap-1.5">
            <Terminal size={14} className="text-blue-500" />
            live-executive-assistant.sh
          </span>
        </div>
        <div className="flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-blue-50 border border-blue-100 text-[10px] text-blue-600 font-semibold animate-pulse">
          <Sparkles size={10} />
          SYSTEM OF ACTION
        </div>
      </div>

      {/* Terminal Body */}
      <div className="p-5 min-h-[350px] flex flex-col justify-between gap-4">
        {/* Chat History Area */}
        <div className="space-y-4 overflow-y-auto max-h-[300px] custom-scrollbar flex-1">
          {step === "idle" && (
            <div className="space-y-3 py-6 text-center max-w-sm mx-auto">
              <div className="w-12 h-12 rounded-full bg-blue-50 border border-blue-100 flex items-center justify-center mx-auto animate-bounce">
                <Sparkles className="text-blue-500" size={24} />
              </div>
              <p className="text-sm font-semibold text-slate-800">ทดสอบใช้งาน Executive Assistant</p>
              <p className="text-slate-500 text-[11px] leading-relaxed">
                คลิกคำถามเชิงกลยุทธ์ด้านล่างเพื่อสั่งงาน AI วิเคราะห์ฐานข้อมูลองค์กรและดึงคำตอบพร้อมแผนภูมิวิเคราะห์แบบทันที
              </p>
            </div>
          )}

          {/* User question */}
          {step !== "idle" && activeQuestion && (
            <div className="space-y-1">
              <div className="text-slate-400 flex items-center gap-1.5">
                <span className="text-blue-600">CEO@PERPOS:~ $</span> ask_ai --query
              </div>
              <div className="p-3 rounded-lg bg-white border border-slate-200 text-slate-800 leading-relaxed text-[11px]">
                &ldquo;{activeQuestion.queryText}&rdquo;
              </div>
            </div>
          )}

          {/* SQL parsing state */}
          {(step === "sql" || step === "chart") && activeQuestion && (
            <div className="space-y-1 animate-fade-in">
              <div className="text-slate-400 flex items-center gap-1.5">
                <span className="text-blue-600">AI_AGENT:~ $</span> sql_generator --target ledger_db
              </div>
              <div className="p-2.5 rounded-md bg-[#0f172a] text-cyan-400 text-[10px] whitespace-pre-wrap overflow-x-auto leading-normal">
                {activeQuestion.sql}
              </div>
            </div>
          )}

          {/* Result Response & SVG charts */}
          {step === "chart" && activeQuestion && (
            <div className="space-y-3.5 animate-fade-in">
              <div className="text-slate-400 flex items-center gap-1.5">
                <span className="text-blue-600">AI_AGENT:~ $</span> render_executive_briefing
              </div>
              <div className="p-4 rounded-lg bg-white border border-slate-200 text-slate-800 space-y-4">
                <div className="flex gap-2.5 items-start">
                  <div className="w-5 h-5 rounded bg-blue-50 border border-blue-100 flex items-center justify-center shrink-0 mt-0.5">
                    <Sparkles className="text-blue-600" size={12} />
                  </div>
                  <p className="text-[11px] leading-relaxed text-slate-700">{activeQuestion.response}</p>
                </div>

                {/* SVG Chart Rendering */}
                <div className="w-full flex justify-center py-2 bg-slate-50/50 rounded-lg border border-slate-100 relative overflow-hidden">
                  {/* Grid Lines */}
                  <div className="absolute inset-0 bg-[linear-gradient(rgba(0,0,0,0.02)_1px,transparent_1px),linear-gradient(90deg,rgba(0,0,0,0.02)_1px,transparent_1px)] bg-[size:20px_20px]" />

                  {activeQuestion.chartType === "line" && (
                    <svg width="320" height="120" className="relative z-10 overflow-visible">
                      <defs>
                        <linearGradient id="gradient-line" x1="0%" y1="0%" x2="0%" y2="100%">
                          <stop offset="0%" stopColor="#2563eb" stopOpacity="0.15" />
                          <stop offset="100%" stopColor="#2563eb" stopOpacity="0.0" />
                        </linearGradient>
                      </defs>
                      {/* Grid Horizontal */}
                      <line x1="0" y1="100" x2="320" y2="100" stroke="#e2e8f0" strokeWidth="1" strokeDasharray="3 3" />
                      <line x1="0" y1="60" x2="320" y2="60" stroke="#e2e8f0" strokeWidth="1" strokeDasharray="3 3" />
                      <line x1="0" y1="20" x2="320" y2="20" stroke="#e2e8f0" strokeWidth="1" strokeDasharray="3 3" />

                      {/* Area under the line */}
                      <path
                        d="M 10 100 Q 80 80, 150 40 T 290 20 L 290 100 L 10 100 Z"
                        fill="url(#gradient-line)"
                        className="animate-chart-fill"
                      />

                      {/* Main Trend Line */}
                      <path
                        d="M 10 100 Q 80 80, 150 40 T 290 20"
                        fill="none"
                        stroke="#2563eb"
                        strokeWidth="3"
                        strokeLinecap="round"
                        className="stroke-draw"
                        style={{
                          strokeDasharray: 500,
                          strokeDashoffset: 500,
                          animation: "draw-path 2.5s ease-out forwards"
                        }}
                      />

                      {/* Pulse Node */}
                      <circle cx="290" cy="20" r="4" fill="#3b82f6" className="animate-ping" />
                      <circle cx="290" cy="20" r="3" fill="#2563eb" />

                      {/* Text tags */}
                      <text x="12" y="112" fill="#94a3b8" fontSize="9">Today</text>
                      <text x="260" y="112" fill="#94a3b8" fontSize="9">30 Days</text>
                      <text x="235" y="15" fill="#10b981" fontSize="9" fontWeight="bold">+342,000 THB</text>
                    </svg>
                  )}

                  {activeQuestion.chartType === "bar" && (
                    <div className="w-full max-w-[280px] space-y-3.5 relative z-10 py-1">
                      {/* Bar 1 */}
                      <div className="space-y-1">
                        <div className="flex justify-between text-[9px] text-slate-500">
                          <span>1. Contract Enterprise SaaS</span>
                          <span className="text-blue-600 font-semibold">42% (Sales share)</span>
                        </div>
                        <div className="h-2 w-full bg-slate-100 rounded overflow-hidden border border-slate-200">
                          <div className="h-full bg-gradient-to-r from-blue-600 to-blue-400 rounded transition-all duration-1000 ease-out" style={{ width: "85%" }} />
                        </div>
                      </div>
                      {/* Bar 2 */}
                      <div className="space-y-1">
                        <div className="flex justify-between text-[9px] text-slate-500">
                          <span>2. Implementation Service</span>
                          <span className="text-blue-600 font-semibold">28%</span>
                        </div>
                        <div className="h-2 w-full bg-slate-100 rounded overflow-hidden border border-slate-200">
                          <div className="h-full bg-gradient-to-r from-cyan-600 to-blue-500 rounded transition-all duration-1000 ease-out" style={{ width: "65%" }} />
                        </div>
                      </div>
                      {/* Bar 3 */}
                      <div className="space-y-1">
                        <div className="flex justify-between text-[9px] text-slate-500">
                          <span>3. API Integration Service</span>
                          <span className="text-blue-600 font-semibold">18%</span>
                        </div>
                        <div className="h-2 w-full bg-slate-100 rounded overflow-hidden border border-slate-200">
                          <div className="h-full bg-gradient-to-r from-cyan-700 to-cyan-500 rounded transition-all duration-1000 ease-out" style={{ width: "40%" }} />
                        </div>
                      </div>
                    </div>
                  )}

                  {activeQuestion.chartType === "radial" && (
                    <div className="flex items-center gap-6 relative z-10 p-2">
                      <svg width="80" height="80" className="transform -rotate-90">
                        <circle cx="40" cy="40" r="30" stroke="#f1f5f9" strokeWidth="6" fill="transparent" />
                        <circle
                          cx="40"
                          cy="40"
                          r="30"
                          stroke="#ef4444"
                          strokeWidth="6"
                          fill="transparent"
                          strokeDasharray={188.4}
                          strokeDashoffset={188.4 - (188.4 * 0.124)}
                          className="transition-all duration-1000 ease-out"
                        />
                      </svg>
                      <div className="space-y-1.5">
                        <div className="flex items-center gap-1.5 text-red-500 font-semibold text-[11px]">
                          <AlertTriangle size={12} />
                          Procurement Leakage Detected
                        </div>
                        <div className="text-[14px] font-bold text-slate-800">
                          12.4% <span className="text-[10px] text-slate-400 font-normal">of procurement value</span>
                        </div>
                        <div className="text-[9px] text-slate-500 leading-snug">
                          พบการเรียกเก็บซ้ำซ้อน 2 รายการ<br />มูลค่าเสี่ยงสูญเสีย 84,200 THB
                        </div>
                      </div>
                    </div>
                  )}
                </div>

                {/* Status indicator */}
                <div className="flex items-center justify-between text-[9px] text-slate-400 border-t border-slate-100 pt-2.5">
                  <span className="flex items-center gap-1 text-emerald-600">
                    <CheckCircle2 size={11} />
                    Verified by Auditing Engine
                  </span>
                  <span>Latency: 2.18s</span>
                </div>
              </div>
            </div>
          )}

          {/* Typing Indicator */}
          {isTyping && (
            <div className="flex items-center gap-2 p-3 bg-slate-100/50 border border-slate-200 rounded-lg text-slate-500 animate-pulse">
              <div className="flex gap-1">
                <span className="w-1.5 h-1.5 bg-blue-500 rounded-full animate-bounce" style={{ animationDelay: "0ms" }} />
                <span className="w-1.5 h-1.5 bg-blue-500 rounded-full animate-bounce" style={{ animationDelay: "200ms" }} />
                <span className="w-1.5 h-1.5 bg-blue-500 rounded-full animate-bounce" style={{ animationDelay: "400ms" }} />
              </div>
              <span className="text-[10px] italic">Executive Assistant กำลังดึงข้อมูลและประมวลผลโมเดล...</span>
            </div>
          )}
        </div>

        {/* Input box / Question Selector */}
        <div className="space-y-3">
          <div className="text-[10px] text-slate-400 font-semibold uppercase tracking-wider">
            คำถามวิเคราะห์ข้อมูลเชิงกลยุทธ์ (Strategic Inquiries)
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
            {PRESET_QUESTIONS.map((q) => (
              <button
                key={q.id}
                onClick={() => handleSelectQuestion(q)}
                disabled={isTyping}
                className={`text-left p-2.5 rounded-lg border transition-all ${
                  activeQuestion?.id === q.id
                    ? "border-blue-400 bg-blue-50/50 text-blue-700 font-medium"
                    : "border-slate-200 bg-white hover:border-blue-400/40 hover:bg-slate-50 text-slate-600 hover:text-slate-900"
                } disabled:opacity-50`}
              >
                {q.label}
              </button>
            ))}
          </div>
        </div>
      </div>
      <style dangerouslySetInnerHTML={{ __html: `
        @keyframes draw-path {
          to {
            stroke-dashoffset: 0;
          }
        }
        .animate-chart-fill {
          animation: fade-fill 1s ease-out 1.2s forwards;
          opacity: 0;
        }
        @keyframes fade-fill {
          to {
            opacity: 1;
          }
        }
      ` }} />
    </div>
  );
}
