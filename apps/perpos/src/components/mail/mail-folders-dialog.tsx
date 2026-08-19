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
import { useMailLocale } from "@/components/mail/mail-locale";

async function callApi<T>(url: string, fallbackMessage: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, {
    ...init,
    headers: init?.body ? { "Content-Type": "application/json" } : undefined,
  });
  const data = (await res.json().catch(() => null)) as (T & { message?: string }) | null;
  if (!res.ok) throw new Error(data?.message ?? fallbackMessage);
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
  const { t } = useMailLocale();
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
    { value: "", label: t("shell.folders.create.parentTop") },
    ...folders
      .filter((f) => f.depth < MAIL_FOLDER_DEPTH_MAX - 1)
      .map((f) => ({ value: f.id, label: f.path })),
  ];

  const create = useCallback(async () => {
    if (!name.trim()) return;
    setBusy(true);
    try {
      await callApi("/api/mail/folders", t("shell.folders.apiFailed"), {
        method: "POST",
        body: JSON.stringify({ name: name.trim(), parentId: parentId || null }),
      });
      setName("");
      setParentId("");
      notify.created(t("shell.folders.created"));
      onChanged();
    } catch (e) {
      notify.error(e, t("shell.folders.createFailed"));
    } finally {
      setBusy(false);
    }
  }, [name, onChanged, parentId, t]);

  const rename = useCallback(
    async (folder: MailFolder) => {
      const next = editingName.trim();
      if (!next || next === folder.name) {
        setEditingId(null);
        return;
      }
      setBusy(true);
      try {
        await callApi(
          `/api/mail/folders/${encodeURIComponent(folder.id)}`,
          t("shell.folders.apiFailed"),
          {
            method: "PATCH",
            body: JSON.stringify({ name: next }),
          },
        );
        setEditingId(null);
        notify.updated(t("shell.folders.renamed"));
        onChanged();
      } catch (e) {
        notify.error(e, t("shell.folders.renameFailed"));
      } finally {
        setBusy(false);
      }
    },
    [editingName, onChanged, t],
  );

  const remove = useCallback(
    async (folder: MailFolder) => {
      setBusy(true);
      try {
        await callApi(
          `/api/mail/folders/${encodeURIComponent(folder.id)}`,
          t("shell.folders.apiFailed"),
          { method: "DELETE" },
        );
        notify.deleted(t("shell.folders.deleted"));
        onChanged();
      } catch (e) {
        notify.error(e, t("shell.folders.deleteFailed"));
      } finally {
        setBusy(false);
      }
    },
    [onChanged, t],
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent size="lg">
        <DialogHeader>
          <DialogTitle>{t("shell.folders.title")}</DialogTitle>
        </DialogHeader>
        <DialogBody>
          <div className="space-y-4">
            <div className="rounded-xl border border-gray-200 p-4">
              <Text className="text-xs font-medium text-gray-500">
                {t("shell.folders.create.section")}
              </Text>
              <div className="mt-2 space-y-3">
                <div>
                  <Label htmlFor="mail-folder-name">{t("shell.folders.create.name")}</Label>
                  <Input
                    id="mail-folder-name"
                    className="mt-1"
                    value={name}
                    maxLength={MAIL_FOLDER_NAME_MAX}
                    placeholder={t("shell.folders.create.namePlaceholder")}
                    onChange={(e) => setName(e.target.value)}
                  />
                </div>
                <div>
                  <Label htmlFor="mail-folder-parent">{t("shell.folders.create.parent")}</Label>
                  <CustomSelect
                    value={parentId}
                    onChange={setParentId}
                    options={parentOptions}
                    className="mt-1"
                  />
                </div>
                <Button disabled={busy || !name.trim()} onClick={() => void create()}>
                  <FolderPlus className="h-4 w-4" />
                  {busy ? t("common.saving") : t("shell.folders.create.submit")}
                </Button>
              </div>
            </div>

            <div>
              <Text className="text-xs font-medium text-gray-500">{t("shell.folders.mine")}</Text>
              {folders.length === 0 ? (
                <div className="mt-2 rounded-xl border border-dashed border-gray-300 px-4 py-8 text-center">
                  <Text className="text-sm text-gray-500">{t("shell.folders.empty")}</Text>
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
                            {t("common.save")}
                          </Button>
                          <Button size="sm" variant="outline" onClick={() => setEditingId(null)}>
                            {t("common.cancel")}
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
                            {f.totalCount === null
                              ? "—"
                              : t("shell.folders.count", { count: f.totalCount })}
                          </span>
                          <Button
                            size="icon"
                            variant="ghost"
                            aria-label={t("shell.folders.renameAria", { name: f.name })}
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
                            aria-label={t("shell.folders.deleteAria", { name: f.name })}
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
                {t("shell.folders.hint", { max: MAIL_FOLDER_DEPTH_MAX })}
              </Text>
            </div>
          </div>
        </DialogBody>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            {t("common.close")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
