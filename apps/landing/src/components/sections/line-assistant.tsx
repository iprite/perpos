"use client";

import { useState } from "react";
import { Check, MessageCircle } from "lucide-react";
import { Container } from "@/components/ui/container";
import { LogoMark } from "@/components/ui/logo";
import { lineCommands, lineBenefits } from "@/data/landing-content";
import { cn } from "@/lib/utils";

export function LineAssistantSection() {
  const [activeTab, setActiveTab] = useState(0);
  const active = lineCommands[activeTab];

  return (
    <section
      id="line-assistant"
      className="relative overflow-hidden bg-ink section-padding"
    >
      {/* background */}
      <div className="pointer-events-none absolute inset-0">
        <div className="absolute inset-0 bg-grid-dark mask-fade-b opacity-60" />
        <div className="absolute -left-20 top-10 h-80 w-80 rounded-full bg-primary/25 blur-[120px]" />
        <div className="absolute -right-16 bottom-0 h-80 w-80 rounded-full bg-secondary/20 blur-[120px]" />
      </div>

      <Container className="relative">
        <div className="grid items-center gap-14 lg:grid-cols-2">
          {/* Left — copy + tabs */}
          <div>
            <span className="inline-flex items-center gap-1.5 rounded-full bg-white/10 px-3.5 py-1.5 text-xs font-semibold uppercase tracking-wider text-primary-200 ring-1 ring-white/15">
              <MessageCircle className="h-3.5 w-3.5" />
              LINE Bot Assistant
            </span>

            <h2 className="mt-4 text-balance text-3xl font-bold text-white md:text-4xl">
              ทำงานได้ทุกที่ ผ่าน LINE ที่คุณใช้อยู่แล้ว
            </h2>
            <p className="mt-4 text-pretty leading-relaxed text-slate-300">
              ไม่ต้องเปิดคอม ไม่ต้องสลับแอป — แค่พิมพ์คำสั่งใน LINE
              ก็บันทึกบัญชี สร้างนัดหมาย และติดตามงานได้ทันที
            </p>

            {/* Benefits */}
            <ul className="mt-7 space-y-3">
              {lineBenefits.map((benefit) => (
                <li key={benefit} className="flex items-start gap-3">
                  <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-secondary/20 text-secondary">
                    <Check className="h-3.5 w-3.5" strokeWidth={3} />
                  </span>
                  <span className="text-sm text-slate-300">{benefit}</span>
                </li>
              ))}
            </ul>

            {/* Command tabs */}
            <div className="mt-8 grid gap-2.5 sm:grid-cols-2">
              {lineCommands.map((cmd, index) => (
                <button
                  key={cmd.command}
                  onClick={() => setActiveTab(index)}
                  className={cn(
                    "rounded-xl border p-3.5 text-left transition-all duration-200",
                    activeTab === index
                      ? "border-primary/60 bg-primary/15 ring-1 ring-primary/40"
                      : "border-white/10 bg-white/[0.03] hover:border-white/20 hover:bg-white/[0.06]"
                  )}
                >
                  <div className="font-mono text-xs font-semibold text-primary-200">
                    {cmd.command}
                  </div>
                  <div className="mt-1 text-xs text-slate-400">
                    {cmd.description}
                  </div>
                </button>
              ))}
            </div>
          </div>

          {/* Right — chat mockup */}
          <div className="relative mx-auto w-full max-w-sm">
            <div className="absolute -inset-6 -z-10 rounded-[3rem] bg-gradient-to-br from-primary/40 to-secondary/30 opacity-50 blur-3xl" />
            <div className="overflow-hidden rounded-[2rem] border border-white/10 bg-ink-soft shadow-2xl">
              {/* App bar */}
              <div className="flex items-center gap-3 border-b border-white/10 bg-white/[0.03] px-4 py-3.5">
                <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary text-white">
                  <LogoMark className="h-5 w-5 brightness-0 invert" />
                </span>
                <div>
                  <p className="text-sm font-semibold text-white">
                    PERPOS Assistant
                  </p>
                  <p className="flex items-center gap-1 text-[11px] text-secondary">
                    <span className="h-1.5 w-1.5 rounded-full bg-secondary" />
                    ออนไลน์
                  </p>
                </div>
              </div>

              {/* Conversation */}
              <div className="flex min-h-[380px] flex-col gap-3.5 p-4">
                {/* bot greeting */}
                <div className="flex items-end gap-2">
                  <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary text-white">
                    <LogoMark className="h-4 w-4 brightness-0 invert" />
                  </span>
                  <div className="max-w-[78%] rounded-2xl rounded-bl-md bg-white/[0.06] px-3.5 py-2.5">
                    <p className="text-sm text-slate-200">
                      สวัสดีค่ะ พิมพ์คำสั่งได้เลย เดี๋ยวจัดการให้ทันที
                    </p>
                  </div>
                </div>

                {/* user command */}
                <div className="flex items-end justify-end gap-2">
                  <div className="max-w-[78%] rounded-2xl rounded-br-md bg-primary px-3.5 py-2.5">
                    <p className="font-mono text-sm text-white">
                      {active.command}
                    </p>
                  </div>
                </div>

                {/* bot result */}
                <div className="flex items-end gap-2">
                  <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary text-white">
                    <LogoMark className="h-4 w-4 brightness-0 invert" />
                  </span>
                  <div className="max-w-[78%] rounded-2xl rounded-bl-md bg-white/[0.06] px-3.5 py-2.5">
                    <p className="text-sm text-slate-200">{active.result}</p>
                  </div>
                </div>

                {/* command chips */}
                <div className="mt-auto rounded-xl border border-white/10 bg-white/[0.03] p-3">
                  <p className="mb-2 text-[11px] text-slate-400">
                    คำสั่งที่ใช้บ่อย
                  </p>
                  <div className="flex flex-wrap gap-1.5">
                    {["/ข่าว", "/รายรับ", "/รายจ่าย", "/นัด", "/tk", "/d"].map(
                      (cmd) => (
                        <span
                          key={cmd}
                          className="rounded-md bg-white/[0.06] px-2 py-1 font-mono text-[11px] text-slate-300"
                        >
                          {cmd}
                        </span>
                      )
                    )}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </Container>
    </section>
  );
}
