// lib/gov-procure/catalog.ts — types + fetch logic ของ "แคตตาล็อกสินค้า AI"
// contract: specs/gov-procure-catalog.md §5.3 (field mapping) · §5.4 (state) · §5.9 A-5/C-B4
// schema จริง: supabase/migrations/20260722200000_gov_procure_catalog.sql
//
// กฎที่ไฟล์นี้ยึด:
//  - **helper รับ `client` เข้ามาเสมอ ห้ามสร้าง client เอง** (A-5) —
//    หน้า SSR ส่ง `rls` client (RLS/per-org) · route ส่ง `createAdminClient()` หลัง guard
//  - ทุกคิวรีมี `.eq('org_id', orgId)` เสมอ (org isolation — ห้ามพึ่ง RLS อย่างเดียว)
//  - list ใช้ `normalizePage`/`toPaged` (PostgREST ตัด 1,000 แถวเงียบ ๆ)

import type { SupabaseClient } from "@supabase/supabase-js";
import { normalizePage, toPaged, type PageOpts, type Paged } from "@/lib/accounting/paging";

// ---------------------------------------------------------------------------
// Enums (ตรงกับ CHECK constraint ใน migration เป๊ะ)
// ---------------------------------------------------------------------------

/** สถานะชุดแคตตาล็อก — `approved` = เอกสารพร้อมใช้ ≠ ยืนยันครบ 100% (C-8) */
export type CatalogStatus = "draft" | "enriching" | "review" | "approved";
export const CATALOG_STATUSES: CatalogStatus[] = ["draft", "enriching", "review", "approved"];

/** เทมเพลตเอกสาร — A = ตาราง (ไม่มีหัวจดหมาย) · B = บรรยาย (มีหัวจดหมายทุกหน้า) */
export type CatalogTemplate = "table" | "narrative";

/** ที่มาข้อมูลรายแถว (แกนของฟีเจอร์) — คลังสินค้ารับเฉพาะ `human_verified` (A-2) */
export type CatalogItemSource = "manual" | "ai_draft" | "human_verified" | "library";
export const CATALOG_ITEM_SOURCES: CatalogItemSource[] = [
  "manual",
  "ai_draft",
  "human_verified",
  "library",
];

/** สถานะ enrich รายแถว (claim ด้วย FOR UPDATE SKIP LOCKED ที่ route) */
export type CatalogEnrichState = "idle" | "queued" | "running" | "done" | "failed";

/** สถานะรอบ enrich (header ของ job) */
export type CatalogJobStatus = "pending" | "processing" | "completed" | "failed" | "cancelled";

// ---------------------------------------------------------------------------
// Row types
// ---------------------------------------------------------------------------

/** หัวจดหมายที่ snapshot ลงชุด (export ใช้ snapshot นี้อย่างเดียว — C1/C-6) */
export interface LetterheadSnapshot {
  company_name: string | null;
  address_lines: string[];
  phone: string | null;
  tax_id: string | null;
  /** data URL — builder validate regex + ≤500KB ก่อนพิมพ์ (A-6) */
  logo_data_url: string | null;
}

/** ค่าตั้งต้นหัวจดหมายต่อบริษัทต่อ org (`gov_procure_catalog_letterheads`) */
export interface Letterhead {
  id: string;
  org_id: string;
  /** 1 ใน COMPANIES (`lib/gov-procure/types.ts`) */
  company: string;
  company_name: string;
  address_lines: string[];
  phone: string | null;
  tax_id: string | null;
  logo_data_url: string | null;
  created_by: string;
  created_at: string;
  updated_at: string;
}

export interface Catalog {
  id: string;
  org_id: string;
  order_id: string | null;
  title: string;
  company: string | null;
  template: CatalogTemplate;
  show_prices: boolean;
  status: CatalogStatus;
  letterhead_snapshot: LetterheadSnapshot | null;
  notes: string | null;
  last_exported_at: string | null;
  created_by: string;
  created_at: string;
  updated_at: string;
}

/** รายการย่อยในชุด (สังฆทาน ฯลฯ) — ขึ้น PDF เฉพาะเทมเพลต B */
export interface CatalogSubItem {
  name: string;
  qty: number | null;
  unit: string | null;
}

/** 1 บรรทัดของประวัติราคา (append-only, เก็บ 20 ล่าสุด — A-11) */
export interface PriceHistoryEntry {
  at: string;
  by: string | null;
  by_name: string | null;
  from: { ref: number | null; min: number | null; max: number | null };
  to: { ref: number | null; min: number | null; max: number | null };
  basis: string | null;
}

export interface CatalogItem {
  id: string;
  org_id: string;
  catalog_id: string;
  seq_no: number;
  /** สิ่งที่ผู้ใช้ paste มา (เก็บถาวร ไม่ทับ) */
  name_raw: string;
  name: string;

