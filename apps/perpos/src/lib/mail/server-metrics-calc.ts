/**
 * ชนิดข้อมูล + สูตรคำนวณของ "การใช้ทรัพยากรเมลเซิร์ฟเวอร์" — **ไม่มี server-only**
 *
 * 🪤 แยกไฟล์เพราะแท็บ "เครื่องเซิร์ฟเวอร์" เป็น client component และต้องใช้สูตรพวกนี้
 *    ถ้าเอาไปไว้รวมกับ [server-metrics.ts](./server-metrics.ts) (ซึ่ง `import "server-only"`)
 *    หน้าจะพังตอน build/dev ทันที — tsc จับไม่ได้ เจอตอนเปิดหน้าเท่านั้น
 * ⇒ ที่นี่ห้ามมี Supabase / secret / node API เด็ดขาด · ต่อ DB อยู่ที่ server-metrics.ts
 */

/** ค่าที่เครื่องรายงานมา 1 จุดเวลา — ทุกช่องเป็น null ได้ (สคริปต์รุ่นเก่า/คำสั่งไม่มีบนเครื่อง) */
/** ตอนนี้มีเครื่องเมลเครื่องเดียว — ค่านี้เป็นคีย์ของทั้ง `mail_server_health` และ `_samples` */
export const MAIL_HOST_ID = "stalwart";

export interface MailServerSample {
  takenAt: string;
  diskPct: number | null;
  diskUsedBytes: number | null;
  diskTotalBytes: number | null;
  memUsedMb: number | null;
  memTotalMb: number | null;
  load1: number | null;
  cpuCount: number | null;
  storeBytes: number | null;
  backupAgeHours: number | null;
  backupSizeMb: number | null;
  serviceActive: boolean | null;
  smtp25Listening: boolean | null;
  uptimeSeconds: number | null;
  netRxBytes: number | null;
  netTxBytes: number | null;
}

const num = (v: unknown): number | null => (typeof v === "number" && Number.isFinite(v) ? v : null);
const int = (v: unknown): number | null => {
  const n = num(v);
  return n === null ? null : Math.round(n);
};
const bool = (v: unknown): boolean | null => (typeof v === "boolean" ? v : null);

/** payload จากเครื่อง = ข้อมูลภายนอก ตรวจทีละช่องเสมอ (คู่กับ `normalizeHeartbeat`) */
export function sampleRowFromPayload(raw: unknown, takenAt: string): Record<string, unknown> {
  const r = (raw ?? {}) as Record<string, unknown>;
  return {
    host: MAIL_HOST_ID,
    taken_at: takenAt,
    disk_pct: num(r.diskPct),
    disk_used_bytes: int(r.diskUsedBytes),
    disk_total_bytes: int(r.diskTotalBytes),
    mem_used_mb: int(r.memUsedMb),
    mem_total_mb: int(r.memTotalMb),
    load1: num(r.load1),
    cpu_count: int(r.cpuCount),
    store_bytes: int(r.storeBytes),
    backup_age_hours: num(r.backupAgeHours),
    backup_size_mb: num(r.backupSizeMb),
    service_active: bool(r.serviceActive),
    smtp25_listening: bool(r.smtp25Listening),
    uptime_seconds: int(r.uptimeSeconds),
    net_rx_bytes: int(r.netRxBytes),
    net_tx_bytes: int(r.netTxBytes),
  };
}

export function toSample(row: Record<string, unknown>): MailServerSample {
  return {
    takenAt: String(row.taken_at ?? ""),
    diskPct: num(row.disk_pct),
    diskUsedBytes: num(row.disk_used_bytes),
    diskTotalBytes: num(row.disk_total_bytes),
    memUsedMb: num(row.mem_used_mb),
    memTotalMb: num(row.mem_total_mb),
    load1: num(row.load1),
    cpuCount: num(row.cpu_count),
    storeBytes: num(row.store_bytes),
    backupAgeHours: num(row.backup_age_hours),
    backupSizeMb: num(row.backup_size_mb),
    serviceActive: bool(row.service_active),
    smtp25Listening: bool(row.smtp25_listening),
    uptimeSeconds: num(row.uptime_seconds),
    netRxBytes: num(row.net_rx_bytes),
    netTxBytes: num(row.net_tx_bytes),
  };
}

/**
 * ทราฟฟิกในช่วงที่ดู — คิดจาก **ผลต่างของตัวนับสะสม** ใน /proc/net/dev
 * ตัวนับรีเซ็ตเมื่อเครื่องรีบูต ⇒ ช่วงที่ค่าลดลงให้ข้าม (ไม่ใช่ติดลบ) ไม่งั้นกราฟเพี้ยน
 */
export function trafficDelta(samples: MailServerSample[]): { rx: number; tx: number } | null {
  let rx = 0;
  let tx = 0;
  let seen = false;
  for (let i = 1; i < samples.length; i += 1) {
    const a = samples[i - 1];
    const b = samples[i];
    if (a.netRxBytes !== null && b.netRxBytes !== null && b.netRxBytes >= a.netRxBytes) {
      rx += b.netRxBytes - a.netRxBytes;
      seen = true;
    }
    if (a.netTxBytes !== null && b.netTxBytes !== null && b.netTxBytes >= a.netTxBytes) {
      tx += b.netTxBytes - a.netTxBytes;
      seen = true;
    }
  }
  return seen ? { rx, tx } : null;
}

/** ดิสก์โตวันละกี่ไบต์ (least-squares จากจุดที่มีจริง) — ใช้ประเมิน "อีกกี่วันเต็ม" */
export function diskGrowthPerDay(samples: MailServerSample[]): number | null {
  const pts = samples
    .filter((s) => s.diskUsedBytes !== null && s.takenAt)
    .map((s) => ({ t: new Date(s.takenAt).getTime() / 86_400_000, y: s.diskUsedBytes as number }))
    .filter((p) => Number.isFinite(p.t));
  if (pts.length < 3) return null;
  const n = pts.length;
  const meanT = pts.reduce((a, p) => a + p.t, 0) / n;
  const meanY = pts.reduce((a, p) => a + p.y, 0) / n;
  let cov = 0;
  let varT = 0;
  for (const p of pts) {
    cov += (p.t - meanT) * (p.y - meanY);
    varT += (p.t - meanT) ** 2;
  }
  if (varT === 0) return null;
  return cov / varT;
}

/** อีกกี่วันดิสก์เต็มตามอัตราปัจจุบัน — null = ยังบอกไม่ได้/ไม่โต */
export function daysUntilDiskFull(
  latest: MailServerSample | null,
  perDay: number | null,
): number | null {
  if (!latest || perDay === null || perDay <= 0) return null;
  if (latest.diskUsedBytes === null || latest.diskTotalBytes === null) return null;
  const free = latest.diskTotalBytes - latest.diskUsedBytes;
  if (free <= 0) return 0;
  return Math.floor(free / perDay);
}
