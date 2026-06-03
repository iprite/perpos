"use client";

import React, { useState } from "react";
import { Sparkles, ShieldAlert, CheckCircle2, ChevronRight, FileSpreadsheet } from "lucide-react";
import { useLanguage } from "../language-context";

export default function ProcurementWidget() {
  const { lang } = useLanguage();
  const [product, setProduct] = useState(
    lang === "th" ? "ขวดบรรจุภัณฑ์พลาสติก PET 500ml" : "Plastic PET Bottle 500ml"
  );
  const [stock, setStock] = useState(120);
  const [minStock] = useState(250);
  const [loading, setLoading] = useState(false);
  const [step, setStep] = useState(0); // 0: idle, 1: benchmarking, 2: po_drafted

  React.useEffect(() => {
    setProduct(lang === "th" ? "ขวดบรรจุภัณฑ์พลาสติก PET 500ml" : "Plastic PET Bottle 500ml");
    setStep(0);
    setStock(120);
  }, [lang]);

  const startReplenish = () => {
    setLoading(true);
    setStep(1);
    
    setTimeout(() => {
      setStep(2);
      setLoading(false);
    }, 1800);
  };

  const resetWidget = () => {
    setStep(0);
    setStock(120);
  };

  const t = {
    alertTitle: lang === "th" ? "ระดับสต๊อกสินค้าต่ำกว่าเกณฑ์ความปลอดภัย!" : "Inventory Level Below Safety Threshold!",
    alertDesc: lang === "th" 
      ? `สินค้า "${product}" คงเหลือเพียง ${stock} ชิ้น (จุดความปลอดภัยขั้นต่ำ: ${minStock} ชิ้น) อิงตามยอดขายเฉลี่ยรายวัน คาดว่าของจะหมดใน 4 วัน`
      : `Product "${product}" has only ${stock} units remaining (safety limit: ${minStock} units). Based on average daily sales, stockout expected in 4 days.`,
    invTitle: lang === "th" ? "Inventory Analytics" : "Inventory Analytics",
    currentVol: lang === "th" ? `ปริมาณปัจจุบัน: ${stock} / ${minStock} (ชิ้น)` : `Current Stock: ${stock} / ${minStock} (units)`,
    critical: lang === "th" ? "วิกฤต (48%)" : "Critical (48%)",
    replenishBtn: lang === "th" ? "สั่งซื้อเติมสินค้าอัจฉริยะ (Auto-Replenish)" : "Trigger Intelligent Replenishment",
    loadingTitle: lang === "th" ? "Procurement Agent กำลังดำเนินการ..." : "Procurement Agent in progress...",
    loadingDesc: lang === "th" 
      ? "กำลังเชื่อมต่อ API ซัพพลายเออร์ 3 เจ้า ทำการเปรียบเทียบเงื่อนไข (Supplier Benchmarking) ด้านราคาดีที่สุด ระยะเวลาส่งมอบ และประวัติคะแนนความเชื่อถือ"
      : "Querying API for 3 registered suppliers. Running Supplier Benchmarking algorithms on pricing, lead times, and reliability index.",
    successTitle: lang === "th" ? "คัดเลือกซัพพลายเออร์ดีที่สุดและร่าง PO สำเร็จ!" : "Supplier Selected & PO Drafted Successfully!",
    successDesc: lang === "th"
      ? "คัดเลือก บจก. พลาสติกไทยเทรดดิ้ง เนื่องจากให้ราคาต่ำสุดและส่งมอบเร็วที่สุด 2 วัน ร่าง PO ส่งขออนุมัติเรียบร้อย"
      : "Selected Thai Plastic Trading Co., Ltd. for best unit pricing and 2-day fast delivery. Draft PO sent for manager approval.",
    tableHeader: lang === "th" ? "Supplier Benchmarking Result" : "Supplier Benchmarking Result",
    thSupplier: lang === "th" ? "ชื่อซัพพลายเออร์" : "Supplier Name",
    thPrice: lang === "th" ? "ราคา/ชิ้น" : "Unit Price",
    thLeadtime: lang === "th" ? "ระยะเวลา" : "Lead Time",
    thScore: lang === "th" ? "คะแนน" : "Reliability",
    s1Name: lang === "th" ? "1. บจก. พลาสติกไทย (แนะนำ)" : "1. Thai Plastic Co. (Recommended)",
    s2Name: lang === "th" ? "2. โรงงานเอเชียพลาสติก" : "2. Asia Plastic Factory",
    s3Name: lang === "th" ? "3. บจก. ท็อปโพลีเมอร์" : "3. Top Polymer Co., Ltd.",
    unitPrice: lang === "th" ? "บาท" : "THB",
    unitDays: lang === "th" ? "วัน" : "days",
    poTitle: lang === "th" ? "ใบสั่งซื้อร่าง: PO-2026-0921" : "Draft PO: PO-2026-0921",
    poDesc: lang === "th" ? "ยอดผลิต: 1,000 ชิ้น | รวม 8,200 บาท" : "Volume: 1,000 units | Total 8,200 THB",
    resetBtn: lang === "th" ? "รีเซ็ตการจำลอง" : "Reset Simulation",
    alertConfirm: lang === "th" ? "ระบบจำลองการสร้างเอกสารใบสั่งซื้อส่งไปยัง LINE ผู้อนุมัติสำเร็จ" : "Simulation: Draft Purchase Order sent to manager's LINE room successfully."
  };

  return (
    <div className="w-full rounded-2xl border border-slate-200 bg-white overflow-hidden shadow-lg flex flex-col min-h-[460px] text-slate-700 font-sans">
      {/* Header */}
      <div className="bg-slate-50 border-b border-slate-200 px-4 py-3 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="w-2.5 h-2.5 rounded-full bg-blue-500 animate-pulse" />
          <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Replenishment Core Engine</span>
        </div>
        <span className="text-[10px] bg-emerald-50 border border-emerald-100 text-emerald-700 px-2 py-0.5 rounded-full font-bold">
          Predictive Reorder Active
        </span>
      </div>

      <div className="p-5 flex-1 space-y-4 text-xs">
        {/* Step 0: Idle Warning */}
        {step === 0 && (
          <div className="space-y-4 text-left">
            <div className="p-4 rounded-2xl border border-amber-150 bg-amber-50 text-amber-900 flex gap-3 items-start leading-relaxed">
              <ShieldAlert className="text-amber-600 shrink-0 mt-0.5 animate-bounce" size={18} />
              <div>
                <h4 className="font-bold">{t.alertTitle}</h4>
                <p className="text-[11px] text-amber-800 mt-1 font-sans">
                  {t.alertDesc}
                </p>
              </div>
            </div>

            <div className="border border-slate-200 rounded-2xl p-4 space-y-3 bg-slate-50/50">
              <div className="flex justify-between items-center text-[10px] text-slate-400 font-bold uppercase">
                <span>{t.invTitle}</span>
                <span className="text-slate-650 font-mono">{product}</span>
              </div>
              <div className="relative pt-1">
                <div className="flex mb-2 items-center justify-between text-[11px] font-semibold text-slate-600">
                  <div>{t.currentVol}</div>
                  <div className="text-[#292e91]">{t.critical}</div>
                </div>
                <div className="overflow-hidden h-2.5 text-xs flex rounded-full bg-slate-200">
                  <div style={{ width: `${(stock/minStock) * 100}%` }} className="shadow-none flex flex-col text-center whitespace-nowrap text-white justify-center bg-amber-500 transition-all duration-500" />
                </div>
              </div>
            </div>

            <button
              onClick={startReplenish}
              className="w-full flex items-center justify-center gap-2 rounded-xl bg-brand-gradient hover:opacity-90 text-white font-bold py-3.5 transition-all shadow-md font-sans text-xs cursor-pointer"
            >
              <Sparkles size={14} />
              <span>{t.replenishBtn}</span>
            </button>
          </div>
        )}

        {/* Step 1: Benchmarking */}
        {step === 1 && (
          <div className="space-y-4 text-center py-12 flex flex-col items-center justify-center">
            <div className="w-12 h-12 rounded-full bg-blue-50 border border-blue-150 flex items-center justify-center text-blue-600 animate-spin mb-3">
              <Sparkles size={20} />
            </div>
            <h4 className="font-bold text-slate-800">{t.loadingTitle}</h4>
            <p className="text-slate-550 max-w-xs mx-auto leading-relaxed text-[11px] font-sans">
              {t.loadingDesc}
            </p>
          </div>
        )}

        {/* Step 2: PO Drafted Showcase */}
        {step === 2 && (
          <div className="space-y-4 text-left animate-scale-up">
            <div className="p-3.5 rounded-2xl border border-emerald-150 bg-emerald-50 text-emerald-900 flex gap-2.5 items-start leading-relaxed">
              <CheckCircle2 className="text-emerald-600 shrink-0 mt-0.5" size={18} />
              <div>
                <h4 className="font-bold">{t.successTitle}</h4>
                <p className="text-[11px] text-emerald-800 mt-1 font-sans">
                  {t.successDesc}
                </p>
              </div>
            </div>

            {/* Supplier Benchmark Table */}
            <div className="border border-slate-200 rounded-2xl overflow-hidden shadow-sm bg-white font-sans">
              <div className="bg-slate-50 border-b border-slate-200 px-3.5 py-2 text-[10px] font-bold text-slate-400 uppercase">
                {t.tableHeader}
              </div>
              <table className="w-full text-[11px]">
                <thead>
                  <tr className="border-b border-slate-200 bg-slate-50/50 text-slate-500 font-bold">
                    <th className="py-2 px-3 text-left">{t.thSupplier}</th>
                    <th className="py-2 px-1 text-center">{t.thPrice}</th>
                    <th className="py-2 px-1 text-center">{t.thLeadtime}</th>
                    <th className="py-2 px-3 text-right">{t.thScore}</th>
                  </tr>
                </thead>
                <tbody>
                  <tr className="border-b border-slate-200 bg-emerald-50/30 text-slate-800 font-semibold">
                    <td className="py-2.5 px-3">{t.s1Name}</td>
                    <td className="py-2.5 px-1 text-center text-[#292e91] font-mono">8.20 {t.unitPrice}</td>
                    <td className="py-2.5 px-1 text-center">2 {t.unitDays}</td>
                    <td className="py-2.5 px-3 text-right text-emerald-600 font-mono">98%</td>
                  </tr>
                  <tr className="border-b border-slate-200 text-slate-500">
                    <td className="py-2.5 px-3">{t.s2Name}</td>
                    <td className="py-2.5 px-1 text-center font-mono">8.50 {t.unitPrice}</td>
                    <td className="py-2.5 px-1 text-center">1 {t.unitDays}</td>
                    <td className="py-2.5 px-3 text-right font-mono">94%</td>
                  </tr>
                  <tr className="text-slate-500">
                    <td className="py-2.5 px-3">{t.s3Name}</td>
                    <td className="py-2.5 px-1 text-center font-mono">8.10 {t.unitPrice}</td>
                    <td className="py-2.5 px-1 text-center">5 {t.unitDays}</td>
                    <td className="py-2.5 px-3 text-right font-mono">82%</td>
                  </tr>
                </tbody>
              </table>
            </div>

            {/* PO Draft Box */}
            <div 
              onClick={() => alert(t.alertConfirm)}
              className="rounded-2xl border border-blue-200 bg-blue-50/50 p-3.5 cursor-pointer hover:bg-blue-100/50 transition-all flex items-center justify-between text-left"
            >
              <div className="flex items-center gap-3">
                <div className="p-2.5 rounded-xl bg-[#292e91] text-white">
                  <FileSpreadsheet size={18} />
                </div>
                <div>
                  <h5 className="font-bold text-[#292e91]">{t.poTitle}</h5>
                  <p className="text-[10px] text-slate-500 mt-0.5">{t.poDesc}</p>
                </div>
              </div>
              <ChevronRight size={16} className="text-[#292e91]" />
            </div>

            <button
              onClick={resetWidget}
              className="w-full flex items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 font-semibold py-2.5 transition-colors font-sans text-xs cursor-pointer"
            >
              <span>{t.resetBtn}</span>
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
