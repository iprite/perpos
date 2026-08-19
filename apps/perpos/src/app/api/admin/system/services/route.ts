/**
 * Admin: System / Infrastructure map
 *   GET /api/admin/system/services  — รายการ backend ทั้งหมดที่ระบบต่อใช้งาน + health สด
 *
 * เพิ่ม service ใหม่ในอนาคต = เพิ่ม 1 entry ใน REGISTRY ด้านล่าง
 */

import { NextRequest } from "next/server";
import { requireAdmin } from "../../../_lib/auth";
import { createAdminClient } from "../../../_lib/supabase";
import { ok } from "../../../_lib/response";
import { normalizeHeartbeat, type MailHeartbeat } from "@/lib/mail/server-monitor";

type Kind = "vps_app" | "worker" | "scheduler" | "integration";

type ServiceDef = {
  id: string;
  name: string; // ชื่อ resource จริง (เช่นชื่อ Cloud Run service)
  kind: Kind;
  purpose: string; // ทำอะไร
  stack: string; // เทคโนโลยี
  platform: string; // GCP Cloud Run / Cloud Scheduler / managed ...
  region?: string;
  urlEnv?: string; // env ที่เก็บ URL (worker)
  url?: string; // URL ตายตัว (vps_app — โดเมนสาธารณะ ping ผ่าน Cloudflare เหมือนผู้ใช้จริง)
  container?: string; // ชื่อ container ใน docker compose (vps_app) — จับคู่กับ heartbeat
  healthPath?: string; // path สำหรับ ping (worker/vps_app)
  secretEnv?: string[]; // env secret ที่ต้องตั้ง
  configEnv?: string[]; // env config ที่ต้องตั้ง (integration)
};

