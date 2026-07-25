"use client";

/**
 * DashboardClient — หน้าแดชบอร์ดหนึ่งใบ (`[orgSlug]/bi/dashboards/[id]`)
 *
 * hybrid: server ดึงโครง + **ผลการ์ดรอบแรก** มาให้แล้ว → ที่นี่ทำเฉพาะสิ่งที่ผู้ใช้กด
 *  - **ไม่มีปุ่มรีเฟรช** (P3-D3) — คำนวณใหม่เฉพาะตอนเปลี่ยนช่วงเวลาของการ์ด
 *  - ย้ายลำดับด้วยปุ่มขึ้น/ลง (P3-D6 — ไม่มี drag & drop)
 *  - drill-down: คลิกจุดบนกราฟ → `buildDrillParams` → dialog รายการ
 */

import * as React from "react";
import { useRouter } from "next/navigation";
import { LayoutDashboard, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Text, Title } from "@/components/ui/typography";
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
import { buildDrillParams } from "@/lib/bi/drill";
import type {
  BiCardResult,
  BiCardState,
  BiDashboard,
  BiDashboardItem,
  BiDirectResult,
  BiDrillTarget,
  BiPeriodParam,
} from "@/lib/bi/types";
import { DashboardCard, describePeriod } from "./dashboard-card";
import { DrillDownDialog } from "./drill-down-dialog";
import type { BiDrillMetricInfo } from "./guard";

async function accessToken(): Promise<string> {
  const supabase = createSupabaseBrowserClient();
  const { data } = await supabase.auth.getSession();
  return data.session?.access_token ?? "";
}

export interface DashboardClientProps {
  orgId: string;
  orgSlug: string;
  canWrite: boolean;
  dashboard: BiDashboard;
  items: BiDashboardItem[];
  results: BiCardResult[];
  drill: Record<string, BiDrillMetricInfo>;
  quotaExceeded: boolean;
}

