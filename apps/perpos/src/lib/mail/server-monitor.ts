/**
 * เฝ้าระวังเซิร์ฟเวอร์ VPS SG (Stalwart + Docker เว็บ 3 แอป) + แจ้งเตือน LINE — รันจาก scheduler
 *
 * ตั้งแต่ 2026-08-19 เมลกับเว็บ (perpos/exapp/riekchang/caddy) อยู่เครื่องเดียวกัน ⇒ heartbeat ก้อนเดียว
 * รายงานทั้งทรัพยากรเครื่อง + สถานะ container + release ที่แต่ละแอปชี้ (ดู `evaluateHostIssues`)
 * ⚠️ scheduler ที่รันตัวเฝ้านี้ = container perpos บนเครื่องเดียวกัน — ถ้าเครื่อง/perpos ล่มทั้งตัว
 *    ตัวนี้เงียบ · ด่านนอกจริง = GitHub Actions `uptime.yml` (ยิง LINE ตรง ไม่ผ่านแอป)
 *
 * สองแหล่งข้อมูล: (1) ตัวตรวจสด (scheduler t5 ทุก 5 นาที) ต่อ 465/443/ใบรับรองของเมล + TLS ที่ Caddy origin
 *   ของโดเมนเว็บ (2) heartbeat ทุก 5 นาทีจากเครื่อง (ดิสก์/backup/พอร์ต 25/container/release/cron)
 *   ที่ยิงเข้า `/api/admin/mail-server/heartbeat` — heartbeat ขาด >30 นาที = เรื่องต้องเตือนเช่นกัน
 *   (คอมเมนต์ "Vercel" ด้านล่างเป็นประวัติ — ตั้งแต่ 2026-08-19 scheduler รันใน container perpos บน VPS)
 *
 * 🪤 **ห้ามเช็คพอร์ต 25 จาก Vercel** — Vercel บล็อก TCP ขาออกพอร์ต 25 (มาตรการกันสแปม)
 *   ⇒ ต่อไม่ติดเสมอแม้เครื่องเมลปกติดี = เตือนผิดทุก 6 ชม.ตลอดไป (เคยเป็นมาแล้ว 2026-08-18)
 *   ด่านนอกจึงเช็ค **465 (SMTPS)** แทน — Stalwart ตัวเดียวกันตอบ banner 220 เหมือนกัน
 *   ส่วน "พอร์ต 25 ยังฟังอยู่ไหม" ให้ heartbeat บนเครื่องรายงานมา (`smtp25Listening`)
 *   ⚠️ อย่าสับสนกับคอมเมนต์ใน `dns-records.ts` — อันนั้นคือ **Hetzner บล็อกขาออก 25** คนละเรื่องกัน
 *
 * การเตือน: แจ้งเฉพาะ "ขอบเหตุการณ์" (ดี→พัง / พัง→หาย) + เตือนซ้ำทุก 6 ชม. ถ้ายังพังอยู่
 * — ห้าม spam ทุก 5 นาที · สถานะเก็บใน `mail_server_health` (แถวเดียว, RLS deny-all)
 */

import tls from "node:tls";
import type { SupabaseClient } from "@supabase/supabase-js";
import { alertAdminLine } from "@/lib/admin/alert";
import { MAIL_SERVER_HOST } from "./dns-records";

/** ชื่อเครื่องเมลมาจากแหล่งเดียวกับที่หน้าตั้ง DNS ใช้ — แก้ที่ dns-records.ts ที่เดียว */
const HOST = MAIL_SERVER_HOST;
const ROW_ID = "stalwart";
/** SMTPS — ด่านนอกใช้พอร์ตนี้แทน 25 เพราะ Vercel บล็อก 25 ขาออก (ดูหัวไฟล์) */
const SMTP_PORT = 465;
const REALERT_MS = 6 * 60 * 60 * 1000;
/**
 * heartbeat มาทุก 5 นาที (systemd timer) — ให้อภัย ~6 รอบ (รีบูตเครื่อง/deploy perpos) ก่อนถือว่าขาด
 * เดิม 3 ชม. สมัยยิงรายชั่วโมง — ตอนนี้ heartbeat แบก container/cron ด้วย ปล่อยมืด 3 ชม.นานไป
 */
const HEARTBEAT_STALE_MS = 30 * 60 * 1000;
const CERT_WARN_DAYS = 14;
const DISK_WARN_PCT = 85;
const BACKUP_STALE_HOURS = 30;

