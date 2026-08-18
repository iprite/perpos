"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  Server,
  Loader2,
  Cpu,
  Clock,
  Plug,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  Circle,
  Container,
  HardDrive,
  MemoryStick,
  Gauge,
} from "lucide-react";
import { StatCard } from "@/components/ui/stat-card";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import { AdminPage, AdminCard } from "../_components/admin-page";
import { AdminTabs, SYSTEM_TABS } from "../_components/admin-tabs";

type EnvCheck = { key: string; present: boolean };
type HostContainer = {
  name: string;
  state: string | null;
  restarts: number | null;
  restartDelta: number;
  oomKilled: boolean | null;
  exitCode: number | null;
  startedAt: string | null;
  memUsedBytes: number | null;
  memLimitBytes: number | null;
};
type HostApp = {
  app: string;
  release: string | null;
  exists: boolean | null;
  currentChangedAt: number | null;
  sha: string | null;
};
type Vps = {
  heartbeat_at: string | null;
  last_check_at: string | null;
  issues: Record<string, string>;
  disk_pct: number | null;
  disk_used_bytes: number | null;
  disk_total_bytes: number | null;
  mem_used_mb: number | null;
  mem_total_mb: number | null;
  load1: number | null;
  cpu_count: number | null;
  uptime_seconds: number | null;
  containers: HostContainer[] | null;
  apps: HostApp[] | null;
  cron_active: boolean | null;
  cron_jobs: { url: string; lastRunAt: number }[] | null;
  web_certs: Record<string, number | null> | null;
};
type Service = {
  id: string;
  name: string;
  kind: "vps_app" | "worker" | "scheduler" | "integration";
  purpose: string;
  stack: string;
  platform: string;
  region: string | null;
  secrets: EnvCheck[];
  configs: EnvCheck[];
  configured: boolean;
  status: string;
  latency_ms?: number | null;
  url_env?: string;
  url?: string | null;
  last_ran_at?: string | null;
  container?: HostContainer | null;
  release?: HostApp | null;
};

const STATUS: Record<string, { label: string; cls: string; icon: React.ReactNode }> = {
  up: {
    label: "ทำงาน",
    cls: "bg-green-50 border-green-200 text-green-700",
    icon: <CheckCircle2 className="h-3.5 w-3.5" />,
  },
  configured: {
    label: "ตั้งค่าแล้ว",
    cls: "bg-green-50 border-green-200 text-green-700",
    icon: <CheckCircle2 className="h-3.5 w-3.5" />,
  },
  stale: {
    label: "ล่าช้า",
    cls: "bg-amber-50 border-amber-200 text-amber-700",
    icon: <AlertTriangle className="h-3.5 w-3.5" />,
  },
  down: {
    label: "ไม่ตอบสนอง",
    cls: "bg-red-50 border-red-200 text-red-700",
    icon: <XCircle className="h-3.5 w-3.5" />,
  },
  not_configured: {
    label: "ยังไม่ตั้งค่า",
    cls: "bg-gray-50 border-gray-200 text-gray-500",
    icon: <Circle className="h-3.5 w-3.5" />,
  },
  missing_config: {
    label: "env ไม่ครบ",
    cls: "bg-amber-50 border-amber-200 text-amber-700",
    icon: <AlertTriangle className="h-3.5 w-3.5" />,
  },
  unknown: {
    label: "ยังไม่มีข้อมูล",
    cls: "bg-gray-50 border-gray-200 text-gray-500",
    icon: <Circle className="h-3.5 w-3.5" />,
  },
};

