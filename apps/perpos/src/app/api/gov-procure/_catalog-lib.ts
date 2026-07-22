// api/gov-procure/_catalog-lib.ts — allowlist + guard เฉพาะฟีเจอร์ "แคตตาล็อกสินค้า AI"
// contract: specs/gov-procure-catalog.md §5.9 A-B2 (mass-assignment) · A-4/C-2 (แก้แล้วสถานะย้อน)
//           · G3/G4 (IDOR ข้าม org) · Q1(b) (ราคาไม่ถูกตัดตามสิทธิ์)
//
// ⛔ **ไฟล์ใหม่ — ห้ามแตะ `_lib.ts` เดิม และห้ามแตะ `FINANCE_FIELDS`/`sanitizeOrderPayload`**
//    (ราคาแคตตาล็อกเป็นคนละโดเมนกับการเงินของ order — Q1(b) ล็อกไว้แล้ว)
//    guard สิทธิ์ (`requireGovProcureMember`/`canWrite`/`canDelete`/`canManageSettings`)
//    reuse จาก `_lib.ts` เดิมตรง ๆ ไม่ทำใหม่

import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * CATALOG_ITEM_WRITABLE_FIELDS (A-B2) — ฟิลด์เดียวที่ client เขียนได้ผ่าน PATCH item.
 * **ไม่ตัดฟิลด์ราคาตาม role** (Q1b — ทุกคนที่ `canWrite` แก้ราคาได้)
 */
export const CATALOG_ITEM_WRITABLE_FIELDS: readonly string[] = [
  // เนื้อหา
  "name",
  "brand_model",
  "spec_line",
  "size_line",
  "bullets",
  "care_notes",
  "caution_notes",
  "sub_items",
  "category",
  "qty",
  "unit",
  "seq_no",
  // ราคา
  "unit_price_ref",
  "price_min",
  "price_max",
  "price_basis",
] as const;

/**
 * SERVER_SET_FIELDS — ห้ามรับจาก body **ทุกกรณี** (route เป็นคนกำหนดเองเท่านั้น).
 * `image_path` เขียนได้จาก route `/catalog-images` เท่านั้น จาก path ที่ route สร้างเอง.
 */
export const SERVER_SET_FIELDS: readonly string[] = [
  "id",
  "org_id",
  "catalog_id",
  "name_raw",
  "image_path",
  "source",
  "confidence",
  "price_confidence",
  "ai_warnings",
  "ai_note",
  "verified_by",
  "verified_at",
  "viewed_at",
  "price_updated_by",
  "price_updated_at",
  "price_history",
  "enrich_state",
  "enrich_claimed_at",
  "enrich_job_id",
  "enrich_error",
  "product_id",
  "created_at",
  "updated_at",
] as const;

/** ฟิลด์ "เนื้อหา" — แก้แล้ว `source='manual'` + ล้าง `verified_by/at` (A-4/C-2) */
export const CATALOG_ITEM_CONTENT_FIELDS: readonly string[] = [
  "name",
  "brand_model",
  "spec_line",
  "size_line",
  "bullets",
  "care_notes",
  "caution_notes",
  "sub_items",
  "category",
  "qty",
  "unit",
] as const;

/** ฟิลด์ราคา — แก้แล้ว **ไม่เปลี่ยน** `source`/`verified_*` แต่ต้อง set `price_updated_by/at` + append `price_history` */
export const CATALOG_ITEM_PRICE_FIELDS: readonly string[] = [
  "unit_price_ref",
  "price_min",
  "price_max",
  "price_basis",
] as const;

const WRITABLE_SET = new Set<string>(CATALOG_ITEM_WRITABLE_FIELDS);
const CONTENT_SET = new Set<string>(CATALOG_ITEM_CONTENT_FIELDS);
const PRICE_SET = new Set<string>(CATALOG_ITEM_PRICE_FIELDS);

/** array ของ string ล้วน (G7 — CHECK ใน DB คุมได้แค่ "เป็น array") */
function toStringArray(v: unknown): string[] {
  if (!Array.isArray(v)) return [];
  return v.map((x) => String(x ?? "").trim()).filter((s) => s.length > 0);
}

