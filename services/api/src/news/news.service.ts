import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

export interface NewsItem {
  title: string;
  link: string;
  publishedAt: string | null;
  source: string;
}

@Injectable()
export class NewsService {
  constructor(private readonly config: ConfigService) {}
  async fetchRssItems(url: string, maxItems: number): Promise<NewsItem[]> {
    const normalizedUrl = this.normalizeUrl(url);
    if (!normalizedUrl) return [];

    const res = await fetch(normalizedUrl, { cache: 'no-store' } as RequestInit);
    if (!res.ok) return [];
    const xml = await res.text();

    const items: NewsItem[] = [];
    const blocks = xml.split(/<item\b[\s\S]*?>/i).slice(1);
    for (const b of blocks) {
      const itemXml = b.split(/<\/item>/i)[0] ?? '';
      const titleRaw =
        this.pickBetween(itemXml, '<title>', '</title>') ??
        this.pickBetween(itemXml, '<title><![CDATA[', ']]></title>') ??
        '';
      const linkRaw = this.pickBetween(itemXml, '<link>', '</link>') ?? '';
      const pubRaw =
        this.pickBetween(itemXml, '<pubDate>', '</pubDate>') ??
        this.pickBetween(itemXml, '<published>', '</published>') ??
        this.pickBetween(itemXml, '<updated>', '</updated>');

      const title = this.decodeXml(String(titleRaw).trim()).replace(/\s+/g, ' ');
      const link = String(linkRaw).trim();
      if (!title || !link) continue;
      items.push({ title, link, publishedAt: pubRaw ? String(pubRaw).trim() : null, source: normalizedUrl });
      if (items.length >= maxItems) break;
    }
    return items;
  }

  basicHeadlineSummary(items: NewsItem[], maxLines = 8): string {
    const lines = items.slice(0, maxLines).map((it, idx) => `${idx + 1}. ${it.title}\n${it.link}`);
    return lines.length ? lines.join('\n\n') : 'ไม่พบข่าวจากแหล่งที่ตั้งค่าไว้';
  }

  async summarizeWithOpenAI(args: {
    apiKey: string;
    topics: string[];
    items: NewsItem[];
    style: 'bullet' | 'brief' | 'detailed';
  }): Promise<string> {
    const model = this.config.get<string>('OPENAI_MODEL') || 'gpt-4o-mini';
    const titles = args.items.map((x) => `- ${x.title} (${x.link})`).join('\n');

    const system =
      'คุณคือผู้ช่วยสรุปข่าวภาษาไทยสำหรับส่งใน LINE ให้กระชับ อ่านง่าย และอ้างอิงลิงก์ต้นทางเสมอ';
    const user =
      `หัวข้อที่สนใจ: ${args.topics.length ? args.topics.join(', ') : '(ไม่ระบุ)'}\n` +
      `สไตล์: ${args.style}\n` +
      `ช่วยสรุปข่าวจากรายการนี้เป็นภาษาไทย: \n${titles}`;

    const res = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${args.apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model,
        messages: [
          { role: 'system', content: system },
          { role: 'user', content: user },
        ],
        temperature: 0.5,
        max_tokens: 800,
      }),
    });

    if (!res.ok) throw new Error(`OpenAI error: ${res.status}`);
    const data = (await res.json()) as { choices: { message: { content: string } }[] };
    return data.choices[0]?.message?.content ?? '';
  }

  private normalizeUrl(u: string): string | null {
    try {
      return new URL(u).toString();
    } catch {
      return null;
    }
  }

  private pickBetween(s: string, start: string, end: string): string | null {
    const i = s.indexOf(start);
    if (i < 0) return null;
    const j = s.indexOf(end, i + start.length);
    if (j < 0) return null;
    return s.slice(i + start.length, j);
  }

  private decodeXml(text: string): string {
    return text
      .replaceAll('&amp;', '&')
      .replaceAll('&lt;', '<')
      .replaceAll('&gt;', '>')
      .replaceAll('&quot;', '"')
      .replaceAll('&#39;', "'");
  }
}
