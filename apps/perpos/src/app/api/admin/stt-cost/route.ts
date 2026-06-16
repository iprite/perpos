/**
 * GET /api/admin/stt-cost — ต้นทุน Gemini ของฟีเจอร์แกะเสียง (super admin)
 *   ?days=30   ช่วงข้อมูล (default 30, max 365)
 *
 * ฐานข้อมูล: `transcription_jobs` (status=completed) ในช่วงที่เลือก
 *   - งานที่มี token จริง (prompt_tokens != null) → คิดต้นทุน "เป๊ะ" จาก usageMetadata
 *   - งานเก่าที่ยังไม่มี token → "ประมาณ" จาก duration_seconds
 * คิด cost ตอนอ่านด้วยราคาปัจจุบัน (lib/assistant/stt-cost, ปรับผ่าน env)
 */

import { NextRequest } from 'next/server';
import { requireAdmin } from '../../_lib/auth';
import { createAdminClient } from '../../_lib/supabase';
import { ok } from '../../_lib/response';
import { getSttPricing, estimateGeminiCostUsd, exactCostUsdFromTokens, usdToThb } from '@/lib/assistant/stt-cost';

const BKK = 'Asia/Bangkok';
const dayStr = (d: Date) => new Intl.DateTimeFormat('en-CA', { timeZone: BKK }).format(d);

type JobRow = {
  source: string | null;
  duration_seconds: number | null;
  created_at: string;
  prompt_tokens: number | null;
  audio_input_tokens: number | null;
  output_tokens: number | null;
  thoughts_tokens: number | null;
};

const pricing0 = () => getSttPricing();

/** ต้นทุน 1 งาน (USD) — เป๊ะถ้ามี token, ไม่งั้นประมาณจาก duration */
function jobCostUsd(r: JobRow, p: ReturnType<typeof getSttPricing>): { usd: number; exact: boolean } {
  if (r.prompt_tokens != null) {
    const audio = r.audio_input_tokens ?? r.prompt_tokens; // ไม่มี modality split → ถือว่าเป็นเสียงทั้งหมด
    return {
      usd: exactCostUsdFromTokens(
        { audioInputTokens: audio, textInputTokens: Math.max(0, r.prompt_tokens - audio), outputTokens: r.output_tokens ?? 0 },
        p,
      ),
      exact: true,
    };
  }
  return { usd: estimateGeminiCostUsd({ seconds: r.duration_seconds ?? 0, jobs: 1 }, p), exact: false };
}

export async function GET(req: NextRequest) {
  const auth = await requireAdmin(req);
  if (!auth.ok) return auth.res;

  const daysParam = Number(new URL(req.url).searchParams.get('days'));
  const days = Number.isFinite(daysParam) ? Math.min(365, Math.max(1, Math.round(daysParam))) : 30;
  const since = new Date(Date.now() - days * 86400000).toISOString();

  const admin = createAdminClient();
  const { data: jobs } = await admin
    .from('transcription_jobs')
    .select('source, duration_seconds, created_at, prompt_tokens, audio_input_tokens, output_tokens, thoughts_tokens')
    .eq('status', 'completed')
    .gte('created_at', since)
    .limit(20000);

  const rows = (jobs ?? []) as JobRow[];
  const p = pricing0();

  let costUsd = 0;
  let minutes = 0;
  let exactJobs = 0;
  let estimatedJobs = 0;
  let promptTok = 0;
  let outputTok = 0;
  let thoughtsTok = 0;

  const bySource: Record<'web' | 'line', { minutes: number; jobs: number; usd: number }> = {
    web: { minutes: 0, jobs: 0, usd: 0 },
    line: { minutes: 0, jobs: 0, usd: 0 },
  };
  const daily: Record<string, { minutes: number; usd: number }> = {};
  for (let i = days - 1; i >= 0; i--) daily[dayStr(new Date(Date.now() - i * 86400000))] = { minutes: 0, usd: 0 };

  for (const r of rows) {
    const mins = (r.duration_seconds ?? 0) / 60;
    const { usd, exact } = jobCostUsd(r, p);
    costUsd += usd;
    minutes += mins;
    if (exact) { exactJobs += 1; promptTok += r.prompt_tokens ?? 0; outputTok += r.output_tokens ?? 0; thoughtsTok += r.thoughts_tokens ?? 0; }
    else estimatedJobs += 1;

    const k: 'web' | 'line' = r.source === 'line' ? 'line' : 'web';
    bySource[k].minutes += mins; bySource[k].jobs += 1; bySource[k].usd += usd;

    const d = dayStr(new Date(r.created_at));
    if (daily[d]) { daily[d].minutes += mins; daily[d].usd += usd; }
  }

  const costThb = usdToThb(costUsd, p);
  const r2 = (n: number) => Math.round(n * 100) / 100;

  return ok({
    window_days: days,
    pricing: {
      model: 'gemini-2.5-flash',
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
      // สัดส่วนงานที่คิดต้นทุนจาก token จริง (1 = เป๊ะทั้งหมด)
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
      web: { minutes: Math.round(bySource.web.minutes), jobs: bySource.web.jobs, cost_thb: r2(usdToThb(bySource.web.usd, p)) },
      line: { minutes: Math.round(bySource.line.minutes), jobs: bySource.line.jobs, cost_thb: r2(usdToThb(bySource.line.usd, p)) },
    },
    daily: Object.entries(daily).map(([date, v]) => ({ date, minutes: Math.round(v.minutes), cost_thb: r2(usdToThb(v.usd, p)) })),
  });
}
