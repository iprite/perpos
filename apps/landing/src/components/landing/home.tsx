import Link from "next/link";
import { ArrowRight, Check, MessageCircle } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  CONTACT_URL,
  LINE_URL,
  Lockup,
  SectionHeading,
  SiteFooter,
  SiteHeader,
} from "./site-chrome";
import { TypeWord } from "./type-word";
import { FlowChat } from "./flow-chat";
import { SuiteDemoButton } from "./suite-demo";
import { BrandIcon } from "./brand-icon";

const products = [
  {
    lockup: "PERPOS | FLOW",
    href: "/flow",
    eyebrow: "ผู้ช่วย AI ส่วนตัวบน LINE",
    title: "งานเอกสารและเสียงประชุม จบใน LINE",
    body: "โยนไฟล์เข้าไป ยืนยัน แล้วรับผลลัพธ์กลับมา จ่ายเท่าที่ใช้ ไม่มีรายเดือน เริ่มต้นใช้งาน ฟรี",
    points: ["ถอดเสียง + สรุปประชุม", "บีบ PDF", "Meeting bot"],
    accent: "mint" as const,
  },
  {
    lockup: "PERPOS | SUITE",
    href: "/suite",
    eyebrow: "AI ERP สำหรับองค์กร",
    title: "ระบบ ERP ที่ปรับตาม workflow จริง",
    body: "บัญชี HR และ tailor-made ERP ที่ปรับตามงานจริงขององค์กร ใช้งานจริงแล้วหลายที่ คิดราคาแบบ subscription ตามการใช้งาน",
    points: ["บัญชี / HR / การเงิน", "Tailor-made module"],
    accent: "suite" as const,
  },
];

const cardStyles = {
  mint: {
    border: "border-secondary/45 hover:border-secondary/70",
    icon: "bg-secondary/14 text-secondary-dark",
    chip: "bg-secondary/10 text-secondary-dark ring-1 ring-inset ring-secondary/35",
    arrow: "group-hover:text-secondary-dark",
  },
  suite: {
    border: "border-accent/45 hover:border-accent/70",
    icon: "bg-accent/14 text-accent-dark",
    chip: "bg-accent/10 text-accent-dark ring-1 ring-inset ring-accent/35",
    arrow: "group-hover:text-accent-dark",
  },
} as const;

const decide = [
  { need: "ใช้ AI ช่วยบีบ PDF หรือสรุปเสียงประชุม", pick: "Flow" },
  { need: "อยากใช้ผ่าน LINE ไม่ต้องเรียนระบบใหม่", pick: "Flow" },
  { need: "ต้องการระบบ ERP ให้ทีมและองค์กร", pick: "Suite" },
  { need: "ต้องการ module เฉพาะ workflow ธุรกิจ", pick: "Suite" },
];

const finalCtas = [
  {
    tone: "mint" as const,
    lockup: "PERPOS | FLOW",
    title: "ผู้ช่วย AI ส่วนตัวบน LINE",
    points: ["เริ่มจาก LINE ไม่ต้องเรียนระบบใหม่", "จ่ายตามการใช้งาน เริ่มต้น 99 บาท"],
    cta: "ใช้ Flow บน LINE",
    href: LINE_URL,
  },
  {
    tone: "suite" as const,
    lockup: "PERPOS | SUITE",
    title: "AI ERP สำหรับองค์กร",
    points: ["tailor-made workflow เฉพาะองค์กร", "ขยายเป็นระบบทั้งองค์กรได้"],
    cta: "ขอเดโม Suite",
    href: CONTACT_URL,
  },
];

const ctaStyles = {
  mint: {
    iconChip: "bg-secondary/15 text-secondary",
    lockup: "text-secondary",
    check: "text-secondary",
    button: "bg-white text-primary hover:bg-white/90",
  },
  suite: {
    iconChip: "bg-accent/15 text-accent",
    lockup: "text-accent",
    check: "text-accent",
    button: "border border-white/20 text-white hover:bg-white/5",
  },
} as const;

