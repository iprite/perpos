/**
 * /assistant/stt — ถอดเสียงเป็นข้อความ (MoM) (hybrid)
 *
 * SSR: guard + ดึง jobs + quota ตอน SSR → ส่ง initial ให้ TranscribeView
 * client (อัปโหลด + poll ขณะมีงานค้าง + dialog) — ไม่มีช่วงขาวรอ fetch แรก
 * (เดิมอยู่ที่ /assistant — ย้ายมาเมื่อ /assistant กลายเป็นหน้าการใช้งาน)
 */

import type { ComponentProps } from "react";
import { requireAssistantPage } from "@/lib/assistant/page-guard";
import { getAssistantJobs } from "@/lib/assistant/jobs";
import { getTokenSummary } from "@/lib/assistant/token-balance";
import TranscribeView from "./transcribe-view";

type ViewProps = ComponentProps<typeof TranscribeView>;

export default async function AssistantTranscribePage() {
  const { admin, userId } = await requireAssistantPage();
  const [jobs, summary] = await Promise.all([
    getAssistantJobs(admin, userId),
    getTokenSummary(admin, userId),
  ]);

  return (
    <TranscribeView
      initialJobs={jobs as ViewProps["initialJobs"]}
      initialQuota={{
        stt_seconds: summary.remaining.stt_seconds,
        bot_seconds: summary.remaining.bot_seconds,
      }}
    />
  );
}
