"use client";

/**
 * จัดการโฟลเดอร์ (M3) — สร้าง / เปลี่ยนชื่อ / ย้าย / ลบ
 *
 * ทุกอย่างอยู่บนเมลเซิร์ฟเวอร์ (JMAP `Mailbox/*`) — โซน `(mail)` ห้ามผูกกับ DB ของ PERPOS
 * ลบได้เฉพาะโฟลเดอร์ที่ว่างและไม่มีโฟลเดอร์ย่อย (ด่านจริงอยู่ฝั่งเซิร์ฟเวอร์ ที่นี่แค่บอกล่วงหน้า)
 */

import { useCallback, useEffect, useState } from "react";
import { FolderPlus, Pencil, Trash2 } from "lucide-react";
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { CustomSelect } from "@/components/ui/custom-select";
import { Text } from "@/components/ui/typography";
import { notify } from "@/lib/toast";
import { MAIL_FOLDER_DEPTH_MAX, MAIL_FOLDER_NAME_MAX } from "@/lib/mail/boxes";
import type { MailFolder } from "@/lib/mail/types";

async function callApi<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, {
    ...init,
    headers: init?.body ? { "Content-Type": "application/json" } : undefined,
  });
  const data = (await res.json().catch(() => null)) as (T & { message?: string }) | null;
  if (!res.ok) throw new Error(data?.message ?? "ทำรายการไม่สำเร็จ");
  return data as T;
}

