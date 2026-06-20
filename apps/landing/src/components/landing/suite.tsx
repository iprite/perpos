import {
  Banknote,
  Bell,
  Boxes,
  Calculator,
  FileScan,
  LayoutDashboard,
  ReceiptText,
  Rocket,
  Search,
  UsersRound,
  Workflow,
  Wrench,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Lockup, SectionHeading, SiteFooter, SiteHeader } from "./site-chrome";
import { SuiteVisual } from "./suite-visual";
import { SuiteDemoButton } from "./suite-demo";
import { BrandIcon } from "./brand-icon";

const modules = [
  {
    title: "บัญชี",
    body: "เอกสารบัญชี ภาษี และสมุดรายวันใน workflow เดียว",
    chips: ["Invoice", "ภาษี", "Journal"],
    icon: Calculator,
  },
  {
    title: "บุคคล / HR",
    body: "ข้อมูลพนักงาน payroll และ approval ที่ต่อกับโครงสร้างองค์กร",
    chips: ["พนักงาน", "Payroll", "สิทธิ์"],
    icon: UsersRound,
  },
  {
    title: "ขาย – ซื้อ",
    body: "คุมเอกสารขาย-ซื้อ ตั้งแต่ใบเสนอราคา PO ไปจนถึง invoice",
    chips: ["Quote", "PO", "Billing"],
    icon: ReceiptText,
  },
  {
    title: "คลังสินค้า",
    body: "ติดตามสินค้า stock movement และต้นทุนที่เกี่ยวกับคลัง",
    chips: ["Stock", "Movement", "ต้นทุน"],
    icon: Boxes,
  },
  {
    title: "การเงิน",
    body: "จัดการธนาคาร เช็ค payment และกระแสเงินสดขององค์กร",
    chips: ["ธนาคาร", "เช็ค", "Cashflow"],
    icon: Banknote,
  },
  {
    title: "Tailor-made ERP",
    body: "ออกแบบ workflow เฉพาะองค์กร ใช้งานจริงแล้วในหลายทีม",
    chips: ["Production-ready", "Custom flow", "Integration"],
    icon: Workflow,
    featured: true,
  },
];

const automations = [
  { title: "OCR เอกสารบัญชี", body: "อ่านบิลและใบเสร็จ เข้าสู่ระบบอัตโนมัติ", icon: FileScan },
  { title: "สรุปข้อมูลผู้บริหาร", body: "สรุปยอดและสถานะงานให้อ่านได้เร็ว", icon: LayoutDashboard },
  { title: "แจ้งเตือนผ่าน LINE", body: "ส่ง noti และคำสั่งงานเข้า LINE ของทีม", icon: Bell },
];

const path = [
  { icon: Search, title: "Discover", desc: "เข้าใจ workflow และข้อมูลที่องค์กรใช้จริง" },
  { icon: Wrench, title: "Build", desc: "ออกแบบ module และ automation ให้เข้ากับทีม" },
  { icon: Rocket, title: "Run", desc: "deploy ใช้งานจริง พร้อมดูแล subscription ต่อเนื่อง" },
];

