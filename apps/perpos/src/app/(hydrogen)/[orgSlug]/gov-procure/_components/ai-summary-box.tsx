"use client";

// ai-summary-box.tsx — กล่อง "สรุปด้วย AI" (AI-1 Executive Brief — spec §5b)
// กดปุ่ม → ยิง /api/gov-procure/ai/brief จริง (rule computeSummary → AI narrate · AI ล่ม = fallback ตัวเลข)
// guardrail UX: "ตรวจสอบก่อนตัดสินใจ" + badge แหล่งที่มา (AI / ตัวเลขระบบ)

import { useState } from "react";
import { Sparkles, Target, CheckCircle2, RotateCw, Loader2, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Text } from "@/components/ui/typography";
import { StatusBadge } from "@/components/ui/badge";
import { toast } from "@/lib/toast";
import { useData } from "./gov-provider";
import { govApi } from "./api";

interface Brief {
  narration: string;
  highlights: string[];
  focus: string[];
  confidence: number;
  fallback?: boolean;
}

type LoadState = "idle" | "loading" | "done";

export function AiSummaryBox() {
  const { orgId } = useData();
  const [state, setState] = useState<LoadState>("idle");
  const [brief, setBrief] = useState<Brief | null>(null);

  async function run() {
    setState("loading");
    try {
      const res = await govApi<{ brief: Brief }>(
        `/api/gov-procure/ai/brief?orgId=${encodeURIComponent(orgId)}`,
        "POST",
      );
      setBrief(res.brief);
      setState("done");
    } catch (e) {
      toast.error((e as Error).message || "สรุปไม่สำเร็จ");
      setState("idle");
    }
  }

  return (
    <div className="rounded-xl border border-primary/20 bg-primary/[0.03] p-4 sm:p-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10 text-primary">
            <Sparkles className="h-4 w-4" />
          </span>
          <div>
            <div className="flex items-center gap-2">
              <Text className="text-sm font-semibold text-gray-900">สรุปพอร์ตด้วย AI</Text>
              <span className="inline-flex items-center gap-1 rounded-full bg-gray-100 px-2 py-0.5 text-[11px] font-medium text-gray-500">
                <ShieldCheck className="h-3 w-3" /> ตรวจสอบก่อนตัดสินใจ
              </span>
            </div>
            <Text className="text-xs text-gray-500">ผู้ช่วยสรุปภาพรวมงานจัดซื้อภาครัฐ</Text>
          </div>
        </div>
        {state === "done" && (
          <Button variant="ghost" size="sm" onClick={run}>
            <RotateCw className="mr-1.5 h-3.5 w-3.5" /> สรุปใหม่
          </Button>
        )}
      </div>

      {state === "idle" && (
        <div className="mt-3 flex flex-col items-start gap-2">
          <Text className="text-sm text-gray-500">
            ให้ AI สรุปสุขภาพพอร์ต เงินค้างรับ และงานที่ควรเร่งจัดการเป็นภาษาคน
            (อิงตัวเลขจริงจากระบบ — AI เรียบเรียงเท่านั้น)
          </Text>
          <Button size="sm" onClick={run}>
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

      {state === "done" && brief && <AiResult data={brief} />}
    </div>
  );
}

function AiResult({ data }: { data: Brief }) {
  const confidencePct = Math.round(data.confidence * 100);
  const confTone = confidencePct >= 90 ? "success" : confidencePct >= 80 ? "info" : "warning";

  return (
    <div className="mt-3 space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <StatusBadge tone={confTone}>ความเชื่อมั่น {confidencePct}%</StatusBadge>
        <StatusBadge tone={data.fallback ? "neutral" : "info"}>
          {data.fallback ? "ตัวเลขระบบ" : "เรียบเรียงโดย AI"}
        </StatusBadge>
      </div>
      <Text className="text-sm leading-relaxed text-gray-600">{data.narration}</Text>

      <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
        {data.highlights.length > 0 && (
          <div className="rounded-lg border border-gray-200 bg-white p-3">
            <Text className="mb-1.5 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-gray-500">
              <CheckCircle2 className="h-3.5 w-3.5 text-green-600" /> ไฮไลต์
            </Text>
            <ul className="space-y-1">
              {data.highlights.map((h, i) => (
                <li key={i} className="flex items-start gap-2 text-sm text-gray-700">
                  <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-green-500" />
                  {h}
                </li>
              ))}
            </ul>
          </div>
        )}

        {data.focus.length > 0 && (
          <div className="rounded-lg border border-amber-200 bg-amber-50 p-3">
            <Text className="mb-1.5 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-amber-700">
              <Target className="h-3.5 w-3.5" /> ควรเร่งจัดการ
            </Text>
            <ul className="space-y-1">
              {data.focus.map((f, i) => (
                <li key={i} className="flex items-start gap-2 text-sm text-amber-800">
                  <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-amber-500" />
                  {f}
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
