export type NewsSource = { type: "rss" | "url"; value: string };

export type NewsItem = { title: string; link: string; publishedAt: string | null; source: string };

function normalizeUrl(u: string) {
  try {
    return new URL(u).toString();
  } catch {
    return null;
  }
}

function pickBetween(s: string, start: string, end: string) {
  const i = s.indexOf(start);
  if (i < 0) return null;
  const j = s.indexOf(end, i + start.length);
  if (j < 0) return null;
  return s.slice(i + start.length, j);
}

function decodeXml(text: string) {
  return text
    .replaceAll("&amp;", "&")
    .replaceAll("&lt;", "<")
    .replaceAll("&gt;", ">")
    .replaceAll("&quot;", '"')
    .replaceAll("&#39;", "'");
}

export async function fetchRssItems(url: string, maxItems: number): Promise<NewsItem[]> {
  const u = normalizeUrl(url);
  if (!u) return [];
  const res = await fetch(u, { cache: "no-store" });
  if (!res.ok) return [];
  const xml = await res.text();

  const items: NewsItem[] = [];
  const blocks = xml.split(/<item\b[\s\S]*?>/i).slice(1);
  for (const b of blocks) {
    const itemXml = b.split(/<\/item>/i)[0] ?? "";
    const titleRaw = pickBetween(itemXml, "<title>", "</title>") ?? pickBetween(itemXml, "<title><![CDATA[", "]]></title>") ?? "";
    const linkRaw = pickBetween(itemXml, "<link>", "</link>") ?? "";
    const pubRaw =
      pickBetween(itemXml, "<pubDate>", "</pubDate>") ??
      pickBetween(itemXml, "<published>", "</published>") ??
      pickBetween(itemXml, "<updated>", "</updated>");

    const title = decodeXml(String(titleRaw).trim()).replace(/\s+/g, " ");
    const link = String(linkRaw).trim();
    if (!title || !link) continue;
    items.push({ title, link, publishedAt: pubRaw ? String(pubRaw).trim() : null, source: u });
    if (items.length >= maxItems) break;
  }
  return items;
}

export function basicHeadlineSummary(items: NewsItem[], maxLines = 8) {
  const lines = items.slice(0, maxLines).map((it, idx) => `${idx + 1}. ${it.title}\n${it.link}`);
  return lines.length ? lines.join("\n\n") : "ไม่พบข่าวจากแหล่งที่ตั้งค่าไว้";
}

export async function summarizeWithOpenAI(args: {
  apiKey: string;
  topics: string[];
  items: NewsItem[];
  style: "bullet" | "brief" | "detailed";
}) {
  const model = process.env.OPENAI_MODEL || "gpt-4o-mini";
  const titles = args.items.map((x) => `- ${x.title} (${x.link})`).join("\n");

  const system =
    "คุณคือผู้ช่วยสรุปข่าวภาษาไทยสำหรับส่งใน LINE ให้กระชับ อ่านง่าย และอ้างอิงลิงก์ต้นทางเสมอ";
  const user =
    `หัวข้อที่สนใจ: ${args.topics.length ? args.topics.join(", ") : "(ไม่ระบุ)"}\n` +
    `สไตล์: ${args.style}\n` +
    `ช่วยสรุปข่าวจากรายการนี้เป็นภาษาไทย: \n${titles}`;

  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      authorization: `Bearer ${args.apiKey}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({
      model,
      messages: [
        { role: "system", content: system },
        { role: "user", content: user },
      ],
      temperature: 0.4,
    }),
  });
  if (!res.ok) {
    const t = await res.text().catch(() => "");
    throw new Error(t || `openai_error_${res.status}`);
  }
  const json = (await res.json().catch(() => null)) as any;
  const text = String(json?.choices?.[0]?.message?.content ?? "").trim();
  if (!text) throw new Error("empty_summary");
  return text;
}

