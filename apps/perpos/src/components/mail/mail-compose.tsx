"use client";

/**
 * กล่องเขียนเมล (M2 · MAIL_UI_SPEC §4)
 *
 * กฎที่ห้ามพัง:
 *  - **ปิดกล่องทั้งที่มีเนื้อหา = เก็บเป็นร่าง ไม่ถาม** (ไม่มี dialog ยืนยัน — ร่างไม่เคยหาย)
 *  - **เซฟร่างอัตโนมัติทุก 3 วิ** แสดงผลเป็นข้อความจาง ๆ มุมซ้ายล่าง **ไม่ใช่ toast**
 *  - ส่งแล้ว **ยังไม่ส่งจริงทันที** — ผู้เรียกหน่วง 8 วิ พร้อม toast "เลิกทำ" (กันส่งผิดคน
 *    ซึ่งเป็นความผิดพลาดที่แก้ไม่ได้) · กล่องนี้แค่ยิง `onSend(draft)` ให้ผู้เรียกจัดคิว
 *  - `⌘/Ctrl+Enter` = ส่ง (คีย์ลัดในกล่องเขียน — ทำงานแม้โฟกัสอยู่ใน textarea)
 *  - ร่างต้องส่ง `draftId` เดิมกลับทุกครั้ง ไม่งั้นได้ร่างซ้ำกองใน Drafts
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Paperclip, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { CustomSelect } from "@/components/ui/custom-select";
import { FileDropzone } from "@/components/ui/file-dropzone";
import { Text } from "@/components/ui/typography";
import { notify } from "@/lib/toast";
import { formatMailSize } from "@/lib/mail/format";
import { MAX_MESSAGE_BYTES, parseRecipients } from "@/lib/mail/compose";
import type { MailComposeAttachment } from "@/lib/mail/compose";

const AUTOSAVE_MS = 3000;

export interface MailIdentityOption {
  id: string;
  name: string | null;
  email: string;
}

/** ค่าตั้งต้นของกล่อง — มาจากปุ่ม "เขียน" (ว่าง) หรือ ตอบ/ตอบทั้งหมด/ส่งต่อ */
export interface MailComposeSeed {
  to?: string[];
  cc?: string[];
  subject?: string;
  body?: string;
  inReplyTo?: string | null;
  references?: string[];
  /** ตำแหน่งเคอร์เซอร์ตอนเปิด: ผู้รับ (เมลใหม่) หรือ เนื้อหา (ตอบ/ส่งต่อ) */
  focus?: "to" | "body";
}

export interface MailDraftPayload {
  draftId: string | null;
  identityId: string | null;
  to: string[];
  cc: string[];
  bcc: string[];
  subject: string;
  body: string;
  attachments: MailComposeAttachment[];
  inReplyTo: string | null;
  references: string[];
}