export function MailFoldersDialog({
  open,
  onOpenChange,
  folders,
  onChanged,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  folders: MailFolder[];
  /** เรียกหลังทุกการเปลี่ยนแปลง เพื่อให้ rail/รายการโหลดชุดใหม่ */
  onChanged: () => void;
}) {
  const [name, setName] = useState("");
  const [parentId, setParentId] = useState("");
  const [busy, setBusy] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingName, setEditingName] = useState("");

  useEffect(() => {
    if (!open) {
      setName("");
      setParentId("");
      setEditingId(null);
    }
  }, [open]);

  /** โฟลเดอร์ที่เป็น "แม่" ได้ — ลึกสุดตามเพดาน ไม่งั้นเซิร์ฟเวอร์ตีกลับตอนกดสร้าง */
  const parentOptions = [
    { value: "", label: "— ระดับบนสุด —" },
    ...folders
      .filter((f) => f.depth < MAIL_FOLDER_DEPTH_MAX - 1)
      .map((f) => ({ value: f.id, label: f.path })),
  ];

  const create = useCallback(async () => {
    if (!name.trim()) return;
    setBusy(true);
    try {
      await callApi("/api/mail/folders", {
        method: "POST",
        body: JSON.stringify({ name: name.trim(), parentId: parentId || null }),
      });
      setName("");
      setParentId("");
      notify.created("สร้างโฟลเดอร์แล้ว");
      onChanged();
    } catch (e) {
      notify.error(e, "สร้างโฟลเดอร์ไม่สำเร็จ");
    } finally {
      setBusy(false);
    }
  }, [name, onChanged, parentId]);

  const rename = useCallback(
    async (folder: MailFolder) => {
      const next = editingName.trim();
      if (!next || next === folder.name) {
        setEditingId(null);
        return;
      }
      setBusy(true);
      try {
        await callApi(`/api/mail/folders/${encodeURIComponent(folder.id)}`, {
          method: "PATCH",
          body: JSON.stringify({ name: next }),
        });
        setEditingId(null);
        notify.updated("เปลี่ยนชื่อโฟลเดอร์แล้ว");
        onChanged();
      } catch (e) {
        notify.error(e, "เปลี่ยนชื่อไม่สำเร็จ");
      } finally {
        setBusy(false);
      }
    },
    [editingName, onChanged],
  );

  const remove = useCallback(
    async (folder: MailFolder) => {
      setBusy(true);
      try {
        await callApi(`/api/mail/folders/${encodeURIComponent(folder.id)}`, { method: "DELETE" });
        notify.deleted("ลบโฟลเดอร์แล้ว");
        onChanged();
      } catch (e) {
        notify.error(e, "ลบโฟลเดอร์ไม่สำเร็จ");
      } finally {
        setBusy(false);
      }
    },
    [onChanged],
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent size="lg">
        <DialogHeader>
          <DialogTitle>จัดการโฟลเดอร์</DialogTitle>
        </DialogHeader>
        <DialogBody>
          <div className="space-y-4">
            <div className="rounded-xl border border-gray-200 p-4">
              <Text className="text-xs font-medium text-gray-500">สร้างโฟลเดอร์ใหม่</Text>
              <div className="mt-2 space-y-3">
                <div>
                  <Label htmlFor="mail-folder-name">ชื่อโฟลเดอร์ *</Label>
                  <Input
                    id="mail-folder-name"
                    className="mt-1"
                    value={name}
                    maxLength={MAIL_FOLDER_NAME_MAX}
                    placeholder="เช่น ลูกค้า, ใบแจ้งหนี้"
                    onChange={(e) => setName(e.target.value)}
                  />
                </div>
                <div>
                  <Label htmlFor="mail-folder-parent">อยู่ใต้โฟลเดอร์</Label>
                  <CustomSelect
                    value={parentId}
                    onChange={setParentId}
                    options={parentOptions}
                    className="mt-1"
                  />
                </div>
                <Button disabled={busy || !name.trim()} onClick={() => void create()}>
                  <FolderPlus className="h-4 w-4" />
                  {busy ? "กำลังบันทึก…" : "สร้างโฟลเดอร์"}
                </Button>
              </div>
            </div>

            <div>
              <Text className="text-xs font-medium text-gray-500">โฟลเดอร์ของฉัน</Text>
              {folders.length === 0 ? (
                <div className="mt-2 rounded-xl border border-dashed border-gray-300 px-4 py-8 text-center">
                  <Text className="text-sm text-gray-500">
                    ยังไม่มีโฟลเดอร์ — สร้างอันแรกจากช่องด้านบน
                  </Text>
                </div>
              ) : (
                <ul className="mt-2 divide-y divide-gray-200 rounded-xl border border-gray-200">
                  {folders.map((f) => (
                    <li key={f.id} className="flex items-center gap-2 px-3 py-2">
                      {editingId === f.id ? (
                        <>
                          <Input
                            autoFocus
                            className="h-8 flex-1"
                            value={editingName}
                            maxLength={MAIL_FOLDER_NAME_MAX}
                            onChange={(e) => setEditingName(e.target.value)}
                          />
                          <Button size="sm" disabled={busy} onClick={() => void rename(f)}>
                            บันทึก
                          </Button>
                          <Button size="sm" variant="outline" onClick={() => setEditingId(null)}>
                            ยกเลิก
                          </Button>
                        </>
                      ) : (
                        <>
                          <span
                            className="min-w-0 flex-1 truncate text-sm text-gray-800"
                            style={{ paddingInlineStart: f.depth * 16 }}
                          >
                            {f.name}
                          </span>
                          <span className="shrink-0 text-xs tabular-nums text-gray-500">
                            {f.totalCount === null ? "—" : `${f.totalCount} ฉบับ`}
                          </span>
                          <Button
                            size="icon"
                            variant="ghost"
                            aria-label={`เปลี่ยนชื่อ ${f.name}`}
                            onClick={() => {
                              setEditingId(f.id);
                              setEditingName(f.name);
                            }}
                          >
                            <Pencil className="h-4 w-4" />
                          </Button>
                          <Button
                            size="icon"
                            variant="outline"
                            aria-label={`ลบ ${f.name}`}
                            className="border-red-200 text-red-600 hover:bg-red-50"
                            disabled={busy}
                            onClick={() => void remove(f)}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </>
                      )}
                    </li>
                  ))}
                </ul>
              )}
              <Text className="mt-2 text-xs text-gray-500">
                ลบได้เฉพาะโฟลเดอร์ที่ไม่มีอีเมลและไม่มีโฟลเดอร์ย่อยเหลืออยู่ · ซ้อนได้ลึกสุด{" "}
                {MAIL_FOLDER_DEPTH_MAX} ชั้น
              </Text>
            </div>
          </div>
        </DialogBody>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            ปิด
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
