"use client";

import React, { useState } from "react";
import { Upload, FileText, CheckCircle2, ChevronRight, Play } from "lucide-react";
import { translations } from "./locales";

export default function OcrSimulation({ lang = "th" }: { lang?: "th" | "en" }) {
  const [status, setStatus] = useState<"idle" | "scanning" | "completed">("idle");
  const [logText, setLogText] = useState("");
  const t = translations[lang].ocrSimulation;

  const runSimulation = () => {
    setStatus("scanning");
    setLogText("Initialize OCR Core...");

    setTimeout(() => {
      setLogText("Streaming document content as binary raw...");
      setTimeout(() => {
        setLogText("Running layout analysis & bounding box segmentation...");
        setTimeout(() => {
          setLogText("Parsing fields via Multi-Modal LLM Parser...");
          setTimeout(() => {
            setLogText("Validating totals & tax checks... Success");
            setTimeout(() => {
              setStatus("completed");
            }, 600);
          }, 600);
        }, 600);
      }, 600);
    }, 500);
  };

  const resetSim = () => {
    setStatus("idle");
    setLogText("");
  };

  const getLocalizedLogText = (text: string) => {
    if (lang === "en") return text;
    const mapping: Record<string, string> = {
      "Initialize OCR Core...": "กำลังเริ่มต้นระบบ OCR Core...",
      "Streaming document content as binary raw...": "กำลังดึงข้อมูลไฟล์เอกสารและแปลงเป็นไบนารี...",
      "Running layout analysis & bounding box segmentation...": "กำลังวิเคราะห์โครงร่างเอกสารและจัดแบ่งส่วนข้อมูล...",
      "Parsing fields via Multi-Modal LLM Parser...": "กำลังสกัดและคัดกรองข้อมูลด้วย Multi-Modal LLM...",
      "Validating totals & tax checks... Success": "กำลังตรวจสอบความถูกต้องของยอดรวมและภาษี... สำเร็จ"
    };
    return mapping[text] ?? text;
  };

  return (
    <div className="w-full rounded-2xl border border-slate-200 bg-white overflow-hidden font-mono text-xs shadow-lg relative min-h-[380px] flex flex-col justify-between text-slate-700">
      {/* Laser Scanning Effect */}
      {status === "scanning" && (
        <div className="absolute top-0 left-0 w-full h-[5px] bg-gradient-to-r from-transparent via-blue-500 to-transparent shadow-[0_0_15px_#3b82f6] animate-laser-move z-20 pointer-events-none" />
      )}

      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 bg-slate-50 border-b border-slate-200">
        <div className="flex items-center gap-2 text-slate-550">
          <FileText size={14} className="text-blue-500" />
          <span>{t.title}</span>
        </div>
        <div className="flex items-center gap-2">
          {status !== "idle" && (
            <button
              onClick={resetSim}
              className="text-[10px] bg-white border border-slate-200 text-slate-500 hover:text-slate-800 px-2 py-0.5 rounded-md hover:bg-slate-50 transition-colors font-sans"
            >
              {t.reset}
            </button>
          )}
          <span className={`w-2.5 h-2.5 rounded-full ${
            status === "idle" ? "bg-slate-300" : status === "scanning" ? "bg-amber-500 animate-pulse" : "bg-emerald-500"
          }`} />
        </div>
      </div>

      {/* Body Area */}
      <div className="flex-1 p-5 flex flex-col justify-center">
        {status === "idle" && (
          <div
            onClick={runSimulation}
            className="border border-dashed border-slate-200 hover:border-blue-400 rounded-xl p-8 flex flex-col items-center justify-center text-center cursor-pointer transition-all bg-slate-50/30 hover:bg-blue-50/5 group"
          >
            <div className="w-12 h-12 rounded-full bg-slate-50 border border-slate-250/60 flex items-center justify-center mb-4 group-hover:scale-105 transition-transform group-hover:border-blue-400">
              <Upload className="text-slate-400 group-hover:text-blue-500" size={20} />
            </div>
            <p className="text-sm font-semibold text-slate-800 mb-1.5 font-sans">{t.uploadTitle}</p>
            <p className="text-slate-400 text-[11px] max-w-xs leading-relaxed mb-4 font-sans">
              {t.uploadDesc}
            </p>
            <button className="flex items-center gap-1.5 bg-gradient-to-r from-blue-600 to-blue-500 hover:from-blue-500 hover:to-blue-400 text-white font-semibold text-[11px] px-4 py-2 rounded-lg transition-colors shadow-md font-sans">
              <Play size={12} fill="white" />
              {t.sampleBtn}
            </button>
          </div>
        )}

        {status === "scanning" && (
          <div className="space-y-4 py-6 font-sans">
            <div className="flex flex-col items-center justify-center py-4">
              <div className="w-10 h-10 rounded-full border-2 border-blue-500/20 border-t-blue-500 animate-spin mb-4" />
              <div className="text-blue-600 font-semibold text-xs animate-pulse">
                {t.scanning}
              </div>
            </div>
            <div className="bg-[#0f172a] border border-slate-950 rounded-lg p-3 text-[10px] text-slate-500 leading-relaxed font-mono">
              <div className="text-cyan-400">&gt;&nbsp;{getLocalizedLogText(logText)}</div>
              {logText !== "Initialize OCR Core..." && <div className="text-slate-400 opacity-60">&gt;&nbsp;{t.analyzing}</div>}
              {logText.includes("layout") && <div className="text-slate-400 opacity-60">&gt;&nbsp;{t.detected}</div>}
            </div>
          </div>
        )}

        {status === "completed" && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 animate-fade-in py-2">
            {/* Left Column: Mock Invoice representation */}
            <div className="bg-slate-50 border border-slate-200 rounded-lg p-3.5 space-y-3 font-sans">
              <div className="flex justify-between items-start border-b border-slate-200 pb-2">
                <div>
                  <h4 className="text-xs font-bold text-slate-800">{t.mockInvoice.title}</h4>
                  <span className="text-[9px] text-slate-400">{t.mockInvoice.supplier}</span>
                </div>
                <div className="text-right text-[9px] text-slate-400 font-mono">
                  <div>INV-2026-0042</div>
                  <div>Date: 02/06/2026</div>
                </div>
              </div>
              <div className="space-y-2 py-1.5 text-[9px]">
                <div className="flex justify-between border-b border-slate-100 pb-1 text-slate-400 font-bold">
                  <span>{t.mockInvoice.itemDesc}</span>
                  <span>{t.mockInvoice.totalLabel}</span>
                </div>
                <div className="flex justify-between text-slate-700">
                  <span>{t.mockInvoice.subtotal}</span>
                  <span className="font-mono">{t.mockInvoice.subtotalVal}</span>
                </div>
                <div className="flex justify-between text-slate-700">
                  <span>{t.mockInvoice.item2}</span>
                  <span className="font-mono">{t.mockInvoice.item2Val}</span>
                </div>
              </div>
              <div className="border-t border-slate-200 pt-2 flex flex-col items-end text-[10px]">
                <div className="flex justify-between w-full max-w-[120px] text-slate-400">
                  <span>{t.mockInvoice.vat}</span>
                  <span className="font-mono">3,150.00</span>
                </div>
                <div className="flex justify-between w-full max-w-[120px] text-slate-800 font-bold mt-1">
                  <span>{t.mockInvoice.total}</span>
                  <span className="text-[#292e91] font-mono">48,150.00</span>
                </div>
              </div>
            </div>

            {/* Right Column: Extracted JSON */}
            <div className="bg-[#0f172a] border border-slate-950 rounded-lg p-3.5 flex flex-col justify-between">
              <div>
                <div className="text-[10px] text-cyan-400 font-semibold mb-2 border-b border-slate-850 pb-1.5 flex items-center justify-between font-sans">
                  <span>{t.extractedTitle}</span>
                  <span className="text-[9px] bg-blue-950 text-cyan-400 px-1.5 py-0.5 rounded">{t.matchBadge}</span>
                </div>
                <pre className="text-[9px] text-cyan-400/90 leading-tight overflow-x-auto whitespace-pre-wrap font-mono">
{`{
  "invoice_number": "INV-2026-0042",
  "vendor_tax_id": "0105562000223",
  "issue_date": "2026-06-02",
  "subtotal": 45000.00,
  "vat_amount": 3150.00,
  "total_amount": 48150.00,
  "accounting_action": "AUTO_BOOKED"
}`}
                </pre>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Footer log */}
      {status === "completed" && (
        <div className="px-4 py-3 bg-emerald-50 border-t border-emerald-100 text-emerald-800 flex flex-col sm:flex-row sm:items-center justify-between gap-2 animate-fade-in font-sans">
          <div className="flex items-center gap-1.5">
            <CheckCircle2 size={13} className="text-emerald-600" />
            <span className="font-bold">{t.successBanner}</span>
            <ChevronRight size={10} className="opacity-60" />
            <span className="text-[10px] text-emerald-700/80 font-mono">{t.successSub}</span>
          </div>
          <span className="text-[10px] bg-emerald-100 border border-emerald-200 px-2 py-0.5 rounded font-mono font-medium">
            {t.successCode}
          </span>
        </div>
      )}

      {status === "idle" && (
        <div className="px-4 py-3 bg-slate-50 border-t border-slate-200 text-slate-400 text-[10px] text-center font-sans">
          {t.footerWarning}
        </div>
      )}

      <style dangerouslySetInnerHTML={{ __html: `
        @keyframes laser-move {
          0% {
            top: 0%;
          }
          50% {
            top: 100%;
          }
          100% {
            top: 0%;
          }
        }
        .animate-laser-move {
          animation: laser-move 2.5s linear infinite;
        }
        .animate-fade-in {
          animation: fadeIn 0.4s ease-out forwards;
        }
        @keyframes fadeIn {
          from {
            opacity: 0;
            transform: translateY(5px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }
      ` }} />
    </div>
  );
}