/** container ที่ต้อง "running" เสมอบนเครื่อง SG — หายไปจากรายการ = เตือนเหมือน state ผิด */
export const EXPECTED_CONTAINERS = [
  "caddy",
  "perpos", // perpos/exapp/riekchang = สีที่รันอยู่ของ <app>-blue/<app>-green (ยุบด้วย collapseBlueGreen ก่อนตัดสิน)
  "perpos-worker",
  "exapp",
  "riekchang",
] as const;
/** RAM ของ container ≥ สัดส่วนนี้ของ mem_limit = ใกล้โดน OOM-kill (compose ตั้ง limit ต่อแอป) */
const CONTAINER_MEM_WARN_RATIO = 0.9;
/** deploy สลับ symlink แล้ว container ยังไม่ restart เกินเท่านี้ = release ค้าง (ให้เวลา CI restart) */
const DEPLOY_STALE_MS = 10 * 60 * 1000;
/** RAM ทั้งเครื่องใช้ไป ≥ สัดส่วนนี้ = ใกล้ OOM ระดับ host (kernel จะฆ่า process ใหญ่สุด — มักเป็น Next/Stalwart) */
const HOST_MEM_WARN_RATIO = 0.92;
/** load1 ≥ CPU × เท่านี้ = เครื่องอืด (งานค้างคิวเกินแกนประมวลผล 3 เท่า) */
const LOAD_WARN_PER_CPU = 3;
/** uptime ต่ำกว่านี้ = เครื่องเพิ่งรีบูต (แจ้งครั้งเดียว ไม่มีสถานะ "หาย" — คีย์ `reboot` ถูก diffAlerts ข้ามตอน recover) */
const REBOOT_RECENT_S = 10 * 60;
/** scheduler (worker `perpos-worker`) ไม่เขียน `scheduler_runs` นานเกินนี้ = worker ตาย/ค้าง (ตรวจจาก heartbeat route ซึ่งรันใน container perpos ไม่ใช่ worker) */
export const SCHEDULER_STALE_MS = 10 * 60 * 1000;
export const SCHEDULER_STALE_KEY = "scheduler:stale";
/** Cloud Run workers ที่ต้องตอบ /health (ชื่อ env ที่เก็บ URL · ไม่ตั้ง env = ไม่ตรวจ) */
export const EXPECTED_WORKERS = [
  { key: "pdf-renderer", urlEnv: "PDF_RENDER_URL" },
  { key: "ocr-worker", urlEnv: "OCR_WORKER_URL" },
  { key: "stt-worker", urlEnv: "STT_WORKER_URL" },
  { key: "pdf-compress-worker", urlEnv: "PDF_COMPRESS_WORKER_URL" },
] as const;

/** สถานะ Docker container 1 ตัวจาก heartbeat (มาจาก `docker inspect` + `docker stats`) */
export interface HostContainer {
  name: string;
  state: string | null;
  /** RestartCount ของ Docker = restart โดย policy (crash) เท่านั้น · `docker compose up -d` สร้างใหม่ = 0 */
  restarts: number | null;
  /** เพิ่มขึ้นจาก heartbeat ก่อนหน้าเท่าไร (คำนวณตอนรับ) · 0 = ไม่มี crash รอบนี้ */
  restartDelta: number;
  oomKilled: boolean | null;
  exitCode: number | null;
  startedAt: string | null;
  memUsedBytes: number | null;
  /** 0/ไม่มี limit = null */
  memLimitBytes: number | null;
}

/** release ที่ /srv/apps/<app>/current ชี้อยู่ */
export interface HostApp {
  app: string;
  release: string | null;
  /** โฟลเดอร์ปลายทาง symlink ยังอยู่ไหม (false = symlink ขาด — container จะขึ้นไม่ได้หลัง restart) */
  exists: boolean | null;
  /** epoch วินาที ที่ symlink `current` ถูกสลับล่าสุด (= เวลา deploy) */
  currentChangedAt: number | null;
  sha: string | null;
}

/** งาน cron ที่ journal เห็นว่าถูก "สั่งรัน" (CMD) ล่าสุด — ไม่รู้ผลของ curl · perpos ยืนยันซ้ำด้วย scheduler_runs */
export interface CronJobSeen {
  url: string;
  /** epoch วินาที */
  lastRunAt: number;
}

/**
 * งาน cron ที่ต้องมีบนเครื่อง (จับคู่ด้วย substring ของ URL) + อายุสูงสุดที่ยอมรับได้
 * ⚠️ cron ของ Ubuntu (3.0pl1) **ไม่สน `TZ=` ในไฟล์ crontab** ตอนคำนวณเวลา (แค่ export ให้ job)
 *    — เครื่องต้องตั้ง timezone Asia/Bangkok เอง (ตั้งแล้ว 2026-08-19 · เดิม Berlin ทำให้งานรายวันช้า 5 ชม.)
 */
export const EXPECTED_CRON = [
  // perpos scheduler ไม่ใช่ cron แล้ว (2026-08-19) — เป็น container `perpos-worker` (ดู EXPECTED_CONTAINERS + SCHEDULER_STALE_KEY)
  { key: "exapp-daily", match: "3006/api/admin/rep-usage/recalc", maxAgeMin: 26 * 60 },
  { key: "tmc-daily-occupancy", match: "3005/api/tmc/notify/daily-occupancy", maxAgeMin: 26 * 60 },
  { key: "gov-procure-aging", match: "3005/api/gov-procure/notify/aging", maxAgeMin: 26 * 60 },
  {
    key: "gov-procure-weekly",
    match: "3005/api/gov-procure/notify/weekly",
    maxAgeMin: 8 * 24 * 60,
  },
] as const;
/** journal ว่างเปล่าตอนเครื่องเพิ่งขึ้น — ให้เวลาเครื่องเปิดมานานพอที่งานรายวันควรผ่านมาแล้วก่อนเตือน "ไม่เคยเห็น" */
const CRON_NEVER_SEEN_MIN_UPTIME_S = 30 * 3600;
/** heartbeat อ่าน journal ย้อนหลังเท่านี้ (ต้องตรงกับ `--since` ใน scripts/mail-heartbeat.sh) */
const CRON_JOURNAL_WINDOW_MIN = 72 * 60;