// ─── ทะเบียน backend ทั้งหมดของ PERPOS ──────────────────────────────────────────
const REGISTRY: ServiceDef[] = [
  // ── เว็บ 3 แอปบน VPS SG (Docker Compose · เครื่องเดียวกับ Stalwart) ──
  // ping ผ่านโดเมนจริง (เมฆส้ม → Caddy → container) = เส้นทางเดียวกับผู้ใช้ · สถานะ container/RAM/
  // release มาจาก heartbeat ของเครื่อง (`vps` ในผลลัพธ์) — ดู lib/mail/server-monitor.ts
  {
    id: "vps-perpos",
    name: "perpos (app.perpos.ai)",
    kind: "vps_app",
    purpose: "PERPOS Suite/Flow + webmail (mail.perpos.ai) + API/scheduler ทั้งหมด",
    stack: "Next.js 15 standalone · node:22-alpine · mem_limit 1536m",
    platform: "Contabo VPS SG (Docker)",
    region: "62.146.233.27",
    url: "https://app.perpos.ai",
    container: "perpos",
    healthPath: "/api/health",
  },
  {
    id: "vps-exapp",
    name: "exapp (exworker)",
    kind: "vps_app",
    purpose:
      "แอป exworker — คนละ repo/deploy pipeline แต่อยู่เครื่องเดียวกัน (schema `exapp` ใน Supabase เดียวกัน)",
    stack: "Next.js standalone · node:22-alpine · mem_limit 1024m",
    platform: "Contabo VPS SG (Docker)",
    region: "62.146.233.27",
    url: process.env.EXAPP_HEALTH_URL || "https://app.exworker.co.th",
    container: "exapp",
    healthPath: "/",
  },
  {
    id: "vps-riekchang",
    name: "riekchang",
    kind: "vps_app",
    purpose: "แอป riekchang — คนละ repo/deploy pipeline แต่อยู่เครื่องเดียวกัน",
    stack: "Next.js standalone · node:22-alpine",
    platform: "Contabo VPS SG (Docker)",
    region: "62.146.233.27",
    url: process.env.RIEKCHANG_HEALTH_URL || "https://app.riekchang.com",
    container: "riekchang",
    healthPath: "/",
  },
  {
    id: "vps-caddy",
    name: "caddy (reverse proxy + TLS)",
    kind: "vps_app",
    purpose:
      "รับ 80/443 ทุกโดเมน → proxy เข้า container/Stalwart · ออกใบรับรองอัตโนมัติ (DNS-01 Cloudflare)",
    stack: "Caddy 2 + cloudflare DNS plugin",
    platform: "Contabo VPS SG (Docker)",
    region: "62.146.233.27",
    container: "caddy",
    secretEnv: [],
  },
  // ── Cloud Run workers ──
  {
    id: "pdf-renderer",
    name: "perpos-pdf-renderer",
    kind: "worker",
    purpose: "เรนเดอร์ HTML → PDF (ใบเสร็จ/เอกสารขาย, รายงานการประชุม MoM)",
    stack: "Express + Playwright",
    platform: "GCP Cloud Run",
    region: "asia-southeast1",
    urlEnv: "PDF_RENDER_URL",
    healthPath: "/health",
    secretEnv: ["PDF_SERVICE_SECRET"],
  },
  {
    id: "ocr-worker",
    name: "perpos-ocr-worker",
    kind: "worker",
    purpose: "AI ทำบัญชี — OCR ใบเสร็จ/บิล → จัดหมวด → ลงรายการบัญชี (acc_firm)",
    stack: "Express + Gemini",
    platform: "GCP Cloud Run",
    region: "asia-southeast1",
    urlEnv: "OCR_WORKER_URL",
    healthPath: "/health",
    secretEnv: ["WORKER_SECRET", "GEMINI_API_KEY"],
  },
  {
    id: "stt-worker",
    name: "perpos-stt-worker",
    kind: "worker",
    purpose: "แกะเสียง → รายงานการประชุม (MoM) ผ่าน Gemini Files API (ผู้ช่วย AI)",
    stack: "Express + Gemini Files API",
    platform: "GCP Cloud Run",
    region: "asia-southeast1",
    urlEnv: "STT_WORKER_URL",
    healthPath: "/health",
    secretEnv: ["WORKER_SECRET", "GEMINI_API_KEY"],
  },
  {
    id: "pdf-compress-worker",
    name: "perpos-pdf-compress-worker",
    kind: "worker",
    purpose:
      "บีบขนาด PDF ผ่าน LINE (pikepdf + Pillow surgical, การันตี ≥30%) — ผู้ช่วย AI kind=pdf_compress",
    stack: "Express + pikepdf + Pillow",
    platform: "GCP Cloud Run",
    region: "asia-southeast1",
    urlEnv: "PDF_COMPRESS_WORKER_URL",
    healthPath: "/health",
    secretEnv: ["WORKER_SECRET"],
  },
  // ── cron ──
  {
    id: "scheduler",
    name: "perpos-worker (scheduler loop ทุก 1 นาที)",
    kind: "scheduler",
    purpose:
      "ดูแลงานผู้ช่วย AI (stuck/requeue/PDPA) + เฝ้าเซิร์ฟเวอร์ VPS (t5) + sync บิล GCP (t1440) — worker process ใน docker compose (lib/scheduler/run.ts)",
    stack:
      "node apps/perpos/worker/scheduler-worker.js (esbuild bundle) · lease กันซ้อนใน scheduler_leases",
    platform:
      "container perpos-worker บน VPS SG (cron/Cloud Scheduler เลิกใช้ 2026-08-19) · HTTP endpoint เหลือไว้ยิงมือ",
    secretEnv: ["CRON_SECRET"],
  },
  // ── Managed integrations ──
  {
    id: "supabase",
    name: "Supabase (zftnyipifpaiqzukiyzi)",
    kind: "integration",
    purpose: "ฐานข้อมูล PostgreSQL + Auth (LINE login) + Storage (ไฟล์เสียง/PDF) + RLS",
    stack: "PostgreSQL",
    platform: "Supabase Cloud",
    region: "ap-southeast-1",
    configEnv: ["NEXT_PUBLIC_SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY"],
  },
  {
    id: "gemini",
    name: "Google Gemini API",
    kind: "integration",
    purpose: "AI หลัก — OCR ทำบัญชี + แกะเสียงเป็น MoM (paid tier)",
    stack: "Gemini 2.5",
    platform: "Google AI / Vertex",
    configEnv: ["GEMINI_API_KEY"],
  },
  {
    id: "line",
    name: "LINE Messaging + Login",
    kind: "integration",
    purpose: "ช่องทางหลัก — Bot webhook, push ข้อความ/PDF, login เข้าเว็บ",
    stack: "LINE Platform",
    platform: "LINE",
    configEnv: [
      "LINE_MESSAGING_CHANNEL_ACCESS_TOKEN",
      "LINE_MESSAGING_CHANNEL_SECRET",
      "LINE_LOGIN_CHANNEL_ID",
    ],
  },
  {
    id: "stripe",
    name: "Stripe",
    kind: "integration",
    purpose: "เก็บเงินสมาชิกผู้ช่วย AI (subscription ฿99/เดือน) + billing org",
    stack: "Stripe API",
    platform: "Stripe",
    configEnv: ["STRIPE_SECRET_KEY"],
  },
];

async function pingHealth(
  url: string,
  healthPath: string,
): Promise<{ status: "up" | "down"; latency_ms: number | null }> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 4000);
  const t0 = Date.now();
  try {
    const res = await fetch(`${url.replace(/\/$/, "")}${healthPath}`, {
      signal: ctrl.signal,
      cache: "no-store",
    });
    return { status: res.ok ? "up" : "down", latency_ms: Date.now() - t0 };
  } catch {
    return { status: "down", latency_ms: null };
  } finally {
    clearTimeout(timer);
  }
}

