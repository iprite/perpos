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

export function toPaged<T>(
  rows: T[],
  count: number | null,
  limit: number,
  offset: number,
): Paged<T> {
  const total = typeof count === "number" ? count : rows.length;
  return { rows, total, limit, offset, truncated: offset + rows.length < total };
}