  brand_model: string | null;
  spec_line: string | null;
  size_line: string | null;
  bullets: string[];
  care_notes: string[];
  /** "ข้อควรระวัง" ของสินค้า → ✅ ขึ้น PDF (เทมเพลต B) */
  caution_notes: string[];
  /** สิ่งที่ AI ไม่มั่นใจ → ❌ ห้ามขึ้น PDF เด็ดขาด (C-B1) */
  ai_warnings: string[];
  sub_items: CatalogSubItem[];
  category: string | null;

  qty: number | null;
  unit: string | null;
  /** server-set only — เขียนได้จาก route `/catalog-images` เท่านั้น (A-B2) */
  image_path: string | null;

  unit_price_ref: number | null;
  price_min: number | null;
  price_max: number | null;
  /** "ผู้ใช้กรอก" / "คลังสินค้า" / คำอธิบายที่มาจาก AI (C-B2) */
  price_basis: string | null;
  price_confidence: number | null;
  price_updated_by: string | null;
  price_updated_at: string | null;
  price_history: PriceHistoryEntry[];

  source: CatalogItemSource;
  /** ความเชื่อมั่นเนื้อหา (AI: `content_confidence`) */
  confidence: number | null;
  ai_note: string | null;
  verified_by: string | null;
  verified_at: string | null;
  /** server-set ตอนเปิดอ่านรายการ (B-B1) */
  viewed_at: string | null;

  enrich_state: CatalogEnrichState;
  enrich_claimed_at: string | null;
  enrich_job_id: string | null;
  enrich_error: string | null;

  product_id: string | null;
  created_at: string;
  updated_at: string;
}

export interface CatalogJob {
  id: string;
  org_id: string;
  catalog_id: string;
  status: CatalogJobStatus;
  total_items: number;
  done_items: number;
  failed_items: number;
  chunk_size: number;
  heartbeat_at: string | null;
  model: string | null;
  input_tokens: number;
  output_tokens: number;
  error_message: string | null;
  triggered_by: string;
  correlation_id: string;
  started_at: string | null;
  finished_at: string | null;
  created_at: string;
  updated_at: string;
}

/** สรุป job ล่าสุดต่อชุด (ใช้ข้อความ "AI เติมให้ n รายการใน 3:12") */
export interface CatalogJobSummary {
  id: string;
  status: CatalogJobStatus;
  total_items: number;
  done_items: number;
  failed_items: number;
  started_at: string | null;
  finished_at: string | null;
  input_tokens: number;
  output_tokens: number;
}

/** สินค้าในคลังของ org (`gov_procure_products`) */
export interface CatalogProduct {
  id: string;
  org_id: string;
  name: string;
  /** GENERATED จาก `gov_procure_normalize_name(name)` — อ่านอย่างเดียว */
  name_key: string;
  brand_model: string | null;
  spec_line: string | null;
  size_line: string | null;
  bullets: string[];
  care_notes: string[];
  caution_notes: string[];
  sub_items: CatalogSubItem[];
  category: string | null;
  default_unit: string | null;
  image_path: string | null;
  last_unit_price: number | null;
  price_updated_at: string | null;
  price_updated_by: string | null;
  times_used: number;
  last_used_at: string | null;
  created_by: string;
  created_at: string;
  updated_at: string;
}

// ---------------------------------------------------------------------------
// Fetch — catalogs
// ---------------------------------------------------------------------------

export interface ListCatalogsOpts extends PageOpts {
  status?: CatalogStatus;
  orderId?: string;
}

/** list ชุดแคตตาล็อกของ org (ใหม่สุดก่อน) — คืน total/truncated เสมอ */
export async function listCatalogs(
  client: SupabaseClient,
  orgId: string,
  opts?: ListCatalogsOpts,
): Promise<Paged<Catalog>> {
  const { limit, offset } = normalizePage(opts);
  let q = client.from("gov_procure_catalogs").select("*", { count: "exact" }).eq("org_id", orgId);

  if (opts?.status) q = q.eq("status", opts.status);
  if (opts?.orderId) q = q.eq("order_id", opts.orderId);

  const { data, error, count } = await q
    .order("created_at", { ascending: false })
    .range(offset, offset + limit - 1);

  if (error) throw new Error(error.message);
  return toPaged((data ?? []) as Catalog[], count, limit, offset);
}

/** ดึงชุดเดียว (กรอง org_id ในคิวรีเดียวกัน) — ไม่พบ = null */
export async function getCatalog(
  client: SupabaseClient,
  orgId: string,
  catalogId: string,
): Promise<Catalog | null> {
  const { data, error } = await client
    .from("gov_procure_catalogs")
    .select("*")
    .eq("org_id", orgId)
    .eq("id", catalogId)
    .maybeSingle();

  if (error) throw new Error(error.message);
  return (data as Catalog | null) ?? null;
}

