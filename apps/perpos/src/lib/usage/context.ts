/**
 * Usage context — บริบท "ต้นทุนนี้เป็นของใคร" แบบ ambient ต่อ request
 *
 * ปัญหา: จุดที่ก่อต้นทุน (aiChat, sendLineMessages) อยู่ลึกกว่าจุดที่รู้ org หลายชั้น
 * ถ้าจะส่ง orgId ลงไปต้องแก้ signature ทุกฟังก์ชันกลางทาง — เปราะและลืมง่าย
 *
 * ทางแก้: ห่อ handler ด้วย `withUsageContext({ orgId, profileId, feature }, fn)` ครั้งเดียว
 * แล้ว `recordUsage()` ที่อยู่ลึกแค่ไหนก็หยิบบริบทเองได้ผ่าน AsyncLocalStorage
 *
 * ลำดับความสำคัญ: ค่าที่ caller ส่งมาตรง ๆ > ค่าจาก ambient context > null
 * (null = ไปกอง "ไม่ระบุองค์กร" ในรายงาน — ไม่หาย แต่แยก org ไม่ได้)
 */

import { AsyncLocalStorage } from "node:async_hooks";

export type AmbientUsage = {
  orgId?: string | null;
  profileId?: string | null;
  /** ชื่อฟีเจอร์ default ของ request นี้ เช่น 'bi.ask' */
  feature?: string;
};

const storage = new AsyncLocalStorage<AmbientUsage>();

/** รัน fn โดยผูกบริบทต้นทุนไว้ตลอด async chain */
export function withUsageContext<T>(ctx: AmbientUsage, fn: () => Promise<T>): Promise<T> {
  return storage.run(ctx, fn);
}

export function currentUsageContext(): AmbientUsage | undefined {
  return storage.getStore();
}

/** เติม org/profile จาก ambient ให้บริบทที่ caller ส่งมาไม่ครบ */
export function mergeUsageContext<T extends AmbientUsage>(explicit: T): T {
  const ambient = storage.getStore();
  if (!ambient) return explicit;
  return {
    ...explicit,
    orgId: explicit.orgId ?? ambient.orgId ?? null,
    profileId: explicit.profileId ?? ambient.profileId ?? null,
    feature: explicit.feature ?? ambient.feature,
  };
}
