"use client";

/**
 * MailReader — บานอ่านเมล (MAIL_UI_SPEC §2 · contract §6.2)
 *
 * 🔴 กฎความปลอดภัยที่ห้ามผ่อนเด็ดขาด (contract §7.2):
 *    HTML ของเมลแสดงใน <iframe srcDoc> ที่ **ห้ามมี `allow-same-origin` เด็ดขาด**
 *    (ค่า sandbox/CSP อยู่ที่ lib/mail/srcdoc.ts ที่เดียว — ห้ามคัดลอกมาไว้ที่นี่)
 *    srcDoc ใส่ <meta http-equiv="Content-Security-Policy"> เป็นบรรทัดแรกของ <head> เสมอ
 *    — CSP คือด่านจริงของการบล็อกรูปนอกและสคริปต์ (DOM strip เป็นชั้นรอง)
 *    ความสูงมาจากสคริปต์ของเราใน frame ที่ postMessage กลับ — **ตรวจ `event.source` เสมอ**
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
  CornerUpLeft,
  CornerUpRight,
  ReplyAll,
  Download,
  Eye,
  FolderInput,
  ImageOff,
  Mail,
  Paperclip,
  Star,
  Trash2,
} from "lucide-react";
import cn from "@core/utils/class-names";
import { Button } from "@/components/ui/button";
import { Dropdown } from "@/components/ui/dropdown";
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
  MailFolder,
  MailMessageDetail,
  MailThreadDetail,
} from "@/lib/mail/types";
import { formatMailDateTime, formatMailSize, mailDisplayName } from "@/lib/mail/format";
import {
  MAIL_HEIGHT_MESSAGE,
  MAIL_HEIGHT_PING,
  MAIL_IFRAME_FALLBACK_HEIGHT,
  MAIL_IFRAME_MAX_HEIGHT,
  MAIL_IFRAME_MIN_HEIGHT,
  MAIL_IFRAME_SANDBOX,
  buildMailSrcdoc,
} from "@/lib/mail/srcdoc";

const INLINE_IMAGE_TYPES = new Set(["image/png", "image/jpeg", "image/gif", "image/webp"]);

function addressList(list: MailAddress[]): string {
  if (!list.length) return "—";
  return list.map((a) => (a.name?.trim() ? `${a.name} <${a.email}>` : a.email)).join(", ");
}

/**
 * 🔴 ต้องส่ง `type` ไปด้วยเสมอ — ไม่งั้น route ตกไปเป็น `application/octet-stream`
 *    ซึ่งไม่อยู่ใน allowlist ของรูป ⇒ ตอบ `Content-Disposition: attachment` + `nosniff`
 *    ⇒ ปุ่ม "ดู" (แสดงรูปใน <Image>) โหลดไม่ขึ้นทุกกรณี
 *    (ปลอดภัย: route ยัง allowlist ชนิดไฟล์เองอยู่แล้ว ไม่ได้เชื่อค่าที่ส่งมาดิบ ๆ)
 */
function attachmentUrl(a: MailAttachment, download: boolean): string {
  const params = new URLSearchParams({ name: a.name, type: a.type });
  if (download) params.set("download", "1");
  return `/api/mail/attachments/${encodeURIComponent(a.blobId)}?${params.toString()}`;
}

export interface MailReaderProps {
  detail: MailThreadDetail | null;
  loading: boolean;
  error: string | null;
  /** ฉบับล่าสุดในเธรดติดดาวอยู่ไหม (สถานะมาจากรายการ) */
  flagged: boolean;
  /** ยืนอยู่ในกล่องคลังเก็บ/ถังขยะแล้ว = ปุ่มนั้นไม่มีผล ห้ามแสดง (contract §6) */
  canArchive?: boolean;
  canTrash?: boolean;
  onRetry: () => void;
  onBack: () => void;
  onArchive: () => void;
  onTrash: () => void;
  onToggleStar: () => void;
  /**
   * บานอ่าน "ยืนเดี่ยว" — กินพื้นที่ทั้งหมดโดยไม่มีรายการอยู่ข้าง ๆ (มุมมองรายการ / จอแคบ)
   * มีผล 2 อย่างที่มาจากเหตุผลเดียวกัน:
   *  1. ต้องเห็นปุ่ม "กลับไปรายการ" เสมอ — ไม่งั้นเปิดเมลแล้วออกไม่ได้นอกจากกด Esc (ผู้ใช้ไม่รู้)
   *  2. คอลัมน์เนื้อหากว้างขึ้น — ค่า `max-w-3xl` ตั้งไว้ตอนบานอ่านแบ่งจอกับรายการ
   *     พอกินเต็มจอแล้วยังคับเท่าเดิม จะเหลือขอบขาวสองข้างเป็นบริเวณกว้าง
   */
  standalone?: boolean;
  /** M3 — โฟลเดอร์ที่ย้ายไปได้ (ว่าง = ยังไม่มีโฟลเดอร์ ⇒ ไม่แสดงปุ่ม) */
  moveTargets?: MailFolder[];
  onMove?: (folder: MailFolder) => void;
  /** M2 — เปิดกล่องเขียนโดยเติมค่าจากฉบับล่าสุดในเธรด */
  onReply: () => void;
  onReplyAll: () => void;
  onForward: () => void;
}

