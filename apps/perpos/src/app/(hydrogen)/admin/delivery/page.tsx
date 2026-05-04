"use client";

import React, { useCallback, useMemo, useState } from "react";
import { Button, Input, Textarea } from "rizzui";
import { Title, Text } from "rizzui/typography";

import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import { withBasePath } from "@/utils/base-path";

type DeliveryLog = {
  id: string;
  profile_id: string;
  status: string;
  error_message: string | null;
  sent_at: string;
};

export default function AdminDeliveryPage() {
  const supabase = useMemo(() => createSupabaseBrowserClient(), []);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [logs, setLogs] = useState<DeliveryLog[]>([]);

  const [cron, setCron] = useState("0 8 * * *");
  const [timezone, setTimezone] = useState("Asia/Bangkok");
  const [recipientUserIds, setRecipientUserIds] = useState("");

  const authHeader = useCallback(async () => {
    const { data } = await supabase.auth.getSession();
    const token = data.session?.access_token;
    if (!token) throw new Error("ยังไม่ได้เข้าสู่ระบบ");
    return { Authorization: `Bearer ${token}` };
  }, [supabase]);

  const refreshLogs = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const headers = await authHeader();
      const res = await fetch(withBasePath("/api/admin/delivery/logs"), { headers });
      const json = await res.json().catch(() => null);
      if (!res.ok) {
        setError(String(json?.error ?? "โหลด log ไม่สำเร็จ"));
        setLogs([]);
        setLoading(false);
        return;
      }
      setLogs((json?.items ?? []) as DeliveryLog[]);
      setLoading(false);
    } catch (e: any) {
      setError(e?.message ?? "โหลด log ไม่สำเร็จ");
      setLogs([]);
      setLoading(false);
    }
  }, [authHeader]);

  const saveSchedule = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const headers = await authHeader();
      const res = await fetch(withBasePath("/api/admin/delivery/schedule"), {
        method: "PUT",
        headers: { ...headers, "content-type": "application/json" },
        body: JSON.stringify({ cron, timezone }),
      });
      const json = await res.json().catch(() => null);
      if (!res.ok) {
        setError(String(json?.error ?? "บันทึกตารางส่งไม่สำเร็จ"));
        setLoading(false);
        return;
      }
      setLoading(false);
    } catch (e: any) {
      setError(e?.message ?? "บันทึกตารางส่งไม่สำเร็จ");
      setLoading(false);
    }
  }, [authHeader, cron, timezone]);

  const sendNow = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const headers = await authHeader();
      const toUserIds = recipientUserIds
        .split("\n")
        .map((x) => x.trim())
        .filter(Boolean);
      const res = await fetch(withBasePath("/api/admin/delivery/send-now"), {
        method: "POST",
        headers: { ...headers, "content-type": "application/json" },
        body: JSON.stringify({ toUserIds }),
      });
      const json = await res.json().catch(() => null);
      if (!res.ok) {
        setError(String(json?.error ?? "ส่งไม่สำเร็จ"));
        setLoading(false);
        return;
      }
      setLoading(false);
      await refreshLogs();
    } catch (e: any) {
      setError(e?.message ?? "ส่งไม่สำเร็จ");
      setLoading(false);
    }
  }, [authHeader, recipientUserIds, refreshLogs]);

  return (
    <div>
      <div>
        <Title as="h1" className="text-lg font-semibold text-gray-900">
          การส่งผ่าน LINE
        </Title>
        <Text className="mt-1 text-sm text-gray-600">ตั้งตารางส่ง และสั่งส่งทันที พร้อมดูบันทึกการส่ง</Text>
      </div>

      <div className="mt-5 grid grid-cols-1 gap-4 lg:grid-cols-2">
        <div className="rounded-2xl border border-gray-200 bg-white p-5">
          <div className="text-sm font-medium text-gray-900">ตารางส่ง (Schedule)</div>
          <div className="mt-3 grid grid-cols-1 gap-3 md:grid-cols-2">
            <Input label="Cron" value={cron} onChange={(e) => setCron(e.target.value)} disabled={loading} />
            <Input label="Timezone" value={timezone} onChange={(e) => setTimezone(e.target.value)} disabled={loading} />
          </div>
          <div className="mt-4 flex items-center gap-2">
            <Button className="bg-indigo-600 text-white hover:bg-indigo-500" onClick={() => void saveSchedule()} disabled={loading}>
              บันทึกตาราง
            </Button>
          </div>

          <div className="mt-6 text-sm font-medium text-gray-900">ส่งทันที (Manual Send)</div>
          <div className="mt-3">
            <Textarea
              label="Recipient User IDs (1 บรรทัดต่อ 1 คน)"
              value={recipientUserIds}
              onChange={(e) => setRecipientUserIds(e.target.value)}
              rows={6}
              disabled={loading}
            />
          </div>
          <div className="mt-4 flex items-center gap-2">
            <Button className="bg-emerald-600 text-white hover:bg-emerald-500" onClick={() => void sendNow()} disabled={loading}>
              ส่งทันที
            </Button>
            <Button variant="outline" onClick={() => void refreshLogs()} disabled={loading}>
              รีเฟรช log
            </Button>
          </div>

          {error ? <div className="mt-4 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">{error}</div> : null}
        </div>

        <div className="rounded-2xl border border-gray-200 bg-white p-5">
          <div className="text-sm font-medium text-gray-900">บันทึกการส่งล่าสุด</div>
          <div className="mt-3 space-y-2">
            {logs.map((l) => (
              <div key={l.id} className="rounded-xl border border-gray-200 p-3">
                <div className="flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <div className="truncate text-xs text-gray-500">{l.profile_id}</div>
                    <div className="text-sm font-medium text-gray-900">{l.status}</div>
                  </div>
                  <div className="text-xs text-gray-500">{new Date(l.sent_at).toLocaleString("th-TH")}</div>
                </div>
                {l.error_message ? <div className="mt-2 text-xs text-red-700">{l.error_message}</div> : null}
              </div>
            ))}
            {logs.length === 0 ? <div className="text-sm text-gray-600">ยังไม่มี log</div> : null}
          </div>
        </div>
      </div>
    </div>
  );
}

