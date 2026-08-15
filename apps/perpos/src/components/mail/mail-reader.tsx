"use client";

/**
 * MailReader — บานอ่านเมล (MAIL_UI_SPEC §2 · contract §6.2)
 *
 * 🔴 กฎความปลอดภัยที่ห้ามผ่อนเด็ดขาด (contract §7.2):
 *    HTML ของเมลแสดงใน <iframe srcDoc> ที่ sandbox = "allow-popups allow-popups-to-escape-sandbox"
 *    **ห้ามเติม allow-scripts / allow-same-origin ไม่ว่าด้วยเหตุผลใด รวมถึง "เพื่อวัดความสูง"**
 *    → ความสูงจึงเป็นค่าคงที่ + ปุ่ม "ขยาย" แทนการวัดเนื้อหา
 *    srcDoc ประกอบด้วย buildMailSrcdoc() ซึ่งใส่ <meta http-equiv="Content-Security-Policy">
 *    เป็นบรรทัดแรกของ <head> เสมอ — CSP คือด่านจริงของการบล็อกรูปนอก (DOM strip เป็นชั้นรอง)
 *
 * เธรด: กางเฉพาะฉบับล่าสุด · ฉบับอื่นยุบเป็นบรรทัดเดียว
 *  - ยุบ/กางด้วย CSS grid (grid-rows-[0fr] ⇄ [1fr] + overflow-hidden) ไม่วัดความสูง
 *  - **lazy mount**: ฉบับที่ยุบอยู่ต้องไม่มี iframe ใน DOM (เธรด 50 ฉบับ = เบราว์เซอร์ตาย)
 *  - "แสดงรูป" ผูกกับ message id เดียว ห้ามเป็น state รวมทั้งเธรด
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Image from "next/image";
import {
  Archive,
  ChevronLeft,
  Download,
  Eye,
  ImageOff,
  Mail,
  Maximize2,
  Minimize2,
  Paperclip,
  Star,
  Trash2,
} from "lucide-react";
import cn from "@core/utils/class-names";
import { Button } from "@/components/ui/button";
import { Avatar } from "@/components/ui/avatar";
import { Skeleton, SkeletonText } from "@/components/ui/skeleton";
import { Title, Text } from "@/components/ui/typography";
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { notify } from "@/lib/toast";
import type {
  MailAddress,
  MailAttachment,
  MailMessageDetail,
  MailThreadDetail,
} from "@/lib/mail/types";
import { formatMailDateTime, formatMailSize, mailDisplayName } from "@/lib/mail/format";
import { MAIL_IFRAME_SANDBOX, buildMailSrcdoc } from "@/lib/mail/srcdoc";

const INLINE_IMAGE_TYPES = new Set(["image/png", "image/jpeg", "image/gif", "image/webp"]);

function addressList(list: MailAddress[]): string {
  if (!list.length) return "—";
  return list.map((a) => (a.name?.trim() ? `${a.name} <${a.email}>` : a.email)).join(", ");
}

function attachmentUrl(a: MailAttachment, download: boolean): string {
  const params = new URLSearchParams({ name: a.name });
  if (download) params.set("download", "1");
  return `/api/mail/attachments/${encodeURIComponent(a.blobId)}?${params.toString()}`;
}

export interface MailReaderProps {
  detail: MailThreadDetail | null;
  loading: boolean;
  error: string | null;
  /** ฉบับล่าสุดในเธรดติดดาวอยู่ไหม (สถานะมาจากรายการ) */
  flagged: boolean;
  onRetry: () => void;
  onBack: () => void;
  onArchive: () => void;
  onTrash: () => void;
  onToggleStar: () => void;
}

