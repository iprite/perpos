// lib/gov-procure/catalog-products.ts — คลังสินค้าของ org: normalize ชื่อ / จับคู่ / บันทึกเข้าคลัง
// contract: specs/gov-procure-catalog.md §5.9 A-2 (คลังรับเฉพาะ `human_verified`) · C-B2 (price_basis) · D5 (v1 = exact match)
//
// 🔒 INVARIANT ที่ DB บังคับไม่ได้ (กฎข้ามตาราง) → บังคับที่นี่ + มี unit test:
//    "บันทึกเข้าคลัง (gov_procure_products) รับเฉพาะ item ที่ source='human_verified'"

import type { SupabaseClient } from "@supabase/supabase-js";
import { toArabicDigits } from "./catalog-parse";
import type { CatalogItem, CatalogItemSource, CatalogProduct, CatalogSubItem } from "./catalog";

/**
 * normalizeName — ต้องให้ผลลัพธ์ **ตรงกับ SQL `public.gov_procure_normalize_name()` เป๊ะ**
 * (คอลัมน์ `gov_procure_products.name_key` เป็น GENERATED จากฟังก์ชันนั้น
 *  → ถ้าสองฝั่งไม่ตรง การค้นด้วย `name_key` จะไม่เจอทั้งที่มีของอยู่จริง)
 *
 * ลำดับ 4 ขั้นตรงกับ SQL:
 *   1) รวมช่องว่างทุกชนิด (รวม nbsp/tab/newline) เป็นช่องว่างเดียว + lower
 *   2) เลขไทย → เลขอารบิก
 *   3) วรรคตอน/สัญลักษณ์ → ช่องว่าง
 *   4) รวมช่องว่างซ้ำ + trim
 *
 * ตัวอย่างที่ยืนยันกับ prod แล้ว:
 *   'Post-it 3M กระดาษโน้ต No.683-5CF' → 'post it 3m กระดาษโน้ต no 683 5cf'
 *   '  ปากกา   เจล  ๐.๕  '            → 'ปากกา เจล 0 5'
 *
 * ⚠️ แก้กฎนี้ = ต้อง drop/re-add คอลัมน์ `name_key` ใน DB ด้วย (ค่าที่ stored ไม่ recompute เอง)
 */