/** `[{name, qty, unit}]` — ทิ้ง element ที่ผิดรูป */
function toSubItems(v: unknown): { name: string; qty: number | null; unit: string | null }[] {
  if (!Array.isArray(v)) return [];
  return v
    .map((raw) => {
      const o = (raw ?? {}) as Record<string, unknown>;
      const name = String(o.name ?? "").trim();
      if (!name) return null;
      const qtyNum = Number(o.qty);
      const unit = String(o.unit ?? "").trim();
      return {
        name,
        qty: Number.isFinite(qtyNum) ? qtyNum : null,
        unit: unit || null,
      };
    })
    .filter((x): x is { name: string; qty: number | null; unit: string | null } => x !== null);
}

function toNumberOrNull(v: unknown): number | null {
  if (v === "" || v === null || v === undefined) return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

/**
 * sanitizeCatalogItemPayload — คัดเฉพาะฟิลด์ใน allowlist + normalize ชนิดข้อมูล.
 * **ไม่ตัดราคาตาม role** (Q1b) · ฟิลด์ที่ไม่อยู่ใน allowlist ถูกทิ้งเงียบ ๆ
 * (รวม server-set ทั้งหมด → กัน mass-assignment `image_path`/`source`/`verified_*`)
 */
export function sanitizeCatalogItemPayload(body: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const key of CATALOG_ITEM_WRITABLE_FIELDS) {
    if (!(key in body)) continue;
    const v = body[key];

    switch (key) {
      case "bullets":
      case "care_notes":
      case "caution_notes":
        out[key] = toStringArray(v);
        break;
      case "sub_items":
        out[key] = toSubItems(v);
        break;
      case "qty":
      case "seq_no":
      case "unit_price_ref":
      case "price_min":
      case "price_max":
        out[key] = toNumberOrNull(v);
        break;
      default:
        out[key] = v === "" ? null : v;
    }
  }
  return out;
}

/** payload นี้แตะฟิลด์เนื้อหาไหม (→ ต้องย้อน `source='manual'` + ล้าง `verified_*`) */
export function touchesContentFields(payload: Record<string, unknown>): boolean {
  return Object.keys(payload).some((k) => CONTENT_SET.has(k));
}

/** payload นี้แตะฟิลด์ราคาไหม (→ ต้อง set `price_updated_by/at` + append `price_history`) */
export function touchesPriceFields(payload: Record<string, unknown>): boolean {
  return Object.keys(payload).some((k) => PRICE_SET.has(k));
}

/** ฟิลด์ที่ถูกทิ้ง (ใช้ log/debug — ไม่ต้องคืน error ให้ client) */
export function droppedFields(body: Record<string, unknown>): string[] {
  return Object.keys(body ?? {}).filter((k) => !WRITABLE_SET.has(k));
}

// ---------------------------------------------------------------------------
// Ownership guards (IDOR — G3/G4) — เรียกก่อน mutate ที่อ้าง id ข้ามตารางเสมอ
// ---------------------------------------------------------------------------

/** ชุดแคตตาล็อกนี้เป็นของ org นี้จริงไหม (คิวรีเดียว กรอง org_id ในตัว) */
export async function catalogBelongsToOrg(
  client: SupabaseClient,
  catalogId: string,
  orgId: string,
): Promise<boolean> {
  if (!catalogId || !orgId) return false;
  const { data, error } = await client
    .from("gov_procure_catalogs")
    .select("id")
    .eq("id", catalogId)
    .eq("org_id", orgId)
    .maybeSingle();

  if (error) throw new Error(error.message);
  return Boolean(data);
}

/**
 * งาน (order) นี้เป็นของ org นี้จริงไหม — **ต้องเรียกก่อน set `catalogs.order_id` เสมอ**
 * (DB ยังปิดช่องนี้ไม่ได้: ต้องเพิ่ม unique(id, org_id) บน `gov_procure_orders` = แตะตารางเดิม)
 */
export async function orderBelongsToOrg(
  client: SupabaseClient,
  orderId: string,
  orgId: string,
): Promise<boolean> {
  if (!orderId || !orgId) return false;
  const { data, error } = await client
    .from("gov_procure_orders")
    .select("id")
    .eq("id", orderId)
    .eq("org_id", orgId)
    .maybeSingle();

  if (error) throw new Error(error.message);
  return Boolean(data);
}

