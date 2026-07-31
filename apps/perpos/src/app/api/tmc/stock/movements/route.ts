import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "../../../_lib/supabase";
import { requireTmcMember } from "../../_lib";
import { recordMetric } from "@/lib/metrics";

// การเคลื่อนไหวสต๊อกแบบ from → to — ดู specs/tmc-stock-v2.md §2.2
// กติกาทั้งหมด (เติมจุดเก็บให้เอง, ห้ามผ้าหลุดออกนอกระบบ, ห้ามติดลบ) บังคับที่ trigger ของ DB
// route นี้ทำหน้าที่ auth + ตรวจ input + แปลง error ของ DB เป็นข้อความไทย

const MOVEMENT_TYPES = [
  "receive", // รับเข้า
  "issue", // เบิกใช้ / เบิกไปห้อง
  "transfer", // ย้ายระหว่างจุดเก็บ
  "retire", // ตัดทิ้ง (ผ้าเสีย)
  "lost", // สูญหาย
  "adjust", // ปรับยอด
] as const;

// POST /api/tmc/stock/movements
export async function POST(req: NextRequest) {
  const t0 = Date.now();
  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const orgId = String(body.orgId ?? "");
  if (!orgId) return NextResponse.json({ error: "missing orgId" }, { status: 400 });

  const auth = await requireTmcMember(req, orgId);
  if (!auth.ok) return auth.res;

  const itemId = String(body.itemId ?? "");
  const movementType = String(body.movementType ?? "");
  const quantity = Number(body.quantity);

  if (!itemId || !movementType) {
    return NextResponse.json({ error: "ต้องระบุสินค้าและประเภทการเคลื่อนไหว" }, { status: 400 });
  }
  if (!(MOVEMENT_TYPES as readonly string[]).includes(movementType)) {
    return NextResponse.json({ error: `ประเภท "${movementType}" ไม่ถูกต้อง` }, { status: 400 });
  }
  if (!Number.isFinite(quantity) || quantity <= 0) {
    return NextResponse.json({ error: "จำนวนต้องมากกว่า 0" }, { status: 400 });
  }
  if ((movementType === "retire" || movementType === "lost") && !body.reason) {
    return NextResponse.json({ error: "ตัดของออกจากระบบต้องระบุเหตุผล" }, { status: 400 });
  }

  const admin = createAdminClient();

  const { data, error } = await admin
    .from("tmc_stock_movements")
    .insert({
      org_id: orgId,
      item_id: itemId,
      movement_type: movementType,
      quantity,
      from_location_id: (body.fromLocationId as string) || null,
      to_location_id: (body.toLocationId as string) || null,
      property_code: (body.propertyCode as string) || null,
      reason: (body.reason as string) || null,
      stay_id: (body.stayId as string) || null,
      unit_cost: body.unitCost === undefined ? null : Number(body.unitCost),
      note: (body.note as string) || null,
      created_by: auth.userId,
    })
    .select("*, tmc_stock_items(name, unit, current_qty)")
    .single();

  if (error) {
    // trigger ของ DB ส่งข้อความไทยที่อธิบายเหตุผลมาแล้ว (เช่น "ผ้าเช็ดตัว ที่ ห้องผ้าสะอาด เหลือ 3 ผืน …")
    const status = error.code === "23514" ? 400 : 500;
    void recordMetric({ orgId, route: "/api/tmc/stock/movements", method: "POST", status, t0 });
    return NextResponse.json({ error: error.message }, { status });
  }

  void recordMetric({ orgId, route: "/api/tmc/stock/movements", method: "POST", status: 201, t0 });
  return NextResponse.json(data, { status: 201 });
}
