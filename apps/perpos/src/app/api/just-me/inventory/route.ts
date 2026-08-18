import { NextRequest, NextResponse } from "next/server";
import { requireModuleMember } from "../../_lib/module-auth";
import { createAdminClient } from "../../_lib/supabase";
import {
  auditMutation,
  canSeeCost,
  canWrite,
  stripCost,
  stripCostList,
  type JustMeRole,
} from "../_lib";
import { loadProjectMetrics } from "@/lib/just-me/projects";
import { notifyOverBudgetCrossed } from "@/lib/just-me/notify";
import {
  getMovement,
  movementWarehouseRule,
  postStockMovement,
  reverseStockMovement,
  serialSourceFilter,
  type JustMeMovementType,
} from "@/lib/just-me/stock-movements";
import {
  applyScrapUsage,
  isScrapLength,
  nextScrapCode,
  parseCableLength,
} from "@/lib/just-me/cable";

/** เพดานแถวประวัติที่ดึงมาแสดง — เกินนี้ต้องบอกผู้ใช้ ไม่ใช่ตัดเงียบ */
const MOVEMENT_LIMIT = 1000;

/** PostgREST ตอบสูงสุด 1,000 แถวต่อครั้ง — ทะเบียน/ยอดคงเหลือต้องดึงครบ ไม่งั้นยอดรวมต่ำกว่าจริงเงียบ ๆ */
const CHUNK = 1000;
/** กันดึงไม่รู้จบถ้าข้อมูลบวมผิดปกติ — ถึงเพดานแล้วต้องบอกหน้าเว็บว่าไม่ครบ */
const MAX_ROWS = 20_000;

/**
 * ดึงทุกแถวของตารางเดียวแบบไล่หน้าเอง (คืน `truncated` เมื่อชนเพดาน)
 * — ห้ามเปลี่ยนกลับไปเรียกครั้งเดียว: ยอดคงเหลือ/มูลค่าคลังคิดจาก array ชุดนี้
 */
async function fetchAll<T>(
  build: () => {
    range: (
      from: number,
      to: number,
    ) => PromiseLike<{ data: T[] | null; error: { message: string } | null }>;
  },
): Promise<{ rows: T[]; truncated: boolean }> {
  const rows: T[] = [];
  for (let from = 0; from < MAX_ROWS; from += CHUNK) {
    const { data, error } = await build().range(from, from + CHUNK - 1);
    if (error) throw new Error(error.message);
    const batch = data ?? [];
    rows.push(...batch);
    if (batch.length < CHUNK) return { rows, truncated: false };
  }
  return { rows, truncated: true };
}

/** พิกัดคลัง — กติกาเดียวใช้ทั้งตอนสร้างและตอนแก้ไข */
function parseCoords(
  latitude: unknown,
  longitude: unknown,
): { ok: true; lat: number | null; lng: number | null } | { ok: false; error: string } {
  const num = (v: unknown) => (v === "" || v === undefined || v === null ? null : Number(v));
  const lat = num(latitude);
  const lng = num(longitude);
  if (lat !== null && (Number.isNaN(lat) || lat < -90 || lat > 90)) {
    return { ok: false, error: "ละติจูดต้องอยู่ระหว่าง -90 ถึง 90" };
  }
  if (lng !== null && (Number.isNaN(lng) || lng < -180 || lng > 180)) {
    return { ok: false, error: "ลองจิจูดต้องอยู่ระหว่าง -180 ถึง 180" };
  }
  return { ok: true, lat, lng };
}