/** สินค้าในคลังนี้เป็นของ org นี้จริงไหม */
export async function productBelongsToOrg(
  client: SupabaseClient,
  productId: string,
  orgId: string,
): Promise<boolean> {
  if (!productId || !orgId) return false;
  const { data, error } = await client
    .from("gov_procure_products")
    .select("id")
    .eq("id", productId)
    .eq("org_id", orgId)
    .maybeSingle();

  if (error) throw new Error(error.message);
  return Boolean(data);
}

/** path ของไฟล์ต้องขึ้นต้นด้วย `<orgId>/` เสมอ (กันอ่านไฟล์ข้าม org — A-B1) */
export function pathBelongsToOrg(path: string | null | undefined, orgId: string): boolean {
  if (!path || !orgId) return false;
  return path.startsWith(`${orgId}/`);
}

// ---------------------------------------------------------------------------
// Storage — bucket เดิมของ module (ไม่มี bucket ใหม่) · prefix ใหม่เท่านั้น (C-1)
// ---------------------------------------------------------------------------

/** bucket เดิมของ module — ห้ามสร้างใหม่ (§5.7) */
export const CATALOG_BUCKET = "gov-procure";

/** ชื่อไฟล์ปลอดภัย (ท่าเดียวกับ `attachments/route.ts:93`) */
export function safeFileName(name: string | null | undefined): string {
  return String(name || "file").replace(/[^\w.\-ก-๙]/g, "_");
}

/** path รูปของรายการในชุด — **server สร้างเองเสมอ** (A-B2/C-1) */
export function buildCatalogImagePath(
  orgId: string,
  catalogId: string,
  fileName: string | null,
): string {
  return `${orgId}/catalogs/${catalogId}/${crypto.randomUUID()}-${safeFileName(fileName)}`;
}

/** path รูปของสินค้าในคลัง — server สร้างเองเสมอ */
export function buildProductImagePath(
  orgId: string,
  productId: string,
  fileName: string | null,
): string {
  return `${orgId}/products/${productId}/${crypto.randomUUID()}-${safeFileName(fileName)}`;
}

/** ลบไฟล์แบบ best-effort (ไม่ rollback DB เมื่อล้ม — A-10) */
export async function removeStorageFiles(
  client: SupabaseClient,
  paths: (string | null | undefined)[],
  orgId: string,
): Promise<void> {
  const valid = paths.filter((p): p is string => pathBelongsToOrg(p, orgId));
  if (valid.length === 0) return;
  const { error } = await client.storage.from(CATALOG_BUCKET).remove(valid);
  if (error) console.warn("[gov-procure:catalog] ลบไฟล์ไม่สำเร็จ:", error.message);
}

/** ลบทุกไฟล์ใต้ prefix (ลบชุด/ลบสินค้าในคลัง — A-10) */
export async function removeStoragePrefix(
  client: SupabaseClient,
  prefix: string,
  orgId: string,
): Promise<void> {
  if (!pathBelongsToOrg(prefix, orgId)) return;
  const { data, error } = await client.storage.from(CATALOG_BUCKET).list(prefix, { limit: 1000 });
  if (error) {
    console.warn("[gov-procure:catalog] list prefix ไม่สำเร็จ:", error.message);
    return;
  }
  const paths = (data ?? []).map((f) => `${prefix.replace(/\/$/, "")}/${f.name}`);
  await removeStorageFiles(client, paths, orgId);
}

// ---------------------------------------------------------------------------
// Self-heal ของ job ที่ค้าง (C-4) — ไม่ใช้ cron/sweeper
//   ผู้ใช้ปิดแท็บกลางคัน = ไม่มีใครเรียก /enrich/run ต่อ → catalog ค้าง 'enriching'
//   ถาวรและแก้อะไรไม่ได้เลย จึงตรวจทุกครั้งที่ GET /enrich หรือโหลดหน้าห้องทำงาน
// ---------------------------------------------------------------------------

/** heartbeat เก่ากว่านี้ + ไม่มี item ค้างคิว = ถือว่า job ตายแล้ว (C-4) */
export const JOB_STALE_MS = 10 * 60 * 1000;

export interface SelfHealResult {
  healed: boolean;
  /** job ที่ยัง active อยู่ (null = ไม่มี) */
  job: Record<string, unknown> | null;
}

