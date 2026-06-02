"use client";

import React, { useState } from "react";
import { Sparkles, FileText, CheckCircle2, RefreshCw, Layers } from "lucide-react";

interface Receipt {
  id: number;
  name: string;
  total: number;
  merchant: string;
  date: string;
  isReconciled: boolean;
  ocrFields?: { label: string; value: string }[];
}

const INITIAL_RECEIPTS: Receipt[] = [
  {
    id: 1,
    name: "ใบเสร็จค่าไฟฟ้าออฟฟิศ.pdf",
    total: 4850.00,
    merchant: "การไฟฟ้านครหลวง (MEA)",
    date: "25/05/2026",
    isReconciled: false,
    ocrFields: [
      { label: "ชื่อร้านค้า / Merchant", value: "การไฟฟ้านครหลวง (MEA)" },
      { label: "เลขผู้เสียภาษี / Tax ID", value: "0105559001221" },
      { label: "วันที่ / Date", value: "25/05/2026" },
      { label: "ยอดเงินไม่รวมภาษี / Subtotal", value: "4,532.71 บาท" },
      { label: "ภาษีมูลค่าเพิ่ม / VAT 7%", value: "317.29 บาท" },
      { label: "ยอดสุทธิ / Total", value: "4,850.00 บาท" }
    ]
  },
  {
    id: 2,
    name: "ใบกำกับภาษีค่าเน็ต AIS.png",
    total: 1069.00,
    merchant: "บมจ. แอดวานซ์ อินโฟร์ เซอร์วิส (AIS)",
    date: "26/05/2026",
    isReconciled: false,
    ocrFields: [
      { label: "ชื่อร้านค้า / Merchant", value: "บมจ. แอดวานซ์ อินโฟร์ เซอร์วิส (AIS)" },
      { label: "เลขผู้เสียภาษี / Tax ID", value: "0107535000265" },
      { label: "วันที่ / Date", value: "26/05/2026" },
      { label: "ยอดเงินไม่รวมภาษี / Subtotal", value: "999.07 บาท" },
      { label: "ภาษีมูลค่าเพิ่ม / VAT 7%", value: "69.93 บาท" },
      { label: "ยอดสุทธิ / Total", value: "1,069.00 บาท" }
    ]
  }
];

