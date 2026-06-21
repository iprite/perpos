import Image from "next/image";
import Link from "next/link";
import {
  ArrowRight,
  Brain,
  Check,
  FileAudio,
  FileText,
  HardDrive,
  MessageCircle,
  QrCode,
  Send,
  ShieldCheck,
  Timer,
  Trash2,
  Video,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { LINE_URL, Lockup, SectionHeading, SiteFooter, SiteHeader } from "./site-chrome";
import { FlowChat } from "./flow-chat";
import { StepRail } from "./step-rail";
import { BrandIcon } from "./brand-icon";

const features = [
  {
    title: "ถอดเสียง + สรุปประชุม",
    body: "ส่งไฟล์เสียงหรือวิดีโอประชุม รับ transcript พร้อมรายงานการประชุมที่อ่านต่อได้ทันที",
    tokens: 100,
    per: "นาที",
    baht: "≈ 1 บาท",
    icon: FileAudio,
  },
  {
    title: "บีบ PDF",
    body: "ส่ง PDF เข้า LINE ระบบขอยืนยัน บีบไฟล์ แล้วส่ง PDF ที่เล็กลงกลับให้",
    tokens: 100,
    per: "หน้า",
    baht: "≈ 1 บาท",
    icon: FileText,
  },
  {
    title: "Meeting bot",
    body: "รองรับ Google Meet, Zoom และ Microsoft Teams ส่งบอทเข้าประชุมเพื่อบันทึกและสรุป",
    tokens: 150,
    per: "นาที",
    baht: "≈ 1.5 บาท",
    icon: MessageCircle,
  },
];

const startSteps = [
  {
    icon: MessageCircle,
    title: "เพิ่มเพื่อนใน LINE",
    desc: "เพิ่ม PERPOS Flow เป็นเพื่อน เริ่มใช้งานได้ฟรีทันที ไม่ต้องสมัคร",
  },
  {
    icon: Send,
    title: "ส่งไฟล์เข้าไป",
    desc: "ส่ง PDF หรือเสียงประชุมเข้าแชต แล้วให้ Flow จัดการต่อให้",
  },
];

const trust = [
  { icon: ShieldCheck, title: "PDPA-aware", desc: "ออกแบบให้ตรวจขั้นตอนเรื่องข้อมูลอย่างเข้มงวด" },
  {
    icon: Trash2,
    title: "ไม่เก็บไฟล์เสียงไว้ที่เรา",
    desc: "ไฟล์เสียงไม่ถูกเก็บถาวรในระบบ PERPOS",
  },
  { icon: Brain, title: "ไม่ใช้เทรน AI", desc: "ไฟล์และเสียงของลูกค้าไม่นำไปฝึกโมเดล" },
  { icon: Timer, title: "ลบภายใน 48 ชม.", desc: "ไฟล์สรุปประชุมถูกลบจาก server ภายใน 48 ชั่วโมง" },
  { icon: HardDrive, title: "สูงสุด 500 MB", desc: "PDF และเสียงรองรับไฟล์ขนาดใหญ่ได้" },
  { icon: Video, title: "Meet / Zoom / Teams", desc: "Meeting bot รองรับ platform ประชุมหลัก" },
];

export function PerposFlowPage() {
  return (
    <main className="min-h-screen bg-white">
      <SiteHeader />

      {/* hero */}
      <section className="relative overflow-hidden border-b border-border">
        <div className="bg-grid mask-fade-b absolute inset-0 opacity-60" aria-hidden />
        <div className="relative mx-auto grid max-w-7xl items-center gap-12 px-5 py-16 sm:px-6 md:grid-cols-[1fr_0.9fr] md:py-20 lg:px-8">
          <div>
            <span className="bg-secondary/12 mb-5 inline-flex h-12 w-12 items-center justify-center rounded-2xl">
              <BrandIcon product="flow" className="h-7 w-7" />
            </span>
            <Lockup tone="mint">PERPOS | FLOW</Lockup>
            <h1 className="mt-5 max-w-2xl text-balance text-4xl font-semibold leading-[1.12] tracking-tight text-foreground sm:text-5xl lg:text-6xl">
              ผู้ช่วย AI ส่วนตัวบน LINE จัดการงานเอกสารให้จบในแชทเดียว
            </h1>
            <p className="mt-6 max-w-xl text-lg leading-8 text-foreground-secondary">
              แค่โยนไฟล์เสียงประชุมหรือ PDF เข้า LINE ยืนยันครั้งเดียว ระบบประมวลผลแล้วส่งผลลัพธ์
              กลับมาให้ทันที จ่ายด้วย token เท่าที่ใช้จริง เริ่มใช้ฟรี
            </p>
            <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center">
              <Link
                href={LINE_URL}
                target="_blank"
                rel="noopener noreferrer"
                className="group/cta inline-flex items-center justify-center gap-2.5 rounded-2xl bg-gradient-to-b from-primary to-primary-dark px-7 py-4 text-base font-semibold text-white shadow-lg shadow-primary/25 ring-1 ring-white/10 transition-all duration-200 hover:-translate-y-0.5 hover:shadow-xl hover:shadow-primary/30 active:translate-y-0 active:scale-[0.98]"
              >
                <span className="flex h-6 w-6 items-center justify-center rounded-lg bg-[#06C755] text-white shadow-sm">
                  <MessageCircle className="h-4 w-4" strokeWidth={2.2} />
                </span>
                เพิ่ม <span className="font-neo-tech tracking-[0.06em]">PERPOS</span> ไปช่วยคุณเลย
                <ArrowRight className="h-4 w-4 transition-transform group-hover/cta:translate-x-0.5" />
              </Link>
            </div>
          </div>
          <FlowChat />
        </div>
      </section>

      {/* the loop + features */}
      <section className="section-padding">
        <div className="container-custom">
          <div className="grid gap-8 lg:grid-cols-[0.85fr_1.15fr] lg:items-center">
            <SectionHeading
              title="flow เดียวกัน ใช้ได้กับทั้งเสียงและ PDF"
              description="ทุกฟีเจอร์ของ Flow ทำงานบนจังหวะเดียว โยนไฟล์เข้าไป ยืนยัน รอระบบจัดการ แล้วรับผลลัพธ์กลับในแชต"
            />
            <div className="rounded-2xl border border-border bg-background-secondary px-4 py-9 sm:px-8">
              <StepRail />
            </div>
          </div>

          <div className="mt-10 grid gap-4 md:grid-cols-3">
            {features.map((feature) => {
              const Icon = feature.icon;
              return (
                <div
                  key={feature.title}
                  className="flex flex-col rounded-2xl border border-border bg-white p-6 shadow-card transition hover:-translate-y-1 hover:border-border-strong hover:shadow-card-hover"
                >
                  <span className="bg-secondary/14 flex h-11 w-11 items-center justify-center rounded-xl text-secondary-dark">
                    <Icon className="h-5 w-5" strokeWidth={1.9} />
                  </span>
                  <h3 className="mt-5 text-xl font-semibold text-foreground">{feature.title}</h3>
                  <p className="mt-3 flex-1 text-sm leading-7 text-foreground-secondary">
                    {feature.body}
                  </p>
                  <div className="mt-6 flex items-end justify-between border-t border-border pt-4">
                    <div className="flex items-baseline gap-1.5">
                      <span className="text-2xl font-bold tabular-nums tracking-tight text-secondary-dark">
                        {feature.tokens}
                      </span>
                      <span className="text-sm font-semibold text-secondary-dark">token</span>
                      <span className="text-sm text-foreground-muted">/ {feature.per}</span>
                    </div>
                    <span className="bg-secondary/12 rounded-full px-2.5 py-1 text-xs font-semibold text-secondary-dark ring-1 ring-inset ring-secondary/25">
                      {feature.baht}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {/* pricing + qr */}
      <section className="border-y border-border bg-background-secondary py-20 md:py-24">
        <div className="container-custom grid gap-6 md:grid-cols-2">
          <div className="rounded-2xl border border-border bg-white p-6 shadow-card">
            <Lockup tone="mint">TOKEN PAY-AS-YOU-GO</Lockup>
            <h2 className="mt-3 text-2xl font-semibold tracking-tight text-foreground">
              เติม token เท่าที่ใช้ ไม่มี subscription รายเดือน
            </h2>
            <div className="bg-secondary/8 mt-6 rounded-xl border border-secondary/25 p-5">
              <p className="text-sm font-medium text-secondary-dark">ตัวอย่างการเติม</p>
              <p className="mt-1 text-3xl font-semibold tabular-nums text-foreground">
                99 บาท{" "}
                <span className="text-lg font-medium text-foreground-secondary">= 9,900 token</span>
              </p>
            </div>
            <ul className="mt-5 space-y-2.5">
              {["เริ่มต้น 99 บาท", "1 บาท = 100 token", "เติมได้ทั้งใน LINE และบนเว็บ"].map(
                (item) => (
                  <li
                    key={item}
                    className="flex items-center gap-2 text-sm text-foreground-secondary"
                  >
                    <Check className="h-4 w-4 text-secondary-dark" strokeWidth={2.2} />
                    {item}
                  </li>
                ),
              )}
            </ul>
          </div>

          <div className="flex flex-col gap-5 rounded-2xl border border-border bg-white p-6 shadow-card sm:flex-row sm:items-center">
            <div className="relative mx-auto aspect-square w-40 shrink-0 overflow-hidden rounded-xl border border-border bg-white sm:mx-0">
              <Image
                src="/flow/line-oa-qr.png"
                alt="PERPOS LINE OA QR code"
                fill
                priority
                sizes="160px"
                className="object-contain p-2"
              />
            </div>
            <div className="text-center sm:text-left">
              <p className="flex items-center justify-center gap-2 text-sm font-semibold text-secondary-dark sm:justify-start">
                <QrCode className="h-4 w-4" />
                LINE OA · @perpos
              </p>
              <h3 className="mt-2 text-2xl font-semibold tracking-tight text-foreground">
                เพิ่มเพื่อนแล้วเริ่มจากไฟล์แรก
              </h3>
              <p className="mt-3 text-sm leading-7 text-foreground-secondary">
                สแกน QR หรือกดปุ่มเพิ่มเพื่อน ระบบออกแบบให้เริ่มจาก LINE ได้เลย
              </p>
              <Button href={LINE_URL} className="mt-5">
                เพิ่มเพื่อน @perpos
              </Button>
            </div>
          </div>
        </div>
      </section>

      {/* start steps */}
      <section className="section-padding">
        <div className="container-custom">
          <SectionHeading
            eyebrow="เริ่มใช้ใน 2 ขั้นตอน"
            title="เพิ่มแล้วใช้ได้เลย ไม่ต้องเรียนรู้ระบบใหม่"
          />
          <div className="relative mt-10 grid gap-5 md:grid-cols-2">
            {/* connector between the two steps (desktop) */}
            <div className="pointer-events-none absolute left-1/2 top-1/2 z-10 hidden -translate-x-1/2 -translate-y-1/2 md:block">
              <span className="flex h-11 w-11 items-center justify-center rounded-full border border-border bg-white text-secondary-dark shadow-card">
                <ArrowRight className="h-5 w-5" strokeWidth={2.2} />
              </span>
            </div>
            {startSteps.map((step, i) => {
              const Icon = step.icon;
              return (
                <div
                  key={step.title}
                  className="group rounded-2xl border border-border bg-white p-7 shadow-card transition hover:-translate-y-1 hover:border-secondary/40 hover:shadow-card-hover"
                >
                  <div className="flex items-center gap-4">
                    <span className="bg-secondary/12 relative flex h-12 w-12 items-center justify-center rounded-2xl text-secondary-dark transition group-hover:bg-secondary/20">
                      <Icon className="h-6 w-6" strokeWidth={1.9} />
                      <span className="absolute -right-1.5 -top-1.5 flex h-5 w-5 items-center justify-center rounded-full bg-secondary text-[11px] font-bold tabular-nums text-white shadow-sm">
                        {i + 1}
                      </span>
                    </span>
                    <h3 className="text-lg font-semibold text-foreground">{step.title}</h3>
                  </div>
                  <p className="mt-4 text-sm leading-7 text-foreground-secondary">{step.desc}</p>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {/* trust */}
      <section className="border-t border-border bg-background-secondary py-20 md:py-24">
        <div className="container-custom">
          <SectionHeading
            eyebrow="ความเป็นส่วนตัว"
            title="ไฟล์งานของคุณถูกใช้เพื่อประมวลผลงานที่สั่งเท่านั้น"
          />
          <div className="mt-10 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {trust.map((item) => {
              const Icon = item.icon;
              return (
                <div
                  key={item.title}
                  className="group flex min-h-[100px] items-center gap-3.5 rounded-2xl border border-border bg-white p-4 shadow-card transition hover:border-secondary/40 hover:shadow-card-hover sm:p-5"
                >
                  <span className="bg-secondary/12 flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-secondary-dark transition group-hover:bg-secondary/20">
                    <Icon className="h-5 w-5" strokeWidth={1.9} />
                  </span>
                  <div className="min-w-0">
                    <h3 className="font-semibold text-foreground">{item.title}</h3>
                    <p className="mt-1 line-clamp-2 text-sm leading-6 text-foreground-secondary">
                      {item.desc}
                    </p>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {/* final cta */}
      <section className="bg-primary-dark py-20 text-center text-white md:py-24">
        <div className="container-custom">
          <h2 className="mx-auto max-w-2xl text-balance text-3xl font-semibold tracking-tight sm:text-4xl">
            ลองใช้ Flow จาก LINE ได้เลย
          </h2>
          <p className="mx-auto mt-4 max-w-lg text-base text-white/65">
            เพิ่มเพื่อน @perpos แล้วส่งไฟล์แรกของคุณเข้าไปได้ทันที
          </p>
          <div className="mt-8 flex justify-center">
            <Button href={LINE_URL} variant="white" size="lg">
              เพิ่ม PERPOS Flow บน LINE
              <MessageCircle className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </section>

      <SiteFooter />
    </main>
  );
}
