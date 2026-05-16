"use client";

import React, { useCallback, useEffect, useMemo, useState } from "react";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import { ClipboardList, CalendarDays, CheckCircle2, Clock, RefreshCw, CalendarCheck } from "lucide-react";
import cn from "@core/utils/class-names";

// ─── Types ───────────────────────────────────────────────────────────────────

type Task = {
  id: string;
  title: string;
  status: string;
  created_at: string;
  completed_at: string | null;
};

type Appointment = {
  id: string;
  title: string;
  starts_at: string;
  google_event_id: string | null;
  created_at: string;
};

// ─── Helpers ─────────────────────────────────────────────────────────────────

const BKK = "Asia/Bangkok";

function fmtTime(iso: string) {
  return new Intl.DateTimeFormat("th-TH", { timeZone: BKK, hour: "2-digit", minute: "2-digit", hour12: false }).format(new Date(iso));
}

function fmtDate(iso: string) {
  return new Intl.DateTimeFormat("th-TH", { timeZone: BKK, day: "numeric", month: "short" }).format(new Date(iso));
}

function fmtDateFull(iso: string) {
  return new Intl.DateTimeFormat("th-TH", { timeZone: BKK, weekday: "short", day: "numeric", month: "short", year: "numeric" }).format(new Date(iso));
}

function bkkDateStr(iso: string) {
  return new Intl.DateTimeFormat("en-CA", { timeZone: BKK }).format(new Date(iso));
}

function isToday(iso: string) {
  return bkkDateStr(iso) === new Intl.DateTimeFormat("en-CA", { timeZone: BKK }).format(new Date());
}

function isTomorrow(iso: string) {
  return bkkDateStr(iso) === new Intl.DateTimeFormat("en-CA", { timeZone: BKK }).format(new Date(Date.now() + 86400000));
}

function isPast(iso: string) {
  return new Date(iso).getTime() < Date.now();
}

// ─── Stat card ───────────────────────────────────────────────────────────────

function StatCard({ label, value, icon, color }: { label: string; value: number; icon: React.ReactNode; color: string }) {
  return (
    <div className="flex items-center gap-4 rounded-2xl border border-gray-100 bg-white p-5 shadow-sm">
      <div className={cn("flex h-11 w-11 shrink-0 items-center justify-center rounded-xl", color)}>
        {icon}
      </div>
      <div>
        <div className="text-2xl font-bold text-gray-900">{value}</div>
        <div className="text-sm text-gray-500">{label}</div>
      </div>
    </div>
  );
}

// ─── Task row ────────────────────────────────────────────────────────────────

function TaskRow({ task, onDone }: { task: Task; onDone: (id: string) => void }) {
  const [marking, setMarking] = useState(false);
  return (
    <div className="flex items-center justify-between gap-3 rounded-xl border border-gray-100 bg-white px-4 py-3">
      <div className="flex min-w-0 items-center gap-3">
        <div className="h-2 w-2 shrink-0 rounded-full bg-blue-400" />
        <span className="truncate text-sm font-medium text-gray-800">{task.title}</span>
      </div>
      <button
        type="button"
        disabled={marking}
        onClick={() => { setMarking(true); onDone(task.id); }}
        className="shrink-0 rounded-lg border border-green-200 bg-green-50 px-3 py-1 text-xs font-medium text-green-700 hover:bg-green-100 disabled:opacity-50"
      >
        ✅ เสร็จ
      </button>
    </div>
  );
}

// ─── Appointment row ──────────────────────────────────────────────────────────

function ApptRow({ appt }: { appt: Appointment }) {
  const past     = isPast(appt.starts_at);
  const today    = isToday(appt.starts_at);
  const tomorrow = isTomorrow(appt.starts_at);

  const dateBadge = today
    ? <span className="rounded-md bg-indigo-100 px-2 py-0.5 text-xs font-semibold text-indigo-700">วันนี้</span>
    : tomorrow
    ? <span className="rounded-md bg-amber-100 px-2 py-0.5 text-xs font-semibold text-amber-700">พรุ่งนี้</span>
    : null;

  const dateParts = fmtDate(appt.starts_at).split(" ");

  return (
    <div className={cn("flex items-center gap-3 rounded-xl border px-4 py-3", past ? "border-gray-100 bg-gray-50 opacity-60" : "border-gray-100 bg-white")}>
      <div className="flex h-11 w-11 shrink-0 flex-col items-center justify-center rounded-lg bg-indigo-50">
        <span className="text-sm font-bold leading-none text-indigo-600">{dateParts[0]}</span>
        <span className="mt-0.5 text-[10px] leading-none text-indigo-400">{dateParts[1]}</span>
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="truncate text-sm font-medium text-gray-800">{appt.title}</span>
          {dateBadge}
          {appt.google_event_id && (
            <CalendarCheck className="h-3.5 w-3.5 shrink-0 text-green-500" />
          )}
        </div>
        <div className="mt-0.5 text-xs text-gray-400">
          {fmtDateFull(appt.starts_at)} &middot; {fmtTime(appt.starts_at)}
        </div>
      </div>
    </div>
  );
}