export interface ListItemsOpts extends PageOpts {
  source?: CatalogItemSource;
  category?: string;
  /** ค้นหาในชื่อสินค้า (ilike) */
  q?: string;
}

/** list รายการในชุด เรียงตาม seq_no — query หลักของหน้าห้องทำงาน */
export async function listItems(
  client: SupabaseClient,
  orgId: string,
  catalogId: string,
  opts?: ListItemsOpts,
): Promise<Paged<CatalogItem>> {
  const { limit, offset } = normalizePage(opts);
  let q = client
    .from("gov_procure_catalog_items")
    .select("*", { count: "exact" })
    .eq("org_id", orgId)
    .eq("catalog_id", catalogId);

  if (opts?.source) q = q.eq("source", opts.source);
  if (opts?.category) q = q.eq("category", opts.category);
  if (opts?.q) q = q.ilike("name", `%${opts.q}%`);

  const { data, error, count } = await q
    .order("seq_no", { ascending: true })
    .range(offset, offset + limit - 1);

  if (error) throw new Error(error.message);
  return toPaged((data ?? []) as CatalogItem[], count, limit, offset);
}

// ---------------------------------------------------------------------------
// KPI / stats (C-B4) — ห้ามเก็บ counter ซ้ำในตาราง (D1) จึงคำนวณตอนอ่าน
//
// PostgREST ไม่รับประกัน aggregate/group-by ข้ามเวอร์ชัน → อ่านเฉพาะคอลัมน์ที่
// ใช้คำนวณ (8 คอลัมน์ เบามาก) แบบไล่หน้าจนครบ แล้วรวมใน JS
// (cap 300 รายการ/ชุด → ระดับสิบชุดยังอยู่ในหลักพันแถว) ·
// ถ้าชนเพดานความปลอดภัย → `truncated=true` ให้ UI เตือน ห้ามเอาไปโชว์เป็นยอดจริง
// ---------------------------------------------------------------------------

const STATS_COLUMNS =
  "catalog_id, source, image_path, confidence, price_confidence, unit_price_ref, qty, viewed_at";
const STATS_PAGE_SIZE = 1000;
/** เพดานกันลูปไม่รู้จบ (30 × 1,000 = 30,000 แถว) */
const STATS_MAX_PAGES = 30;

interface StatsRow {
  catalog_id: string;
  source: CatalogItemSource;
  image_path: string | null;
  confidence: number | null;
  price_confidence: number | null;
  unit_price_ref: number | null;
  qty: number | null;
  viewed_at: string | null;
}

export interface CatalogItemStats {
  total: number;
  verified: number;
  /** นับจาก source='ai_draft' จริง — **ไม่ใช่** total − verified (C-B4) */
  ai_draft: number;
  library: number;
  manual: number;
  no_image: number;
  /** confidence < 0.6 */
  low_conf: number;
  /** price_confidence < 0.6 */
  low_price_conf: number;
  no_price: number;
  /** มูลค่าประมาณการ = sum(qty × unit_price_ref) */
  est_value: number;
  not_viewed: number;
  /** true = อ่านไม่ครบทุกแถว → ห้ามใช้ตัวเลขเป็นยอดจริง */
  truncated: boolean;
}

function emptyStats(): CatalogItemStats {
  return {
    total: 0,
    verified: 0,
    ai_draft: 0,
    library: 0,
    manual: 0,
    no_image: 0,
    low_conf: 0,
    low_price_conf: 0,
    no_price: 0,
    est_value: 0,
    not_viewed: 0,
    truncated: false,
  };
}

function accumulate(s: CatalogItemStats, r: StatsRow): void {
  s.total += 1;
  if (r.source === "human_verified") s.verified += 1;
  else if (r.source === "ai_draft") s.ai_draft += 1;
  else if (r.source === "library") s.library += 1;
  else s.manual += 1;

  if (!r.image_path) s.no_image += 1;
  if (typeof r.confidence === "number" && r.confidence < 0.6) s.low_conf += 1;
  if (typeof r.price_confidence === "number" && r.price_confidence < 0.6) s.low_price_conf += 1;
  if (r.unit_price_ref === null || r.unit_price_ref === undefined) s.no_price += 1;
  if (typeof r.qty === "number" && typeof r.unit_price_ref === "number")
    s.est_value += r.qty * r.unit_price_ref;
  if (!r.viewed_at) s.not_viewed += 1;
}

