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
  CheckCircle2
} from "lucide-react";
import ChatTerminal from "./chat-terminal";
import OcrSimulation from "./ocr-simulation";
import AgentNetwork from "./agent-network";
import CostSimulator from "./cost-simulator";

const APP_SIGNIN_URL = "https://app.perpos.io/signin";

export default function LandingPage() {
  const [isScrolled, setIsScrolled] = useState(false);
  const [isVisible, setIsVisible] = useState(true);
  const [isModalOpen, setIsModalOpen] = useState(false);
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
            <a href="#features" className="hover:text-[#292e91] transition-colors">AI Agents</a>
            <a href="#shift" className="hover:text-[#292e91] transition-colors">The Shift</a>
            <a href="#architecture" className="hover:text-[#292e91] transition-colors">Architecture</a>
            <a href="#model" className="hover:text-[#292e91] transition-colors">Pricing</a>
          </nav>
          <div className="flex items-center gap-4">
            <a
              href={APP_SIGNIN_URL}
              className="rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 shadow-sm hover:bg-slate-50 transition-colors"
            >
              เข้าสู่ระบบ
            </a>
            <button
              onClick={() => setIsModalOpen(true)}
              className="hidden sm:inline-flex items-center justify-center rounded-lg bg-brand-gradient hover:opacity-90 px-4 py-2 text-sm font-semibold text-white transition-all shadow-sm duration-300 hover:shadow-md"
            >
              Request Demo
            </button>
          </div>
        </div>
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
                <Sparkles size={14} className="bg-brand-gradient bg-clip-text text-transparent" />
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
              ERP แบบเดิมเพียงทําหน้าที่จดบันทึกประวัติสิ่งที่ล่วงเลยไปแล้ว (System of Record) ทำให้เกิดคอขวดที่พนักงานต้องมาคอยพิมพ์งานซ้ำซาก แต่ PERPOS คือ &ldquo;System of Action&rdquo; ที่ระบบประมวลผลวิเคราะห์และเริ่มทำงานโดยอัตโนมัติ
            </p>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 items-stretch">
            
            {/* The Old Way */}
            <div className="bg-slate-50/50 border border-slate-100 rounded-3xl p-6 lg:p-8 flex flex-col justify-between space-y-6 text-left">
              <div className="space-y-4">
                <div className="w-10 h-10 rounded-xl bg-slate-100 border border-slate-200 flex items-center justify-center text-slate-400">
                  <ShieldCheck size={20} />
                </div>
                <h3 className="text-lg font-bold text-slate-500">แบบเดิม: System of Record</h3>
                <p className="text-sm text-slate-500 leading-relaxed">
                  พนักงานเสียเวลาหลายชั่วโมงไปกับการพิมพ์คีย์ใบเสนอราคา บันทึกข้อมูลซื้อขาย หรือต้องคอยเดินเอกสารอนุมัติทางบัญชีด้วยตัวเอง มีความเฉื่อยของข้อมูล (Data Lag) สูงกว่าจะรับรู้ข้อมูลผลกำไรมักช้าไปหลายสัปดาห์
                </p>
              </div>
              <div className="border-t border-slate-150 pt-4 space-y-2 text-sm text-slate-500">
                <div className="flex gap-2">❌ ต้องคีย์ใบสั่งซื้อ ยอดขาย และลงบัญชีแยกแผนกด้วยมือ</div>
                <div className="flex gap-2">❌ สต๊อกสินค้าขาดหรือล้นจากการขาดการพยากรณ์เชิงรุก</div>
                <div className="flex gap-2">❌ ผู้บริหารรับทราบข้อมูลการเงินช้าและเป็นอดีตเสมอ</div>
              </div>
            </div>

            {/* The PERPOS Way */}
            <div className="bg-gradient-to-br from-blue-50/30 via-white to-white border border-blue-200/60 rounded-3xl p-6 lg:p-8 flex flex-col justify-between space-y-6 shadow-sm text-left">
              <div className="space-y-4">
                <div className="w-10 h-10 rounded-xl bg-blue-50/50 border border-[#292e91]/15 flex items-center justify-center text-[#292e91]">
                  <Sparkles size={20} />
                </div>
                <h3 className="text-lg font-bold text-slate-800">ระบบ PERPOS: System of Action</h3>
                <p className="text-sm text-slate-600 leading-relaxed">
                  ระบบงานขับเคลื่อนเชิงรุกด้วย AI Agents ทั้ง 8 แผนก ทำการตรวจจับ สแกนใบเสร็จด้วย OCR และอัปเดตยอดคงเหลืออัตโนมัติ ส่งข้อมูลปิดบัญชีพร้อมแจ้งเตือนผู้บริหารทันทีเมื่อพบโอกาสหรือความเสี่ยงทางธุรกิจ
                </p>
              </div>
              <div className="border-t border-blue-150 pt-4 space-y-2 text-sm text-blue-750">
                <div className="flex gap-2">✓ เครือข่าย AI ดึงเอกสารใบแจ้งหนี้ คีย์แยกประเภท และลงบัญชีแบบอัตโนมัติ</div>
                <div className="flex gap-2">✓ ทำนายปริมาณของเข้าออกสต๊อก ป้องกันของขาด (Auto-Replenishment)</div>
                <div className="flex gap-2">✓ สรุป Insights ทันใจด้วยผู้ช่วยบริหารแชตตอบกลับใน 3 วินาที</div>
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
            <div className="lg:col-span-6 bg-slate-50 border border-slate-200 rounded-3xl p-6 lg:p-8 space-y-6">
              <div className="flex items-center gap-3 border-b border-slate-200 pb-4">
                <Server className="text-[#292e91]" size={20} />
                <h4 className="text-xs font-bold text-slate-800 uppercase tracking-wider">Cloud Infrastructure Stack</h4>
              </div>

              <div className="space-y-3.5 text-sm text-left">
                {/* Tech Item 1 */}
                <div className="flex items-center justify-between p-3 rounded-xl bg-white border border-slate-100 shadow-sm">
                  <div className="flex items-center gap-3">
                    <span className="w-2 h-2 rounded-full bg-[#292e91]" />
                    <span className="text-slate-700">Database Engine</span>
                  </div>
                  <span className="text-xs text-slate-550 font-semibold font-mono">Supabase PostgreSQL (RLS Active)</span>
                </div>
                {/* Tech Item 2 */}
                <div className="flex items-center justify-between p-3 rounded-xl bg-white border border-slate-100 shadow-sm">
                  <div className="flex items-center gap-3">
                    <span className="w-2 h-2 rounded-full bg-[#292e91]" />
                    <span className="text-slate-700">Vector Embedding Engine</span>
                  </div>
                  <span className="text-xs text-slate-550 font-semibold font-mono">pgvector for Long-Term AI Memory</span>
                </div>
                {/* Tech Item 3 */}
                <div className="flex items-center justify-between p-3 rounded-xl bg-white border border-slate-100 shadow-sm">
                  <div className="flex items-center gap-3">
                    <span className="w-2 h-2 rounded-full bg-[#292e91]" />
                    <span className="text-slate-700">Serverless Microservice Workers</span>
                  </div>
                  <span className="text-xs text-slate-550 font-semibold font-mono">Google Cloud Run (Pay-as-you-go Scale)</span>
                </div>
                {/* Tech Item 4 */}
                <div className="flex items-center justify-between p-3 rounded-xl bg-white border border-slate-100 shadow-sm">
                  <div className="flex items-center gap-3">
                    <span className="w-2 h-2 rounded-full bg-[#292e91]" />
                    <span className="text-slate-700">Notification cron schedules</span>
                  </div>
                  <span className="text-xs text-slate-550 font-semibold font-mono">Google Cloud Scheduler (Every Minute)</span>
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
      <footer className="border-t border-slate-200/80 bg-slate-50 py-12 text-left">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-8">
            <div className="md:col-span-2 space-y-4">
              <img src="/logo.svg" alt="PERPOS" className="h-8 w-auto" />
              <p className="text-base text-slate-550 max-w-md leading-relaxed">
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
