"use client";

import React, { useState } from "react";
import { Send, Sparkles, CheckCircle2, FileText, Download } from "lucide-react";
import { useLanguage } from "../language-context";

interface Message {
  sender: "user" | "agent";
  text: string;
  time: string;
  isQuotation?: boolean;
}

const PRESETS_TH = [
  {
    label: "ดีล A: กล่องบรรจุภัณฑ์ 500 กล่อง",
    text: "สวัสดีครับ สนใจสั่งผลิตกล่องลูกฟูกบรรจุภัณฑ์สำหรับส่งของ ขนาดมาตรฐาน จำนวน 500 กล่องครับ ส่งไปที่ออฟฟิศชลบุรี ขอราคาด่วนด้วยครับ"
  },
  {
    label: "ดีล B: เสื้อยืดสั่งสกรีน 150 ตัว",
    text: "อยากทราบราคาเสื้อยืดทีมสีขาว Cotton 100% สกรีนโลโก้บริษัทด้านหน้า 1 จุด จำนวน 150 ตัวค่ะ ส่งที่กรุงเทพฯ ภายในสัปดาห์หน้า ขอใบเสนอราคาด้วยจ้า"
  }
];

const PRESETS_EN = [
  {
    label: "Deal A: 500 Packaging Boxes",
    text: "Hello, I am interested in ordering 500 custom corrugated boxes of standard size, delivered to Chonburi office. Need a quick quote, please!"
  },
  {
    label: "Deal B: 150 Screen-Printed T-Shirts",
    text: "Hi, I'd like to get a quote for 150 white 100% cotton team t-shirts, with a 1-spot custom logo printed on the front. Delivery to Bangkok by next week, thanks."
  }
];

