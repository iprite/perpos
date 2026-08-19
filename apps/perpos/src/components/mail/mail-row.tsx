"use client";

/**
 * MailRow — แถวเมลในรายการ (MAIL_UI_SPEC §2)
 *
 * ทำไมไม่ใช้ <Table>: TableCell เป็น px-4 py-3 + whitespace-nowrap ซึ่งออกแบบมาสำหรับ
 * ข้อมูลตาราง ไม่ใช่รายการ 2 บรรทัดที่ต้องหนาแน่น → ใช้ <ul>/<li> + component นี้แทน
 *
 * กฎที่ห้ามพัง:
 *  - **สูง 64px คงที่** (h-16) — virtualization ของ <MailList> พึ่งความสูงคงที่นี้
 *  - หัวเรื่อง + ตัวอย่างอยู่ **บรรทัดเดียวกัน** คั่นด้วย "—" แล้ว truncate
 *  - จุดยังไม่ได้อ่าน = bg-primary (charcoal) ไม่ใช่สีแดง (DESIGN.md §14: แดง = ผิดพลาดเท่านั้น)
 *  - **ไม่มีคอลัมน์ปุ่ม action** — มีได้แค่ เลือก / ติดดาว ที่หัวแถว
 */

import { memo, useEffect, useRef } from "react";
import {
  Archive,
  FileArchive,
  FileSpreadsheet,
  FileText,
  Image as ImageIcon,
  Mail,
  MailOpen,
  Paperclip,
  Square,
  SquareCheckBig,
  Star,
  Trash2,
} from "lucide-react";
import cn from "@core/utils/class-names";
import { Button } from "@/components/ui/button";
import type { MailAttachment, MailMessage } from "@/lib/mail/types";
import { formatMailTime } from "@/lib/mail/format";
import { useSwipeRow } from "@/components/mail/use-swipe-row";

/**
 * ความสูง **ขั้นต่ำ** ของแถว (px) — เป็นค่าประมาณให้ virtualizer + ความสูงของ skeleton
 *
 * ⚠️ ไม่ใช่ความสูงตายตัวอีกแล้ว: แถวที่มีไฟล์แนบสูงกว่านี้เพราะมีชิปเพิ่มมาอีกบรรทัด
 * (`virtua` วัดขนาดจริงเอง ค่านี้ใช้แค่ก่อนวัด) — เคยล็อกด้วย `h-16` แล้วชิปล้นทับแถวถัดไป
 */
export const MAIL_ROW_HEIGHT = 64;

export interface MailRowProps {
  message: MailMessage;
  /** ถูกติ๊กเลือก (checkbox) */
  selected: boolean;
  /** เป็นฉบับที่เปิดอ่านอยู่ */
  active: boolean;
  /** เป็นแถวที่เคอร์เซอร์คีย์ลัด j/k อยู่ */
  focused: boolean;
  onOpen: () => void;
  onToggleSelect: (shiftKey: boolean) => void;
  onToggleStar: () => void;
  /** M3 — ปัดบนมือถือ (ต้องเป็นตัวเดียวกับปุ่ม/คีย์ลัด เพื่อให้ "เลิกทำ" ใช้ได้เหมือนกัน) */
  onSwipeArchive?: () => void;
  onSwipeTrash?: () => void;
  /** กดชิปไฟล์แนบ → เปิดกล่องดูตัวอย่าง/ดาวน์โหลด (ไม่เปิดเมล) */
  onPreviewAttachment?: (attachment: MailAttachment) => void;
  /** ชื่อกล่องที่เมลฉบับนี้อยู่ — มีเฉพาะตอนผลค้นหาข้ามกล่อง */
  boxLabel?: string;
  /** สลับอ่านแล้ว/ยังไม่ได้อ่าน (ปุ่มลอยตอน hover — เดสก์ท็อป) */
  onToggleRead?: () => void;
}

function senderLabel(m: MailMessage): string {
  return m.from?.name?.trim() || m.from?.email || "(ไม่ระบุผู้ส่ง)";
}