/** โดเมนเว็บที่ Caddy ออกใบรับรองให้ (DNS-01) — ตรวจที่ origin ตรง ๆ ข้าม Cloudflare (Cloudflare edge cert ไม่ใช่ของเรา) */
export const WEB_ORIGIN_IP = "62.146.233.27";
export const WEB_DOMAINS = [
  "app.perpos.ai",
  "mail.perpos.ai",
  "app.exworker.co.th",
  "app.riekchang.com",
] as const;

export interface MailHeartbeat {
  diskPct: number | null;
  backupAgeHours: number | null;
  backupSizeMb: number | null;
  serviceActive: boolean | null;
  /** พอร์ต 25 ยังฟังอยู่บนเครื่องไหม — ตรวจจาก Vercel ไม่ได้ (ดูหัวไฟล์) · null = สคริปต์รุ่นเก่าไม่ได้ส่งมา */
  smtp25Listening: boolean | null;
  /** สคริปต์รุ่นเก่า (ก่อน 2026-08-19) ไม่ส่งมา = null → ไม่ตัดสินอะไรเรื่อง container/deploy */
  containers: HostContainer[] | null;
  apps: HostApp[] | null;
  /** cron daemon บนเครื่อง active ไหม · null = สคริปต์รุ่นเก่า */
  cronActive: boolean | null;
  cronJobs: CronJobSeen[] | null;
  /** วินาทีที่เครื่องเปิดมา (ใช้ตัดสินว่า "ไม่เห็น cron" ผิดปกติหรือแค่เพิ่งบูต + ตรวจรีบูต) */
  uptimeSeconds: number | null;
  /** RAM ทั้งเครื่อง (MB) — เตือนเมื่อใช้ ≥ HOST_MEM_WARN_RATIO ของทั้งหมด (OOM-killer จะเริ่มฆ่า container) */
  memUsedMb: number | null;
  memTotalMb: number | null;
  /** load average 1 นาที เทียบจำนวน CPU */
  load1: number | null;
  cpuCount: number | null;
}

const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : null);
const bool = (v: unknown) => (typeof v === "boolean" ? v : null);
const str = (v: unknown) => (typeof v === "string" && v.length > 0 ? v.slice(0, 200) : null);

function normalizeContainer(raw: unknown): HostContainer | null {
  const r = (raw ?? {}) as Record<string, unknown>;
  const name = str(r.name);
  if (!name) return null;
  const memLimit = num(r.memLimitBytes);
  return {
    name,
    state: str(r.state),
    restarts: num(r.restarts),
    restartDelta: Math.max(0, num(r.restartDelta) ?? 0),
    oomKilled: bool(r.oomKilled),
    exitCode: num(r.exitCode),
    startedAt: str(r.startedAt),
    memUsedBytes: num(r.memUsedBytes),
    memLimitBytes: memLimit && memLimit > 0 ? memLimit : null,
  };
}

function normalizeApp(raw: unknown): HostApp | null {
  const r = (raw ?? {}) as Record<string, unknown>;
  const app = str(r.app);
  if (!app) return null;
  return {
    app,
    release: str(r.release),
    exists: bool(r.exists),
    currentChangedAt: num(r.currentChangedAt),
    sha: str(r.sha),
  };
}

/** payload จากเครื่อง = ข้อมูลภายนอก ตรวจทีละช่องเสมอ */
export function normalizeHeartbeat(raw: unknown): MailHeartbeat {
  const r = (raw ?? {}) as Record<string, unknown>;
  return {
    diskPct: num(r.diskPct),
    backupAgeHours: num(r.backupAgeHours),
    backupSizeMb: num(r.backupSizeMb),
    serviceActive: bool(r.serviceActive),
    smtp25Listening: bool(r.smtp25Listening),
    containers: Array.isArray(r.containers)
      ? r.containers.map(normalizeContainer).filter((c): c is HostContainer => c !== null)
      : null,
    apps: Array.isArray(r.apps)
      ? r.apps.map(normalizeApp).filter((a): a is HostApp => a !== null)
      : null,
    cronActive: bool(r.cronActive),
    cronJobs: Array.isArray(r.cronJobs)
      ? r.cronJobs
          .map((j) => {
            const jj = (j ?? {}) as Record<string, unknown>;
            const url = str(jj.url);
            const at = num(jj.lastRunAt);
            return url && at !== null ? { url, lastRunAt: at } : null;
          })
          .filter((j): j is CronJobSeen => j !== null)
      : null,
    uptimeSeconds: num(r.uptimeSeconds),
    memUsedMb: num(r.memUsedMb),
    memTotalMb: num(r.memTotalMb),
    load1: num(r.load1),
    cpuCount: num(r.cpuCount),
  };
}

/**
 * ใส่ `restartDelta` ให้ heartbeat ใหม่โดยเทียบ RestartCount กับ heartbeat ก่อนหน้า (เรียกตอนรับ)
 * — RestartCount ลดลง (container ถูกสร้างใหม่ตอน deploy) = ไม่ใช่ crash → 0
 */
