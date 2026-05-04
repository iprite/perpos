"use client";

import React, { useCallback, useMemo, useState } from "react";
import { Button, Input, Textarea } from "rizzui";
import { Title, Text } from "rizzui/typography";

import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import { withBasePath } from "@/utils/base-path";

export default function AdminNewsAgentPage() {
  const supabase = useMemo(() => createSupabaseBrowserClient(), []);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [preview, setPreview] = useState<string | null>(null);

  const [topics, setTopics] = useState("เศรษฐกิจ\nเทคโนโลยี\nธุรกิจ\nประเทศไทย");
  const [sources, setSources] = useState("https://www.thaipbs.or.th/rss/news.xml\nhttps://www.bangkokpost.com/rss/data/topstories.xml");
  const [maxItems, setMaxItems] = useState("8");
  const [style, setStyle] = useState("bullet");

  const authHeader = useCallback(async () => {
    const { data } = await supabase.auth.getSession();
    const token = data.session?.access_token;
    if (!token) throw new Error("ยังไม่ได้เข้าสู่ระบบ");
    return { Authorization: `Bearer ${token}` };
  }, [supabase]);

  const runPreview = useCallback(async () => {
    setLoading(true);
    setError(null);
    setPreview(null);
    try {
      const headers = await authHeader();
      const res = await fetch(withBasePath("/api/admin/news-agent/preview"), {
        method: "POST",
        headers: { ...headers, "content-type": "application/json" },
        body: JSON.stringify({
          topics: topics
            .split("\n")
            .map((x) => x.trim())
            .filter(Boolean),
          sources: sources
            .split("\n")
            .map((x) => x.trim())
            .filter(Boolean)
            .map((value) => ({ type: "rss", value })),
          maxItems: Number(maxItems || 8),
          summaryStyle: style,
        }),
      });
      const json = await res.json().catch(() => null);
      if (!res.ok) {
        setError(String(json?.error ?? "preview_failed"));
        setLoading(false);
        return;
      }
      setPreview(String(json?.text ?? ""));
      setLoading(false);
    } catch (e: any) {
      setError(e?.message ?? "preview_failed");
      setLoading(false);
    }
  }, [authHeader, maxItems, sources, style, topics]);

  return (
    <div>
      <div>
        <Title as="h1" className="text-lg font-semibold text-gray-900">
          AI Agent: News Summary
        </Title>
        <Text className="mt-1 text-sm text-gray-600">ตั้งค่าแหล่งข่าวและรูปแบบสรุป แล้วทดลองรันก่อนส่ง</Text>
      </div>

      <div className="mt-5 grid grid-cols-1 gap-4 lg:grid-cols-2">
        <div className="rounded-2xl border border-gray-200 bg-white p-5">
          <Textarea label="Topics (1 บรรทัดต่อ 1 หัวข้อ)" value={topics} onChange={(e) => setTopics(e.target.value)} rows={6} disabled={loading} />
          <div className="mt-4">
            <Textarea label="Sources (RSS URL 1 บรรทัดต่อ 1 แหล่ง)" value={sources} onChange={(e) => setSources(e.target.value)} rows={6} disabled={loading} />
          </div>
          <div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-2">
            <Input label="Max items" value={maxItems} onChange={(e) => setMaxItems(e.target.value)} disabled={loading} />
            <Input label="Style (bullet/brief/detailed)" value={style} onChange={(e) => setStyle(e.target.value)} disabled={loading} />
          </div>
          <div className="mt-4 flex items-center gap-2">
            <Button className="bg-indigo-600 text-white hover:bg-indigo-500" onClick={() => void runPreview()} disabled={loading}>
              Preview
            </Button>
          </div>
          {error ? <div className="mt-4 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">{error}</div> : null}
        </div>

        <div className="rounded-2xl border border-gray-200 bg-white p-5">
          <div className="text-sm font-medium text-gray-900">ผลลัพธ์ Preview</div>
          <div className="mt-3 whitespace-pre-wrap rounded-xl border border-gray-200 bg-gray-50 p-4 text-sm text-gray-800">
            {preview ? preview : "ยังไม่ได้รัน"}
          </div>
        </div>
      </div>
    </div>
  );
}

