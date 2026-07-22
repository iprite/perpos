"use client";

// cf-feedback-summary.tsx — AI §5.6 (mock): สรุปฟีดแบ็ก CF ของลูกค้า → เช็กลิสต์แก้ลาย
// ผลลัพธ์มาจากแหล่งเดียว = `_fixtures/ai-mocks.ts` (`aiCfChecklistFor`) — ห้ามมี canned ซ้ำในหน้า
// binding: แสดง **ข้อความต้นฉบับของลูกค้าคู่กันเสมอ** + ทุกข้อในเช็กลิสต์อ้างประโยคที่ยกมา (evidence)

import { useState } from "react";
import { Bot, MessageSquareQuote } from "lucide-react";
import { Button } from "@/components/ui/button";
import { StatusBadge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Text } from "@/components/ui/typography";
import {
  AI_DISCLAIMER,
  AI_MOCK_LATENCY_MS,
  AI_MOCK_MODEL_LABEL,
  aiCfChecklistFor,
  type AiCfChecklist,
} from "../_fixtures/ai-mocks";

export function CfFeedbackSummary({
  designJobId,
  feedback,
}: {
  designJobId: string;
  /** ข้อความที่ลูกค้าตอบมาจริง (ใช้เป็นต้นฉบับตั้งต้นก่อนกดสรุป) */
  feedback: string;
}) {
  const [phase, setPhase] = useState<"idle" | "loading" | "done">("idle");
  const [result, setResult] = useState<AiCfChecklist | null>(null);

  function run() {
    setPhase("loading");
    window.setTimeout(() => {
      setResult(aiCfChecklistFor(designJobId, feedback));
      setPhase("done");
    }, AI_MOCK_LATENCY_MS);
  }

  const sourceText = (result?.sourceFeedback ?? feedback).trim();

  return (
    <div className="rounded-xl border border-gray-200 bg-white p-3">
      {/* ต้นฉบับ — แสดงเสมอ ไม่ว่าจะสรุปหรือยัง */}
      <div className="flex items-start gap-2">
        <MessageSquareQuote className="mt-0.5 h-4 w-4 shrink-0 text-gray-400" />
        <div className="min-w-0">
          <div className="text-xs font-medium text-gray-500">ข้อความจากลูกค้า (ต้นฉบับ)</div>
          <Text className="mt-0.5 text-sm text-gray-900">
            {sourceText ? `“${sourceText}”` : "— ยังไม่มีข้อความจากลูกค้า —"}
          </Text>
        </div>
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <Button size="sm" variant="outline" disabled={phase === "loading"} onClick={run}>
          <Bot className="mr-1.5 h-4 w-4" />
          {phase === "loading"
            ? "กำลังสรุป…"
            : phase === "done"
              ? "สรุปใหม่อีกครั้ง"
              : "ให้ AI สรุปเป็นเช็กลิสต์แก้ลาย"}
        </Button>
      </div>

      {phase === "loading" && (
        <div className="mt-3 space-y-2">
          <Skeleton className="h-4 w-3/4" />
          <Skeleton className="h-4 w-2/3" />
          <Skeleton className="h-4 w-1/2" />
        </div>
      )}

      {phase === "done" && result && (
        <div className="mt-3">
          <div className="text-xs font-medium text-gray-500">
            สิ่งที่ต้องแก้ (AI ร่างให้ — ตรวจก่อนใช้)
          </div>
          {result.items.length === 0 ? (
            <Text className="mt-1.5 text-sm text-gray-500">
              ยังไม่มีฟีดแบ็กมากพอให้สรุปเป็นรายการแก้ไข
            </Text>
          ) : (
            <ul className="mt-1.5 space-y-2">
              {result.items.map((c, idx) => (
                <li key={c.key} className="flex items-start gap-2">
                  <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-gray-100 text-[11px] font-medium tabular-nums text-gray-600">
                    {idx + 1}
                  </span>
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <span className="text-sm text-gray-900">{c.label}</span>
                      {c.priority === "high" && <StatusBadge tone="warning">ทำก่อน</StatusBadge>}
                    </div>
                    <Text className="mt-0.5 text-xs text-gray-500">
                      อ้างจากลูกค้า: “{c.evidenceQuote}”
                    </Text>
                  </div>
                </li>
              ))}
            </ul>
          )}
          <Text className="mt-3 text-xs text-gray-400">
            {AI_DISCLAIMER} · ความมั่นใจโดยประมาณ {Math.round(result.confidence * 100)}% ·{" "}
            {AI_MOCK_MODEL_LABEL}
          </Text>
        </div>
      )}
    </div>
  );
}