export function MailReader({
  detail,
  loading,
  error,
  flagged,
  canArchive = true,
  canTrash = true,
  standalone = false,
  onRetry,
  onBack,
  onArchive,
  onTrash,
  onToggleStar,
  moveTargets = [],
  onMove,
  onReply,
  onReplyAll,
  onForward,
}: MailReaderProps) {
  if (loading) return <ReaderSkeleton onBack={onBack} standalone={standalone} />;

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
      canArchive={canArchive}
      canTrash={canTrash}
      standalone={standalone}
      onBack={onBack}
      onArchive={onArchive}
      onTrash={onTrash}
      onToggleStar={onToggleStar}
      moveTargets={moveTargets}
      onMove={onMove}
      onReply={onReply}
      onReplyAll={onReplyAll}
      onForward={onForward}
    />
  );
}

function ThreadView({
  detail,
  flagged,
  canArchive,
  canTrash,
  standalone,
  onBack,
  onArchive,
  onTrash,
  onToggleStar,
  moveTargets,
  onMove,
  onReply,
  onReplyAll,
  onForward,
}: {
  detail: MailThreadDetail;
  flagged: boolean;
  canArchive: boolean;
  canTrash: boolean;
  standalone: boolean;
  onBack: () => void;
  onArchive: () => void;
  onTrash: () => void;
  onToggleStar: () => void;
  moveTargets: MailFolder[];
  onMove?: (folder: MailFolder) => void;
  onReply: () => void;
  onReplyAll: () => void;
  onForward: () => void;
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
          title="กลับไปรายการ (Esc)"
          className={cn("shrink-0", !standalone && "lg:hidden")}
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
          {moveTargets.length > 0 && onMove && (
            <Dropdown
              label="ย้ายไป"
              placement="bottom-end"
              className="h-9"
              minWidth={220}
              leadingIcon={<FolderInput className="h-4 w-4" />}
              items={moveTargets.map((f) => ({
                key: f.id,
                label: f.path,
                onClick: () => onMove(f),
              }))}
            />
          )}
          {canArchive && (
            <Button
              variant="ghost"
              size="icon"
              title="เก็บเข้าคลัง (e)"
              aria-label="เก็บเข้าคลัง"
              onClick={onArchive}
            >
              <Archive className="h-4 w-4" />
            </Button>
          )}
          {/* ปุ่มลบต้องไม่ "หน้าตาเหมือนเพื่อนบ้าน" — เคยคลิกพลาดจนเมลตกถังขยะตอนเทส
              → คั่นด้วยเส้น + เว้นระยะ + ใช้ variant outline โทนแดง (ไม่ใช่ ghost เหมือนอีก 2 ปุ่ม) */}
          {canTrash && (
            <>
              <span aria-hidden className="mx-1 h-5 w-px bg-gray-200" />
              <Button
                variant="outline"
                size="icon"
                title="ลบ (#)"
                aria-label="ลบ"
                className="border-red-200 text-red-600 hover:border-red-300 hover:bg-red-50 hover:text-red-700"
                onClick={onTrash}
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            </>
          )}
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto">
        <div
          className={cn("mx-auto w-full px-3 py-4 sm:px-5", standalone ? "max-w-5xl" : "max-w-3xl")}
        >
          {/* เธรดยาวถูกตัดให้เหลือฉบับล่าสุด — ต้องบอกผู้ใช้ ห้ามหายเงียบ */}
          {detail.totalMessages > messages.length && (
            <div className="mb-3 rounded-lg border border-gray-200 bg-gray-50 px-3 py-2">
              <Text className="text-xs text-gray-500">
                เธรดนี้มี {detail.totalMessages} ฉบับ — แสดง {messages.length} ฉบับล่าสุด
              </Text>
            </div>
          )}
          <div className="space-y-3">
            {messages.map((m, i) => (
              <div key={m.id} ref={i === messages.length - 1 ? latestRef : undefined}>
                <MessageCard message={m} open={expanded.has(m.id)} onToggle={() => toggle(m.id)} />
              </div>
            ))}
          </div>

          {/* ปุ่มตอบอยู่ท้ายเธรด = ตำแหน่งที่สายตาอยู่พอดีหลังอ่านจบ (คีย์ลัด r / a / f ทำอย่างเดียวกัน) */}
          <div className="mt-4 flex flex-wrap gap-2">
            <Button variant="outline" size="sm" onClick={onReply} title="ตอบ (r)">
              <CornerUpLeft className="h-4 w-4" />
              ตอบ
            </Button>
            <Button variant="outline" size="sm" onClick={onReplyAll} title="ตอบทั้งหมด (a)">
              <ReplyAll className="h-4 w-4" />
              ตอบทั้งหมด
            </Button>
            <Button variant="outline" size="sm" onClick={onForward} title="ส่งต่อ (f)">
              <CornerUpRight className="h-4 w-4" />
              ส่งต่อ
            </Button>
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

  /**
   * nonce ของ CSP — **สุ่มใหม่ทุกครั้งที่ประกอบ srcdoc** ห้ามคงที่/เดาได้
   * (เดาได้เมื่อไร สคริปต์ที่หลุด sanitizer มาก็แนบ nonce เองแล้วรันได้)
   */
  const srcDoc = useMemo(() => {
    if (!bodyHtml) return null;
    return buildMailSrcdoc(bodyHtml, {
      showImages: !!imagesHtml,
      nonce: crypto.randomUUID().replaceAll("-", ""),
    });
  }, [bodyHtml, imagesHtml]);

  /**
   * ความสูงมาจากสคริปต์วัดข้างใน frame (`postMessage`) — ดูเหตุผลที่ต้องทำแบบนี้ใน `srcdoc.ts`
   *
   * 🔴 origin ของ frame เป็น `"null"` (sandbox ไม่มี allow-same-origin ตามที่ต้องเป็น)
   *    ⇒ ตรวจ origin ไม่ได้ **ต้องเทียบ `event.source` กับ contentWindow ของ frame เรา**
   *    ไม่งั้นหน้าอื่น/โฆษณาใน iframe ใดก็ยิงข้อความมาปรับความสูงเล่นได้
   */
  const frameRef = useRef<HTMLIFrameElement>(null);
  const [frameHeight, setFrameHeight] = useState<number | null>(null);

  useEffect(() => {
    if (!srcDoc) return;
    setFrameHeight(null);
    let done = false;

    const onMessage = (e: MessageEvent) => {
      if (!frameRef.current || e.source !== frameRef.current.contentWindow) return;
      const data = e.data as { type?: unknown; height?: unknown } | null;
      if (!data || data.type !== MAIL_HEIGHT_MESSAGE) return;
      if (typeof data.height !== "number" || !Number.isFinite(data.height)) return;
      done = true;
      setFrameHeight(
        Math.min(Math.max(Math.ceil(data.height), MAIL_IFRAME_MIN_HEIGHT), MAIL_IFRAME_MAX_HEIGHT),
      );
    };
    window.addEventListener("message", onMessage);

    /**
     * ถามซ้ำ — `srcdoc` เริ่มโหลดตั้งแต่ React แทรก iframe ลง DOM ซึ่งเกิด**ก่อน** effect นี้
     * ⇒ ความสูงใบแรกที่ frame ส่งมาหายเสมอถ้ารออย่างเดียว (เจอจริงตอนเทส ไม่ใช่ทฤษฎี)
     */
    const ping = () =>
      frameRef.current?.contentWindow?.postMessage({ type: MAIL_HEIGHT_PING }, "*");
    ping();
    const pings = [50, 200, 600, 1200].map((ms) => setTimeout(ping, ms));
    // วัดไม่สำเร็จใน 2 วิ (สคริปต์ถูกบล็อก/เบราว์เซอร์เก่า) → ใช้ความสูงสำรอง แล้วให้ frame เลื่อนในตัว
    const fallback = setTimeout(() => {
      if (!done) setFrameHeight(MAIL_IFRAME_FALLBACK_HEIGHT);
    }, 2000);

    return () => {
      for (const t of pings) clearTimeout(t);
      clearTimeout(fallback);
      window.removeEventListener("message", onMessage);
    };
  }, [srcDoc]);

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
                <iframe
                  ref={frameRef}
                  title="เนื้อหาอีเมล"
                  // 🔴 ห้ามเติม allow-same-origin เด็ดขาด (contract §7.2 · มีเทสจับ)
                  sandbox={MAIL_IFRAME_SANDBOX}
                  srcDoc={srcDoc}
                  referrerPolicy="no-referrer"
                  onLoad={() =>
                    frameRef.current?.contentWindow?.postMessage({ type: MAIL_HEIGHT_PING }, "*")
                  }
                  // ยังไม่รู้ความสูง = ใช้ค่าตั้งต้นไปก่อน (จอไม่กระโดดตอนค่าจริงมาถึงใน ~100ms)
                  style={{ height: frameHeight ?? MAIL_IFRAME_MIN_HEIGHT }}
                  className="w-full rounded-lg border border-gray-100 bg-white"
                />
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

function ReaderSkeleton({ onBack, standalone }: { onBack: () => void; standalone: boolean }) {
  return (
    <div className="flex h-full min-h-0 flex-col bg-white">
      <div className="flex items-center gap-2 border-b border-gray-200 px-3 py-2.5">
        <Button
          variant="ghost"
          size="icon"
          aria-label="กลับไปรายการ"
          className={cn("shrink-0", !standalone && "lg:hidden")}
          onClick={onBack}
        >
          <ChevronLeft className="h-5 w-5" />
        </Button>
        <Skeleton className="h-5 w-2/3" />
      </div>
      <div className={cn("mx-auto w-full px-5 py-5", standalone ? "max-w-5xl" : "max-w-3xl")}>
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
