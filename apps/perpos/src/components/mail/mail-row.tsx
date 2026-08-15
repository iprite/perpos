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
import { Paperclip, Square, SquareCheckBig, Star } from "lucide-react";
import cn from "@core/utils/class-names";
import { Button } from "@/components/ui/button";
import type { MailMessage } from "@/lib/mail/types";
import { formatMailTime } from "@/lib/mail/format";

/** ความสูงคงที่ของแถว (px) — ใช้ร่วมกับ VList/skeleton ห้ามแก้ที่เดียว */
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
}: MailRowProps) {
  const unread = message.isUnread;
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

  return (
    // แถวเป็น <div> เปล่า ๆ **ไม่มี role="button"** — ข้างในมีปุ่มจริง (เลือก/ติดดาว/เปิด)
    // ปุ่มซ้อนใน role=button คือ HTML ที่ screen reader อ่านไม่ออก · onClick ที่นี่มีไว้ให้เมาส์
    // คลิกโดนพื้นที่ว่างได้เฉย ๆ ส่วนคีย์บอร์ดใช้ปุ่มเนื้อหาด้านล่าง
    <div
      onClick={onOpen}
      className={cn(
        "flex h-16 w-full cursor-pointer items-center gap-2 border-b border-gray-100 px-2 outline-none transition-colors sm:px-3",
        active ? "bg-gray-100" : "hover:bg-gray-50",
        // วงเคอร์เซอร์ต้องเห็นชัดแม้แถวนั้นเป็นฉบับที่เปิดอยู่ (WCAG 1.4.11 ต้องคอนทราสต์ ≥3:1)
        focused && "ring-2 ring-inset ring-primary",
        focused && !active && "bg-gray-50",
      )}
    >
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
          <span className="shrink-0 text-xs tabular-nums text-gray-500">
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
          {message.hasAttachment && (
            <Paperclip aria-label="มีไฟล์แนบ" className="h-3.5 w-3.5 shrink-0 text-gray-400" />
          )}
        </div>
      </button>
    </div>
  );
}

export const MailRow = memo(MailRowBase);
