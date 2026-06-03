"use client";

import React, { useState, useEffect } from "react";
import Link from "next/link";
import {
  ArrowLeft,
  Sparkles,
  CheckCircle2,
  X,
  ArrowRight,
  TrendingUp,
  Cpu,
  Layers,
  FileText,
  Clock,
  Play,
  MessageSquare,
  Target,
  ShoppingCart,
  Receipt,
  Users,
  Truck,
  Sliders,
  Menu,
  Globe
} from "lucide-react";

import { useLanguage } from "./language-context";
import { translations, MENU_AGENTS_TRANSLATED, AGENTS_DETAILS_TRANSLATED } from "./locales";

// Import all simulation widgets
import SalesWidget from "./agent-widgets/sales-widget";
import MarketingWidget from "./agent-widgets/marketing-widget";
import ProcurementWidget from "./agent-widgets/procurement-widget";
import FinanceWidget from "./agent-widgets/finance-widget";
import HRWidget from "./agent-widgets/hr-widget";
import AdminWidget from "./agent-widgets/admin-widget";
import ExecutiveWidget from "./agent-widgets/executive-widget";
import SimulatorWidget from "./agent-widgets/simulator-widget";

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

const widgetComponents: Record<string, React.ComponentType<any>> = {
  sales: SalesWidget,
  marketing: MarketingWidget,
  procurement: ProcurementWidget,
  finance: FinanceWidget,
  hr: HRWidget,
  admin: AdminWidget,
  executive: ExecutiveWidget,
  simulator: SimulatorWidget,
};

interface AgentDetailsViewProps {
  slug: string;
}