export function PerposSuitePage() {
  return (
    <main className="min-h-screen bg-white">
      <SiteHeader />

      {/* hero (dark) */}
      <section className="relative overflow-hidden bg-primary-dark text-white">
        <div className="bg-grid-dark mask-fade-b absolute inset-0 opacity-70" aria-hidden />
        <div className="relative mx-auto grid max-w-7xl items-center gap-12 px-5 py-16 sm:px-6 md:grid-cols-[0.95fr_1.05fr] md:py-24 lg:px-8">
          <div>
            <span className="mb-5 inline-flex h-12 w-12 items-center justify-center rounded-2xl bg-accent/15">
              <BrandIcon product="suite" className="h-7 w-7" />
            </span>
            <Lockup tone="light">PERPOS | SUITE</Lockup>
            <h1 className="mt-5 max-w-2xl text-balance text-4xl font-semibold leading-[1.12] tracking-tight sm:text-5xl lg:text-6xl">
              AI ERP สำหรับองค์กรที่ต้องการระบบตาม workflow จริง
            </h1>
            <p className="mt-6 max-w-xl text-lg leading-8 text-white/65">
              เริ่มจาก module พื้นฐานอย่างบัญชีและ HR แล้วต่อยอดด้วย tailor-made ERP
              ที่ออกแบบให้เข้ากับกระบวนการของแต่ละองค์กร
            </p>
            <div className="mt-8 flex justify-center sm:justify-start">
              <SuiteDemoButton />
            </div>
            <p className="mt-5 text-center text-sm text-white/55 sm:text-left">
              นัดเดโมฟรี · ทีมช่วยออกแบบ workflow ให้องค์กรคุณ
            </p>
          </div>
          <SuiteVisual />
        </div>
      </section>

      {/* modules */}
      <section className="section-padding">
        <div className="container-custom">
          <SectionHeading
            eyebrow="Production-ready where it matters"
            tone="accent"
            title="Tailor-made ERP ใช้งานจริงแล้วในหลายองค์กร"
            description="Suite ไม่ได้เป็นแค่ catalog module แต่เป็นระบบที่ปรับตามหน้าที่งาน approval, document, operation และรายงานขององค์กรนั้น ๆ"
          />
          <div className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {modules.map((m) => {
              const Icon = m.icon;
              return (
                <div
                  key={m.title}
                  className={cn(
                    "group flex flex-col rounded-2xl border p-6 shadow-card transition hover:-translate-y-1 hover:shadow-card-hover",
                    m.featured
                      ? "border-accent/30 bg-primary text-white"
                      : "border-border bg-white hover:border-accent/40",
                  )}
                >
                  <span
                    className={cn(
                      "flex h-11 w-11 items-center justify-center rounded-xl transition",
                      m.featured
                        ? "bg-white/12 text-white"
                        : "bg-accent/12 text-accent-dark group-hover:bg-accent/20",
                    )}
                  >
                    <Icon className="h-5 w-5" strokeWidth={1.9} />
                  </span>
                  <h3
                    className={cn(
                      "mt-5 text-xl font-semibold",
                      m.featured ? "text-white" : "text-foreground",
                    )}
                  >
                    {m.title}
                  </h3>
                  <p
                    className={cn(
                      "mt-3 flex-1 text-sm leading-7",
                      m.featured ? "text-white/65" : "text-foreground-secondary",
                    )}
                  >
                    {m.body}
                  </p>
                  <div className="mt-5 flex flex-wrap gap-2">
                    {m.chips.map((chip) => (
                      <span
                        key={chip}
                        className={cn(
                          "rounded-full px-3 py-1 text-xs font-semibold",
                          m.featured
                            ? "bg-white/12 text-white ring-1 ring-inset ring-white/15"
                            : "bg-accent/10 text-accent-dark ring-1 ring-inset ring-accent/25",
                        )}
                      >
                        {chip}
                      </span>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {/* ai automation */}
      <section className="border-y border-border bg-background-secondary py-20 md:py-24">
        <div className="container-custom">
          <SectionHeading
            eyebrow="AI + Workflow"
            tone="accent"
            title="AI ใน Suite ไม่ใช่แค่ chatbot แต่ช่วยทำงานในระบบ"
            description="อ่านเอกสาร สรุปข้อมูล ตรวจงาน และเชื่อมขั้นตอนระหว่างทีม ให้งานซ้ำ ๆ เดินเองได้"
          />
          <div className="mt-10 grid gap-3 md:grid-cols-3">
            {automations.map((a) => {
              const Icon = a.icon;
              return (
                <div
                  key={a.title}
                  className="group flex min-h-[88px] items-center gap-3.5 rounded-2xl border border-border bg-white p-4 shadow-card transition hover:border-accent/40 hover:shadow-card-hover sm:p-5"
                >
                  <span className="bg-accent/12 flex h-11 w-11 shrink-0 items-center justify-center rounded-xl text-accent-dark transition group-hover:bg-accent/20">
                    <Icon className="h-5 w-5" strokeWidth={1.9} />
                  </span>
                  <div className="min-w-0">
                    <h3 className="font-semibold text-foreground">{a.title}</h3>
                    <p className="mt-1 line-clamp-2 text-sm leading-6 text-foreground-secondary">
                      {a.body}
                    </p>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {/* implementation path — connected timeline */}
      <section className="section-padding">
        <div className="container-custom">
          <SectionHeading
            eyebrow="Implementation"
            tone="accent"
            title="เริ่มต้นเป็นขั้น ไม่ต้องรื้อทั้งระบบ"
          />
          <div className="relative mt-12 grid gap-10 md:grid-cols-3">
            {/* connector line + running light streak (desktop) */}
            <div className="pointer-events-none absolute left-[16.66%] right-[16.66%] top-7 hidden h-[2px] overflow-visible bg-accent/25 md:block">
              <span className="timeline-run absolute top-1/2 h-[3px] w-16 -translate-x-1/2 -translate-y-1/2 rounded-full bg-gradient-to-r from-transparent via-accent to-transparent" />
            </div>
            {path.map((p, i) => {
              const Icon = p.icon;
              return (
                <div key={p.title} className="relative flex flex-col items-center text-center">
                  <span className="relative z-10 flex h-14 w-14 items-center justify-center rounded-2xl border border-accent/30 text-accent-dark">
                    {/* opaque base so the connector line doesn't show through the node */}
                    <span className="absolute inset-0 rounded-2xl bg-white" aria-hidden />
                    <span className="bg-accent/12 absolute inset-0 rounded-2xl" aria-hidden />
                    <Icon className="relative h-6 w-6" strokeWidth={1.9} />
                    <span className="absolute -right-1.5 -top-1.5 flex h-5 w-5 items-center justify-center rounded-full bg-accent text-[11px] font-bold tabular-nums text-white shadow-sm">
                      {i + 1}
                    </span>
                  </span>
                  <h3 className="mt-5 text-xl font-semibold text-foreground">{p.title}</h3>
                  <p className="mt-2 max-w-xs text-sm leading-7 text-foreground-secondary">
                    {p.desc}
                  </p>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {/* final cta */}
      <section className="relative overflow-hidden bg-primary-dark py-20 text-center text-white md:py-24">
        <div className="bg-grid-dark mask-fade-b absolute inset-0 opacity-50" aria-hidden />
        <div
          className="pointer-events-none absolute left-1/2 top-0 h-72 w-72 -translate-x-1/2 rounded-full bg-accent/20 blur-[120px]"
          aria-hidden
        />
        <div className="container-custom relative">
          <h2 className="mx-auto max-w-2xl text-balance text-3xl font-semibold tracking-tight sm:text-4xl">
            อยากให้ ERP เข้ากับ workflow จริงขององค์กรคุณไหม?
          </h2>
          <p className="mx-auto mt-4 max-w-md text-base leading-7 text-white/60">
            นัดเดโมฟรี ทีมงานจะช่วยออกแบบ workflow ให้เข้ากับองค์กรคุณ
          </p>
          <div className="mt-8 flex justify-center">
            <SuiteDemoButton />
          </div>
        </div>
      </section>

      <SiteFooter />
    </main>
  );
}
