"use client";

/**
 * MailToolbar — แถบเครื่องมือเหนือรายการเมล (MAIL_UI_SPEC §2)
 *
 * มี: ชื่อกล่อง + จำนวนยังไม่ได้อ่าน · **ปุ่มเขียน (M2)** · ค้นหา · รีเฟรช · ตัวกรอง · ตารางคีย์ลัด
 * กฎเดิมยังอยู่: ห้ามมีปุ่มที่กดแล้วไม่เกิดอะไร (contract §6)
 *
 * ตัวกรองซ่อนหลังปุ่มไอคอน <Filter> + จุดเหลืองเมื่อกรองค้าง (DESIGN.md §4)
 */

import { Columns2, Filter, Keyboard, PenLine, RefreshCw, Rows3 } from "lucide-react";
import cn from "@core/utils/class-names";
import { Button } from "@/components/ui/button";
import { FilterBar, FilterClear, FilterSearch } from "@/components/ui/filter-bar";
import { SegmentedControl } from "@/components/ui/segmented";

export interface MailFilters {
  unread: boolean;
  attachment: boolean;
}

export function MailToolbar({
  boxLabel,
  unreadCount,
  totalLabel,
  search,
  onSearchChange,
  filters,
  onFiltersChange,
  showFilters,
  onToggleFilters,
  onRefresh,
  refreshing,
  onCompose,
  onOpenShortcuts,
  pane,
  onTogglePane,
  searchInputRef,
}: {
  boxLabel: string;
  unreadCount: number | null;
  totalLabel: string | null;
  search: string;
  onSearchChange: (v: string) => void;
  filters: MailFilters;
  onFiltersChange: (f: MailFilters) => void;
  showFilters: boolean;
  onToggleFilters: () => void;
  onRefresh: () => void;
  refreshing: boolean;
  /** เปิดกล่องเขียนเมล (M2) */
  onCompose: () => void;
  onOpenShortcuts: () => void;
  /** มุมมองปัจจุบัน — `list` = ไม่แสดงบานอ่าน (รายการเต็มความกว้าง) */
  pane: "split" | "list";
  onTogglePane: () => void;
  searchInputRef?: React.RefObject<HTMLDivElement | null>;
}) {
  const hasFilter = filters.unread || filters.attachment;

  return (
    <div className="border-b border-gray-200 bg-white">
      <div className="flex h-12 items-center gap-2 px-2 sm:px-3">
        <div className="hidden min-w-0 shrink-0 items-baseline gap-2 sm:flex lg:hidden">
          <span className="truncate text-sm font-semibold text-gray-900">{boxLabel}</span>
          {unreadCount !== null && unreadCount > 0 && (
            <span className="text-xs font-medium tabular-nums text-gray-500">
              ยังไม่ได้อ่าน {unreadCount}
            </span>
          )}
          {unreadCount === null && totalLabel && (
            <span className="text-xs font-medium tabular-nums text-gray-500">{totalLabel}</span>
          )}
        </div>

        {/* Esc = ออกจากช่องค้นหา (คืนคีย์ลัด j/k/e/# ให้ใช้ได้ทันที) — คำค้นไม่ถูกล้างทิ้ง
            stopPropagation กัน Esc ไปสั่ง "ปิดบานอ่าน" ของ registry พร้อมกัน */}
        <div
          ref={searchInputRef}
          className="ms-auto flex min-w-0 flex-1 justify-end"
          onKeyDown={(e) => {
            if (e.key !== "Escape") return;
            e.stopPropagation();
            (e.target as HTMLElement).blur();
          }}
        >
          <FilterSearch
            value={search}
            onChange={onSearchChange}
            placeholder="ค้นหาในเมล"
            /* ต้องยุบได้จริง — บานรายการที่ lg กว้างแค่ 380px ถ้าคง min-w เดิมจะดันปุ่มทะลุกรอบ */
            className="min-w-0 max-w-xl"
          />
        </div>

        {/* มือถือใช้ FAB มุมขวาล่างแทน (UI_SPEC §8) — ปุ่มนี้จึงโผล่เฉพาะจอ ≥sm */}
        <Button
          size="sm"
          title="เขียนอีเมลใหม่ (c)"
          className="hidden shrink-0 sm:inline-flex"
          onClick={onCompose}
        >
          <PenLine className="h-4 w-4" />
          {/* ที่ lg บานรายการแคบ (380px) — เหลือไอคอนอย่างเดียวกันของล้นแถว */}
          <span className="lg:hidden">เขียน</span>
        </Button>

        <Button
          variant="outline"
          size="icon"
          title="รีเฟรช"
          aria-label="รีเฟรช"
          disabled={refreshing}
          onClick={onRefresh}
          className="shrink-0"
        >
          <RefreshCw className={cn("h-4 w-4", refreshing && "animate-spin")} />
        </Button>

        {/* สลับมุมมอง: คู่ (รายการ+บานอ่าน) ↔ รายการเต็มความกว้าง
            บางคนอยากกวาดตาดูรายการยาว ๆ ไม่ต้องมีบานอ่านกินที่ครึ่งจอ
            ซ่อนบนจอเล็กเพราะที่นั่นเป็นมุมมองรายการอยู่แล้วโดยธรรมชาติ */}
        <Button
          variant={pane === "list" ? "secondary" : "outline"}
          size="icon"
          title={pane === "split" ? "ซ่อนบานอ่าน (ดูเป็นรายการ)" : "แสดงบานอ่านคู่รายการ"}
          aria-label={pane === "split" ? "ซ่อนบานอ่าน" : "แสดงบานอ่าน"}
          aria-pressed={pane === "list"}
          className="hidden shrink-0 lg:inline-flex"
          onClick={onTogglePane}
        >
          {pane === "split" ? <Rows3 className="h-4 w-4" /> : <Columns2 className="h-4 w-4" />}
        </Button>

        <Button
          variant={showFilters || hasFilter ? "secondary" : "outline"}
          size="icon"
          title="ตัวกรอง"
          aria-label="ตัวกรอง"
          className="relative shrink-0"
          onClick={onToggleFilters}
        >
          <Filter className="h-4 w-4" />
          {hasFilter && (
            <span className="absolute -right-0.5 -top-0.5 h-2 w-2 rounded-full bg-amber-500" />
          )}
        </Button>

        <Button
          variant="outline"
          size="icon"
          title="ตารางคีย์ลัด (?)"
          aria-label="ตารางคีย์ลัด"
          className="hidden shrink-0 sm:inline-flex lg:hidden"
          onClick={onOpenShortcuts}
        >
          <Keyboard className="h-4 w-4" />
        </Button>
      </div>

      {showFilters && (
        <div className="px-2 pb-2 sm:px-3">
          <FilterBar>
            <SegmentedControl
              value={filters.unread ? "unread" : "all"}
              onChange={(v) => onFiltersChange({ ...filters, unread: v === "unread" })}
              ariaLabel="สถานะการอ่าน"
              options={[
                { value: "all", label: "ทั้งหมด" },
                { value: "unread", label: "ยังไม่ได้อ่าน" },
              ]}
            />
            <SegmentedControl
              value={filters.attachment ? "attachment" : "any"}
              onChange={(v) => onFiltersChange({ ...filters, attachment: v === "attachment" })}
              ariaLabel="ไฟล์แนบ"
              options={[
                { value: "any", label: "ทุกฉบับ" },
                { value: "attachment", label: "มีไฟล์แนบ" },
              ]}
            />
            <FilterClear
              disabled={!hasFilter}
              onClick={() => onFiltersChange({ unread: false, attachment: false })}
            />
          </FilterBar>
        </div>
      )}
    </div>
  );
}
