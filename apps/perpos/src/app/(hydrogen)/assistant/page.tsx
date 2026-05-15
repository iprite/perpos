"use client";

import React, { useCallback, useEffect, useState } from "react";
import { Title, Text } from "rizzui/typography";
import { CheckCircle, Clock, AlertTriangle, ListTodo, RefreshCw, ChevronDown } from "lucide-react";

import { createSupabaseBrowserClient } from "@/lib/supabase/client";

type Status = "pending" | "in_progress" | "completed" | "cancelled" | "postponed";
type Priority = "low" | "medium" | "high" | "urgent";

interface Task {
  id: string;
  title: string;
  description: string | null;
  status: Status;
  priority: Priority;
  due_at: string | null;
  created_at: string;
}

const STATUS_LABEL: Record<Status, string> = {
  pending: "รอดำเนินการ",
  in_progress: "กำลังทำ",
  completed: "เสร็จแล้ว",
  cancelled: "ยกเลิก",
  postponed: "เลื่อน",
};

const PRIORITY_LABEL: Record<Priority, string> = {
  low: "ต่ำ",
  medium: "ปานกลาง",
  high: "สูง",
  urgent: "ด่วนมาก",
};

const PRIORITY_COLOR: Record<Priority, string> = {
  low: "bg-gray-100 text-gray-600",
  medium: "bg-blue-50 text-blue-700",
  high: "bg-orange-50 text-orange-700",
  urgent: "bg-red-50 text-red-700",
};

const STATUS_COLOR: Record<Status, string> = {
  pending: "bg-yellow-50 text-yellow-700",
  in_progress: "bg-blue-50 text-blue-700",
  completed: "bg-green-50 text-green-700",
  cancelled: "bg-gray-100 text-gray-500",
  postponed: "bg-purple-50 text-purple-700",
};

