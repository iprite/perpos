// GET    /api/gov-procure/catalogs/[id]/items/[itemId]?orgId=  → 1 รายการ (member) + ประทับ viewed_at (B-B1)
// PATCH  …                                                     → แก้รายการ (canWrite)
// DELETE …                                                     → ลบรายการ + ไฟล์ (canWrite)
//
// contract: §5.9 A-B2 (allowlist) · A-1 (409 ตอน enrich) · A-4/C-2 (แก้เนื้อหา → manual + ล้าง verified)
//           · A-11 (price_history append) · C-B2 (price_basis) · B-B1 (viewed_at / action:"mark-viewed")

import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "../../../../../_lib/supabase";
import { setAuditContext } from "../../../../../_lib/audit";
import { requireGovProcureMember, canWrite, orgIdFromQuery, govError } from "../../../../_lib";
import {
  sanitizeCatalogItemPayload,
  touchesContentFields,
  touchesPriceFields,
  removeStorageFiles,
} from "../../../../_catalog-lib";
import type { CatalogItem, PriceHistoryEntry } from "@/lib/gov-procure/catalog";

type Ctx = { params: Promise<{ id: string; itemId: string }> };

/** ล็อกรายแถวระหว่าง AI ทำงาน (A-1) */
const LOCKED_STATES = ["queued", "running"];
/** เก็บประวัติราคาไว้ 20 รายการล่าสุด (A-11) */
const PRICE_HISTORY_LIMIT = 20;
/** จำนวนครั้งของ compare-and-swap ก่อนยอมเขียนแบบไม่ล็อก (กัน request ค้างถาวร) */
const CAS_ATTEMPTS = 3;

function sameValue(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (a === null || a === undefined) return b === null || b === undefined;
  if (typeof a === "object" || typeof b === "object") {
    return JSON.stringify(a) === JSON.stringify(b);
  }
  if (typeof a === "number" || typeof b === "number") {
    const na = Number(a);
    const nb = Number(b);
    if (Number.isFinite(na) && Number.isFinite(nb)) return na === nb;
  }
  return false;
}

