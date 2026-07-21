"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Megaphone, Plus, Pencil, Trash2, Loader2 } from "lucide-react";
import { toast } from "@/lib/toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { CustomSelect } from "@/components/ui/custom-select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogBody,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { ConfirmDeleteDialog } from "@/components/ui/confirm-delete-dialog";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import { AdminPage, AdminCard } from "../_components/admin-page";

type Level = "info" | "success" | "warning" | "critical";
type Announcement = {
  id: string;
  title: string;
  body: string;
  level: Level;
  is_active: boolean;
  starts_at: string | null;
  ends_at: string | null;
  created_at: string;
};

const LEVEL_META: Record<Level, { label: string; cls: string }> = {
  info: { label: "ข้อมูล", cls: "bg-blue-50 border-blue-200 text-blue-700" },
  success: { label: "สำเร็จ", cls: "bg-green-50 border-green-200 text-green-700" },
  warning: { label: "เตือน", cls: "bg-amber-50 border-amber-200 text-amber-700" },
  critical: { label: "สำคัญมาก", cls: "bg-red-50 border-red-200 text-red-700" },
};

const EMPTY = {
  id: "",
  title: "",
  body: "",
  level: "info" as Level,
  is_active: true,
  starts_at: "",
  ends_at: "",
};

