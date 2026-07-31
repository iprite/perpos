/** คลังความรู้ของผู้ช่วยขาย TMC — list / create */
import { NextRequest, NextResponse } from "next/server";
import { requireTmcMember, canWriteFinance } from "../_lib";

export async function GET(req: NextRequest) {
  const orgId = req.nextUrl.searchParams.get("orgId") ?? "";
  if (!orgId) return NextResponse.json({ error: "missing orgId" }, { status: 400 });

  const auth = await requireTmcMember(req, orgId);
  if (!auth.ok) return auth.res;

  const { data, error } = await auth.rls
    .from("tmc_kb_articles")
    .select(
      "id, category, title, content, keywords, is_active, sort_order, embedded_at, updated_at",
    )
    .eq("org_id", orgId)
    .order("sort_order")
    .order("title");

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data ?? []);
}

export async function POST(req: NextRequest) {
  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const orgId = String(body.orgId ?? "");
  const title = String(body.title ?? "").trim();
  const content = String(body.content ?? "").trim();
  if (!orgId || !title || !content) {
    return NextResponse.json({ error: "ต้องมี orgId, title และ content" }, { status: 400 });
  }

  const auth = await requireTmcMember(req, orgId);
  if (!auth.ok) return auth.res;
  if (!canWriteFinance(auth.role))
    return NextResponse.json({ error: "ไม่มีสิทธิ์" }, { status: 403 });

  const { data, error } = await auth.rls
    .from("tmc_kb_articles")
    .insert({
      org_id: orgId,
      title,
      content,
      category: String(body.category ?? "ทั่วไป").trim() || "ทั่วไป",
      keywords: Array.isArray(body.keywords) ? (body.keywords as string[]).map(String) : [],
      sort_order: Number(body.sortOrder ?? 0) || 0,
      is_active: body.isActive === false ? false : true,
      created_by: auth.userId,
      updated_by: auth.userId,
    })
    .select("id")
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}