function fmtDateTime(iso: string) {
  return new Intl.DateTimeFormat("th-TH", {
    timeZone: "Asia/Bangkok",
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(new Date(iso));
}

function isOverdue(task: Task) {
  if (!task.due_at || task.status === "completed" || task.status === "cancelled") return false;
  return new Date(task.due_at) < new Date();
}

function StatCard({ icon, label, count, color }: { icon: React.ReactNode; label: string; count: number; color: string }) {
  return (
    <div className={`rounded-2xl border p-4 ${color}`}>
      <div className="flex items-center gap-2">
        {icon}
        <span className="text-sm font-medium">{label}</span>
      </div>
      <div className="mt-2 text-2xl font-bold">{count}</div>
    </div>
  );
}

export default function AssistantPage() {
  const supabase = createSupabaseBrowserClient();
  const [tasks, setTasks] = useState<Task[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<"all" | "pending" | "completed">("pending");
  const [updating, setUpdating] = useState<string | null>(null);

  const loadTasks = useCallback(async () => {
    setLoading(true);
    const q = supabase
      .from("tasks")
      .select("id,title,description,status,priority,due_at,created_at")
      .order("due_at", { ascending: true, nullsFirst: false });
    if (filter === "pending") q.in("status", ["pending", "in_progress"]);
    else if (filter === "completed") q.in("status", ["completed", "cancelled", "postponed"]);
    const { data } = await q;
    setTasks((data ?? []) as Task[]);
    setLoading(false);
  }, [supabase, filter]);

  useEffect(() => { loadTasks(); }, [loadTasks]);

  async function markDone(id: string) {
    setUpdating(id);
    await supabase.from("tasks").update({ status: "completed", completed_at: new Date().toISOString() }).eq("id", id);
    await loadTasks();
    setUpdating(null);
  }

  async function markPostpone(id: string, currentDue: string | null) {
    setUpdating(id);
    const base = currentDue ? new Date(currentDue).getTime() : Date.now();
    const newDue = new Date(base + 24 * 60 * 60 * 1000).toISOString();
    const newRemind = new Date(new Date(newDue).getTime() - 15 * 60 * 1000).toISOString();
    await supabase.from("tasks").update({ due_at: newDue, remind_at: newRemind, follow_up_sent_at: null }).eq("id", id);
    await loadTasks();
    setUpdating(null);
  }

  const pending = tasks.filter((t) => t.status === "pending" || t.status === "in_progress");
  const completed = tasks.filter((t) => t.status === "completed");
  const overdue = tasks.filter(isOverdue);

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between">
        <div>
          <Title as="h1" className="text-lg font-semibold text-gray-900">
            AI Task Manager
          </Title>
          <Text className="mt-1 text-sm text-gray-500">
            จัดการงานผ่าน LINE Bot — พิมพ์ข้อความธรรมดาเพื่อบันทึกงานใหม่
          </Text>
        </div>
        <button
          onClick={loadTasks}
          disabled={loading}
          className="flex items-center gap-1.5 rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-sm text-gray-600 hover:bg-gray-50 disabled:opacity-50"
        >
          <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
          รีเฟรช
        </button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatCard icon={<ListTodo className="h-4 w-4" />} label="รอดำเนินการ" count={pending.length} color="border-yellow-200 bg-yellow-50 text-yellow-800" />
        <StatCard icon={<CheckCircle className="h-4 w-4" />} label="เสร็จแล้ว" count={completed.length} color="border-green-200 bg-green-50 text-green-800" />
        <StatCard icon={<AlertTriangle className="h-4 w-4" />} label="งานค้าง" count={overdue.length} color="border-red-200 bg-red-50 text-red-800" />
        <StatCard icon={<Clock className="h-4 w-4" />} label="ทั้งหมด" count={tasks.length} color="border-gray-200 bg-white text-gray-700" />
      </div>

      {/* Filter tabs */}
      <div className="flex gap-2 border-b border-gray-200">
        {(["pending", "all", "completed"] as const).map((f) => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={`border-b-2 px-4 py-2 text-sm font-medium transition-colors ${filter === f ? "border-blue-600 text-blue-600" : "border-transparent text-gray-500 hover:text-gray-700"}`}
          >
            {f === "pending" ? "กำลังดำเนินการ" : f === "completed" ? "เสร็จแล้ว" : "ทั้งหมด"}
          </button>
        ))}
      </div>

      {/* Task list */}
      {loading ? (
        <div className="py-12 text-center text-sm text-gray-400">กำลังโหลด...</div>
      ) : tasks.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-gray-200 py-16 text-center">
          <ListTodo className="mx-auto h-8 w-8 text-gray-300" />
          <p className="mt-3 text-sm text-gray-400">ยังไม่มีงาน</p>
          <p className="mt-1 text-xs text-gray-400">ส่งข้อความไปที่ LINE Bot เพื่อบันทึกงานใหม่</p>
        </div>
      ) : (
        <div className="space-y-2">
          {tasks.map((task) => (
            <div
              key={task.id}
              className={`rounded-2xl border bg-white p-4 shadow-sm transition-opacity ${updating === task.id ? "opacity-50" : ""} ${isOverdue(task) ? "border-red-200" : "border-gray-200"}`}
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${PRIORITY_COLOR[task.priority]}`}>
                      {PRIORITY_LABEL[task.priority]}
                    </span>
                    <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_COLOR[task.status]}`}>
                      {STATUS_LABEL[task.status]}
                    </span>
                    {isOverdue(task) && (
                      <span className="inline-flex items-center gap-1 rounded-full bg-red-50 px-2 py-0.5 text-xs font-medium text-red-600">
                        <AlertTriangle className="h-3 w-3" /> เกินกำหนด
                      </span>
                    )}
                  </div>
                  <p className="mt-1.5 font-medium text-gray-900">{task.title}</p>
                  {task.description && <p className="mt-0.5 text-sm text-gray-500">{task.description}</p>}
                  <div className="mt-2 flex flex-wrap gap-3 text-xs text-gray-400">
                    {task.due_at && (
                      <span className="flex items-center gap-1">
                        <Clock className="h-3 w-3" />
                        กำหนด: {fmtDateTime(task.due_at)}
                      </span>
                    )}
                    <span>บันทึก: {fmtDateTime(task.created_at)}</span>
                  </div>
                </div>

                {(task.status === "pending" || task.status === "in_progress") && (
                  <div className="flex shrink-0 gap-2">
                    <button
                      onClick={() => markDone(task.id)}
                      disabled={!!updating}
                      className="rounded-lg bg-green-50 px-3 py-1.5 text-xs font-medium text-green-700 hover:bg-green-100 disabled:opacity-50"
                    >
                      ✅ เสร็จ
                    </button>
                    <button
                      onClick={() => markPostpone(task.id, task.due_at)}
                      disabled={!!updating}
                      className="flex items-center gap-1 rounded-lg bg-gray-50 px-3 py-1.5 text-xs font-medium text-gray-600 hover:bg-gray-100 disabled:opacity-50"
                    >
                      <ChevronDown className="h-3 w-3" /> เลื่อน
                    </button>
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* LINE Bot usage guide */}
      <div className="rounded-2xl border border-blue-100 bg-blue-50 p-4">
        <p className="text-sm font-semibold text-blue-800">วิธีใช้งานผ่าน LINE Bot</p>
        <div className="mt-2 grid gap-1 text-xs text-blue-700 sm:grid-cols-2">
          <span>• พิมพ์ข้อความธรรมดา เช่น &ldquo;พรุ่งนี้ 10 โมงประชุม&rdquo; → บันทึกงานอัตโนมัติ</span>
          <span>• พิมพ์ <strong>งาน</strong> → ดูรายการงานทั้งหมด</span>
          <span>• พิมพ์ <strong>เสร็จ 1</strong> → ปิดงานที่ 1</span>
          <span>• พิมพ์ <strong>เลื่อน 1</strong> → เลื่อนงานที่ 1 ออกไป 1 วัน</span>
          <span>• พิมพ์ <strong>งานค้าง</strong> → ดูงานที่เกินกำหนด</span>
          <span>• บอทจะแจ้งเตือนอัตโนมัติตามเวลาที่กำหนด</span>
        </div>
      </div>
    </div>
  );
}