export async function GET(req: NextRequest) {
  const orgId = req.nextUrl.searchParams.get("orgId");
  if (!orgId) return NextResponse.json({ error: "missing orgId" }, { status: 400 });

  const auth = await requireModuleMember(req, orgId, "just_me");
  if (!auth.ok) return auth.res;

  const admin = createAdminClient();

  // 1-4, 6. ทะเบียน/ยอดคงเหลือ — ดึงครบทุกแถว (ไล่ทีละ 1,000) แล้วบอกหน้าเว็บถ้าชนเพดาน
  //         เดิมเรียกครั้งเดียว ⇒ org ที่มี serial/ยอดคงเหลือเกิน 1,000 แถว ตัวเลขต่ำกว่าจริงโดยไม่มีใครรู้
  let warehouses: any[] = [];
  let items: any[] = [];
  let balances: any[] = [];
  let serials: any[] = [];
  let costs: any[] = [];
  let costMonthly: any[] = [];
  let listsTruncated = false;

  const since = new Date();
  since.setMonth(since.getMonth() - 11);
  since.setDate(1);
  const sinceIso = since.toISOString().slice(0, 10);

  try {
    const [wh, it, bal, ser, cost, cm] = await Promise.all([
      fetchAll<any>(() =>
        admin.from("just_me_warehouses").select("*").eq("org_id", orgId).order("name").order("id"),
      ),
      fetchAll<any>(() =>
        admin
          .from("just_me_inventory_items")
          .select("*")
          .eq("org_id", orgId)
          .order("name")
          .order("id"),
      ),
      fetchAll<any>(() =>
        admin.from("just_me_stock_balances").select("*").eq("org_id", orgId).order("id"),
      ),
      fetchAll<any>(() =>
        admin.from("just_me_item_serials").select("*").eq("org_id", orgId).order("id"),
      ),
      fetchAll<any>(() =>
        admin.from("just_me_item_costs").select("*").eq("org_id", orgId).order("item_id"),
      ),
      fetchAll<any>(() =>
        admin
          .from("just_me_item_cost_monthly")
          .select("*")
          .eq("org_id", orgId)
          .gte("month", sinceIso)
          // ไล่หน้าเองต้องเรียงด้วยคีย์ที่ไม่ซ้ำ ไม่งั้นแถวข้ามหน้าหาย/ซ้ำ
          .order("month")
          .order("item_id"),
      ),
    ]);
    warehouses = wh.rows;
    items = it.rows;
    balances = bal.rows;
    serials = ser.rows;
    costs = cost.rows;
    costMonthly = cm.rows;
    listsTruncated = [wh, it, bal, ser, cost, cm].some((r) => r.truncated);
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? "โหลดข้อมูลคลังไม่สำเร็จ" }, { status: 500 });
  }

  // 5. Fetch Stock Movements — จำกัดแถวเพื่อความเร็ว แต่ต้องบอกหน้าเว็บว่าถูกตัด
  //    (ไม่งั้นการ์ดสรุป/ตารางผู้เบิกจะต่ำกว่าจริงเงียบ ๆ เมื่อข้อมูลโต)
  const { data: movements, error: movErr } = await admin
    .from("just_me_stock_movements")
    .select("*")
    .eq("org_id", orgId)
    .order("created_at", { ascending: false })
    .limit(MOVEMENT_LIMIT);
  if (movErr) return NextResponse.json({ error: movErr.message }, { status: 500 });

  const { count: movementsTotal } = await admin
    .from("just_me_stock_movements")
    .select("id", { count: "exact", head: true })
    .eq("org_id", orgId);

  // 7. Fetch profiles for creator/requester mapping in-memory to bypass schema cache relationships
  const profileIds = Array.from(
    new Set((movements ?? []).flatMap((m: any) => [m.created_by, m.requested_by]).filter(Boolean)),
  );
  let people: any[] = [];
  if (profileIds.length > 0) {
    const { data: profs } = await admin
      .from("profiles")
      .select("id, display_name, email")
      .in("id", profileIds);
    people = profs ?? [];
  }
  const peopleMap = new Map(people.map((c) => [c.id, c]));

  const movementsWithCreators = (movements ?? []).map((m: any) => ({
    ...m,
    creator: peopleMap.get(m.created_by) || null,
    requester: peopleMap.get(m.requested_by) || null,
  }));

  // 8. สมาชิก org — ตัวเลือก "ผู้เบิก" ในฟอร์ม
  const { data: memberRows } = await admin
    .from("organization_members")
    .select("user_id")
    .eq("organization_id", orgId);
  const memberIds = Array.from(
    new Set((memberRows ?? []).map((r: any) => r.user_id).filter(Boolean)),
  );
  let members: any[] = [];
  if (memberIds.length > 0) {
    const { data: profs } = await admin
      .from("profiles")
      .select("id, display_name, email")
      .in("id", memberIds);
    members = profs ?? [];
  }

  // ผู้รับเหมาช่วง/ช่าง (viewer) ต้องไม่เห็นต้นทุนเลย — เส้นนี้อ่านด้วย service-role (bypass RLS)
  // ด่านของ DB จึงไม่ทำงานที่นี่ ต้องตัดออกที่ชั้น API ด้วย (contract §4.6 ข้อ 2)
  const role = auth.moduleRole as JustMeRole;
  const showCost = canSeeCost(role);

  return NextResponse.json({
    warehouses,
    items,
    balances,
    serials,
    movements: showCost ? movementsWithCreators : stripCostList(movementsWithCreators, role),
    costs: showCost ? costs : [],
    costMonthly: showCost ? costMonthly : [],
    canSeeCost: showCost,
    canWrite: canWrite(role),
    movementsTotal,
    movementsTruncated: (movements ?? []).length >= MOVEMENT_LIMIT,
    // ทะเบียน/ยอดคงเหลือดึงไม่ครบ = ตัวเลขบนหน้าเชื่อไม่ได้ ต้องขึ้นเตือน ห้ามเงียบ
    listsTruncated,
    members,
  });
}

