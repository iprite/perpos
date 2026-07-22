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
// Fuzzy lookup — "ข้อเสนอแนะ" เท่านั้น (migration 20260722210000, pg_trgm)
//
// ⚠️ กฎความปลอดภัยของฟีเจอร์ (ห้ามละเมิด — เอกสารนี้ใช้ยื่นราชการ):
//    exact match (findProductByName/findProductsByNames) → auto-apply ได้
//    fuzzy match (ด้านล่าง)                              → **เสนอให้คนเลือกเท่านั้น**
//    ห้าม caller เอาผลจากที่นี่ไปเรียก applyProductToItem เอง / ตั้ง source='library'
//    อัตโนมัติทุกกรณี — จับคู่ผิด = สเปก/ราคาของสินค้าคนละตัวไหลเข้าเอกสารที่ยื่น
//    ราชการ พร้อมป้าย "จากคลัง" ที่ดูเหมือนคนยืนยันแล้ว
// ---------------------------------------------------------------------------

/** สินค้าในคลังเท่าที่ RPC คืน (พอสำหรับแสดงตัวเลือก — ตอน "ใช้อันนี้" ค่อยอ่านตัวเต็ม) */
export type CatalogProductSuggestionInfo = Pick<
  CatalogProduct,
  "id" | "name" | "brand_model" | "image_path" | "last_unit_price"
>;

export interface CatalogProductSuggestion {
  product: CatalogProductSuggestionInfo;
  /** similarity ของ pg_trgm (0–1) */
  score: number;
  /** ชื่อ normalize แล้วตรงกันเป๊ะ (= เคสที่ auto-apply ได้อยู่แล้ว) */
  exact: boolean;
}

/**
 * เกณฑ์คะแนนขั้นต่ำของข้อเสนอแนะ = **0.30**
 *
 * ที่มา (unit test `catalog-products.fuzzy.test.ts` — คำนวณ trigram แบบเดียวกับ pg_trgm
 * บนคู่ชื่อจริงจาก TOR vs คลัง):
 *   ควรเจอ  : "ปากกาเจล 0.5 น้ำเงิน" ↔ "ปากกาหมึกเจล สีน้ำเงิน ขนาด 0.5 มม."  ≈ 0.44
 *             "กระดาษ A4 80 แกรม"    ↔ "กระดาษถ่ายเอกสาร A4 80 แกรม Double A"  ≈ 0.45
 *   ห้ามเจอ : "ปากกาเจล 0.5"         ↔ "ปากกาไวท์บอร์ด สีดำ"                   ≈ 0.18
 *             "กระดาษ A4 80 แกรม"    ↔ "กระดาษชำระ ม้วนใหญ่"                    ≈ 0.19
 * → ช่องว่างระหว่างสองกลุ่มกว้าง (≈0.19 vs ≈0.44) เลือกค่าใกล้กลางที่ต่ำสุดเท่าที่
 *   ยังกันกลุ่มล่างได้ = 0.30 ซึ่งตรงกับ default ของ operator `%` (GUC
 *   `pg_trgm.similarity_threshold`) พอดี → ค่านี้เป็น "พื้น" ที่ต่ำกว่านี้ไม่ได้ผลจริง
 *   (RPC clamp ให้เท่ากับ 0.3 อยู่แล้ว)
 * ⚠️ ตัวเลขข้างบนมาจากการจำลอง pg_trgm ฝั่ง TS — หลัง apply migration ให้รัน
 *    คิวรี verify ข้อ 4 ในไฟล์ migration เทียบกับ similarity() ของจริงอีกครั้ง
 */
export const FUZZY_MIN_SCORE = 0.3;

/** จำนวนข้อเสนอแนะต่อ 1 ชื่อ (คนต้องเลือกเอง — เยอะกว่านี้กลายเป็นภาระ) */
export const FUZZY_SUGGESTION_LIMIT = 5;

/** แถวดิบจาก RPC — ทุกฟิลด์ optional เพราะมาจากนอกระบบ type (PostgREST) */
interface MatchProductRow {
  input_name?: string;
  product_id?: string;
  name?: string;
  brand_model?: string | null;
  image_path?: string | null;
  last_unit_price?: number | string | null;
  score?: number | string;
}

