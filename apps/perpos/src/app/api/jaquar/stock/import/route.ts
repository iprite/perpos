import { NextRequest, NextResponse } from "next/server";
import { requireModuleMember } from "../../../_lib/module-auth";
import { createAdminClient } from "../../../_lib/supabase";
import { canModuleWrite } from "@/lib/modules";
import { setAuditContext } from "../../../_lib/audit";

export async function POST(req: NextRequest) {
  const orgId = req.nextUrl.searchParams.get("orgId");
  if (!orgId) return NextResponse.json({ error: "missing orgId" }, { status: 400 });

  const auth = await requireModuleMember(req, orgId, "jaquar");
  if (!auth.ok) return auth.res;

  if (!canModuleWrite("jaquar", auth.moduleRole)) {
    return NextResponse.json({ error: "ไม่มีสิทธิ์เขียนข้อมูลในโมดูลนี้" }, { status: 403 });
  }

  const overwrite = req.nextUrl.searchParams.get("overwrite") === "true";

  const body = await req.json().catch(() => ({}));
  const { items, movements } = body;

  if (!items || !Array.isArray(items)) {
    return NextResponse.json({ error: "invalid or missing items array" }, { status: 400 });
  }

  // Cap payload size (defense-in-depth ก่อน loop)
  const ROW_LIMIT = 50000;
  if (items.length > ROW_LIMIT) {
    return NextResponse.json(
      {
        error: `จำนวนสินค้าเกิน ${ROW_LIMIT.toLocaleString("th-TH")} แถว กรุณาแบ่งไฟล์แล้วนำเข้าใหม่`,
      },
      { status: 400 },
    );
  }
  if (movements && Array.isArray(movements) && movements.length > ROW_LIMIT) {
    return NextResponse.json(
      {
        error: `จำนวนประวัติการเดินสต๊อกเกิน ${ROW_LIMIT.toLocaleString("th-TH")} แถว กรุณาแบ่งไฟล์แล้วนำเข้าใหม่`,
      },
      { status: 400 },
    );
  }

  const admin = createAdminClient();
  await setAuditContext(req, auth.userId, auth.orgId);

  try {
    // 1. Handle Overwrite
    if (overwrite) {
      const { error: delErr } = await admin
        .from("jaquar_inventory_items")
        .delete()
        .eq("org_id", orgId);

      if (delErr) throw new Error(`ล้างข้อมูลเก่าไม่สำเร็จ: ${delErr.message}`);
    }

    // 2. Deduplicate items in payload by item_code (just in case)
    const groupedItems: Record<string, any> = {};
    for (const item of items) {
      const code = (item.item_code || "").trim();
      if (!code) continue;

      // กัน NaN และค่าติดลบ — ค่าที่ไม่ใช่ finite หรือติดลบให้ตกเป็น 0
      const safeNum = (v: unknown) => {
        const n = Number(v);
        return Number.isFinite(n) && n >= 0 ? n : 0;
      };
      const starting = safeNum(item.amount_starting);
      const imp = safeNum(item.import_jaquar);
      const ret = safeNum(item.return_borrowed);
      const total = safeNum(item.total_saleable) || starting + imp + ret;
      const loc = (item.location || "").trim();

      if (groupedItems[code]) {
        groupedItems[code].amount_starting += starting;
        groupedItems[code].import_jaquar += imp;
        groupedItems[code].return_borrowed += ret;
        groupedItems[code].total_saleable += total;
        if (loc) {
          const locs = new Set(
            groupedItems[code].location
              ? groupedItems[code].location.split(",").map((l: string) => l.trim())
              : [],
          );
          locs.add(loc);
          groupedItems[code].location = Array.from(locs).filter(Boolean).join(", ");
        }
      } else {
        groupedItems[code] = {
          org_id: orgId,
          item_code: code,
          description: item.description?.trim() || null,
          location: loc || null,
          amount_starting: starting,
          import_jaquar: imp,
          return_borrowed: ret,
          total_saleable: total,
          created_by: auth.userId,
        };
      }
    }

    const uniqueItems = Object.values(groupedItems);
    if (uniqueItems.length === 0) {
      return NextResponse.json({ success: true, count: 0 });
    }

    // 3. Batch insert items (Supabase supports inserting arrays)
    // We do it in chunks of 200 items to avoid payload size errors
    const insertedItemsMap: Record<string, string> = {};
    const chunkSize = 200;

    for (let i = 0; i < uniqueItems.length; i += chunkSize) {
      const chunk = uniqueItems.slice(i, i + chunkSize);
      const { data: inserted, error: insertErr } = await admin
        .from("jaquar_inventory_items")
        .insert(chunk)
        .select("id, item_code");

      if (insertErr)
        throw new Error(`นำเข้าสินค้ากลุ่มที่ ${i / chunkSize + 1} ล้มเหลว: ${insertErr.message}`);

      if (inserted) {
        for (const item of inserted) {
          insertedItemsMap[item.item_code] = item.id;
        }
      }
    }

    // 4. Batch insert movements if provided
    if (movements && Array.isArray(movements) && movements.length > 0) {
      // Map item_code in movements to item_id
      const groupedMovements: Record<string, any> = {};

      for (const mov of movements) {
        const code = (mov.item_code || "").trim();
        if (!code || !insertedItemsMap[code]) continue;
        const itemId = insertedItemsMap[code];

        const date = mov.movement_date;
        const type = mov.movement_type || "out";
        const qty = Number(mov.qty || 0);
        const ref = mov.reference || null;

        if (qty <= 0) continue;

        // Group identical movements (same item, date, type, reference) to optimize
        const mKey = `${itemId}_${date}_${type}_${ref || ""}`;
        if (groupedMovements[mKey]) {
          groupedMovements[mKey].qty += qty;
        } else {
          groupedMovements[mKey] = {
            org_id: orgId,
            item_id: itemId,
            movement_date: date,
            qty,
            movement_type: type,
            reference: ref?.trim() || null,
            created_by: auth.userId,
          };
        }
      }

      const uniqueMovements = Object.values(groupedMovements);

      // Insert movements in chunks
      for (let i = 0; i < uniqueMovements.length; i += chunkSize) {
        const chunk = uniqueMovements.slice(i, i + chunkSize);
        const { error: movErr } = await admin.from("jaquar_inventory_movements").insert(chunk);

        if (movErr)
          throw new Error(
            `บันทึกประวัติการเดินสต๊อกกลุ่มที่ ${i / chunkSize + 1} ล้มเหลว: ${movErr.message}`,
          );
      }
    }

    return NextResponse.json({
      success: true,
      itemsCount: uniqueItems.length,
      movementsCount: movements ? movements.length : 0,
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
