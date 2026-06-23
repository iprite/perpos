"use client";

// ai-summary-box.tsx — กล่อง "สรุปด้วย AI" (H1 Mock) — shared dashboard + reports
// กดปุ่ม → loading จำลอง ~1.4s → โชว์ canned summary จาก ai-mocks (ตัวเลขตรง fixture)
// ออกแบบให้ตรวจทานได้: headline + confidence + summary + highlights + suggestions
// guardrail UX: ป้าย "ตรวจสอบก่อนตัดสินใจ" + ปุ่ม "สรุปใหม่" · ไม่ยิง API จริง (prototype)

import { useEffect, useState } from "react";
import { Sparkles, Lightbulb, CheckCircle2, RefreshCw, Loader2, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Text } from "@/components/ui/typography";
import { StatusBadge } from "@/components/ui/badge";
import type { H1AiSummary } from "../_fixtures/ai-mocks";

type LoadState = "idle" | "loading" | "done";

export function AiSummaryBox({
  data,
  periodLabel,
  defaultOpen = false,
}: {
  data: H1AiSummary;
  /** ช่วงเวลา (แสดงใต้หัวข้อ) — เช่นหน้า reports */
  periodLabel?: string;
  /** เปิดผลทันที (จำลอง loading แล้วโชว์ผล) — default = แสดงปุ่มก่อน */
  defaultOpen?: boolean;
}) {
  const [state, setState] = useState<LoadState>(defaultOpen ? "loading" : "idle");

  // จำลอง latency ของ AI (mock — ไม่ยิง API) เมื่อเข้าสู่สถานะ loading
  useEffect(() => {
    if (state !== "loading") return;
    const t = window.setTimeout(() => setState("done"), 1400);
    return () => window.clearTimeout(t);
  }, [state]);

  return (
    <div className="rounded-xl border border-primary/20 bg-primary/[0.03] p-4 sm:p-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10 text-primary">
            <Sparkles className="h-4 w-4" />
          </span>
          <div>
            <div className="flex items-center gap-2">
              <Text className="text-sm font-semibold text-gray-900">สรุปด้วย AI</Text>
              <span className="inline-flex items-center gap-1 rounded-full bg-gray-100 px-2 py-0.5 text-[11px] font-medium text-gray-500">
                <ShieldCheck className="h-3 w-3" /> ตรวจสอบก่อนตัดสินใจ
              </span>
            </div>
            {periodLabel && (
              <Text className="text-xs text-gray-500">{periodLabel} · ผู้ช่วยวิเคราะห์รายได้</Text>
            )}
          </div>
        </div>
        {state === "done" && (
          <Button variant="ghost" size="sm" onClick={() => setState("loading")}>
            <RefreshCw className="mr-1.5 h-3.5 w-3.5" /> สรุปใหม่
          </Button>
        )}
      </div>

      {state === "idle" && (
        <div className="mt-3 flex flex-col items-start gap-2">
          <Text className="text-sm text-gray-500">
            ให้ AI สรุปผลประกอบการ{data.scope === "day" ? "วันนี้" : "เดือนนี้"}เป็นภาษาคน
            พร้อมข้อสังเกตและคำแนะนำ (อิงตัวเลขจริงจากระบบ)
          </Text>
          <Button size="sm" onClick={() => setState("loading")}>
            <Sparkles className="mr-1.5 h-4 w-4" /> สรุปด้วย AI
          </Button>
        </div>
      )}

      {state === "loading" && (
        <div className="mt-3 space-y-2">
          <div className="flex items-center gap-2 text-sm text-primary">
            <Loader2 className="h-4 w-4 animate-spin" /> กำลังวิเคราะห์ตัวเลขและเรียบเรียง…
          </div>
          <div className="animate-pulse space-y-2">
            <div className="h-4 w-3/4 rounded bg-gray-100" />
            <div className="h-3 w-full rounded bg-gray-100" />
            <div className="h-3 w-5/6 rounded bg-gray-100" />
          </div>
        </div>
      )}

      {state === "done" && <AiResult data={data} />}
    </div>
  );
}

function AiResult({ data }: { data: H1AiSummary }) {
  const o = data.output;
  const confidencePct = Math.round(o.confidence * 100);
  const confTone = confidencePct >= 90 ? "success" : confidencePct >= 80 ? "info" : "warning";

  return (
    <div className="mt-3 space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <Text className="text-base font-semibold text-gray-900">{o.headline}</Text>
        <StatusBadge tone={confTone}>ความเชื่อมั่น {confidencePct}%</StatusBadge>
      </div>
      <Text className="text-sm leading-relaxed text-gray-600">{o.summary}</Text>

      <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
        {o.highlights.length > 0 && (
          <div className="rounded-lg border border-gray-200 bg-white p-3">
            <Text className="mb-1.5 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-gray-500">
              <CheckCircle2 className="h-3.5 w-3.5 text-green-600" /> ไฮไลต์
            </Text>
            <ul className="space-y-1">
              {o.highlights.map((h, i) => (
                <li key={i} className="flex items-start gap-2 text-sm text-gray-700">
                  <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-green-500" />
                  {h}
                </li>
              ))}
            </ul>
          </div>
        )}

        {o.suggestions.length > 0 && (
          <div className="rounded-lg border border-amber-200 bg-amber-50 p-3">
            <Text className="mb-1.5 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-amber-700">
              <Lightbulb className="h-3.5 w-3.5" /> ข้อเสนอแนะ
            </Text>
            <ul className="space-y-1">
              {o.suggestions.map((s, i) => (
                <li key={i} className="flex items-start gap-2 text-sm text-amber-800">
                  <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-amber-500" />
                  {s}
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>

      <Text className="text-[11px] text-gray-400">
        * AI เป็นผู้ช่วยแนะนำ ตัวเลขทั้งหมดคำนวณจากข้อมูลจริง (AI เรียบเรียงเป็นภาษาเท่านั้น) —
        โปรดใช้วิจารณญาณก่อนตัดสินใจ
      </Text>
    </div>
  );
}
