import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '../../../_lib/auth';

async function fetchRssItems(url: string, max: number) {
  try {
    const res = await fetch(url, { cache: 'no-store' });
    if (!res.ok) return [];
    const xml = await res.text();
    const items: { title: string; link: string }[] = [];
    const blocks = xml.split(/<item\b[\s\S]*?>/i).slice(1);
    for (const b of blocks) {
      const itemXml = b.split(/<\/item>/i)[0] ?? '';
      const title = (itemXml.match(/<title><!\[CDATA\[([\s\S]*?)\]\]>/i)?.[1] ?? itemXml.match(/<title>([\s\S]*?)<\/title>/i)?.[1] ?? '').trim();
      const link = (itemXml.match(/<link>([\s\S]*?)<\/link>/i)?.[1] ?? '').trim();
      if (title && link) items.push({ title, link });
      if (items.length >= max) break;
    }
    return items;
  } catch { return []; }
}

export async function POST(req: NextRequest) {
  const auth = await requireAdmin(req);
  if (!auth.ok) return auth.res;

  const body = await req.json().catch(() => ({})) as {
    topics?: string[];
    sources?: { type: string; value: string }[];
    maxItems?: number;
    summaryStyle?: string;
  };

  const topics = Array.isArray(body.topics) ? body.topics : [];
  const sources = Array.isArray(body.sources) ? body.sources : [];
  const maxItems = Math.min(30, Math.max(1, Number(body.maxItems ?? 8)));
  const style = body.summaryStyle ?? 'bullet';

  const rssUrls = sources.filter((s) => s.type === 'rss').map((s) => s.value).filter(Boolean);
  const perSource = Math.max(1, Math.ceil(maxItems / Math.max(1, rssUrls.length)));
  const lists = await Promise.all(rssUrls.map((u) => fetchRssItems(u, perSource)));
  const items = lists.flat().slice(0, maxItems);

  const key = process.env.OPENAI_API_KEY ?? '';
  if (!key || !items.length) {
    const text = items.slice(0, 8).map((it, i) => `${i + 1}. ${it.title}\n${it.link}`).join('\n\n') || 'ไม่พบข่าว';
    return NextResponse.json({ ok: true, text });
  }

  const model = process.env.OPENAI_MODEL || 'gpt-4o-mini';
  const titleList = items.map((x) => `- ${x.title} (${x.link})`).join('\n');
  const aiRes = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model,
      messages: [
        { role: 'system', content: 'คุณคือผู้ช่วยสรุปข่าวภาษาไทยสำหรับส่งใน LINE ให้กระชับ อ่านง่าย และอ้างอิงลิงก์ต้นทางเสมอ' },
        { role: 'user', content: `หัวข้อ: ${topics.join(', ')}\nสไตล์: ${style}\n${titleList}` },
      ],
      temperature: 0.5,
      max_tokens: 800,
    }),
  });

  if (!aiRes.ok) return NextResponse.json({ error: 'OpenAI error' }, { status: 502 });
  const aiData = await aiRes.json() as { choices: { message: { content: string } }[] };
  return NextResponse.json({ ok: true, text: aiData.choices[0]?.message?.content ?? '' });
}