export function normalizeName(name: string): string {
  const collapsed = String(name ?? "")
    .replace(/[\s ]+/g, " ")
    .toLowerCase();
  const arabic = toArabicDigits(collapsed);
  const depunctuated = arabic.replace(/[[\](){}<>.,;:!?/\\|_'"`+*&#@~^%$-]/g, " ");
  return depunctuated.replace(/\s+/g, " ").trim();
}

/** คลังรับเฉพาะรายการที่ "คนยืนยันแล้ว" — ai_draft/manual/library ถูกปฏิเสธ (A-2) */
export function canSaveToLibrary(source: CatalogItemSource): boolean {
  return source === "human_verified";
}

export const LIBRARY_REJECT_MESSAGE =
  "บันทึกเข้าคลังได้เฉพาะรายการที่ยืนยันแล้ว (ตรวจสอบโดยผู้ใช้) เท่านั้น";

// ---------------------------------------------------------------------------
// Lookup (exact match ผ่าน name_key — v1 ไม่มี fuzzy/pg_trgm ตาม D5)
// ---------------------------------------------------------------------------

/** หาสินค้าในคลังจากชื่อแบบตรงตัว (หลัง normalize) — ไม่พบ = null */
export async function findProductByName(
  client: SupabaseClient,
  orgId: string,
  name: string,
): Promise<CatalogProduct | null> {
  const key = normalizeName(name);
  if (!key) return null;

  const { data, error } = await client
    .from("gov_procure_products")
    .select("*")
    .eq("org_id", orgId)
    .eq("name_key", key)
    .maybeSingle();

  if (error) throw new Error(error.message);
  return (data as CatalogProduct | null) ?? null;
}

/**
 * จับคู่หลายชื่อในคิวรีเดียว (ใช้ตอน paste 84 บรรทัด → "พบ n รายการตรงกับคลังสินค้า")
 * คืน Map: name_key → product
 */
export async function findProductsByNames(
  client: SupabaseClient,
  orgId: string,
  names: string[],
): Promise<Map<string, CatalogProduct>> {
  const keys = Array.from(new Set(names.map((n) => normalizeName(n)).filter((k) => k.length > 0)));
  const out = new Map<string, CatalogProduct>();
  if (keys.length === 0) return out;

  const { data, error } = await client
    .from("gov_procure_products")
    .select("*")
    .eq("org_id", orgId)
    .in("name_key", keys);

  if (error) throw new Error(error.message);
  for (const p of (data ?? []) as CatalogProduct[]) out.set(p.name_key, p);
  return out;
}

// ---------------------------------------------------------------------------
// คลัง → รายการ (library match)
// ---------------------------------------------------------------------------

/**
 * ค่าที่จะเขียนทับลง catalog item เมื่อจับคู่กับคลังได้ (pure — route เอาไป update)
 * ราคาที่มาจากคลัง = คนเคยยืนยันแล้ว → `price_basis="คลังสินค้า"`, `price_confidence=null` (C-B2)
 */
export function applyProductToItem(product: CatalogProduct): Record<string, unknown> {
  return {
    name: product.name,
    brand_model: product.brand_model,
    spec_line: product.spec_line,
    size_line: product.size_line,
    bullets: product.bullets ?? [],
    care_notes: product.care_notes ?? [],
    caution_notes: product.caution_notes ?? [],
    sub_items: product.sub_items ?? [],
    category: product.category,
    source: "library" as CatalogItemSource,
    confidence: null,
    ai_warnings: [],
    ai_note: null,
    product_id: product.id,
    ...(product.last_unit_price !== null && product.last_unit_price !== undefined
      ? {
          unit_price_ref: product.last_unit_price,
          price_basis: "คลังสินค้า",
          price_confidence: null,
        }
      : {}),
  };
}

// ---------------------------------------------------------------------------
// รายการ → คลัง (บันทึกเข้าคลัง)
// ---------------------------------------------------------------------------

/**
 * normalize array ที่จะเก็บเข้าคลัง — ตัด element ว่างทิ้ง
 *
 * ของที่เข้าคลังถูก reuse ข้ามซองประมูลไปเรื่อย ๆ (ครั้งหน้าชื่อซ้ำ = ดึงอันนี้มาใช้)
 * ถ้าปล่อยบรรทัดว่างติดไป จะกลายเป็น bullet เปล่าใน PDF ที่ยื่นราชการ และแก้ยาก
 * เพราะต้นตออยู่ในคลังไม่ใช่ในชุด → ตัดตั้งแต่ตอนเก็บ
 */
function asArray<T>(v: T[] | null | undefined): T[] {
  if (!Array.isArray(v)) return [];
  return v.filter((el) => {
    if (typeof el === "string") return el.trim().length > 0;
    return el !== null && el !== undefined;
  });
}

/**
 * แปลง catalog item → payload ของคลัง (pure, ทดสอบได้โดยไม่ต้องมี client)
 * ⚠️ **ไม่ copy `ai_warnings`** (C-B1 — เป็นความไม่มั่นใจของ AI รอบนั้น ไม่ใช่คุณสมบัติสินค้า)
 * ⚠️ **ไม่ copy `image_path`** — ไฟล์ของชุดอยู่คนละ prefix (`<orgId>/catalogs/…`)
 *    การคัดลอกไฟล์ไป `<orgId>/products/…` เป็นหน้าที่ของ route (server-set, A-B2/C-1)
 */
export function buildProductPayloadFromItem(
  item: Pick<
    CatalogItem,
    | "name"
    | "brand_model"
    | "spec_line"
    | "size_line"
    | "bullets"
    | "care_notes"
    | "caution_notes"
    | "sub_items"
    | "category"
    | "unit"
    | "unit_price_ref"
  >,
): Record<string, unknown> {
  return {
    name: item.name,
    brand_model: item.brand_model ?? null,
    spec_line: item.spec_line ?? null,
    size_line: item.size_line ?? null,
    bullets: asArray<string>(item.bullets),
    care_notes: asArray<string>(item.care_notes),
    caution_notes: asArray<string>(item.caution_notes),
    sub_items: asArray<CatalogSubItem>(item.sub_items),
    category: item.category ?? null,
    default_unit: item.unit ?? null,
  };
}

export type UpsertProductResult =
  | { ok: true; product: CatalogProduct; created: boolean }
  | { ok: false; reason: string };

/**
 * บันทึก item เข้าคลัง (สร้างใหม่ถ้ายังไม่มีชื่อนี้ / อัปเดตทับถ้ามีแล้ว)
 * — **ปฏิเสธทุก source ที่ไม่ใช่ `human_verified`** (A-2, invariant ของฟีเจอร์)
 * — ราคา: เขียน `last_unit_price` + `price_updated_by/at` เมื่อ item มีราคาเท่านั้น
 */
export async function upsertProductFromItem(
  client: SupabaseClient,
  orgId: string,
  item: CatalogItem,
  actorId: string,
): Promise<UpsertProductResult> {
  if (!canSaveToLibrary(item.source)) {
    return { ok: false, reason: LIBRARY_REJECT_MESSAGE };
  }
  const name = (item.name ?? "").trim();
  if (!normalizeName(name)) {
    return { ok: false, reason: "ชื่อสินค้าว่าง — บันทึกเข้าคลังไม่ได้" };
  }

  const payload = buildProductPayloadFromItem({ ...item, name });
  const hasPrice = item.unit_price_ref !== null && item.unit_price_ref !== undefined;
  const priceFields = hasPrice
    ? {
        last_unit_price: item.unit_price_ref,
        price_updated_by: actorId,
        price_updated_at: new Date().toISOString(),
      }
    : {};

  const existing = await findProductByName(client, orgId, name);

  if (existing) {
    const { data, error } = await client
      .from("gov_procure_products")
      .update({ ...payload, ...priceFields })
      .eq("org_id", orgId)
      .eq("id", existing.id)
      .select("*")
      .single();

    if (error) throw new Error(error.message);
    return { ok: true, product: data as CatalogProduct, created: false };
  }

  const { data, error } = await client
    .from("gov_procure_products")
    .insert({ ...payload, ...priceFields, org_id: orgId, created_by: actorId })
    .select("*")
    .single();

  if (error) throw new Error(error.message);
  return { ok: true, product: data as CatalogProduct, created: true };
}

/** นับการนำสินค้าไปใช้ (event counter — ไม่ใช่ derived) */
export async function markProductUsed(
  client: SupabaseClient,
  orgId: string,
  productId: string,
  timesUsed: number,
): Promise<void> {
  const { error } = await client
    .from("gov_procure_products")
    .update({ times_used: Math.max(0, timesUsed) + 1, last_used_at: new Date().toISOString() })
    .eq("org_id", orgId)
    .eq("id", productId);

  if (error) throw new Error(error.message);
}
