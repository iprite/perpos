"use client";

/**
 * MailList — รายการเมล (MAIL_UI_SPEC §2 · contract §6.1)
 *
 * ทำไมไม่ใช้ <Table>/<TablePager>:
 *  - เมลเป็น **stream ตามเวลา** ไม่ใช่ชุดข้อมูลที่คนอยากกระโดดไป "หน้า 7"
 *    → infinite scroll + ปุ่ม "โหลดเพิ่ม" (ข้อยกเว้นที่ตั้งใจจาก DESIGN.md §5.1)
 *  - แถว 2 บรรทัดหนาแน่น 64px → <ul>/<li> + <MailRow>
 *
 * virtualize ด้วย `virtua` — ใช้ <Virtualizer as="ul" item={li}> แทน <VList>
 * เพราะ <VList> ไม่เปิด prop `as` ให้ (container เป็น div เสมอ) ซึ่งจะได้ <li> ใน <div>
 * = โครงสร้าง HTML ผิดตาม UI_SPEC §2 · Virtualizer เป็นตัวเดียวกับที่ VList ห่ออยู่
 *
 * เมลใหม่เข้าระหว่างอ่าน: **ห้ามแทรกจนแถวกระโดด** — ผู้เรียกส่ง `newCount` มา
 * แล้วเราขึ้นแถบ "มีเมลใหม่ N ฉบับ" ค้างหัวรายการ กดแล้วค่อย merge
 */

import { forwardRef, useCallback, useImperativeHandle, useMemo, useRef, useState } from "react";
import { ArrowUp, Inbox, RefreshCw, SearchX } from "lucide-react";
import { Virtualizer, type CustomItemComponentProps, type VirtualizerHandle } from "virtua";
import cn from "@core/utils/class-names";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import type { MailAttachment, MailMessage } from "@/lib/mail/types";
import { MailAttachmentPreview } from "@/components/mail/mail-attachment-preview";
import { MAIL_ROW_HEIGHT, MailRow } from "@/components/mail/mail-row";

const ListItem = forwardRef<HTMLLIElement, CustomItemComponentProps>(function ListItem(
  { style, children },
  ref,
) {
  return (
    <li ref={ref} style={style} className="list-none">
      {children}
    </li>
  );
});

export interface MailListHandle {
  /** เลื่อนให้แถวที่ index อยู่ในสายตา (ใช้กับคีย์ลัด j/k) */
  scrollToIndex: (index: number) => void;
  scrollToTop: () => void;
}

export type MailboxLabelMap = Record<string, { label: string; folder: boolean }>;

export interface MailListProps {
  messages: MailMessage[];
  loading: boolean;
  loadingMore: boolean;
  hasMore: boolean;
  error: string | null;
  /** มีคำค้นอยู่ไหม (ใช้เลือกข้อความ empty state) */
  searchTerm: string;
  /**
   * ป้าย "อยู่กล่องไหน" ต่อ mailboxId — ส่งมาเฉพาะตอนผลลัพธ์มาจากหลายกล่อง (ค้นทั้งหมด)
   * ไม่ส่ง = ไม่แสดงป้าย (ในกล่องเดียวกันทุกแถวป้ายซ้ำกันหมด รกเปล่า ๆ)
   * `folder` = โฟลเดอร์ที่ผู้ใช้สร้างเอง (ใช้เลือกป้ายที่ถูกเมื่อเมลอยู่หลายกล่อง)
   */
  mailboxLabels?: MailboxLabelMap;
  selectedIds: Set<string>;
  activeId: string | null;
  focusedIndex: number;
  /** จำนวนเมลใหม่ที่รออยู่ (ยังไม่แทรก เพราะผู้ใช้เลื่อนลงมาแล้ว) */
  newCount: number;
  onApplyNew: () => void;
  onOpen: (m: MailMessage, index: number) => void;
  onToggleSelect: (m: MailMessage, index: number, shiftKey: boolean) => void;
  onToggleStar: (m: MailMessage) => void;
  /** สลับอ่านแล้ว/ยังไม่ได้อ่าน — ปุ่มลัดตอน hover ในแถว (เดสก์ท็อป) */
  onToggleRead: (m: MailMessage) => void;
  /** M3 — ปัดบนมือถือ (ไม่ส่งมา = ปิดท่าทางนี้) */
  onSwipeArchive?: (m: MailMessage) => void;
  onSwipeTrash?: (m: MailMessage) => void;
  onLoadMore: () => void;
  onRetry: () => void;
  onClearSearch: () => void;
  onScrollOffsetChange?: (offset: number) => void;
}

