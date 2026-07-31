/** คลังความรู้ของผู้ช่วยขาย TMC — แก้ไข / ลบ (ลบบทความ = chunk ถูก cascade ตามไปด้วย) */
import { NextRequest, NextResponse } from "next/server";
import { requireTmcMember, canWriteFinance } from "../../_lib";
import { createAdminClient } from "../../../_lib/supabase";
import { embedArticleById } from "@/lib/tmc/sales-bot";

async function guard(req: NextRequest, orgId: string) {
  if (!orgId) return { error: NextResponse.json({ error: "missing orgId" }, { status: 400 }) };
  const auth = await requireTmcMember(req, orgId);
  if (!auth.ok) return { error: auth.res };
  if (!canWriteFinance(auth.role)) {
    return { error: NextResponse.json({ error: "ไม่มีสิทธิ์" }, { status: 403 }) };
  }
  return { auth };
}

export async function PATCH(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const g = await guard(req, String(body.orgId ?? ""));
  if (g.error) return g.error;

  // กู้คืนเนื้อหาก่อนถูกเขียนทับจากช่องทาง LINE (AI เรียบเรียงผิดได้ และไม่มีขั้นตอนยืนยัน)
  if (body.restorePrevious === true) {
    const { data: cur } = await g
      .auth!.rls.from("tmc_kb_articles")
      .select("previous_content")
      .eq("id", id)
      .eq("org_id", String(body.orgId))
      .maybeSingle();
    const prev = (cur as { previous_content: string | null } | null)?.previous_content;
    if (!prev) return NextResponse.json({ error: "ไม่มีเนื้อหาเดิมให้กู้คืน" }, { status: 400 });

    const { error } = await g
      .auth!.rls.from("tmc_kb_articles")
      .update({
        content: prev,
        previous_content: null,
        embedded_at: null,
        updated_at: new Date().toISOString(),
        updated_by: g.auth!.userId,
      })
      .eq("id", id)
      .eq("org_id", String(body.orgId));
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    const embedded = await embedArticleById(createAdminClient(), id);
    return NextResponse.json({ ok: true, restored: true, embedded });
  }

  const patch: Record<string, unknown> = {
    updated_at: new Date().toISOString(),
    updated_by: g.auth!.userId,
  };
  if (typeof body.title === "string") patch.title = body.title.trim();
  if (typeof body.content === "string") patch.content = body.content.trim();
  if (typeof body.category === "string") patch.category = body.category.trim() || "ทั่วไป";
  if (Array.isArray(body.keywords)) patch.keywords = (body.keywords as string[]).map(String);
  if (typeof body.isActive === "boolean") patch.is_active = body.isActive;
  if (body.sortOrder !== undefined) patch.sort_order = Number(body.sortOrder) || 0;

  // แก้เนื้อหาแล้ว embedding เดิมใช้ไม่ได้ → ล้าง embedded_at ให้ UI ขึ้นป้าย "รออัปเดตความรู้"
  if (patch.content !== undefined || patch.title !== undefined || patch.keywords !== undefined) {
    patch.embedded_at = null;
  }

  const { error } = await g
    .auth!.rls.from("tmc_kb_articles")
    .update(patch)
    .eq("id", id)
    .eq("org_id", String(body.orgId));

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // เนื้อหาเปลี่ยน = ต้องฝังใหม่ ทำให้เลยตรงนี้ ไม่ต้องรอคนกดปุ่ม
  const embedded =
    patch.embedded_at === null ? await embedArticleById(createAdminClient(), id) : true;
  return NextResponse.json({ ok: true, embedded });
}

export async function DELETE(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const orgId = req.nextUrl.searchParams.get("orgId") ?? "";
  const g = await guard(req, orgId);
  if (g.error) return g.error;

  const { error } = await g
    .auth!.rls.from("tmc_kb_articles")
    .delete()
    .eq("id", id)
    .eq("org_id", orgId);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
