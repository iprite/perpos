#!/usr/bin/env node
/**
 * bi-embed.mjs — ฝัง embedding ของ semantic layer (BI Chat)
 *
 * อ่าน `bi_metrics` → ประกอบข้อความ (label_th + synonyms + definition_th + includes/excludes)
 * → embed ด้วย Gemini `gemini-embedding-001` (taskType=RETRIEVAL_DOCUMENT, 768 มิติ)
 * → เขียนกลับผ่าน RPC `upsert_bi_metric_embedding` (service role เท่านั้น)
 *
 * ⚠️ ฝั่งคำถามใช้ RETRIEVAL_QUERY + 768 (`lib/ai/client.ts` → `aiEmbed`) — ต้องตรงกัน
 * ⚠️ แก้ label_th / synonyms / definition_th ของ metric แล้ว **ต้องรัน `pnpm bi:embed --all`**
 *    — โหมดปกติดูแค่ "ยังไม่มี embedding" เท่านั้น ไม่ได้เทียบวันที่แก้ไข จึงจะข้าม metric
 *    ที่แก้ข้อความไปแล้ว (embedding เก่าค้าง → ค้นหาไม่ตรงคำใหม่)
 *
 * รัน:  pnpm bi:embed
 *   (= node --env-file=apps/perpos/.env.local scripts/bi-embed.mjs)
 * ตัวเลือก: --all  = ฝังใหม่ทุกตัว (ค่าเริ่มต้น = เฉพาะตัวที่ยังไม่มี embedding เท่านั้น)
 */
import { createClient } from '@supabase/supabase-js';

const EMBED_MODEL = 'gemini-embedding-001';
const EMBED_DIM = 768;

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? process.env.SUPABASE_URL;
const SERVICE_ROLE = process.env.SUPABASE_SERVICE_ROLE_KEY;
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;

if (!SUPABASE_URL || !SERVICE_ROLE || !GEMINI_API_KEY) {
  console.error(
    '❌ ขาด env: ต้องมี NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, GEMINI_API_KEY\n' +
      '   รันด้วย: node --env-file=apps/perpos/.env.local scripts/bi-embed.mjs',
  );
  process.exit(1);
}

const embedAll = process.argv.includes('--all');
const supabase = createClient(SUPABASE_URL, SERVICE_ROLE, { auth: { persistSession: false } });

/** ข้อความที่ใช้ฝัง — ต้องสะท้อน "คำที่ผู้ใช้ใช้เรียกจริง" (synonyms) ให้มากที่สุด */
function buildDocument(m) {
  return [
    m.label_th,
    (m.synonyms ?? []).join(' · '),
    m.definition_th,
    (m.includes ?? []).length ? `นับรวม: ${(m.includes ?? []).join(' · ')}` : '',
    (m.excludes ?? []).length ? `ไม่นับ: ${(m.excludes ?? []).join(' · ')}` : '',
    `หน่วย: ${m.unit}`,
    `ขอบเขต: ${m.module_scope}`,
  ]
    .filter(Boolean)
    .join('\n');
}

async function embed(text, attempt = 0) {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${EMBED_MODEL}:embedContent?key=${GEMINI_API_KEY}`;
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      model: `models/${EMBED_MODEL}`,
      content: { parts: [{ text }] },
      taskType: 'RETRIEVAL_DOCUMENT',
      outputDimensionality: EMBED_DIM,
    }),
  });
  if (!res.ok) {
    const body = await res.text();
    if ((res.status === 429 || res.status >= 500) && attempt < 4) {
      const wait = 1000 * 2 ** attempt;
      console.warn(`   ⚠️  embed ${res.status} → retry ใน ${wait}ms`);
      await new Promise((r) => setTimeout(r, wait));
      return embed(text, attempt + 1);
    }
    throw new Error(`embed failed ${res.status}: ${body}`);
  }
  const json = await res.json();
  const values = json?.embedding?.values;
  if (!Array.isArray(values) || values.length !== EMBED_DIM) {
    throw new Error(`embed dim ผิด: ได้ ${values?.length} ต้องการ ${EMBED_DIM}`);
  }
  return values;
}

async function main() {
  const { data, error } = await supabase
    .from('bi_metrics')
    .select(
      'key, label_th, definition_th, synonyms, includes, excludes, unit, module_scope, status, embedding, updated_at',
    )
    .neq('status', 'deprecated')
    .order('key', { ascending: true });

  if (error) throw new Error(`อ่าน bi_metrics ไม่สำเร็จ: ${error.message}`);
  const metrics = data ?? [];
  if (metrics.length === 0) {
    console.error('❌ ไม่พบ metric ใน bi_metrics (ยัง apply migration seed หรือยัง?)');
    process.exit(1);
  }

  const targets = embedAll ? metrics : metrics.filter((m) => !m.embedding);
  console.log(
    `📊 metric ทั้งหมด ${metrics.length} ตัว · จะฝัง ${targets.length} ตัว${embedAll ? ' (--all)' : ' (เฉพาะที่ยังไม่มี embedding)'}`,
  );
  if (!embedAll) {
    console.log(
      '⚠️  โหมดปกติไม่เทียบวันที่แก้ไข — ถ้าเพิ่งแก้ label_th/synonyms/definition_th ให้ใช้ `pnpm bi:embed --all`',
    );
  }
  if (targets.length === 0) {
    console.log('✅ ทุก metric มี embedding แล้ว — ใช้ --all เพื่อฝังใหม่ทั้งหมด');
    return;
  }

  let done = 0;
  for (const m of targets) {
    const vector = await embed(buildDocument(m));
    const { error: rpcErr } = await supabase.rpc('upsert_bi_metric_embedding', {
      p_key: m.key,
      p_embedding: vector,
    });
    if (rpcErr) throw new Error(`upsert (${m.key}) ล้มเหลว: ${rpcErr.message}`);
    done++;
    console.log(`   ✓ ${m.key} [${m.status}]`);
  }

  console.log(`\n✅ ฝัง embedding เสร็จ ${done} metric — ผู้ช่วยจะค้นเจอตัวชี้วัดเหล่านี้แล้ว`);
  console.log('   หมายเหตุ: ตอบได้เฉพาะ metric ที่ status = verified เท่านั้น');
}

main().catch((e) => {
  console.error('\n❌ ล้มเหลว:', e.message);
  process.exit(1);
});
