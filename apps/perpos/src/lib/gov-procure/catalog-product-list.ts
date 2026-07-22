// catalog-product-list.ts — fetch logic ของ "คลังสินค้า" (list + KPI) สำหรับหน้า SSR
//
// แยกไฟล์ใหม่ (ไม่แตะ `catalog-products.ts` ที่ route ใช้อยู่ — ADDITIVE)
// กฎเดียวกับ `catalog.ts`: **รับ `client` เข้ามาเสมอ** (หน้า SSR ส่ง rls client · route ส่ง admin หลัง guard)
// + กรอง `org_id` ทุกคิวรี + ใช้ `normalizePage`/`toPaged` (PostgREST ตัด 1,000 แถวเงียบ ๆ)

import type { SupabaseClient } from "@supabase/supabase-js";
import { normalizePage, toPaged, type PageOpts, type Paged } from "@/lib/accounting/paging";
import type { CatalogProduct } from "@/lib/gov-procure/catalog";

export interface ListProductsOpts extends PageOpts {
  /** ค้นหาในชื่อสินค้า (ilike) */
  q?: string;
  category?: string;
}

/** สินค้าในคลังของ org เรียงตามชื่อ */
export async function listProducts(
  client: SupabaseClient,
  orgId: string,
  opts?: ListProductsOpts,
): Promise<Paged<CatalogProduct>> {
  const { limit, offset } = normalizePage(opts);
  let q = client.from("gov_procure_products").select("*", { count: "exact" }).eq("org_id", orgId);

  if (opts?.q) q = q.ilike("name", `%${opts.q}%`);
  if (opts?.category) q = q.eq("category", opts.category);

  const { data, error, count } = await q
    .order("name", { ascending: true })
    .range(offset, offset + limit - 1);

  if (error) throw new Error(error.message);
  return toPaged((data ?? []) as CatalogProduct[], count, limit, offset);
}

export interface ProductLibraryStats {
  total: number;
  /** จำนวนครั้งที่ถูกดึงไปใช้ซ้ำรวมทุกสินค้า */
  times_used: number;
  /** ราคาที่อัปเดตล่าสุดเกิน 6 เดือน (ควรทบทวน) */
  stale_price: number;
  no_price: number;
  no_image: number;
}

/** ราคาที่เก่ากว่านี้ = ควรทบทวน (6 เดือน) */
export const STALE_PRICE_DAYS = 180;

export function computeProductStats(products: CatalogProduct[]): ProductLibraryStats {
  const cutoff = Date.now() - STALE_PRICE_DAYS * 24 * 60 * 60 * 1000;
  const stats: ProductLibraryStats = {
    total: 0,
    times_used: 0,
    stale_price: 0,
    no_price: 0,
    no_image: 0,
  };

  for (const p of products) {
    stats.total += 1;
    stats.times_used += Number(p.times_used ?? 0);
    if (p.last_unit_price === null) stats.no_price += 1;
    else if (p.price_updated_at && new Date(p.price_updated_at).getTime() < cutoff)
      stats.stale_price += 1;
    if (!p.image_path) stats.no_image += 1;
  }

  return stats;
}

/** ราคานี้เก่าเกิน 6 เดือนไหม (chip "ควรทบทวนราคา") */
export function isStalePrice(product: CatalogProduct): boolean {
  if (!product.price_updated_at) return false;
  return (
    new Date(product.price_updated_at).getTime() <
    Date.now() - STALE_PRICE_DAYS * 24 * 60 * 60 * 1000
  );
}
