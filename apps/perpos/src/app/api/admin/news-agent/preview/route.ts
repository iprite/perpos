import { NextResponse } from "next/server";
import { z } from "zod";

import { assertCallerIsAdmin } from "../../users/_utils";
import { basicHeadlineSummary, fetchRssItems, summarizeWithOpenAI } from "@/lib/news/news-agent";

export const runtime = "nodejs";

const BodySchema = z.object({
  topics: z.array(z.string()).default([]),
  sources: z
    .array(
      z.object({
        type: z.enum(["rss", "url"]),
        value: z.string().min(1),
      }),
    )
    .default([]),
  maxItems: z.number().int().min(1).max(30).default(10),
  summaryStyle: z.enum(["bullet", "brief", "detailed"]).default("bullet"),
});

export async function POST(req: Request) {
  const guard = await assertCallerIsAdmin(req);
  if (!guard.ok) return NextResponse.json({ error: guard.message }, { status: guard.status });

  const json = await req.json().catch(() => null);
  const parsed = BodySchema.safeParse(json);
  if (!parsed.success) return NextResponse.json({ error: "invalid_body" }, { status: 400 });

  const sources = parsed.data.sources.filter((s) => s.type === "rss").map((s) => s.value);
  const maxItems = parsed.data.maxItems;
  const perSource = Math.max(1, Math.ceil(maxItems / Math.max(1, sources.length)));

  const lists = await Promise.all(sources.map((u) => fetchRssItems(u, perSource).catch(() => [])));
  const items = lists.flat().slice(0, maxItems);

  const key = process.env.OPENAI_API_KEY ?? "";
  if (!key) {
    return NextResponse.json({ ok: true, text: basicHeadlineSummary(items, Math.min(8, maxItems)) });
  }

  try {
    const text = await summarizeWithOpenAI({
      apiKey: key,
      topics: parsed.data.topics,
      items,
      style: parsed.data.summaryStyle,
    });
    return NextResponse.json({ ok: true, text });
  } catch (e: any) {
    return NextResponse.json({ ok: true, text: basicHeadlineSummary(items, Math.min(8, maxItems)), warn: String(e?.message ?? "") });
  }
}