export async function POST(req: NextRequest) {
  const orgId = req.nextUrl.searchParams.get("orgId");
  if (!orgId) return NextResponse.json({ error: "missing orgId" }, { status: 400 });

  const auth = await requireModuleMember(req, orgId, "just_me");
  if (!auth.ok) return auth.res;

  // เขียนคลัง = กระทบต้นทุนเฉลี่ยถาวร (trigger สะสมทางเดียว กู้ไม่ได้) และ response มีต้นทุนติดกลับไป
  // ⇒ จำกัดเท่ากับผู้ที่เห็นต้นทุนได้ (owner/manager) — ตรงกับ RLS ที่รัดไว้ที่ชั้น DB
  const role = auth.moduleRole as JustMeRole;
  if (!canWrite(role)) {
    return NextResponse.json(
      { error: "คุณไม่มีสิทธิ์บันทึกรายการคลัง (เฉพาะเจ้าของและผู้จัดการ)" },
      { status: 403 },
    );
  }

  const body = await req.json().catch(() => ({}));
  const { action } = body;

  const admin = createAdminClient();
  // ทุกอย่างใต้ POST นี้แก้ยอดคลัง/ต้นทุน → ต้องรู้ว่าใครเป็นคนทำ (contract `_lib.ts` ข้อ 2)
  await auditMutation(req, { ...auth, role });

  // Route actions
  if (action === "create_warehouse") {
    const { name, type, location_address, latitude, longitude, contact_name, contact_phone } = body;
    if (!name || !type || !["central", "site"].includes(type)) {
      return NextResponse.json({ error: "ชื่อคลังสินค้า หรือ ประเภทไม่ถูกต้อง" }, { status: 400 });
    }

    const coords = parseCoords(latitude, longitude);
    if (!coords.ok) return NextResponse.json({ error: coords.error }, { status: 400 });
    const lat = coords.lat;
    const lng = coords.lng;

    const { data, error } = await admin
      .from("just_me_warehouses")
      .insert({
        org_id: orgId,
        name,
        type,
        location_address,
        latitude: lat,
        longitude: lng,
        contact_name: contact_name || null,
        contact_phone: contact_phone || null,
        is_active: true,
      })
      .select()
      .single();

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ warehouse: data }, { status: 201 });
  }

  if (action === "create_item") {
    const {
      name,
      code,
      description,
      unit,
      has_serial,
      has_cable_measurement,
      conversion_rate,
      min_stock,
    } = body;
    if (!name || !code) {
      return NextResponse.json({ error: "ชื่อสินค้า หรือ รหัสสินค้าไม่ถูกต้อง" }, { status: 400 });
    }

    const { data, error } = await admin
      .from("just_me_inventory_items")
      .insert({
        org_id: orgId,
        name,
        code,
        description,
        unit: unit || "ชิ้น",
        has_serial: !!has_serial,
        has_cable_measurement: !!has_cable_measurement,
        conversion_rate: Number(conversion_rate) || 1,
        min_stock: Number(min_stock) || 0,
      })
      .select()
      .single();

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ item: data }, { status: 201 });
  }

  // แก้ไขคลัง/ไซต์งาน — ชื่อหรือพิกัดพิมพ์ผิดต้องแก้ได้ ไม่ใช่ค้างถาวร
  if (action === "update_warehouse") {
    const {
      id,
      name,
      type,
      location_address,
      latitude,
      longitude,
      contact_name,
      contact_phone,
      is_active,
    } = body;
    if (typeof id !== "string" || !id) {
      return NextResponse.json({ error: "ไม่พบคลังที่ต้องการแก้ไข" }, { status: 400 });
    }
    if (!name || !type || !["central", "site"].includes(type)) {
      return NextResponse.json({ error: "ชื่อคลังสินค้า หรือ ประเภทไม่ถูกต้อง" }, { status: 400 });
    }
    const coords = parseCoords(latitude, longitude);
    if (!coords.ok) return NextResponse.json({ error: coords.error }, { status: 400 });

    const { data, error } = await admin
      .from("just_me_warehouses")
      .update({
        name,
        type,
        location_address: location_address || null,
        latitude: coords.lat,
        longitude: coords.lng,
        contact_name: contact_name || null,
        contact_phone: contact_phone || null,
        is_active: is_active === undefined ? true : !!is_active,
      })
      .eq("id", id)
      .eq("org_id", orgId) // กันแก้คลังของ org อื่น
      .select()
      .maybeSingle();
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    if (!data) return NextResponse.json({ error: "ไม่พบคลังนี้ในองค์กรนี้" }, { status: 404 });
    return NextResponse.json({ warehouse: data });
  }

  // ลบคลัง — ได้เฉพาะคลังที่ยัง "ไม่เคยถูกใช้" เท่านั้น
  // มีรายการ/ยอด/Serial ผูกอยู่แล้วต้องปิดใช้งานแทน (ลบ = ประวัติคลังหาย ตรวจย้อนหลังไม่ได้)
  if (action === "delete_warehouse") {
    const { id } = body;
    if (typeof id !== "string" || !id) {
      return NextResponse.json({ error: "ไม่พบคลังที่ต้องการลบ" }, { status: 400 });
    }
    const { data: wh } = await admin
      .from("just_me_warehouses")
      .select("id")
      .eq("id", id)
      .eq("org_id", orgId)
      .maybeSingle();
    if (!wh) return NextResponse.json({ error: "ไม่พบคลังนี้ในองค์กรนี้" }, { status: 404 });

    const [{ count: srcCount }, { count: dstCount }, { count: balCount }, { count: serCount }] =
      await Promise.all([
        admin
          .from("just_me_stock_movements")
          .select("id", { count: "exact", head: true })
          .eq("org_id", orgId)
          .eq("source_warehouse_id", id),
        admin
          .from("just_me_stock_movements")
          .select("id", { count: "exact", head: true })
          .eq("org_id", orgId)
          .eq("destination_warehouse_id", id),
        admin
          .from("just_me_stock_balances")
          .select("id", { count: "exact", head: true })
          .eq("org_id", orgId)
          .eq("warehouse_id", id),
        admin
          .from("just_me_item_serials")
          .select("id", { count: "exact", head: true })
          .eq("org_id", orgId)
          .eq("warehouse_id", id),
      ]);
    if ((srcCount ?? 0) + (dstCount ?? 0) + (balCount ?? 0) + (serCount ?? 0) > 0) {
      return NextResponse.json(
        {
          error:
            "ลบไม่ได้เพราะคลังนี้มีประวัติการเคลื่อนไหว/ยอดคงเหลือแล้ว — ให้ปิดใช้งานแทน (ประวัติจะยังอยู่ครบ)",
        },
        { status: 409 },
      );
    }

    const { error } = await admin
      .from("just_me_warehouses")
      .delete()
      .eq("id", id)
      .eq("org_id", orgId);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ success: true });
  }

  // แก้ไขวัสดุ — ชื่อ/รหัส/หน่วยที่พิมพ์ผิด (โดยเฉพาะที่ OCR สร้างให้อัตโนมัติ) ต้องแก้ได้
  if (action === "update_item") {
    const {
      id,
      name,
      code,
      description,
      unit,
      has_serial,
      has_cable_measurement,
      conversion_rate,
      min_stock,
      is_active,
    } = body;
    if (typeof id !== "string" || !id) {
      return NextResponse.json({ error: "ไม่พบวัสดุที่ต้องการแก้ไข" }, { status: 400 });
    }
    if (!name || !code) {
      return NextResponse.json({ error: "ชื่อสินค้า หรือ รหัสสินค้าไม่ถูกต้อง" }, { status: 400 });
    }

    const { data: item } = await admin
      .from("just_me_inventory_items")
      .select("id, has_serial, has_cable_measurement")
      .eq("id", id)
      .eq("org_id", orgId)
      .maybeSingle();
    if (!item) return NextResponse.json({ error: "ไม่พบวัสดุนี้ในองค์กรนี้" }, { status: 404 });

    // วิธีติดตาม (Serial / ตัดเมตร) เปลี่ยนความหมายของยอดที่บันทึกไปแล้ว
    // ⇒ สลับได้เฉพาะวัสดุที่ยังไม่เคยเดินรายการ
    const wantSerial = !!has_serial;
    const wantCable = !!has_cable_measurement;
    if (wantSerial !== item.has_serial || wantCable !== item.has_cable_measurement) {
      const { count: usedCount } = await admin
        .from("just_me_stock_movements")
        .select("id", { count: "exact", head: true })
        .eq("org_id", orgId)
        .eq("item_id", id);
      if ((usedCount ?? 0) > 0) {
        return NextResponse.json(
          {
            error:
              "วัสดุนี้มีการเคลื่อนไหวแล้ว จึงเปลี่ยนวิธีติดตาม (Serial/ตัดเมตร) ไม่ได้ — แก้ได้เฉพาะชื่อ รหัส หน่วย และรายละเอียด",
          },
          { status: 409 },
        );
      }
    }

    const { data, error } = await admin
      .from("just_me_inventory_items")
      .update({
        name,
        code,
        description: description || null,
        unit: unit || "ชิ้น",
        has_serial: wantSerial,
        has_cable_measurement: wantCable,
        conversion_rate: Number(conversion_rate) || 1,
        min_stock: Number(min_stock) || 0,
        is_active: is_active === undefined ? true : !!is_active,
      })
      .eq("id", id)
      .eq("org_id", orgId)
      .select()
      .maybeSingle();
    if (error) {
      return NextResponse.json(
        { error: error.code === "23505" ? `รหัสวัสดุ "${code}" ถูกใช้ไปแล้ว` : error.message },
        { status: error.code === "23505" ? 400 : 500 },
      );
    }
    if (!data) return NextResponse.json({ error: "ไม่พบวัสดุนี้ในองค์กรนี้" }, { status: 404 });
    return NextResponse.json({ item: data });
  }

  // ลบวัสดุ — FK เป็น CASCADE ⇒ ลบทั้งที่มีประวัติ = ยอด/Serial/ต้นทุนหายเงียบ
  // จึงยอมให้ลบเฉพาะวัสดุที่ยังไม่เคยถูกใช้ที่ไหนเลย นอกนั้นให้ปิดใช้งาน
  if (action === "delete_item") {
    const { id } = body;
    if (typeof id !== "string" || !id) {
      return NextResponse.json({ error: "ไม่พบวัสดุที่ต้องการลบ" }, { status: 400 });
    }
    const { data: item } = await admin
      .from("just_me_inventory_items")
      .select("id")
      .eq("id", id)
      .eq("org_id", orgId)
      .maybeSingle();
    if (!item) return NextResponse.json({ error: "ไม่พบวัสดุนี้ในองค์กรนี้" }, { status: 404 });

    const refTables = [
      "just_me_stock_movements",
      "just_me_stock_balances",
      "just_me_item_serials",
      "just_me_boq_items",
      "just_me_pr_items",
      "just_me_price_book",
      "just_me_stock_count_items",
    ] as const;
    const counts = await Promise.all(
      refTables.map((t) =>
        admin.from(t).select("id", { count: "exact", head: true }).eq("item_id", id),
      ),
    );
    if (counts.some((c) => (c.count ?? 0) > 0)) {
      return NextResponse.json(
        {
          error:
            "ลบไม่ได้เพราะวัสดุนี้ถูกใช้ในรายการคลัง/BOQ/ราคามาตรฐานแล้ว — ให้ปิดใช้งานแทน (ประวัติจะยังอยู่ครบ)",
        },
        { status: 409 },
      );
    }

    // ต้นทุนเฉลี่ยของวัสดุที่ไม่เคยเดินรายการ = แถวว่าง ลบพร้อมกันได้
    await admin.from("just_me_item_costs").delete().eq("org_id", orgId).eq("item_id", id);
    const { error } = await admin
      .from("just_me_inventory_items")
      .delete()
      .eq("id", id)
      .eq("org_id", orgId);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ success: true });
  }

  if (action === "movement") {
    const {
      movement_type,
      item_id,
      source_warehouse_id,
      destination_warehouse_id,
      quantity,
      reference_no,
      note,
      serial_numbers,
      length_remaining,
      requested_by,
      requester_name,
      unit_cost,
      project_id,
      boq_item_id,
      clientToken,
    } = body;

    if (!movement_type || !["receive", "transfer", "issue", "return"].includes(movement_type)) {
      return NextResponse.json({ error: "ประเภทรายการเคลื่อนไหวไม่ถูกต้อง" }, { status: 400 });
    }
    if (!item_id || !quantity || Number(quantity) <= 0) {
      return NextResponse.json(
        { error: "กรุณาระบุข้อมูลสินค้าและจำนวนให้ถูกต้อง" },
        { status: 400 },
      );
    }

    const qty = Number(quantity);
    const movementType = movement_type as JustMeMovementType;

    // ต้องมีคลังต้นทาง/ปลายทางตามประเภท — เดิมด่านนี้อยู่แค่ฝั่งหน้าจอ
    // ยิง issue โดยไม่ส่งคลังต้นทาง = ตัดมูลค่าออกจากฐานต้นทุนโดยไม่มีคลังไหนถูกหักของ (ยอดเพี้ยนถาวร)
    // คืนของ = ต้นทางคือหน้างาน ไม่ใช่คลัง (กฎอยู่ที่ movementWarehouseRule ที่เดียว)
    const whRule = movementWarehouseRule(movementType);
    const sourceWarehouseId = whRule.source ? source_warehouse_id || null : null;
    if (whRule.source && !sourceWarehouseId) {
      return NextResponse.json({ error: "กรุณาระบุคลังต้นทาง" }, { status: 400 });
    }
    if (whRule.destination && !destination_warehouse_id) {
      return NextResponse.json({ error: "กรุณาระบุคลังปลายทาง" }, { status: 400 });
    }
    const requesterName = typeof requester_name === "string" ? requester_name.trim() : "";

    // ผู้เบิก: รายการเบิกใช้งานต้องระบุว่าใครเบิก (สมาชิกในระบบ หรือชื่อช่าง/ทีม)
    if (movement_type === "issue" && !requested_by && !requesterName) {
      return NextResponse.json(
        { error: "กรุณาระบุผู้เบิก (เลือกสมาชิก หรือกรอกชื่อช่าง/ทีม)" },
        { status: 400 },
      );
    }
    if (requested_by) {
      const { data: mem } = await admin
        .from("organization_members")
        .select("user_id")
        .eq("organization_id", orgId)
        .eq("user_id", requested_by)
        .maybeSingle();
      if (!mem) {
        return NextResponse.json(
          { error: "ผู้เบิกที่เลือกไม่ใช่สมาชิกขององค์กรนี้" },
          { status: 400 },
        );
      }
    }

    // ต้นทุนต่อหน่วย: ใช้ได้เฉพาะรายการรับเข้า (ประเภทอื่นระบบตีมูลค่าด้วยต้นทุนเฉลี่ยให้เอง)
    let unitCost: number | null = null;
    if (
      movement_type === "receive" &&
      unit_cost !== undefined &&
      unit_cost !== null &&
      unit_cost !== ""
    ) {
      unitCost = Number(unit_cost);
      if (Number.isNaN(unitCost) || unitCost < 0) {
        return NextResponse.json({ error: "ต้นทุนต่อหน่วยไม่ถูกต้อง" }, { status: 400 });
      }
    }

    // Get the item info to verify details
    const { data: item } = await admin
      .from("just_me_inventory_items")
      .select("*")
      .eq("id", item_id)
      .eq("org_id", orgId)
      .maybeSingle();

    if (!item) {
      return NextResponse.json({ error: "ไม่พบข้อมูลสินค้า" }, { status: 404 });
    }

    // Validation for Serialized Tracking
    const serialsList = (serial_numbers || []).map((s: string) => s.trim()).filter(Boolean);
    if (item.has_serial && serialsList.length === 0) {
      return NextResponse.json(
        { error: "สินค้าประเภทนี้ต้องการ Serial Number ในการบันทึก" },
        { status: 400 },
      );
    }
    if (item.has_serial && serialsList.length !== qty) {
      return NextResponse.json(
        { error: `จำนวน Serial Number (${serialsList.length}) ไม่สอดคล้องกับจำนวนสินค้า (${qty})` },
        { status: 400 },
      );
    }

    // คลังต้นทาง/ปลายทางต้องเป็นขององค์กรนี้ (ไม่งั้นแก้ยอดคงเหลือของ org อื่นได้)
    for (const [wid, label] of [
      [sourceWarehouseId, "คลังต้นทาง"],
      [destination_warehouse_id, "คลังปลายทาง"],
    ] as [string | null, string][]) {
      if (!wid) continue;
      const { data: wh } = await admin
        .from("just_me_warehouses")
        .select("id")
        .eq("id", wid)
        .eq("org_id", orgId)
        .maybeSingle();
      if (!wh) {
        return NextResponse.json({ error: `ไม่พบ${label}ในองค์กรนี้` }, { status: 400 });
      }
    }

    // ผูกโครงการ (ไม่บังคับ) — ต้องเป็นโครงการขององค์กรนี้เท่านั้น กันอ้างข้ามองค์กร
    // (FK เป็นคอลัมน์เดียวโดยตั้งใจ ด่านจึงอยู่ที่นี่ — contract §4.5)
    if (project_id) {
      const { data: proj } = await admin
        .from("just_me_projects")
        .select("id")
        .eq("id", project_id)
        .eq("org_id", orgId)
        .maybeSingle();
      if (!proj) {
        return NextResponse.json({ error: "ไม่พบโครงการที่เลือกในองค์กรนี้" }, { status: 400 });
      }
    }
    if (boq_item_id) {
      const { data: boqItem } = await admin
        .from("just_me_boq_items")
        .select("id")
        .eq("id", boq_item_id)
        .eq("org_id", orgId)
        .maybeSingle();
      if (!boqItem) {
        return NextResponse.json({ error: "ไม่พบรายการ BOQ ที่อ้างถึง" }, { status: 400 });
      }
    }

    // การเบิกใช้ดันต้นทุนจริงของโครงการ → เก็บสถานะก่อนบันทึกไว้เทียบ (แจ้งเตือนครั้งเดียวตอนข้ามเส้นงบ)
    const budgetBefore =
      project_id && movement_type === "issue"
        ? await loadProjectMetrics(admin, orgId, project_id as string)
        : null;

    // ความยาวสายไฟ (วัสดุที่ตัดเป็นเมตร) — ปล่อยว่าง = ไม่ได้ระบุ ไม่ใช่ 0
    // เดิมเทียบ `Number("") < 5` ⇒ ม้วนเต็มที่ไม่ได้กรอกความยาวติดธง "เศษ" ทันที
    const parsedLength = parseCableLength(length_remaining);
    if (!parsedLength.ok) {
      return NextResponse.json({ error: parsedLength.error }, { status: 400 });
    }
    const cableLength = item.has_cable_measurement ? parsedLength.value : null;

    // ยอดคงเหลือ/ของพอไหม = ตรวจใน RPC แบบล็อกแถว (ตรวจที่นี่ก่อนก็ยังแข่งกันได้)
    // 1. หา serial ต้นทางให้ตรงกับ "สถานะจริง" ของเส้นนั้น
    //    โอน/เบิก = เส้นที่ยังอยู่ในคลังต้นทาง · คืน = เส้นที่ถูกเบิกออกไปแล้ว (`issued`)
    //    เดิมคืนของไปหาเส้น `in_stock` ในคลังต้นทาง ⇒ ไม่มีวันเจอ คืนของที่มี serial ไม่ได้เลย
    let verifiedSerials: any[] = [];
    const srcFilter = item.has_serial ? serialSourceFilter(movementType, sourceWarehouseId) : null;
    if (srcFilter) {
      let q = admin
        .from("just_me_item_serials")
        .select("*")
        .eq("org_id", orgId)
        .eq("item_id", item_id)
        .eq("status", srcFilter.status)
        .in("serial_number", serialsList);
      if (srcFilter.warehouseId) q = q.eq("warehouse_id", srcFilter.warehouseId);
      const { data: foundSerials } = await q;

      const foundList = foundSerials ?? [];
      if (foundList.length !== serialsList.length) {
        const missing = serialsList.filter(
          (s: string) => !foundList.some((fs) => fs.serial_number === s),
        );
        return NextResponse.json(
          {
            error:
              movementType === "return"
                ? `คืนของไม่ได้ — ไม่พบ Serial Number ที่อยู่ในสถานะ "เบิกออกไปแล้ว": ${missing.join(", ")}`
                : `พบ Serial Number ที่ไม่มีในคลัง หรือไม่ได้อยู่ในสถานะ In Stock: ${missing.join(", ")}`,
          },
          { status: 400 },
        );
      }
      verifiedSerials = foundList;
    }

    // 2. บันทึกความเคลื่อนไหว + ยอดคงเหลือในคำสั่งเดียว (atomic · กดซ้ำด้วย token เดิมได้รายการเดิม)
    const posted = await postStockMovement(admin, {
      orgId,
      itemId: item_id,
      type: movementType,
      qty,
      sourceWarehouseId,
      destinationWarehouseId: destination_warehouse_id || null,
      referenceNo: reference_no || null,
      note: note || null,
      unitCost,
      projectId: project_id || null,
      boqItemId: boq_item_id || null,
      requestedBy: requested_by || null,
      requesterName: requesterName || null,
      createdBy: auth.userId,
      clientToken: typeof clientToken === "string" ? clientToken : null,
    });
    if (!posted.ok) {
      return NextResponse.json({ error: posted.error }, { status: posted.status });
    }

    const movement = (await getMovement(admin, orgId, posted.movementId)) ?? {
      id: posted.movementId,
    };

    // ยิงซ้ำด้วย token เดิม = ได้ movement เดิม → ห้ามผูก serial ซ้ำอีกรอบ
    const { count: serialLinkCount } = await admin
      .from("just_me_stock_movement_serials")
      .select("movement_id", { count: "exact", head: true })
      .eq("movement_id", posted.movementId);

    // 3. Manage Serials state updates
    const serialErrors: string[] = [];
    const linkSerial = async (serialId: string) => {
      const { error } = await admin
        .from("just_me_stock_movement_serials")
        .insert({ movement_id: posted.movementId, serial_id: serialId });
      if (error) serialErrors.push(`ผูก Serial กับรายการนี้ไม่สำเร็จ`);
    };
    if (item.has_serial && !serialLinkCount) {
      for (const sn of serialsList) {
        if (movementType === "receive") {
          // Insert new serial
          const { data: newSer, error: insErr } = await admin
            .from("just_me_item_serials")
            .insert({
              org_id: orgId,
              item_id,
              warehouse_id: destination_warehouse_id,
              serial_number: sn,
              status: "in_stock",
              length_remaining: cableLength,
              is_scrap: isScrapLength(cableLength),
            })
            .select()
            .single();

          if (insErr || !newSer) {
            serialErrors.push(
              insErr?.code === "23505"
                ? `Serial "${sn}" มีอยู่ในระบบแล้ว`
                : `บันทึก Serial "${sn}" ไม่สำเร็จ`,
            );
            continue;
          }
          await linkSerial(newSer.id);
        } else {
          const currentSer = verifiedSerials.find((fs) => fs.serial_number === sn);
          if (!currentSer) {
            serialErrors.push(`ไม่พบ Serial "${sn}" ที่พร้อมทำรายการ`);
            continue;
          }
          let patch: Record<string, unknown> = {};
          if (movementType === "transfer") {
            patch = { warehouse_id: destination_warehouse_id };
          } else if (movementType === "issue") {
            patch = {
              status: "issued",
              length_remaining: cableLength,
              is_scrap: isScrapLength(cableLength),
            };
          } else {
            // คืนของ: เส้นที่ `issued` กลับเข้าคลังปลายทาง (ต้องย้ายคลังด้วย ไม่ใช่แค่เปลี่ยนสถานะ)
            patch = { status: "in_stock", warehouse_id: destination_warehouse_id };
          }
          const { error: updErr } = await admin
            .from("just_me_item_serials")
            .update(patch)
            .eq("id", currentSer.id);
          if (updErr) {
            serialErrors.push(`ปรับสถานะ Serial "${sn}" ไม่สำเร็จ`);
            continue;
          }
          await linkSerial(currentSer.id);
        }
      }
    }

    // 3.1 วัสดุที่ตัดเป็นเมตรแต่ไม่มี Serial (สายไฟทุกตัวที่ใช้จริงเป็นแบบนี้)
    //     ช่อง "ความยาวที่เหลือ" เดิมถูกทิ้งเงียบ เพราะโค้ดสร้าง serial อยู่ใต้ `if (item.has_serial)` ทั้งก้อน
    //     ⇒ ลงทะเบียนเป็น "เส้นเศษ" ให้เอง (รหัสระบบออกให้) เพื่อให้หยิบมาใช้ต่อได้จริง
    //     เศษไม่กระทบยอดคงเหลือ/ต้นทุน — มูลค่าของม้วนถูกตัดไปแล้วตอนเบิก (ดู lib/just-me/cable.ts)
    if (
      item.has_cable_measurement &&
      !item.has_serial &&
      !serialLinkCount &&
      cableLength !== null &&
      cableLength > 0 &&
      movementType === "issue"
    ) {
      const { data: existingCodes } = await admin
        .from("just_me_item_serials")
        .select("serial_number")
        .eq("org_id", orgId)
        .eq("item_id", item_id);
      const codes = (existingCodes ?? []).map((r: any) => r.serial_number as string);

      let created: { id: string } | null = null;
      for (let attempt = 0; attempt < 3 && !created; attempt++) {
        const code = nextScrapCode(item.code, codes);
        const { data: newScrap, error: scrapErr } = await admin
          .from("just_me_item_serials")
          .insert({
            org_id: orgId,
            item_id,
            warehouse_id: sourceWarehouseId, // เศษกลับมาอยู่ที่คลังที่เบิกออกไป
            serial_number: code,
            status: "in_stock",
            length_remaining: cableLength,
            is_scrap: isScrapLength(cableLength),
          })
          .select("id")
          .single();
        if (newScrap) {
          created = newScrap as { id: string };
          break;
        }
        if (scrapErr?.code === "23505") {
          codes.push(code); // ชนกับเส้นที่เพิ่งเกิดพร้อมกัน → ขยับเลขแล้วลองใหม่
          continue;
        }
        serialErrors.push("บันทึกเศษสายไฟไม่สำเร็จ");
        break;
      }
      if (created) await linkSerial(created.id);
      else if (serialErrors.length === 0) serialErrors.push("ออกรหัสเศษสายไฟไม่สำเร็จ");
    }

    if (budgetBefore) {
      const budgetAfter = await loadProjectMetrics(admin, orgId, project_id as string);
      if (budgetAfter) {
        await notifyOverBudgetCrossed(admin, {
          orgId,
          project: budgetBefore.project,
          before: budgetBefore.summary,
          after: budgetAfter.summary,
        });
      }
    }

    // ยอดเดินแล้วแต่ Serial ไม่ครบ = ต้องบอกผู้ใช้ ห้ามกลืนเงียบ (ไม่งั้นทะเบียน Serial เพี้ยนโดยไม่มีใครรู้)
    return NextResponse.json(
      {
        success: true,
        movement: stripCost(movement as Record<string, unknown>, role),
        warning:
          serialErrors.length > 0
            ? `บันทึกยอดคลังแล้ว แต่จัดการ Serial ไม่ครบ: ${serialErrors.join(" · ")} — กรุณาตรวจทะเบียน Serial`
            : null,
      },
      { status: 201 },
    );
  }

  // กลับรายการที่บันทึกผิด — รายการเคลื่อนไหวแก้/ลบไม่ได้ นี่คือทางออกเดียวของผู้ใช้
  if (action === "reverse_movement") {
    const { movement_id, reason } = body;
    if (typeof movement_id !== "string" || !movement_id) {
      return NextResponse.json({ error: "ไม่พบรายการที่ต้องการกลับรายการ" }, { status: 400 });
    }
    const trimmed = typeof reason === "string" ? reason.trim() : "";
    if (!trimmed) {
      return NextResponse.json({ error: "กรุณาระบุเหตุผลที่กลับรายการ" }, { status: 400 });
    }

    const res = await reverseStockMovement(admin, {
      orgId,
      movementId: movement_id,
      reason: trimmed,
      createdBy: auth.userId,
    });
    if (!res.ok) return NextResponse.json({ error: res.error }, { status: res.status });

    const created = await getMovement(admin, orgId, res.movementId);
    return NextResponse.json(
      { success: true, movement: stripCost(created as Record<string, unknown>, role) },
      { status: 201 },
    );
  }

  // หยิบเศษสายไฟมาใช้ — ตัดความยาวออกจากทะเบียนเศษ ใช้หมดแล้วปิดเส้นนั้น
  // ไม่มีรายการคลังใหม่: ม้วนถูกตัดออกจากยอด/มูลค่าไปแล้วตอนเบิก (กติกาใน lib/just-me/cable.ts)
  if (action === "use_scrap") {
    const { serial_id, length_used } = body;
    if (!serial_id) {
      return NextResponse.json({ error: "ไม่พบเส้นที่ต้องการใช้" }, { status: 400 });
    }
    const parsedUsed = parseCableLength(length_used);
    if (!parsedUsed.ok || parsedUsed.value === null) {
      return NextResponse.json(
        { error: parsedUsed.ok ? "กรุณาระบุความยาวที่ใช้ (เมตร)" : parsedUsed.error },
        { status: 400 },
      );
    }

    const { data: scrap } = await admin
      .from("just_me_item_serials")
      .select("id, item_id, status, length_remaining")
      .eq("id", serial_id)
      .eq("org_id", orgId)
      .maybeSingle();
    if (!scrap) {
      return NextResponse.json({ error: "ไม่พบเส้นสายไฟนี้ในองค์กรนี้" }, { status: 404 });
    }
    if (scrap.status !== "in_stock") {
      return NextResponse.json({ error: "เส้นนี้ไม่ได้อยู่ในสต็อกแล้ว" }, { status: 400 });
    }

    const usage = applyScrapUsage(
      scrap.length_remaining === null ? null : Number(scrap.length_remaining),
      parsedUsed.value,
    );
    if (!usage.ok) return NextResponse.json({ error: usage.error }, { status: 400 });

    const { data: updated, error: updErr } = await admin
      .from("just_me_item_serials")
      .update({
        length_remaining: usage.lengthRemaining,
        is_scrap: usage.isScrap,
        status: usage.status,
      })
      .eq("id", scrap.id)
      .eq("org_id", orgId)
      .eq("length_remaining", scrap.length_remaining) // กันสองคนตัดเส้นเดียวกันพร้อมกัน
      .select()
      .single();
    if (updErr || !updated) {
      return NextResponse.json(
        { error: "เส้นนี้เพิ่งถูกใช้ไปแล้ว กรุณาโหลดหน้าใหม่" },
        { status: 409 },
      );
    }

    return NextResponse.json({ success: true, serial: updated });
  }

  return NextResponse.json({ error: "action not supported" }, { status: 400 });
}