export function DashboardClient(props: DashboardClientProps) {
  const { orgId, orgSlug, canWrite, drill } = props;
  const router = useRouter();

  const [items, setItems] = React.useState<BiDashboardItem[]>(props.items);
  const [results, setResults] = React.useState<Record<string, BiCardResult>>(() =>
    Object.fromEntries(props.results.map((r) => [r.itemId, r])),
  );
  const [pending, setPending] = React.useState<string[]>([]);
  const [editing, setEditing] = React.useState<BiDashboardItem | null>(null);
  const [drillTarget, setDrillTarget] = React.useState<{
    target: BiDrillTarget;
    label: string;
    /** ชื่อไทยของมิติที่คลิก เช่น "บริษัท" — กัน "89 Global Work" กำกวมว่าเป็นอะไร */
    dimensionLabel: string;
    /** ช่วงเวลาที่ติดไปกับการเจาะ (ว่าง = ไม่กรองช่วงเวลา) */
    periodLabel: string;
  } | null>(null);

  const setBusy = (itemId: string, busy: boolean) =>
    setPending((prev) => (busy ? [...prev, itemId] : prev.filter((id) => id !== itemId)));

  /**
   * รันการ์ดใบเดียวใหม่ (ใช้ตอนเปลี่ยนช่วงเวลา) — สถานะที่ไม่ ok ใช้ข้อความจากเซิร์ฟเวอร์
   * **คืนผลกลับให้ผู้เรียกเสมอ** — ผู้เรียกต้องรู้ว่าสำเร็จไหมก่อนขึ้น toast/ตัดสินใจ rollback
   */
  const runCard = async (item: BiDashboardItem): Promise<BiCardResult> => {
    setBusy(item.id, true);
    try {
      const token = await accessToken();
      const res = await fetch("/api/bi/run", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          orgId,
          metricKey: item.metric_key,
          params: item.params,
          chartType: item.chart_type,
        }),
      });
      const json = (await res.json()) as BiDirectResult & { error?: string; state?: BiCardState };

      const next: BiCardResult = res.ok
        ? { itemId: item.id, state: "ok", title: item.title, result: json, message: null }
        : {
            itemId: item.id,
            state: json.state ?? "error",
            title: item.title,
            result: null,
            message: json.error ?? "แสดงข้อมูลการ์ดนี้ไม่สำเร็จ",
          };
      // รันไม่ผ่าน = **ไม่เขียนทับผลเดิม** (ผู้เรียกจะ rollback ให้) — ห้ามแทนที่การ์ดที่เคย
      // แสดงได้ด้วยกล่อง error จนผู้ใช้หมดทางกลับ
      if (next.state === "ok") setResults((prev) => ({ ...prev, [item.id]: next }));
      return next;
    } catch {
      return {
        itemId: item.id,
        state: "error",
        title: item.title,
        result: null,
        message: "แสดงข้อมูลการ์ดนี้ไม่สำเร็จ",
      };
    } finally {
      setBusy(item.id, false);
    }
  };

  const patchItem = async (item: BiDashboardItem, body: Record<string, unknown>) => {
    const token = await accessToken();
    const res = await fetch(`/api/bi/dashboards/${props.dashboard.id}/items/${item.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ orgId, ...body }),
    });
    const json = (await res.json()) as { item?: BiDashboardItem; error?: string };
    if (!res.ok || !json.item) throw new Error(json.error || "แก้ไขการ์ดไม่สำเร็จ");
    return json.item;
  };

  const changePeriod = async (item: BiDashboardItem, period: BiPeriodParam) => {
    const nextParams = { ...item.params, period };
    try {
      const saved = await patchItem(item, { params: nextParams });
      const next = { ...saved, params: nextParams };
      setItems((prev) => prev.map((i) => (i.id === item.id ? next : i)));

      const outcome = await runCard(next);
      if (outcome.state === "ok") {
        notify.success("เปลี่ยนช่วงเวลาของการ์ดแล้ว");
        return;
      }

      // ช่วงเวลาที่ตัวชี้วัดนี้รองรับไม่ได้ → คืนค่าเดิมทั้งที่เซิร์ฟเวอร์และหน้าจอ
      // (ไม่งั้นการ์ดค้างสถานะพังถาวร ทางออกเดียวคือลบการ์ดทิ้ง)
      try {
        await patchItem(item, { params: item.params });
      } catch {
        // เก็บกู้ไม่ได้ก็ยังคืนค่าบนหน้าจอให้ผู้ใช้เลือกใหม่ได้
      }
      setItems((prev) => prev.map((i) => (i.id === item.id ? item : i)));
      notify.error(outcome.message, "เปลี่ยนช่วงเวลาไม่สำเร็จ");
    } catch (e) {
      notify.error(e, "เปลี่ยนช่วงเวลาไม่สำเร็จ");
    }
  };

  const move = async (item: BiDashboardItem, direction: "up" | "down") => {
    const index = items.findIndex((i) => i.id === item.id);
    const target = direction === "up" ? index - 1 : index + 1;
    if (index < 0 || target < 0 || target >= items.length) return;

    setBusy(item.id, true);
    try {
      await patchItem(item, { direction });
      setItems((prev) => {
        const next = [...prev];
        [next[index], next[target]] = [next[target], next[index]];
        return next;
      });
    } catch (e) {
      notify.error(e, "ย้ายลำดับการ์ดไม่สำเร็จ");
    } finally {
      setBusy(item.id, false);
    }
  };

  const rename = async (item: BiDashboardItem, title: string) => {
    try {
      const saved = await patchItem(item, { title });
      setItems((prev) => prev.map((i) => (i.id === item.id ? saved : i)));
      setResults((prev) =>
        prev[item.id] ? { ...prev, [item.id]: { ...prev[item.id], title: saved.title } } : prev,
      );
      setEditing(null);
      notify.success("เปลี่ยนชื่อการ์ดแล้ว");
    } catch (e) {
      notify.error(e, "เปลี่ยนชื่อการ์ดไม่สำเร็จ");
    }
  };

  const removeItem = async (item: BiDashboardItem) => {
    try {
      const token = await accessToken();
      const res = await fetch(`/api/bi/dashboards/${props.dashboard.id}/items/${item.id}`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ orgId }),
      });
      const json = (await res.json()) as { error?: string };
      if (!res.ok) throw new Error(json.error || "ลบการ์ดไม่สำเร็จ");
      setItems((prev) => prev.filter((i) => i.id !== item.id));
      setResults((prev) => {
        const next = { ...prev };
        delete next[item.id];
        return next;
      });
      setEditing(null);
      notify.success("ลบการ์ดแล้ว");
    } catch (e) {
      notify.error(e, "ลบการ์ดไม่สำเร็จ");
    }
  };

  const openDrill = (item: BiDashboardItem, point: { dimension: string; value: string }) => {
    const info = drill[item.metric_key];
    if (!info) return;
    const target = buildDrillParams(info, item.params, point);
    if (!target) {
      notify.info("ยังเจาะดูรายการของกลุ่มนี้ไม่ได้");
      return;
    }
    setDrillTarget({
      target,
      label: point.value,
      dimensionLabel: info.filters.find((f) => f.key === point.dimension)?.label_th ?? "",
      periodLabel: describePeriod(item.params.period),
    });
  };

  if (items.length === 0) {
    return <EmptyDashboard orgSlug={orgSlug} onGoChat={() => router.push(`/${orgSlug}/bi`)} />;
  }

  return (
    <div className="space-y-4">
      {props.quotaExceeded ? (
        <Text className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm leading-6 text-amber-700">
          เปิดแดชบอร์ดครบเพดานของวันนี้แล้ว การ์ดจึงยังไม่ได้คำนวณ กรุณาลองใหม่พรุ่งนี้
        </Text>
      ) : null}

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
        {items.map((item, index) => (
          <DashboardCard
            key={item.id}
            item={item}
            result={results[item.id] ?? null}
            loading={pending.includes(item.id)}
            canWrite={canWrite}
            canMoveUp={index > 0}
            canMoveDown={index < items.length - 1}
            drill={drill[item.metric_key]}
            quotaExceeded={props.quotaExceeded}
            onMove={(d) => void move(item, d)}
            onEdit={() => setEditing(item)}
            onChangePeriod={(p) => void changePeriod(item, p)}
            onDrill={(point) => openDrill(item, point)}
          />
        ))}
      </div>

      <EditCardDialog
        item={editing}
        onClose={() => setEditing(null)}
        onRename={(i, title) => void rename(i, title)}
        onDelete={(i) => void removeItem(i)}
      />

      <DrillDownDialog
        orgId={orgId}
        target={drillTarget?.target ?? null}
        label={drillTarget?.label ?? ""}
        dimensionLabel={drillTarget?.dimensionLabel ?? ""}
        periodLabel={drillTarget?.periodLabel ?? ""}
        onClose={() => setDrillTarget(null)}
      />
    </div>
  );
}

function EditCardDialog({
  item,
  onClose,
  onRename,
  onDelete,
}: {
  item: BiDashboardItem | null;
  onClose: () => void;
  onRename: (item: BiDashboardItem, title: string) => void;
  onDelete: (item: BiDashboardItem) => void;
}) {
  const [title, setTitle] = React.useState("");
  const [confirming, setConfirming] = React.useState(false);

  React.useEffect(() => {
    setTitle(item?.title ?? "");
    setConfirming(false);
  }, [item]);

  return (
    <Dialog open={Boolean(item)} onOpenChange={(o) => (o ? null : onClose())}>
      <DialogContent size="md">
        <DialogHeader>
          <DialogTitle>แก้ไขการ์ด</DialogTitle>
        </DialogHeader>
        <DialogBody>
          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="bi-card-title">ชื่อการ์ด</Label>
              <Input
                id="bi-card-title"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="เว้นว่างไว้เพื่อใช้ชื่อตัวชี้วัดเดิม"
              />
              <Text className="text-xs text-gray-500">
                ตั้งชื่อให้รู้ว่าการ์ดนี้ตอบคำถามอะไร เช่น มูลค่าพอร์ตรายเดือน
              </Text>
            </div>

            {confirming ? (
              <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2">
                <Text className="text-xs leading-5 text-red-700">
                  นำการ์ดนี้ออกจากแดชบอร์ดถาวร — กดปุ่ม ยืนยันลบ อีกครั้งเพื่อดำเนินการ
                </Text>
              </div>
            ) : null}
          </div>
        </DialogBody>
        <DialogFooter>
          <Button
            variant="destructive"
            className="mr-auto"
            disabled={!item}
            onClick={() => {
              if (!item) return;
              if (!confirming) {
                setConfirming(true);
                return;
              }
              onDelete(item);
            }}
          >
            {confirming ? "ยืนยันลบ" : "ลบการ์ด"}
          </Button>
          <Button variant="outline" onClick={onClose}>
            ยกเลิก
          </Button>
          <Button disabled={!item} onClick={() => item && onRename(item, title)}>
            บันทึก
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function EmptyDashboard({ orgSlug, onGoChat }: { orgSlug: string; onGoChat: () => void }) {
  return (
    <div className="flex flex-col items-center rounded-xl border border-gray-200 bg-white px-4 py-16 text-center shadow-sm">
      <div className="mb-4 rounded-full bg-gray-100 p-4">
        <LayoutDashboard className="h-8 w-8 text-gray-400" />
      </div>
      <Title as="h3" className="text-sm font-medium text-gray-900">
        แดชบอร์ดนี้ยังไม่มีการ์ด
      </Title>
      <Text className="mt-1 max-w-md text-sm text-gray-500">
        ไปที่หน้าถาม-ตอบ ถามคำถามที่อยากติดตาม แล้วกดปุ่ม ปักหมุด ที่คำตอบ
        การ์ดจะมาโผล่ที่นี่พร้อมตัวเลขล่าสุดทุกครั้งที่เปิดหน้า
      </Text>
      <Button className="mt-4" size="sm" onClick={onGoChat} aria-label={`ไปถาม-ตอบของ ${orgSlug}`}>
        <Sparkles className="mr-1.5 h-4 w-4" />
        ไปถามคำถาม
      </Button>
    </div>
  );
}
