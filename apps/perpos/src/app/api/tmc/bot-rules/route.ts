/** กฎประจำตัวบอทผู้ช่วยขาย TMC — list / create (กฎถูกยัดเข้า prompt ทุกข้อความ ไม่ผ่าน retrieval) */
import { NextRequest, NextResponse } from "next/server";
import { requireTmcMember, canWriteFinance } from "../_lib";
import { isUnsafeRule, normalizeRule, MAX_RULES } from "@/lib/tmc/bot-rules";

export async function GET(req: NextRequest) {
  const orgId = req.nextUrl.searchParams.get("orgId") ?? "";
  if (!orgId) return NextResponse.json({ error: "missing orgId" }, { status: 400 });

  const auth = await requireTmcMember(req, orgId);
  if (!auth.ok) return auth.res;

  const { data, error } = await auth.rls
    .from("tmc_bot_rules")
    .select(
      "id, rule, is_active, sort_order, source, source_note, previous_rule, created_at, updated_at",
    )
    .eq("org_id", orgId)
    .order("sort_order")
    .order("created_at");

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data ?? []);
}

export async function POST(req: NextRequest) {
  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const orgId = String(body.orgId ?? "");
  const rule = normalizeRule(String(body.rule ?? ""));
  if (!orgId || !rule)
    return NextResponse.json({ error: "ต้องมี orgId และ rule" }, { status: 400 });

  const auth = await requireTmcMember(req, orgId);
  if (!auth.ok) return auth.res;
  if (!canWriteFinance(auth.role))
    return NextResponse.json({ error: "ไม่มีสิทธิ์" }, { status: 403 });

  // กฎที่ลบล้างกติกาความปลอดภัยของบอท (ห้ามเดา/ยืนยันจอง/ไม่ส่งต่อคน) รับไม่ได้ทุกช่องทาง
  const unsafe = isUnsafeRule(rule);
  if (unsafe) return NextResponse.json({ error: unsafe }, { status: 400 });

  const { count } = await auth.rls
    .from("tmc_bot_rules")
    .select("id", { count: "exact", head: true })
    .eq("org_id", orgId)
    .eq("is_active", true);
  if ((count ?? 0) >= MAX_RULES) {
    return NextResponse.json(
      { error: `กฎที่เปิดใช้งานได้สูงสุด ${MAX_RULES} ข้อ — ปิดหรือลบกฎที่ไม่ใช้แล้วก่อนนะครับ` },
      { status: 400 },
    );
  }

  const { data, error } = await auth.rls
    .from("tmc_bot_rules")
    .insert({
      org_id: orgId,
      rule,
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
