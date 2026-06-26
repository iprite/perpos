"use client";

// ai-suggest-box.tsx — AI-1 แนะหมวดค่าใช้จ่าย (Mock) ใช้ในฟอร์มเพิ่มรายการ (A2)
// กดปุ่ม → loading จำลอง ~1s → โชว์ canned category + confidence จาก getCategorizeMock
// + ปุ่ม "ใช้หมวดนี้" (เติมเข้าฟอร์ม) · ตัวเลือกสำรอง (alternatives) กดเลือกได้
// guardrail UX: ป้ายความเชื่อมั่น + ป้าย "ตรวจสอบก่อนใช้" เมื่อ requires_confirmation
// ไม่ยิง API จริง (prototype)

import { useEffect, useState } from "react";
import { Sparkles, Loader2, Check, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Text } from "@/components/ui/typography";
import { StatusBadge } from "@/components/ui/badge";
import { getCategorizeMock } from "../_fixtures";
import type { CategorizeMockResult } from "../_fixtures/ai-mocks";

type LoadState = "idle" | "loading" | "done";

export function AiSuggestBox({
  description,
  currentCategory,
  onApply,
}: {
  /** คำอธิบายรายการ (input ของ AI) */
  description: string;
  /** หมวดที่เลือกอยู่ตอนนี้ (โชว์ว่าตรงกับ AI ไหม) */
  currentCategory: string;
  /** ผู้ใช้กด "ใช้หมวดนี้" → เติมหมวดเข้าฟอร์ม */
  onApply: (category: string) => void;
}) {
  const [state, setState] = useState<LoadState>("idle");
  const [result, setResult] = useState<CategorizeMockResult | null>(null);

  const canTrigger = description.trim().length >= 2;

  // จำลอง latency ของ AI (mock — ไม่ยิง API)
  useEffect(() => {
    if (state !== "loading") return;
    const t = window.setTimeout(() => {
      setResult(getCategorizeMock(description));
      setState("done");
    }, 1000);
    return () => window.clearTimeout(t);
  }, [state, description]);

  if (state === "idle") {
    return (
      <div className="rounded-lg border border-primary/20 bg-primary/[0.03] px-3 py-2.5">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 text-xs text-gray-600">
            <span className="flex h-6 w-6 items-center justify-center rounded-md bg-primary/10 text-primary">
              <Sparkles className="h-3.5 w-3.5" />
            </span>
            ให้ AI ช่วยแนะหมวดจากคำอธิบาย
          </div>
          <Button
            size="sm"
            variant="outline"
            disabled={!canTrigger}
            onClick={() => setState("loading")}
          >
            <Sparkles className="mr-1.5 h-3.5 w-3.5" /> แนะหมวด
          </Button>
        </div>
        {!canTrigger && (
          <Text className="mt-1 text-[11px] text-gray-400">
            พิมพ์คำอธิบายก่อน แล้วกดให้ AI แนะหมวด
          </Text>
        )}
      </div>
    );
  }

  if (state === "loading") {
    return (
      <div className="rounded-lg border border-primary/20 bg-primary/[0.03] px-3 py-2.5">
        <div className="flex items-center gap-2 text-xs text-primary">
          <Loader2 className="h-3.5 w-3.5 animate-spin" /> AI กำลังวิเคราะห์คำอธิบาย…
        </div>
      </div>
    );
  }

  // done
  const r = result!;
  const pct = Math.round(r.confidence * 100);
  const tone = pct >= 90 ? "success" : pct >= 80 ? "info" : "warning";
  const isCurrent = currentCategory === r.category;

  return (
    <div className="space-y-2 rounded-lg border border-primary/20 bg-primary/[0.03] px-3 py-2.5">
      <div className="flex flex-wrap items-center gap-2">
        <span className="flex items-center gap-1.5 text-xs font-medium text-primary">
          <Sparkles className="h-3.5 w-3.5" /> AI แนะนำ
        </span>
        <StatusBadge tone={tone}>ความเชื่อมั่น {pct}%</StatusBadge>
        {r.requires_confirmation && (
          <span className="inline-flex items-center gap-1 rounded-full bg-amber-50 px-2 py-0.5 text-[11px] font-medium text-amber-700">
            <ShieldCheck className="h-3 w-3" /> ตรวจสอบก่อนใช้
          </span>
        )}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <span className="rounded-md border border-gray-200 bg-white px-2 py-1 text-sm font-medium text-gray-900">
          {r.category}
        </span>
        {isCurrent ? (
          <span className="inline-flex items-center gap-1 text-xs text-green-600">
            <Check className="h-3.5 w-3.5" /> ใช้หมวดนี้อยู่แล้ว
          </span>
        ) : (
          <Button size="sm" variant="outline" onClick={() => onApply(r.category)}>
            ใช้หมวดนี้
          </Button>
        )}
      </div>

      <Text className="text-[11px] text-gray-500">{r.reason}</Text>

      {r.alternatives.length > 0 && (
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="text-[11px] text-gray-400">ตัวเลือกอื่น:</span>
          {r.alternatives.map((alt) => (
            <Button
              key={alt.category}
              type="button"
              variant="outline"
              onClick={() => onApply(alt.category)}
              className="h-auto rounded-full border-gray-200 px-2 py-0.5 text-[11px] font-normal text-gray-600 hover:border-primary/40 hover:text-primary"
            >
              {alt.category} ({Math.round(alt.confidence * 100)}%)
            </Button>
          ))}
        </div>
      )}
    </div>
  );
}
