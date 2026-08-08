/**
 * อัปเดตความรู้ให้บอท — ฝัง (embed) บทความที่ยังไม่ได้ฝัง หรือแก้ไขหลังฝังล่าสุด
 *
 * body: { orgId, articleId? , all?: boolean }
 *   ไม่ระบุ articleId → ฝังเฉพาะบทความที่ค้าง (embedded_at IS NULL)
 *   all: true         → ฝังใหม่ทั้งหมด (ใช้ตอนย้าย/แก้ model)
 *
 * ⚠️ เขียน chunk ผ่าน RPC replace_tmc_kb_chunks ที่ REVOKE จาก authenticated
 *    จึงต้องใช้ service-role client — แต่ด่านสิทธิ์อยู่ที่ requireTmcMember ก่อนเสมอ
 */
import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "../../../_lib/supabase";
import { requireTmcMember, canManageSalesBot } from "../../_lib";
import { embedArticle, type KbArticleInput } from "@/lib/tmc/sales-bot";
import { setUsageContext } from "@/lib/usage/context";

export const maxDuration = 60;

export async function POST(req: NextRequest) {
  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const orgId = String(body.orgId ?? "");
  if (!orgId) return NextResponse.json({ error: "missing orgId" }, { status: 400 });

  const auth = await requireTmcMember(req, orgId);
  if (!auth.ok) return auth.res;
  if (!canManageSalesBot(auth.role))
    return NextResponse.json({ error: "ไม่มีสิทธิ์" }, { status: 403 });
  // ผูกต้นทุน Gemini embed ของการฝังคลังความรู้เข้ากับ org นี้
  setUsageContext({ orgId, profileId: auth.userId, feature: "tmc.kb_embed" });

  if (!process.env.GEMINI_API_KEY) {
    return NextResponse.json(
      { error: "ยังไม่ได้ตั้งค่า GEMINI_API_KEY บนเซิร์ฟเวอร์" },
      { status: 503 },
    );
  }

  const admin = createAdminClient();
  let q = admin
    .from("tmc_kb_articles")
    .select("id, title, category, content, keywords, embedded_at, updated_at")
    .eq("org_id", orgId)
    .eq("is_active", true);

  if (body.articleId) q = q.eq("id", String(body.articleId));

  const { data, error } = await q;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  type Row = KbArticleInput & { embedded_at: string | null; updated_at: string };
  const all = (data ?? []) as Row[];
  // "ค้าง" = ยังไม่เคยฝัง หรือแก้เนื้อหาหลังฝังครั้งล่าสุด
  // (เทียบสองคอลัมน์ใน PostgREST ตรง ๆ ไม่ได้ จึงกรองฝั่งนี้)
  const articles: KbArticleInput[] =
    body.articleId || body.all === true
      ? all
      : all.filter((a) => !a.embedded_at || new Date(a.embedded_at) < new Date(a.updated_at));
  let chunks = 0;
  const failed: { title: string; error: string }[] = [];

  for (const a of articles) {
    try {
      chunks += await embedArticle(admin, a);
    } catch (e) {
      failed.push({ title: a.title, error: e instanceof Error ? e.message : String(e) });
    }
  }

  return NextResponse.json({
    ok: failed.length === 0,
    articles: articles.length - failed.length,
    chunks,
    failed,
    total: all.length,
  });
}
