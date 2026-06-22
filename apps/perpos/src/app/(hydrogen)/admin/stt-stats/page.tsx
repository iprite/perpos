"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { BarChart3, Users, Clock, FileAudio, Loader2, Settings } from "lucide-react";
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, CartesianGrid } from "recharts";
import { toast } from "@/lib/toast";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import { StatCard } from "@/components/ui/stat-card";
import { AdminPage } from "../_components/admin-page";

type AdminStats = {
  users: { total: number; active: number; claimed: number };
  totals: { jobs: number; completed: number; failed: number; minutes: number };
  by_source: { web: { jobs: number; minutes: number }; line: { jobs: number; minutes: number } };
  daily: { date: string; jobs: number; minutes: number }[];
  top_users: { display_name: string; minutes: number; jobs: number }[];
};

async function authToken(): Promise<string> {
  const supabase = createSupabaseBrowserClient();
  const { data } = await supabase.auth.getSession();
  return data.session?.access_token ?? "";
}

export default function AdminSttStatsPage() {
  const [s, setS] = useState<AdminStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [defaultMin, setDefaultMin] = useState("");
  const [defaultBotMin, setDefaultBotMin] = useState("");
  const [savingDefault, setSavingDefault] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [statsRes, settingsRes] = await Promise.all([
        fetch("/api/admin/stt-stats", {
          headers: { Authorization: `Bearer ${await authToken()}` },
        }),
        fetch("/api/admin/stt-settings", {
          headers: { Authorization: `Bearer ${await authToken()}` },
        }),
      ]);
      if (statsRes.ok) setS((await statsRes.json()).data as AdminStats);
      if (settingsRes.ok) {
        const d = (await settingsRes.json()).data;
        setDefaultMin(String(Math.floor((d?.default_quota_seconds ?? 18000) / 60)));
        setDefaultBotMin(String(Math.floor((d?.default_bot_quota_seconds ?? 7200) / 60)));
      }
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => {
    load();
  }, [load]);

  const saveDefault = async () => {
    const m = parseInt(defaultMin, 10);
    const bm = parseInt(defaultBotMin, 10);
    if (isNaN(m) || m < 0 || isNaN(bm) || bm < 0) {
      toast.error("ระบุจำนวนนาทีให้ถูกต้อง");
      return;
    }
    setSavingDefault(true);
    try {
      const res = await fetch("/api/admin/stt-settings", {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${await authToken()}`,
        },
        body: JSON.stringify({ defaultQuotaSeconds: m * 60, defaultBotQuotaSeconds: bm * 60 }),
      });
      if (!res.ok) throw new Error();
      toast.success("บันทึกโควต้าเริ่มต้นแล้ว");
    } catch {
      toast.error("บันทึกไม่สำเร็จ");
    } finally {
      setSavingDefault(false);
    }
  };

  return (
    <AdminPage
      title="สถิติแกะเสียง (ภาพรวม)"
      icon={<BarChart3 className="h-6 w-6" />}
      actions={
        <>
          <Link href="/admin/stt-jobs">
            <Button variant="outline" size="sm">
              งานแกะเสียง
            </Button>
          </Link>
          <Link href="/admin/users">
            <Button variant="outline" size="sm">
              จัดการผู้ใช้
            </Button>
          </Link>
          <Link href="/admin/stt-cost">
            <Button variant="outline" size="sm">
              ต้นทุน
            </Button>
          </Link>
        </>
      }
    >
      {loading ? (
        <div className="flex min-h-[40vh] items-center justify-center">
          <Loader2 className="h-6 w-6 animate-spin text-gray-400" />
        </div>
      ) : !s ? (
        <p className="py-10 text-center text-sm text-gray-400">โหลดข้อมูลไม่สำเร็จ</p>
      ) : (
        <div className="space-y-6">
          <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
            <StatCard
              icon={<Users className="h-4 w-4" />}
              label="ผู้ใช้ LINE"
              value={String(s.users.total)}
              sub={`${s.users.active} ใช้งาน · ${s.users.claimed} เคลมแล้ว`}
              tone="info"
            />
            <StatCard
              icon={<FileAudio className="h-4 w-4" />}
              label="งานทั้งหมด (30 วัน)"
              value={String(s.totals.jobs)}
              sub={`สำเร็จ ${s.totals.completed} · ล้ม ${s.totals.failed}`}
              tone="primary"
            />
            <StatCard
              icon={<Clock className="h-4 w-4" />}
              label="นาทีที่ประมวลผล"
              value={String(s.totals.minutes)}
              tone="warning"
            />
            <StatCard
              icon={<BarChart3 className="h-4 w-4" />}
              label="เว็บ / LINE (นาที)"
              value={`${s.by_source.web.minutes} / ${s.by_source.line.minutes}`}
              tone="positive"
            />
          </div>

          <div className="rounded-2xl border border-gray-100 bg-white p-5 shadow-sm">
            <h3 className="mb-3 flex items-center gap-2 text-sm font-semibold text-gray-700">
              <Settings className="h-4 w-4 text-gray-400" /> โควต้าเริ่มต้นผู้ใช้ใหม่
            </h3>
            <p className="mb-3 text-xs text-gray-500">
              ผู้ใช้ LINE ที่แอด OA ใหม่จะได้รับโควต้าเหล่านี้โดยอัตโนมัติ
            </p>
            <div className="flex flex-wrap items-end gap-3">
              <div>
                <Label htmlFor="default-quota">ถอดเสียง (นาที)</Label>
                <Input
                  id="default-quota"
                  type="number"
                  value={defaultMin}
                  onChange={(e) => setDefaultMin(e.target.value)}
                  className="mt-1 w-36"
                />
              </div>
              <div>
                <Label htmlFor="default-bot-quota">บอทประชุม (นาที)</Label>
                <Input
                  id="default-bot-quota"
                  type="number"
                  value={defaultBotMin}
                  onChange={(e) => setDefaultBotMin(e.target.value)}
                  className="mt-1 w-36"
                />
              </div>
              <Button onClick={saveDefault} disabled={savingDefault}>
                {savingDefault ? "กำลังบันทึก…" : "บันทึก"}
              </Button>
            </div>
          </div>

          <div className="rounded-2xl border border-gray-100 bg-white p-5 shadow-sm">
            <h3 className="mb-4 text-sm font-semibold text-gray-700">
              นาทีที่ประมวลผล — 30 วันล่าสุด
            </h3>
            <ResponsiveContainer width="100%" height={240}>
              <BarChart data={s.daily} margin={{ top: 4, right: 4, left: -20, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#F5F7FA" vertical={false} />
                <XAxis
                  dataKey="date"
                  tick={{ fontSize: 10, fill: "#9ca3af" }}
                  tickFormatter={(d) => String(d).slice(5)}
                  interval={4}
                />
                <YAxis tick={{ fontSize: 10, fill: "#9ca3af" }} allowDecimals={false} />
                <Tooltip
                  labelFormatter={(d) => `วันที่ ${d}`}
                  formatter={(v: number) => [`${v} นาที`, "ประมวลผล"]}
                />
                <Bar dataKey="minutes" fill="#4FC1E9" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>

          <div className="rounded-2xl border border-gray-100 bg-white p-5 shadow-sm">
            <h3 className="mb-3 text-sm font-semibold text-gray-700">
              ผู้ใช้ที่ใช้งานสูงสุด (Top 10)
            </h3>
            {s.top_users.length === 0 ? (
              <p className="py-6 text-center text-sm text-gray-400">ยังไม่มีข้อมูล</p>
            ) : (
              <div className="divide-y divide-gray-100">
                {s.top_users.map((u, i) => (
                  <div key={i} className="flex items-center justify-between py-2.5 text-sm">
                    <div className="flex items-center gap-3">
                      <span className="flex h-6 w-6 items-center justify-center rounded-full bg-indigo-50 text-xs font-bold text-indigo-600">
                        {i + 1}
                      </span>
                      <span className="text-gray-800">{u.display_name}</span>
                    </div>
                    <span className="tabular-nums text-gray-500">
                      {u.minutes} นาที · {u.jobs} งาน
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </AdminPage>
  );
}