export function MailCompose({
  open,
  seed,
  identities,
  onClose,
  onSend,
}: {
  open: boolean;
  seed: MailComposeSeed | null;
  identities: MailIdentityOption[];
  /** ปิดกล่อง (ร่างถูกเก็บให้แล้วถ้ามีเนื้อหา) */
  onClose: () => void;
  /** ผู้เรียกรับไปเข้าคิว "ส่งใน 8 วิ + เลิกทำ" */
  onSend: (draft: MailDraftPayload) => void;
}) {
  const [identityId, setIdentityId] = useState<string | null>(null);
  const [to, setTo] = useState("");
  const [cc, setCc] = useState("");
  const [bcc, setBcc] = useState("");
  const [showCc, setShowCc] = useState(false);
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [attachments, setAttachments] = useState<MailComposeAttachment[]>([]);
  const [uploading, setUploading] = useState(0);
  const [draftId, setDraftId] = useState<string | null>(null);
  const [savedAt, setSavedAt] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const bodyRef = useRef<HTMLTextAreaElement>(null);
  const toRef = useRef<HTMLInputElement>(null);

  // เปิดกล่องใหม่ = ล้างของเก่าทั้งหมด แล้วเติมค่าตั้งต้น
  useEffect(() => {
    if (!open) return;
    setIdentityId(null);
    setTo((seed?.to ?? []).join(", "));
    setCc((seed?.cc ?? []).join(", "));
    setShowCc((seed?.cc ?? []).length > 0);
    setBcc("");
    setSubject(seed?.subject ?? "");
    setBody(seed?.body ?? "");
    setAttachments([]);
    setDraftId(null);
    setSavedAt(null);
    setError(null);
    setSending(false);
    const t = setTimeout(() => {
      if (seed?.focus === "body") {
        bodyRef.current?.focus();
        bodyRef.current?.setSelectionRange(0, 0); // เขียนต่อด้านบนข้อความที่อ้างถึง
      } else {
        toRef.current?.focus();
      }
    }, 60);
    return () => clearTimeout(t);
  }, [open, seed]);

  const hasContent = useMemo(
    () =>
      Boolean(to.trim() || cc.trim() || bcc.trim() || subject.trim() || body.trim()) ||
      attachments.length > 0,
    [attachments.length, bcc, body, cc, subject, to],
  );

  const buildPayload = useCallback(
    (): MailDraftPayload => ({
      draftId,
      identityId,
      to: splitAddresses(to),
      cc: splitAddresses(cc),
      bcc: splitAddresses(bcc),
      subject: subject.trim(),
      body,
      attachments,
      inReplyTo: seed?.inReplyTo ?? null,
      references: seed?.references ?? [],
    }),
    [attachments, bcc, body, cc, draftId, identityId, seed, subject, to],
  );

  const payloadRef = useRef(buildPayload);
  payloadRef.current = buildPayload;

  // ── ร่างอัตโนมัติ ─────────────────────────────────────────────────────────
  const saveDraft = useCallback(async (): Promise<string | null> => {
    const payload = payloadRef.current();
    setSaving(true);
    try {
      const res = await fetch("/api/mail/drafts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = (await res.json().catch(() => null)) as {
        draftId?: string;
        message?: string;
      } | null;
      if (!res.ok || !data?.draftId) return null;
      setDraftId(data.draftId);
      setSavedAt(new Date().toISOString());
      return data.draftId;
    } catch {
      return null; // เซฟร่างพลาดห้ามรบกวนผู้ใช้ — รอบหน้าอีก 3 วิ
    } finally {
      setSaving(false);
    }
  }, []);

  const dirtyRef = useRef(false);
  useEffect(() => {
    if (!open) return;
    dirtyRef.current = true;
  }, [to, cc, bcc, subject, body, attachments, open]);

  useEffect(() => {
    if (!open) return;
    const id = setInterval(() => {
      if (!dirtyRef.current || !hasContent) return;
      dirtyRef.current = false;
      void saveDraft();
    }, AUTOSAVE_MS);
    return () => clearInterval(id);
  }, [hasContent, open, saveDraft]);

  // ── ไฟล์แนบ ───────────────────────────────────────────────────────────────
  const totalBytes = attachments.reduce((sum, a) => sum + a.size, 0);

  const addFiles = useCallback(async (files: File[]) => {
    for (const file of files) {
      setUploading((n) => n + 1);
      try {
        const form = new FormData();
        form.append("file", file);
        const res = await fetch("/api/mail/upload", { method: "POST", body: form });
        const data = (await res.json().catch(() => null)) as
          (MailComposeAttachment & { message?: string }) | null;
        if (!res.ok || !data?.blobId) {
          notify.error(null, data?.message ?? `แนบไฟล์ "${file.name}" ไม่สำเร็จ`);
          continue;
        }
        setAttachments((prev) => [
          ...prev,
          { blobId: data.blobId, name: data.name, type: data.type, size: data.size },
        ]);
      } finally {
        setUploading((n) => n - 1);
      }
    }
  }, []);

  // ── ปิด / ส่ง ─────────────────────────────────────────────────────────────
  const closeAndKeepDraft = useCallback(async () => {
    if (hasContent) {
      const id = await saveDraft();
      if (id) notify.success("เก็บเป็นร่างแล้ว");
    }
    onClose();
  }, [hasContent, onClose, saveDraft]);

  const submit = useCallback(() => {
    setError(null);
    const payload = payloadRef.current();
    const recipients = [...payload.to, ...payload.cc, ...payload.bcc];
    if (recipients.length === 0) {
      setError("ยังไม่ได้ใส่ผู้รับ");
      return;
    }
    const bad = recipients.filter((r) => parseRecipients(r).invalid.length > 0);
    if (bad.length) {
      setError(`ที่อยู่อีเมลไม่ถูกต้อง: ${bad.slice(0, 3).join(", ")}`);
      return;
    }
    if (totalBytes * (4 / 3) > MAX_MESSAGE_BYTES) {
      setError("ไฟล์แนบรวมกันเกิน 25 MB");
      return;
    }
    if (uploading > 0) {
      setError("รอไฟล์แนบอัปโหลดให้เสร็จก่อน");
      return;
    }
    setSending(true);
    onSend(payload);
  }, [onSend, totalBytes, uploading]);

  // ⌘/Ctrl+Enter ส่งได้จากทุกช่องในกล่อง (รวม textarea)
  const onKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
        e.preventDefault();
        submit();
      }
    },
    [submit],
  );

  const identityOptions = useMemo(
    () =>
      identities.map((i) => ({
        value: i.id,
        label: i.name ? `${i.name} <${i.email}>` : i.email,
      })),
    [identities],
  );

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) void closeAndKeepDraft();
      }}
    >
      <DialogContent size="2xl">
        <DialogHeader>
          <DialogTitle>{seed?.inReplyTo ? "ตอบอีเมล" : "เขียนอีเมล"}</DialogTitle>
        </DialogHeader>

        <DialogBody fixedHeight className="space-y-3" onKeyDown={onKeyDown}>
          {identityOptions.length > 1 && (
            <div>
              <Label htmlFor="mail-from">จาก</Label>
              <CustomSelect
                value={identityId ?? identityOptions[0]!.value}
                onChange={setIdentityId}
                options={identityOptions}
                className="mt-1"
              />
            </div>
          )}

          <div>
            <div className="flex items-center justify-between">
              <Label htmlFor="mail-to">ถึง *</Label>
              {!showCc && (
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-6 px-2 text-xs text-gray-500"
                  onClick={() => setShowCc(true)}
                >
                  สำเนา / สำเนาลับ
                </Button>
              )}
            </div>
            <Input
              id="mail-to"
              ref={toRef}
              value={to}
              onChange={(e) => setTo(e.target.value)}
              placeholder="name@example.com, คั่นหลายคนด้วย ,"
              className="mt-1"
            />
          </div>

          {showCc && (
            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <Label htmlFor="mail-cc">สำเนา</Label>
                <Input
                  id="mail-cc"
                  value={cc}
                  onChange={(e) => setCc(e.target.value)}
                  className="mt-1"
                />
              </div>
              <div>
                <Label htmlFor="mail-bcc">สำเนาลับ</Label>
                <Input
                  id="mail-bcc"
                  value={bcc}
                  onChange={(e) => setBcc(e.target.value)}
                  className="mt-1"
                />
              </div>
            </div>
          )}

          <div>
            <Label htmlFor="mail-subject">หัวเรื่อง</Label>
            <Input
              id="mail-subject"
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              className="mt-1"
            />
          </div>

          <div>
            <Label htmlFor="mail-body">เนื้อหา</Label>
            <textarea
              id="mail-body"
              ref={bodyRef}
              value={body}
              onChange={(e) => setBody(e.target.value)}
              rows={10}
              className="mt-1 w-full rounded-lg border border-gray-200 px-3 py-2 text-sm outline-none transition-colors placeholder:text-gray-400 focus:border-primary"
              placeholder="พิมพ์ข้อความ…"
            />
          </div>

          {attachments.length > 0 && (
            <ul className="space-y-1.5">
              {attachments.map((a) => (
                <li
                  key={a.blobId}
                  className="flex items-center gap-2 rounded-lg border border-gray-200 px-3 py-2"
                >
                  <Paperclip className="h-4 w-4 shrink-0 text-gray-400" />
                  <span className="min-w-0 flex-1 truncate text-sm text-gray-700">{a.name}</span>
                  <span className="shrink-0 text-xs tabular-nums text-gray-400">
                    {formatMailSize(a.size)}
                  </span>
                  <Button
                    variant="ghost"
                    size="icon"
                    aria-label={`เอา ${a.name} ออก`}
                    className="h-7 w-7 shrink-0"
                    onClick={() =>
                      setAttachments((prev) => prev.filter((x) => x.blobId !== a.blobId))
                    }
                  >
                    <X className="h-4 w-4" />
                  </Button>
                </li>
              ))}
            </ul>
          )}

          <FileDropzone
            multiple
            onFiles={(files) => void addFiles(files)}
            maxSizeMb={25}
            hint={
              uploading > 0
                ? `กำลังอัปโหลด ${uploading} ไฟล์…`
                : "ลากไฟล์มาวางได้ · รวมกันไม่เกิน 25 MB"
            }
          />

          {error && <Text className="text-sm text-red-600">{error}</Text>}
        </DialogBody>

        <DialogFooter>
          <span className="mr-auto text-xs text-gray-400">
            {saving ? "กำลังบันทึกร่าง…" : savedAt ? "✓ บันทึกร่างแล้ว" : ""}
          </span>
          <Button variant="outline" onClick={() => void closeAndKeepDraft()} disabled={sending}>
            เก็บเป็นร่าง
          </Button>
          <Button onClick={submit} disabled={sending || uploading > 0}>
            {sending ? "กำลังส่ง…" : "ส่ง"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/** ตัดเป็นรายที่อยู่ตามตัวคั่นเดียวกับฝั่งเซิร์ฟเวอร์ — ตรวจความถูกต้องที่ `parseRecipients` */
function splitAddresses(raw: string): string[] {
  return raw
    .split(/[,;\n]+/)
    .map((s) => s.trim())
    .filter(Boolean);
}
