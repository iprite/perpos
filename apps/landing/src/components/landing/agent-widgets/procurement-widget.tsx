"use client";

import React, { useState } from "react";
import { Sparkles, ShieldAlert, CheckCircle2, ChevronRight, FileSpreadsheet } from "lucide-react";

export default function ProcurementWidget() {
  const [product, setProduct] = useState("ขวดบรรจุภัณฑ์พลาสติก PET 500ml");
  const [stock, setStock] = useState(120);
  const [minStock] = useState(250);
  const [loading, setLoading] = useState(false);
  const [step, setStep] = useState(0); // 0: idle, 1: benchmarking, 2: po_drafted

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
                <h4 className="font-bold">ระดับสต๊อกสินค้าต่ำกว่าเกณฑ์ความปลอดภัย!</h4>
                <p className="text-[11px] text-amber-800 mt-1 font-sans">
                  สินค้า <strong className="text-slate-900 font-mono">"{product}"</strong> คงเหลือเพียง <strong>{stock} ชิ้น</strong> (จุดความปลอดภัยขั้นต่ำ: {minStock} ชิ้น) อิงตามยอดขายเฉลี่ยรายวัน คาดว่าของจะหมดใน 4 วัน
                </p>
              </div>
            </div>

            <div className="border border-slate-200 rounded-2xl p-4 space-y-3 bg-slate-50/50">
              <div className="flex justify-between items-center text-[10px] text-slate-400 font-bold uppercase">
                <span>Inventory Analytics</span>
                <span className="text-slate-600 font-mono">{product}</span>
              </div>
              <div className="relative pt-1">
                <div className="flex mb-2 items-center justify-between text-[11px] font-semibold text-slate-600">
                  <div>ปริมาณปัจจุบัน: {stock} / {minStock} (ชิ้น)</div>
                  <div className="text-[#292e91]">วิกฤต (48%)</div>
                </div>
                <div className="overflow-hidden h-2.5 text-xs flex rounded-full bg-slate-200">
                  <div style={{ width: `${(stock/minStock) * 100}%` }} className="shadow-none flex flex-col text-center whitespace-nowrap text-white justify-center bg-amber-500 transition-all duration-500" />
                </div>
              </div>
            </div>

            <button
              onClick={startReplenish}
              className="w-full flex items-center justify-center gap-2 rounded-xl bg-brand-gradient hover:opacity-90 text-white font-bold py-3.5 transition-all shadow-md font-sans text-xs"
            >
              <Sparkles size={14} />
              <span>สั่งซื้อเติมสินค้าอัจฉริยะ (Auto-Replenish)</span>
            </button>
          </div>
        )}

        {/* Step 1: Benchmarking */}
        {step === 1 && (
          <div className="space-y-4 text-center py-12 flex flex-col items-center justify-center">
            <div className="w-12 h-12 rounded-full bg-blue-50 border border-blue-150 flex items-center justify-center text-blue-600 animate-spin mb-3">
              <Sparkles size={20} />
            </div>
            <h4 className="font-bold text-slate-800">Procurement Agent กำลังดำเนินการ...</h4>
            <p className="text-slate-550 max-w-xs mx-auto leading-relaxed text-[11px] font-sans">
              กำลังเชื่อมต่อ API ซัพพลายเออร์ 3 เจ้า ทำการเปรียบเทียบเงื่อนไข (Supplier Benchmarking) ด้านราคาดีที่สุด ระยะเวลาขนส่ง และประวัติคะแนนความเชื่อถือ
            </p>
          </div>
        )}

        {/* Step 2: PO Drafted Showcase */}
        {step === 2 && (
          <div className="space-y-4 text-left animate-scale-up">
            <div className="p-3.5 rounded-2xl border border-emerald-150 bg-emerald-50 text-emerald-900 flex gap-2.5 items-start leading-relaxed">
              <CheckCircle2 className="text-emerald-600 shrink-0 mt-0.5" size={18} />
              <div>
                <h4 className="font-bold">คัดเลือกซัพพลายเออร์ดีที่สุดและร่าง PO สำเร็จ!</h4>
                <p className="text-[11px] text-emerald-800 mt-1 font-sans">
                  คัดเลือก <strong className="text-slate-900">บจก. พลาสติกไทยเทรดดิ้ง</strong> เนื่องจากให้ราคาต่ำสุดและส่งมอบเร็วที่สุด 2 วัน ร่าง PO ส่งขออนุมัติเรียบร้อย
                </p>
              </div>
            </div>

            {/* Supplier Benchmark Table */}
            <div className="border border-slate-200 rounded-2xl overflow-hidden shadow-sm bg-white">
              <div className="bg-slate-50 border-b border-slate-200 px-3.5 py-2 text-[10px] font-bold text-slate-400 uppercase">
                Supplier Benchmarking Result
              </div>
              <table className="w-full text-[11px]">
                <thead>
                  <tr className="border-b border-slate-200 bg-slate-50/50 text-slate-500 font-bold">
                    <th className="py-2 px-3 text-left">ชื่อซัพพลายเออร์</th>
                    <th className="py-2 px-1 text-center">ราคา/ชิ้น</th>
                    <th className="py-2 px-1 text-center">ระยะเวลา</th>
                    <th className="py-2 px-3 text-right">คะแนน</th>
                  </tr>
                </thead>
                <tbody>
                  <tr className="border-b border-slate-200 bg-emerald-50/30 text-slate-800 font-semibold">
                    <td className="py-2.5 px-3">1. บจก. พลาสติกไทย (แนะนำ)</td>
                    <td className="py-2.5 px-1 text-center text-[#292e91]">8.20 บาท</td>
                    <td className="py-2.5 px-1 text-center">2 วัน</td>
                    <td className="py-2.5 px-3 text-right text-emerald-600">98%</td>
                  </tr>
                  <tr className="border-b border-slate-200 text-slate-500">
                    <td className="py-2.5 px-3">2. โรงงานเอเชียพลาสติก</td>
                    <td className="py-2.5 px-1 text-center">8.50 บาท</td>
                    <td className="py-2.5 px-1 text-center">1 วัน</td>
                    <td className="py-2.5 px-3 text-right">94%</td>
                  </tr>
                  <tr className="text-slate-500">
                    <td className="py-2.5 px-3">3. บจก. ท็อปโพลีเมอร์</td>
                    <td className="py-2.5 px-1 text-center">8.10 บาท</td>
                    <td className="py-2.5 px-1 text-center">5 วัน</td>
                    <td className="py-2.5 px-3 text-right">82%</td>
                  </tr>
                </tbody>
              </table>
            </div>

            {/* PO Draft Box */}
            <div 
              onClick={() => alert("ระบบจำลองการสร้างเอกสารใบสั่งซื้อส่งไปยัง LINE ผู้อนุมัติสำเร็จ")}
              className="rounded-2xl border border-blue-200 bg-blue-50/50 p-3.5 cursor-pointer hover:bg-blue-100/50 transition-all flex items-center justify-between text-left"
            >
              <div className="flex items-center gap-3">
                <div className="p-2.5 rounded-xl bg-[#292e91] text-white">
                  <FileSpreadsheet size={18} />
                </div>
                <div>
                  <h5 className="font-bold text-[#292e91]">ใบสั่งซื้อร่าง: PO-2026-0921</h5>
                  <p className="text-[10px] text-slate-500 mt-0.5">ยอดผลิต: 1,000 ชิ้น | รวม 8,200 บาท</p>
                </div>
              </div>
              <ChevronRight size={16} className="text-[#292e91]" />
            </div>

            <button
              onClick={resetWidget}
              className="w-full flex items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 font-semibold py-2.5 transition-colors font-sans text-xs"
            >
              <span>รีเซ็ตการจำลอง</span>
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
