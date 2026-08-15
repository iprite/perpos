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
import cn from "@core/utils/class-names";
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
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { CustomSelect } from "@/components/ui/custom-select";
import { FileDropzone } from "@/components/ui/file-dropzone";
import { notify } from "@/lib/toast";
import { formatMailSize } from "@/lib/mail/format";
import { MailRecipientInput } from "@/components/mail/mail-recipients";
import { MAX_MESSAGE_BYTES, isEmailAddress, type MailComposeAttachment } from "@/lib/mail/compose";

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
  /**
   * 🔴 `bcc`/`attachments`/`identityId`/`draftId` ต้องอยู่ในนี้ด้วยเสมอ —
   * ตอน "เลิกทำการส่ง" หรือ "ส่งไม่สำเร็จ" เราเปิดกล่องกลับมาจาก seed ตัวนี้
   * ขาดฟิลด์ไหน = ผู้ใช้เสียของนั้นเงียบ ๆ และร่างเดิมกลายเป็นขยะซ้ำใน Drafts
   */
  bcc?: string[];
  attachments?: MailComposeAttachment[];
  identityId?: string | null;
  draftId?: string | null;
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
  defaultEmail,
  onClose,
  onSend,
}: {
  open: boolean;
  seed: MailComposeSeed | null;
  identities: MailIdentityOption[];
  /** ที่อยู่ของกล่องเมลนี้ — ต้องตรงกับที่ฝั่งเซิร์ฟเวอร์เลือกเมื่อไม่ได้ระบุ identity
   *  (ไม่งั้นช่อง "จาก" โชว์ที่อยู่หนึ่ง แต่ส่งจริงอีกที่อยู่หนึ่ง) */
  defaultEmail: string;
  /** ปิดกล่อง (ร่างถูกเก็บให้แล้วถ้ามีเนื้อหา) */
  onClose: () => void;
  /** ผู้เรียกรับไปเข้าคิว "ส่งใน 8 วิ + เลิกทำ" */
  onSend: (draft: MailDraftPayload) => void;
}) {
  const [identityId, setIdentityId] = useState<string | null>(null);
  const [to, setTo] = useState<string[]>([]);
  const [cc, setCc] = useState<string[]>([]);
  const [bcc, setBcc] = useState<string[]>([]);
  const [showCc, setShowCc] = useState(false);
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [attachments, setAttachments] = useState<MailComposeAttachment[]>([]);
  const [uploading, setUploading] = useState(0);
  const [draftId, setDraftId] = useState<string | null>(null);
  const [saveState, setSaveState] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [savedAt, setSavedAt] = useState<Date | null>(null);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const bodyRef = useRef<HTMLTextAreaElement>(null);
  const toRef = useRef<HTMLInputElement>(null);

  // เปิดกล่องใหม่ = ล้างของเก่าทั้งหมด แล้วเติมค่าตั้งต้น
  useEffect(() => {
    if (!open) return;
    setIdentityId(
      seed?.identityId ??
        identities.find((i) => i.email.toLowerCase() === defaultEmail.toLowerCase())?.id ??
        identities[0]?.id ??
        null,
    );
    setTo(seed?.to ?? []);
    setCc(seed?.cc ?? []);
    setBcc(seed?.bcc ?? []);
    setShowCc((seed?.cc ?? []).length > 0 || (seed?.bcc ?? []).length > 0);
    setSubject(seed?.subject ?? "");
    setBody(seed?.body ?? "");
    setAttachments(seed?.attachments ?? []);
    setDraftId(seed?.draftId ?? null);
    setSavedAt(null);
    setSaveState("idle");
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
  }, [defaultEmail, identities, open, seed]);

  /**
   * "มีของที่ต้องเก็บไหม" — เทียบกับ seed ด้วย ไม่งั้นกด `r` แล้ว Esc จะสร้างร่างเปล่าทุกครั้ง
   * (ข้อความที่อ้างถึงเป็นของที่ระบบใส่เอง ไม่ใช่สิ่งที่ผู้ใช้พิมพ์)
   */
  const hasContent = useMemo(() => {
    const seedBody = seed?.body ?? "";
    const seedSubject = seed?.subject ?? "";
    return (
      to.length > 0 ||
      cc.length > 0 ||
      bcc.length > 0 ||
      subject.trim() !== seedSubject.trim() ||
      body.trim() !== seedBody.trim() ||
      attachments.length > 0
    );
  }, [attachments.length, bcc.length, body, cc.length, seed, subject, to.length]);

  const buildPayload = useCallback(
    (): MailDraftPayload => ({
      draftId,
      identityId,
      to,
      cc,
      bcc,
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
  const saveDraftOnce = useCallback(async (): Promise<string | null> => {
    const payload = payloadRef.current();
    setSaveState("saving");
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
      if (!res.ok || !data?.draftId) {
        setSaveState("error");
        return null;
      }
      setDraftId(data.draftId);
      setSavedAt(new Date());
      setSaveState("saved");
      return data.draftId;
    } catch {
      // ห้ามเงียบ — ผู้ใช้ต้องรู้ว่าตอนนี้ของยังไม่ถูกเก็บ (ก่อนหน้านี้ค้างคำว่า "บันทึกแล้ว")
      setSaveState("error");
      return null;
    }
  }, []);

  /**
   * 🔴 กันเซฟซ้อนกัน — ถ้ารอบก่อนยังไม่ตอบแล้วรอบใหม่เริ่ม ทั้งสองจะมี `draftId` เดิม (หรือ null)
   *    ⇒ สร้างร่างใหม่คนละใบ แต่สั่งลบใบเก่าใบเดียวกัน = **ร่างซ้ำกองใน Drafts**
   *    (เจอจริงตอนทดสอบ 2026-08-15 — ได้ร่างซ้ำ 3 ใบจากการเขียนครั้งเดียว)
   *    รอบที่ซ้อนเข้ามาให้ใช้ผลของรอบที่กำลังวิ่งอยู่แทน
   */
  const pendingSaveRef = useRef<Promise<string | null> | null>(null);

  const saveDraft = useCallback(async (): Promise<string | null> => {
    if (pendingSaveRef.current) return pendingSaveRef.current;
    const run = saveDraftOnce();
    pendingSaveRef.current = run;
    try {
      return await run;
    } finally {
      pendingSaveRef.current = null;
    }
  }, [saveDraftOnce]);

  const dirtyRef = useRef(false);
  useEffect(() => {
    if (!open) return;
    dirtyRef.current = true;
  }, [to, cc, bcc, subject, body, attachments, open]);

  useEffect(() => {
    if (!open) return;
    const id = setInterval(() => {
      if (!dirtyRef.current || !hasContent) return;
      void saveDraft().then((id) => {
        // reset เฉพาะตอนเซฟผ่าน ไม่งั้นเซฟพลาดแล้วจะไม่ลองใหม่จนกว่าผู้ใช้จะพิมพ์เพิ่ม
        if (id) dirtyRef.current = false;
      });
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
    if (!hasContent) {
      onClose();
      return;
    }
    const id = await saveDraft();
    if (!id) {
      // 🔴 ปิดตอนนี้ = ข้อความหายจริง ๆ → ค้างกล่องไว้แล้วบอกให้ชัด
      setError("ยังบันทึกร่างไม่ได้ — ปิดตอนนี้ข้อความจะหาย ลองใหม่อีกครั้ง");
      return;
    }
    notify.success("เก็บเป็นร่างแล้ว");
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
    const bad = recipients.filter((r) => !isEmailAddress(r));
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
          {/* error อยู่บนสุดเสมอ — เคยอยู่ล่างสุดของกล่องที่เลื่อนได้ กดส่งแล้วเหมือนปุ่มเสีย */}
          {error && (
            <div
              role="alert"
              className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700"
            >
              {error}
            </div>
          )}
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
            <MailRecipientInput
              id="mail-to"
              value={to}
              onChange={setTo}
              placeholder="name@example.com — พิมพ์แล้วกด Enter"
              autoFocus={seed?.focus !== "body"}
            />
          </div>

          {showCc && (
            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <Label htmlFor="mail-cc">สำเนา</Label>
                <MailRecipientInput id="mail-cc" value={cc} onChange={setCc} />
              </div>
              <div>
                <Label htmlFor="mail-bcc">สำเนาลับ</Label>
                <MailRecipientInput id="mail-bcc" value={bcc} onChange={setBcc} />
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
            <Textarea
              id="mail-body"
              ref={bodyRef}
              value={body}
              onChange={(e) => setBody(e.target.value)}
              rows={10}
              className="mt-1"
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
        </DialogBody>

        <DialogFooter>
          <span
            className={cn(
              "mr-auto text-xs",
              saveState === "error" ? "text-red-600" : "text-gray-400",
            )}
          >
            {saveState === "saving" && "กำลังบันทึกร่าง…"}
            {saveState === "saved" && savedAt && `✓ บันทึกร่างแล้ว ${formatClock(savedAt)}`}
            {saveState === "error" && "⚠ บันทึกร่างไม่สำเร็จ"}
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

function formatClock(d: Date): string {
  return new Intl.DateTimeFormat("th-TH", { hour: "2-digit", minute: "2-digit" }).format(d);
}
