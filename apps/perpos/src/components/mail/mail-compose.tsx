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
import { useMedia } from "@core/hooks/use-media";
import { ChevronDown, ChevronUp, Paperclip, Send, X } from "lucide-react";
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
import { useMailLocale } from "@/components/mail/mail-locale";
import { MAIL_LOCALE_TAGS, type MailLocale } from "@/lib/mail/i18n";
import { MAX_MESSAGE_BYTES, isEmailAddress, type MailComposeAttachment } from "@/lib/mail/compose";

const AUTOSAVE_MS = 3000;

/** เพดานต่อไฟล์แนบ (MB) — ด่านเดียวกันทั้งกล่องลากวาง (จอใหญ่) และปุ่มคลิปหนีบ (มือถือ) */
const MAX_ATTACHMENT_MB = 25;

/**
 * มือถือ = กล่องเขียนเต็มจอแบบ Gmail (แถบเครื่องมือบนสุด + แถวข้อมูลคั่นด้วยเส้นบาง)
 * จอใหญ่ = dialog ฟอร์มปกติเหมือนเดิม · เกณฑ์เดียวกับ `sm:` ของ Tailwind (640px)
 */
const MOBILE_QUERY = "(max-width: 639px)";

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
  const { locale, t } = useMailLocale();
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
  /** ให้ปุ่มคลิปหนีบบนแถบเครื่องมือ (มือถือ) เปิดหน้าต่างเลือกไฟล์ของ FileDropzone ตัวเดียวกัน */
  const openPickerRef = useRef<(() => void) | null>(null);

  const isMobile = useMedia(MOBILE_QUERY, false);

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
    const timer = setTimeout(() => {
      if (seed?.focus === "body") {
        bodyRef.current?.focus();
        bodyRef.current?.setSelectionRange(0, 0); // เขียนต่อด้านบนข้อความที่อ้างถึง
      } else {
        toRef.current?.focus();
      }
    }, 60);
    return () => clearTimeout(timer);
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

  const addFiles = useCallback(
    async (files: File[]) => {
      for (const file of files) {
        // ด่านขนาดต้องอยู่ตรงนี้ด้วย ไม่ใช่แค่ในกล่องลากวาง — บนมือถือไฟล์เข้ามาทางปุ่มคลิปหนีบ
        // ที่กล่อง (พร้อมข้อความเตือนของมัน) ถูกซ่อนไว้ ⇒ ไฟล์ใหญ่เกินจะเงียบหายถ้าไม่เช็คซ้ำ
        if (file.size > MAX_ATTACHMENT_MB * 1024 * 1024) {
          notify.error(
            null,
            t("compose.attachment.tooLarge", { name: file.name, limit: MAX_ATTACHMENT_MB }),
          );
          continue;
        }
        setUploading((n) => n + 1);
        try {
          const form = new FormData();
          form.append("file", file);
          const res = await fetch("/api/mail/upload", { method: "POST", body: form });
          const data = (await res.json().catch(() => null)) as
            (MailComposeAttachment & { message?: string }) | null;
          if (!res.ok || !data?.blobId) {
            notify.error(
              null,
              data?.message ?? t("compose.attachment.failed", { name: file.name }),
            );
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
    },
    [t],
  );

  // ── ปิด / ส่ง ─────────────────────────────────────────────────────────────
  const closeAndKeepDraft = useCallback(async () => {
    if (!hasContent) {
      onClose();
      return;
    }
    const id = await saveDraft();
    if (!id) {
      // 🔴 ปิดตอนนี้ = ข้อความหายจริง ๆ → ค้างกล่องไว้แล้วบอกให้ชัด
      setError(t("compose.error.draftNotSaved"));
      return;
    }
    notify.success(t("compose.draft.kept"));
    onClose();
  }, [hasContent, onClose, saveDraft, t]);

  const submit = useCallback(() => {
    setError(null);
    const payload = payloadRef.current();
    const recipients = [...payload.to, ...payload.cc, ...payload.bcc];
    if (recipients.length === 0) {
      setError(t("compose.error.noRecipient"));
      return;
    }
    const bad = recipients.filter((r) => !isEmailAddress(r));
    if (bad.length) {
      setError(t("compose.error.badAddress", { list: bad.slice(0, 3).join(", ") }));
      return;
    }
    if (totalBytes * (4 / 3) > MAX_MESSAGE_BYTES) {
      setError(t("compose.error.tooLarge"));
      return;
    }
    if (uploading > 0) {
      setError(t("compose.error.uploading"));
      return;
    }
    setSending(true);
    onSend(payload);
  }, [onSend, t, totalBytes, uploading]);

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

  const title = seed?.inReplyTo ? t("compose.title.reply") : t("compose.title.new");

  /** error อยู่บนสุดเสมอ — เคยอยู่ล่างสุดของกล่องที่เลื่อนได้ กดส่งแล้วเหมือนปุ่มเสีย */
  const errorBanner = error ? (
    <div
      role="alert"
      className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700"
    >
      {error}
    </div>
  ) : null;

  const attachmentList =
    attachments.length > 0 ? (
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
              aria-label={t("compose.attachment.remove", { name: a.name })}
              className="h-7 w-7 shrink-0"
              onClick={() => setAttachments((prev) => prev.filter((x) => x.blobId !== a.blobId))}
            >
              <X className="h-4 w-4" />
            </Button>
          </li>
        ))}
      </ul>
    ) : null;

  /**
   * กล่องลากไฟล์ตัวเดียวของทั้งสองหน้าตา — บนมือถือถูกซ่อน (Gmail ไม่มีพื้นที่ลากวาง)
   * แต่ยังต้องอยู่ใน DOM เพราะปุ่มคลิปหนีบบนแถบเครื่องมือเรียก input ของมันผ่าน `openRef`
   */
  const dropzone = (
    <FileDropzone
      multiple
      onFiles={(files) => void addFiles(files)}
      maxSizeMb={MAX_ATTACHMENT_MB}
      openRef={openPickerRef}
      className={cn(isMobile && "hidden")}
      hint={
        uploading > 0
          ? t("compose.attachment.uploading", { count: uploading })
          : t("compose.attachment.hint")
      }
    />
  );

  const draftStatus = (
    <span
      className={cn("text-xs", saveState === "error" ? "text-red-600" : "text-gray-400")}
      aria-live="polite"
    >
      {saveState === "saving" && t("compose.draft.saving")}
      {saveState === "saved" &&
        savedAt &&
        t("compose.draft.saved", { time: formatClock(savedAt, locale) })}
      {saveState === "error" && t("compose.draft.failed")}
    </span>
  );

  if (isMobile) {
    const fromLabel = identityOptions.find((o) => o.value === identityId)?.label ?? defaultEmail;
    return (
      <Dialog
        open={open}
        onOpenChange={(next) => {
          if (!next) void closeAndKeepDraft();
        }}
      >
        {/* เต็มจอ ไม่มีขอบ/มุมมน — กล่องเขียนบนมือถือคือ "หน้า" ไม่ใช่ป๊อปอัป */}
        <DialogContent
          hideClose
          className="inset-0 h-full max-h-none w-full max-w-none translate-x-0 translate-y-0 rounded-none border-0"
        >
          <DialogTitle className="sr-only">{title}</DialogTitle>

          {/* แถบเครื่องมือบนสุด: ปิด (เก็บร่าง) ซ้าย · แนบไฟล์ + ส่ง ขวา */}
          <div className="flex shrink-0 items-center gap-1 border-b border-gray-200 px-2 py-2">
            <Button
              variant="ghost"
              size="icon"
              aria-label={t("compose.action.close")}
              disabled={sending}
              onClick={() => void closeAndKeepDraft()}
            >
              <X className="h-5 w-5" />
            </Button>
            <div className="flex-1" />
            <Button
              variant="ghost"
              size="icon"
              aria-label={t("compose.action.attach")}
              onClick={() => openPickerRef.current?.()}
            >
              <Paperclip className="h-5 w-5" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              aria-label={sending ? t("compose.action.sending") : t("compose.action.send")}
              disabled={sending || uploading > 0}
              onClick={submit}
            >
              <Send className="h-5 w-5" />
            </Button>
          </div>

          <div className="flex min-h-0 flex-1 flex-col overflow-y-auto" onKeyDown={onKeyDown}>
            {errorBanner && <div className="px-4 pt-3">{errorBanner}</div>}

            <ComposeRow
              label={t("compose.field.toShort")}
              action={
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8 shrink-0 self-center text-gray-400"
                  aria-label={t("compose.field.ccBccToggle")}
                  aria-expanded={showCc}
                  onClick={() => setShowCc((v) => !v)}
                >
                  {showCc ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                </Button>
              }
            >
              <MailRecipientInput
                bare
                id="mail-to"
                value={to}
                onChange={setTo}
                placeholder={t("compose.to.placeholder")}
                autoFocus={seed?.focus !== "body"}
              />
            </ComposeRow>

            {showCc && (
              <>
                <ComposeRow label={t("compose.field.cc")}>
                  <MailRecipientInput bare id="mail-cc" value={cc} onChange={setCc} />
                </ComposeRow>
                <ComposeRow label={t("compose.field.bcc")}>
                  <MailRecipientInput bare id="mail-bcc" value={bcc} onChange={setBcc} />
                </ComposeRow>
              </>
            )}

            <ComposeRow label={t("compose.field.from")}>
              {identityOptions.length > 1 ? (
                <div className="py-1.5">
                  <CustomSelect
                    value={identityId ?? identityOptions[0]!.value}
                    onChange={setIdentityId}
                    options={identityOptions}
                  />
                </div>
              ) : (
                <p className="truncate py-2.5 text-sm text-gray-700">{fromLabel}</p>
              )}
            </ComposeRow>

            <ComposeRow label={t("compose.field.subject")}>
              <Input
                id="mail-subject"
                value={subject}
                onChange={(e) => setSubject(e.target.value)}
                placeholder={t("compose.field.subject")}
                className="rounded-none border-0 px-0 hover:border-0 focus-visible:border-0 focus-visible:ring-0"
              />
            </ComposeRow>

            <Textarea
              id="mail-body"
              ref={bodyRef}
              value={body}
              onChange={(e) => setBody(e.target.value)}
              className="min-h-[40vh] flex-1 rounded-none border-0 px-4 py-3 text-base hover:border-0 focus-visible:border-0 focus-visible:ring-0"
              placeholder={t("compose.body.placeholder")}
            />

            {attachmentList && <div className="px-4 pb-3">{attachmentList}</div>}
            {dropzone}
            <div className="px-4 pb-3">{draftStatus}</div>
          </div>
        </DialogContent>
      </Dialog>
    );
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) void closeAndKeepDraft();
      }}
    >
      <DialogContent size="2xl">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
        </DialogHeader>

        <DialogBody fixedHeight className="space-y-3" onKeyDown={onKeyDown}>
          {errorBanner}
          {identityOptions.length > 1 && (
            <div>
              <Label htmlFor="mail-from">{t("compose.field.from")}</Label>
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
              <Label htmlFor="mail-to">{t("compose.field.to")}</Label>
              {!showCc && (
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-6 px-2 text-xs text-gray-500"
                  onClick={() => setShowCc(true)}
                >
                  {t("compose.field.ccBccToggle")}
                </Button>
              )}
            </div>
            <MailRecipientInput
              id="mail-to"
              value={to}
              onChange={setTo}
              placeholder={t("compose.to.placeholder")}
              autoFocus={seed?.focus !== "body"}
            />
          </div>

          {showCc && (
            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <Label htmlFor="mail-cc">{t("compose.field.cc")}</Label>
                <MailRecipientInput id="mail-cc" value={cc} onChange={setCc} />
              </div>
              <div>
                <Label htmlFor="mail-bcc">{t("compose.field.bcc")}</Label>
                <MailRecipientInput id="mail-bcc" value={bcc} onChange={setBcc} />
              </div>
            </div>
          )}

          <div>
            <Label htmlFor="mail-subject">{t("compose.field.subject")}</Label>
            <Input
              id="mail-subject"
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              className="mt-1"
            />
          </div>

          <div>
            <Label htmlFor="mail-body">{t("compose.field.body")}</Label>
            <Textarea
              id="mail-body"
              ref={bodyRef}
              value={body}
              onChange={(e) => setBody(e.target.value)}
              rows={10}
              className="mt-1"
              placeholder={t("compose.body.placeholder")}
            />
          </div>

          {attachmentList}

          {dropzone}
        </DialogBody>

        <DialogFooter>
          <span className="mr-auto">{draftStatus}</span>
          <Button variant="outline" onClick={() => void closeAndKeepDraft()} disabled={sending}>
            {t("compose.action.keepDraft")}
          </Button>
          <Button onClick={submit} disabled={sending || uploading > 0}>
            {sending ? t("compose.action.sending") : t("compose.action.send")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/**
 * แถวข้อมูลของกล่องเขียนบนมือถือ (Gmail style) — ป้ายซ้าย · ช่องกรอกยืดเต็ม · ปุ่มท้ายแถว
 * เส้นคั่นเป็นของแถว ⇒ ช่องข้างในต้องไม่มีกรอบของตัวเอง (`bare` / `border-0`)
 */
function ComposeRow({
  label,
  action,
  children,
}: {
  label: string;
  action?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className="flex items-start gap-3 border-b border-gray-100 px-4">
      <span className="w-12 shrink-0 py-3 text-sm text-gray-500">{label}</span>
      <div className="min-w-0 flex-1 py-0.5">{children}</div>
      {action}
    </div>
  );
}

function formatClock(d: Date, locale: MailLocale): string {
  return new Intl.DateTimeFormat(MAIL_LOCALE_TAGS[locale], {
    hour: "2-digit",
    minute: "2-digit",
  }).format(d);
}