const KIND_META = {
  vps_app: {
    title: "VPS SG — เว็บ 3 แอป + Caddy",
    icon: <Container className="h-4 w-4" />,
    note: "Docker Compose บนเครื่องเดียวกับเมล · ping โดเมนจริงสด + สถานะ container/RAM/release จาก heartbeat ทุก 5 นาที",
  },
  worker: {
    title: "Cloud Run Workers",
    icon: <Cpu className="h-4 w-4" />,
    note: "งานหนักแยกอิสระ — scale-to-zero, ping /health สด",
  },
  scheduler: {
    title: "Cron (crontab บน VPS)",
    icon: <Clock className="h-4 w-4" />,
    note: "cron บนเครื่องยิงเข้า API ทุก 1 นาที — ล่าช้า/ไม่ตอบ = crontab หรือ container perpos มีปัญหา",
  },
  integration: {
    title: "Integrations",
    icon: <Plug className="h-4 w-4" />,
    note: "บริการภายนอกที่ระบบต่อใช้งาน (เช็คจาก env config)",
  },
} as const;

function StatusBadge({ status }: { status: string }) {
  const s = STATUS[status] ?? STATUS.unknown;
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-xs font-medium ${s.cls}`}
    >
      {s.icon} {s.label}
    </span>
  );
}

export default function SystemPage() {
  const supabase = useMemo(() => createSupabaseBrowserClient(), []);
  const [services, setServices] = useState<Service[]>([]);
  const [vps, setVps] = useState<Vps | null>(null);
  const [checkedAt, setCheckedAt] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      const res = await fetch("/api/admin/system/services", {
        headers: { Authorization: `Bearer ${session?.access_token ?? ""}` },
      });
      const json = await res.json();
      setServices(json?.data?.services ?? []);
      setVps(json?.data?.vps ?? null);
      setCheckedAt(json?.data?.checked_at ?? null);
    } catch {
      /* noop */
    } finally {
      setLoading(false);
    }
  }, [supabase]);

  useEffect(() => {
    void load();
  }, [load]);

  const groups: Array<Service["kind"]> = ["vps_app", "worker", "scheduler", "integration"];

  return (
    <AdminPage
      width="wide"
      title="ระบบ & โครงสร้าง"
      icon={<Server className="h-6 w-6" />}
      description="backend ทั้งหมดที่ระบบต่อใช้งาน — workers, scheduler, integrations พร้อมสถานะสด"
      tabs={<AdminTabs items={SYSTEM_TABS} />}
    >
      {loading && services.length === 0 ? (
        <div className="flex min-h-[40vh] items-center justify-center">
          <Loader2 className="h-6 w-6 animate-spin text-gray-400" />
        </div>
      ) : (
        <div className="space-y-6">
          {checkedAt && (
            <p className="text-xs text-gray-400">
              ตรวจสอบล่าสุด {new Date(checkedAt).toLocaleTimeString("th-TH")}
            </p>
          )}

          {vps && <VpsHostCard vps={vps} />}

          {groups.map((kind) => {
            const list = services.filter((s) => s.kind === kind);
            if (list.length === 0) return null;
            const meta = KIND_META[kind];
            return (
              <AdminCard
                key={kind}
                title={
                  <span className="flex items-center gap-2">
                    {meta.icon} {meta.title}
                  </span>
                }
                bodyClassName="p-0"
              >
                <p className="border-b border-gray-100 px-5 py-2 text-xs text-gray-400">
                  {meta.note}
                </p>
                <div className="divide-y divide-gray-100">
                  {list.map((s) => (
                    <div
                      key={s.id}
                      className="flex flex-col gap-2 px-5 py-4 sm:flex-row sm:items-start sm:justify-between"
                    >
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="font-semibold text-gray-900">{s.name}</span>
                          <StatusBadge status={s.status} />
                          {typeof s.latency_ms === "number" && (
                            <span className="text-xs tabular-nums text-gray-400">
                              {s.latency_ms} ms
                            </span>
                          )}
                        </div>
                        <p className="mt-1 text-sm text-gray-600">{s.purpose}</p>
                        <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-gray-400">
                          <span>
                            {s.platform}
                            {s.region ? ` · ${s.region}` : ""}
                          </span>
                          <span>· {s.stack}</span>
                          {s.kind === "vps_app" && s.container && (
                            <ContainerMeta c={s.container} release={s.release ?? null} />
                          )}
                          {s.kind === "scheduler" && (
                            <Link
                              href="/admin/scheduler"
                              className="text-indigo-500 hover:underline"
                            >
                              ดู Scheduler Monitor →
                            </Link>
                          )}
                        </div>
                      </div>

                      {/* env / config presence */}
                      <div className="flex flex-shrink-0 flex-wrap gap-1.5 sm:max-w-[280px] sm:justify-end">
                        {s.url_env && <EnvPill ok={!!s.configured} label={s.url_env} />}
                        {[...s.secrets, ...s.configs].map((e) => (
                          <EnvPill key={e.key} ok={e.present} label={e.key} />
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              </AdminCard>
            );
          })}

          <p className="text-xs text-gray-400">
            * เพิ่ม backend ใหม่ในอนาคต = เพิ่ม 1 entry ใน <code>REGISTRY</code> ที่{" "}
            <code>api/admin/system/services/route.ts</code> แล้วจะโผล่ที่นี่อัตโนมัติ
          </p>
        </div>
      )}
    </AdminPage>
  );
}

const fmtMb = (b: number) => `${Math.round(b / 1048576).toLocaleString("th-TH")} MB`;
const fmtGb = (b: number) => `${(b / 1073741824).toFixed(1)} GB`;
const ago = (iso: string | null) => {
  if (!iso) return "—";
  const m = Math.round((Date.now() - new Date(iso).getTime()) / 60_000);
  if (m < 1) return "เมื่อกี้";
  if (m < 60) return `${m} นาทีก่อน`;
  const h = Math.floor(m / 60);
  if (h < 48) return `${h} ชม.ก่อน`;
  return `${Math.floor(h / 24)} วันก่อน`;
};
const fmtUptime = (sec: number) => {
  const d = Math.floor(sec / 86400);
  const h = Math.floor((sec % 86400) / 3600);
  return d > 0 ? `${d} วัน ${h} ชม.` : `${h} ชม.`;
};

/** สถานะ container + release ใต้ชื่อแอป (จาก heartbeat) */
function ContainerMeta({ c, release }: { c: HostContainer; release: HostApp | null }) {
  const running = c.state === "running";
  const memPct =
    c.memUsedBytes !== null && c.memLimitBytes
      ? Math.round((c.memUsedBytes / c.memLimitBytes) * 100)
      : null;
  return (
    <>
      <span className={running ? "text-green-600" : "text-red-600"}>
        · container {c.state ?? "?"}
        {c.oomKilled ? " (OOM-killed)" : ""}
      </span>
      {c.memUsedBytes !== null && (
        <span className={memPct !== null && memPct >= 90 ? "text-red-600" : ""}>
          · RAM {fmtMb(c.memUsedBytes)}
          {c.memLimitBytes ? ` / ${fmtMb(c.memLimitBytes)} (${memPct}%)` : ""}
        </span>
      )}
      {c.startedAt && <span>· เริ่ม {ago(c.startedAt)}</span>}
      {(c.restarts ?? 0) > 0 && (
        <span className={c.restartDelta > 0 ? "text-red-600" : "text-amber-600"}>
          · restart เอง {c.restarts} ครั้ง{c.restartDelta > 0 ? ` (+${c.restartDelta} ล่าสุด)` : ""}
        </span>
      )}
      {release && (
        <span className={release.exists === false ? "text-red-600" : ""}>
          · release <code>{release.release ?? "?"}</code>
          {release.sha ? <code> {release.sha.slice(0, 7)}</code> : ""}
          {release.currentChangedAt
            ? ` (deploy ${ago(new Date(release.currentChangedAt * 1000).toISOString())})`
            : ""}
          {release.exists === false ? " — ปลายทางหาย!" : ""}
        </span>
      )}
    </>
  );
}

/** ทรัพยากรเครื่อง VPS จาก heartbeat แถวล่าสุด + ปัญหาที่ตัวเฝ้า (scheduler t5) เห็นอยู่ */
function VpsHostCard({ vps }: { vps: Vps }) {
  const issues = Object.entries(vps.issues ?? {});
  const beatMin = vps.heartbeat_at
    ? Math.round((Date.now() - new Date(vps.heartbeat_at).getTime()) / 60_000)
    : null;
  const stale = beatMin === null || beatMin > 15;
  const diskTone =
    vps.disk_pct === null
      ? "neutral"
      : vps.disk_pct >= 85
        ? "negative"
        : vps.disk_pct >= 70
          ? "warning"
          : "positive";
  const memPct =
    vps.mem_used_mb !== null && vps.mem_total_mb
      ? Math.round((vps.mem_used_mb / vps.mem_total_mb) * 100)
      : null;
  const memTone =
    memPct === null ? "neutral" : memPct >= 90 ? "negative" : memPct >= 75 ? "warning" : "positive";
  const loadRatio = vps.load1 !== null && vps.cpu_count ? vps.load1 / vps.cpu_count : null;
  const loadTone =
    loadRatio === null
      ? "neutral"
      : loadRatio >= 1
        ? "negative"
        : loadRatio >= 0.7
          ? "warning"
          : "positive";
  return (
    <AdminCard
      title={
        <span className="flex items-center gap-2">
          <Server className="h-4 w-4" /> เครื่อง VPS SG (62.146.233.27)
        </span>
      }
      bodyClassName="p-0"
    >
      <p className="border-b border-gray-100 px-5 py-2 text-xs text-gray-400">
        Contabo Cloud VPS 4 · 4 vCPU / 8 GB · รัน perpos + exapp + riekchang + Caddy + Stalwart ·
        heartbeat ล่าสุด{" "}
        <span className={stale ? "font-medium text-red-600" : ""}>
          {beatMin === null ? "ยังไม่เคยได้รับ" : `${beatMin} นาทีก่อน`}
        </span>
        {vps.uptime_seconds !== null && <> · เครื่องเปิดมา {fmtUptime(vps.uptime_seconds)}</>} ·{" "}
        <Link href="/admin/mail?tab=server" className="text-indigo-500 hover:underline">
          กราฟย้อนหลัง →
        </Link>
      </p>
      <div className="grid grid-cols-1 gap-3 p-5 sm:grid-cols-3">
        <StatCard
          icon={<HardDrive className="h-4 w-4" />}
          label="ดิสก์"
          value={vps.disk_pct !== null ? `${vps.disk_pct}%` : "—"}
          sub={
            vps.disk_used_bytes !== null && vps.disk_total_bytes !== null
              ? `${fmtGb(vps.disk_used_bytes)} / ${fmtGb(vps.disk_total_bytes)} · เตือนที่ 85%`
              : undefined
          }
          tone={diskTone}
          valueColored
        />
        <StatCard
          icon={<MemoryStick className="h-4 w-4" />}
          label="RAM (ไม่รวม cache)"
          value={memPct !== null ? `${memPct}%` : "—"}
          sub={
            vps.mem_used_mb !== null && vps.mem_total_mb !== null
              ? `${vps.mem_used_mb.toLocaleString("th-TH")} / ${vps.mem_total_mb.toLocaleString("th-TH")} MB`
              : undefined
          }
          tone={memTone}
          valueColored
        />
        <StatCard
          icon={<Gauge className="h-4 w-4" />}
          label="โหลด (1 นาที)"
          value={vps.load1 !== null ? vps.load1.toFixed(2) : "—"}
          sub={vps.cpu_count ? `จาก ${vps.cpu_count} vCPU` : undefined}
          tone={loadTone}
          valueColored
        />
      </div>
      {(vps.cron_jobs || vps.web_certs) && (
        <div className="grid grid-cols-1 gap-4 border-t border-gray-100 px-5 py-3 text-xs sm:grid-cols-2">
          {vps.cron_jobs && (
            <div>
              <p className="mb-1 font-medium text-gray-700">
                cron บนเครื่อง{" "}
                <span className={vps.cron_active === false ? "text-red-600" : "text-green-600"}>
                  ({vps.cron_active === false ? "daemon หยุด!" : "daemon ทำงาน"})
                </span>
              </p>
              <ul className="space-y-0.5 text-gray-500">
                {vps.cron_jobs.length === 0 && (
                  <li>ยังไม่เห็นงานถูกสั่งรันใน journal 26 ชม.ที่ผ่านมา</li>
                )}
                {[...vps.cron_jobs]
                  .sort((a, b) => b.lastRunAt - a.lastRunAt)
                  .map((j) => (
                    <li key={j.url} className="flex justify-between gap-3">
                      <code className="truncate">{j.url.replace("http://127.0.0.1:", ":")}</code>
                      <span className="shrink-0">
                        สั่งรัน {ago(new Date(j.lastRunAt * 1000).toISOString())}
                      </span>
                    </li>
                  ))}
              </ul>
              <p className="mt-1 text-[10px] text-gray-400">
                journal บอกแค่ว่าถูกเรียก — ผลจริงของ perpos ดูที่ Scheduler Monitor
              </p>
            </div>
          )}
          {vps.web_certs && (
            <div>
              <p className="mb-1 font-medium text-gray-700">
                ใบรับรอง TLS ที่ Caddy origin (ข้าม Cloudflare)
              </p>
              <ul className="space-y-0.5 text-gray-500">
                {Object.entries(vps.web_certs).map(([d, days]) => (
                  <li key={d} className="flex justify-between gap-3">
                    <code>{d}</code>
                    <span
                      className={days === null ? "text-red-600" : days < 14 ? "text-amber-600" : ""}
                    >
                      {days === null ? "ต่อไม่ได้" : `เหลือ ${days} วัน`}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
      {issues.length > 0 && (
        <div className="border-t border-gray-100 px-5 py-3">
          <p className="mb-1.5 text-xs font-medium text-red-600">
            ปัญหาที่ตัวเฝ้าเห็นอยู่ ({issues.length}) — แจ้ง LINE แล้ว
            {vps.last_check_at ? ` · ตรวจล่าสุด ${ago(vps.last_check_at)}` : ""}
          </p>
          <ul className="space-y-1 text-sm text-gray-700">
            {issues.map(([k, msg]) => (
              <li key={k} className="flex gap-2">
                <XCircle className="mt-0.5 h-4 w-4 flex-shrink-0 text-red-500" />
                <span>{msg}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
      {issues.length === 0 && vps.last_check_at && (
        <p className="flex items-center gap-1.5 border-t border-gray-100 px-5 py-2 text-xs text-green-600">
          <CheckCircle2 className="h-3.5 w-3.5" /> ตัวเฝ้าไม่พบปัญหา (ตรวจล่าสุด{" "}
          {ago(vps.last_check_at)})
        </p>
      )}
    </AdminCard>
  );
}

function EnvPill({ ok, label }: { ok: boolean; label: string }) {
  return (
    <span
      title={ok ? "ตั้งค่าแล้ว" : "ยังไม่ได้ตั้ง env นี้"}
      className={`inline-flex items-center gap-1 rounded border px-1.5 py-0.5 font-mono text-[10px] ${
        ok ? "border-green-200 bg-green-50 text-green-600" : "border-red-200 bg-red-50 text-red-600"
      }`}
    >
      {ok ? <CheckCircle2 className="h-3 w-3" /> : <XCircle className="h-3 w-3" />}
      {label}
    </span>
  );
}
