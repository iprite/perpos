/**
 * การใช้ทรัพยากรของเมลเซิร์ฟเวอร์ (Stalwart @ Contabo) — เก็บประวัติ + อ่านให้หน้า /admin/mail
 *
 * 🪤 **Contabo API ดู usage ไม่ได้** — REST API ของ Contabo มีแค่ metadata ของ instance
 *    (`cpuCores`/`ramMb`/`diskMb` = สเปกที่ซื้อ ไม่ใช่ที่ใช้จริง) + audit log · ไม่มี endpoint
 *    CPU/RAM/ดิสก์/ทราฟฟิก ⇒ **ตัวเลขทั้งหมดในไฟล์นี้มาจากตัวเครื่องเอง** ผ่าน heartbeat
 *    (`scripts/mail-heartbeat.sh` → `POST /api/admin/mail-server/heartbeat`) อย่าไปหาใน Contabo API
 *
 * แบ่งหน้าที่กับ [server-monitor.ts](./server-monitor.ts) ให้ชัด:
 *   - server-monitor = **เตือน** (ค่าล่าสุดแถวเดียวใน `mail_server_health` + LINE)
 *   - ไฟล์นี้ = **แนวโน้ม** (ประวัติใน `mail_server_samples` ไว้ดูก่อนดิสก์เต็ม)
 *   ⇒ `MailHeartbeat` ของอีกไฟล์คือ subset ที่ใช้ตัดสินใจเตือน — **ห้ามเอาสองอันมารวมกัน**
 *     (เพิ่มฟิลด์ใหม่ที่นี่ได้เรื่อย ๆ โดยไม่กระทบเกณฑ์เตือนที่มีเทสคุมอยู่)
 *
 * ตาราง `mail_server_samples` RLS deny-all → ทุก path ในไฟล์นี้ใช้ service role เท่านั้น
 */

import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { MAIL_HOST_ID, toSample, type MailServerSample } from "./server-metrics-calc";
import type { MailServerMetrics } from "./server-metrics-types";

export type { MailServerMetrics } from "./server-metrics-types";

export type { MailServerSample } from "./server-metrics-calc";
export {
  daysUntilDiskFull,
  diskGrowthPerDay,
  sampleRowFromPayload,
  trafficDelta,
} from "./server-metrics-calc";

/** เก็บประวัติ 30 วัน — 5 นาที/ครั้ง ≈ 8,600 แถว (scheduler t60 ลบส่วนเกิน) */
export const SAMPLE_RETENTION_DAYS = 30;

/**
 * อ่านประวัติ + สถานะล่าสุด (service role)
 * ⚠️ อย่าลืม `.limit()` — PostgREST ตัด 1,000 แถวเงียบ ๆ · 30 วัน @5 นาที = ~8,600 แถว
 *    จึงดึงตามช่วงเวลาที่ขอ แล้วเว้นระยะฝั่ง JS ให้เหลือจำนวนจุดที่กราฟใช้จริง
 */
export async function fetchMailServerMetrics(
  admin: SupabaseClient,
  opts: { hours?: number; maxPoints?: number } = {},
): Promise<MailServerMetrics> {
  const hours = opts.hours ?? 24 * 7;
  const maxPoints = opts.maxPoints ?? 240;
  const since = new Date(Date.now() - hours * 3_600_000).toISOString();

  const [{ data: rows }, { data: health }] = await Promise.all([
    admin
      .from("mail_server_samples")
      .select("*")
      .eq("host", MAIL_HOST_ID)
      .gte("taken_at", since)
      .order("taken_at", { ascending: false })
      .limit(10_000),
    admin
      .from("mail_server_health")
      .select("last_check_at, last_issues, heartbeat_at")
      .eq("id", MAIL_HOST_ID)
      .maybeSingle(),
  ]);

  const all = ((rows ?? []) as Record<string, unknown>[]).map(toSample).reverse(); // เก่า→ใหม่
  const step = Math.max(1, Math.ceil(all.length / maxPoints));
  const series = all.filter((_, i) => i % step === 0 || i === all.length - 1);

  const issues: Record<string, string> = {};
  for (const [k, v] of Object.entries((health?.last_issues as Record<string, unknown>) ?? {})) {
    if (typeof v === "string") issues[k] = v;
  }

  return {
    latest: all.length ? all[all.length - 1] : null,
    series,
    lastCheckAt: (health?.last_check_at as string | null) ?? null,
    issues,
    heartbeatAt: (health?.heartbeat_at as string | null) ?? null,
  };
}

/** ลบตัวอย่างที่เก่ากว่า retention — เรียกจาก scheduler t60 (best-effort) */
export async function pruneMailServerSamples(admin: SupabaseClient): Promise<void> {
  const cutoff = new Date(Date.now() - SAMPLE_RETENTION_DAYS * 86_400_000).toISOString();
  await admin.from("mail_server_samples").delete().lt("taken_at", cutoff);
}
