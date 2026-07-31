import { NextRequest, NextResponse } from "next/server";
import { requireModuleMember } from "../../../_lib/module-auth";
import { createAdminClient } from "../../../_lib/supabase";
import { canWrite, type JustMeRole } from "../../_lib";
import { lineToken, postStockMovement } from "@/lib/just-me/stock-movements";

type ReceiveItem = { name: string; unit: string; qty: number; unitCost?: number | null };

export async function POST(req: NextRequest) {
  const orgId = req.nextUrl.searchParams.get("orgId");
  if (!orgId) return NextResponse.json({ error: "missing orgId" }, { status: 400 });

  const auth = await requireModuleMember(req, orgId, "just_me");
  if (!auth.ok) return auth.res;

  // รับของเข้าคลัง = ตั้งต้นทุนเฉลี่ยถาวร → เฉพาะเจ้าของ/ผู้จัดการ (เท่ากับ RLS ที่ชั้น DB)
  if (!canWrite(auth.moduleRole as JustMeRole)) {
    return NextResponse.json(
      { error: "คุณไม่มีสิทธิ์บันทึกรับของเข้าคลัง (เฉพาะเจ้าของและผู้จัดการ)" },
      { status: 403 },
    );
  }

  const body = (await req.json().catch(() => ({}))) as {
    warehouseId: string;
    referenceNo?: string;
    note?: string;
    items: ReceiveItem[];
    /** uuid จากหน้าเว็บ — กดบันทึกซ้ำ/เน็ตหลุดแล้วยิงใหม่ จะไม่ได้ของเข้าคลังสองรอบ */
    clientToken?: string;
  };

  const { warehouseId, referenceNo, note, items, clientToken } = body;

  if (!warehouseId) {
    return NextResponse.json({ error: "กรุณาเลือกคลังปลายทาง" }, { status: 400 });
  }

  const validItems = (items ?? []).filter((i) => i.name?.trim() && Number(i.qty) > 0);
  if (validItems.length === 0) {
    return NextResponse.json({ error: "กรุณาระบุรายการสินค้าอย่างน้อย 1 รายการ" }, { status: 400 });
  }

  const admin = createAdminClient();

  // คลังปลายทางต้องเป็นขององค์กรนี้ (ไม่งั้นยัดของเข้าคลังของ org อื่นได้)
  const { data: wh } = await admin
    .from("just_me_warehouses")
    .select("id")
    .eq("id", warehouseId)
    .eq("org_id", orgId)
    .maybeSingle();
  if (!wh) {
    return NextResponse.json({ error: "ไม่พบคลังปลายทางในองค์กรนี้" }, { status: 400 });
  }

  // Fetch all existing items for this org once to minimise queries
  const { data: existingItems } = await admin
    .from("just_me_inventory_items")
    .select("id, name, unit")
    .eq("org_id", orgId);

  const results: { name: string; itemId: string; qty: number; created: boolean }[] = [];
  const errors: string[] = [];

  for (let idx = 0; idx < validItems.length; idx++) {
    const line = validItems[idx];
    const qty = Number(line.qty);
    const unit = line.unit?.trim() || "ชิ้น";
    const name = line.name.trim();

    // Match existing item by name (case-insensitive)
    const matched = (existingItems ?? []).find((i) => i.name.toLowerCase() === name.toLowerCase());

    let itemId: string;
    let created = false;

    if (matched) {
      itemId = matched.id;
    } else {
      // Auto-create a simple item (no serial, no cable tracking)
      // รหัสต้องไม่ชนกับบิลใบอื่นในวันเดียวกัน (UNIQUE (org_id, code)) → ใส่เวลา+สุ่มท้าย
      const now = new Date();
      const datePart = now.toISOString().slice(0, 10).replace(/-/g, "");
      const timePart = now.toISOString().slice(11, 19).replace(/:/g, "");
      const rand = Math.random().toString(36).slice(2, 5).toUpperCase();
      const code = `AUTO-${datePart}-${timePart}-${rand}-${String(idx + 1).padStart(2, "0")}`;

      const { data: newItem, error: createErr } = await admin
        .from("just_me_inventory_items")
        .insert({
          org_id: orgId,
          name,
          code,
          unit,
          has_serial: false,
          has_cable_measurement: false,
          conversion_rate: 1,
          min_stock: 0,
        })
        .select("id")
        .single();

      if (createErr || !newItem) {
        errors.push(`สร้างสินค้า "${name}" ไม่สำเร็จ: ${createErr?.message ?? "unknown"}`);
        continue;
      }
      itemId = newItem.id;
      created = true;
    }

    // ราคาต่อหน่วยจากบิล — ไม่ส่งมา = trigger จะใช้ต้นทุนเฉลี่ยเดิม (วัสดุใหม่จะได้ 0 ตลอดไป)
    // จึงต้องส่งมาให้ได้มากที่สุด และห้ามรับค่าติดลบ
    const rawCost = line.unitCost;
    const unitCost =
      rawCost === null || rawCost === undefined || rawCost === ("" as unknown)
        ? null
        : Number(rawCost);
    if (unitCost !== null && (Number.isNaN(unitCost) || unitCost < 0)) {
      errors.push(`ราคาต่อหน่วยของ "${name}" ไม่ถูกต้อง`);
      continue;
    }

    // บันทึกความเคลื่อนไหว + ยอดคงเหลือในคำสั่งเดียว (atomic · token ต่อบรรทัดกันรับซ้ำ)
    const posted = await postStockMovement(admin, {
      orgId,
      itemId,
      type: "receive",
      qty,
      destinationWarehouseId: warehouseId,
      referenceNo: referenceNo || null,
      note: note || null,
      unitCost,
      createdBy: auth.userId,
      clientToken: lineToken(clientToken, idx),
    });

    if (!posted.ok) {
      errors.push(`บันทึกการรับ "${name}" ไม่สำเร็จ: ${posted.error}`);
      continue;
    }

    results.push({ name, itemId, qty, created });
  }

  if (errors.length > 0 && results.length === 0) {
    return NextResponse.json({ error: errors.join("; ") }, { status: 500 });
  }

  return NextResponse.json({ results, errors }, { status: 201 });
}