/** อ่านคอลัมน์ที่ใช้คำนวณ KPI แบบไล่หน้าจนครบ (หรือชนเพดาน) */
async function fetchStatsRows(
  client: SupabaseClient,
  orgId: string,
  catalogId?: string,
): Promise<{ rows: StatsRow[]; truncated: boolean }> {
  const rows: StatsRow[] = [];
  for (let page = 0; page < STATS_MAX_PAGES; page += 1) {
    const from = page * STATS_PAGE_SIZE;
    let q = client.from("gov_procure_catalog_items").select(STATS_COLUMNS).eq("org_id", orgId);
    if (catalogId) q = q.eq("catalog_id", catalogId);

    const { data, error } = await q
      .order("id", { ascending: true })
      .range(from, from + STATS_PAGE_SIZE - 1);

    if (error) throw new Error(error.message);
    const batch = (data ?? []) as unknown as StatsRow[];
    rows.push(...batch);
    if (batch.length < STATS_PAGE_SIZE) return { rows, truncated: false };
  }
  return { rows, truncated: true };
}

/**
 * KPI ของรายการ — ต่อชุด (ระบุ `catalogId`) หรือทั้ง org (ไม่ระบุ).
 * ลายเซ็นตาม A-5: **รับ client เข้ามา** (หน้า = rls · route = admin หลัง guard)
 */
export async function getCatalogItemStats(
  client: SupabaseClient,
  orgId: string,
  catalogId?: string,
): Promise<CatalogItemStats> {
  const { rows, truncated } = await fetchStatsRows(client, orgId, catalogId);
  const stats = emptyStats();
  for (const r of rows) accumulate(stats, r);
  stats.truncated = truncated;
  return stats;
}

export interface CatalogListStats {
  /** KPI แยกต่อชุด (key = catalog_id) */
  byCatalog: Record<string, CatalogItemStats>;
  /** KPI รวมทั้ง org */
  totals: CatalogItemStats;
  /** จำนวนสินค้าในคลังของ org */
  product_count: number;
  /** job ล่าสุดต่อชุด (key = catalog_id) */
  latestJobs: Record<string, CatalogJobSummary>;
  truncated: boolean;
}

const JOB_SUMMARY_COLUMNS =
  "id, catalog_id, status, total_items, done_items, failed_items, started_at, finished_at, input_tokens, output_tokens, created_at";

/**
 * KPI ของหน้า list (C-B4) — รวม stats รายชุด + คลังสินค้า + job ล่าสุดต่อชุด.
 * ลายเซ็นตาม A-5 เช่นกัน.
 */
export async function getCatalogListStats(
  client: SupabaseClient,
  orgId: string,
): Promise<CatalogListStats> {
  const { rows, truncated } = await fetchStatsRows(client, orgId);

  const byCatalog: Record<string, CatalogItemStats> = {};
  const totals = emptyStats();
  for (const r of rows) {
    let bucket = byCatalog[r.catalog_id];
    if (!bucket) {
      bucket = emptyStats();
      byCatalog[r.catalog_id] = bucket;
    }
    accumulate(bucket, r);
    accumulate(totals, r);
  }
  totals.truncated = truncated;
  for (const key of Object.keys(byCatalog)) byCatalog[key].truncated = truncated;

  const [{ count: productCount, error: productError }, jobsResult] = await Promise.all([
    client
      .from("gov_procure_products")
      .select("id", { count: "exact", head: true })
      .eq("org_id", orgId),
    client
      .from("gov_procure_catalog_jobs")
      .select(JOB_SUMMARY_COLUMNS)
      .eq("org_id", orgId)
      .order("created_at", { ascending: false })
      .limit(500),
  ]);

  if (productError) throw new Error(productError.message);
  if (jobsResult.error) throw new Error(jobsResult.error.message);

  const latestJobs: Record<string, CatalogJobSummary> = {};
  for (const raw of (jobsResult.data ?? []) as unknown as (CatalogJobSummary & {
    catalog_id: string;
  })[]) {
    // เรียงใหม่สุดก่อนแล้ว → ตัวแรกของแต่ละชุด = ล่าสุด
    if (latestJobs[raw.catalog_id]) continue;
    latestJobs[raw.catalog_id] = {
      id: raw.id,
      status: raw.status,
      total_items: raw.total_items,
      done_items: raw.done_items,
      failed_items: raw.failed_items,
      started_at: raw.started_at,
      finished_at: raw.finished_at,
      input_tokens: raw.input_tokens,
      output_tokens: raw.output_tokens,
    };
  }

  return {
    byCatalog,
    totals,
    product_count: productCount ?? 0,
    latestJobs,
    truncated,
  };
}

/** job ล่าสุดของชุด (poll progress + self-heal heartbeat) */
export async function getLatestCatalogJob(
  client: SupabaseClient,
  orgId: string,
  catalogId: string,
): Promise<CatalogJob | null> {
  const { data, error } = await client
    .from("gov_procure_catalog_jobs")
    .select("*")
    .eq("org_id", orgId)
    .eq("catalog_id", catalogId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) throw new Error(error.message);
  return (data as CatalogJob | null) ?? null;
}