export default function SalesWidget() {
  const { lang } = useLanguage();
  const presets = lang === "th" ? PRESETS_TH : PRESETS_EN;

  const [messages, setMessages] = useState<Message[]>([
    {
      sender: "agent",
      text: lang === "th"
        ? "สวัสดีค่ะ! ยินดีต้อนรับสู่ระบบผู้ช่วยอัตโนมัติ PERPOS Sales Agent ฉันสามารถช่วยออกใบเสนอราคา ร่างดีล และจัดส่งราคาให้ลูกค้าใน LINE แชตได้ทันทีใน 3 วินาทีค่ะ 🚀 ลองกดเลือกเคสตัวอย่างด้านล่างเพื่อทดสอบการตอบสนองได้เลยนะคะ"
        : "Hello! Welcome to PERPOS Sales Agent. I can help generate quotations, draft deals, and push pricing to clients via LINE OA chat in 3 seconds. 🚀 Try selecting a demo inquiry below to test the workflow.",
      time: "10:30"
    }
  ]);
  const [loading, setLoading] = useState(false);
  const [loadingStep, setLoadingStep] = useState("");
  const [showPdfModal, setShowPdfModal] = useState(false);
  const [activeDeal, setActiveDeal] = useState<typeof presets[0] | null>(null);

  React.useEffect(() => {
    // Reset messages when language changes
    setMessages([
      {
        sender: "agent",
        text: lang === "th"
          ? "สวัสดีค่ะ! ยินดีต้อนรับสู่ระบบผู้ช่วยอัตโนมัติ PERPOS Sales Agent ฉันสามารถช่วยออกใบเสนอราคา ร่างดีล และจัดส่งราคาให้ลูกค้าใน LINE แชตได้ทันทีใน 3 วินาทีค่ะ 🚀 ลองกดเลือกเคสตัวอย่างด้านล่างเพื่อทดสอบการตอบสนองได้เลยนะคะ"
          : "Hello! Welcome to PERPOS Sales Agent. I can help generate quotations, draft deals, and push pricing to clients via LINE OA chat in 3 seconds. 🚀 Try selecting a demo inquiry below to test the workflow.",
        time: "10:30"
      }
    ]);
    setActiveDeal(null);
    setShowPdfModal(false);
  }, [lang]);

  const triggerPreset = (preset: typeof presets[0]) => {
    if (loading) return;
    setActiveDeal(preset);
    const timeStr = new Date().toLocaleTimeString(lang === "th" ? "th-TH" : "en-US", { hour: "2-digit", minute: "2-digit" });
    
    // Add user message
    const newMsgList = [...messages, { sender: "user" as const, text: preset.text, time: timeStr }];
    setMessages(newMsgList);
    setLoading(true);

    const steps = lang === "th" ? [
      "อ่านข้อความแชตและสกัดข้อมูลความต้องการ...",
      "วิเคราะห์ลูกค้าและประเมินความเป็นไปได้ (Lead Score: 92/100)...",
      "ตรวจสอบคลังสินค้า & คำนวณค่าขนส่งปลายทาง...",
      "ร่างใบเสนอราคาและจัดโครงสร้างราคาสำเร็จ..."
    ] : [
      "Reading message and extracting requirements...",
      "Analyzing customer and scoring lead (Lead Score: 92/100)...",
      "Checking inventory & calculating shipping cost...",
      "Drafting quote and structuring pricing successfully..."
    ];

    setLoadingStep(steps[0]);

    setTimeout(() => {
      setLoadingStep(steps[1]);
      setTimeout(() => {
        setLoadingStep(steps[2]);
        setTimeout(() => {
          setLoadingStep(steps[3]);
          setTimeout(() => {
            setLoading(false);
            setLoadingStep("");
            
            // Add Agent reply
            const replyTime = new Date().toLocaleTimeString(lang === "th" ? "th-TH" : "en-US", { hour: "2-digit", minute: "2-digit" });
            const replyText = lang === "th"
              ? `ได้รับข้อมูลความต้องการเรียบร้อยค่ะ! บันทึกข้อมูลเข้าระบบ CRM และร่างเอกสารใบเสนอราคาเสนอราคาให้เสร็จสิ้นใน 3 วินาทีตามรายละเอียด:\n\n• โครงการ: จัดสั่งผลิตตามความต้องการ\n• รหัสคำร้อง: QT-2026-${Math.floor(Math.random() * 9000) + 1000}\n• การคำนวณภาษี: รวม VAT 7% เรียบร้อย\n\nคุณสามารถกดดูแบบร่างเอกสารใบเสนอราคาได้ผ่านลิงก์ด้านล่างนี้ได้เลยค่ะ 👇`
              : `Got your request! Saved details to CRM database and drafted your quotation in 3 seconds as follows:\n\n• Project: Custom production run\n• Inquiry ID: QT-2026-${Math.floor(Math.random() * 9000) + 1000}\n• Tax Calculation: 7% VAT included\n\nClick the link below to view your draft quotation 👇`;

            const linkLabel = lang === "th" ? "คลิกเพื่อเปิดเอกสารใบเสนอราคาร่าง" : "Click to view draft quotation";

            setMessages(prev => [
              ...prev,
              {
                sender: "agent",
                text: replyText,
                time: replyTime
              },
              {
                sender: "agent",
                text: linkLabel,
                time: replyTime,
                isQuotation: true
              }
            ]);
          }, 600);
        }, 600);
      }, 700);
    }, 600);
  };

  const t = {
    headerTitle: lang === "th" ? "LINE OA Live Simulator" : "LINE OA Live Simulator",
    badge: lang === "th" ? "Sales Response: 3s" : "Sales Response: 3s",
    quoteTitle: lang === "th" ? "ใบเสนอราคา (Quotation Draft)" : "Quotation Draft (PDF)",
    quoteSub: lang === "th" ? "คลิกเพื่อคลิกเปิดไฟล์ PDF ใบรับรองราคา" : "Click to open the PDF document preview",
    working: lang === "th" ? "Sales Agent กำลังทำงานเชิงรุก..." : "Sales Agent is actively drafting...",
    scenarioLabel: lang === "th" ? "จำลองสถานการณ์ขอราคา (เลือกกดเพื่อส่งข้อความ):" : "Select inquiry scenario to simulate:",
    pdfHeader: lang === "th" ? "แบบร่างใบเสนอราคา (PDF Live Preview)" : "Draft Quotation (PDF Live Preview)",
    pdfClose: lang === "th" ? "ปิดหน้าต่าง" : "Close Document",
    pdfAddress: lang === "th" ? "123 อาคารพาณิชย์สุขุมวิท, กทม. 10110" : "123 Sukhumvit Road, Bangkok 10110",
    pdfTaxId: lang === "th" ? "เลขประจำตัวผู้เสียภาษี: 0105569000000" : "Tax ID: 0105569000000",
    pdfQuoLabel: lang === "th" ? "ใบเสนอราคา / QUOTATION" : "QUOTATION",
    pdfNo: lang === "th" ? "เลขที่: " : "Ref No: ",
    pdfDate: lang === "th" ? "วันที่: " : "Date: ",
    pdfCustLabel: lang === "th" ? "ข้อมูลลูกค้า:" : "Customer Details:",
    pdfCustName: lang === "th" ? "ผู้ติดต่อ: คุณสมชาย ดีกรี / บจก. พลังงานการค้าร่วม" : "Contact: Somchai Degri / Union Trade Power Co., Ltd.",
    pdfShipTo: lang === "th" ? "สถานที่ส่งสินค้า: " : "Shipping Destination: ",
    pdfChonburi: lang === "th" ? "จังหวัดชลบุรี" : "Chonburi Province",
    pdfBkk: lang === "th" ? "กรุงเทพมหานคร" : "Bangkok",
    thDesc: lang === "th" ? "รายละเอียดสินค้า/งานบริการ" : "Item & Service Description",
    thQty: lang === "th" ? "จำนวน" : "Qty",
    thUnitPrice: lang === "th" ? "ราคาต่อหน่วย" : "Unit Price",
    thTotal: lang === "th" ? "ยอดรวม (บาท)" : "Total (THB)",
    p1Desc: lang === "th" ? "กล่องลูกฟูกบรรจุภัณฑ์ ขนาดมาตรฐานเกรดดี (หนา 5 ชั้น)" : "Corrugated packaging boxes, premium grade (5-ply thick)",
    p2Desc: lang === "th" ? "เสื้อยืดทีมสีขาว Cotton 100% รวมงานสกรีนโลโก้บริษัทด้านหน้า 1 จุด" : "White team t-shirt 100% Cotton, includes 1-spot front print",
    leadTitle: lang === "th" ? "Lead Score: 92% (High Intent)" : "Lead Score: 92% (High Intent)",
    leadDesc: lang === "th" ? "AI ตรวจพบประวัติการชำระเงินที่รวดเร็วและเป็นลูกค้ารายใหม่เป้าหมาย" : "AI detected prompt payment history and qualified as high priority new lead",
    subtotalLabel: lang === "th" ? "รวมเงินค่าสินค้า:" : "Subtotal Amount:",
    shippingLabel: lang === "th" ? "ค่าจัดส่งปลายทาง:" : "Delivery Charges:",
    vatLabel: lang === "th" ? "ภาษีมูลค่าเพิ่ม VAT 7%:" : "VAT 7%:",
    grandTotalLabel: lang === "th" ? "ยอดเงินรวมสุทธิ:" : "Total Grand Net:",
    currency: lang === "th" ? "บาท" : "THB",
    pdfFooterText: lang === "th" ? "สร้างออโตเมติกโดย PERPOS Sales Agent" : "Generated automatically by PERPOS Sales Agent",
    pdfDownloadBtn: lang === "th" ? "ดาวน์โหลด PDF" : "Download PDF",
    alertSave: lang === "th" ? "ระบบทดลองดาวน์โหลดใบเสนอราคา จำลองการบันทึก PDF ลงเครื่องสำเร็จ" : "Simulation: Quotation saved as PDF successfully."
  };

  return (
    <div className="w-full rounded-2xl border border-slate-200 bg-white overflow-hidden shadow-lg flex flex-col min-h-[460px] text-slate-700 font-sans">
      {/* Widget Header */}
      <div className="bg-slate-50 border-b border-slate-200 px-4 py-3 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-pulse" />
          <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">{t.headerTitle}</span>
        </div>
        <div className="text-[10px] bg-blue-50 border border-blue-100 text-blue-700 px-2 py-0.5 rounded-full font-bold">
          {t.badge}
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
                    <h5 className="font-bold text-[#292e91]">{t.quoteTitle}</h5>
                    <p className="text-[10px] text-slate-550 mt-0.5">{t.quoteSub}</p>
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
            <div className="p-3 bg-white border border-slate-200 rounded-2xl rounded-bl-none text-slate-550 flex flex-col gap-1 shadow-sm">
              <div className="flex items-center gap-1.5 font-bold text-blue-700">
                <div className="w-1.5 h-1.5 rounded-full bg-blue-600 animate-ping" />
                <span>{t.working}</span>
              </div>
              <span className="text-[10px]">{loadingStep}</span>
            </div>
          </div>
        )}
      </div>

      {/* Input Action Panel */}
      <div className="border-t border-slate-200 p-3 bg-white space-y-3">
        <div className="text-[10px] text-slate-400 font-bold uppercase tracking-wider text-left">
          {t.scenarioLabel}
        </div>
        <div className="flex flex-col gap-2">
          {presets.map((preset, idx) => (
            <button
              key={idx}
              disabled={loading}
              onClick={() => triggerPreset(preset)}
              className="text-left px-3 py-2 rounded-xl border border-slate-200 bg-slate-50 text-slate-700 hover:border-[#292e91]/40 hover:bg-[#292e91]/5 disabled:opacity-60 transition-all font-bold text-xs flex items-center justify-between w-full cursor-pointer"
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
                <span className="font-bold text-slate-800 text-sm">{t.pdfHeader}</span>
              </div>
              <button 
                onClick={() => setShowPdfModal(false)}
                className="text-xs font-bold text-slate-400 hover:text-slate-700 px-2.5 py-1.5 rounded-lg hover:bg-slate-100 transition-colors cursor-pointer"
              >
                {t.pdfClose}
              </button>
            </div>

            {/* Document Content */}
            <div className="flex-1 p-6 overflow-y-auto font-mono text-[10px] space-y-5 bg-white text-slate-800 leading-normal border-b border-slate-100">
              <div className="flex justify-between border-b border-slate-300 pb-4">
                <div>
                  <h3 className="text-sm font-bold text-[#292e91] font-sans">PERPOS CO., LTD.</h3>
                  <p className="font-sans">{t.pdfAddress}</p>
                  <p>{t.pdfTaxId}</p>
                </div>
                <div className="text-right">
                  <h4 className="text-sm font-bold text-slate-800 font-sans">{t.pdfQuoLabel}</h4>
                  <p>{t.pdfNo}{(activeDeal === presets[0]) ? "501" : "152"}</p>
                  <p>{t.pdfDate}{new Date().toLocaleDateString(lang === "th" ? "th-TH" : "en-US")}</p>
                </div>
              </div>

              <div className="bg-slate-50 p-3 rounded-xl border border-slate-200 font-sans">
                <div className="font-bold text-slate-700 mb-1">{t.pdfCustLabel}</div>
                <p>{t.pdfCustName}</p>
                <p>{t.pdfShipTo}{(activeDeal === presets[0]) ? t.pdfChonburi : t.pdfBkk}</p>
              </div>

              <table className="w-full border-collapse">
                <thead>
                  <tr className="border-b-2 border-slate-300 text-slate-700 font-bold text-left bg-slate-50 font-sans">
                    <th className="py-2 px-1">{t.thDesc}</th>
                    <th className="py-2 px-1 text-center">{t.thQty}</th>
                    <th className="py-2 px-1 text-right">{t.thUnitPrice}</th>
                    <th className="py-2 px-1 text-right">{t.thTotal}</th>
                  </tr>
                </thead>
                <tbody>
                  {(activeDeal === presets[0]) ? (
                    <tr className="border-b border-slate-200">
                      <td className="py-2 px-1 font-sans">{t.p1Desc}</td>
                      <td className="py-2 px-1 text-center font-mono">500</td>
                      <td className="py-2 px-1 text-right font-mono">25.00</td>
                      <td className="py-2 px-1 text-right font-mono">12,500.00</td>
                    </tr>
                  ) : (
                    <tr className="border-b border-slate-200">
                      <td className="py-2 px-1 font-sans">{t.p2Desc}</td>
                      <td className="py-2 px-1 text-center font-mono">150</td>
                      <td className="py-2 px-1 text-right font-mono">120.00</td>
                      <td className="py-2 px-1 text-right font-mono">18,000.00</td>
                    </tr>
                  )}
                </tbody>
              </table>

              <div className="flex justify-between items-start pt-2 font-sans">
                <div className="w-1/2 p-2.5 rounded-lg border border-emerald-150 bg-emerald-50 text-[9px] text-emerald-800">
                  <div className="font-bold flex items-center gap-1">
                    <CheckCircle2 size={12} className="text-emerald-600" />
                    <span>{t.leadTitle}</span>
                  </div>
                  <p className="mt-0.5">{t.leadDesc}</p>
                </div>
                <div className="w-1/2 text-right space-y-1">
                  <div className="flex justify-between pl-4">
                    <span>{t.subtotalLabel}</span>
                    <span className="font-mono">{(activeDeal === presets[0]) ? "12,500.00" : "18,000.00"}</span>
                  </div>
                  <div className="flex justify-between pl-4">
                    <span>{t.shippingLabel}</span>
                    <span className="font-mono">{(activeDeal === presets[0]) ? "450.00" : "0.00"}</span>
                  </div>
                  <div className="flex justify-between pl-4">
                    <span>{t.vatLabel}</span>
                    <span className="font-mono">{(activeDeal === presets[0]) ? "906.50" : "1,260.00"}</span>
                  </div>
                  <div className="flex justify-between pl-4 font-bold border-t border-slate-300 pt-1 text-slate-900">
                    <span>{t.grandTotalLabel}</span>
                    <span className="text-[#292e91] font-mono">{(activeDeal === presets[0]) ? "13,856.50" : "19,260.00"} {t.currency}</span>
                  </div>
                </div>
              </div>
            </div>

            {/* Footer */}
            <div className="px-6 py-4 bg-slate-50 flex justify-between items-center">
              <span className="text-[10px] text-slate-400">{t.pdfFooterText}</span>
              <button 
                onClick={() => alert(t.alertSave)}
                className="inline-flex items-center gap-1.5 bg-[#292e91] hover:bg-blue-800 text-white font-bold text-xs px-3.5 py-2 rounded-xl transition-all shadow cursor-pointer"
              >
                <Download size={14} />
                {t.pdfDownloadBtn}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
