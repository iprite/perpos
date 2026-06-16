#!/usr/bin/env node
/**
 * stt-cost-report.mjs — ประมาณการต้นทุน Gemini ของฟีเจอร์แกะเสียง (CLI)
 *
 * อ่าน ledger `stt_usage_transactions` (net = debit − refund) แล้วคำนวณต้นทุน + ต้นทุน/นาที
 *
 * รัน:
 *   SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... node scripts/stt-cost-report.mjs
 * ตัวเลือก (env):
 *   STT_REPORT_DAYS=30                 ช่วงข้อมูล (default 30)
 *   STT_GEMINI_AUDIO_INPUT_USD_PER_M=1.0
 *   STT_GEMINI_OUTPUT_USD_PER_M=2.5
 *   STT_GEMINI_AUDIO_TOKENS_PER_SEC=32
 *   STT_GEMINI_OUTPUT_TOKENS_PER_JOB=3000
 *   STT_USD_THB_RATE=35
 *
 * ⚠️ ค่า default ของราคาต้องตรงกับ apps/perpos/src/lib/assistant/stt-cost.ts
 */

import { createRequire } from 'module';

const require = createRequire(new URL('../apps/perpos/package.json', import.meta.url));
const { createClient } = require('@supabase/supabase-js');

const num = (name, fb) => {
  const v = Number(process.env[name]);
  return Number.isFinite(v) && v > 0 ? v : fb;
};
const req = (name) => {
  const v = (process.env[name] ?? '').trim();
  if (!v) throw new Error(`Missing env: ${name}`);
  return v;
};

const pricing = {
  audioInputUsdPerMTok: num('STT_GEMINI_AUDIO_INPUT_USD_PER_M', 1.0),
  outputUsdPerMTok: num('STT_GEMINI_OUTPUT_USD_PER_M', 2.5),
  audioTokensPerSec: num('STT_GEMINI_AUDIO_TOKENS_PER_SEC', 32),
  outputTokensPerJob: num('STT_GEMINI_OUTPUT_TOKENS_PER_JOB', 3000),
  usdThbRate: num('STT_USD_THB_RATE', 35),
};

function costUsd(seconds, jobs) {
  const inputUsd = (Math.max(0, seconds) * pricing.audioTokensPerSec / 1_000_000) * pricing.audioInputUsdPerMTok;
  const outputUsd = (Math.max(0, jobs) * pricing.outputTokensPerJob / 1_000_000) * pricing.outputUsdPerMTok;
  return inputUsd + outputUsd;
}
const thb = (n, d = 2) => n.toLocaleString('th-TH', { minimumFractionDigits: d, maximumFractionDigits: d });

async function main() {
  const url = req('SUPABASE_URL');
  const key = req('SUPABASE_SERVICE_ROLE_KEY');
  const days = num('STT_REPORT_DAYS', 30);
  const since = new Date(Date.now() - days * 86400000).toISOString();
  const supabase = createClient(url, key, { auth: { persistSession: false } });

  // ดึง ledger ทั้งช่วง (paginate)
  const rows = [];
  const PAGE = 1000;
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await supabase
      .from('stt_usage_transactions')
      .select('kind, duration_seconds, source, created_at')
      .gte('created_at', since)
      .order('created_at', { ascending: true })
      .range(from, from + PAGE - 1);
    if (error) throw new Error(error.message);
    if (!data || data.length === 0) break;
    rows.push(...data);
    if (data.length < PAGE) break;
  }

  const sign = (k) => (k === 'refund' ? -1 : 1);
  let netSeconds = 0, netJobs = 0;
  const bySource = { web: { sec: 0, jobs: 0 }, line: { sec: 0, jobs: 0 } };
  for (const r of rows) {
    const s = sign(r.kind);
    netSeconds += (r.duration_seconds ?? 0) * s;
    netJobs += s;
    const k = r.source === 'line' ? 'line' : 'web';
    bySource[k].sec += (r.duration_seconds ?? 0) * s;
    bySource[k].jobs += s;
  }

  const minutes = netSeconds / 60;
  const totalUsd = costUsd(netSeconds, netJobs);
  const totalThb = totalUsd * pricing.usdThbRate;
  const perMinThb = minutes > 0 ? totalThb / minutes : 0;

  const line = (label, val) => console.log(`  ${label.padEnd(26)} ${val}`);
  console.log(`\n─── ต้นทุน Gemini แกะเสียง (${days} วันล่าสุด) ───────────────`);
  console.log(`  สมมติฐาน: audio $${pricing.audioInputUsdPerMTok}/M · output $${pricing.outputUsdPerMTok}/M · ${pricing.audioTokensPerSec} tok/วิ · ${pricing.outputTokensPerJob} tok/งาน · ${pricing.usdThbRate} THB/USD\n`);
  line('ledger rows', rows.length.toLocaleString());
  line('นาทีประมวลผล (net)', thb(minutes, 1));
  line('จำนวนงาน (net)', netJobs.toLocaleString());
  line('ต้นทุนรวม', `$${thb(totalUsd, 4)}  ≈  ฿${thb(totalThb)}`);
  line('ต้นทุนต่อนาที', `฿${thb(perMinThb, 4)}`);
  console.log('');
  for (const k of ['web', 'line']) {
    const b = bySource[k];
    line(`  • ${k}`, `${thb(b.sec / 60, 1)} นาที · ฿${thb(costUsd(b.sec, b.jobs) * pricing.usdThbRate)}`);
  }
  console.log('\n  ราคาขายแนะนำ/นาที (ตัวคูณกำไร):');
  for (const m of [3, 4, 5]) line(`  • ×${m}`, `฿${thb(perMinThb * m, 2)}  → แพ็ก 300 นาที ฿${thb(perMinThb * m * 300, 0)}`);
  console.log('');
}

main().catch((e) => { console.error('ERROR:', e.message); process.exit(1); });