export default function AnnouncementsPage() {
  const supabase = useMemo(() => createSupabaseBrowserClient(), []);
  const [items, setItems] = useState<Announcement[]>([]);
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState<typeof EMPTY | null>(null);
  const [saving, setSaving] = useState(false);
  const [deleteId, setDeleteId] = useState<string | null>(null);

  const token = useCallback(async () => {
    const {
      data: { session },
    } = await supabase.auth.getSession();
    return session?.access_token ?? "";
  }, [supabase]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/admin/announcements", {
        headers: { Authorization: `Bearer ${await token()}` },
      });
      const json = await res.json();
      setItems(json?.data?.announcements ?? []);
    } catch {
      toast.error("โหลดประกาศไม่สำเร็จ");
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    void load();
  }, [load]);

  const openCreate = () => setForm({ ...EMPTY });
  const openEdit = (a: Announcement) =>
    setForm({
      id: a.id,
      title: a.title,
      body: a.body,
      level: a.level,
      is_active: a.is_active,
      starts_at: a.starts_at?.slice(0, 16) ?? "",
      ends_at: a.ends_at?.slice(0, 16) ?? "",
    });

  const save = async () => {
    if (!form) return;
    if (!form.title.trim()) {
      toast.error("กรุณาใส่หัวข้อ");
      return;
    }
    setSaving(true);
    try {
      const payload = {
        ...(form.id ? { id: form.id } : {}),
        title: form.title.trim(),
        body: form.body,
        level: form.level,
        is_active: form.is_active,
        starts_at: form.starts_at ? new Date(form.starts_at).toISOString() : null,
        ends_at: form.ends_at ? new Date(form.ends_at).toISOString() : null,
      };
      const res = await fetch("/api/admin/announcements", {
        method: form.id ? "PUT" : "POST",
        headers: { Authorization: `Bearer ${await token()}`, "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) throw new Error();
      toast.success("บันทึกประกาศแล้ว");
      setForm(null);
      await load();
    } catch {
      toast.error("บันทึกไม่สำเร็จ");
    } finally {
      setSaving(false);
    }
  };

  const toggleActive = async (a: Announcement) => {
    try {
      const res = await fetch("/api/admin/announcements", {
        method: "PUT",
        headers: { Authorization: `Bearer ${await token()}`, "Content-Type": "application/json" },
        body: JSON.stringify({ id: a.id, is_active: !a.is_active }),
      });
      if (!res.ok) throw new Error();
      toast.success(!a.is_active ? "เปิดใช้งานประกาศแล้ว" : "ปิดใช้งานประกาศแล้ว");
      await load();
    } catch {
      toast.error("อัปเดตไม่สำเร็จ");
    }
  };

  const doDelete = async () => {
    if (!deleteId) return;
    try {
      const res = await fetch(`/api/admin/announcements?id=${deleteId}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${await token()}` },
      });
      if (!res.ok) throw new Error();
      toast.success("ลบแล้ว");
      setDeleteId(null);
      await load();
    } catch {
      toast.error("ลบไม่สำเร็จ");
    }
  };

  return (
    <AdminPage
      title="Announcements"
      icon={<Megaphone className="h-6 w-6" />}
      description="ประกาศแสดงเป็น banner ในแอปกับผู้ใช้ที่ล็อกอินทุกคน"
      actions={
        <Button onClick={openCreate}>
          <Plus className="mr-1.5 h-4 w-4" /> สร้างประกาศ
        </Button>
      }
    >
      {loading ? (
        <div className="flex min-h-[40vh] items-center justify-center">
          <Loader2 className="h-6 w-6 animate-spin text-gray-400" />
        </div>
      ) : items.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-gray-300 bg-gray-50 py-16 text-center">
          <Megaphone className="mb-3 h-8 w-8 text-gray-300" />
          <h3 className="text-sm font-medium text-gray-700">ยังไม่มีประกาศ</h3>
          <p className="mt-1 text-sm text-gray-500">สร้างประกาศแรกเพื่อแจ้งข่าวสารถึงผู้ใช้ทุกคน</p>
          <Button className="mt-4" size="sm" onClick={openCreate}>
            <Plus className="mr-1.5 h-4 w-4" /> สร้างประกาศ
          </Button>
        </div>
      ) : (
        <div className="space-y-3">
          {items.map((a) => (
            <AdminCard key={a.id} bodyClassName="p-4">
              <div className="flex items-start justify-between gap-4">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <span
                      className={`rounded-full border px-2 py-0.5 text-xs font-medium ${LEVEL_META[a.level].cls}`}
                    >
                      {LEVEL_META[a.level].label}
                    </span>
                    {a.is_active ? (
                      <span className="rounded-full border border-green-200 bg-green-50 px-2 py-0.5 text-xs text-green-700">
                        กำลังแสดง
                      </span>
                    ) : (
                      <span className="rounded-full border border-gray-200 bg-gray-50 px-2 py-0.5 text-xs text-gray-500">
                        ปิดอยู่
                      </span>
                    )}
                    <span className="text-sm font-semibold text-gray-900">{a.title}</span>
                  </div>
                  {a.body && <p className="mt-1.5 line-clamp-2 text-sm text-gray-600">{a.body}</p>}
                  {(a.starts_at || a.ends_at) && (
                    <p className="mt-1 text-xs text-gray-400">
                      {a.starts_at ? `เริ่ม ${new Date(a.starts_at).toLocaleString("th-TH")}` : ""}
                      {a.ends_at ? ` · สิ้นสุด ${new Date(a.ends_at).toLocaleString("th-TH")}` : ""}
                    </p>
                  )}
                </div>
                <div className="flex flex-shrink-0 items-center gap-1.5">
                  <Button variant="outline" size="sm" onClick={() => toggleActive(a)}>
                    {a.is_active ? "ปิด" : "เปิด"}
                  </Button>
                  <Button variant="ghost" size="icon" onClick={() => openEdit(a)}>
                    <Pencil className="h-4 w-4" />
                  </Button>
                  <Button variant="ghost" size="icon" onClick={() => setDeleteId(a.id)}>
                    <Trash2 className="h-4 w-4 text-red-500" />
                  </Button>
                </div>
              </div>
            </AdminCard>
          ))}
        </div>
      )}

      {/* Create/Edit dialog */}
      <Dialog open={!!form} onOpenChange={(o) => !o && setForm(null)}>
        <DialogContent size="lg">
          <DialogHeader>
            <DialogTitle>{form?.id ? "แก้ไขประกาศ" : "สร้างประกาศ"}</DialogTitle>
          </DialogHeader>
          <DialogBody>
            {form && (
              <div className="space-y-4">
                <div>
                  <Label htmlFor="ann-title">หัวข้อ *</Label>
                  <Input
                    id="ann-title"
                    value={form.title}
                    onChange={(e) => setForm({ ...form, title: e.target.value })}
                    placeholder="เช่น ปิดปรับปรุงระบบ"
                    className="mt-1"
                  />
                </div>
                <div>
                  <Label htmlFor="ann-body">รายละเอียด</Label>
                  <Textarea
                    id="ann-body"
                    value={form.body}
                    onChange={(e) => setForm({ ...form, body: e.target.value })}
                    rows={3}
                    className="mt-1"
                  />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label>ระดับ</Label>
                    <CustomSelect
                      value={form.level}
                      onChange={(v) => setForm({ ...form, level: v as Level })}
                      options={(Object.keys(LEVEL_META) as Level[]).map((l) => ({
                        value: l,
                        label: LEVEL_META[l].label,
                      }))}
                      className="mt-1"
                    />
                  </div>
                  <div className="flex items-end pb-1">
                    <label className="flex cursor-pointer items-center gap-2 text-sm text-gray-700">
                      <input
                        type="checkbox"
                        checked={form.is_active}
                        onChange={(e) => setForm({ ...form, is_active: e.target.checked })}
                        className="h-4 w-4 rounded border-gray-300"
                      />
                      แสดงทันที
                    </label>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label htmlFor="ann-start">เริ่มแสดง (ไม่บังคับ)</Label>
                    <Input
                      id="ann-start"
                      type="datetime-local"
                      value={form.starts_at}
                      onChange={(e) => setForm({ ...form, starts_at: e.target.value })}
                      className="mt-1"
                    />
                  </div>
                  <div>
                    <Label htmlFor="ann-end">สิ้นสุด (ไม่บังคับ)</Label>
                    <Input
                      id="ann-end"
                      type="datetime-local"
                      value={form.ends_at}
                      onChange={(e) => setForm({ ...form, ends_at: e.target.value })}
                      className="mt-1"
                    />
                  </div>
                </div>
              </div>
            )}
          </DialogBody>
          <DialogFooter>
            <Button variant="outline" onClick={() => setForm(null)}>
              ยกเลิก
            </Button>
            <Button onClick={save} disabled={saving}>
              {saving ? "กำลังบันทึก…" : "บันทึก"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <ConfirmDeleteDialog
        open={!!deleteId}
        onOpenChange={(o) => !o && setDeleteId(null)}
        title="ลบประกาศ"
        description="การกระทำนี้ไม่สามารถย้อนกลับได้"
        onConfirm={doDelete}
      />
    </AdminPage>
  );
}