export function withRestartDelta(next: MailHeartbeat, prev: MailHeartbeat | null): MailHeartbeat {
  if (!next.containers) return next;
  const before = new Map((prev?.containers ?? []).map((c) => [c.name, c.restarts]));
  return {
    ...next,
    containers: next.containers.map((c) => {
      const p = before.get(c.name);
      const delta =
        c.restarts !== null && typeof p === "number" && c.restarts > p ? c.restarts - p : 0;
      return { ...c, restartDelta: delta };
    }),
  };
}

const fmtMb = (b: number) => `${Math.round(b / 1048576)} MB`;

/** service ที่ deploy แบบ blue/green (compose มี `<name>-blue` + `<name>-green` · ปกติรันทีละสี) */
const BLUE_GREEN = ["perpos", "exapp", "riekchang"] as const;

/**
 * ยุบ `perpos-blue`/`perpos-green` เป็นตัวแทนชื่อ `perpos` ตัวเดียวก่อนตัดสิน — เลือกสีที่ running
 * (ถ้ารันทั้งคู่เอาที่ start ล่าสุด · ไม่มีสีไหนรัน = เอาที่ start ล่าสุดเพื่อรายงาน state/exit ของมัน)
 * สีที่ stopped ค้างอยู่เป็นเรื่องปกติของ blue/green — ห้ามเตือน "container ไม่ทำงาน"
 */
export function collapseBlueGreen(containers: HostContainer[]): HostContainer[] {
  const out: HostContainer[] = [];
  const groups = new Map<string, HostContainer[]>();
  for (const c of containers) {
    const base = BLUE_GREEN.find((b) => c.name === `${b}-blue` || c.name === `${b}-green`);
    if (!base) {
      out.push(c);
      continue;
    }
    const g = groups.get(base) ?? [];
    g.push(c);
    groups.set(base, g);
  }
  const startedMs = (c: HostContainer) => {
    const t = c.startedAt ? new Date(c.startedAt).getTime() : NaN;
    return Number.isFinite(t) ? t : 0;
  };
  groups.forEach((g, base) => {
    const running = g.filter((c) => c.state === "running");
    const pool = running.length > 0 ? running : g;
    const pick = pool.reduce((a, b) => (startedMs(b) > startedMs(a) ? b : a));
    out.push({ ...pick, name: base });
  });
  return out;
}