function MailRowBase({
  message,
  selected,
  active,
  focused,
  onOpen,
  onToggleSelect,
  onToggleStar,
  onSwipeArchive,
  onSwipeTrash,
  onPreviewAttachment,
  boxLabel,
  onToggleRead,
}: MailRowProps) {
  const unread = message.isUnread;
  /** ไม่มี action ไหนใช้ได้เลย = ไม่ต้องมีแผงปุ่ม (เช่นในถังขยะที่ลบไม่ได้แล้ว) */
  const hasQuickActions = !!onSwipeArchive || !!onSwipeTrash || !!onToggleRead;
  const subject = message.subject?.trim() || "(ไม่มีหัวเรื่อง)";
  const preview = message.preview?.trim() ?? "";
  const rowRef = useRef<HTMLButtonElement>(null);

  /**
   * roving tabindex — แถวที่เคอร์เซอร์ (j/k) อยู่ คือแถวเดียวที่โฟกัสได้ และย้าย DOM focus ตามจริง
   *
   * 🔴 ห้ามทำให้ "แถว" มีสองทางเปิด: ปุ่มเนื้อหาข้างล่างเป็นทางเดียวที่รับคีย์บอร์ด
   *    ส่วนคีย์ลัดอื่นมาจาก registry (`lib/mail/shortcuts.ts`) ซึ่งเปิด "แถวที่เคอร์เซอร์อยู่"
   *    ถ้าทั้งคู่ตอบ Enter พร้อมกัน จะเปิดคนละฉบับกับที่ตาเห็น (บั๊กเดิม) — ดู `onKeyDown` ของปุ่ม
   *
   * ย้ายโฟกัสเฉพาะตอนโฟกัสยังอยู่ในรายการ (หรือไม่มีที่ไหนเลย) — ไม่งั้นจะไปแย่งโฟกัส
   * จากช่องค้นหา/ปุ่มบนแถบเครื่องมือขณะผู้ใช้กำลังพิมพ์
   */
  useEffect(() => {
    if (!focused) return;
    const el = rowRef.current;
    if (!el) return;
    const ae = document.activeElement;
    const inList =
      !ae || ae === document.body || (ae as HTMLElement).dataset?.mailRow !== undefined;
    if (inList && ae !== el) el.focus({ preventScroll: true });
  }, [focused]);

  const swipe = useSwipeRow({
    onArchive: () => onSwipeArchive?.(),
    onTrash: () => onSwipeTrash?.(),
    enabled: !!onSwipeArchive && !!onSwipeTrash,
  });

  return (
    // แถวเป็น <div> เปล่า ๆ **ไม่มี role="button"** — ข้างในมีปุ่มจริง (เลือก/ติดดาว/เปิด)
    // ปุ่มซ้อนใน role=button คือ HTML ที่ screen reader อ่านไม่ออก · onClick ที่นี่มีไว้ให้เมาส์
    // คลิกโดนพื้นที่ว่างได้เฉย ๆ ส่วนคีย์บอร์ดใช้ปุ่มเนื้อหาด้านล่าง
    /* min-h ไม่ใช่ h — แถวที่มีชิปไฟล์แนบสูงกว่า 64px (overflow-hidden ยังต้องมีไว้ให้พื้นหลังปัดนิ้ว) */
    <div className="relative min-h-16 w-full overflow-hidden border-b border-gray-100">
      {/* พื้นหลังบอกล่วงหน้าว่าปล่อยนิ้วแล้วจะเกิดอะไร (เขียว=เก็บ · แดง=ลบ) */}
      {swipe.dx !== 0 && (
        <div
          aria-hidden
          className={cn(
            "absolute inset-0 flex items-center justify-between px-4",
            swipe.dx > 0 ? "bg-green-50 text-green-700" : "bg-red-50 text-red-700",
          )}
        >
          <span className={cn("flex items-center gap-1.5 text-sm", swipe.dx <= 0 && "invisible")}>
            <Archive className="h-4 w-4" />
            {swipe.pendingAction === "archive" ? "ปล่อยเพื่อเก็บ" : "เก็บเข้าคลัง"}
          </span>
          <span className={cn("flex items-center gap-1.5 text-sm", swipe.dx >= 0 && "invisible")}>
            {swipe.pendingAction === "trash" ? "ปล่อยเพื่อลบ" : "ลบ"}
            <Trash2 className="h-4 w-4" />
          </span>
        </div>
      )}
      <div
        onClick={onOpen}
        {...swipe.handlers}
        style={swipe.dx ? { transform: `translateX(${swipe.dx}px)` } : undefined}
        className={cn(
          "group relative flex min-h-16 w-full cursor-pointer touch-pan-y items-center gap-2 bg-white px-2 py-1.5 outline-none transition-colors sm:px-3",
          active ? "bg-gray-100" : "hover:bg-gray-50",
          focused && !active && "bg-gray-50",
        )}
      >
        {/* ตำแหน่งเคอร์เซอร์ = แถบซ้าย 3px + พื้นอ่อน — **ห้ามกลับไปใช้กรอบรอบแถว**
            (กรอบ ring รอบทุกด้านทำให้รายการดูเป็นตารางแข็ง ๆ) · ยังผ่าน WCAG 1.4.11
            เพราะแถบ charcoal บนขาวคอนทราสต์ ~10:1 และหนากว่าเส้นรอบรูป 2px ที่กำหนดไว้ */}
        {focused && (
          <span aria-hidden className="absolute inset-y-0 left-0 w-[3px] rounded-e bg-primary" />
        )}
        <Button
          variant="ghost"
          size="icon"
          aria-label={selected ? "ไม่เลือกอีเมลนี้" : "เลือกอีเมลนี้"}
          aria-pressed={selected}
          className="h-10 w-10 shrink-0 text-gray-400 hover:text-gray-700"
          onClick={(e) => {
            e.stopPropagation();
            onToggleSelect(e.shiftKey);
          }}
        >
          {selected ? (
            <SquareCheckBig className="h-4 w-4 text-primary" />
          ) : (
            <Square className="h-4 w-4" />
          )}
        </Button>

        <Button
          variant="ghost"
          size="icon"
          aria-label={message.isFlagged ? "เอาดาวออก" : "ติดดาว"}
          aria-pressed={message.isFlagged}
          className="hidden h-10 w-10 shrink-0 text-gray-300 hover:text-amber-500 sm:inline-flex"
          onClick={(e) => {
            e.stopPropagation();
            onToggleStar();
          }}
        >
          <Star className={cn("h-4 w-4", message.isFlagged && "fill-amber-400 text-amber-500")} />
        </Button>

        {/* จุดยังไม่ได้อ่าน — เว้นที่ไว้เสมอ ไม่ให้แถวขยับ */}
        <span
          aria-hidden="true"
          className={cn(
            "h-1.5 w-1.5 shrink-0 rounded-full",
            unread ? "bg-primary" : "bg-transparent",
          )}
        />

        {/* พื้นที่เนื้อหา = ปุ่มเปิดจริง (raw <button> เพราะต้องเป็นพื้นผิวเปล่าเต็มแถว
          — <Button> ของดีไซน์ระบบมี padding/variant ที่ทำให้แถว 64px เพี้ยน)
          ไม่ผูก onClick เอง: ปล่อยให้ click (ทั้งเมาส์และ Enter/Space) bubble ไปที่ <div> ชั้นนอก
          → เปิดครั้งเดียวเสมอ */}
        <button
          ref={rowRef}
          type="button"
          data-mail-row=""
          tabIndex={focused ? 0 : -1}
          aria-current={active ? "true" : undefined}
          aria-label={`${senderLabel(message)} — ${subject}`}
          // กัน Enter/Space ไม่ให้ลอยไปถึง hotkey ระดับ document (ไม่งั้นเปิดซ้ำสองทาง)
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === " ") e.stopPropagation();
          }}
          className="min-w-0 flex-1 text-start outline-none"
        >
          <div className="flex items-baseline gap-2">
            <span
              className={cn(
                "min-w-0 flex-1 truncate text-sm",
                unread ? "font-semibold text-gray-900" : "font-normal text-gray-700",
              )}
            >
              {senderLabel(message)}
              {message.threadCount > 1 && (
                <span className="ms-1 text-xs font-normal text-gray-400">
                  ({message.threadCount})
                </span>
              )}
            </span>
            {boxLabel && (
              <span className="shrink-0 rounded-full bg-gray-100 px-2 py-0.5 text-xs text-gray-500">
                {boxLabel}
              </span>
            )}
            <span
              className={cn(
                "shrink-0 text-xs tabular-nums text-gray-500",
                // เดสก์ท็อป: hover แล้วเอาเวลาออกเพื่อให้ปุ่มลัดขึ้นแทนที่ (แบบ Gmail)
                hasQuickActions && "sm:group-hover:invisible",
              )}
            >
              {formatMailTime(message.receivedAt)}
            </span>
          </div>

          <div className="mt-0.5 flex items-center gap-2">
            <span className="min-w-0 flex-1 truncate text-sm">
              <span className={cn(unread ? "font-medium text-gray-900" : "text-gray-600")}>
                {subject}
              </span>
              {preview && (
                <span className={cn(unread ? "text-gray-500" : "text-gray-400")}>
                  {" — "}
                  {preview}
                </span>
              )}
            </span>
            {message.hasAttachment && message.attachments.length === 0 && (
              /* มีไฟล์แนบแต่ไม่รู้ชื่อ (เซิร์ฟเวอร์ไม่ได้ส่งมา) — ยังต้องบอกว่ามี */
              <Paperclip aria-label="มีไฟล์แนบ" className="h-3.5 w-3.5 shrink-0 text-gray-400" />
            )}
          </div>

          {/* ชิปไฟล์แนบ (แบบ Gmail) — ดูแล้วรู้ว่าเป็นไฟล์อะไรโดยไม่ต้องเปิดเมล
              ⚠️ แสดงอย่างเดียว กดดาวน์โหลดจากรายการไม่ได้ (รายการไม่พก blobId) */}
          {message.attachments.length > 0 && (
            <div
              className={cn(
                "mt-1 flex flex-wrap items-center gap-1.5",
                // เว้นที่ให้ปุ่มลัดตอน hover — ไม่งั้นชิปตัวขวาสุดอยู่ใต้ปุ่มจนกดเปิดพรีวิวไม่ได้
                hasQuickActions && "sm:group-hover:pe-24",
              )}
            >
              {message.attachments.map((a) => (
                <button
                  key={a.blobId}
                  type="button"
                  title={`${a.name}${a.sizeBytes ? ` · ${formatBytes(a.sizeBytes)}` : ""}`}
                  /* กดชิป = ดูไฟล์ ไม่ใช่เปิดเมล ⇒ ต้องหยุด event ไม่ให้ไหลไปที่แถว */
                  onClick={(e) => {
                    e.stopPropagation();
                    onPreviewAttachment?.(a);
                  }}
                  className="inline-flex max-w-[12rem] items-center gap-1 rounded-full border border-gray-200 bg-white px-2 py-0.5 text-xs text-gray-600 transition-colors hover:border-gray-300 hover:bg-gray-50"
                >
                  <AttachmentIcon type={a.type} />
                  <span className="truncate">{a.name}</span>
                </button>
              ))}
              {message.attachmentCount > message.attachments.length && (
                <span className="text-xs text-gray-400">
                  +{message.attachmentCount - message.attachments.length}
                </span>
              )}
            </div>
          )}
        </button>

        {/*
          ปุ่มลัดตอน hover (เดสก์ท็อปเท่านั้น — มือถือใช้ปัดนิ้วอยู่แล้ว และ hover บนจอสัมผัส
          จะค้างจนบังเวลา) · ทุกปุ่มต้อง stopPropagation ไม่งั้นกดแล้วเปิดเมลไปด้วย
        */}
        {hasQuickActions && (
          <div
            className={cn(
              /* กึ่งกลางแนวตั้งของแถว · ไม่ทับชิปไฟล์แนบเพราะแถวชิปเว้นที่ขวาให้ตอน hover */
              "absolute right-2 top-1/2 hidden -translate-y-1/2 items-center gap-0.5 rounded-lg px-1 shadow-sm",
              /* 🔴 hover อย่างเดียว — เคยใส่ `group-focus-within` ด้วย แล้วแถวที่เคอร์เซอร์คีย์บอร์ด
                 (j/k) หรือโฟกัสค้างอยู่ โชว์ปุ่มค้างพร้อมกับแถวที่เมาส์ชี้ = ดูเหมือนบั๊ก
                 คีย์บอร์ดมีคีย์ลัดของตัวเองอยู่แล้ว (e/# ฯลฯ) จึงไม่เสียการเข้าถึง */
              "sm:group-hover:flex",
              /* พื้นต้องเป็นสีเดียวกับแถวตอนนั้น ไม่งั้นเห็นเป็นกล่องขาวแปะบนพื้นเทา */
              active ? "bg-gray-100" : "bg-gray-50",
            )}
          >
            {onSwipeArchive && (
              <QuickAction
                label="เก็บเข้าคลัง"
                icon={<Archive className="h-4 w-4" />}
                onClick={onSwipeArchive}
              />
            )}
            {onSwipeTrash && (
              <QuickAction
                label="ลบ"
                icon={<Trash2 className="h-4 w-4" />}
                onClick={onSwipeTrash}
                danger
              />
            )}
            {onToggleRead && (
              <QuickAction
                label={unread ? "ทำเป็นอ่านแล้ว" : "ทำเป็นยังไม่ได้อ่าน"}
                icon={unread ? <MailOpen className="h-4 w-4" /> : <Mail className="h-4 w-4" />}
                onClick={onToggleRead}
              />
            )}
          </div>
        )}
      </div>
    </div>
  );
}

