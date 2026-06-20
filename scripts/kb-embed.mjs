#!/usr/bin/env node
/**
 * kb-embed.mjs — ingestion ของ "ผู้ช่วยโฟล์" (Flow RAG)
 *
 * อ่าน docs/knowledge/*.md → chunk ตามหัวข้อ (##) → embed ด้วย Gemini gemini-embedding-001
 * (taskType=RETRIEVAL_DOCUMENT, outputDimensionality=768) → ล้าง chunk เก่าของ source → upsert ผ่าน RPC
 *
 * รัน (อ่าน key จาก .env.local):
 *   node --env-file=apps/perpos/.env.local scripts/kb-embed.mjs
 * หรือ: pnpm kb:embed
 *
 * ไม่ต้องเพิ่ม dependency — ใช้ @supabase/supabase-js ที่ hoist ที่ root + fetch ใน Node
 */
import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createClient } from '@supabase/supabase-js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const KB_DIR = resolve(__dirname, '..', 'docs', 'knowledge');
const EMBED_MODEL = 'gemini-embedding-001';
const EMBED_DIM = 768; // gemini-embedding-001 รองรับ MRL → ตั้ง outputDimensionality=768 ให้ตรง schema

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE_ROLE = process.env.SUPABASE_SERVICE_ROLE_KEY;
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;

if (!SUPABASE_URL || !SERVICE_ROLE || !GEMINI_API_KEY) {
  console.error(
    '❌ ขาด env: ต้องมี NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, GEMINI_API_KEY\n' +
      '   รันด้วย: node --env-file=apps/perpos/.env.local scripts/kb-embed.mjs',
  );
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE, {
  auth: { persistSession: false },
});

/** แตกไฟล์ .md เป็น chunks ตามหัวข้อ ## — คืน { source, title, heading, content }[] */
function chunkMarkdown(source, raw) {
  const lines = raw.split('\n');
  let title = source;
  const titleLine = lines.find((l) => /^#\s+/.test(l));
  if (titleLine) title = titleLine.replace(/^#\s+/, '').trim();

  const chunks = [];
  let heading = null;
  let buf = [];
  const flush = () => {
    const body = buf.join('\n').trim();
    // ข้าม preamble ที่เป็น blockquote/ว่าง (ไม่มีเนื้อหาจริง) ก่อนหัวข้อ ## แรก
    if (heading === null && (!body || body.split('\n').every((l) => l.startsWith('>') || l === '' || l.startsWith('#')))) {
      buf = [];
      return;
    }
    if (!body) {
      buf = [];
      return;
    }
    // ใส่หัวข้อไว้ต้น content เพื่อให้ context การ retrieve ชัด
    const content = heading ? `${title} — ${heading}\n${body}` : `${title}\n${body}`;
    chunks.push({ source, title, heading: heading ?? title, content });
    buf = [];
  };

  for (const line of lines) {
    if (/^##\s+/.test(line)) {
      flush();
      heading = line.replace(/^##\s+/, '').trim();
    } else if (/^#\s+/.test(line)) {
      // title line — ไม่ใส่ใน body
    } else {
      buf.push(line);
    }
  }
  flush();
  return chunks;
}

/** เรียก Gemini embedContent (มี retry สั้น ๆ) */
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
  const files = readdirSync(KB_DIR).filter((f) => f.endsWith('.md'));
  if (files.length === 0) {
    console.error(`❌ ไม่พบไฟล์ .md ใน ${KB_DIR}`);
    process.exit(1);
  }
  console.log(`📚 พบ ${files.length} ไฟล์ใน docs/knowledge/`);

  let total = 0;
  for (const file of files) {
    const source = file.replace(/\.md$/, '');
    const raw = readFileSync(join(KB_DIR, file), 'utf8');
    const chunks = chunkMarkdown(source, raw);

    // ล้าง chunk เก่าของ source นี้ (idempotent re-run)
    const { error: delErr } = await supabase.from('kb_chunks').delete().eq('source', source);
    if (delErr) throw new Error(`delete ${source} ล้มเหลว: ${delErr.message}`);

    for (const c of chunks) {
      const vector = await embed(c.content);
      const tokenCount = Math.ceil(c.content.length / 4);
      const { error } = await supabase.rpc('upsert_kb_chunk', {
        p_source: c.source,
        p_title: c.title,
        p_heading: c.heading,
        p_content: c.content,
        p_embedding: vector,
        p_token_count: tokenCount,
      });
      if (error) throw new Error(`upsert (${source} / ${c.heading}) ล้มเหลว: ${error.message}`);
      total++;
    }
    console.log(`   ✓ ${source}: ${chunks.length} chunks`);
  }

  console.log(`\n✅ embed เสร็จ — รวม ${total} chunks เข้าตาราง kb_chunks`);
}

main().catch((e) => {
  console.error('\n❌ ล้มเหลว:', e.message);
  process.exit(1);
});
