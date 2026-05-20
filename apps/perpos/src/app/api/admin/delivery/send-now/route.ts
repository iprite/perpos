import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '../../../_lib/auth';
import { createAdminClient } from '../../../_lib/supabase';

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

  const body = await req.json().catch(() => ({})) as { toUserIds?: string[] };
  const toUserIds: string[] = Array.isArray(body.toUserIds) ? body.toUserIds : [];

  const admin = createAdminClient();

  // Resolve LINE user IDs
  let lineIds: (string | null)[];
  if (toUserIds.length) {
    const results = await Promise.all(
      toUserIds.map((uid) =>
        admin.from('profiles').select('line_user_id').eq('id', uid).maybeSingle()
          .then((r) => (r.data as Record<string, string> | null)?.line_user_id ?? null),
      ),
    );
    lineIds = results;
  } else {
    const { data } = await admin
      .from('profiles')
      .select('line_user_id')
      .not('line_user_id', 'is', null)
      .eq('is_active', true);
    lineIds = (data ?? []).map((p: Record<string, string>) => p.line_user_id);
  }

  const validIds = lineIds.filter((id): id is string => Boolean(id));
  if (!validIds.length) return NextResponse.json({ ok: true, sent: 0 });

  // Build news text
  const cfgRes = await admin
    .from('news_agent_configs')
    .select('topics, sources, summary_style, max_items')
    .order('updated_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  const cfg = cfgRes.data as Record<string, unknown> | null;
  const sources = Array.isArray(cfg?.sources) ? (cfg.sources as Record<string, string>[]) : [];
  const maxItems = Math.min(30, Math.max(1, Number(cfg?.max_items ?? 8)));
  const perSource = Math.max(1, Math.ceil(maxItems / Math.max(1, sources.length)));
  const rssUrls = sources.map((s) => String(s?.value ?? '')).filter(Boolean);
  const lists = await Promise.all(rssUrls.map((u) => fetchRssItems(u, perSource)));
  const items = lists.flat().slice(0, maxItems);

  let text = items.slice(0, 8).map((it, i) => `${i + 1}. ${it.title}\n${it.link}`).join('\n\n');

  const openaiKey = process.env.OPENAI_API_KEY ?? '';
  if (openaiKey && items.length) {
    try {
      const topics = Array.isArray(cfg?.topics) ? (cfg.topics as string[]) : [];
      const style = (cfg?.summary_style as string) || 'bullet';
      const titleList = items.map((x) => `- ${x.title} (${x.link})`).join('\n');
      const model = process.env.OPENAI_MODEL || 'gpt-4o-mini';
      const aiRes = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: { Authorization: `Bearer ${openaiKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model,
          messages: [
            { role: 'system', content: 'คุณคือผู้ช่วยสรุปข่าวภาษาไทยสำหรับส่งใน LINE ให้กระชับ อ่านง่าย' },
            { role: 'user', content: `หัวข้อ: ${topics.join(', ')}\nสไตล์: ${style}\n${titleList}` },
          ],
          temperature: 0.5,
          max_tokens: 800,
        }),
      });
      if (aiRes.ok) {
        const aiData = await aiRes.json() as { choices: { message: { content: string } }[] };
        text = aiData.choices[0]?.message?.content ?? text;
      }
    } catch { /* fallback to basic text */ }
  }

  const accessToken = process.env.LINE_MESSAGING_CHANNEL_ACCESS_TOKEN ?? '';
  if (!accessToken) return NextResponse.json({ error: 'LINE token not configured' }, { status: 500 });

  await fetch('https://api.line.me/v2/bot/message/multicast', {
    method: 'POST',
    headers: { authorization: `Bearer ${accessToken}`, 'content-type': 'application/json' },
    body: JSON.stringify({ to: validIds, messages: [{ type: 'text', text: text || 'ไม่พบข่าว' }] }),
  });

  return NextResponse.json({ ok: true, sent: validIds.length });
}