function ProductCard({ product }: { product: (typeof products)[number] }) {
  const s = cardStyles[product.accent];
  return (
    <Link
      href={product.href}
      className={cn(
        "group flex flex-col rounded-2xl border bg-white p-7 shadow-card transition hover:-translate-y-1 hover:shadow-card-hover sm:p-8",
        s.border,
      )}
    >
      <div className="flex items-start justify-between">
        <span
          className={cn(
            "flex h-12 w-12 items-center justify-center rounded-2xl",
            product.accent === "mint" ? "bg-secondary/12" : "bg-accent/12",
          )}
        >
          <BrandIcon product={product.accent === "mint" ? "flow" : "suite"} className="h-7 w-7" />
        </span>
        <ArrowRight
          className={cn(
            "h-5 w-5 text-foreground-muted transition group-hover:translate-x-1",
            s.arrow,
          )}
        />
      </div>
      <Lockup className="mt-6" tone={product.accent}>
        {product.lockup}
      </Lockup>
      <p className="mt-2 text-sm font-semibold text-foreground-secondary">{product.eyebrow}</p>
      <h3 className="mt-1.5 text-2xl font-semibold tracking-tight text-foreground sm:text-3xl">
        {product.title}
      </h3>
      <p className="mt-3 text-sm leading-7 text-foreground-secondary">{product.body}</p>
      <div className="mt-6 flex flex-wrap gap-2">
        {product.points.map((point) => (
          <span key={point} className={cn("rounded-full px-3 py-1 text-xs font-semibold", s.chip)}>
            {point}
          </span>
        ))}
      </div>
    </Link>
  );
}

