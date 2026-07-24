"use client";

/**
 * PinDialog — ปักหมุดคำตอบเป็นการ์ดบนแดชบอร์ด (Phase 3)
 *
 * ยังไม่มีแดชบอร์ดสักใบ = ไม่ต้องให้ตั้งชื่อก่อน (Q1 ข้อ ii) —
 * `POST /api/bi/dashboards` แบบไม่ส่ง `name` จะคืน/สร้าง "แดชบอร์ดของฉัน" ให้เอง
 * รายการแดชบอร์ดโหลดตอนเปิดกล่องเท่านั้น (เป็น mutation flow ไม่ใช่ display — ไม่ขัด SSR)
 */

import * as React from "react";
import Link from "next/link";
import { CheckCircle2, LayoutDashboard } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { CustomSelect } from "@/components/ui/custom-select";
import { Text } from "@/components/ui/typography";
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import { notify } from "@/lib/toast";
import type { BiDashboard, BiDashboardItem, BiMetricParams, ChartType } from "@/lib/bi/types";

const NEW_DASHBOARD = "__new__";

async function accessToken(): Promise<string> {
  const supabase = createSupabaseBrowserClient();
  const { data } = await supabase.auth.getSession();
  return data.session?.access_token ?? "";
}

/** ข้อมูลของคำตอบที่จะปักหมุด (มาจาก AnswerCard) */
export interface PinPayload {
  metricKey: string;
  params: BiMetricParams;
  chartType: ChartType | null;
  defaultTitle: string;
}

export function PinDialog({
  orgId,
  orgSlug,
  payload,
  onClose,
}: {
  orgId: string;
  orgSlug: string;
  /** null = ปิดอยู่ */
  payload: PinPayload | null;
  onClose: () => void;
}) {
  const [dashboards, setDashboards] = React.useState<BiDashboard[]>([]);
  const [target, setTarget] = React.useState<string>("");
  const [newName, setNewName] = React.useState("");
  const [title, setTitle] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const [pinnedTo, setPinnedTo] = React.useState<BiDashboard | null>(null);

  React.useEffect(() => {
    if (!payload) return;
    setTitle(payload.defaultTitle);
    setPinnedTo(null);
    setNewName("");

    let cancelled = false;
    void (async () => {
      try {
        const token = await accessToken();
        const res = await fetch(`/api/bi/dashboards?orgId=${encodeURIComponent(orgId)}`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        const json = (await res.json()) as { dashboards?: BiDashboard[]; error?: string };
        if (cancelled || !res.ok) return;
        const list = json.dashboards ?? [];
        setDashboards(list);
        setTarget(list[0]?.id ?? NEW_DASHBOARD);
      } catch {
        if (!cancelled) setTarget(NEW_DASHBOARD);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [orgId, payload]);

  const pin = async () => {
    if (!payload || busy) return;
    setBusy(true);
    try {
      const token = await accessToken();
      const headers = {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      };

      let dashboard = dashboards.find((d) => d.id === target) ?? null;
      if (!dashboard) {
        const res = await fetch("/api/bi/dashboards", {
          method: "POST",
          headers,
          body: JSON.stringify({ orgId, name: newName.trim() || undefined }),
        });
        const json = (await res.json()) as { dashboard?: BiDashboard; error?: string };
        if (!res.ok || !json.dashboard) throw new Error(json.error || "สร้างแดชบอร์ดไม่สำเร็จ");
        dashboard = json.dashboard;
        setDashboards((prev) => [...prev, json.dashboard!]);
      }

      const res = await fetch(`/api/bi/dashboards/${dashboard.id}/items`, {
        method: "POST",
        headers,
        body: JSON.stringify({
          orgId,
          metricKey: payload.metricKey,
          params: payload.params,
          chartType: payload.chartType,
          title: title.trim() || null,
        }),
      });
      const json = (await res.json()) as { item?: BiDashboardItem; error?: string };
      if (!res.ok || !json.item) throw new Error(json.error || "ปักหมุดไม่สำเร็จ");

      setPinnedTo(dashboard);
      notify.success(`ปักหมุดไว้ที่ ${dashboard.name} แล้ว`);
    } catch (e) {
      notify.error(e, "ปักหมุดไม่สำเร็จ");
    } finally {
      setBusy(false);
    }
  };

  const options = [
    ...dashboards.map((d) => ({ value: d.id, label: d.name })),
    { value: NEW_DASHBOARD, label: "+ สร้างแดชบอร์ดใหม่" },
  ];

  return (
    <Dialog open={Boolean(payload)} onOpenChange={(o) => (o ? null : onClose())}>
      <DialogContent size="md">
        <DialogHeader>
          <DialogTitle>ปักหมุดคำตอบนี้</DialogTitle>
        </DialogHeader>
        <DialogBody>
          {pinnedTo ? (
            <div className="space-y-3">
              <div className="flex items-start gap-2">
                <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-green-600" />
                <Text className="text-sm leading-6 text-gray-700">
                  ปักหมุดไว้ที่ {pinnedTo.name} แล้ว — ตัวเลขจะคำนวณใหม่ทุกครั้งที่เปิดแดชบอร์ด
                </Text>
              </div>
              <Button size="sm" variant="outline" asChild>
                <Link href={`/${orgSlug}/bi/dashboards/${pinnedTo.id}`}>
                  <LayoutDashboard className="mr-1.5 h-4 w-4" />
                  เปิดแดชบอร์ด
                </Link>
              </Button>
            </div>
          ) : (
            <div className="space-y-4">
              <div className="space-y-1.5">
                <Label>ปักหมุดไปที่</Label>
                <CustomSelect
                  value={target}
                  onChange={(v) => setTarget(v)}
                  options={options}
                  placeholder="เลือกแดชบอร์ด"
                />
              </div>

              {target === NEW_DASHBOARD ? (
                <div className="space-y-1.5">
                  <Label htmlFor="bi-pin-new-name">ชื่อแดชบอร์ดใหม่</Label>
                  <Input
                    id="bi-pin-new-name"
                    value={newName}
                    onChange={(e) => setNewName(e.target.value)}
                    placeholder="เว้นว่างไว้เพื่อใช้ชื่อ แดชบอร์ดของฉัน"
                  />
                </div>
              ) : null}

              <div className="space-y-1.5">
                <Label htmlFor="bi-pin-title">ชื่อการ์ด</Label>
                <Input
                  id="bi-pin-title"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="เว้นว่างไว้เพื่อใช้ชื่อตัวชี้วัด"
                />
                <Text className="text-xs text-gray-500">
                  การ์ดจะเก็บช่วงเวลาและเงื่อนไขของคำตอบนี้ไว้
                  แล้วคำนวณตัวเลขใหม่ทุกครั้งที่เปิดหน้า
                </Text>
              </div>
            </div>
          )}
        </DialogBody>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            {pinnedTo ? "ปิด" : "ยกเลิก"}
          </Button>
          {pinnedTo ? null : (
            <Button disabled={busy || !target} onClick={() => void pin()}>
              {busy ? "กำลังปักหมุด…" : "ปักหมุด"}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
