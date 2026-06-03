"use client";

import React, { useState, useEffect } from "react";
import Link from "next/link";
import {
  Sparkles,
  ArrowRight,
  ShieldCheck,
  Zap,
  Server,
  Database,
  Lock,
  ArrowUpRight,
  Cpu,
  Layers,
  X,
  CheckCircle2,
  MessageSquare,
  Target,
  ShoppingCart,
  Receipt,
  Users,
  Truck,
  TrendingUp,
  Sliders,
  Menu,
  Clock,
  Globe
} from "lucide-react";
import ChatTerminal from "./chat-terminal";
import OcrSimulation from "./ocr-simulation";
import AgentNetwork from "./agent-network";
import CostSimulator from "./cost-simulator";

const APP_SIGNIN_URL = "https://app.perpos.io/signin";

const MENU_AGENTS = [
  { name: "Sales Agent", slug: "sales", desc: "เสนอราคาทาง LINE ใน 3 วินาที", icon: MessageSquare, color: "text-blue-600 bg-blue-50 border-blue-100" },
  { name: "Marketing Agent", slug: "marketing", desc: "วิเคราะห์แคมเปญรายบุคคล", icon: Target, color: "text-indigo-600 bg-indigo-50 border-indigo-100" },
  { name: "Procurement Agent", slug: "procurement", desc: "จัดซื้อและมอนิเตอร์สต๊อกสินค้า", icon: ShoppingCart, color: "text-emerald-600 bg-emerald-50 border-emerald-100" },
  { name: "Finance & OCR Agent", slug: "finance", desc: "สแกนบิลและกระทบยอดเงินโอน", icon: Receipt, color: "text-rose-600 bg-rose-50 border-rose-100" },
  { name: "HR & Operations Agent", slug: "hr", desc: "จัดกะกะทัดรัด/สรุป Payroll พนักงาน", icon: Users, color: "text-violet-600 bg-violet-50 border-violet-100" },
  { name: "Admin Agent", slug: "admin", desc: "คำนวณแผนการเดินทางขนส่งที่ดีที่สุด", icon: Truck, color: "text-amber-600 bg-amber-50 border-amber-100" },
  { name: "Executive Assistant", slug: "executive", desc: "สนทนา BI รายงานธุรกิจทันใจ", icon: TrendingUp, color: "text-cyan-600 bg-cyan-50 border-cyan-100" },
  { name: "Scenario Simulator", slug: "simulator", desc: "ทดลองตัวแปรความเสี่ยง What-If", icon: Sliders, color: "text-teal-600 bg-teal-50 border-teal-100" },
];