/** ปัญหาฝั่ง Docker/deploy ของเว็บ 3 แอป (pure — มีเทสคุม) · key ขึ้นต้น `container:`/`crash:`/`mem:`/`deploy:` */
export function evaluateHostIssues(hbRaw: MailHeartbeat, now: number): Record<string, string> {
  const hb = hbRaw.containers
    ? { ...hbRaw, containers: collapseBlueGreen(hbRaw.containers) }
    : hbRaw;
  const issues: Record<string, string> = {};
  if (hb.containers) {
    const byName = new Map(hb.containers.map((c) => [c.name, c]));
    for (const name of EXPECTED_CONTAINERS) {
      const c = byName.get(name);
      if (!c) {
        issues[`container:${name}`] = `ไม่พบ container ${name} บนเครื่อง (ถูกลบ/ยังไม่ได้ up)`;
        continue;
      }
      if (c.state !== "running") {
        issues[`container:${name}`] =
          `container ${name} ไม่ทำงาน (state=${c.state ?? "?"}` +
          (c.exitCode !== null && c.exitCode !== 0 ? `, exit ${c.exitCode}` : "") +
          (c.oomKilled ? ", OOM-killed" : "") +
          ")";
        continue;
      }
      if (c.restartDelta > 0) {
        // เหตุการณ์ครั้งเดียว (crash แล้วกลับมาเองแล้ว) — key `crash:` ไม่ส่งข้อความ "กลับมาปกติ" ตามหลัง
        issues[`crash:${name}`] =
          `container ${name} crash แล้ว restart เอง ${c.restartDelta} ครั้งในรอบ heartbeat ที่ผ่านมา` +
          (c.oomKilled ? " (OOM-killed — RAM ชน mem_limit)" : "");
      }
      if (c.memUsedBytes !== null && c.memLimitBytes !== null) {
        if (c.memUsedBytes >= c.memLimitBytes * CONTAINER_MEM_WARN_RATIO) {
          issues[`mem:${name}`] =
            `container ${name} ใช้ RAM ${fmtMb(c.memUsedBytes)}/${fmtMb(c.memLimitBytes)} ` +
            `(≥${Math.round(CONTAINER_MEM_WARN_RATIO * 100)}% ของ mem_limit — เสี่ยง OOM-kill)`;
        }
      }
    }
  }
  if (hb.apps) {
    const byName = new Map((hb.containers ?? []).map((c) => [c.name, c]));
    for (const a of hb.apps) {
      if (a.exists === false) {
        issues[`deploy:${a.app}`] =
          `symlink /srv/apps/${a.app}/current ชี้ไป release ที่ไม่มีอยู่ (${a.release ?? "?"}) — restart แล้วจะขึ้นไม่ได้`;
        continue;
      }
      const c = byName.get(a.app);
      if (!c?.startedAt || a.currentChangedAt === null) continue;
      const started = new Date(c.startedAt).getTime();
      const changed = a.currentChangedAt * 1000;
      if (Number.isFinite(started) && changed > started && now - changed > DEPLOY_STALE_MS) {
        issues[`deploy:${a.app}`] =
          `deploy ${a.app} สลับไป release ${a.release ?? "?"} แล้ว แต่ container ยังรันของเก่า ` +
          `(ไม่ได้ restart มา ${Math.round((now - changed) / 60_000)} นาที)`;
      }
    }
  }
  if (hb.memUsedMb !== null && hb.memTotalMb !== null && hb.memTotalMb > 0) {
    const ratio = hb.memUsedMb / hb.memTotalMb;
    if (ratio >= HOST_MEM_WARN_RATIO)
      issues.hostmem = `RAM ทั้งเครื่องใช้ไป ${Math.round(ratio * 100)}% (${Math.round(hb.memUsedMb)}/${Math.round(hb.memTotalMb)} MB) — เสี่ยง OOM-killer ฆ่า container`;
  }
  if (hb.load1 !== null && hb.cpuCount !== null && hb.cpuCount > 0) {
    if (hb.load1 >= hb.cpuCount * LOAD_WARN_PER_CPU)
      issues.load = `เครื่องอืด: load1 = ${hb.load1.toFixed(1)} บน ${hb.cpuCount} CPU (เกิน ${LOAD_WARN_PER_CPU} เท่า)`;
  }
  if (hb.uptimeSeconds !== null && hb.uptimeSeconds < REBOOT_RECENT_S) {
    issues.reboot = `เครื่อง VPS เพิ่งรีบูต (uptime ${Math.round(hb.uptimeSeconds / 60)} นาที) — เช็คว่า container/Stalwart กลับมาครบ`;
  }
  if (hb.cronActive === false)
    issues["cron:service"] = "cron daemon บนเครื่องไม่ทำงาน (งานตามเวลาทุกตัวหยุด)";
  if (hb.cronJobs) {
    for (const job of EXPECTED_CRON) {
      const seen = hb.cronJobs.find((j) => j.url.includes(job.match));
      if (!seen) {
        // journal ไม่มีเลย — เพิ่งบูต/ติดตั้งยังไม่ถึงรอบ ก็ยังไม่ตัดสิน · งานที่รอบยาวกว่าหน้าต่าง journal
        // (รายสัปดาห์) ตัดสิน "ไม่เคยเห็น" ไม่ได้ (heartbeat ดูย้อนแค่ 72 ชม.) — ตรวจได้เฉพาะตอนเห็นแล้วเก่าเกิน
        if (
          job.maxAgeMin <= CRON_JOURNAL_WINDOW_MIN &&
          hb.uptimeSeconds !== null &&
          hb.uptimeSeconds >= CRON_NEVER_SEEN_MIN_UPTIME_S
        ) {
          issues[`cron:${job.key}`] =
            `ไม่เห็น cron ${job.key} ถูกสั่งรันเลยใน journal 72 ชม.ล่าสุด ทั้งที่เครื่องเปิดมา >30 ชม. (ไฟล์ /etc/cron.d หาย/ผิด?)`;
        }
        continue;
      }
      const ageMin = (now / 1000 - seen.lastRunAt) / 60;
      if (ageMin > job.maxAgeMin) {
        issues[`cron:${job.key}`] =
          `cron ${job.key} ถูกสั่งรันล่าสุด ${Math.round(ageMin >= 120 ? ageMin / 60 : ageMin)} ${ageMin >= 120 ? "ชม." : "นาที"}ก่อน (ควร ≤${job.maxAgeMin >= 120 ? `${job.maxAgeMin / 60} ชม.` : `${job.maxAgeMin} นาที`})`;
      }
    }
  }
  return issues;
}

// ─── ตัวตรวจสด (จาก scheduler) ─────────────────────────────────────────────────

/** ด่านรับเมลจากภายนอก — ใช้ 465 ไม่ใช่ 25 (Vercel บล็อก 25 ขาออก · ดูหัวไฟล์) */
function checkSmtp(timeoutMs = 10_000): Promise<string | null> {
  return new Promise((resolve) => {
    const sock = tls.connect({ host: HOST, port: SMTP_PORT, servername: HOST });
    const done = (err: string | null) => {
      sock.destroy();
      resolve(err);
    };
    const timer = setTimeout(() => done(`พอร์ต ${SMTP_PORT} ไม่ตอบใน 10 วิ`), timeoutMs);
    sock.once("data", (buf) => {
      clearTimeout(timer);
      done(buf.toString().startsWith("220") ? null : `พอร์ต ${SMTP_PORT} ตอบผิดปกติ (ไม่ใช่ 220)`);
    });
    sock.once("error", (e) => {
      clearTimeout(timer);
      done(`ต่อพอร์ต ${SMTP_PORT} ไม่ได้ (${e.message.slice(0, 80)})`);
    });
  });
}

async function checkJmap(): Promise<string | null> {
  try {
    // ไม่ส่ง credential — แค่ HTTP ตอบอะไรก็ได้ที่ไม่ใช่ 5xx = ตัวเว็บ/JMAP ยังมีชีวิต
    const res = await fetch(`https://${HOST}/jmap/session`, {
      cache: "no-store",
      signal: AbortSignal.timeout(10_000),
    });
    return res.status < 500 ? null : `JMAP ตอบ ${res.status}`;
  } catch {
    return "เว็บ/JMAP (443) ไม่ตอบใน 10 วิ";
  }
}

