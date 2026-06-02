"use client";

import React, { useState } from "react";
import { Send, Sparkles, CheckCircle2, FileText, Download } from "lucide-react";

interface Message {
  sender: "user" | "agent";
  text: string;
  time: string;
  isQuotation?: boolean;
}

const PRESETS = [
  {
    label: "ดีล A: กล่องบรรจุภัณฑ์ 500 กล่อง",
    text: "สวัสดีครับ สนใจสั่งผลิตกล่องลูกฟูกบรรจุภัณฑ์สำหรับส่งของ ขนาดมาตรฐาน จำนวน 500 กล่องครับ ส่งไปที่ออฟฟิศชลบุรี ขอราคาด่วนด้วยครับ"
  },
  {
    label: "ดีล B: เสื้อยืดสั่งสกรีน 150 ตัว",
    text: "อยากทราบราคาเสื้อยืดทีมสีขาว Cotton 100% สกรีนโลโก้บริษัทด้านหน้า 1 จุด จำนวน 150 ตัวค่ะ ส่งที่กรุงเทพฯ ภายในสัปดาห์หน้า ขอใบเสนอราคาด้วยจ้า"
  }
];

export default function SalesWidget() {
  const [messages, setMessages] = useState<Message[]>([
    {
      sender: "agent",
      text: "สวัสดีค่ะ! ยินดีต้อนรับสู่ระบบผู้ช่วยอัตโนมัติ PERPOS Sales Agent ฉันสามารถช่วยออกใบเสนอราคา ร่างดีล และจัดส่งราคาให้ลูกค้าใน LINE แชตได้ทันทีใน 3 วินาทีค่ะ 🚀 ลองกดเลือกเคสตัวอย่างด้านล่างเพื่อทดสอบการตอบสนองได้เลยนะคะ",
      time: "10:30"
    }
  ]);
  const [loading, setLoading] = useState(false);
  const [loadingStep, setLoadingStep] = useState("");
  const [showPdfModal, setShowPdfModal] = useState(false);
  const [activeDeal, setActiveDeal] = useState<typeof PRESETS[0] | null>(null);

  const triggerPreset = (preset: typeof PRESETS[0]) => {
    if (loading) return;
    setActiveDeal(preset);
    const timeStr = new Date().toLocaleTimeString("th-TH", { hour: "2-digit", minute: "2-digit" });
    
    // Add user message
    const newMsgList = [...messages, { sender: "user" as const, text: preset.text, time: timeStr }];
    setMessages(newMsgList);
    setLoading(true);
    setLoadingStep("อ่านข้อความแชตและสกัดข้อมูลความต้องการ...");

    setTimeout(() => {
      setLoadingStep("วิเคราะห์ลูกค้าและประเมินความเป็นไปได้ (Lead Score: 92/100)...");
      setTimeout(() => {
        setLoadingStep("ตรวจสอบคลังสินค้า & คำนวณค่าขนส่งปลายทาง...");
        setTimeout(() => {
          setLoadingStep("ร่างใบเสนอราคาและจัดโครงสร้างราคาสำเร็จ...");
          setTimeout(() => {
            setLoading(false);
            setLoadingStep("");
            
            // Add Agent reply
            const replyTime = new Date().toLocaleTimeString("th-TH", { hour: "2-digit", minute: "2-digit" });
            setMessages(prev => [
              ...prev,
              {
                sender: "agent",
                text: `ได้รับข้อมูลความต้องการเรียบร้อยค่ะ! บันทึกข้อมูลเข้าระบบ CRM และร่างเอกสารใบเสนอราคาเสนอราคาให้เสร็จสิ้นใน 3 วินาทีตามรายละเอียด:\n\n• โครงการ: จัดสั่งผลิตตามความต้องการ\n• รหัสคำร้อง: QT-2026-${Math.floor(Math.random() * 9000) + 1000}\n• การคำนวณภาษี: รวม VAT 7% เรียบร้อย\n\nคุณสามารถกดดูแบบร่างเอกสารใบเสนอราคาได้ผ่านลิงก์ด้านล่างนี้ได้เลยค่ะ 👇`,
                time: replyTime
              },
              {
                sender: "agent",
                text: "คลิกเพื่อเปิดเอกสารใบเสนอราคาร่าง",
                time: replyTime,
                isQuotation: true
              }
            ]);
          }, 600);
        }, 600);
      }, 700);
    }, 600);
  };

  return (
    <div className="w-full rounded-2xl border border-slate-200 bg-white overflow-hidden shadow-lg flex flex-col min-h-[460px] text-slate-700 font-sans">
      {/* Widget Header */}
      <div className="bg-slate-50 border-b border-slate-200 px-4 py-3 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-pulse" />
          <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">LINE OA Live Simulator</span>
        </div>
        <div className="text-[10px] bg-blue-50 border border-blue-100 text-blue-700 px-2 py-0.5 rounded-full font-bold">
          Sales Response: 3s
        </div>
      </div>

      {/* Main Chat Area */}
      <div className="flex-1 p-4 space-y-3.5 overflow-y-auto max-h-[300px] bg-slate-50/40 text-xs">
        {messages.map((msg, idx) => (
          <div key={idx} className={`flex ${msg.sender === "user" ? "justify-end" : "justify-start"} items-end gap-1.5`}>
            {msg.sender === "agent" && (
              <div className="w-7 h-7 rounded-full bg-gradient-to-tr from-[#292e91] to-[#4ca9df] flex items-center justify-center text-white shrink-0 shadow-sm">
                <Sparkles size={14} />
              </div>
            )}
            
            <div className="max-w-[75%] space-y-1">
              {msg.isQuotation ? (
                <div 
                  onClick={() => setShowPdfModal(true)}
                  className="rounded-2xl border border-blue-200 bg-blue-50 p-4 cursor-pointer hover:bg-blue-100/70 transition-all flex items-center gap-3 text-left font-medium shadow-sm hover:scale-[1.01]"
                >
                  <div className="p-2.5 rounded-xl bg-[#292e91] text-white">
                    <FileText size={20} />
                  </div>
                  <div>
                    <h5 className="font-bold text-[#292e91]">ใบเสนอราคา (Quotation Draft)</h5>
                    <p className="text-[10px] text-slate-500 mt-0.5">คลิกเพื่อคลิกเปิดไฟล์ PDF ใบรับรองราคา</p>
                  </div>
                </div>
              ) : (
                <div 
                  className={`p-3 rounded-2xl whitespace-pre-line leading-relaxed shadow-sm ${
                    msg.sender === "user" 
                      ? "bg-[#292e91] text-white rounded-br-none" 
                      : "bg-white border border-slate-200 text-slate-800 rounded-bl-none"
                  }`}
                >
                  {msg.text}
                </div>
              )}
              <span className="text-[9px] text-slate-400 block px-1 text-right">{msg.time}</span>
            </div>
          </div>
        ))}

        {loading && (
          <div className="flex justify-start items-center gap-2 py-2">
            <div className="w-7 h-7 rounded-full bg-gradient-to-tr from-[#292e91] to-[#4ca9df] flex items-center justify-center text-white shrink-0 animate-spin">
              <Sparkles size={14} />
            </div>
            <div className="p-3 bg-white border border-slate-200 rounded-2xl rounded-bl-none text-slate-500 flex flex-col gap-1 shadow-sm">
              <div className="flex items-center gap-1.5 font-semibold text-blue-700">
                <div className="w-1.5 h-1.5 rounded-full bg-blue-600 animate-ping" />
                <span>Sales Agent กำลังทำงานเชิงรุก...</span>
              </div>
              <span className="text-[10px]">{loadingStep}</span>
            </div>
          </div>
        )}
      </div>

      {/* Input Action Panel */}
      <div className="border-t border-slate-200 p-3 bg-white space-y-3">
        <div className="text-[10px] text-slate-400 font-bold uppercase tracking-wider text-left">
          จำลองสถานการณ์ขอราคา (เลือกกดเพื่อส่งข้อความ):
        </div>
        <div className="flex flex-wrap gap-2">
          {PRESETS.map((preset, idx) => (
            <button
              key={idx}
              disabled={loading}
              onClick={() => triggerPreset(preset)}
              className="text-left px-3 py-2 rounded-xl border border-slate-200 bg-slate-50 text-slate-700 hover:border-[#292e91]/40 hover:bg-[#292e91]/5 disabled:opacity-60 transition-all font-semibold text-xs flex items-center justify-between w-full"
            >
              <span>{preset.label}</span>
              <Send size={12} className="text-slate-400" />
            </button>
          ))}
        </div>
      </div>

      {/* PDF Modal Simulator */}
      {showPdfModal && (
        <div className="fixed inset-0 z-[110] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm">
          <div className="bg-white rounded-3xl border border-slate-200 shadow-2xl w-full max-w-lg overflow-hidden flex flex-col max-h-[85vh] text-left">
            {/* Header */}
            <div className="px-6 py-4 border-b border-slate-200 flex justify-between items-center bg-slate-50">
              <div className="flex items-center gap-2">
                <FileText className="text-[#292e91]" size={20} />
                <span className="font-bold text-slate-800 text-sm">แบบร่างใบเสนอราคา (PDF Live Preview)</span>
              </div>
              <button 
                onClick={() => setShowPdfModal(false)}
                className="text-xs font-bold text-slate-400 hover:text-slate-700 px-2.5 py-1.5 rounded-lg hover:bg-slate-100 transition-colors"
              >
                ปิดหน้าต่าง
              </button>
            </div>

            {/* Document Content */}
            <div className="flex-1 p-6 overflow-y-auto font-mono text-[10px] space-y-5 bg-white text-slate-800 leading-normal border-b border-slate-100">
              <div className="flex justify-between border-b border-slate-300 pb-4">
                <div>
                  <h3 className="text-sm font-bold text-[#292e91] font-sans">PERPOS CO., LTD.</h3>
                  <p>123 อาคารพาณิชย์สุขุมวิท, กทม. 10110</p>
                  <p>เลขประจำตัวผู้เสียภาษี: 0105569000000</p>
                </div>
                <div className="text-right">
                  <h4 className="text-sm font-bold text-slate-800 font-sans">ใบเสนอราคา / QUOTATION</h4>
                  <p>เลขที่: QT-2569-{(activeDeal === PRESETS[0]) ? "501" : "152"}</p>
                  <p>วันที่: {new Date().toLocaleDateString("th-TH")}</p>
                </div>
              </div>

              <div className="bg-slate-50 p-3 rounded-xl border border-slate-200">
                <div className="font-bold text-slate-700 mb-1">ข้อมูลลูกค้า:</div>
                <p>ผู้ติดต่อ: คุณสมชาย ดีกรี / บจก. พลังงานการค้าร่วม</p>
                <p>สถานที่ส่งสินค้า: {(activeDeal === PRESETS[0]) ? "จังหวัดชลบุรี" : "กรุงเทพมหานคร"}</p>
              </div>

              <table className="w-full border-collapse">
                <thead>
                  <tr className="border-b-2 border-slate-300 text-slate-700 font-bold text-left bg-slate-50">
                    <th className="py-2 px-1">รายละเอียดสินค้า/งานบริการ</th>
                    <th className="py-2 px-1 text-center">จำนวน</th>
                    <th className="py-2 px-1 text-right">ราคาต่อหน่วย</th>
                    <th className="py-2 px-1 text-right">ยอดรวม (บาท)</th>
                  </tr>
                </thead>
                <tbody>
                  {(activeDeal === PRESETS[0]) ? (
                    <tr className="border-b border-slate-200">
                      <td className="py-2 px-1 font-sans">กล่องลูกฟูกบรรจุภัณฑ์ ขนาดมาตรฐานเกรดดี (หนา 5 ชั้น)</td>
                      <td className="py-2 px-1 text-center">500</td>
                      <td className="py-2 px-1 text-right">25.00</td>
                      <td className="py-2 px-1 text-right">12,500.00</td>
                    </tr>
                  ) : (
                    <tr className="border-b border-slate-200">
                      <td className="py-2 px-1 font-sans">เสื้อยืดทีมสีขาว Cotton 100% รวมงานสกรีนโลโก้บริษัทด้านหน้า 1 จุด</td>
                      <td className="py-2 px-1 text-center">150</td>
                      <td className="py-2 px-1 text-right">120.00</td>
                      <td className="py-2 px-1 text-right">18,000.00</td>
                    </tr>
                  )}
                </tbody>
              </table>

              <div className="flex justify-between items-start pt-2">
                <div className="w-1/2 p-2.5 rounded-lg border border-emerald-150 bg-emerald-50 text-[9px] text-emerald-800">
                  <div className="font-bold font-sans flex items-center gap-1">
                    <CheckCircle2 size={12} className="text-emerald-600" />
                    <span>Lead Score: 92% (High Intent)</span>
                  </div>
                  <p className="mt-0.5 font-sans">AI ตรวจพบประวัติการชำระเงินที่รวดเร็วและเป็นลูกค้ารายใหม่เป้าหมาย</p>
                </div>
                <div className="w-1/2 text-right space-y-1">
                  <div className="flex justify-between pl-4">
                    <span>รวมเงินค่าสินค้า:</span>
                    <span>{(activeDeal === PRESETS[0]) ? "12,500.00" : "18,000.00"}</span>
                  </div>
                  <div className="flex justify-between pl-4">
                    <span>ค่าจัดส่งปลายทาง:</span>
                    <span>{(activeDeal === PRESETS[0]) ? "450.00" : "0.00"}</span>
                  </div>
                  <div className="flex justify-between pl-4">
                    <span>ภาษีมูลค่าเพิ่ม VAT 7%:</span>
                    <span>{(activeDeal === PRESETS[0]) ? "906.50" : "1,260.00"}</span>
                  </div>
                  <div className="flex justify-between pl-4 font-bold border-t border-slate-300 pt-1 text-slate-900">
                    <span>ยอดเงินรวมสุทธิ:</span>
                    <span className="text-[#292e91]">{(activeDeal === PRESETS[0]) ? "13,856.50" : "19,260.00"} บาท</span>
                  </div>
                </div>
              </div>
            </div>

            {/* Footer */}
            <div className="px-6 py-4 bg-slate-50 flex justify-between items-center">
              <span className="text-[10px] text-slate-400">สร้างออโตเมติกโดย PERPOS Sales Agent</span>
              <button 
                onClick={() => alert("ระบบทดลองดาวน์โหลดใบเสนอราคา จำลองการบันทึก PDF ลงเครื่องสำเร็จ")}
                className="inline-flex items-center gap-1.5 bg-[#292e91] hover:bg-blue-800 text-white font-bold text-xs px-3.5 py-2 rounded-xl transition-all shadow"
              >
                <Download size={14} />
                ดาวน์โหลด PDF
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