export default function FinanceWidget() {
  const [receipts, setReceipts] = useState<Receipt[]>(INITIAL_RECEIPTS);
  const [activeReceipt, setActiveReceipt] = useState<Receipt | null>(null);
  const [processing, setProcessing] = useState(false);
  const [step, setStep] = useState("");

  const runReconciliation = (receipt: Receipt) => {
    setActiveReceipt(receipt);
    setProcessing(true);
    setStep("เริ่มการทำ OCR แกะตัวอักษร...");

    setTimeout(() => {
      setStep("สกัดข้อมูลยอดเงิน, ภาษีมูลค่าเพิ่ม และ Tax ID...");
      setTimeout(() => {
        setStep("ดึงประวัติการเดินบัญชีธนาคาร (Bank Statement) ล่าสุด...");
        setTimeout(() => {
          setStep("จับคู่รายการเดินบัญชีตรงกันพอดียอดเงิน 100%...");
          setTimeout(() => {
            setStep("บันทึกเข้ารายวันแยกประเภท (Posted to Journal)...");
            setTimeout(() => {
              setProcessing(false);
              setStep("");
              setReceipts(prev => prev.map(r => r.id === receipt.id ? { ...r, isReconciled: true } : r));
              setActiveReceipt(prev => prev ? { ...prev, isReconciled: true } : null);
            }, 500);
          }, 600);
        }, 600);
      }, 500);
    }, 400);
  };

  const resetAll = () => {
    setReceipts(INITIAL_RECEIPTS);
    setActiveReceipt(null);
    setProcessing(false);
    setStep("");
  };

  return (
    <div className="w-full rounded-2xl border border-slate-200 bg-white overflow-hidden shadow-lg flex flex-col min-h-[460px] text-slate-700 font-sans">
      {/* Header */}
      <div className="bg-slate-50 border-b border-slate-200 px-4 py-3 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="w-2.5 h-2.5 rounded-full bg-blue-500 animate-pulse" />
          <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">AI OCR & Reconciliation Lab</span>
        </div>
        <span className="text-[10px] bg-blue-50 border border-blue-100 text-blue-700 px-2 py-0.5 rounded-full font-bold">
          Accounting Sync: 3s
        </span>
      </div>

      <div className="p-4 flex-1 grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
        {/* Left Side: Uploaded Receipt List */}
        <div className="space-y-3.5 text-left border-r border-slate-100 pr-0 md:pr-4">
          <h4 className="font-bold text-slate-400 uppercase tracking-wider text-[10px]">
            ใบเสร็จรอประมวลผลบัญชี (Pending Receipts)
          </h4>
          <div className="space-y-2">
            {receipts.map((r) => (
              <div 
                key={r.id}
                className={`p-3.5 rounded-2xl border transition-all flex flex-col justify-between space-y-2 bg-slate-50/50 ${
                  activeReceipt?.id === r.id ? "border-[#292e91]" : "border-slate-200"
                }`}
              >
                <div className="flex items-start justify-between">
                  <div className="flex gap-2.5 items-start">
                    <FileText className="text-slate-400 mt-0.5 shrink-0" size={16} />
                    <div>
                      <h5 className="font-bold text-slate-800 break-all">{r.name}</h5>
                      <p className="text-[10px] text-slate-500 mt-0.5">ยอด: {r.total.toLocaleString()} บาท</p>
                    </div>
                  </div>
                  {r.isReconciled ? (
                    <span className="bg-emerald-50 text-emerald-700 border border-emerald-100 text-[9px] px-2 py-0.5 rounded-full font-bold shrink-0">
                      Reconciled
                    </span>
                  ) : (
                    <span className="bg-amber-50 text-amber-700 border border-amber-100 text-[9px] px-2 py-0.5 rounded-full font-bold shrink-0">
                      Pending
                    </span>
                  )}
                </div>
                
                {!r.isReconciled && (
                  <button
                    disabled={processing}
                    onClick={() => runReconciliation(r)}
                    className="w-full flex items-center justify-center gap-1.5 rounded-xl bg-brand-gradient hover:opacity-90 text-white font-bold py-2 transition-all"
                  >
                    <Sparkles size={11} />
                    <span>Reconcile (3s)</span>
                  </button>
                )}
              </div>
            ))}
          </div>

          <button
            onClick={resetAll}
            className="w-full text-center text-slate-400 hover:text-[#292e91] font-semibold pt-1 transition-colors text-[11px]"
          >
            รีเซ็ตรายการทดลอง
          </button>
        </div>

        {/* Right Side: Live AI Parsing logs & Journal */}
        <div className="space-y-4 text-left flex flex-col justify-between min-h-[300px]">
          {activeReceipt ? (
            <div className="space-y-3.5 flex-1 flex flex-col justify-between">
              <div>
                <h4 className="font-bold text-slate-400 uppercase tracking-wider text-[10px]">
                  ผลลัพธ์ OCR & บันทึกบัญชีด่วน
                </h4>

                {processing ? (
                  <div className="mt-3 bg-slate-50 border border-slate-200 rounded-2xl p-4 flex flex-col items-center justify-center text-center py-10 space-y-3">
                    <div className="w-8 h-8 rounded-full border-2 border-slate-200 border-t-[#292e91] animate-spin" />
                    <p className="font-semibold text-slate-700">กำลังทำงาน...</p>
                    <span className="text-[10px] text-slate-500 leading-relaxed font-sans">{step}</span>
                  </div>
                ) : (
                  <div className="mt-3 space-y-3">
                    {/* Bounding boxes results */}
                    <div className="border border-slate-200 rounded-2xl p-3 bg-slate-50/50 space-y-2 font-mono text-[10px] leading-relaxed">
                      {activeReceipt.ocrFields?.map((f, i) => (
                        <div key={i} className="flex justify-between border-b border-slate-100 pb-1">
                          <span className="text-slate-400 font-sans">{f.label}:</span>
                          <span className="text-slate-800 font-bold">{f.value}</span>
                        </div>
                      ))}
                    </div>

                    {activeReceipt.isReconciled && (
                      <div className="p-3 rounded-2xl border border-emerald-150 bg-emerald-50 text-emerald-900 flex gap-2.5 items-start leading-relaxed animate-scale-up">
                        <CheckCircle2 className="text-emerald-600 shrink-0 mt-0.5" size={16} />
                        <div>
                          <h5 className="font-bold">จับคู่เดินบัญชีและบันทึกสมุดรายวันแล้ว!</h5>
                          <p className="text-[10px] text-emerald-800 mt-0.5 font-sans">
                            ตรวจพบยอดจ่าย MEA/AIS ตรงกับธนาคารกสิกรไทย ออกใบเสร็จบันทึก DR.ค่าใช้จ่ายสาธารณูปโภค / CR.เงินฝากออมทรัพย์ สำเร็จ
                          </p>
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>

              {activeReceipt.isReconciled && (
                <div className="p-3.5 bg-blue-50/50 border border-blue-150 rounded-2xl flex items-center gap-3 text-slate-550 leading-relaxed text-[11px] animate-scale-up">
                  <div className="p-2 rounded bg-blue-100 border border-blue-200 text-[#292e91] shrink-0">
                    <Layers size={14} />
                  </div>
                  <p>
                    ลดการทำงานคีย์มือ 100% บิลทุกใบลงสมุดรายวันแยกประเภทและจัดกลุ่มภาษีซื้อโดยอัตโนมัติ เพื่อพร้อมสำหรับยื่นภาษีมูลค่าเพิ่มประจำเดือน
                  </p>
                </div>
              )}
            </div>
          ) : (
            <div className="flex-1 flex flex-col justify-center items-center text-center text-slate-400 py-10 font-sans">
              <RefreshCw size={24} className="text-slate-300 animate-spin-slow mb-2.5" />
              <p className="text-[11px]">เลือกคลิกปุ่ม <strong className="text-slate-600">Reconcile</strong> ด้านซ้าย เพื่อทดสอบพลังสแกนบัญชีอัตโนมัติ</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
