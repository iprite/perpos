/**
 * เฝ้าระวังเมลเซิร์ฟเวอร์ (Stalwart) + แจ้งเตือน LINE — รันจาก scheduler (นอกเครื่องเมล)
 *
 * ทำไมต้องเช็คจากข้างนอก: ถ้าเครื่องเมลตาย สคริปต์บนเครื่องนั้นย่อมแจ้งอะไรไม่ได้
 * ⇒ ด่านหลัก = Vercel (scheduler ทุก 5 นาที) ตรวจ 25/443/ใบรับรองสด ๆ
 *   ส่วนของที่ต้องมองจากในเครื่อง (ดิสก์/อายุ backup) มาจาก heartbeat รายชั่วโมง
 *   ที่เครื่องยิงเข้า `/api/admin/mail-server/heartbeat` — heartbeat ขาด = เรื่องต้องเตือนเช่นกัน
 *
 * การเตือน: แจ้งเฉพาะ "ขอบเหตุการณ์" (ดี→พัง / พัง→หาย) + เตือนซ้ำทุก 6 ชม. ถ้ายังพังอยู่
 * — ห้าม spam ทุก 5 นาที · สถานะเก็บใน `mail_server_health` (แถวเดียว, RLS deny-all)
 */

import net from "node:net";
import tls from "node:tls";
import type { SupabaseClient } from "@supabase/supabase-js";
import { alertAdminLine } from "@/lib/admin/alert";

const HOST = "stalwart.perpos.ai";
const ROW_ID = "stalwart";
const REALERT_MS = 6 * 60 * 60 * 1000;
/** heartbeat มาทุก 1 ชม. — ให้อภัย 1 รอบพลาด (deploy/รีบูต) ก่อนถือว่าขาด */
const HEARTBEAT_STALE_MS = 3 * 60 * 60 * 1000;
const CERT_WARN_DAYS = 14;
const DISK_WARN_PCT = 85;
const BACKUP_STALE_HOURS = 30;

export interface MailHeartbeat {
  diskPct: number | null;
  backupAgeHours: number | null;
  backupSizeMb: number | null;
  serviceActive: boolean | null;
}

/** payload จากเครื่อง = ข้อมูลภายนอก ตรวจทีละช่องเสมอ */
export function normalizeHeartbeat(raw: unknown): MailHeartbeat {
  const r = (raw ?? {}) as Record<string, unknown>;
  const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : null);
  return {
    diskPct: num(r.diskPct),
    backupAgeHours: num(r.backupAgeHours),
    backupSizeMb: num(r.backupSizeMb),
    serviceActive: typeof r.serviceActive === "boolean" ? r.serviceActive : null,
  };
}

// ─── ตัวตรวจสด (จาก Vercel) ─────────────────────────────────────────────────

function checkSmtp(timeoutMs = 10_000): Promise<string | null> {
  return new Promise((resolve) => {
    const sock = net.connect({ host: HOST, port: 25 });
    const done = (err: string | null) => {
      sock.destroy();
      resolve(err);
    };
    const timer = setTimeout(() => done("พอร์ต 25 ไม่ตอบใน 10 วิ"), timeoutMs);
    sock.once("data", (buf) => {
      clearTimeout(timer);
      done(buf.toString().startsWith("220") ? null : "พอร์ต 25 ตอบผิดปกติ (ไม่ใช่ 220)");
    });
    sock.once("error", (e) => {
      clearTimeout(timer);
      done(`ต่อพอร์ต 25 ไม่ได้ (${e.message.slice(0, 80)})`);
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
}): Record<string, string> {
  const issues: Record<string, string> = {};
  if (args.smtpError) issues.smtp = `รับเมลไม่ได้: ${args.smtpError}`;
  if (args.jmapError) issues.jmap = `เว็บเมล/JMAP มีปัญหา: ${args.jmapError}`;
  if (args.certDaysLeft !== null && args.certDaysLeft < CERT_WARN_DAYS) {
    issues.cert = `ใบรับรอง TLS เหลือ ${args.certDaysLeft} วัน (ACME อาจต่ออายุไม่สำเร็จ)`;
  }

  const beatAge = args.heartbeatAt ? args.now - new Date(args.heartbeatAt).getTime() : null;
  if (beatAge === null || beatAge > HEARTBEAT_STALE_MS) {
    issues.heartbeat =
      beatAge === null
        ? "ยังไม่เคยได้ heartbeat จากเครื่องเมล"
        : `heartbeat ขาดมา ${Math.round(beatAge / 3_600_000)} ชม. (ตัวส่งบนเครื่องอาจตาย)`;
  } else if (args.heartbeat) {
    const hb = args.heartbeat;
    if (hb.diskPct !== null && hb.diskPct >= DISK_WARN_PCT) {
      issues.disk = `ดิสก์ใช้ไป ${hb.diskPct}% (เกิน ${DISK_WARN_PCT}%)`;
    }
    if (hb.backupAgeHours !== null && hb.backupAgeHours > BACKUP_STALE_HOURS) {
      issues.backup = `backup ล่าสุดอายุ ${Math.round(hb.backupAgeHours)} ชม. (ควร <24)`;
    }
    if (hb.serviceActive === false) issues.service = "systemd แจ้งว่า service stalwart ไม่ active";
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
    if (!(key in issues)) recovered.push(key);
  }
  return { notify, recovered, next };
}

const RECOVER_LABEL: Record<string, string> = {
  smtp: "รับเมล (พอร์ต 25)",
  jmap: "เว็บเมล/JMAP",
  cert: "ใบรับรอง TLS",
  heartbeat: "heartbeat จากเครื่อง",
  disk: "พื้นที่ดิสก์",
  backup: "backup รายวัน",
  service: "service stalwart",
};

/** จุดเรียกจาก scheduler (t5) — best-effort: monitoring พังต้องไม่ทำ scheduler ล้ม */
export async function runMailServerMonitor(
  admin: SupabaseClient,
): Promise<{ issues: number } | null> {
  try {
    const [smtpError, jmapError, certDaysLeft] = await Promise.all([
      checkSmtp(),
      checkJmap(),
      checkCertDaysLeft(),
    ]);

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
    });

    const prev: AlertState = { active: {} };
    const rawActive = (row?.alert_state as { active?: Record<string, unknown> } | null)?.active;
    for (const [k, v] of Object.entries(rawActive ?? {})) {
      if (typeof v === "number") prev.active[k] = v;
    }

    const { notify, recovered, next } = diffAlerts(prev, issues, now);

    if (notify.length > 0) {
      await alertAdminLine(
        admin,
        ["🔴 เมลเซิร์ฟเวอร์ (stalwart.perpos.ai)", "", ...notify.map((m) => `• ${m}`)].join("\n"),
      );
    }
    if (recovered.length > 0) {
      await alertAdminLine(
        admin,
        [
          "✅ เมลเซิร์ฟเวอร์กลับมาปกติ",
          "",
          ...recovered.map((k) => `• ${RECOVER_LABEL[k] ?? k}`),
        ].join("\n"),
      );
    }

    await admin.from("mail_server_health").upsert(
      {
        id: ROW_ID,
        alert_state: next,
        last_check_at: new Date(now).toISOString(),
        last_issues: issues,
      },
      { onConflict: "id" },
    );
    return { issues: Object.keys(issues).length };
  } catch (e) {
    console.error("[mail-monitor] failed:", e instanceof Error ? e.message : String(e));
    return null;
  }
}
