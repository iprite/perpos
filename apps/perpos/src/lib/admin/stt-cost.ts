/**
 * computeSttCost — ต้นทุน Gemini ของฟีเจอร์แกะเสียง (super admin)
 * ฐาน: assistant_jobs (status=completed) ในช่วง days · token จริง→เป๊ะ, ไม่มี→ประมาณจาก duration
 * คิด cost ตอนอ่านด้วยราคาปัจจุบัน (lib/assistant/stt-cost, ปรับผ่าน env)
 *
 * เรียกจาก Server Component (hydrogen)/admin/stt-cost/page.tsx → fetch ตอน SSR (days จาก searchParams)
 * รับ admin client (service role) — auth/role check เป็นหน้าที่ของ caller
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import {
  getSttPricing,
  estimateGeminiCostUsd,
  exactCostUsdFromTokens,
  usdToThb,
} from "@/lib/assistant/stt-cost";
import { getRecallBotUsdPerHour, recallCostUsd } from "@/lib/assistant/recall-cost";

export type CostStats = {
  window_days: number;
  pricing: {
    model: string;
    audio_input_usd_per_m: number;
    text_input_usd_per_m: number;
    output_usd_per_m: number;
    audio_tokens_per_sec: number;
    output_tokens_per_job: number;
    usd_thb_rate: number;
  };
  accuracy: { exact_jobs: number; estimated_jobs: number; exact_ratio: number };
  tokens: { prompt: number; output: number; thoughts: number };
  totals: {
    minutes: number;
    jobs: number;
    cost_usd: number;
    cost_thb: number;
    cost_per_minute_thb: number;
  };
  by_source: {
    web: { minutes: number; jobs: number; cost_thb: number };
    line: { minutes: number; jobs: number; cost_thb: number };
    recall: { minutes: number; jobs: number; cost_thb: number };
  };
  recall_platform: {
    usd_per_hour: number;
    recording_minutes: number;
    cost_usd: number;
    cost_thb: number;
    bot_cost_per_minute_thb: number;
  };
  grand_total: { cost_thb: number };
  daily: { date: string; minutes: number; cost_thb: number }[];
};

const BKK = "Asia/Bangkok";
const dayStr = (d: Date) => new Intl.DateTimeFormat("en-CA", { timeZone: BKK }).format(d);

type JobRow = {
  source: string | null;
  duration_seconds: number | null;
  created_at: string;
  prompt_tokens: number | null;
  audio_input_tokens: number | null;
  output_tokens: number | null;
  thoughts_tokens: number | null;
};

/** ต้นทุน 1 งาน (USD) — เป๊ะถ้ามี token, ไม่งั้นประมาณจาก duration */
function jobCostUsd(
  r: JobRow,
  p: ReturnType<typeof getSttPricing>,
): { usd: number; exact: boolean } {
  if (r.prompt_tokens != null) {
    const audio = r.audio_input_tokens ?? r.prompt_tokens;
    return {
      usd: exactCostUsdFromTokens(
        {
          audioInputTokens: audio,
          textInputTokens: Math.max(0, r.prompt_tokens - audio),
          outputTokens: r.output_tokens ?? 0,
        },
        p,
      ),
      exact: true,
    };
  }
  return {
    usd: estimateGeminiCostUsd({ seconds: r.duration_seconds ?? 0, jobs: 1 }, p),
    exact: false,
  };
}

/** clamp days → 1..365 (default 30) */
export function normalizeDays(input: unknown): number {
  const n = Number(input);
  return Number.isFinite(n) ? Math.min(365, Math.max(1, Math.round(n))) : 30;
}