/** ใบรับรองที่ origin ตอบเมื่อ SNI = servername · ต่อไปที่ `ip` ตรง (ข้าม Cloudflare) · null = ต่อไม่ได้/วัดไม่ได้ */
export function checkOriginCertDaysLeft(
  servername: string,
  ip: string,
  timeoutMs = 10_000,
): Promise<number | null> {
  return new Promise((resolve) => {
    const sock = tls.connect({ host: ip, port: 443, servername });
    const timer = setTimeout(() => {
      sock.destroy();
      resolve(null);
    }, timeoutMs);
    sock.once("secureConnect", () => {
      clearTimeout(timer);
      const cert = sock.getPeerCertificate();
      sock.destroy();
      if (!cert?.valid_to) return resolve(null);
      resolve(Math.floor((new Date(cert.valid_to).getTime() - Date.now()) / 86_400_000));
    });
    sock.once("error", () => {
      clearTimeout(timer);
      resolve(null);
    });
  });
}

function checkCertDaysLeft(timeoutMs = 10_000): Promise<number | null> {
  return new Promise((resolve) => {
    const sock = tls.connect({ host: HOST, port: 443, servername: HOST });
    const timer = setTimeout(() => {
      sock.destroy();
      resolve(null);
    }, timeoutMs);
    sock.once("secureConnect", () => {
      clearTimeout(timer);
      const cert = sock.getPeerCertificate();
      sock.destroy();
      if (!cert?.valid_to) return resolve(null);
      resolve(Math.floor((new Date(cert.valid_to).getTime() - Date.now()) / 86_400_000));
    });
    sock.once("error", () => {
      clearTimeout(timer);
      resolve(null);
    });
  });
}

// ─── รวมผล + ตัดสินใจเตือน ──────────────────────────────────────────────────

interface AlertState {
  /** key ของปัญหา → เวลาแจ้งล่าสุด (epoch ms) */
  active: Record<string, number>;
}

/** ตรวจทุกอย่างแล้วคืนรายการปัญหา ณ ตอนนี้ (pure ต่อ input — มีเทสคุม) */
export function evaluateIssues(args: {
  smtpError: string | null;
  jmapError: string | null;
  certDaysLeft: number | null;
  heartbeat: MailHeartbeat | null;
  heartbeatAt: string | null;
  now: number;
  /** ใบรับรองของโดเมนเว็บที่ origin (Caddy) — วันที่เหลือต่อโดเมน · null = ต่อไม่ได้ · ไม่ส่ง = ไม่ตรวจ */
  webCerts?: Record<string, number | null>;
  /** Cloud Run workers: key → ข้อความ error (null = ตอบ /health ปกติ) · ไม่ส่ง = ไม่ตรวจ */
  workers?: Record<string, string | null>;
}): Record<string, string> {
  const issues: Record<string, string> = {};
  for (const [key, err] of Object.entries(args.workers ?? {})) {
    if (err)
      issues[`worker:${key}`] =
        `Cloud Run ${key} ไม่ตอบ /health: ${err} (งาน PDF/OCR/STT ที่ยิงไปจะค้าง)`;
  }
  if (args.smtpError) issues.smtp = `รับเมลไม่ได้: ${args.smtpError}`;
  for (const [domain, days] of Object.entries(args.webCerts ?? {})) {
    if (days === null) {
      issues[`origin:${domain}`] =
        `Caddy ที่ origin ไม่ตอบ TLS สำหรับ ${domain} (ผู้ใช้จะเจอ Cloudflare 52x)`;
    } else if (days < CERT_WARN_DAYS) {
      issues[`cert:${domain}`] =
        `ใบรับรอง ${domain} ที่ Caddy เหลือ ${days} วัน (DNS-01 ต่ออายุไม่สำเร็จ?)`;
    }
  }
  if (args.jmapError) issues.jmap = `เว็บเมล/JMAP มีปัญหา: ${args.jmapError}`;
  if (args.certDaysLeft !== null && args.certDaysLeft < CERT_WARN_DAYS) {
    issues.cert = `ใบรับรอง TLS เหลือ ${args.certDaysLeft} วัน (ACME อาจต่ออายุไม่สำเร็จ)`;
  }

  const beatAge = args.heartbeatAt ? args.now - new Date(args.heartbeatAt).getTime() : null;
  if (beatAge === null || beatAge > HEARTBEAT_STALE_MS) {
    issues.heartbeat =
      beatAge === null
        ? "ยังไม่เคยได้ heartbeat จากเครื่องเมล"
        : `heartbeat ขาดมา ${Math.round(beatAge / 60_000)} นาที (timer บนเครื่องตาย/เครื่องดับ?)`;
  } else if (args.heartbeat) {
    const hb = args.heartbeat;
    if (hb.diskPct !== null && hb.diskPct >= DISK_WARN_PCT) {
      issues.disk = `ดิสก์ใช้ไป ${hb.diskPct}% (เกิน ${DISK_WARN_PCT}%)`;
    }
    if (hb.backupAgeHours === null) {
      // 🪤 null = **ไม่พบไฟล์ backup เลย** ไม่ใช่ "ยังไม่มีข้อมูล" — เดิมปล่อยผ่าน ทำให้ตอนย้ายเครื่อง
      //    มา Contabo (2026-08-18) แล้ว timer backup หายไป ไม่มีใครรู้เลยว่าไม่ได้สำรองข้อมูล
      issues.backup = "ไม่พบไฟล์ backup บนเครื่องเลย (งานสำรองข้อมูลอาจไม่ได้ติดตั้ง/หยุดทำงาน)";
    } else if (hb.backupAgeHours > BACKUP_STALE_HOURS) {
      issues.backup = `backup ล่าสุดอายุ ${Math.round(hb.backupAgeHours)} ชม. (ควร <24)`;
    }
    if (hb.serviceActive === false) issues.service = "systemd แจ้งว่า service stalwart ไม่ active";
    if (hb.smtp25Listening === false) {
      issues.smtp25 = "เครื่องรายงานว่าไม่มีอะไรฟังพอร์ต 25 แล้ว (เมลขาเข้าจะเข้าไม่ได้)";
    }
    Object.assign(issues, evaluateHostIssues(hb, args.now));
  }
  return issues;
}

