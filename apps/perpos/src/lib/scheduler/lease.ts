import type { SupabaseClient } from "@supabase/supabase-js";

/** ชื่อ lease ของรอบ scheduler — ตัวเดียวทั้งระบบ (worker + HTTP ใช้ร่วมกัน) */
export const SCHEDULER_LEASE_NAME = "scheduler:tick";
/**
 * อายุ lease ถ้าเจ้าของตายกลางคัน (SIGKILL/OOM) — ต้องยาวกว่ารอบที่ยาวที่สุดที่เป็นไปได้
 * (cost sync t1440 ยิง BigQuery ได้หลายนาที) แต่ไม่ยาวจน worker ที่ restart ต้องรอนาน
 */
export const SCHEDULER_LEASE_TTL_S = 20 * 60;

/**
 * ขอ lease แบบ atomic ผ่าน RPC (`scheduler_acquire_lease`) — คืน true = ได้สิทธิ์รันรอบนี้
 * · เจ้าของเดิมขอซ้ำ = ต่ออายุ (renew) · lease ที่หมดอายุแล้วใครก็แย่งได้
 * · RPC พัง/ยังไม่ migrate → **ยอมให้รัน** (fail-open) เพราะงานทุกตัว idempotent อยู่แล้ว
 *   และการหยุด scheduler ทั้งระบบเพราะตาราง lease หายแพงกว่าการรันซ้อนนาน ๆ ครั้ง
 */
export async function acquireSchedulerLease(
  admin: SupabaseClient,
  owner: string,
): Promise<boolean> {
  const { data, error } = await admin.rpc("scheduler_acquire_lease", {
    p_name: SCHEDULER_LEASE_NAME,
    p_owner: owner,
    p_ttl_seconds: SCHEDULER_LEASE_TTL_S,
  });
  if (error) {
    console.error("[scheduler] lease rpc failed (fail-open):", error.message);
    return true;
  }
  return data === true;
}

/** ปล่อย lease ทันทีเมื่อจบรอบ (เฉพาะเจ้าของ) — ปล่อยไม่สำเร็จก็แค่รอหมดอายุ */
export async function releaseSchedulerLease(admin: SupabaseClient, owner: string): Promise<void> {
  await admin.rpc("scheduler_release_lease", { p_name: SCHEDULER_LEASE_NAME, p_owner: owner }).then(
    () => undefined,
    () => undefined,
  );
}