/**
 * ป้าย "อยู่กล่องไหน" ของแถวหนึ่ง — เมลอยู่ได้หลายกล่องพร้อมกัน (กฎกรองสำเนาเข้าโฟลเดอร์ ฯลฯ)
 * ⇒ เลือก **โฟลเดอร์ที่ผู้ใช้สร้างเองก่อน** เพราะนั่นคือที่ที่เขาจะตามไปหา
 * (ถ้าเลือก id แรกตามใจ JMAP จะได้ "กล่องขาเข้า" แล้วตามไปหาไม่เจอฉบับที่เพิ่งเห็น)
 */
function pickBoxLabel(m: MailMessage, labels?: MailboxLabelMap): string | undefined {
  if (!labels) return undefined;
  const named = m.mailboxIds.filter((id) => labels[id]);
  const folder = named.find((id) => labels[id]?.folder);
  const chosen = folder ?? named[0];
  return chosen ? labels[chosen]?.label : undefined;
}

export const MailList = forwardRef<MailListHandle, MailListProps>(function MailList(
  {
    messages,
    loading,
    loadingMore,
    hasMore,
    error,
    searchTerm,
    mailboxLabels,
    selectedIds,
    activeId,
    focusedIndex,
    newCount,
    onApplyNew,
    onOpen,
    onToggleSelect,
    onToggleStar,
    onToggleRead,
    onSwipeArchive,
    onSwipeTrash,
    onLoadMore,
    onRetry,
    onClearSearch,
    onScrollOffsetChange,
  },
  ref,
) {
  const vRef = useRef<VirtualizerHandle>(null);
  /** ไฟล์แนบที่กำลังดูตัวอย่างจากชิปในรายการ (ไม่ต้องเปิดเมลก่อน) */
  const [preview, setPreview] = useState<MailAttachment | null>(null);

  useImperativeHandle(ref, () => ({
    scrollToIndex: (index: number) => vRef.current?.scrollToIndex(index, { align: "nearest" }),
    scrollToTop: () => vRef.current?.scrollTo(0),
  }));

  const handleScroll = useCallback(
    (offset: number) => {
      onScrollOffsetChange?.(offset);
      const v = vRef.current;
      if (!v || !hasMore || loadingMore || loading) return;
      // ปลาย list ที่มองเห็นอยู่ใกล้ท้ายรายการแล้ว → โหลดต่อ
      const endIndex = v.findItemIndex(offset + v.viewportSize);
      if (endIndex >= messages.length - 10) onLoadMore();
    },
    [hasMore, loading, loadingMore, messages.length, onLoadMore, onScrollOffsetChange],
  );

  const body = useMemo(() => {
    if (loading) return <MailListSkeleton />;

    if (error) {
      return (
        <EmptyBlock
          icon={<RefreshCw className="h-8 w-8 text-gray-400" />}
          title="โหลดรายการอีเมลไม่สำเร็จ"
          description={error}
          action={
            <Button size="sm" onClick={onRetry}>
              ลองใหม่
            </Button>
          }
        />
      );
    }

    if (messages.length === 0) {
      return searchTerm ? (
        <EmptyBlock
          icon={<SearchX className="h-8 w-8 text-gray-400" />}
          title={`ไม่พบอีเมลที่ตรงกับ «${searchTerm}»`}
          description="ลองใช้คำค้นที่สั้นลง หรือค้นจากชื่อผู้ส่ง"
          action={
            <Button size="sm" variant="outline" onClick={onClearSearch}>
              ล้างการค้นหา
            </Button>
          }
        />
      ) : (
        <EmptyBlock
          icon={<Inbox className="h-8 w-8 text-gray-400" />}
          title="ยังไม่มีอีเมลในกล่องนี้"
          description="เมื่อมีอีเมลเข้ามา จะแสดงที่นี่ทันที"
        />
      );
    }

    return (
      <div className="h-full overflow-y-auto">
        <Virtualizer
          ref={vRef}
          as="ul"
          item={ListItem}
          itemSize={MAIL_ROW_HEIGHT}
          bufferSize={5}
          onScroll={handleScroll}
        >
          {messages.map((m, i) => (
            <MailRow
              key={m.id}
              message={m}
              selected={selectedIds.has(m.id)}
              active={activeId === m.id}
              focused={focusedIndex === i}
              onOpen={() => onOpen(m, i)}
              onToggleSelect={(shiftKey) => onToggleSelect(m, i, shiftKey)}
              onToggleStar={() => onToggleStar(m)}
              onToggleRead={() => onToggleRead(m)}
              onSwipeArchive={onSwipeArchive ? () => onSwipeArchive(m) : undefined}
              onSwipeTrash={onSwipeTrash ? () => onSwipeTrash(m) : undefined}
              onPreviewAttachment={setPreview}
              boxLabel={pickBoxLabel(m, mailboxLabels)}
            />
          ))}
        </Virtualizer>

        <div className="flex items-center justify-center px-3 py-4">
          {hasMore ? (
            <Button variant="outline" size="sm" disabled={loadingMore} onClick={onLoadMore}>
              {loadingMore ? "กำลังโหลด…" : "โหลดเพิ่ม"}
            </Button>
          ) : (
            <span className="text-xs text-gray-400">แสดงครบทุกฉบับแล้ว</span>
          )}
        </div>
      </div>
    );
  }, [
    activeId,
    error,
    focusedIndex,
    handleScroll,
    hasMore,
    loading,
    loadingMore,
    messages,
    onClearSearch,
    onLoadMore,
    onOpen,
    onRetry,
    onToggleSelect,
    onToggleStar,
    onToggleRead,
    onSwipeArchive,
    onSwipeTrash,
    searchTerm,
    selectedIds,
    mailboxLabels,
  ]);

  return (
    <div className="relative flex h-full min-h-0 flex-col">
      {newCount > 0 && (
        <div className="absolute inset-x-0 top-2 z-10 flex justify-center">
          <Button size="sm" className="gap-1.5 shadow-lg" onClick={onApplyNew}>
            <ArrowUp className="h-4 w-4" />
            มีเมลใหม่ {newCount} ฉบับ
          </Button>
        </div>
      )}
      <div className="min-h-0 flex-1">{body}</div>
      <MailAttachmentPreview attachment={preview} onClose={() => setPreview(null)} />
    </div>
  );
});

/** skeleton 8 แถว ทรงเดียวกับ <MailRow> (UI_SPEC §9 — ห้าม spinner กลางจอ) */
export function MailListSkeleton({ rows = 8 }: { rows?: number }) {
  return (
    <ul className="divide-y divide-gray-100">
      {Array.from({ length: rows }).map((_, i) => (
        <li key={i} className="flex h-16 list-none items-center gap-3 px-3">
          <Skeleton className="h-4 w-4 shrink-0 rounded" />
          <div className="min-w-0 flex-1 space-y-2">
            <div className="flex items-center justify-between gap-3">
              <Skeleton className="h-3.5 w-40" />
              <Skeleton className="h-3 w-10" />
            </div>
            <Skeleton className={cn("h-3.5", i % 3 === 0 ? "w-3/5" : "w-4/5")} />
          </div>
        </li>
      ))}
    </ul>
  );
}

function EmptyBlock({
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
    <div className="flex h-full flex-col items-center justify-center px-6 py-16 text-center">
      <div className="mb-4 rounded-full bg-gray-100 p-4">{icon}</div>
      <p className="text-sm font-medium text-gray-900">{title}</p>
      {description && <p className="mt-1 max-w-xs text-sm text-gray-500">{description}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}