export function PerposHome() {
  return (
    <main className="relative min-h-screen">
      {/* fixed page backdrop — stays put while the content scrolls over it */}
      <div aria-hidden className="pointer-events-none fixed inset-0 -z-10 bg-white">
        <div className="bg-grid absolute inset-0 opacity-50" />
      </div>
      <SiteHeader />

      {/* hero — flat brand intro; colour lives in the text, not the background */}
      <section className="relative overflow-hidden border-b border-border">
        <div className="relative mx-auto max-w-7xl px-5 py-16 sm:px-6 md:py-20 lg:px-8">
          <div className="grid gap-10 md:grid-cols-[1fr_0.8fr] md:items-center lg:gap-12">
            <div>
              <Lockup>PERPOS</Lockup>
              <h1 className="mt-5 text-balance text-4xl font-semibold leading-[1.12] tracking-tight text-foreground sm:text-5xl lg:text-6xl">
                เครื่องมือ AI และระบบ ERP สำหรับงานยุคใหม่ของธุรกิจไทย
              </h1>
              <p className="mt-6 max-w-xl text-lg leading-8 text-foreground-secondary">
                เลือกวิธีทำงานที่เหมาะกับคุณ —{" "}
                <span className="font-neo-tech tracking-[0.06em] text-secondary-dark">Flow</span>{" "}
                ผู้ช่วยส่วนตัวบน LINE หรือ{" "}
                <span className="font-neo-tech tracking-[0.06em] text-accent-dark">Suite</span>{" "}
                ระบบองค์กรที่ต่อกับ workflow จริง
              </p>
              <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:items-center">
                <Link
                  href={LINE_URL}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="group/cta inline-flex items-center justify-center gap-2.5 rounded-2xl bg-gradient-to-b from-primary to-primary-dark px-7 py-4 text-base font-semibold text-white shadow-lg shadow-primary/25 ring-1 ring-white/10 transition-all duration-200 hover:-translate-y-0.5 hover:shadow-xl hover:shadow-primary/30 active:translate-y-0 active:scale-[0.98]"
                >
                  <span className="flex h-6 w-6 items-center justify-center rounded-lg bg-[#06C755] text-white shadow-sm">
                    <MessageCircle className="h-4 w-4" strokeWidth={2.2} />
                  </span>
                  เริ่มใช้ <span className="font-neo-tech tracking-[0.06em]">Flow</span> ฟรี!
                  <ArrowRight className="h-4 w-4 transition-transform group-hover/cta:translate-x-0.5" />
                </Link>
                <span className="text-center text-sm text-foreground-muted sm:text-left">
                  ฟรี · ไม่ต้องสมัคร · ช่วยคุณได้ทันที
                </span>
              </div>
            </div>
            <div className="mx-auto w-full max-w-md md:mx-0">
              <FlowChat />
            </div>
          </div>
          <div className="mt-14 grid gap-5 md:grid-cols-2">
            {products.map((product) => (
              <ProductCard key={product.lockup} product={product} />
            ))}
          </div>
        </div>
      </section>

      {/* decide */}
      <section className="border-y border-border bg-background-secondary py-20 md:py-24">
        <div className="container-custom">
          <SectionHeading eyebrow="เลือกให้ถูกตัว" title="คุณกำลังมองหาอะไร?" />
          <div className="mt-10 overflow-hidden rounded-2xl border border-border bg-white shadow-card">
            {decide.map((row, i) => (
              <div
                key={row.need}
                className={cn(
                  "flex items-center justify-between gap-4 px-5 py-4 sm:px-6",
                  i !== decide.length - 1 && "border-b border-border",
                )}
              >
                <p className="text-sm text-foreground-secondary sm:text-base">{row.need}</p>
                <Link
                  href={row.pick === "Flow" ? "/flow" : "/suite"}
                  className={cn(
                    "font-neo-tech inline-flex shrink-0 items-center gap-1 rounded-full px-3 py-1 text-xs tracking-[0.08em] transition",
                    row.pick === "Flow"
                      ? "bg-secondary/12 text-secondary-dark hover:bg-secondary/20"
                      : "bg-accent/12 text-accent-dark hover:bg-accent/20",
                  )}
                >
                  {row.pick}
                  <ArrowRight className="h-3 w-3" />
                </Link>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* split cta — restrained, on-theme charcoal with sparing accents */}
      <section className="relative overflow-hidden bg-primary-dark py-20 text-white md:py-24">
        <div className="bg-grid-dark mask-fade-b absolute inset-0 opacity-40" aria-hidden />
        <div className="container-custom relative">
          <div className="mx-auto max-w-2xl text-center">
            <Lockup tone="light">เริ่มจากแบบที่เหมาะกับงานของคุณ</Lockup>
            <h2 className="mt-4 text-3xl font-semibold tracking-tight sm:text-4xl">
              <TypeWord text="Flow" className="font-neo-tech tracking-[0.04em] text-secondary" />{" "}
              ลดขั้นตอนให้เหลือแค่ยืนยัน{" "}
              <TypeWord
                text="Suite"
                startDelay={650}
                className="font-neo-tech tracking-[0.04em] text-accent"
              />{" "}
              วางระบบให้ทั้งองค์กรทำงานเป็นระบบเดียวกัน
            </h2>
          </div>

          <div className="mt-12 grid gap-5 md:grid-cols-2">
            {finalCtas.map((item) => {
              const c = ctaStyles[item.tone];
              return (
                <div
                  key={item.lockup}
                  className="group flex flex-col rounded-3xl border border-white/10 bg-white/[0.04] p-7 transition hover:border-white/20 sm:p-8"
                >
                  <div className="flex items-center gap-3">
                    <span
                      className={cn(
                        "flex h-12 w-12 items-center justify-center rounded-2xl",
                        c.iconChip,
                      )}
                    >
                      <BrandIcon
                        product={item.tone === "mint" ? "flow" : "suite"}
                        className="h-6 w-6"
                      />
                    </span>
                    <p
                      className={cn("font-neo-tech text-xs uppercase tracking-[0.18em]", c.lockup)}
                    >
                      {item.lockup}
                    </p>
                  </div>
                  <h3 className="mt-5 text-2xl font-semibold tracking-tight">{item.title}</h3>
                  <ul className="mt-5 space-y-2.5">
                    {item.points.map((point) => (
                      <li key={point} className="flex items-start gap-2 text-sm text-white/70">
                        <Check
                          className={cn("mt-0.5 h-4 w-4 shrink-0", c.check)}
                          strokeWidth={2.4}
                        />
                        {point}
                      </li>
                    ))}
                  </ul>
                  {item.tone === "suite" ? (
                    <SuiteDemoButton
                      className={cn(
                        "mt-7 inline-flex items-center justify-center gap-2 rounded-xl px-6 py-3 text-sm font-semibold transition active:scale-[0.98]",
                        c.button,
                      )}
                    >
                      {item.cta}
                      <ArrowRight className="h-4 w-4 transition group-hover:translate-x-0.5" />
                    </SuiteDemoButton>
                  ) : (
                    <Link
                      href={item.href}
                      target="_blank"
                      rel="noopener noreferrer"
                      className={cn(
                        "mt-7 inline-flex items-center justify-center gap-2 rounded-xl px-6 py-3 text-sm font-semibold transition active:scale-[0.98]",
                        c.button,
                      )}
                    >
                      {item.cta}
                      <ArrowRight className="h-4 w-4 transition group-hover:translate-x-0.5" />
                    </Link>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </section>

      <SiteFooter />
    </main>
  );
}