/** ปุ่มลัดในแถว — เล็ก เทา และ **ห้ามให้คลิกไหลไปเปิดเมล** */
function QuickAction({
  label,
  icon,
  onClick,
  danger,
}: {
  label: string;
  icon: React.ReactNode;
  onClick: () => void;
  danger?: boolean;
}) {
  return (
    <Button
      size="icon"
      variant="ghost"
      className={cn("h-8 w-8 text-gray-500", danger && "hover:text-red-600")}
      title={label}
      aria-label={label}
      onClick={(e) => {
        e.stopPropagation();
        onClick();
      }}
    >
      {icon}
    </Button>
  );
}

/**
 * ไอคอนตามชนิดไฟล์ — **โทนเทาล้วน**
 * (Gmail ใช้ไอคอนสี แต่พาเลตต์เราห้ามใช้แดงกับอะไรที่ไม่ใช่ "ผิดพลาด" — DESIGN.md §2)
 */
function AttachmentIcon({ type }: { type: string }) {
  const cls = "h-3 w-3 shrink-0 text-gray-400";
  if (type.startsWith("image/")) return <ImageIcon className={cls} />;
  if (type === "application/pdf") return <FileText className={cls} />;
  if (type.includes("spreadsheet") || type.includes("excel") || type === "text/csv") {
    return <FileSpreadsheet className={cls} />;
  }
  if (type.includes("zip") || type.includes("compressed") || type.includes("rar")) {
    return <FileArchive className={cls} />;
  }
  return <Paperclip className={cls} />;
}

/** ขนาดไฟล์แบบสั้น — ใช้ในทูลทิปของชิปเท่านั้น (ในแถวไม่มีที่พอ) */
function formatBytes(bytes: number): string {
  if (bytes >= 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
  if (bytes >= 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${bytes} B`;
}

export const MailRow = memo(MailRowBase);
