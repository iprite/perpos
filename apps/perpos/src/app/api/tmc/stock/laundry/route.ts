import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "../../../_lib/supabase";
import { requireTmcMember } from "../../_lib";
import { recordMetric } from "@/lib/metrics";

// รอบซัก — ส่งไป vs กลับมา ต้องจับคู่กันได้ (specs/tmc-stock-v2.md §3.5)
// การตัดสต๊อก + ค่าใช้จ่าย ทำใน RPC ทั้งหมด · route นี้ auth + แปลง error เป็นข้อความไทย
const WRITE_ROLES = ["owner", "admin", "team_lead"];

// GET /api/tmc/stock/laundry?orgId= — รอบซัก + บรรทัด + ราคาต่อผืน
export async function GET(req: NextRequest) {
  const orgId = req.nextUrl.searchParams.get("orgId") ?? "";
  if (!orgId) return NextResponse.json({ error: "missing orgId" }, { status: 400 });

  const auth = await requireTmcMember(req, orgId);
  if (!auth.ok) return auth.res;

  const [{ data: batches }, { data: prices }] = await Promise.all([
    auth.rls
      .from("tmc_laundry_batches")
      .select(
        "*, tmc_laundry_batch_lines(*), tmc_laundry_receipts(*, tmc_laundry_receipt_lines(*))",
      )
      .eq("org_id", orgId)
      .order("sent_at", { ascending: false })
      .limit(100),
    auth.rls.from("tmc_laundry_prices").select("item_id, price_per_piece").eq("org_id", orgId),
  ]);

  return NextResponse.json({ batches: batches ?? [], prices: prices ?? [] });
}

// POST /api/tmc/stock/laundry — ส่งซัก (action ว่าง) หรือ save_price
export async function POST(req: NextRequest) {
  const t0 = Date.now();
  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const orgId = String(body.orgId ?? "");
  if (!orgId) return NextResponse.json({ error: "missing orgId" }, { status: 400 });

  const auth = await requireTmcMember(req, orgId);
  if (!auth.ok) return auth.res;
  if (!WRITE_ROLES.includes(auth.role)) {
    return NextResponse.json({ error: "ต้องการสิทธิ์ team_lead ขึ้นไป" }, { status: 403 });
  }

  const admin = createAdminClient();

  if (body.action === "save_price") {
    const itemId = String(body.itemId ?? "");
    const price = Number(body.price);
    if (!itemId || !Number.isFinite(price) || price < 0) {
      return NextResponse.json({ error: "ราคาไม่ถูกต้อง" }, { status: 400 });
    }
    const { error } = await admin.from("tmc_laundry_prices").upsert(
      {
        org_id: orgId,
        item_id: itemId,
        price_per_piece: price,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "org_id,item_id" },
    );
    if (error) return NextResponse.json({ error: error.message }, { status: 400 });
    return NextResponse.json({ ok: true });
  }

  const lines = Array.isArray(body.lines) ? body.lines : [];
  if (lines.length === 0) {
    return NextResponse.json({ error: "ต้องมีรายการผ้าอย่างน้อยหนึ่งบรรทัด" }, { status: 400 });
  }

  const { data, error } = await admin.rpc("tmc_laundry_send", {
    p_org_id: orgId,
    p_vendor_id: String(body.vendorId ?? ""),
    p_source_id: (body.sourceId as string) || null,
    p_sent_at: (body.sentAt as string) || null,
    p_ref_no: (body.refNo as string) || null,
    p_lines: lines,
    p_note: (body.note as string) || null,
    p_created_by: auth.userId,
  });

  if (error) {
    const status = error.code === "23514" || error.code === "23503" ? 400 : 500;
    void recordMetric({ orgId, route: "/api/tmc/stock/laundry", method: "POST", status, t0 });
    return NextResponse.json({ error: error.message }, { status });
  }
  void recordMetric({ orgId, route: "/api/tmc/stock/laundry", method: "POST", status: 201, t0 });
  return NextResponse.json(data, { status: 201 });
}

// PATCH /api/tmc/stock/laundry — รับคืน + ปิดรอบ
export async function PATCH(req: NextRequest) {
  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const orgId = String(body.orgId ?? "");
  const batchId = String(body.batchId ?? "");
  if (!orgId || !batchId) {
    return NextResponse.json({ error: "missing orgId or batchId" }, { status: 400 });
  }

  const auth = await requireTmcMember(req, orgId);
  if (!auth.ok) return auth.res;
  if (!WRITE_ROLES.includes(auth.role)) {
    return NextResponse.json({ error: "ต้องการสิทธิ์ team_lead ขึ้นไป" }, { status: 403 });
  }

  // ยกเลิกปิดรอบ — ผ้าที่ถูกตัดเป็น "ขาด" กลับไปอยู่ที่ร้าน (บันทึกรายการกลับ ไม่ลบของเดิม)
  if (body.action === "reopen") {
    const { data, error } = await createAdminClient().rpc("tmc_laundry_reopen", {
      p_org_id: orgId,
      p_batch_id: batchId,
      p_created_by: auth.userId,
    });
    if (error) {
      const status = error.code === "23514" || error.code === "23503" ? 400 : 500;
      return NextResponse.json({ error: error.message }, { status });
    }
    return NextResponse.json(data);
  }

  // รับคืน — จำนวนใน lines คือ "ที่รับครั้งนี้" · close=true จึงถือว่าที่เหลือคือขาด แล้วปิดรอบ
  const { data, error } = await createAdminClient().rpc("tmc_laundry_receive", {
    p_org_id: orgId,
    p_batch_id: batchId,
    p_return_id: (body.returnLocationId as string) || null,
    p_received_at: (body.returnedAt as string) || null,
    p_lines: Array.isArray(body.lines) ? body.lines : [],
    p_cost: body.cost === undefined || body.cost === null ? null : Number(body.cost),
    p_account_id: (body.accountId as string) || null,
    p_note: (body.note as string) || null,
    p_created_by: auth.userId,
    p_close: body.close === true,
  });

  if (error) {
    const status = error.code === "23514" || error.code === "23503" ? 400 : 500;
    return NextResponse.json({ error: error.message }, { status });
  }
  return NextResponse.json(data);
}
