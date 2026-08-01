/** กฎประจำตัวบอทผู้ช่วยขาย TMC — แก้ไข / เปิด-ปิด / กู้คืน / ลบ */
import { NextRequest, NextResponse } from "next/server";
import { requireTmcMember, canManageSalesBot } from "../../_lib";
import { isUnsafeRule, normalizeRule } from "@/lib/tmc/bot-rules";

async function guard(req: NextRequest, orgId: string) {
  if (!orgId) return { error: NextResponse.json({ error: "missing orgId" }, { status: 400 }) };
  const auth = await requireTmcMember(req, orgId);
  if (!auth.ok) return { error: auth.res };
  if (!canManageSalesBot(auth.role)) {
    return { error: NextResponse.json({ error: "ไม่มีสิทธิ์" }, { status: 403 }) };
  }
  return { auth };
}

export async function PATCH(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const orgId = String(body.orgId ?? "");
  const g = await guard(req, orgId);
  if (g.error) return g.error;
  const rls = g.auth!.rls;

  // กู้คืนข้อความก่อนถูกเขียนทับจากกลุ่ม LINE (AI เรียบเรียงคำสั่งผิดได้)
  if (body.restorePrevious === true) {
    const { data: cur } = await rls
      .from("tmc_bot_rules")
      .select("previous_rule")
      .eq("id", id)
      .eq("org_id", orgId)
      .maybeSingle();
    const prev = (cur as { previous_rule: string | null } | null)?.previous_rule;
    if (!prev) return NextResponse.json({ error: "ไม่มีข้อความเดิมให้กู้คืน" }, { status: 400 });

    const { error } = await rls
      .from("tmc_bot_rules")
      .update({
        rule: prev,
        previous_rule: null,
        updated_at: new Date().toISOString(),
        updated_by: g.auth!.userId,
      })
      .eq("id", id)
      .eq("org_id", orgId);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true, restored: true });
  }

  const patch: Record<string, unknown> = {
    updated_at: new Date().toISOString(),
    updated_by: g.auth!.userId,
  };
  if (typeof body.rule === "string") {
    const rule = normalizeRule(body.rule);
    if (!rule) return NextResponse.json({ error: "ข้อความกฎว่างไม่ได้" }, { status: 400 });
    const unsafe = isUnsafeRule(rule);
    if (unsafe) return NextResponse.json({ error: unsafe }, { status: 400 });
    patch.rule = rule;
  }
  if (typeof body.isActive === "boolean") patch.is_active = body.isActive;
  if (body.sortOrder !== undefined) patch.sort_order = Number(body.sortOrder) || 0;

  const { error } = await rls.from("tmc_bot_rules").update(patch).eq("id", id).eq("org_id", orgId);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}

export async function DELETE(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const orgId = req.nextUrl.searchParams.get("orgId") ?? "";
  const g = await guard(req, orgId);
  if (g.error) return g.error;

  const { error } = await g
    .auth!.rls.from("tmc_bot_rules")
    .delete()
    .eq("id", id)
    .eq("org_id", orgId);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