/** เทียบกับสถานะเดิม → อะไรควรแจ้ง (ใหม่/ครบรอบเตือนซ้ำ) และอะไรหายแล้ว (pure — มีเทสคุม) */
export function diffAlerts(
  prev: AlertState,
  issues: Record<string, string>,
  now: number,
): { notify: string[]; recovered: string[]; next: AlertState } {
  const notify: string[] = [];
  const recovered: string[] = [];
  const next: AlertState = { active: {} };
  for (const [key, msg] of Object.entries(issues)) {
    const lastSent = prev.active[key];
    if (lastSent === undefined || now - lastSent >= REALERT_MS) {
      notify.push(msg + (lastSent !== undefined ? " (ยังไม่หาย)" : ""));
      next.active[key] = now;
    } else {
      next.active[key] = lastSent;
    }
  }
  for (const key of Object.keys(prev.active)) {
    // `crash:`/`reboot` = เหตุการณ์ชั่วขณะ (container restart เองแล้ว / เครื่องบูตเสร็จ) ไม่มีสถานะ "หาย" ให้แจ้ง
    if (!(key in issues) && !key.startsWith("crash:") && key !== "reboot") recovered.push(key);
  }
  return { notify, recovered, next };
}

function recoverLabel(key: string): string {
  const [kind, name] = key.split(":");
  if (name && kind === "container") return `container ${name}`;
  if (name && kind === "mem") return `RAM ของ container ${name}`;
  if (name && kind === "deploy") return `release ของ ${name}`;
  if (name && kind === "cron") return name === "service" ? "cron daemon" : `cron ${name}`;
  if (name && kind === "cert") return `ใบรับรอง ${name}`;
  if (name && kind === "origin") return `Caddy origin ${name}`;
  if (name && kind === "worker") return `Cloud Run worker ${name}`;
  return RECOVER_LABEL[key] ?? key;
}

const RECOVER_LABEL: Record<string, string> = {
  hostmem: "RAM ทั้งเครื่อง",
  load: "โหลดเครื่อง",
  smtp: `รับเมล (พอร์ต ${SMTP_PORT})`,
  smtp25: "พอร์ต 25 บนเครื่อง",
  jmap: "เว็บเมล/JMAP",
  cert: "ใบรับรอง TLS",
  heartbeat: "heartbeat จากเครื่อง",
  disk: "พื้นที่ดิสก์",
  backup: "backup รายวัน",
  service: "service stalwart",
};

/** จุดเรียกจาก scheduler (t5) — best-effort: monitoring พังต้องไม่ทำ scheduler ล้ม */
/** ping /health ของ Cloud Run worker — timeout 15 วิ + ลองซ้ำ 1 ครั้ง (cold start ของ Playwright ช้าได้) · คืน null = ปกติ */
export async function checkWorkerHealth(
  baseUrl: string,
  timeoutMs = 15_000,
): Promise<string | null> {
  const url = `${baseUrl.replace(/\/$/, "")}/health`;
  let last = "";
  for (let attempt = 0; attempt < 2; attempt++) {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), timeoutMs);
    try {
      const res = await fetch(url, { signal: ctrl.signal, cache: "no-store" });
      if (res.ok) return null;
      last = `HTTP ${res.status}`;
    } catch (e) {
      last =
        e instanceof Error && e.name === "AbortError"
          ? `timeout ${timeoutMs / 1000}s`
          : String(e instanceof Error ? e.message : e);
    } finally {
      clearTimeout(timer);
    }
    if (attempt === 0) await new Promise((r) => setTimeout(r, 5_000));
  }
  return last || "unknown";
}

/**
 * ตรวจว่า scheduler worker ยังเดินอยู่ — เรียกจาก **heartbeat route** (container perpos) ทุก 5 นาที
 * เพราะตัวเฝ้าหลัก (`runMailServerMonitor`) รันอยู่ **ใน worker เอง** ถ้า worker ตายก็เงียบทั้งระบบ
 * · เกณฑ์ = แถวล่าสุดใน `scheduler_runs` เก่ากว่า SCHEDULER_STALE_MS · dedup/recover ผ่าน
 *   `mail_server_health.alert_state.active[SCHEDULER_STALE_KEY]` (runMailServerMonitor พกคีย์นี้ต่อโดยไม่แตะ)
 */
