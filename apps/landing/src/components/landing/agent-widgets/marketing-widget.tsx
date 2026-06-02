"use client";

import React, { useState } from "react";
import { Sparkles, Play, Megaphone, Send, ArrowRight } from "lucide-react";

export default function MarketingWidget() {
  const [product, setProduct] = useState("ครีมกันแดดไฮบริด ออร์แกนิก SPF50");
  const [tone, setTone] = useState<"premium" | "bold" | "creative">("premium");
  const [budget, setBudget] = useState(15000);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<any | null>(null);

  const runSimulation = () => {
    setLoading(true);
    setResult(null);

    setTimeout(() => {
      let copy = "";
      let audience = "";
      let estRoi = 0;
      let estConversion = 0;

      if (tone === "premium") {
        copy = `✨ สัมผัสความเบาสบายขั้นสุดที่ปกป้องผิวคุณอย่างสมบูรณ์แบบ...\n\nขอแนะนำ "${product}" ครีมกันแดดสูตรออร์แกนิกพรีเมียม ปกป้องสูงสุด SPF50 PA++++ ผสานคุณค่าสารสกัดธรรมชาติเพื่อการบำรุงล้ำลึก เนื้อสัมผัสเซรั่มซึมไว ไม่ทิ้งคราบขาว\n\n📌 ช้อปความพิเศษเพื่อผิวคุณได้แล้ววันนี้ รับส่วนลด 15% พร้อมส่งฟรี`;
        audience = "ผู้หญิงอายุ 25-45 ปี, สนใจครีมบำรุงผิวพรีเมียม, สินค้าออร์แกนิก, ผิวแพ้ง่าย";
        estRoi = 3.6;
        estConversion = 4.2;
      } else if (tone === "bold") {
        copy = `🔥 แดดเมืองไทยแรงแค่ไหน ก็ทำร้ายผิวคุณไม่ได้!\n\nหมดกังวลเรื่องหน้าเยิ้ม ผิวคล้ำเสียระหว่างวันด้วย "${product}" กันแดดเนื้อไฮบริดออร์แกนิก สูตรคุมมันกันน้ำกันเหงื่อ 100% ปกป้องยาวนาน 12 ชั่วโมงเต็ม\n\n⚡️ โปรโมชันท้าแดดด่วน! ซื้อ 1 แถม 1 เฉพาะสัปดาห์นี้เท่านั้น คลิกสั่งซื้อด่วนก่อนสินค้าหมดสต๊อก!`;
        audience = "คนรุ่นใหม่อายุ 18-35 ปี, กิจกรรมกลางแจ้ง, วิ่งมาราธอน, ท่องเที่ยวทะเล";
        estRoi = 3.1;
        estConversion = 3.8;
      } else {
        copy = `💡 รู้หรือไม่? ครีมกันแดดทั่วไปอาจอุดตันและทำร้ายปะการัง...\n\nก้าวสู่อนาคตการดูแลผิวที่เป็นมิตรต่อธรรมชาติกับ "${product}" นวัตกรรมกันแดดออร์แกนิก 100% ที่ย่อยสลายได้ง่าย ปกป้องผิวคุณพร้อมรักษ์โลกไปในตัว 🌊\n\n💬 ทักแชตวันนี้เพื่อรับสิทธิ์ตรวจสภาพผิวฟรี พร้อมคำแนะนำจากผู้เชี่ยวชาญ`;
        audience = "กลุ่มผู้อนุรักษ์ธรรมชาติ, ท่องเที่ยวเชิงอนุรักษ์, ผู้ชื่นชอบนวัตกรรมรักษ์โลก, ทำบุญ";
        estRoi = 3.4;
        estConversion = 4.0;
      }

      setResult({
        copy,
        audience,
        estRoi,
        estConversion,
        estClicks: Math.floor((budget / 8.5) * (estConversion / 100) * 12),
        estSales: Math.floor((budget / 8.5) * (estConversion / 100))
      });
      setLoading(false);
    }, 1500);
  };

  return (
    <div className="w-full rounded-2xl border border-slate-200 bg-white overflow-hidden shadow-lg flex flex-col min-h-[460px] text-slate-700 font-sans">
      {/* Header */}
      <div className="bg-slate-50 border-b border-slate-200 px-4 py-3 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="w-2.5 h-2.5 rounded-full bg-blue-500 animate-pulse" />
          <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">AI Marketing Campaign Builder</span>
        </div>
        <span className="text-[10px] bg-indigo-50 border border-indigo-100 text-indigo-700 px-2 py-0.5 rounded-full font-bold">
          Pattern Analysis Active
        </span>
      </div>

      {/* Simulator Inputs */}
      <div className="p-5 flex-1 space-y-4 text-xs">
        <div className="grid gap-3.5">
          <div className="space-y-1.5 text-left">
            <label className="font-bold text-slate-750">ชื่อสินค้า (Product Name)</label>
            <input
              type="text"
              value={product}
              onChange={(e) => setProduct(e.target.value)}
              className="w-full rounded-xl border border-slate-200 bg-slate-50/50 px-3.5 py-2.5 text-xs text-slate-800 placeholder-slate-400 outline-none focus:border-[#292e91] focus:bg-white transition-colors"
            />
          </div>

          <div className="grid grid-cols-3 gap-2">
            {(["premium", "bold", "creative"] as const).map((t) => (
              <button
                key={t}
                onClick={() => setTone(t)}
                className={`py-2 px-1 text-center font-bold capitalize rounded-xl border text-[11px] transition-all ${
                  tone === t
                    ? "bg-[#292e91] border-[#292e91] text-white"
                    : "bg-slate-50 border-slate-200 text-slate-650 hover:bg-slate-100"
                }`}
              >
                {t === "premium" && "หรูหรา / Premium"}
                {t === "bold" && "เร่งเร้า / Bold"}
                {t === "creative" && "สร้างสรรค์ / Story"}
              </button>
            ))}
          </div>

          <div className="space-y-1.5 text-left">
            <div className="flex justify-between items-center font-bold text-slate-750">
              <span>งบประมาณแคมเปญ (Budget)</span>
              <span className="text-[#292e91]">{budget.toLocaleString()} บาท</span>
            </div>
            <input
              type="range"
              min="5000"
              max="100000"
              step="5000"
              value={budget}
              onChange={(e) => setBudget(Number(e.target.value))}
              className="w-full accent-[#292e91] cursor-pointer"
            />
          </div>

          <button
            onClick={runSimulation}
            disabled={loading || !product.trim()}
            className="w-full flex items-center justify-center gap-2 rounded-xl bg-brand-gradient hover:opacity-90 text-white font-bold py-3 transition-all shadow-md disabled:opacity-50"
          >
            {loading ? (
              <>
                <div className="w-4 h-4 rounded-full border-2 border-white/20 border-t-white animate-spin" />
                <span>กำลังวิเคราะห์ตลาดและสร้างแคมเปญ...</span>
              </>
            ) : (
              <>
                <Play size={14} />
                <span>สร้างแคมเปญด้วย Marketing Agent</span>
              </>
            )}
          </button>
        </div>

        {/* Results Showcase */}
        {result && (
          <div className="mt-4 border-t border-slate-150 pt-4 space-y-4 animate-scale-up text-left">
            <div className="grid grid-cols-3 gap-2.5 text-center">
              <div className="p-2 rounded-xl bg-slate-50 border border-slate-200">
                <div className="text-[10px] text-slate-400 font-bold uppercase">Predicted ROI</div>
                <div className="text-sm font-black text-[#292e91] mt-0.5">{result.estRoi}x</div>
              </div>
              <div className="p-2 rounded-xl bg-slate-50 border border-slate-200">
                <div className="text-[10px] text-slate-400 font-bold uppercase">Conv. Rate</div>
                <div className="text-sm font-black text-emerald-600 mt-0.5">{result.estConversion}%</div>
              </div>
              <div className="p-2 rounded-xl bg-slate-50 border border-slate-200">
                <div className="text-[10px] text-slate-400 font-bold uppercase">Est. Orders</div>
                <div className="text-sm font-black text-slate-800 mt-0.5">{result.estSales}</div>
              </div>
            </div>

            <div className="space-y-1.5">
              <div className="font-bold text-slate-700 flex items-center gap-1.5">
                <Megaphone size={14} className="text-blue-500" />
                <span>Facebook Ad Copywriting (AI Generated):</span>
              </div>
              <div className="bg-[#f8fafc] border border-slate-200 p-3 rounded-2xl text-[11px] font-sans text-slate-800 leading-relaxed max-h-[110px] overflow-y-auto whitespace-pre-wrap">
                {result.copy}
              </div>
            </div>

            <div className="p-2.5 rounded-xl border border-blue-150 bg-blue-50/50">
              <div className="font-bold text-[#292e91]">กลุ่มเป้าหมายแนะนำ (Target Keywords):</div>
              <p className="text-[10px] text-slate-600 mt-0.5 font-sans leading-relaxed">{result.audience}</p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