export default function LandingPage() {
  const [isScrolled, setIsScrolled] = useState(false);
  const [isVisible, setIsVisible] = useState(true);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [submitStatus, setSubmitStatus] = useState<"idle" | "loading" | "success">("idle");
  const [formState, setFormState] = useState({
    name: "",
    company: "",
    email: "",
    phone: "",
    details: ""
  });

  const handleFormSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitStatus("loading");

    setTimeout(() => {
      setSubmitStatus("success");

      const emailTo = "admin@perpos.io";
      const subject = `Request Demo PERPOS - ${formState.company}`;
      const body = `เรียน ทีมงาน PERPOS,\n\nมีความประสงค์ขอรับการสาธิตการใช้งานระบบ PERPOS ERP (Request Demo)\n\nรายละเอียดผู้ติดต่อ:\n- ชื่อผู้ติดต่อ: ${formState.name}\n- บริษัท/องค์กร: ${formState.company}\n- อีเมล: ${formState.email}\n- เบอร์โทรศัพท์: ${formState.phone}\n- ความต้องการเพิ่มเติม: ${formState.details || "ไม่มี"}\n\nขอแสดงความนับถือ,\n${formState.name}`;
      
      const mailtoUrl = `mailto:${emailTo}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
      window.location.href = mailtoUrl;
    }, 1200);
  };

  useEffect(() => {
    let lastScrollY = window.scrollY;

    const handleScroll = () => {
      const currentScrollY = window.scrollY;
      setIsScrolled(currentScrollY > 16);

      if (currentScrollY > lastScrollY && currentScrollY > 80) {
        setIsVisible(false);
      } else {
        setIsVisible(true);
      }
      lastScrollY = currentScrollY;
    };

    window.addEventListener("scroll", handleScroll, { passive: true });
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  return (
    <div className="bg-white text-slate-800 font-sans antialiased min-h-screen overflow-x-hidden selection:bg-blue-500 selection:text-white">
      
      {/* HEADER NAVBAR */}
      <header className={`fixed top-0 left-0 right-0 w-full z-50 bg-white/80 backdrop-blur-md transition-all duration-300 ${
        isVisible ? "translate-y-0" : "-translate-y-full"
      } ${
        isScrolled ? "shadow-sm border-b border-slate-200/50" : "border-b border-transparent"
      }`}>
        <div className="mx-auto flex w-full max-w-7xl items-center justify-between px-4 py-4 sm:px-6 lg:px-8">
          <Link href="/" className="flex items-center gap-2">
            <img src="/logo.svg" alt="PERPOS" className="h-8 w-auto" />
          </Link>
          <nav className="hidden md:flex items-center gap-8 text-sm font-semibold text-slate-600">
            {/* AI Agents Dropdown Menu */}
            <div className="relative group py-4">
              <button className="flex items-center gap-1 hover:text-[#292e91] transition-colors font-semibold cursor-pointer outline-none text-slate-600">
                AI Agents
                <svg className="w-4 h-4 transition-transform duration-200 group-hover:rotate-180" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                </svg>
              </button>
              
              {/* Dropdown Container */}
              <div className="absolute top-[85%] left-1/2 -translate-x-1/2 w-[580px] bg-white/95 backdrop-blur-md border border-slate-200/80 rounded-2xl shadow-xl opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all duration-200 z-50 p-3.5 grid grid-cols-2 gap-2 origin-top mt-2">
                {MENU_AGENTS.map((item) => (
                  <Link
                    key={item.slug}
                    href={`/agents/${item.slug}`}
                    className="flex items-start gap-3 p-3 rounded-xl hover:bg-slate-50 border border-transparent hover:border-slate-100 transition-all group/item"
                  >
                    <div className={`p-2 rounded-xl border shrink-0 transition-colors ${item.color}`}>
                      <item.icon size={16} />
                    </div>
                    <div className="flex flex-col text-left">
                      <span className="text-sm font-extrabold text-slate-800 leading-snug">
                        {item.name}
                      </span>
                      <span className="text-[11px] text-slate-500 mt-1 font-normal leading-normal">{item.desc}</span>
                    </div>
                  </Link>
                ))}
              </div>
            </div>

            <a href="#shift" className="hover:text-[#292e91] transition-colors">The Shift</a>
            <a href="#architecture" className="hover:text-[#292e91] transition-colors">Architecture</a>
            <a href="#model" className="hover:text-[#292e91] transition-colors">Pricing</a>
          </nav>

          <div className="flex items-center gap-2 sm:gap-4">
            <a
              href={APP_SIGNIN_URL}
              className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 sm:px-4 sm:py-2 text-xs sm:text-sm font-semibold text-slate-700 shadow-sm hover:bg-slate-50 transition-colors"
            >
              เข้าสู่ระบบ
            </a>

            {/* Mobile Menu Toggle Button */}
            <button
              onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
              className="md:hidden p-1.5 rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50 transition-colors cursor-pointer"
            >
              {isMobileMenuOpen ? <X size={18} /> : <Menu size={18} />}
            </button>

            <button
               onClick={() => setIsModalOpen(true)}
               className="hidden sm:inline-flex items-center justify-center rounded-lg bg-brand-gradient hover:opacity-90 px-4 py-2 text-sm font-semibold text-white transition-all shadow-sm duration-300 hover:shadow-md"
             >
               ขอเดโมระบบ
             </button>
          </div>
        </div>

        {/* Mobile Menu Panel */}
        {isMobileMenuOpen && (
          <div className="md:hidden fixed inset-x-0 top-[68px] bg-white border-b border-slate-200 shadow-lg z-40 p-4 max-h-[calc(100vh-68px)] overflow-y-auto animate-fade-in text-left">
            <div className="flex flex-col gap-4 text-sm font-semibold text-slate-700">
              <a href="#features" onClick={() => setIsMobileMenuOpen(false)} className="hover:text-[#292e91] py-2 border-b border-slate-100">AI Agents ทั้งหมด</a>
              <a href="#shift" onClick={() => setIsMobileMenuOpen(false)} className="hover:text-[#292e91] py-2 border-b border-slate-100">The Shift</a>
              <a href="#architecture" onClick={() => setIsMobileMenuOpen(false)} className="hover:text-[#292e91] py-2 border-b border-slate-100">Architecture</a>
              <a href="#model" onClick={() => setIsMobileMenuOpen(false)} className="hover:text-[#292e91] py-2 border-b border-slate-100">Pricing</a>
              
              <div className="pt-2">
                <div className="text-xs text-slate-400 font-bold uppercase tracking-wider mb-2">เจาะลึก AI Agents</div>
                <div className="grid grid-cols-1 gap-2 pl-2">
                  {MENU_AGENTS.map((item) => (
                    <Link
                      key={item.slug}
                      href={`/agents/${item.slug}`}
                      onClick={() => setIsMobileMenuOpen(false)}
                      className="flex items-center gap-2.5 py-1.5 hover:text-[#292e91] text-xs"
                    >
                      <div className={`p-1.5 rounded-lg border ${item.color}`}>
                        <item.icon size={12} />
                      </div>
                      <span className="font-bold">{item.name}</span>
                    </Link>
                  ))}
                </div>
              </div>
              
              <button
                onClick={() => {
                  setIsMobileMenuOpen(false);
                  setIsModalOpen(true);
                }}
                className="w-full mt-4 rounded-xl bg-brand-gradient hover:opacity-90 px-4 py-3 text-sm font-bold text-white shadow-md transition-all text-center"
              >
                ขอเดโมระบบ
              </button>
            </div>
          </div>
        )}
      </header>

      {/* 1. HERO SECTION */}
      <section className="relative pt-24 pb-24 md:pt-36 md:pb-36 bg-gradient-to-b from-blue-50/40 via-white to-white border-b border-slate-100">
        {/* Glow ambient background grid */}
        <div className="absolute inset-0 bg-grid opacity-60 pointer-events-none" />
        <div className="absolute top-20 left-1/2 -translate-x-1/2 w-[500px] h-[250px] bg-gradient-to-r from-blue-500/5 to-cyan-500/5 rounded-full blur-[100px] pointer-events-none" />

        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 relative z-10">
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-12 lg:gap-8 items-center">
            
            {/* Copy Block */}
            <div className="lg:col-span-7 space-y-6 text-left">
              <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-blue-50/50 border border-[#292e91]/15 text-xs font-semibold text-[#292e91]">
                <Sparkles size={14} className="text-[#292e91]" />
                <span>Next-Gen Agentic AI ERP</span>
              </div>
              <h1 className="text-3xl sm:text-4xl md:text-5xl font-black font-lexend text-slate-900 leading-tight tracking-tight">
                Next-Gen Agentic AI ERP: <br />
                <span className="bg-gradient-to-r from-[#292e91] to-[#4ca9df] bg-clip-text text-transparent">
                  Tailored to Empower Your Business Flow
                </span>
              </h1>
              <p className="text-base sm:text-lg text-slate-600 max-w-2xl leading-relaxed">
                หนึ่งเครือข่าย AI Agents เชื่อมต่อทั้งองค์กรให้เป็นทีมเดียว จากหน้าบ้านถึงหลังบ้าน เชื่อมข้อมูลแบบ Real-time บนระบบคลาวด์ระดับองค์กร (Enterprise Cloud) — ทลายไซโล ตัดคอขวดการทำงาน 100%
              </p>
              <div className="flex flex-col sm:flex-row gap-4 pt-4">
                <button
                  onClick={() => setIsModalOpen(true)}
                  className="flex items-center justify-center gap-2 rounded-xl bg-brand-gradient hover:opacity-90 text-white font-bold text-sm px-6 py-3.5 transition-all shadow-[0_4px_12px_rgba(41,46,145,0.2)] duration-300 hover:shadow-[0_6px_16px_rgba(41,46,145,0.25)]"
                >
                  Request Enterprise Demo
                  <ArrowRight size={16} />
                </button>

              </div>
            </div>

            {/* Live Chat terminal Widget */}
            <div className="lg:col-span-5 w-full">
              <ChatTerminal />
            </div>

          </div>
        </div>
      </section>

      {/* 2. KEY METRICS SECTION */}
      <section className="py-16 bg-slate-50/50 border-b border-slate-100 relative">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            
            {/* Metric 1 */}
            <div className="p-6 rounded-2xl bg-white border border-slate-200/80 hover:border-blue-500/20 hover:shadow-md transition-all flex flex-col justify-between min-h-[140px] group">
              <div className="flex justify-between items-start">
                <div className="text-4xl font-extrabold bg-gradient-to-r from-[#292e91] to-[#4ca9df] bg-clip-text text-transparent tracking-tight group-hover:scale-105 transition-all duration-300">
                  8 AI Agents
                </div>
                <div className="p-2 rounded-lg bg-blue-50/50 border border-[#292e91]/15 text-[#292e91]">
                  <Cpu size={16} />
                </div>
              </div>
              <div className="mt-4 text-left">
                <h4 className="text-sm font-bold text-slate-805 uppercase tracking-wider">Autonomous Workforce</h4>
                <p className="text-xs sm:text-sm text-slate-500 leading-relaxed mt-1.5">
                  ปฏิบัติงานเชิงรุกแทนมนุษย์ในทุกแผนกตลอด 24/7 เพื่อสกัดข้อมูลและประสานงานข้ามไซโล
                </p>
              </div>
            </div>

            {/* Metric 2 */}
            <div className="p-6 rounded-2xl bg-white border border-slate-200/80 hover:border-blue-500/20 hover:shadow-md transition-all flex flex-col justify-between min-h-[140px] group">
              <div className="flex justify-between items-start">
                <div className="text-4xl font-extrabold bg-gradient-to-r from-[#292e91] to-[#4ca9df] bg-clip-text text-transparent tracking-tight group-hover:scale-105 transition-all duration-300">
                  10x Faster
                </div>
                <div className="p-2 rounded-lg bg-blue-50/50 border border-[#292e91]/15 text-[#292e91]">
                  <Zap size={16} />
                </div>
              </div>
              <div className="mt-4 text-left">
                <h4 className="text-sm font-bold text-slate-805 uppercase tracking-wider">Operation Efficiency</h4>
                <p className="text-xs sm:text-sm text-slate-500 leading-relaxed mt-1.5">
                  สกัดข้อมูลใบเสร็จ คีย์เอกสาร และประมวลผลตรรกะบัญชีการจัดซื้อเร็วกว่าวิถีดั้งเดิม 10 เท่า
                </p>
              </div>
            </div>

            {/* Metric 3 */}
            <div className="p-6 rounded-2xl bg-white border border-slate-200/80 hover:border-blue-500/20 hover:shadow-md transition-all flex flex-col justify-between min-h-[140px] group">
              <div className="flex justify-between items-start">
                <div className="text-4xl font-extrabold bg-gradient-to-r from-[#292e91] to-[#4ca9df] bg-clip-text text-transparent tracking-tight group-hover:scale-105 transition-all duration-300">
                  Real-time
                </div>
                <div className="p-2 rounded-lg bg-blue-50/50 border border-[#292e91]/15 text-[#292e91]">
                  <Database size={16} />
                </div>
              </div>
              <div className="mt-4 text-left">
                <h4 className="text-sm font-bold text-slate-805 uppercase tracking-wider">AI-Ready Data Layer</h4>
                <p className="text-xs sm:text-sm text-slate-500 leading-relaxed mt-1.5">
                  ฐานข้อมูลบัญชีศูนย์กลางเข้าถึงได้ทันที สรุปกระแสเงินสดและสัญญาลึกถึงโครงสร้างใน 3 วินาที
                </p>
              </div>
            </div>

          </div>
        </div>
      </section>

      {/* 3. THE SHIFT: SYSTEM OF RECORD TO SYSTEM OF ACTION */}
      <section className="py-20 md:py-28 bg-white border-b border-slate-100" id="shift">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="text-center max-w-3xl mx-auto space-y-3 mb-16">
            <h2 className="text-2xl md:text-3xl font-extrabold text-slate-900 font-lexend">
              จากบันทึกอดีต สู่ระบบปฏิบัติการเชิงรุก
            </h2>
            <p className="text-base text-slate-550 leading-relaxed">
              เปลี่ยนขบวนการทำงานจาก ERP แบบเดิมๆ ที่คอยจดบันทึกประวัติเอกสารย้อนหลัง มาเป็นระบบปฏิบัติงานอัตโนมัติที่ช่วยคิด มอนิเตอร์ และทำงานแทนคุณเชิงรุกแบบ Real-time
            </p>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 items-stretch">
            
            {/* The Old Way */}
            <div className="bg-slate-50/50 border border-slate-100 rounded-3xl p-6 lg:p-8 flex flex-col justify-between space-y-6 text-left opacity-80">
              <div className="space-y-4">
                <div className="w-10 h-10 rounded-xl bg-slate-100 border border-slate-200 flex items-center justify-center text-slate-400">
                  <ShieldCheck size={20} />
                </div>
                <div>
                  <h3 className="text-lg font-bold text-slate-500">แบบเดิม: System of Record</h3>
                  <p className="text-sm text-slate-450 mt-1">เน้นจดบันทึกเอกสารและประวัติย้อนหลัง เสียเวลากับงานแมนนวลซ้ำซาก</p>
                </div>
              </div>
              
              <div className="space-y-5 pt-6 border-t border-slate-200">
                {/* Point 1 */}
                <div className="flex gap-3.5 items-start">
                  <span className="text-red-500 shrink-0 text-base">❌</span>
                  <div>
                    <h4 className="text-sm font-bold text-slate-700">ลงบัญชีและคีย์ข้อมูลด้วยมือ</h4>
                    <p className="text-xs text-slate-500 leading-relaxed mt-1">พนักงานต้องคีย์ใบเสนอราคา ใบสั่งซื้อ และลงบัญชีแยกแผนกด้วยมือทีละขั้นตอน</p>
                  </div>
                </div>
                {/* Point 2 */}
                <div className="flex gap-3.5 items-start">
                  <span className="text-red-500 shrink-0 text-base">❌</span>
                  <div>
                    <h4 className="text-sm font-bold text-slate-700">สต๊อกสินค้าขาดหรือล้นคลัง</h4>
                    <p className="text-xs text-slate-500 leading-relaxed mt-1">นับสต๊อกด้วยมือ เสียโอกาสการขายจากการขาดข้อมูลวิเคราะห์พยากรณ์เชิงรุก</p>
                  </div>
                </div>
                {/* Point 3 */}
                <div className="flex gap-3.5 items-start">
                  <span className="text-red-500 shrink-0 text-base">❌</span>
                  <div>
                    <h4 className="text-sm font-bold text-slate-700">รับข้อมูลล่าช้าเป็นสัปดาห์</h4>
                    <p className="text-xs text-slate-500 leading-relaxed mt-1">ผู้บริหารทราบผลกำไรและการเงินช้า ต้องรอสเปรดชีตและปิดงบปลายเดือนเสมอ</p>
                  </div>
                </div>
              </div>
            </div>

            {/* The PERPOS Way */}
            <div className="bg-gradient-to-br from-blue-50/50 via-white to-white border border-blue-200/60 rounded-3xl p-6 lg:p-8 flex flex-col justify-between space-y-6 shadow-sm text-left relative overflow-hidden group hover:shadow-md transition-shadow duration-300">
              <div className="absolute top-0 right-0 w-32 h-32 bg-[#4ca9df]/5 rounded-full blur-3xl pointer-events-none" />
              <div className="space-y-4">
                <div className="w-10 h-10 rounded-xl bg-blue-50/50 border border-[#292e91]/15 flex items-center justify-center text-[#292e91]">
                  <Sparkles size={20} className="animate-pulse" />
                </div>
                <div>
                  <h3 className="text-lg font-bold bg-gradient-to-r from-[#292e91] to-[#4ca9df] bg-clip-text text-transparent">ระบบ PERPOS: System of Action</h3>
                  <p className="text-sm text-slate-555 mt-1">เน้นการประมวลผลเชิงรุกด้วย AI Agents ทำงานแทนและแจ้งเตือนทันที</p>
                </div>
              </div>
              
              <div className="space-y-5 pt-6 border-t border-blue-100">
                {/* Point 1 */}
                <div className="flex gap-3.5 items-start">
                  <span className="text-emerald-500 shrink-0 bg-emerald-50 p-0.5 rounded-full text-xs">✓</span>
                  <div>
                    <h4 className="text-sm font-extrabold text-[#292e91]">AI Autopilot ทำงานอัตโนมัติ</h4>
                    <p className="text-xs text-slate-600 leading-relaxed mt-1 font-medium">AI OCR สกัดวิเคราะห์บิล คีย์แยกประเภท และลงบัญชีเรียลไทม์ใน 3 วินาที</p>
                  </div>
                </div>
                {/* Point 2 */}
                <div className="flex gap-3.5 items-start">
                  <span className="text-emerald-500 shrink-0 bg-emerald-50 p-0.5 rounded-full text-xs">✓</span>
                  <div>
                    <h4 className="text-sm font-extrabold text-[#292e91]">คำนวณอัตราขายและพยากรณ์สต๊อก</h4>
                    <p className="text-xs text-slate-600 leading-relaxed mt-1 font-medium">ทำนายปริมาณการขาย (Auto-Replenishment) ออกเอกสารสั่งซื้อเมื่อของต่ำกว่าจุดวิกฤต</p>
                  </div>
                </div>
                {/* Point 3 */}
                <div className="flex gap-3.5 items-start">
                  <span className="text-emerald-500 shrink-0 bg-emerald-50 p-0.5 rounded-full text-xs">✓</span>
                  <div>
                    <h4 className="text-sm font-extrabold text-[#292e91]">สรุป Insights ส่งตรงในแชตบอท</h4>
                    <p className="text-xs text-slate-600 leading-relaxed mt-1 font-medium">ผู้บริหารเรียกดูรายงานการเงิน ยอดขาย และวิเคราะห์ความเสี่ยงลึกได้ทุกอุปกรณ์ 24 ชม.</p>
                  </div>
                </div>
              </div>
            </div>

          </div>
        </div>
      </section>

      {/* 4. THE 8 AUTONOMOUS AI AGENTS */}
      <section className="py-20 md:py-28 bg-slate-50/30 border-b border-slate-100" id="features">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          
          <div className="text-center max-w-3xl mx-auto space-y-3 mb-16">
            <h2 className="text-2xl md:text-3xl font-extrabold text-slate-900 font-lexend">
              การทำงานประสานของ 8 Autonomous AI Agents
            </h2>
            <p className="text-base text-slate-550 leading-relaxed">
              ทำงานประสานสอดคล้องจากหน้าบ้านถึงหลังบ้าน (Front-Office to Back-Office) เชื่อมข้อมูลระบบบัญชี ซื้อ ขาย คลังสินค้า ขนส่ง และวิเคราะห์ข้อมูลในที่เดียว
            </p>
          </div>

          {/* Interactive Agent Network Node Graph */}
          <AgentNetwork />

          {/* Inline OCR simulator simulation showcase */}
          <div className="mt-16 grid grid-cols-1 lg:grid-cols-12 gap-8 items-center bg-white border border-slate-200 rounded-3xl p-6 lg:p-8">
            <div className="lg:col-span-5 space-y-5 text-left">
              <div className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-blue-50/50 border border-[#292e91]/15 text-[10px] text-[#292e91] font-semibold w-fit">
                <Sparkles size={11} />
                BACK-OFFICE AUTOMATION
              </div>
              <h3 className="text-xl font-bold text-slate-800 font-lexend">
                Finance & OCR Agent: สแกน ตรวจสอบ และบันทึกบัญชีอัจฉริยะ
              </h3>
              <p className="text-sm text-slate-550 leading-relaxed">
                ทลายขีดจำกัดการคีย์เอกสารทางการเงิน ด้วย AI OCR ที่มีประสิทธิภาพสูง แปลงไฟล์บิลซื้อ เอกสารค่าใช้จ่าย เข้าเป็นโครงสร้างข้อมูลมาตรฐาน พร้อมลงบันทึกในสมุดรายวันแยกประเภทและจัดคู่ยอดโอนเข้าบัญชีทันทีเมื่อเงินผ่านธนาคาร
              </p>
              <ul className="space-y-2.5 text-sm text-slate-600">
                <li className="flex gap-2">
                  <span className="text-[#4ca9df] font-bold">•</span>
                  <span>ความแม่นยำสูง ดึงข้อมูลชื่อร้านค้า เลขผู้เสียภาษี และรายละเอียดราคา</span>
                </li>
                <li className="flex gap-2">
                  <span className="text-[#4ca9df] font-bold">•</span>
                  <span>จับคู่รายการเดินบัญชี (Reconciliation) แบบเรียลไทม์ลดความล่าช้า</span>
                </li>
              </ul>
            </div>
            <div className="lg:col-span-7">
              <OcrSimulation />
            </div>
          </div>

        </div>
      </section>

      {/* 5. ENTERPRISE-GRADE ARCHITECTURE & PRIVACY */}
      <section className="py-20 md:py-28 bg-white border-b border-slate-100" id="architecture">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-12 items-center">
            
            <div className="lg:col-span-6 space-y-6 text-left">
              <div className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-blue-50/50 border border-[#292e91]/15 text-[10px] text-[#292e91] font-semibold w-fit">
                <ShieldCheck size={12} />
                ENTERPRISE SECURITY & PRIVACY
              </div>
              <h2 className="text-2xl md:text-3xl font-extrabold text-slate-900 font-lexend leading-snug">
                โครงสร้างระบบระดับสากลและนโยบายความเป็นส่วนตัวสูงสุด
              </h2>
              <p className="text-sm text-slate-550 leading-relaxed">
                PERPOS ถูกพัฒนาขึ้นบนสถาปัตยกรรมไร้เซิร์ฟเวอร์ (Serverless Microservices Architecture) ร่วมกับฐานข้อมูลระดับองค์กร Supabase (PostgreSQL) พร้อมด้วยระบบ RLS (Row Level Security) เพื่อประสิทธิภาพ ความยืดหยุ่น และความปลอดภัยสูงสุดในการขยายตัวของธุรกิจ
              </p>

              <div className="space-y-4 pt-2">
                
                {/* Point 1 */}
                <div className="flex gap-4">
                  <div className="w-10 h-10 rounded-xl bg-slate-50 border border-slate-200 flex items-center justify-center shrink-0 text-[#292e91]">
                    <Lock size={18} />
                  </div>
                  <div>
                    <h4 className="text-sm font-bold text-slate-800">Enterprise Data Privacy Guaranteed</h4>
                    <p className="text-xs sm:text-sm text-slate-500 leading-relaxed mt-1">
                      ข้อมูลทางบัญชีและการค้าทั้งหมดจะถูกจัดเก็บแยกพาร์ทิชันเด็ดขาดใน Secure Database ข้อมูลการดำเนินธุรกิจของคุณจะไม่ถูกใช้เพื่อนำไปป้อนข้อมูลสำหรับฝึกโมเดลสาธารณะ (No training on public models)
                    </p>
                  </div>
                </div>

                {/* Point 2 */}
                <div className="flex gap-4">
                  <div className="w-10 h-10 rounded-xl bg-slate-50 border border-slate-200 flex items-center justify-center shrink-0 text-[#292e91]">
                    <Layers size={18} />
                  </div>
                  <div>
                    <h4 className="text-sm font-bold text-slate-800">Secure API Gateway Integrations</h4>
                    <p className="text-xs sm:text-sm text-slate-500 leading-relaxed mt-1">
                      เชื่อมต่ออย่างสมบูรณ์แบบปลอดภัยผ่าน Secure API Gateways ร่วมกับระบบดั้งเดิม (Legacy ERP), LINE Official Account สำหรับการส่งมอบเอกสารและแจ้งเตือน และ Google Workspace เพื่อจัดเก็บบิลและซิงค์งานนัดหมาย
                    </p>
                  </div>
                </div>

              </div>
            </div>

            {/* Visual graphics */}
            <div className="lg:col-span-6 bg-slate-900 border border-slate-800 rounded-3xl p-6 lg:p-8 space-y-6 relative overflow-hidden shadow-2xl">
              {/* Decorative glows */}
              <div className="absolute -top-12 -right-12 w-40 h-40 bg-[#292e91]/20 rounded-full blur-3xl pointer-events-none" />
              <div className="absolute -bottom-12 -left-12 w-40 h-40 bg-[#4ca9df]/10 rounded-full blur-3xl pointer-events-none" />

              <div className="flex items-center justify-between border-b border-slate-800/80 pb-4">
                <div className="flex items-center gap-3">
                  <div className="p-2 rounded-xl bg-blue-500/10 border border-blue-500/20 text-[#4ca9df]">
                    <Layers size={20} className="animate-pulse" />
                  </div>
                  <h4 className="text-xs font-bold text-white uppercase tracking-wider">Cloud Infrastructure & App Stack</h4>
                </div>
                <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-medium bg-blue-500/10 text-[#4ca9df] border border-blue-500/20">
                  Production-Ready
                </span>
              </div>

              <div className="grid grid-cols-1 gap-3.5 text-left">
                {/* Tech Item: Frontend */}
                <div className="group relative flex items-center justify-between p-4 rounded-2xl bg-slate-950/40 border border-slate-800/50 hover:border-[#4ca9df]/40 hover:bg-slate-950/80 transition-all duration-300 shadow-lg">
                  <div className="flex items-center gap-4">
                    <div className="p-2.5 rounded-xl bg-blue-600/10 text-blue-400 group-hover:bg-blue-600/20 group-hover:text-blue-300 transition-colors border border-blue-500/10">
                      <Globe size={18} />
                    </div>
                    <div>
                      <div className="text-[10px] text-slate-500 font-bold tracking-wider uppercase">Frontend Web App</div>
                      <div className="text-sm font-black text-slate-200 mt-0.5">Next.js 15 & React 19</div>
                    </div>
                  </div>
                  <span className="text-[10px] font-extrabold text-[#4ca9df] bg-blue-500/10 px-2.5 py-1 rounded-md border border-blue-500/25 uppercase tracking-wide group-hover:scale-105 transition-transform">
                    BFF App Router
                  </span>
                </div>

                {/* Tech Item: Database */}
                <div className="group relative flex items-center justify-between p-4 rounded-2xl bg-slate-950/40 border border-slate-800/50 hover:border-[#4ca9df]/40 hover:bg-slate-950/80 transition-all duration-300 shadow-lg">
                  <div className="flex items-center gap-4">
                    <div className="p-2.5 rounded-xl bg-emerald-600/10 text-emerald-400 group-hover:bg-emerald-600/20 group-hover:text-emerald-300 transition-colors border border-emerald-500/10">
                      <Database size={18} />
                    </div>
                    <div>
                      <div className="text-[10px] text-slate-500 font-bold tracking-wider uppercase">Database Engine</div>
                      <div className="text-sm font-black text-slate-200 mt-0.5">Supabase PostgreSQL</div>
                    </div>
                  </div>
                  <span className="text-[10px] font-extrabold text-[#10b981] bg-emerald-500/10 px-2.5 py-1 rounded-md border border-emerald-500/25 uppercase tracking-wide group-hover:scale-105 transition-transform">
                    RLS Active
                  </span>
                </div>

                {/* Tech Item: Vector */}
                <div className="group relative flex items-center justify-between p-4 rounded-2xl bg-slate-950/40 border border-slate-800/50 hover:border-[#4ca9df]/40 hover:bg-slate-950/80 transition-all duration-300 shadow-lg">
                  <div className="flex items-center gap-4">
                    <div className="p-2.5 rounded-xl bg-purple-600/10 text-purple-400 group-hover:bg-purple-600/20 group-hover:text-purple-300 transition-colors border border-purple-500/10">
                      <Cpu size={18} />
                    </div>
                    <div>
                      <div className="text-[10px] text-slate-500 font-bold tracking-wider uppercase">Vector Embedding Engine</div>
                      <div className="text-sm font-black text-slate-200 mt-0.5">pgvector Extension</div>
                    </div>
                  </div>
                  <span className="text-[10px] font-extrabold text-[#c084fc] bg-purple-500/10 px-2.5 py-1 rounded-md border border-purple-500/25 uppercase tracking-wide group-hover:scale-105 transition-transform">
                    AI Memory
                  </span>
                </div>

                {/* Tech Item: Cloud Run */}
                <div className="group relative flex items-center justify-between p-4 rounded-2xl bg-slate-950/40 border border-slate-800/50 hover:border-[#4ca9df]/40 hover:bg-slate-950/80 transition-all duration-300 shadow-lg">
                  <div className="flex items-center gap-4">
                    <div className="p-2.5 rounded-xl bg-cyan-600/10 text-cyan-400 group-hover:bg-cyan-600/20 group-hover:text-cyan-300 transition-colors border border-cyan-500/10">
                      <Server size={18} />
                    </div>
                    <div>
                      <div className="text-[10px] text-slate-500 font-bold tracking-wider uppercase">Serverless Workers</div>
                      <div className="text-sm font-black text-slate-200 mt-0.5">Google Cloud Run</div>
                    </div>
                  </div>
                  <span className="text-[10px] font-extrabold text-[#22d3ee] bg-cyan-500/10 px-2.5 py-1 rounded-md border border-cyan-500/25 uppercase tracking-wide group-hover:scale-105 transition-transform">
                    Auto-Scale
                  </span>
                </div>

                {/* Tech Item: Cron */}
                <div className="group relative flex items-center justify-between p-4 rounded-2xl bg-slate-950/40 border border-slate-800/50 hover:border-[#4ca9df]/40 hover:bg-slate-950/80 transition-all duration-300 shadow-lg">
                  <div className="flex items-center gap-4">
                    <div className="p-2.5 rounded-xl bg-amber-600/10 text-amber-400 group-hover:bg-amber-600/20 group-hover:text-amber-300 transition-colors border border-amber-500/10">
                      <Clock size={18} />
                    </div>
                    <div>
                      <div className="text-[10px] text-slate-500 font-bold tracking-wider uppercase">Cron Schedules</div>
                      <div className="text-sm font-black text-slate-200 mt-0.5">Google Cloud Scheduler</div>
                    </div>
                  </div>
                  <span className="text-[10px] font-extrabold text-[#fbbf24] bg-amber-500/10 px-2.5 py-1 rounded-md border border-amber-500/25 uppercase tracking-wide group-hover:scale-105 transition-transform">
                    1-Min Interval
                  </span>
                </div>
              </div>
            </div>

          </div>
        </div>
      </section>

      {/* 6. REVENUE & ENGAGEMENT MODEL */}
      <section className="py-20 md:py-28 bg-slate-50/30 border-b border-slate-100" id="model">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          
          <div className="text-center max-w-3xl mx-auto space-y-3 mb-16">
            <h2 className="text-2xl md:text-3xl font-extrabold text-slate-900 font-lexend">
              โมเดลการประหยัดต้นทุนและความเป็นพันธมิตร
            </h2>
            <p className="text-base text-slate-550 leading-relaxed">
              ไม่มีค่าสิทธิ์รายผู้ใช้รายปีที่ไม่ได้ถูกใช้งานจริง ปรับงบประมาณตามกิจกรรมธุรกิจด้วยโมเดลแบบคิดค่าบริการประมวลผลจริงตามธุรกรรม
            </p>
          </div>

          {/* Cost Simulator component */}
          <CostSimulator />

          {/* Tech Partner Roadmap */}
          <div className="mt-20 space-y-10" id="contact">
            <div className="text-center space-y-2">
              <h3 className="text-lg font-bold text-slate-800 font-lexend">Tech Partner Engagement Roadmap</h3>
              <p className="text-sm text-slate-500">แผนขั้นตอนการร่วมพัฒนา ติดตั้ง และเชื่อมโยงกระแสงานร่วมกับผู้เชี่ยวชาญเทคโนโลยีของเรา</p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-6 relative text-left">
              {/* Step 1 */}
              <div className="bg-white border border-slate-200 rounded-2xl p-6 space-y-4 shadow-sm">
                <div className="w-8 h-8 rounded-lg bg-blue-50/50 border border-[#292e91]/15 flex items-center justify-center text-[#292e91] font-bold text-xs font-mono">
                  01
                </div>
                <h4 className="text-sm font-bold text-slate-800 uppercase tracking-wider">Phase 1: Flow Audit & AI Mapping</h4>
                <p className="text-xs sm:text-sm text-slate-600 leading-relaxed">
                  ทีมผู้เชี่ยวชาญเทคโนโลยีของเราจะประเมินกระแสข้อมูลในธุรกิจเดิมของท่าน ค้นหารอยรั่วไหล และทำแผนวางระบบ AI Agents เชื่อมต่อกับแผนกต่างๆ
                </p>
              </div>

              {/* Step 2 */}
              <div className="bg-white border border-slate-200 rounded-2xl p-6 space-y-4 shadow-sm">
                <div className="w-8 h-8 rounded-lg bg-blue-50/50 border border-[#292e91]/15 flex items-center justify-center text-[#292e91] font-bold text-xs font-mono">
                  02
                </div>
                <h4 className="text-sm font-bold text-slate-800 uppercase tracking-wider">Phase 2: Hybrid Integration</h4>
                <p className="text-xs sm:text-sm text-slate-600 leading-relaxed">
                  เชื่อมต่อระบบ ERP ฐานข้อมูลเก่าเข้ากับ AI Ready Layer บน Supabase Cloud และทดสอบระบบการทำงานของ AI Agents ควบคู่เพื่อไม่ให้สะดุด
                </p>
              </div>

              {/* Step 3 */}
              <div className="bg-white border border-slate-200 rounded-2xl p-6 space-y-4 shadow-sm">
                <div className="w-8 h-8 rounded-lg bg-blue-50/50 border border-[#292e91]/15 flex items-center justify-center text-[#292e91] font-bold text-xs font-mono">
                  03
                </div>
                <h4 className="text-sm font-bold text-slate-800 uppercase tracking-wider">Phase 3: Continuous Intelligence</h4>
                <p className="text-xs sm:text-sm text-slate-600 leading-relaxed">
                  ระบบส่งมอบรายงานแบบกระชับ รัน What-If Scenario จำลองกระแสเงินสด เพื่อการตัดสินใจและจัดการคลังอย่างเฉียบขาดในแบบเรียลไทม์
                </p>
              </div>
            </div>
          </div>

        </div>
      </section>

      {/* 7. BOTTOM CTA SECTION */}
      <section className="py-24 bg-gradient-to-br from-blue-50 via-white to-cyan-50/30 text-center border-b border-slate-200">
        <div className="mx-auto max-w-4xl px-4 sm:px-6 lg:px-8 relative z-10 space-y-6">
          <h2 className="text-2xl md:text-3xl font-black font-lexend text-slate-900 leading-tight">
            ทลายคอขวดองค์กร ด้วย Agentic AI ERP
          </h2>
          <p className="text-base text-slate-650 max-w-lg mx-auto leading-relaxed">
            ยกระดับจากระบบบันทึกแบบเดิม สู่ระบบประมวลผลเชิงปฏิบัติการที่คอยตรวจจับ วิ่งงาน และสรุปวิเคราะห์ข้อมูลให้ท่านแบบเรียลไทม์ 24 ชั่วโมง
          </p>
          <div className="flex flex-col sm:flex-row gap-4 justify-center pt-4">
            <button
              onClick={() => setIsModalOpen(true)}
              className="flex items-center justify-center gap-2 rounded-xl bg-brand-gradient hover:opacity-90 text-white font-bold text-sm px-8 py-3.5 transition-all shadow-[0_4px_12px_rgba(41,46,145,0.25)] duration-300 hover:shadow-[0_6px_16px_rgba(41,46,145,0.3)]"
            >
              Request Enterprise Demo
              <ArrowRight size={16} />
            </button>

          </div>
        </div>
      </section>

      {/* FOOTER */}
      <footer className="border-t border-slate-200/80 bg-slate-50 py-12 text-center md:text-left">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-8">
            <div className="md:col-span-2 space-y-4">
              <img src="/logo.svg" alt="PERPOS" className="h-8 w-auto mx-auto md:mx-0" />
              <p className="text-base text-slate-550 max-w-md leading-relaxed mx-auto md:mx-0">
                Next-Gen Agentic AI ERP — Tailored to Empower Your Business Flow.
                ระบบบัญชีและ ERP สำหรับธุรกิจ SME ยุคใหม่ ปฏิบัติงานเชิงรุกด้วย AI Agents แบบ Real-time
              </p>
            </div>
            <div>
              <h4 className="text-sm font-bold text-slate-800 uppercase tracking-wider">เอกสาร</h4>
              <ul className="mt-4 space-y-2 text-sm text-slate-500">
                <li>
                  <Link href="/privacy" className="hover:text-[#292e91] transition-colors">
                    นโยบายความเป็นส่วนตัว
                  </Link>
                </li>
                <li>
                  <Link href="/terms" className="hover:text-[#292e91] transition-colors">
                    ข้อกำหนดการให้บริการ
                  </Link>
                </li>
              </ul>
            </div>
            <div>
              <h4 className="text-sm font-bold text-slate-800 uppercase tracking-wider">การเชื่อมต่อ</h4>
              <ul className="mt-4 space-y-2 text-sm text-slate-500">
                <li>LINE OA</li>
                <li>Google Workspace</li>
                <li>Supabase Cloud</li>
              </ul>
            </div>
          </div>
          <div className="mt-12 border-t border-slate-200/60 pt-8 flex flex-col sm:flex-row items-center justify-between text-sm text-slate-400">
            <div>© 2026 P2P Solutions. All Rights Reserved.</div>
            <div className="mt-4 sm:mt-0 flex gap-6">
              <span className="text-slate-400/80">Enterprise Cloud Hosting</span>
            </div>
          </div>
        </div>
      </footer>

      {/* DEMO REQUEST MODAL */}
      {isModalOpen && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-fade-in">
          <div className="bg-white rounded-3xl border border-slate-200 shadow-xl w-full max-w-md overflow-hidden animate-scale-up text-left flex flex-col">
            {/* Header */}
            <div className="px-6 py-5 border-b border-slate-100 flex justify-between items-start">
              <div>
                <h3 className="text-lg font-bold text-slate-900 font-lexend">ขอสาธิตการใช้งาน PERPOS</h3>
                <p className="text-xs text-slate-500 mt-1">กรอกรายละเอียดเพื่อให้ทีมงานติดต่อกลับแนะนำระบบสาธิต</p>
              </div>
              <button
                onClick={() => {
                  setIsModalOpen(false);
                  setSubmitStatus("idle");
                  setFormState({ name: "", company: "", email: "", phone: "", details: "" });
                }}
                className="text-slate-400 hover:text-slate-600 rounded-lg p-1 hover:bg-slate-50 transition-colors"
              >
                <X size={18} />
              </button>
            </div>

            {submitStatus === "success" ? (
              <div className="p-8 text-center flex flex-col items-center justify-center space-y-4">
                <div className="w-16 h-16 rounded-full bg-emerald-50 border border-emerald-100 flex items-center justify-center text-emerald-500 animate-bounce mx-auto">
                  <CheckCircle2 size={32} />
                </div>
                <h4 className="text-lg font-bold text-slate-900 font-lexend">ส่งข้อมูลสำเร็จแล้ว!</h4>
                <p className="text-sm text-slate-655 leading-relaxed max-w-xs mx-auto text-slate-600">
                  ระบบได้บันทึกคำขอของคุณและเปิดโปรแกรมอีเมลของคุณเพื่อส่งข้อมูลแจ้งเตือนไปยัง <strong className="text-slate-800">admin@perpos.io</strong> เรียบร้อยแล้ว ทีมงานของเราจะติดต่อกลับภายใน 24 ชั่วโมง
                </p>
                <button
                  onClick={() => {
                    setIsModalOpen(false);
                    setSubmitStatus("idle");
                    setFormState({ name: "", company: "", email: "", phone: "", details: "" });
                  }}
                  className="w-full max-w-xs mt-4 rounded-xl bg-brand-gradient hover:opacity-90 text-white font-bold text-sm py-3 transition-all shadow-md mx-auto duration-300"
                >
                  ตกลง
                </button>
              </div>
            ) : (
              <form onSubmit={handleFormSubmit} className="p-6 space-y-4">
                {/* Name */}
                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-slate-700 block">ชื่อผู้ติดต่อ *</label>
                  <input
                    type="text"
                    required
                    placeholder="เช่น สมชาย ใจดี"
                    value={formState.name}
                    onChange={(e) => setFormState({ ...formState, name: e.target.value })}
                    className="w-full rounded-xl border border-slate-200 bg-slate-50/50 px-3.5 py-2.5 text-sm text-slate-800 placeholder-slate-400 outline-none focus:border-[#292e91] focus:bg-white transition-colors"
                  />
                </div>

                {/* Company */}
                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-slate-700 block">ชื่อบริษัท / องค์กร *</label>
                  <input
                    type="text"
                    required
                    placeholder="เช่น บริษัท เอ็มเอสอี จำกัด"
                    value={formState.company}
                    onChange={(e) => setFormState({ ...formState, company: e.target.value })}
                    className="w-full rounded-xl border border-slate-200 bg-slate-50/50 px-3.5 py-2.5 text-sm text-slate-800 placeholder-slate-400 outline-none focus:border-[#292e91] focus:bg-white transition-colors"
                  />
                </div>

                {/* Grid for Email & Phone */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <label className="text-xs font-bold text-slate-700 block">อีเมลผู้ติดต่อ *</label>
                    <input
                      type="email"
                      required
                      placeholder="you@example.com"
                      value={formState.email}
                      onChange={(e) => setFormState({ ...formState, email: e.target.value })}
                      className="w-full rounded-xl border border-slate-200 bg-slate-50/50 px-3.5 py-2.5 text-sm text-slate-800 placeholder-slate-400 outline-none focus:border-[#292e91] focus:bg-white transition-colors"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-xs font-bold text-slate-700 block">เบอร์โทรศัพท์ *</label>
                    <input
                      type="tel"
                      required
                      placeholder="081-234-5678"
                      value={formState.phone}
                      onChange={(e) => setFormState({ ...formState, phone: e.target.value })}
                      className="w-full rounded-xl border border-slate-200 bg-slate-50/50 px-3.5 py-2.5 text-sm text-slate-800 placeholder-slate-400 outline-none focus:border-[#292e91] focus:bg-white transition-colors"
                    />
                  </div>
                </div>

                {/* Details */}
                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-slate-700 block">รายละเอียดเพิ่มเติม / ข้อความ</label>
                  <textarea
                    rows={3}
                    placeholder="ความต้องการพิเศษของธุรกิจ หรือโมดูล AI ที่สนใจทดลองใช้เป็นพิเศษ..."
                    value={formState.details}
                    onChange={(e) => setFormState({ ...formState, details: e.target.value })}
                    className="w-full rounded-xl border border-slate-200 bg-slate-50/50 px-3.5 py-2.5 text-sm text-slate-800 placeholder-slate-400 outline-none focus:border-[#292e91] focus:bg-white transition-colors resize-none"
                  />
                </div>

                {/* Actions */}
                <div className="pt-2 flex gap-3">
                  <button
                    type="button"
                    onClick={() => {
                      setIsModalOpen(false);
                      setFormState({ name: "", company: "", email: "", phone: "", details: "" });
                    }}
                    className="w-1/3 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 font-bold text-sm py-3 transition-colors font-sans"
                  >
                    ยกเลิก
                  </button>
                  <button
                    type="submit"
                    disabled={submitStatus === "loading"}
                    className="w-2/3 flex items-center justify-center gap-2 rounded-xl bg-brand-gradient hover:opacity-90 text-white font-bold text-sm py-3 transition-all shadow-md disabled:opacity-70 font-sans duration-300 hover:shadow-lg"
                  >
                    {submitStatus === "loading" ? (
                      <>
                        <div className="w-4 h-4 rounded-full border-2 border-white/20 border-t-white animate-spin" />
                        <span>กำลังส่ง...</span>
                      </>
                    ) : (
                      <span>ส่งข้อมูลขอสาธิตระบบ</span>
                    )}
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>
      )}

      {/* STYLE ANIMATIONS */}
      <style dangerouslySetInnerHTML={{ __html: `
        @keyframes fadeIn {
          from { opacity: 0; }
          to { opacity: 1; }
        }
        @keyframes scaleUp {
          from { opacity: 0; transform: scale(0.95); }
          to { opacity: 1; transform: scale(1); }
        }
        .animate-fade-in {
          animation: fadeIn 0.25s ease-out forwards;
        }
        .animate-scale-up {
          animation: scaleUp 0.3s cubic-bezier(0.16, 1, 0.3, 1) forwards;
        }
      ` }} />

    </div>
  );
}
