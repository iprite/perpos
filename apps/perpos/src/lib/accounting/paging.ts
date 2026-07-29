/**
 * paging.ts — กันข้อมูลหายเงียบจาก PostgREST max-rows (Phase 1.7)
 *
 * ปัญหา: Supabase/PostgREST คืนสูงสุด 1,000 แถวต่อ query โดย **ไม่บอกว่าตัด**
 * → org ที่มีเอกสาร/รายการเกิน 1,000 จะเห็นข้อมูลไม่ครบ และที่แย่กว่าคือ
 *   ยอดรวม/KPI ที่คำนวณฝั่ง client จาก array นั้นจะ "ต่ำกว่าจริง" แบบไม่มีใครรู้
 *
 * วิธีแก้ที่นี่: บังคับใช้ range ที่ชัดเจน + ขอ exact count กลับมาด้วย
 * caller จะรู้เสมอว่า "ได้มากี่แถว จากทั้งหมดกี่แถว" → เตือนผู้ใช้ได้
 */

/** ค่าเริ่มต้นของหน้าต่างข้อมูล — ต่ำกว่า cap ของ PostgREST เพื่อให้ count บอกความจริงเสมอ */
export const DEFAULT_PAGE_SIZE = 500;
export const MAX_PAGE_SIZE = 1000;

export interface PageOpts {
  limit?: number;
  offset?: number;
}

export interface Paged<T> {
  rows: T[];
  /** จำนวนแถวทั้งหมดที่ตรงเงื่อนไข (ไม่ใช่แค่ที่คืนมา) */
  total: number;
  limit: number;
  offset: number;
  /** true = ยังมีข้อมูลเหลือที่ยังไม่ได้โหลด → UI ต้องเตือน ห้ามคิดยอดรวมจากชุดนี้ */
  truncated: boolean;
}

export function normalizePage(opts?: PageOpts): { limit: number; offset: number } {
  const rawLimit = Number(opts?.limit);
  const rawOffset = Number(opts?.offset);
  const limit =
    Number.isFinite(rawLimit) && rawLimit > 0
      ? Math.min(Math.floor(rawLimit), MAX_PAGE_SIZE)
      : DEFAULT_PAGE_SIZE;
  const offset = Number.isFinite(rawOffset) && rawOffset > 0 ? Math.floor(rawOffset) : 0;
  return { limit, offset };
}

/**
 * ดึง "ทุกแถว" ที่ตรงเงื่อนไข โดยไล่ range ทีละก้อน — ใช้กับ **query ที่เอาไปคิดยอดรวม**
 * (KPI/แดชบอร์ด/รายงาน) ซึ่งขาดแถวไปแม้แถวเดียวก็ทำให้ตัวเลขผิดโดยไม่มีใครรู้
 *
 * ห้ามใช้กับ list ที่ผู้ใช้เปิดดูเฉย ๆ — พวกนั้นใช้ normalizePage/toPaged + แถบแบ่งหน้า
 *
 *   const { rows, truncated } = await fetchAllRows((from, to) =>
 *     admin.from("acc_journal_lines").select("...").in("org_id", ids).range(from, to),
 *   );
 *
 * `truncated = true` เมื่อชนเพดานกันวิ่งไม่รู้จบ (`maxRows`) → caller ต้องบอกผู้ใช้ว่า
 * ตัวเลขยังไม่ครบ ห้ามกลืนเงียบ
 */
/**
 * ผลลัพธ์ของ query หนึ่งก้อน — PostgREST builder ที่มี embed จะถูก infer เป็น array
 * ซ้อน array เสมอ ผู้เรียกจึง cast เป็นชนิดนี้ที่จุดเรียก (`as unknown as RowsPage<T>`)
 */
export type RowsPage<T> = PromiseLike<{ data: T[] | null; error: { message: string } | null }>;

export async function fetchAllRows<T>(
  page: (from: number, to: number) => RowsPage<T>,
  opts?: { chunkSize?: number; maxRows?: number },
): Promise<{ rows: T[]; truncated: boolean }> {
  const chunkSize = Math.min(opts?.chunkSize ?? MAX_PAGE_SIZE, MAX_PAGE_SIZE);
  const maxRows = opts?.maxRows ?? 100_000;
  const rows: T[] = [];

  for (let from = 0; from < maxRows; from += chunkSize) {
    const to = Math.min(from + chunkSize, maxRows) - 1;
    const { data, error } = await page(from, to);
    if (error) throw new Error(error.message);
    const batch = data ?? [];
    rows.push(...batch);
    if (batch.length < to - from + 1) return { rows, truncated: false };
  }
  return { rows, truncated: true };
}

export function toPaged<T>(
  rows: T[],
  count: number | null,
  limit: number,
  offset: number,
): Paged<T> {
  const total = typeof count === "number" ? count : rows.length;
  return { rows, total, limit, offset, truncated: offset + rows.length < total };
}