export default function AgentDetailsView({ slug }: AgentDetailsViewProps) {
  const { lang, setLang } = useLanguage();
  const t = translations[lang];

  const detailsData = AGENTS_DETAILS_TRANSLATED[lang]?.[slug as keyof typeof AGENTS_DETAILS_TRANSLATED[typeof lang]];
  const agent = detailsData
    ? {
        ...detailsData,
        widgetComponent: widgetComponents[slug],
      }
    : null;

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
      const subject = lang === "th"
        ? `ขอสาธิตการใช้งาน PERPOS - ${formState.company} (ผ่าน ${agent?.title || slug})`
        : `Request Demo PERPOS - ${formState.company} (via ${agent?.title || slug})`;
      
      const body = lang === "th"
        ? `เรียน ทีมงาน PERPOS,\n\nมีความประสงค์ขอรับการสาธิตการใช้งานระบบ PERPOS ERP (Request Demo)\n\nรายละเอียดผู้ติดต่อ:\n- ชื่อผู้ติดต่อ: ${formState.name}\n- บริษัท/องค์กร: ${formState.company}\n- อีเมล: ${formState.email}\n- เบอร์โทรศัพท์: ${formState.phone}\n- โมดูล/เอเจนต์ที่สนใจ: ${agent?.title || slug}\n- ความต้องการเพิ่มเติม: ${formState.details || "ไม่มี"}\n\nขอแสดงความนับถือ,\n${formState.name}`
        : `Dear PERPOS Team,\n\nI would like to request a demo of the PERPOS ERP system.\n\nContact Details:\n- Name: ${formState.name}\n- Company/Organization: ${formState.company}\n- Email: ${formState.email}\n- Phone: ${formState.phone}\n- Interested Module/Agent: ${agent?.title || slug}\n- Additional Details: ${formState.details || "None"}\n\nBest Regards,\n${formState.name}`;
      
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

  const menuAgents = MENU_AGENTS.map((item) => {
    const matched = MENU_AGENTS_TRANSLATED[lang].find((m) => m.slug === item.slug);
    return {
      ...item,
      name: matched?.name || item.name,
      desc: matched?.desc || item.desc,
    };
  });

  if (!agent) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-white text-slate-800 p-4">
        <Cpu size={48} className="text-slate-350 animate-bounce mb-4" />
        <h1 className="text-xl font-bold">{t.nav.unfoundAgent}</h1>
        <Link href="/" className="mt-4 text-sm text-[#292e91] hover:underline font-bold">
          {t.nav.backToHome}
        </Link>
      </div>
    );
  }

  const Widget = agent.widgetComponent;

  return (
    <div className="bg-white text-slate-850 font-sans antialiased min-h-screen overflow-x-hidden selection:bg-blue-500 selection:text-white">
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
            <Link href="/" className="hover:text-[#292e91] transition-colors">{t.nav.home}</Link>
            {/* AI Agents Dropdown Menu */}
            <div className="relative group py-4">
              <button className="flex items-center gap-1 hover:text-[#292e91] transition-colors font-semibold cursor-pointer outline-none text-slate-600">
                {t.nav.aiAgents}
                <svg className="w-4 h-4 transition-transform duration-200 group-hover:rotate-180" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                </svg>
              </button>
              
              {/* Dropdown Container */}
              <div className="absolute top-[85%] left-1/2 -translate-x-1/2 w-[580px] bg-white/95 backdrop-blur-md border border-slate-200/80 rounded-2xl shadow-xl opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all duration-200 z-50 p-3.5 grid grid-cols-2 gap-2 origin-top mt-2">
                {menuAgents.map((item) => (
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
          </nav>
          <div className="flex items-center gap-2 sm:gap-4">
            <button
              onClick={() => setLang(lang === "th" ? "en" : "th")}
              className="flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 sm:px-3 sm:py-2 text-xs sm:text-sm font-semibold text-slate-600 hover:bg-slate-50 transition-colors shadow-sm cursor-pointer"
              aria-label="Toggle Language"
            >
              <Globe size={15} className="text-slate-400" />
              <span className="uppercase">{lang === "th" ? "en" : "th"}</span>
            </button>

            <a
              href={APP_SIGNIN_URL}
              className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 sm:px-4 sm:py-2 text-xs sm:text-sm font-semibold text-slate-700 shadow-sm hover:bg-slate-50 transition-colors"
            >
              {t.nav.login}
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
              className="hidden sm:inline-flex items-center justify-center rounded-lg bg-brand-gradient hover:opacity-90 px-4 py-2 text-sm font-bold text-white shadow transition-all duration-300 cursor-pointer"
            >
              {t.nav.demo}
            </button>
          </div>
        </div>

        {/* Mobile Menu Panel */}
        {isMobileMenuOpen && (
          <div className="md:hidden fixed inset-x-0 top-[68px] bg-white border-b border-slate-200 shadow-lg z-40 p-4 max-h-[calc(100vh-68px)] overflow-y-auto animate-fade-in text-left">
            <div className="flex flex-col gap-4 text-sm font-semibold text-slate-700">
              <Link href="/" onClick={() => setIsMobileMenuOpen(false)} className="hover:text-[#292e91] py-2 border-b border-slate-100">{t.nav.home}</Link>
              <Link href="/#features" onClick={() => setIsMobileMenuOpen(false)} className="hover:text-[#292e91] py-2 border-b border-slate-100">{t.nav.allAgents}</Link>
              <Link href="/#shift" onClick={() => setIsMobileMenuOpen(false)} className="hover:text-[#292e91] py-2 border-b border-slate-100">{t.nav.theShift}</Link>
              <Link href="/#architecture" onClick={() => setIsMobileMenuOpen(false)} className="hover:text-[#292e91] py-2 border-b border-slate-100">{t.nav.architecture}</Link>
              <Link href="/#model" onClick={() => setIsMobileMenuOpen(false)} className="hover:text-[#292e91] py-2 border-b border-slate-100">{t.nav.pricing}</Link>
              
              <div className="pt-2">
                <div className="text-xs text-slate-400 font-bold uppercase tracking-wider mb-2">{t.nav.deepDive}</div>
                <div className="grid grid-cols-1 gap-2 pl-2">
                  {menuAgents.map((item) => (
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
              
              <div className="flex flex-col gap-2 pt-2 border-t border-slate-100">
                <button
                  onClick={() => setLang(lang === "th" ? "en" : "th")}
                  className="flex items-center justify-center gap-1.5 rounded-xl border border-slate-200 bg-white py-3 text-sm font-bold text-slate-700 shadow-sm hover:bg-slate-50 transition-colors"
                >
                  <Globe size={16} className="text-slate-400" />
                  <span className="uppercase">{lang === "th" ? "en" : "th"}</span>
                </button>

                <button
                  onClick={() => {
                    setIsMobileMenuOpen(false);
                    setIsModalOpen(true);
                  }}
                  className="w-full rounded-xl bg-brand-gradient hover:opacity-90 px-4 py-3 text-sm font-bold text-white shadow-md transition-all text-center"
                >
                  {t.nav.demo}
                </button>
              </div>
            </div>
          </div>
        )}
      </header>

      {/* MAIN CONTAINER */}
      <main className="pt-28 pb-20 px-4 sm:px-6 lg:px-8 max-w-7xl mx-auto">
        {/* Back Link */}
        <div className="mb-8">
          <Link
            href="/#features"
            className="inline-flex items-center gap-2 text-xs font-bold text-slate-500 hover:text-[#292e91] transition-colors"
          >
            <ArrowLeft size={14} />
            {t.agentDetailsView.backLink}
          </Link>
        </div>

        {/* Hero Meta Info */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-12 items-start">
          {/* Left Column: Details & Insights */}
          <div className="lg:col-span-7 space-y-8">
            <div className="space-y-3">
              <span className="text-xs uppercase tracking-wider font-bold text-blue-700 bg-blue-50 border border-blue-100 px-3 py-1 rounded-full inline-block">
                {agent.category}
              </span>
              <h1 className="text-3xl sm:text-4xl font-extrabold text-slate-900 tracking-tight leading-tight">
                {agent.title}
              </h1>
              <p className="text-base sm:text-lg text-emerald-600 font-bold flex items-center gap-2">
                <Sparkles size={16} />
                {agent.role} — {agent.metric}
              </p>
              <p className="text-slate-600 text-sm leading-relaxed max-w-2xl pt-2">
                {agent.description}
              </p>
            </div>

            {/* Core Features / Details */}
            <div className="border-t border-slate-100 pt-6 space-y-4">
              <h3 className="text-sm font-bold text-slate-800 uppercase tracking-wider">{t.agentDetailsView.automationHeader}</h3>
              <ul className="space-y-3">
                {agent.details.map((detail, idx) => (
                  <li key={idx} className="flex gap-3 items-start text-sm text-slate-650 leading-relaxed">
                    <span className="w-2 h-2 rounded-full bg-blue-500 shrink-0 mt-2" />
                    <span>{detail}</span>
                  </li>
                ))}
              </ul>
            </div>

            {/* Behind the Scenes Flowchart/Workflow */}
            <div className="border-t border-slate-100 pt-6 space-y-4">
              <h3 className="text-sm font-bold text-slate-800 uppercase tracking-wider">{t.agentDetailsView.workflowHeader}</h3>
              <div className="relative border-l border-blue-100 ml-3 pl-6 space-y-6">
                {agent.workflow.map((flow, idx) => (
                  <div key={idx} className="relative">
                    {/* Node Dot */}
                    <div className="absolute -left-[36px] top-0.5 w-6 h-6 rounded-full bg-blue-50 border-2 border-blue-500 flex items-center justify-center text-xs font-bold text-blue-600 shadow-sm">
                      {idx + 1}
                    </div>
                    <p className="text-sm text-slate-650 leading-relaxed font-medium">
                      {flow}
                    </p>
                  </div>
                ))}
              </div>
            </div>

            {/* Business Impact Metrics / ROI */}
            <div className="border-t border-slate-100 pt-6 space-y-4">
              <h3 className="text-sm font-bold text-slate-800 uppercase tracking-wider flex items-center gap-2">
                <TrendingUp size={16} className="text-[#292e91]" />
                {t.agentDetailsView.roiHeader}
              </h3>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                {agent.roi.map((item, idx) => (
                  <div key={idx} className="bg-slate-50 border border-slate-200/60 rounded-2xl p-5 sm:p-6 space-y-1.5">
                    <div className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">{item.label}</div>
                    <div className="text-base font-black text-[#292e91]">{item.value}</div>
                    <div className="text-[10.5px] text-slate-550 leading-normal">{item.desc}</div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Right Column: Live Simulation Widget */}
          <div className="lg:col-span-5 space-y-6">
            <div className="bg-slate-50 border border-slate-200/80 rounded-3xl p-5 md:p-6 space-y-4">
              <div className="space-y-1">
                <h3 className="text-sm font-bold text-slate-800 flex items-center gap-1.5">
                  <Play size={14} className="text-blue-600 fill-blue-600" />
                  {t.agentDetailsView.simulationHeader}
                </h3>
                <p className="text-xs text-slate-500">
                  {t.agentDetailsView.simulationSub.replace("{title}", agent.title)}
                </p>
              </div>

              {/* The Live Widget */}
              <Widget />
            </div>

            {/* Bottom CTA Card */}
            <div className="bg-brand-gradient text-white rounded-3xl p-6 shadow-lg text-center space-y-4 relative overflow-hidden">
              {/* Decorative light effect */}
              <div className="absolute -top-12 -left-12 w-32 h-32 rounded-full bg-white/10 blur-xl pointer-events-none" />
              <div className="absolute -bottom-12 -right-12 w-32 h-32 rounded-full bg-white/10 blur-xl pointer-events-none" />

              <h4 className="text-base font-bold">{t.agentDetailsView.ctaHeader}</h4>
              <p className="text-xs text-blue-100 leading-relaxed max-w-sm mx-auto">
                {t.agentDetailsView.ctaSub}
              </p>
              <div className="pt-2">
                <button
                  onClick={() => setIsModalOpen(true)}
                  className="w-full bg-white hover:bg-slate-50 text-indigo-700 font-bold text-sm py-3 px-6 rounded-xl transition-colors cursor-pointer shadow-md inline-flex items-center justify-center gap-2"
                >
                  {t.agentDetailsView.ctaBtn}
                  <ArrowRight size={16} />
                </button>
              </div>
            </div>
          </div>
        </div>
      </main>

      {/* FOOTER */}
      <footer className="border-t border-slate-200/80 bg-slate-50 py-12 text-center md:text-left">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-8">
            <div className="md:col-span-2 space-y-4">
              <img src="/logo.svg" alt="PERPOS" className="h-8 w-auto mx-auto md:mx-0" />
              <p className="text-base text-slate-550 max-w-md leading-relaxed mx-auto md:mx-0">
                {t.footer.desc}
              </p>
            </div>
            <div>
              <h4 className="text-sm font-bold text-slate-800 uppercase tracking-wider">{t.footer.docs}</h4>
              <ul className="mt-4 space-y-2 text-sm text-slate-500">
                <li>
                  <Link href="/privacy" className="hover:text-[#292e91] transition-colors">
                    {t.footer.privacy}
                  </Link>
                </li>
                <li>
                  <Link href="/terms" className="hover:text-[#292e91] transition-colors">
                    {t.footer.terms}
                  </Link>
                </li>
              </ul>
            </div>
            <div>
              <h4 className="text-sm font-bold text-slate-800 uppercase tracking-wider">{t.footer.connections}</h4>
              <ul className="mt-4 space-y-2 text-sm text-slate-500">
                <li>LINE OA</li>
                <li>Google Workspace</li>
                <li>Supabase Cloud</li>
              </ul>
            </div>
          </div>
          <div className="mt-12 border-t border-slate-200/60 pt-8 flex flex-col sm:flex-row items-center justify-between text-sm text-slate-400">
            <div>{t.footer.rights}</div>
            <div className="mt-4 sm:mt-0 flex gap-6">
              <span className="text-slate-400/80 whitespace-nowrap">{t.footer.hosting}</span>
            </div>
          </div>
        </div>
      </footer>

      {/* REQUEST DEMO MODAL */}
      {isModalOpen && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-fade-in">
          <div className="bg-white rounded-3xl border border-slate-200 shadow-xl w-full max-w-md overflow-hidden animate-scale-up text-left flex flex-col">
            {/* Header */}
            <div className="px-6 py-5 border-b border-slate-100 flex justify-between items-start">
              <div>
                <h3 className="text-lg font-bold text-slate-900">{t.demoModal.title}</h3>
                <p className="text-xs text-slate-500 mt-1">{t.demoModal.sub}</p>
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
                <h4 className="text-lg font-bold text-slate-900">{t.demoModal.successTitle}</h4>
                <p className="text-sm text-slate-600 leading-relaxed max-w-xs mx-auto">
                  {t.demoModal.successDesc}
                </p>
                <button
                  onClick={() => {
                    setIsModalOpen(false);
                    setSubmitStatus("idle");
                    setFormState({ name: "", company: "", email: "", phone: "", details: "" });
                  }}
                  className="w-full max-w-xs mt-4 rounded-xl bg-brand-gradient hover:opacity-90 text-white font-bold text-sm py-3 transition-all shadow-md mx-auto duration-300"
                >
                  {t.demoModal.ok}
                </button>
              </div>
            ) : (
              <form onSubmit={handleFormSubmit} className="p-6 space-y-4">
                {/* Name */}
                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-slate-700 block">{t.demoModal.nameLabel}</label>
                  <input
                    type="text"
                    required
                    placeholder={t.demoModal.namePlaceholder}
                    value={formState.name}
                    onChange={(e) => setFormState({ ...formState, name: e.target.value })}
                    className="w-full rounded-xl border border-slate-200 bg-slate-50/50 px-3.5 py-2.5 text-sm text-slate-800 placeholder-slate-400 outline-none focus:border-[#292e91] focus:bg-white transition-colors"
                  />
                </div>

                {/* Company */}
                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-slate-700 block">{t.demoModal.companyLabel}</label>
                  <input
                    type="text"
                    required
                    placeholder={t.demoModal.companyPlaceholder}
                    value={formState.company}
                    onChange={(e) => setFormState({ ...formState, company: e.target.value })}
                    className="w-full rounded-xl border border-slate-200 bg-slate-50/50 px-3.5 py-2.5 text-sm text-slate-800 placeholder-slate-400 outline-none focus:border-[#292e91] focus:bg-white transition-colors"
                  />
                </div>

                {/* Grid for Email & Phone */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <label className="text-xs font-bold text-slate-700 block">{t.demoModal.emailLabel}</label>
                    <input
                      type="email"
                      required
                      placeholder={t.demoModal.emailPlaceholder}
                      value={formState.email}
                      onChange={(e) => setFormState({ ...formState, email: e.target.value })}
                      className="w-full rounded-xl border border-slate-200 bg-slate-50/50 px-3.5 py-2.5 text-sm text-slate-800 placeholder-slate-400 outline-none focus:border-[#292e91] focus:bg-white transition-colors"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-xs font-bold text-slate-700 block">{t.demoModal.phoneLabel}</label>
                    <input
                      type="tel"
                      required
                      placeholder={t.demoModal.phonePlaceholder}
                      value={formState.phone}
                      onChange={(e) => setFormState({ ...formState, phone: e.target.value })}
                      className="w-full rounded-xl border border-slate-200 bg-slate-50/50 px-3.5 py-2.5 text-sm text-slate-800 placeholder-slate-400 outline-none focus:border-[#292e91] focus:bg-white transition-colors"
                    />
                  </div>
                </div>

                {/* Details */}
                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-slate-700 block">{t.demoModal.detailsLabel}</label>
                  <textarea
                    rows={3}
                    placeholder={t.demoModal.detailsPlaceholder}
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
                    className="w-1/3 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 font-bold text-sm py-3 transition-colors"
                  >
                    {t.demoModal.cancel}
                  </button>
                  <button
                    type="submit"
                    disabled={submitStatus === "loading"}
                    className="w-2/3 flex items-center justify-center gap-2 rounded-xl bg-brand-gradient hover:opacity-90 text-white font-bold text-sm py-3 transition-all shadow-md disabled:opacity-70 duration-300 hover:shadow-lg"
                  >
                    {submitStatus === "loading" ? (
                      <>
                        <div className="w-4 h-4 rounded-full border-2 border-white/20 border-t-white animate-spin" />
                        <span>{t.demoModal.sending}</span>
                      </>
                    ) : (
                      <span>{t.demoModal.submit}</span>
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
