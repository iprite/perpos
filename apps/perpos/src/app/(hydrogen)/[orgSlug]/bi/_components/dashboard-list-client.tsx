"use client";

/**
 * DashboardListClient — รายการแดชบอร์ดของผู้ใช้ (หน้า `[orgSlug]/bi/dashboards`)
 *
 * หน้าเป็น **full SSR**: server ดึงรายการมาให้แล้ว (ไม่มี fetch ตอน mount)
 * ที่นี่ทำเฉพาะ mutation — สร้าง / เปลี่ยนชื่อ / ลบ ผ่าน `/api/bi/dashboards*`
 * คลิกแถว = เปิดกล่องจัดการ (DESIGN §5 ข้อ 3 — ไม่มีคอลัมน์ปุ่มในแถว)
 */

import * as React from "react";
import { useRouter } from "next/navigation";
import { LayoutDashboard, Plus, Sparkles } from "lucide-react";
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
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import { notify } from "@/lib/toast";
import { MAX_DASHBOARDS_PER_USER, type BiDashboard } from "@/lib/bi/types";

async function accessToken(): Promise<string> {
  const supabase = createSupabaseBrowserClient();
  const { data } = await supabase.auth.getSession();
  return data.session?.access_token ?? "";
}

/** วันที่แบบไทย พ.ศ. — "24 ก.ค. 2569 14:32" */
export function formatThaiDateTime(iso: string | null | undefined): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleString("th-TH", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function DashboardListClient({
  orgId,
  orgSlug,
  canWrite,
  dashboards: initial,
}: {
  orgId: string;
  orgSlug: string;
  canWrite: boolean;
  dashboards: BiDashboard[];
}) {
  const router = useRouter();
  const [dashboards, setDashboards] = React.useState<BiDashboard[]>(initial);
  const [createOpen, setCreateOpen] = React.useState(false);
  const [name, setName] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const [selected, setSelected] = React.useState<BiDashboard | null>(null);

  const create = async () => {
    const clean = name.trim();
    if (!clean || busy) return;
    setBusy(true);
    try {
      const token = await accessToken();
      const res = await fetch("/api/bi/dashboards", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ orgId, name: clean }),
      });
      const json = (await res.json()) as { dashboard?: BiDashboard; error?: string };
      if (!res.ok || !json.dashboard) throw new Error(json.error || "สร้างแดชบอร์ดไม่สำเร็จ");
      setDashboards((prev) => [...prev, { ...json.dashboard!, item_count: 0 }]);
      setCreateOpen(false);
      setName("");
      notify.success("สร้างแดชบอร์ดแล้ว");
    } catch (e) {
      notify.error(e, "สร้างแดชบอร์ดไม่สำเร็จ");
    } finally {
      setBusy(false);
    }
  };

  const rename = async (target: BiDashboard, nextName: string) => {
    const clean = nextName.trim();
    if (!clean || busy) return;
    setBusy(true);
    try {
      const token = await accessToken();
      const res = await fetch(`/api/bi/dashboards/${target.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ orgId, name: clean }),
      });
      const json = (await res.json()) as { dashboard?: BiDashboard; error?: string };
      if (!res.ok || !json.dashboard) throw new Error(json.error || "เปลี่ยนชื่อไม่สำเร็จ");
      setDashboards((prev) =>
        prev.map((d) => (d.id === target.id ? { ...d, name: json.dashboard!.name } : d)),
      );
      setSelected(null);
      notify.success("เปลี่ยนชื่อแดชบอร์ดแล้ว");
    } catch (e) {
      notify.error(e, "เปลี่ยนชื่อไม่สำเร็จ");
    } finally {
      setBusy(false);
    }
  };

  const remove = async (target: BiDashboard) => {
    if (busy) return;
    setBusy(true);
    try {
      const token = await accessToken();
      const res = await fetch(`/api/bi/dashboards/${target.id}`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ orgId }),
      });
      const json = (await res.json()) as { error?: string };
      if (!res.ok) throw new Error(json.error || "ลบแดชบอร์ดไม่สำเร็จ");
      setDashboards((prev) => prev.filter((d) => d.id !== target.id));
      setSelected(null);
      notify.success("ลบแดชบอร์ดแล้ว");
    } catch (e) {
      notify.error(e, "ลบแดชบอร์ดไม่สำเร็จ");
    } finally {
      setBusy(false);
    }
  };

  const full = dashboards.length >= MAX_DASHBOARDS_PER_USER;

  return (
    <div className="space-y-4">
      {canWrite ? (
        <div className="flex flex-wrap items-center justify-between gap-2">
          <Text className="text-xs text-gray-500">
            แดชบอร์ดเป็นของส่วนตัว — เห็นเฉพาะคุณคนเดียว (สูงสุด {MAX_DASHBOARDS_PER_USER} หน้า)
          </Text>
          <Button size="sm" disabled={full} onClick={() => setCreateOpen(true)}>
            <Plus className="mr-1.5 h-4 w-4" />
            สร้างแดชบอร์ด
          </Button>
        </div>
      ) : null}

      {dashboards.length === 0 ? (
        <EmptyDashboards orgSlug={orgSlug} />
      ) : (
        <Table className="shadow-sm">
          <TableHeader>
            <TableRow>
              <TableHead>ชื่อแดชบอร์ด</TableHead>
              <TableHead align="right">จำนวนการ์ด</TableHead>
              <TableHead>แก้ไขล่าสุด</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {dashboards.map((d) => (
              <TableRow key={d.id} clickable onClick={() => setSelected(d)}>
                <TableCell>{d.name}</TableCell>
                <TableCell align="right" tabular>
                  {new Intl.NumberFormat("en-US").format(d.item_count ?? 0)}
                </TableCell>
                <TableCell>{formatThaiDateTime(d.updated_at || d.created_at)}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}

      {/* สร้างใหม่ */}
      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent size="md">
          <DialogHeader>
            <DialogTitle>สร้างแดชบอร์ด</DialogTitle>
          </DialogHeader>
          <DialogBody>
            <div className="space-y-1.5">
              <Label htmlFor="bi-dashboard-name">ชื่อแดชบอร์ด *</Label>
              <Input
                id="bi-dashboard-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="เช่น ภาพรวมจัดซื้อรายเดือน"
              />
              <Text className="text-xs text-gray-500">
                ตั้งชื่อให้รู้ว่าดูเรื่องอะไร แล้วปักหมุดคำตอบจากหน้าถาม-ตอบเข้ามาได้เลย
              </Text>
            </div>
          </DialogBody>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCreateOpen(false)}>
              ยกเลิก
            </Button>
            <Button disabled={busy || !name.trim()} onClick={() => void create()}>
              {busy ? "กำลังบันทึก…" : "สร้าง"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* จัดการใบที่เลือก */}
      <ManageDialog
        dashboard={selected}
        canWrite={canWrite}
        busy={busy}
        onClose={() => setSelected(null)}
        onOpen={(d) => router.push(`/${orgSlug}/bi/dashboards/${d.id}`)}
        onRename={rename}
        onDelete={remove}
      />
    </div>
  );
}

function ManageDialog({
  dashboard,
  canWrite,
  busy,
  onClose,
  onOpen,
  onRename,
  onDelete,
}: {
  dashboard: BiDashboard | null;
  canWrite: boolean;
  busy: boolean;
  onClose: () => void;
  onOpen: (d: BiDashboard) => void;
  onRename: (d: BiDashboard, name: string) => void;
  onDelete: (d: BiDashboard) => void;
}) {
  const [name, setName] = React.useState("");
  const [confirming, setConfirming] = React.useState(false);

  React.useEffect(() => {
    setName(dashboard?.name ?? "");
    setConfirming(false);
  }, [dashboard]);

  return (
    <Dialog open={Boolean(dashboard)} onOpenChange={(o) => (o ? null : onClose())}>
      <DialogContent size="md">
        <DialogHeader>
          <DialogTitle>{dashboard?.name ?? "แดชบอร์ด"}</DialogTitle>
        </DialogHeader>
        <DialogBody>
          <div className="space-y-4">
            <div className="space-y-1.5">
              <Text className="text-sm text-gray-600">
                มีการ์ดทั้งหมด {new Intl.NumberFormat("en-US").format(dashboard?.item_count ?? 0)}{" "}
                ใบ · แก้ไขล่าสุด {formatThaiDateTime(dashboard?.updated_at)}
              </Text>
              <Button
                variant="outline"
                size="sm"
                onClick={() => dashboard && onOpen(dashboard)}
                disabled={!dashboard}
              >
                <LayoutDashboard className="mr-1.5 h-4 w-4" />
                เปิดแดชบอร์ด
              </Button>
            </div>

            {canWrite ? (
              <div className="space-y-1.5 border-t border-gray-200 pt-4">
                <Label htmlFor="bi-dashboard-rename">เปลี่ยนชื่อ</Label>
                <Input
                  id="bi-dashboard-rename"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="ชื่อแดชบอร์ด"
                />
              </div>
            ) : null}

            {confirming ? (
              <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2">
                <Text className="text-xs leading-5 text-red-700">
                  ลบแดชบอร์ดนี้พร้อมการ์ดทั้งหมดถาวร — กดปุ่ม ยืนยันลบ อีกครั้งเพื่อดำเนินการ
                </Text>
              </div>
            ) : null}
          </div>
        </DialogBody>
        <DialogFooter>
          {canWrite ? (
            <Button
              variant="destructive"
              className="mr-auto"
              disabled={busy || !dashboard}
              onClick={() => {
                if (!dashboard) return;
                if (!confirming) {
                  setConfirming(true);
                  return;
                }
                onDelete(dashboard);
              }}
            >
              {confirming ? "ยืนยันลบ" : "ลบ"}
            </Button>
          ) : null}
          <Button variant="outline" onClick={onClose}>
            ปิด
          </Button>
          {canWrite ? (
            <Button
              disabled={busy || !name.trim() || !dashboard || name.trim() === dashboard?.name}
              onClick={() => dashboard && onRename(dashboard, name)}
            >
              {busy ? "กำลังบันทึก…" : "บันทึกชื่อ"}
            </Button>
          ) : null}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function EmptyDashboards({ orgSlug }: { orgSlug: string }) {
  const router = useRouter();
  return (
    <div className="flex flex-col items-center rounded-xl border border-gray-200 bg-white px-4 py-16 text-center shadow-sm">
      <div className="mb-4 rounded-full bg-gray-100 p-4">
        <LayoutDashboard className="h-8 w-8 text-gray-400" />
      </div>
      <Title as="h3" className="text-sm font-medium text-gray-900">
        ยังไม่มีแดชบอร์ด
      </Title>
      <Text className="mt-1 max-w-md text-sm text-gray-500">
        ถามคำถามที่หน้าถาม-ตอบ แล้วกดปุ่ม ปักหมุด ที่คำตอบ
        ระบบจะสร้างแดชบอร์ดให้อัตโนมัติและคำนวณตัวเลขใหม่ให้ทุกครั้งที่เปิด
      </Text>
      <Button className="mt-4" size="sm" onClick={() => router.push(`/${orgSlug}/bi`)}>
        <Sparkles className="mr-1.5 h-4 w-4" />
        ไปถามคำถามแรก
      </Button>
    </div>
  );
}