export async function GET(req: NextRequest) {
  const auth = await requireAdmin(req);
  if (!auth.ok) return auth.res;

  const envPresent = (keys?: string[]) =>
    (keys ?? []).map((k) => ({ key: k, present: !!process.env[k] }));

  // scheduler last-run (จาก scheduler_runs) + heartbeat ล่าสุดของเครื่อง VPS (จาก mail_server_health)
  const admin = createAdminClient();
  const [{ data: lastRun }, { data: hostRow }] = await Promise.all([
    admin
      .from("scheduler_runs")
      .select("ran_at, ok")
      .order("ran_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
    admin
      .from("mail_server_health")
      .select("heartbeat, heartbeat_at, last_issues, last_check_at, web_certs")
      .eq("id", "stalwart")
      .maybeSingle(),
  ]);
  const hb: MailHeartbeat | null = hostRow?.heartbeat
    ? normalizeHeartbeat(hostRow.heartbeat)
    : null;
  const rawHb = (hostRow?.heartbeat ?? null) as Record<string, unknown> | null;
  const hbNum = (k: string) => {
    const v = rawHb?.[k];
    return typeof v === "number" && Number.isFinite(v) ? v : null;
  };
  const containersByName = new Map((hb?.containers ?? []).map((c) => [c.name, c]));
  const appsByName = new Map((hb?.apps ?? []).map((a) => [a.app, a]));

  const services = await Promise.all(
    REGISTRY.map(async (s) => {
      const base = {
        id: s.id,
        name: s.name,
        kind: s.kind,
        purpose: s.purpose,
        stack: s.stack,
        platform: s.platform,
        region: s.region ?? null,
        secrets: envPresent(s.secretEnv),
        configs: envPresent(s.configEnv),
      };

      if (s.kind === "vps_app") {
        const container = s.container ? (containersByName.get(s.container) ?? null) : null;
        const release = s.container ? (appsByName.get(s.container) ?? null) : null;
        const h = s.url ? await pingHealth(s.url, s.healthPath ?? "/") : null;
        // สถานะ = HTTP ตอบไหม (ถ้ามี URL) · ไม่มี URL (caddy) ใช้ state ของ container จาก heartbeat
        const status = h
          ? h.status
          : container
            ? container.state === "running"
              ? "up"
              : "down"
            : "unknown";
        return {
          ...base,
          url: s.url ?? null,
          configured: true,
          status,
          latency_ms: h?.latency_ms ?? null,
          container,
          release,
        };
      }

      if (s.kind === "worker" && s.urlEnv) {
        const url = process.env[s.urlEnv];
        if (!url) {
          return {
            ...base,
            url_env: s.urlEnv,
            configured: false,
            status: "not_configured" as const,
            latency_ms: null,
          };
        }
        const h = await pingHealth(url, s.healthPath ?? "/health");
        return {
          ...base,
          url_env: s.urlEnv,
          configured: true,
          status: h.status,
          latency_ms: h.latency_ms,
        };
      }

      if (s.kind === "scheduler") {
        const ranAt = lastRun?.ran_at as string | undefined;
        const ageMs = ranAt ? Date.now() - new Date(ranAt).getTime() : null;
        const status =
          ageMs == null
            ? "unknown"
            : ageMs <= 5 * 60_000
              ? "up"
              : ageMs <= 30 * 60_000
                ? "stale"
                : "down";
        return { ...base, configured: true, status, last_ran_at: ranAt ?? null };
      }

      // integration — สถานะจาก env config ครบไหม
      const allSet = base.configs.length === 0 || base.configs.every((c) => c.present);
      return { ...base, configured: allSet, status: allSet ? "configured" : "missing_config" };
    }),
  );

  // สรุปเครื่อง VPS (ทรัพยากรจาก heartbeat แถวล่าสุด) — กราฟย้อนหลังดูที่ /admin/mail แท็บเครื่องเซิร์ฟเวอร์
  const vps = {
    heartbeat_at: (hostRow?.heartbeat_at as string | null) ?? null,
    last_check_at: (hostRow?.last_check_at as string | null) ?? null,
    issues: (hostRow?.last_issues as Record<string, string> | null) ?? {},
    disk_pct: hb?.diskPct ?? null,
    disk_used_bytes: hbNum("diskUsedBytes"),
    disk_total_bytes: hbNum("diskTotalBytes"),
    mem_used_mb: hbNum("memUsedMb"),
    mem_total_mb: hbNum("memTotalMb"),
    load1: hbNum("load1"),
    cpu_count: hbNum("cpuCount"),
    uptime_seconds: hbNum("uptimeSeconds"),
    containers: hb?.containers ?? null,
    apps: hb?.apps ?? null,
    cron_active: hb?.cronActive ?? null,
    cron_jobs: hb?.cronJobs ?? null,
    // ใบรับรองที่ Caddy origin ต่อโดเมน (วันที่เหลือ · null = ต่อไม่ได้) — ตัวเฝ้า t5 เขียนไว้
    web_certs: (hostRow?.web_certs as Record<string, number | null> | null) ?? null,
  };

  return ok({ services, vps, checked_at: new Date().toISOString() });
}