export async function computeSttCost(admin: SupabaseClient, days: number): Promise<CostStats> {
  const since = new Date(Date.now() - days * 86400000).toISOString();

  const { data: jobs } = await admin
    .from("assistant_jobs")
    .select(
      "source, duration_seconds, created_at, prompt_tokens, audio_input_tokens, output_tokens, thoughts_tokens",
    )
    .eq("status", "completed")
    .gte("created_at", since)
    .limit(20000);

  const rows = (jobs ?? []) as JobRow[];
  const p = getSttPricing();

  let costUsd = 0,
    minutes = 0,
    exactJobs = 0,
    estimatedJobs = 0,
    promptTok = 0,
    outputTok = 0,
    thoughtsTok = 0;

  const bySource: Record<
    "web" | "line" | "recall",
    { minutes: number; jobs: number; usd: number }
  > = {
    web: { minutes: 0, jobs: 0, usd: 0 },
    line: { minutes: 0, jobs: 0, usd: 0 },
    recall: { minutes: 0, jobs: 0, usd: 0 },
  };
  const daily: Record<string, { minutes: number; usd: number }> = {};
  for (let i = days - 1; i >= 0; i--)
    daily[dayStr(new Date(Date.now() - i * 86400000))] = { minutes: 0, usd: 0 };

  for (const r of rows) {
    const mins = (r.duration_seconds ?? 0) / 60;
    const { usd, exact } = jobCostUsd(r, p);
    costUsd += usd;
    minutes += mins;
    if (exact) {
      exactJobs += 1;
      promptTok += r.prompt_tokens ?? 0;
      outputTok += r.output_tokens ?? 0;
      thoughtsTok += r.thoughts_tokens ?? 0;
    } else estimatedJobs += 1;

    const k: "web" | "line" | "recall" =
      r.source === "line" ? "line" : r.source === "recall" ? "recall" : "web";
    bySource[k].minutes += mins;
    bySource[k].jobs += 1;
    bySource[k].usd += usd;

    const d = dayStr(new Date(r.created_at));
    if (daily[d]) {
      daily[d].minutes += mins;
      daily[d].usd += usd;
    }
  }

  const costThb = usdToThb(costUsd, p);
  const r2 = (n: number) => Math.round(n * 100) / 100;

  const recallRecordingMinutes = bySource.recall.minutes;
  const recallPlatformUsd = recallCostUsd(recallRecordingMinutes * 60);
  const recallPlatformThb = usdToThb(recallPlatformUsd, p);
  const grandTotalThb = costThb + recallPlatformThb;
  const recallGeminiThb = usdToThb(bySource.recall.usd, p);
  const botCostPerMinuteThb =
    recallRecordingMinutes > 0
      ? Math.round(((recallGeminiThb + recallPlatformThb) / recallRecordingMinutes) * 10000) / 10000
      : 0;

  return {
    window_days: days,
    pricing: {
      model: "gemini-2.5-flash",
      audio_input_usd_per_m: p.audioInputUsdPerMTok,
      text_input_usd_per_m: p.textInputUsdPerMTok,
      output_usd_per_m: p.outputUsdPerMTok,
      audio_tokens_per_sec: p.audioTokensPerSec,
      output_tokens_per_job: p.outputTokensPerJob,
      usd_thb_rate: p.usdThbRate,
    },
    accuracy: {
      exact_jobs: exactJobs,
      estimated_jobs: estimatedJobs,
      exact_ratio: rows.length ? Math.round((exactJobs / rows.length) * 100) / 100 : 1,
    },
    tokens: { prompt: promptTok, output: outputTok, thoughts: thoughtsTok },
    totals: {
      minutes: Math.round(minutes),
      jobs: rows.length,
      cost_usd: Math.round(costUsd * 10000) / 10000,
      cost_thb: r2(costThb),
      cost_per_minute_thb: minutes > 0 ? Math.round((costThb / minutes) * 10000) / 10000 : 0,
    },
    by_source: {
      web: {
        minutes: Math.round(bySource.web.minutes),
        jobs: bySource.web.jobs,
        cost_thb: r2(usdToThb(bySource.web.usd, p)),
      },
      line: {
        minutes: Math.round(bySource.line.minutes),
        jobs: bySource.line.jobs,
        cost_thb: r2(usdToThb(bySource.line.usd, p)),
      },
      recall: {
        minutes: Math.round(bySource.recall.minutes),
        jobs: bySource.recall.jobs,
        cost_thb: r2(usdToThb(bySource.recall.usd, p)),
      },
    },
    recall_platform: {
      usd_per_hour: getRecallBotUsdPerHour(),
      recording_minutes: Math.round(recallRecordingMinutes),
      cost_usd: Math.round(recallPlatformUsd * 10000) / 10000,
      cost_thb: r2(recallPlatformThb),
      bot_cost_per_minute_thb: botCostPerMinuteThb,
    },
    grand_total: { cost_thb: r2(grandTotalThb) },
    daily: Object.entries(daily).map(([date, v]) => ({
      date,
      minutes: Math.round(v.minutes),
      cost_thb: r2(usdToThb(v.usd, p)),
    })),
  };
}
