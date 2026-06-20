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

type Kind = "worker" | "scheduler" | "integration";

type ServiceDef = {
  id: string;
  name: string; // ชื่อ resource จริง (เช่นชื่อ Cloud Run service)
  kind: Kind;
  purpose: string; // ทำอะไร
  stack: string; // เทคโนโลยี
  platform: string; // GCP Cloud Run / Cloud Scheduler / managed ...
  region?: string;
  urlEnv?: string; // env ที่เก็บ URL (worker)
  healthPath?: string; // path สำหรับ ping (worker)
  secretEnv?: string[]; // env secret ที่ต้องตั้ง
  configEnv?: string[]; // env config ที่ต้องตั้ง (integration)
};

// ─── ทะเบียน backend ทั้งหมดของ PERPOS ──────────────────────────────────────────
const REGISTRY: ServiceDef[] = [
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
  // ── Cloud Scheduler ──
  {
    id: "scheduler",
    name: "assistant-scheduler (cron ทุก 1 นาที)",
    kind: "scheduler",
    purpose: "ดูแลงานผู้ช่วย AI — ปิดงานค้าง (stuck), ยิงงานคิวซ้ำ (requeue), ลบไฟล์ตาม PDPA",
    stack: "HTTP POST → /api/assistant/scheduler",
    platform: "GCP Cloud Scheduler",
    region: "asia-southeast1",
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

  // scheduler last-run (จาก scheduler_runs)
  const admin = createAdminClient();
  const { data: lastRun } = await admin
    .from("scheduler_runs")
    .select("ran_at, ok")
    .order("ran_at", { ascending: false })
    .limit(1)
    .maybeSingle();

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

  return ok({ services, checked_at: new Date().toISOString() });
}