export async function checkSchedulerLiveness(
  admin: SupabaseClient,
  now = Date.now(),
): Promise<void> {
  try {
    const { data: last } = await admin
      .from("scheduler_runs")
      .select("ran_at")
      .order("ran_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    const lastAt = last?.ran_at ? new Date(last.ran_at as string).getTime() : null;
    const ageMs = lastAt === null ? null : now - lastAt;
    const stale = ageMs === null || ageMs > SCHEDULER_STALE_MS;

    const { data: row } = await admin
      .from("mail_server_health")
      .select("alert_state")
      .eq("id", ROW_ID)
      .maybeSingle();
    const active = {
      ...((row?.alert_state as { active?: Record<string, number> } | null)?.active ?? {}),
    };
    const lastSent = active[SCHEDULER_STALE_KEY];

    if (stale) {
      if (lastSent !== undefined && now - lastSent < REALERT_MS) return;
      active[SCHEDULER_STALE_KEY] = now;
      await alertAdminLine(
        admin,
        [
          "🔴 scheduler ของ PERPOS หยุดเดิน (container perpos-worker)",
          ageMs === null
            ? "ไม่พบแถวใน scheduler_runs เลย"
            : `scheduler_runs ล่าสุด ${Math.round(ageMs / 60_000)} นาทีก่อน (ควร ≤${SCHEDULER_STALE_MS / 60_000})`,
          "งาน STT/PDF ค้าง, เตือนต่าง ๆ, ตัวเฝ้าเครื่อง จะเงียบทั้งหมด — ssh perpos-sg แล้ว docker compose logs perpos-worker",
          lastSent !== undefined ? "(ยังไม่หาย)" : "",
        ]
          .filter(Boolean)
          .join("\n"),
      );
    } else if (lastSent !== undefined) {
      delete active[SCHEDULER_STALE_KEY];
      await alertAdminLine(admin, "✅ scheduler ของ PERPOS (perpos-worker) กลับมาเดินแล้ว");
    } else return;

    await admin
      .from("mail_server_health")
      .upsert({ id: ROW_ID, alert_state: { active } }, { onConflict: "id" });
  } catch (e) {
    console.error("[scheduler-liveness] failed:", e instanceof Error ? e.message : String(e));
  }
}

export async function runMailServerMonitor(
  admin: SupabaseClient,
): Promise<{ issues: number } | null> {
  try {
    const workerTargets: { key: string; url: string }[] = [];
    for (const w of EXPECTED_WORKERS) {
      const url = process.env[w.urlEnv];
      if (url) workerTargets.push({ key: w.key, url });
    }
    const [smtpError, jmapError, certDaysLeft, workerErrs, ...webCertDays] = await Promise.all([
      checkSmtp(),
      checkJmap(),
      checkCertDaysLeft(),
      Promise.all(workerTargets.map((w) => checkWorkerHealth(w.url))),
      ...WEB_DOMAINS.map((d) => checkOriginCertDaysLeft(d, WEB_ORIGIN_IP)),
    ]);
    const workers: Record<string, string | null> = {};
    workerTargets.forEach((w, i) => {
      workers[w.key] = workerErrs[i] ?? null;
    });
    const webCerts: Record<string, number | null> = {};
    WEB_DOMAINS.forEach((d, i) => {
      webCerts[d] = webCertDays[i] ?? null;
    });

    const { data: row } = await admin
      .from("mail_server_health")
      .select("heartbeat, heartbeat_at, alert_state")
      .eq("id", ROW_ID)
      .maybeSingle();

    const now = Date.now();
    const issues = evaluateIssues({
      smtpError,
      jmapError,
      certDaysLeft,
      heartbeat: row?.heartbeat ? normalizeHeartbeat(row.heartbeat) : null,
      heartbeatAt: (row?.heartbeat_at as string | null) ?? null,
      now,
      webCerts,
      workers,
    });

    const prev: AlertState = { active: {} };
    // คีย์ `scheduler:*` เป็นของ checkSchedulerLiveness (heartbeat route) — ตัวนี้ห้ามแจ้ง/ห้าม recover แทน แค่พกต่อ
    const foreign: Record<string, number> = {};
    const rawActive = (row?.alert_state as { active?: Record<string, unknown> } | null)?.active;
    for (const [k, v] of Object.entries(rawActive ?? {})) {
      if (typeof v !== "number") continue;
      if (k.startsWith("scheduler:")) foreign[k] = v;
      else prev.active[k] = v;
    }

    const { notify, recovered, next } = diffAlerts(prev, issues, now);
    Object.assign(next.active, foreign);

    if (notify.length > 0) {
      await alertAdminLine(
        admin,
        [`🔴 เซิร์ฟเวอร์ VPS SG (${HOST})`, "", ...notify.map((m) => `• ${m}`)].join("\n"),
      );
    }
    if (recovered.length > 0) {
      await alertAdminLine(
        admin,
        [
          "✅ เซิร์ฟเวอร์ VPS SG กลับมาปกติ",
          "",
          ...recovered.map((k) => `• ${recoverLabel(k)}`),
        ].join("\n"),
      );
    }

    await admin.from("mail_server_health").upsert(
      {
        id: ROW_ID,
        alert_state: next,
        last_check_at: new Date(now).toISOString(),
        last_issues: issues,
        web_certs: webCerts,
      },
      { onConflict: "id" },
    );
    return { issues: Object.keys(issues).length };
  } catch (e) {
    console.error("[mail-monitor] failed:", e instanceof Error ? e.message : String(e));
    return null;
  }
}