export interface SuggestProductsOpts {
  /** ต่ำกว่า 0.3 ไม่มีผล (RPC clamp) */
  threshold?: number;
  limit?: number;
}

/**
 * หาสินค้าในคลังที่ "ใกล้เคียง" ชื่อที่ให้มา (pg_trgm) — คืน Map: ชื่อที่ส่งเข้าไป → ตัวเลือกเรียงคะแนน
 *
 * **ต้องไม่ทำให้อะไรพังถ้ายังไม่ได้ apply migration** (extension/RPC ยังไม่มี):
 * จับ error ทุกกรณี → คืน Map ว่าง + log (feature degrade ไม่ใช่ crash)
 * เพราะโค้ดนี้อาจ merge ขึ้น main ก่อนที่ migration จะถูก apply
 */
export async function suggestProductsByNames(
  client: SupabaseClient,
  orgId: string,
  names: string[],
  opts: SuggestProductsOpts = {},
): Promise<Map<string, CatalogProductSuggestion[]>> {
  const out = new Map<string, CatalogProductSuggestion[]>();

  // ส่งเฉพาะชื่อที่ normalize แล้วไม่ว่าง + ไม่ซ้ำ (ประหยัดงานฝั่ง DB)
  const seen = new Set<string>();
  const queries: string[] = [];
  for (const raw of names) {
    const name = String(raw ?? "").trim();
    if (!name || !normalizeName(name) || seen.has(name)) continue;
    seen.add(name);
    queries.push(name);
  }
  if (queries.length === 0) return out;

  const threshold = Math.max(opts.threshold ?? FUZZY_MIN_SCORE, FUZZY_MIN_SCORE);
  const limit = Math.min(Math.max(opts.limit ?? FUZZY_SUGGESTION_LIMIT, 1), 20);

  let rows: MatchProductRow[] = [];
  try {
    const { data, error } = await client.rpc("gov_procure_match_products", {
      p_org_id: orgId,
      p_names: queries,
      p_threshold: threshold,
      p_limit: limit,
    });
    if (error) {
      // ยังไม่ได้ apply migration (42883 undefined_function) หรือสิทธิ์ไม่พอ
      console.warn("[gov-procure:catalog] fuzzy match ใช้ไม่ได้ —", error.message);
      return out;
    }
    rows = (data ?? []) as MatchProductRow[];
  } catch (e) {
    console.warn("[gov-procure:catalog] fuzzy match ล้มเหลว —", (e as Error).message);
    return out;
  }

  const keyOf = new Map<string, string>(queries.map((n) => [n, normalizeName(n)] as const));

  for (const r of rows) {
    if (!r?.input_name || !r.product_id) continue;
    const list = out.get(r.input_name) ?? [];
    const score = Number(r.score);
    list.push({
      product: {
        id: r.product_id,
        name: r.name ?? "",
        brand_model: r.brand_model ?? null,
        image_path: r.image_path ?? null,
        last_unit_price:
          r.last_unit_price === null || r.last_unit_price === undefined
            ? null
            : Number(r.last_unit_price),
      },
      score: Number.isFinite(score) ? score : 0,
      exact: normalizeName(r.name ?? "") === keyOf.get(r.input_name),
    });
    out.set(r.input_name, list);
  }

  // เรียงคะแนนมาก→น้อยเสมอ (ไม่พึ่งลำดับแถวที่ PostgREST คืน) + ตัดตาม limit
  // ใช้ forEach แทน for…of เพราะ tsconfig ของแอป target ต่ำกว่า es2015 (ไม่มี downlevelIteration)
  out.forEach((list, k) => {
    const sorted = [...list].sort(
      (a: CatalogProductSuggestion, b: CatalogProductSuggestion) => b.score - a.score,
    );
    out.set(k, sorted.slice(0, limit));
  });
  return out;
}

/** เวอร์ชันชื่อเดียว — คืน [] เมื่อไม่มีข้อเสนอแนะ/RPC ยังไม่พร้อม */
export async function suggestProductsByName(
  client: SupabaseClient,
  orgId: string,
  name: string,
  opts: SuggestProductsOpts = {},
): Promise<CatalogProductSuggestion[]> {
  const map = await suggestProductsByNames(client, orgId, [name], opts);
  return map.get(String(name ?? "").trim()) ?? [];
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