export function MailReader({
  detail,
  loading,
  error,
  flagged,
  onRetry,
  onBack,
  onArchive,
  onTrash,
  onToggleStar,
}: MailReaderProps) {
  if (loading) return <ReaderSkeleton onBack={onBack} />;

  if (error) {
    return (
      <ReaderCenter
        icon={<Mail className="h-8 w-8 text-gray-400" />}
        title="เปิดอีเมลไม่สำเร็จ"
        description={error}
        action={
          <Button size="sm" onClick={onRetry}>
            ลองใหม่
          </Button>
        }
      />
    );
  }

  if (!detail) {
    return (
      <ReaderCenter
        icon={<Mail className="h-8 w-8 text-gray-400" />}
        title="เลือกอีเมลเพื่ออ่าน"
        description="เลือกจากรายการทางซ้าย หรือกด j / k แล้ว Enter"
      />
    );
  }

  return (
    <ThreadView
      detail={detail}
      flagged={flagged}
      onBack={onBack}
      onArchive={onArchive}
      onTrash={onTrash}
      onToggleStar={onToggleStar}
    />
  );
}

function ThreadView({
  detail,
  flagged,
  onBack,
  onArchive,
  onTrash,
  onToggleStar,
}: {
  detail: MailThreadDetail;
  flagged: boolean;
  onBack: () => void;
  onArchive: () => void;
  onTrash: () => void;
  onToggleStar: () => void;
}) {
  const messages = detail.messages;
  const latestId = messages.length ? messages[messages.length - 1]!.id : null;
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set(latestId ? [latestId] : []));
  const latestRef = useRef<HTMLDivElement>(null);

  // เปิดเธรดใหม่ → กางเฉพาะฉบับล่าสุดเสมอ
  useEffect(() => {
    setExpanded(new Set(latestId ? [latestId] : []));
  }, [detail.threadId, latestId]);

  // เธรดเกิน 5 ฉบับ → เลื่อนไปฉบับล่าสุดให้อัตโนมัติ
  useEffect(() => {
    if (messages.length > 5) {
      latestRef.current?.scrollIntoView({ block: "start" });
    }
  }, [detail.threadId, messages.length]);

  const toggle = useCallback((id: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  return (
    <div className="flex h-full min-h-0 flex-col bg-white">
      <div className="flex items-center gap-2 border-b border-gray-200 px-3 py-2.5">
        <Button
          variant="ghost"
          size="icon"
          aria-label="กลับไปรายการ"
          className="shrink-0 lg:hidden"
          onClick={onBack}
        >
          <ChevronLeft className="h-5 w-5" />
        </Button>
        <Title as="h2" className="min-w-0 flex-1 truncate text-base font-semibold text-gray-900">
          {detail.subject?.trim() || "(ไม่มีหัวเรื่อง)"}
        </Title>
        <div className="flex shrink-0 items-center gap-1">
          <Button
            variant="ghost"
            size="icon"
            title="ติดดาว (s)"
            aria-label="ติดดาว"
            aria-pressed={flagged}
            onClick={onToggleStar}
          >
            <Star className={cn("h-4 w-4", flagged && "fill-amber-400 text-amber-500")} />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            title="เก็บเข้าคลัง (e)"
            aria-label="เก็บเข้าคลัง"
            onClick={onArchive}
          >
            <Archive className="h-4 w-4" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            title="ลบ (#)"
            aria-label="ลบ"
            className="text-gray-500 hover:text-red-600"
            onClick={onTrash}
          >
            <Trash2 className="h-4 w-4" />
          </Button>
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto">
        <div className="mx-auto w-full max-w-3xl px-3 py-4 sm:px-5">
          <div className="space-y-3">
            {messages.map((m, i) => (
              <div key={m.id} ref={i === messages.length - 1 ? latestRef : undefined}>
                <MessageCard message={m} open={expanded.has(m.id)} onToggle={() => toggle(m.id)} />
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

function MessageCard({
  message,
  open,
  onToggle,
}: {
  message: MailMessageDetail;
  open: boolean;
  onToggle: () => void;
}) {
  const [expandedHeight, setExpandedHeight] = useState(false);
  const [imagesHtml, setImagesHtml] = useState<string | null>(null);
  const [loadingImages, setLoadingImages] = useState(false);
  const [preview, setPreview] = useState<MailAttachment | null>(null);

  const showImages = useCallback(async () => {
    setLoadingImages(true);
    try {
      const res = await fetch(
        `/api/mail/messages/${encodeURIComponent(message.id)}?by=email&images=1`,
      );
      const data: unknown = await res.json();
      if (!res.ok) {
        const msg = (data as { message?: string })?.message ?? "โหลดรูปในอีเมลไม่สำเร็จ";
        throw new Error(msg);
      }
      const found = (data as MailThreadDetail).messages?.find((x) => x.id === message.id);
      if (!found?.htmlSanitized) throw new Error("ไม่พบเนื้อหาอีเมลฉบับนี้");
      setImagesHtml(found.htmlSanitized);
    } catch (e) {
      notify.error(e, "โหลดรูปในอีเมลไม่สำเร็จ");
    } finally {
      setLoadingImages(false);
    }
  }, [message.id]);

  const bodyHtml = imagesHtml ?? message.htmlSanitized;
  const srcDoc = useMemo(
    () => (bodyHtml ? buildMailSrcdoc(bodyHtml, { showImages: !!imagesHtml }) : null),
    [bodyHtml, imagesHtml],
  );

  return (
    <div className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
      <div
        role="button"
        tabIndex={0}
        onClick={onToggle}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            onToggle();
          }
        }}
        className={cn(
          "flex w-full cursor-pointer items-center gap-3 px-4 py-3 text-left outline-none transition-colors hover:bg-gray-50",
          open && "border-b border-gray-100",
        )}
      >
        <Avatar name={mailDisplayName(message.from)} className="h-9 w-9 shrink-0" />
        <div className="min-w-0 flex-1">
          <div className="flex items-baseline gap-2">
            <span className="truncate text-sm font-semibold text-gray-900">
              {mailDisplayName(message.from)}
            </span>
            {message.from?.name && (
              <span className="hidden truncate text-xs text-gray-400 sm:inline">
                &lt;{message.from.email}&gt;
              </span>
            )}
            <span className="ms-auto shrink-0 text-xs tabular-nums text-gray-500">
              {formatMailDateTime(message.receivedAt)}
            </span>
          </div>
          {open ? (
            <div className="mt-0.5 space-y-0.5">
              <Text className="truncate text-xs text-gray-500">ถึง: {addressList(message.to)}</Text>
              {message.cc.length > 0 && (
                <Text className="truncate text-xs text-gray-500">
                  สำเนา: {addressList(message.cc)}
                </Text>
              )}
            </div>
          ) : (
            <Text className="mt-0.5 truncate text-xs text-gray-400">
              {message.textBody?.trim().slice(0, 140) || "แตะเพื่อกางข้อความนี้"}
            </Text>
          )}
        </div>
      </div>

      {/* ยุบ/กางด้วย CSS grid — ไม่วัดความสูงเนื้อหา (เข้ากับกฎ iframe ที่ไม่มี allow-scripts) */}
      <div
        className={cn(
          "grid overflow-hidden transition-[grid-template-rows] duration-200 ease-out",
          open ? "grid-rows-[1fr]" : "grid-rows-[0fr]",
        )}
      >
        <div className="min-h-0">
          {/* lazy mount: ฉบับที่ยุบอยู่ ห้ามมี iframe ใน DOM */}
          {open && (
            <div className="px-4 py-3">
              {message.hasRemoteImages && !imagesHtml && (
                <div className="mb-3 flex flex-wrap items-center gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2">
                  <ImageOff className="h-4 w-4 shrink-0 text-amber-600" />
                  <span className="text-xs text-amber-700">
                    บล็อกรูปจากภายนอกไว้ เพื่อไม่ให้ผู้ส่งรู้ว่าคุณเปิดอ่าน
                  </span>
                  <Button
                    size="sm"
                    variant="outline"
                    className="ms-auto"
                    disabled={loadingImages}
                    onClick={showImages}
                  >
                    {loadingImages ? "กำลังโหลด…" : "แสดงรูป"}
                  </Button>
                </div>
              )}

              {srcDoc ? (
                <>
                  <iframe
                    title="เนื้อหาอีเมล"
                    // 🔴 ห้ามเติม allow-scripts / allow-same-origin (contract §7.2)
                    sandbox={MAIL_IFRAME_SANDBOX}
                    srcDoc={srcDoc}
                    referrerPolicy="no-referrer"
                    className={cn(
                      "w-full rounded-lg border border-gray-100 bg-white transition-[height]",
                      expandedHeight ? "h-[1600px]" : "h-[60vh]",
                    )}
                  />
                  <div className="mt-2 flex justify-end">
                    <Button
                      size="sm"
                      variant="ghost"
                      className="gap-1.5 text-xs text-gray-500"
                      onClick={() => setExpandedHeight((v) => !v)}
                    >
                      {expandedHeight ? (
                        <Minimize2 className="h-3.5 w-3.5" />
                      ) : (
                        <Maximize2 className="h-3.5 w-3.5" />
                      )}
                      {expandedHeight ? "ย่อความสูง" : "ขยายความสูง"}
                    </Button>
                  </div>
                </>
              ) : (
                <pre className="whitespace-pre-wrap break-words font-sans text-sm leading-relaxed text-gray-700">
                  {message.textBody?.trim() || "(อีเมลฉบับนี้ไม่มีเนื้อหา)"}
                </pre>
              )}

              {message.attachments.length > 0 && (
                <div className="mt-4 space-y-2 border-t border-gray-100 pt-3">
                  {message.attachments.map((a) => (
                    <div
                      key={a.blobId}
                      className="flex flex-wrap items-center gap-2 rounded-lg bg-gray-50 px-3 py-2"
                    >
                      <Paperclip className="h-4 w-4 shrink-0 text-gray-400" />
                      <span className="min-w-0 flex-1 truncate text-sm text-gray-800">
                        {a.name}
                      </span>
                      <span className="shrink-0 text-xs tabular-nums text-gray-500">
                        {formatMailSize(a.sizeBytes)}
                      </span>
                      {INLINE_IMAGE_TYPES.has(a.type) && (
                        <Button size="sm" variant="ghost" onClick={() => setPreview(a)}>
                          <Eye className="h-4 w-4" />
                          ดู
                        </Button>
                      )}
                      <Button size="sm" variant="outline" asChild>
                        <a href={attachmentUrl(a, true)} download={a.name}>
                          <Download className="h-4 w-4" />
                          ดาวน์โหลด
                        </a>
                      </Button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      <Dialog open={!!preview} onOpenChange={(o) => !o && setPreview(null)}>
        <DialogContent size="3xl">
          <DialogHeader>
            <DialogTitle className="truncate">{preview?.name}</DialogTitle>
          </DialogHeader>
          <DialogBody>
            {preview && (
              <Image
                src={attachmentUrl(preview, false)}
                alt={preview.name}
                width={1600}
                height={1200}
                unoptimized
                className="h-auto w-full rounded-lg object-contain"
              />
            )}
          </DialogBody>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function ReaderCenter({
  icon,
  title,
  description,
  action,
}: {
  icon: React.ReactNode;
  title: string;
  description?: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="flex h-full flex-col items-center justify-center bg-white px-6 py-16 text-center">
      <div className="mb-4 rounded-full bg-gray-100 p-4">{icon}</div>
      <p className="text-sm font-medium text-gray-900">{title}</p>
      {description && <p className="mt-1 max-w-sm text-sm text-gray-500">{description}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

function ReaderSkeleton({ onBack }: { onBack: () => void }) {
  return (
    <div className="flex h-full min-h-0 flex-col bg-white">
      <div className="flex items-center gap-2 border-b border-gray-200 px-3 py-2.5">
        <Button
          variant="ghost"
          size="icon"
          aria-label="กลับไปรายการ"
          className="shrink-0 lg:hidden"
          onClick={onBack}
        >
          <ChevronLeft className="h-5 w-5" />
        </Button>
        <Skeleton className="h-5 w-2/3" />
      </div>
      <div className="mx-auto w-full max-w-3xl px-5 py-5">
        <div className="flex items-center gap-3">
          <Skeleton className="h-9 w-9 rounded-lg" />
          <div className="flex-1 space-y-2">
            <Skeleton className="h-3.5 w-48" />
            <Skeleton className="h-3 w-32" />
          </div>
        </div>
        <SkeletonText lines={4} className="mt-6" />
      </div>
    </div>
  );
}