/** อ่านรายการเดียว — กรอง org_id + catalog_id ในคิวรีเดียวกันเสมอ (G5 กัน IDOR) */
async function loadItem(
  admin: ReturnType<typeof createAdminClient>,
  orgId: string,
  catalogId: string,
  itemId: string,
): Promise<CatalogItem | null> {
  const { data, error } = await admin
    .from("gov_procure_catalog_items")
    .select("*")
    .eq("id", itemId)
    .eq("org_id", orgId)
    .eq("catalog_id", catalogId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return (data as CatalogItem | null) ?? null;
}

export async function GET(req: NextRequest, ctx: Ctx) {
  const { id, itemId } = await ctx.params;
  const orgId = orgIdFromQuery(req);
  if (!orgId) return govError("missing orgId");

  const auth = await requireGovProcureMember(req, orgId);
  if (!auth.ok) return auth.res;

  try {
    const admin = createAdminClient();
    const item = await loadItem(admin, orgId, id, itemId);
    if (!item) return govError("ไม่พบรายการนี้", 404);

    // B-B1 — "เปิดอ่านแล้ว" เป็นธงของ server (bulk verify ใช้กันประทับให้ของที่ไม่มีใครอ่าน)
    if (!item.viewed_at) {
      await setAuditContext(req, auth.userId, orgId);
      const now = new Date().toISOString();
      const { data } = await admin
        .from("gov_procure_catalog_items")
        .update({ viewed_at: now })
        .eq("id", itemId)
        .eq("org_id", orgId)
        .select("*")
        .maybeSingle();
      if (data) return NextResponse.json({ item: data as CatalogItem });
    }

    return NextResponse.json({ item });
  } catch (e) {
    return govError((e as Error).message, 500);
  }
}

export async function PATCH(req: NextRequest, ctx: Ctx) {
  const { id, itemId } = await ctx.params;
  const orgId = orgIdFromQuery(req);
  if (!orgId) return govError("missing orgId");

  const auth = await requireGovProcureMember(req, orgId);
  if (!auth.ok) return auth.res;
  if (!canWrite(auth.role)) return govError("ไม่มีสิทธิ์แก้ไขรายการ", 403);

  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const admin = createAdminClient();

  try {
    let item = await loadItem(admin, orgId, id, itemId);
    if (!item) return govError("ไม่พบรายการนี้", 404);

    // action:"mark-viewed" (B-B1) — ไม่แตะเนื้อหา จึงไม่ผ่านกฎ A-4
    if (body.action === "mark-viewed") {
      await setAuditContext(req, auth.userId, orgId);
      const { data, error } = await admin
        .from("gov_procure_catalog_items")
        .update({ viewed_at: item.viewed_at ?? new Date().toISOString() })
        .eq("id", itemId)
        .eq("org_id", orgId)
        .select("*")
        .maybeSingle();
      if (error) return govError(error.message, 500);
      return NextResponse.json({ item: data as CatalogItem });
    }

    // A-1 — ห้ามแก้ระหว่าง AI ถือรายการนี้อยู่
    if (LOCKED_STATES.includes(item.enrich_state)) {
      return govError("รายการนี้กำลังให้ AI เติมข้อมูลอยู่ — แก้ไขได้หลังทำเสร็จ", 409);
    }

    // A-B2 — allowlist เท่านั้น (server-set fields ถูกทิ้งเงียบ)
    const payload = sanitizeCatalogItemPayload(body);
    if (Object.keys(payload).length === 0) return NextResponse.json({ item });

    // แยก "ส่งมา" ออกจาก "เปลี่ยนจริง" — auto-save ที่ยิงค่าเดิมต้องไม่ล้างสถานะยืนยัน (R3)
    const changed: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(payload)) {
      if (!sameValue(v, (item as unknown as Record<string, unknown>)[k])) changed[k] = v;
    }
    if (Object.keys(changed).length === 0) return NextResponse.json({ item, unchanged: true });

    const contentChanged = touchesContentFields(changed);
    const priceChanged = touchesPriceFields(changed);

    let actorName: string | null = null;
    if (priceChanged) {
      const { data: profile } = await admin
        .from("profiles")
        .select("display_name, email")
        .eq("id", auth.userId)
        .maybeSingle();
      const p = profile as { display_name?: string | null; email?: string | null } | null;
      actorName = p?.display_name ?? p?.email ?? null;
    }

    await setAuditContext(req, auth.userId, orgId);

    for (let attempt = 0; attempt < CAS_ATTEMPTS; attempt += 1) {
      // `item` ถูก reassign ท้ายลูป (อ่านใหม่หลัง CAS ชน) → TS ไม่ narrow ข้ามรอบให้
      // guard ซ้ำตรงนี้เพื่อให้ทั้ง type และ runtime ปลอดภัยโดยไม่ต้อง cast
      if (!item) return govError("ไม่พบรายการนี้", 404);
      // snapshot ของรอบนี้ — closure ข้างล่าง (nextPrice) capture ตัวนี้แทน `item`
      // ที่เป็น let เพราะ TS ไม่ narrow ตัวแปรที่ถูก reassign เมื่ออยู่ใน callback
      const currentItem = item;
      const patch: Record<string, unknown> = { ...changed };

      // A-4/C-2 — แก้ฟิลด์เนื้อหา → กลับเป็น manual + ล้างการยืนยัน (statement เดียวกัน)
      if (contentChanged) {
        patch.source = "manual";
        patch.verified_by = null;
        patch.verified_at = null;
      }

      // C-B2 — แก้ราคาเอง: ที่มา = "ผู้ใช้กรอก", ไม่มีเปอร์เซ็นต์ประมาณการอีก
      if (priceChanged) {
        const now = new Date().toISOString();
        // ค่าใหม่ = ที่ส่งมา (ถ้ามีในชุดที่เปลี่ยนจริง) มิฉะนั้นคงค่าเดิมของแถว
        const nextPrice = (key: "unit_price_ref" | "price_min" | "price_max"): number | null => {
          const v = key in changed ? changed[key] : currentItem[key];
          return typeof v === "number" && Number.isFinite(v) ? v : null;
        };
        const to = {
          ref: nextPrice("unit_price_ref"),
          min: nextPrice("price_min"),
          max: nextPrice("price_max"),
        };
        const basis =
          typeof changed.price_basis === "string" && changed.price_basis.trim()
            ? changed.price_basis.trim()
            : "ผู้ใช้กรอก";

        const entry: PriceHistoryEntry = {
          at: now,
          by: auth.userId,
          by_name: actorName,
          from: { ref: item.unit_price_ref, min: item.price_min, max: item.price_max },
          to,
          basis,
        };

        patch.price_basis = basis;
        patch.price_confidence = null;
        patch.price_updated_by = auth.userId;
        patch.price_updated_at = now;
        // append + ตัดเหลือ 20 ล่าสุด · ล็อกด้วย updated_at (CAS) แทน `||` ของ SQL
        // (PostgREST เขียน expression ระดับคอลัมน์ไม่ได้ และฟีเจอร์นี้ห้ามเพิ่ม RPC ใหม่ — §5.2)
        patch.price_history = [...(item.price_history ?? []), entry].slice(-PRICE_HISTORY_LIMIT);
      }

      let q = admin
        .from("gov_procure_catalog_items")
        .update(patch)
        .eq("id", itemId)
        .eq("org_id", orgId)
        .eq("catalog_id", id);

      // CAS เฉพาะตอนต้อง append ประวัติ (กัน lost-append เมื่อมีคนแก้ราคาพร้อมกัน)
      const useCas = priceChanged && attempt < CAS_ATTEMPTS - 1;
      if (useCas) q = q.eq("updated_at", item.updated_at);

      const { data, error } = await q.select("*").maybeSingle();
      if (error) return govError(error.message, 500);
      if (data) return NextResponse.json({ item: data as CatalogItem });

      // แถวไม่ถูกอัปเดต = มีคนแก้แซงระหว่างทาง → อ่านใหม่แล้วลองอีกครั้ง
      const fresh = await loadItem(admin, orgId, id, itemId);
      if (!fresh) return govError("ไม่พบรายการนี้", 404);
      if (LOCKED_STATES.includes(fresh.enrich_state)) {
        return govError("รายการนี้กำลังให้ AI เติมข้อมูลอยู่ — แก้ไขได้หลังทำเสร็จ", 409);
      }
      item = fresh;
    }

    return govError("มีการแก้ไขรายการนี้พร้อมกัน กรุณาลองใหม่อีกครั้ง", 409);
  } catch (e) {
    return govError((e as Error).message, 500);
  }
}