/**
 * ปิด job ที่ตายค้าง + คืน catalog กลับสถานะที่แก้ไขต่อได้
 * (idempotent — เรียกซ้ำได้ · ไม่ throw เมื่อไม่มี job)
 */
export async function selfHealStuckCatalogJob(
  client: SupabaseClient,
  orgId: string,
  catalogId: string,
): Promise<SelfHealResult> {
  const { data, error } = await client
    .from("gov_procure_catalog_jobs")
    .select("*")
    .eq("org_id", orgId)
    .eq("catalog_id", catalogId)
    .in("status", ["pending", "processing"])
    .order("created_at", { ascending: false })
    .limit(1);

  if (error) throw new Error(error.message);
  const job = (data ?? [])[0] as Record<string, unknown> | undefined;
  if (!job) return { healed: false, job: null };

  const beat = (job.heartbeat_at ?? job.started_at ?? job.created_at) as string | null;
  const age = beat ? Date.now() - new Date(beat).getTime() : Number.POSITIVE_INFINITY;
  if (age < JOB_STALE_MS) return { healed: false, job };

  // ยังมีรายการค้างคิว = งานยังมีชีวิต (ผู้ใช้กลับมากด "ทำต่อ" ได้) → ไม่ปิด
  const { count } = await client
    .from("gov_procure_catalog_items")
    .select("id", { count: "exact", head: true })
    .eq("org_id", orgId)
    .eq("catalog_id", catalogId)
    .in("enrich_state", ["queued", "running"]);

  if ((count ?? 0) > 0) return { healed: false, job };

  const doneItems = Number(job.done_items ?? 0);
  await client
    .from("gov_procure_catalog_jobs")
    .update({
      status: doneItems > 0 ? "completed" : "failed",
      finished_at: new Date().toISOString(),
      error_message:
        doneItems > 0 ? null : "งานหยุดกลางคัน (ปิดหน้าจอก่อนทำเสร็จ) — กด 'ทำต่อ' เพื่อเริ่มใหม่",
    })
    .eq("id", job.id as string)
    .eq("org_id", orgId);

  // ชุดต้องกลับมาแก้ไขได้เสมอ — ไม่มีรายการที่ AI เติมสำเร็จเลย = ยังเป็นฉบับร่าง
  await client
    .from("gov_procure_catalogs")
    .update({ status: doneItems > 0 ? "review" : "draft" })
    .eq("id", catalogId)
    .eq("org_id", orgId)
    .eq("status", "enriching");

  return { healed: true, job: null };
}

// ---------------------------------------------------------------------------
// Letterhead snapshot (C1/C-6) — ตอน export ใช้ snapshot ของชุดอย่างเดียว
// ---------------------------------------------------------------------------

export interface CatalogLetterheadSnapshot {
  company_name: string | null;
  address_lines: string[];
  phone: string | null;
  tax_id: string | null;
  logo_data_url: string | null;
}

/**
 * อ่านค่าตั้งต้นหัวจดหมายของบริษัท → snapshot (คิวรีเดียว `.eq('org_id').eq('company')` — A-12)
 * ไม่มีค่าตั้งต้น = คืน null (ชุดยังสร้างได้ · เทมเพลต A ไม่ใช้หัวจดหมาย)
 */
export async function loadLetterheadSnapshot(
  client: SupabaseClient,
  orgId: string,
  company: string | null | undefined,
): Promise<CatalogLetterheadSnapshot | null> {
  if (!company) return null;
  const { data, error } = await client
    .from("gov_procure_catalog_letterheads")
    .select("company_name, address_lines, phone, tax_id, logo_data_url")
    .eq("org_id", orgId)
    .eq("company", company)
    .maybeSingle();

  if (error) throw new Error(error.message);
  if (!data) return null;

  const row = data as Record<string, unknown>;
  return {
    company_name: (row.company_name as string | null) ?? null,
    address_lines: Array.isArray(row.address_lines)
      ? (row.address_lines as unknown[]).map((x) => String(x ?? "")).filter(Boolean)
      : [],
    phone: (row.phone as string | null) ?? null,
    tax_id: (row.tax_id as string | null) ?? null,
    logo_data_url: (row.logo_data_url as string | null) ?? null,
  };
}