// ─── Main page ───────────────────────────────────────────────────────────────

type Tab = "tasks" | "appointments";

export default function AssistantPage() {
  const supabase = useMemo(() => createSupabaseBrowserClient(), []);
  const [tab, setTab]                   = useState<Tab>("tasks");
  const [tasks, setTasks]               = useState<Task[]>([]);
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [loading, setLoading]           = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { setLoading(false); return; }

    const [taskRes, apptRes] = await Promise.all([
      supabase.from("tasks").select("id,title,status,created_at,completed_at").eq("profile_id", user.id).order("created_at", { ascending: false }),
      supabase.from("appointments").select("id,title,starts_at,google_event_id,created_at").eq("profile_id", user.id).order("starts_at", { ascending: true }),
    ]);

    setTasks((taskRes.data ?? []) as Task[]);
    setAppointments((apptRes.data ?? []) as Appointment[]);
    setLoading(false);
  }, [supabase]);

  useEffect(() => { void load(); }, [load]);

  const markDone = useCallback(async (id: string) => {
    await supabase.from("tasks").update({ status: "completed", completed_at: new Date().toISOString() }).eq("id", id);
    setTasks((prev) => prev.map((t) => t.id === id ? { ...t, status: "completed", completed_at: new Date().toISOString() } : t));
  }, [supabase]);

  const onProcessTasks = tasks.filter((t) => t.status === "pending" || t.status === "in_progress");
  const doneTasks      = tasks.filter((t) => t.status === "completed");
  const todayAppts     = appointments.filter((a) => isToday(a.starts_at));
  const upcomingAppts  = appointments.filter((a) => !isPast(a.starts_at) && !isToday(a.starts_at));
  const pastAppts      = appointments.filter((a) => isPast(a.starts_at) && !isToday(a.starts_at));

  return (
    <div className="mx-auto max-w-2xl space-y-6 p-4 pb-16">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-gray-900">AI Task Manager</h1>
          <p className="mt-0.5 text-sm text-gray-500">จัดการงานและนัดหมายผ่าน LINE Bot</p>
        </div>
        <button
          type="button"
          onClick={() => void load()}
          disabled={loading}
          className="flex items-center gap-1.5 rounded-lg border border-gray-200 px-3 py-1.5 text-sm text-gray-500 hover:bg-gray-50 disabled:opacity-50"
        >
          <RefreshCw className={cn("h-3.5 w-3.5", loading && "animate-spin")} />
          รีเฟรช
        </button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatCard label="งานค้าง"  value={onProcessTasks.length} icon={<ClipboardList className="h-5 w-5 text-blue-600"   />} color="bg-blue-50"   />
        <StatCard label="เสร็จแล้ว" value={doneTasks.length}      icon={<CheckCircle2   className="h-5 w-5 text-green-600"  />} color="bg-green-50"  />
        <StatCard label="นัดวันนี้"  value={todayAppts.length}     icon={<CalendarDays   className="h-5 w-5 text-indigo-600" />} color="bg-indigo-50" />
        <StatCard label="นัดหน้า"   value={upcomingAppts.length}   icon={<Clock          className="h-5 w-5 text-amber-600"  />} color="bg-amber-50"  />
      </div>

      {/* Tabs */}
      <div className="flex rounded-xl border border-gray-200 bg-gray-50 p-1">
        {([["tasks", "งาน", <ClipboardList key="t" className="h-4 w-4" />, onProcessTasks.length, "blue"],
           ["appointments", "นัดหมาย", <CalendarDays key="a" className="h-4 w-4" />, todayAppts.length, "indigo"]] as const).map(([id, label, icon, badge, badgeColor]) => (
          <button
            key={id}
            type="button"
            onClick={() => setTab(id as Tab)}
            className={cn(
              "flex flex-1 items-center justify-center gap-2 rounded-lg py-2 text-sm font-medium transition-colors",
              tab === id ? "bg-white text-gray-900 shadow-sm" : "text-gray-500 hover:text-gray-700",
            )}
          >
            {icon}
            {label}
            {badge > 0 && (
              <span className={cn("rounded-full px-1.5 py-0.5 text-xs font-semibold",
                badgeColor === "blue"   ? "bg-blue-100 text-blue-700"   :
                badgeColor === "indigo" ? "bg-indigo-100 text-indigo-700" : ""
              )}>
                {badge}
              </span>
            )}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="py-12 text-center text-sm text-gray-400">กำลังโหลด…</div>
      ) : tab === "tasks" ? (
        <div className="space-y-5">
          <section>
            <h2 className="mb-3 text-xs font-semibold uppercase tracking-wide text-gray-400">กำลังดำเนินการ</h2>
            {onProcessTasks.length === 0 ? (
              <div className="rounded-xl border border-dashed border-gray-200 py-10 text-center text-sm text-gray-400">
                ไม่มีงานค้าง ✅
              </div>
            ) : (
              <div className="space-y-2">
                {onProcessTasks.map((t) => <TaskRow key={t.id} task={t} onDone={markDone} />)}
              </div>
            )}
          </section>

          {doneTasks.length > 0 && (
            <section>
              <h2 className="mb-3 text-xs font-semibold uppercase tracking-wide text-gray-400">เสร็จแล้ว ({doneTasks.length})</h2>
              <div className="space-y-2">
                {doneTasks.slice(0, 10).map((t) => (
                  <div key={t.id} className="flex items-center gap-3 rounded-xl border border-gray-100 bg-gray-50 px-4 py-3 opacity-60">
                    <CheckCircle2 className="h-4 w-4 shrink-0 text-green-500" />
                    <span className="truncate text-sm text-gray-500 line-through">{t.title}</span>
                  </div>
                ))}
              </div>
            </section>
          )}

          <section className="rounded-2xl border border-blue-100 bg-blue-50 p-4 text-sm text-blue-800">
            <div className="font-semibold">คำสั่ง LINE Bot — งาน</div>
            <div className="mt-2 space-y-1 font-mono text-xs">
              <div><span className="font-bold">/t</span> ประชุม Q3 &nbsp;— บันทึกงานใหม่</div>
              <div><span className="font-bold">/งาน</span> &nbsp;— ดูงานค้าง</div>
              <div><span className="font-bold">/เสร็จ 1</span> &nbsp;— ปิดงานที่ 1</div>
            </div>
          </section>
        </div>
      ) : (
        <div className="space-y-5">
          {todayAppts.length > 0 && (
            <section>
              <h2 className="mb-3 text-xs font-semibold uppercase tracking-wide text-indigo-500">วันนี้</h2>
              <div className="space-y-2">{todayAppts.map((a) => <ApptRow key={a.id} appt={a} />)}</div>
            </section>
          )}

          {upcomingAppts.length > 0 && (
            <section>
              <h2 className="mb-3 text-xs font-semibold uppercase tracking-wide text-gray-400">กำลังจะถึง</h2>
              <div className="space-y-2">{upcomingAppts.map((a) => <ApptRow key={a.id} appt={a} />)}</div>
            </section>
          )}

          {todayAppts.length === 0 && upcomingAppts.length === 0 && (
            <div className="rounded-xl border border-dashed border-gray-200 py-12 text-center text-sm text-gray-400">
              ยังไม่มีนัดที่กำลังจะถึง
            </div>
          )}

          {pastAppts.length > 0 && (
            <section>
              <h2 className="mb-3 text-xs font-semibold uppercase tracking-wide text-gray-300">ผ่านไปแล้ว</h2>
              <div className="space-y-2">{[...pastAppts].reverse().slice(0, 5).map((a) => <ApptRow key={a.id} appt={a} />)}</div>
            </section>
          )}

          <section className="rounded-2xl border border-indigo-100 bg-indigo-50 p-4 text-sm text-indigo-800">
            <div className="font-semibold">คำสั่ง LINE Bot — นัดหมาย</div>
            <div className="mt-2 space-y-1 font-mono text-xs">
              <div><span className="font-bold">/a</span> ประชุม Q3 พรุ่งนี้ 10:00</div>
              <div><span className="font-bold">/a</span> call client 20/5 14:30</div>
              <div><span className="font-bold">/นัดวันนี้</span> &nbsp;— ดูนัดวันนี้</div>
            </div>
          </section>
        </div>
      )}
    </div>
  );
}