export async function DELETE(req: NextRequest, ctx: Ctx) {
  const { id, itemId } = await ctx.params;
  const orgId = orgIdFromQuery(req);
  if (!orgId) return govError("missing orgId");

  const auth = await requireGovProcureMember(req, orgId);
  if (!auth.ok) return auth.res;
  if (!canWrite(auth.role)) return govError("ไม่มีสิทธิ์ลบรายการ", 403);

  const admin = createAdminClient();

  try {
    const item = await loadItem(admin, orgId, id, itemId);
    if (!item) return govError("ไม่พบรายการนี้", 404);
    if (LOCKED_STATES.includes(item.enrich_state)) {
      return govError("รายการนี้กำลังให้ AI เติมข้อมูลอยู่ — ลบได้หลังทำเสร็จ", 409);
    }

    await setAuditContext(req, auth.userId, orgId);

    const { error } = await admin
      .from("gov_procure_catalog_items")
      .delete()
      .eq("id", itemId)
      .eq("org_id", orgId)
      .eq("catalog_id", id);

    if (error) return govError(error.message, 500);

    // A-10 — ลบไฟล์หลังลบแถวสำเร็จ
    await removeStorageFiles(admin, [item.image_path], orgId);

    return NextResponse.json({ ok: true });
  } catch (e) {
    return govError((e as Error).message, 500);
  }
}
