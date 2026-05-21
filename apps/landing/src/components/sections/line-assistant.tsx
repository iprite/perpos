"use client";

import { useState } from "react";
import { Container } from "@/components/ui/container";
import { SectionHeading } from "@/components/ui/section-heading";
import { lineCommands } from "@/data/landing-content";

export function LineAssistantSection() {
  const [activeTab, setActiveTab] = useState(0);

  return (
    <section id="line-assistant" className="section-padding bg-foreground">
      <Container>
        <div className="grid gap-12 lg:grid-cols-2 lg:items-center">
          <div>
            <SectionHeading
              eyebrow="LINE Bot Assistant"
              title="ทำงานได้ทุกที่ ผ่าน LINE ที่คุณคุ้นเคย"
              description="ไม่ต้องเปิดแอปหลายตัว ไม่ต้องจำรหัสผ่านใหม่ บันทึกรายรัน สร้างนัดหมาย และติดตามงานได้เลยทันทีผ่าน LINE"
              align="left"
              className="mb-0"
            />

            <div className="mt-8 space-y-4">
              {lineCommands.map((cmd, index) => (
                <button
                  key={index}
                  onClick={() => setActiveTab(index)}
                  className={`w-full rounded-lg border p-4 text-left transition-all ${
                    activeTab === index
                      ? "border-primary bg-primary/10"
                      : "border-gray-700 bg-transparent hover:border-gray-600"
                  }`}
                >
                  <div className="font-mono text-sm text-primary">{cmd.command}</div>
                  <div className="mt-1 text-xs text-gray-400">{cmd.description}</div>
                </button>
              ))}
            </div>
          </div>

          <div className="relative mx-auto w-full max-w-sm">
            <div className="absolute inset-0 rounded-3xl bg-gradient-to-br from-primary to-secondary blur-2xl opacity-30" />
            <div className="relative rounded-3xl border border-gray-700 bg-gray-900 shadow-2xl">
              <div className="flex items-center gap-3 border-b border-gray-700 p-4">
                <div className="flex gap-1.5">
                  <div className="h-3 w-3 rounded-full bg-red-500" />
                  <div className="h-3 w-3 rounded-full bg-yellow-500" />
                  <div className="h-3 w-3 rounded-full bg-green-500" />
                </div>
                <span className="text-sm text-gray-400">PERPOS Assistant</span>
              </div>

              <div className="p-4 space-y-4 min-h-[400px]">
                <div className="flex items-start gap-3">
                  <div className="h-8 w-8 rounded-full bg-primary flex-shrink-0 flex items-center justify-center">
                    <span className="text-xs font-bold text-white">P</span>
                  </div>
                  <div className="rounded-2xl rounded-tl-none bg-gray-800 p-3 max-w-[80%]">
                    <p className="text-sm text-gray-200">
                      สวัสดีค่ะ! ฉันคือ PERPOS Assistant พร้อมช่วยคุณได้เลย
                    </p>
                  </div>
                </div>

                <div className="flex items-start gap-3 justify-end">
                  <div className="rounded-2xl rounded-tr-none bg-primary p-3 max-w-[80%]">
                    <p className="font-mono text-sm text-white">
                      {lineCommands[activeTab].command}
                    </p>
                  </div>
                  <div className="h-8 w-8 rounded-full bg-gray-600 flex-shrink-0" />
                </div>

                <div className="flex items-start gap-3">
                  <div className="h-8 w-8 rounded-full bg-primary flex-shrink-0 flex items-center justify-center">
                    <span className="text-xs font-bold text-white">P</span>
                  </div>
                  <div className="rounded-2xl rounded-tl-none bg-gray-800 p-3 max-w-[80%]">
                    <p className="text-sm text-gray-200">
                      {lineCommands[activeTab].result}
                    </p>
                  </div>
                </div>

                <div className="mt-auto rounded-xl border border-gray-700 bg-gray-800/50 p-3">
                  <p className="text-xs text-gray-400 mb-2">คำสั่งที่ใช้ได้:</p>
                  <div className="flex flex-wrap gap-2">
                    {["/ข่าว", "/รายรับ", "/รายจ่าย", "/นัด", "/tk", "/d"].map((cmd) => (
                      <span
                        key={cmd}
                        className="rounded bg-gray-700 px-2 py-1 text-xs font-mono text-gray-300"
                      >
                        {cmd}
                      </span>
                    ))}
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
