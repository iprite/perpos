"use client";

/**
 * ai-opinion.tsx — กล่องแสดง "ความเห็นของ AI" ของโมดูล just_me (ใช้ร่วมทุกจุดที่มี AI)
 *
 * ⛔ ต้องติดป้ายเสมอว่าเป็นความเห็น AI + เป็นการประมาณการ และคนเป็นผู้ตัดสิน
 *    (module-factory CONTEXT: human-in-the-loop — AI ไม่ทำรายการแทนผู้ใช้)
 */

import { Sparkles } from "lucide-react";
import { StatusBadge } from "@/components/ui/badge";
import { Text } from "@/components/ui/typography";

export interface AiOpinionView {
  narration: string;
  points: string[];
  decision_hint: string | null;
  fallback: boolean;
  generated_at: string;
}

export function AiOpinionCard({ opinion }: { opinion: AiOpinionView }) {
  return (
    <div className="rounded-xl border border-gray-200 bg-gray-50 p-4">
      <div className="flex flex-wrap items-center gap-2">
        <Sparkles className="h-4 w-4 text-gray-500" />
        <Text className="text-sm font-medium text-gray-900">ความเห็นของผู้ช่วย AI</Text>
        <StatusBadge tone={opinion.fallback ? "neutral" : "info"}>
          {opinion.fallback ? "สรุปจากกฎ (AI ไม่พร้อม)" : "AI เรียบเรียง"}
        </StatusBadge>
      </div>

      <Text className="mt-2 text-sm text-gray-700">{opinion.narration}</Text>

      {opinion.points.length > 0 && (
        <ul className="mt-2 space-y-1">
          {opinion.points.map((p, i) => (
            <li key={i} className="flex gap-2 text-sm text-gray-600">
              <span className="text-gray-400">•</span>
              <span>{p}</span>
            </li>
          ))}
        </ul>
      )}

      <Text className="mt-3 text-xs text-gray-500">
        {opinion.decision_hint ??
          "เป็นความเห็นประกอบการตัดสินใจ ไม่ใช่คำสั่ง — ผู้ใช้เป็นผู้ตัดสินใจเสมอ"}
      </Text>
    </div>
  );
}
