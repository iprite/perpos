import { NextRequest, NextResponse } from "next/server";
import { requireJustMeMember } from "../../_lib";
import { createAdminClient } from "../../../_lib/supabase";

export async function GET(req: NextRequest) {
  const orgId = req.nextUrl.searchParams.get("orgId");
  if (!orgId) return NextResponse.json({ error: "missing orgId" }, { status: 400 });

  const auth = await requireJustMeMember(req, orgId);
  if (!auth.ok) return auth.res;

  const { searchParams } = req.nextUrl;
  const month = searchParams.get("month"); // YYYY-MM
  const admin = createAdminClient();

  let query = admin
    .from("just_me_travel_claims")
    .select(
      `
      id, work_date, hops, total_distance_km, fuel_rate_per_km,
      total_amount, status, note, approved_at, created_at,
      work_start_time, work_end_time, work_minutes,
      profile:profiles!profile_id(id, display_name, email)
    `,
    )
    .eq("org_id", orgId)
    .order("work_date", { ascending: false })
    .limit(90);

  // ใบเบิกของคนอื่น = ข้อมูลการเงินของทีม → เจ้าของโมดูลเท่านั้นที่เห็นทั้งองค์กร
  // (ตรงกับเมนู/ด่านหน้าเว็บใน `just-me/_guard.ts` ที่ให้เฉพาะ owner เปิดหน้าอนุมัติค่าเดินทาง)
  if (auth.role !== "owner") {
    query = query.eq("profile_id", auth.userId);
  }

  if (month) {
    const [yearStr, monthStr] = month.split("-");
    const year = parseInt(yearStr, 10);
    const monthInt = parseInt(monthStr, 10);
    const lastDay = new Date(year, monthInt, 0).getDate();
    const lastDayStr = String(lastDay).padStart(2, "0");

    query = query.gte("work_date", `${month}-01`).lte("work_date", `${month}-${lastDayStr}`);
  }

  const { data, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ claims: data ?? [] });
}

// อนุมัติ/ปฏิเสธ/จ่าย = เจ้าของโมดูลเท่านั้น (เงินจ่ายออก) — manager ทำไม่ได้แล้ว
// 🔴 ต้องตรงกับเมนู + `just-me/_guard.ts` เสมอ: หน้าอนุมัติค่าเดินทางเปิดได้เฉพาะ owner
export async function PATCH(req: NextRequest) {
  const orgId = req.nextUrl.searchParams.get("orgId");
  if (!orgId) return NextResponse.json({ error: "missing orgId" }, { status: 400 });

  const auth = await requireJustMeMember(req, orgId);
  if (!auth.ok) return auth.res;
  if (auth.role !== "owner") {
    return NextResponse.json(
      { error: "ไม่มีสิทธิ์อนุมัติการเบิกจ่าย (เฉพาะเจ้าของเท่านั้น)" },
      { status: 403 },
    );
  }

  const body = await req.json().catch(() => ({}));
  const { claimId, status, note } = body as { claimId?: string; status?: string; note?: string };

  if (!claimId || !status) {
    return NextResponse.json({ error: "missing claimId or status" }, { status: 400 });
  }
  if (!["approved", "paid", "rejected", "pending"].includes(status)) {
    return NextResponse.json({ error: "invalid status" }, { status: 400 });
  }

  const admin = createAdminClient();
  const now = new Date().toISOString();

  const { error } = await admin
    .from("just_me_travel_claims")
    .update({
      status,
      note: note ?? undefined,
      approved_by: ["approved", "paid"].includes(status) ? auth.userId : null,
      approved_at: ["approved", "paid"].includes(status) ? now : null,
      updated_at: now,
    })
    .eq("id", claimId)
    .eq("org_id", orgId);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
