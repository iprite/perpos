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
  postStockMovement,
  type JustMeMovementType,
} from "@/lib/just-me/stock-movements";

export async function GET(req: NextRequest) {
  const orgId = req.nextUrl.searchParams.get("orgId");
  if (!orgId) return NextResponse.json({ error: "missing orgId" }, { status: 400 });

  const auth = await requireModuleMember(req, orgId, "just_me");
  if (!auth.ok) return auth.res;

  const admin = createAdminClient();

  // 1. Fetch Warehouses
  const { data: warehouses, error: whErr } = await admin
    .from("just_me_warehouses")
    .select("*")
    .eq("org_id", orgId)
    .order("name");
  if (whErr) return NextResponse.json({ error: whErr.message }, { status: 500 });

  // 2. Fetch Inventory Items
  const { data: items, error: itemErr } = await admin
    .from("just_me_inventory_items")
    .select("*")
    .eq("org_id", orgId)
    .order("name");
  if (itemErr) return NextResponse.json({ error: itemErr.message }, { status: 500 });

  // 3. Fetch Stock Balances
  const { data: balances, error: balErr } = await admin
    .from("just_me_stock_balances")
    .select("*")
    .eq("org_id", orgId);
  if (balErr) return NextResponse.json({ error: balErr.message }, { status: 500 });

  // 4. Fetch Item Serials
  const { data: serials, error: serErr } = await admin
    .from("just_me_item_serials")
    .select("*")
    .eq("org_id", orgId);
  if (serErr) return NextResponse.json({ error: serErr.message }, { status: 500 });

  // 5. Fetch Stock Movements
  const { data: movements, error: movErr } = await admin
    .from("just_me_stock_movements")
    .select("*")
    .eq("org_id", orgId)
    .order("created_at", { ascending: false })
    .limit(1000);
  if (movErr) return NextResponse.json({ error: movErr.message }, { status: 500 });

  // 6. Fetch item costs (ต้นทุนเฉลี่ยถ่วงน้ำหนัก) + แนวโน้มรายเดือน 12 เดือนล่าสุด
  const { data: costs, error: costErr } = await admin
    .from("just_me_item_costs")
    .select("*")
    .eq("org_id", orgId);
  if (costErr) return NextResponse.json({ error: costErr.message }, { status: 500 });

  const since = new Date();
  since.setMonth(since.getMonth() - 11);
  since.setDate(1);
  const { data: costMonthly, error: cmErr } = await admin
    .from("just_me_item_cost_monthly")
    .select("*")
    .eq("org_id", orgId)
    .gte("month", since.toISOString().slice(0, 10))
    .order("month");
  if (cmErr) return NextResponse.json({ error: cmErr.message }, { status: 500 });

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
    warehouses: warehouses ?? [],
    items: items ?? [],
    balances: balances ?? [],
    serials: serials ?? [],
    movements: showCost ? movementsWithCreators : stripCostList(movementsWithCreators, role),
    costs: showCost ? (costs ?? []) : [],
    costMonthly: showCost ? (costMonthly ?? []) : [],
    canSeeCost: showCost,
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

    const lat =
      latitude === "" || latitude === undefined || latitude === null ? null : Number(latitude);
    const lng =
      longitude === "" || longitude === undefined || longitude === null ? null : Number(longitude);
    if (lat !== null && (Number.isNaN(lat) || lat < -90 || lat > 90)) {
      return NextResponse.json({ error: "ละติจูดต้องอยู่ระหว่าง -90 ถึง 90" }, { status: 400 });
    }
    if (lng !== null && (Number.isNaN(lng) || lng < -180 || lng > 180)) {
      return NextResponse.json({ error: "ลองจิจูดต้องอยู่ระหว่าง -180 ถึง 180" }, { status: 400 });
    }

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

    // ต้องมีคลังต้นทาง/ปลายทางตามประเภท — เดิมด่านนี้อยู่แค่ฝั่งหน้าจอ
    // ยิง issue โดยไม่ส่งคลังต้นทาง = ตัดมูลค่าออกจากฐานต้นทุนโดยไม่มีคลังไหนถูกหักของ (ยอดเพี้ยนถาวร)
    if (["transfer", "issue", "return"].includes(movement_type) && !source_warehouse_id) {
      return NextResponse.json({ error: "กรุณาระบุคลังต้นทาง" }, { status: 400 });
    }
    if (["receive", "transfer", "return"].includes(movement_type) && !destination_warehouse_id) {
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
      [source_warehouse_id, "คลังต้นทาง"],
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

    // ยอดคงเหลือ/ของพอไหม = ตรวจใน RPC แบบล็อกแถว (ตรวจที่นี่ก่อนก็ยังแข่งกันได้)
    // 1. For serial verification: If transferring, issuing, or returning, check that serials exist in the source warehouse
    let verifiedSerials: any[] = [];
    if (item.has_serial && source_warehouse_id) {
      const { data: foundSerials } = await admin
        .from("just_me_item_serials")
        .select("*")
        .eq("item_id", item_id)
        .eq("warehouse_id", source_warehouse_id)
        .eq("status", "in_stock")
        .in("serial_number", serialsList);

      const foundList = foundSerials ?? [];
      if (foundList.length !== serialsList.length) {
        const missing = serialsList.filter(
          (s: string) => !foundList.some((fs) => fs.serial_number === s),
        );
        return NextResponse.json(
          {
            error: `พบ Serial Number ที่ไม่มีในคลัง หรือไม่ได้อยู่ในสถานะ In Stock: ${missing.join(", ")}`,
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
      type: movement_type as JustMeMovementType,
      qty,
      sourceWarehouseId: source_warehouse_id || null,
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
    if (item.has_serial && !serialLinkCount) {
      const linkSerial = async (serialId: string) => {
        const { error } = await admin
          .from("just_me_stock_movement_serials")
          .insert({ movement_id: posted.movementId, serial_id: serialId });
        if (error) serialErrors.push(`ผูก Serial กับรายการนี้ไม่สำเร็จ`);
      };

      for (const sn of serialsList) {
        if (movement_type === "receive") {
          // Insert new serial
          const { data: newSer, error: insErr } = await admin
            .from("just_me_item_serials")
            .insert({
              org_id: orgId,
              item_id,
              warehouse_id: destination_warehouse_id,
              serial_number: sn,
              status: "in_stock",
              length_remaining: item.has_cable_measurement
                ? Number(length_remaining) || null
                : null,
              is_scrap: item.has_cable_measurement && Number(length_remaining) < 5,
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
            serialErrors.push(`ไม่พบ Serial "${sn}" ในคลังต้นทาง`);
            continue;
          }
          let patch: Record<string, unknown> = {};
          if (movement_type === "transfer") {
            patch = { warehouse_id: destination_warehouse_id };
          } else if (movement_type === "issue") {
            const lengthRem = item.has_cable_measurement ? Number(length_remaining) : null;
            patch = {
              status: "issued",
              length_remaining: lengthRem,
              is_scrap: item.has_cable_measurement && lengthRem !== null && lengthRem < 5,
            };
          } else {
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

  return NextResponse.json({ error: "action not supported" }, { status: 400 });
}
