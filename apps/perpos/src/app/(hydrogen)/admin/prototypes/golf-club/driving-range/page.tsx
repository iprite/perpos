"use client";

// driving-range/page.tsx — ตารางจองไดร์ฟ (bay grid) — P4b Group A
// bay (แถว) × ช่วงเวลา (คอลัมน์) — cell = div (ไม่ใช่ table) + token map §5c-grid + legend (มี "ปิดซ่อม")
// bay ว่าง → booking-form (range + bucket) · bay จอง → detail · bay ซ่อม (bay-09/12) = disabled

import { useMemo, useState } from "react";
import { Target, Wrench, Plus } from "lucide-react";
import { ThaiDatePicker } from "@/components/ui/thai-date-picker";
import { Text } from "@/components/ui/typography";
import cn from "@core/utils/class-names";
import {
  GolfShell,
  NoAccess,
  AccessLockBanner,
  useGolfRole,
  useGolfData,
  bookerName,
  dowTH,
  fmtDateTH,
  TODAY_ISO,
  generateSlots,
  slotBookings,
  computeOccupancy,
  SLOT_STATE_META,
  SlotLegend,
  GridStatusBadge,
} from "../_components";
import { BookingFormDialog, type BookingFormPrefill } from "../_components/booking-form-dialog";
import { BookingDetailDialog } from "../_components/booking-detail-dialog";
import type { GolfBooking, GolfMember, GolfResource } from "../_fixtures/types";

export default function DrivingRangeGridPage() {
  const { can, canWrite } = useGolfRole();
  const writable = canWrite("driving_range");
  const { bookings, members, resources } = useGolfData();

  const bays = useMemo(
    () =>
      resources
        .filter((r) => r.resource_type === "bay" && r.status !== "inactive")
        .sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0)),
    [resources],
  );

  const [date, setDate] = useState(TODAY_ISO);

  // dialogs
  const [formOpen, setFormOpen] = useState(false);
  const [formPrefill, setFormPrefill] = useState<BookingFormPrefill | undefined>(undefined);
  const [editBooking, setEditBooking] = useState<GolfBooking | null>(null);
  const [detailOpen, setDetailOpen] = useState(false);
  const [detailBooking, setDetailBooking] = useState<GolfBooking | null>(null);

  const openBook = (bayId: string, time: string) => {
    setEditBooking(null);
    setFormPrefill({ type: "driving_range", resourceId: bayId, date, time });
    setFormOpen(true);
  };
  const openDetail = (b: GolfBooking) => {
    setDetailBooking(b);
    setDetailOpen(true);
  };
  const openEdit = (b: GolfBooking) => {
    setEditBooking(b);
    setFormPrefill(undefined);
    setFormOpen(true);
  };

  // ช่วงเวลา (ชั่วโมง) จาก bay แรก (08:00–20:00 → 12 ช่อง)
  const times = useMemo(() => {
    const b = bays[0];
    if (!b) return [];
    return generateSlots(b.open_time ?? "08:00", b.close_time ?? "20:00", 60);
  }, [bays]);

  // utilization รวม (bay ใช้งานได้ × ช่อง)
  const util = useMemo(() => {
    const active = bays.filter((b) => b.status !== "maintenance");
    let booked = 0;
    for (const b of active) {
      for (const t of times) {
        if (computeOccupancy(slotBookings(bookings, b.id, date, t), 1, b.status) === "เต็ม")
          booked++;
      }
    }
    const total = active.length * times.length;
    return { booked, total, pct: total > 0 ? Math.round((booked / total) * 100) : 0 };
  }, [bays, times, bookings, date]);

  if (!can("view", "driving_range"))
    return (
      <NoAccess title="ตารางจองไดร์ฟ" icon={<Target className="h-6 w-6" />}>
        บทบาทนี้ไม่มีสิทธิ์ดูตารางจองไดร์ฟ
      </NoAccess>
    );

  const gridCols = `84px repeat(${times.length}, minmax(96px, 1fr))`;

  return (
    <GolfShell
      title="ตารางจองไดร์ฟ"
      description="ผัง bay × ช่วงเวลา — คลิก bay ว่างเพื่อขายตะกร้าลูก · bay ปิดซ่อมกดไม่ได้"
      icon={<Target className="h-6 w-6" />}
    >
      {!writable && (
        <AccessLockBanner>
          โหมดดูอย่างเดียว — บทบาทนี้ดูตารางไดร์ฟได้แต่สร้าง/แก้ไขการจองไม่ได้
        </AccessLockBanner>
      )}

      {/* แถบควบคุม */}
      <div className="flex flex-col gap-3 rounded-xl border border-gray-200 bg-white p-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <Text className="mb-1 text-xs font-medium text-gray-500">วันที่</Text>
          <ThaiDatePicker value={date} onChange={(iso) => setDate(iso || TODAY_ISO)} />
        </div>
        <div className="text-sm text-gray-500">
          <span className="font-medium text-gray-900">{dowTH(date)}</span> {fmtDateTH(date)} · ใช้ไดร์ฟ{" "}
          <span className="font-semibold tabular-nums text-primary">{util.pct}%</span> ({util.booked}/
          {util.total} ช่อง)
        </div>
      </div>

      {/* legend (มี "ปิดซ่อม") */}
      <SlotLegend states={["ว่าง", "เต็ม", "ปิดซ่อม"]} className="px-1" />

      {bays.length === 0 || times.length === 0 ? (
        <EmptyBayState />
      ) : (
        <div className="overflow-x-auto rounded-xl border border-gray-200 bg-white shadow-sm">
          <div className="min-w-[520px]">
            {/* header เวลา */}
            <div
              className="grid border-b border-gray-200 bg-gray-50"
              style={{ gridTemplateColumns: gridCols }}
            >
              <div className="px-2 py-2 text-center text-[11px] font-semibold uppercase tracking-wide text-gray-400">
                Bay
              </div>
              {times.map((t) => (
                <div
                  key={t}
                  className="border-l border-gray-100 px-1 py-2 text-center text-[11px] font-medium tabular-nums text-gray-500"
                >
                  {t}
                </div>
              ))}
            </div>

            {/* bay rows */}
            {bays.map((bay) => {
              const maintenance = bay.status === "maintenance";
              return (
                <div
                  key={bay.id}
                  className="grid border-b border-gray-100 last:border-b-0"
                  style={{ gridTemplateColumns: gridCols }}
                >
                  <div className="flex items-center gap-1.5 px-2 py-1.5 text-sm font-medium text-gray-700">
                    {maintenance && <Wrench className="h-3.5 w-3.5 text-amber-500" />}
                    {bay.name}
                  </div>
                  {times.map((time) => (
                    <div key={time} className="border-l border-gray-100 p-1">
                      <BayCell
                        bay={bay}
                        time={time}
                        date={date}
                        bookings={bookings}
                        members={members}
                        writable={writable}
                        onBook={openBook}
                        onOpen={openDetail}
                      />
                    </div>
                  ))}
                </div>
              );
            })}
          </div>
        </div>
      )}

      <BookingFormDialog
        open={formOpen}
        onOpenChange={setFormOpen}
        prefill={formPrefill}
        editBooking={editBooking}
      />
      <BookingDetailDialog
        booking={detailBooking}
        open={detailOpen}
        onOpenChange={setDetailOpen}
        onEdit={openEdit}
      />
    </GolfShell>
  );
}

function BayCell({
  bay,
  time,
  date,
  bookings,
  members,
  writable,
  onBook,
  onOpen,
}: {
  bay: GolfResource;
  time: string;
  date: string;
  bookings: GolfBooking[];
  members: GolfMember[];
  writable: boolean;
  onBook: (bayId: string, time: string) => void;
  onOpen: (b: GolfBooking) => void;
}) {
  const bs = slotBookings(bookings, bay.id, date, time);
  const occ = computeOccupancy(bs, 1, bay.status);
  const meta = SLOT_STATE_META[occ];

  // ปิดซ่อม → disabled
  if (occ === "ปิดซ่อม") {
    return (
      <div
        className={cn(
          "flex min-h-[40px] items-center justify-center gap-1 rounded-md border text-[11px]",
          meta.cell,
          "cursor-not-allowed opacity-80",
        )}
        aria-disabled="true"
      >
        {meta.icon}
        {meta.label}
      </div>
    );
  }

  // ว่าง → คลิกจอง
  if (occ === "ว่าง") {
    const canClick = writable;
    const open = () => {
      if (canClick) onBook(bay.id, time);
    };
    return (
      <div
        role={canClick ? "button" : undefined}
        tabIndex={canClick ? 0 : undefined}
        onClick={open}
        onKeyDown={(ev) => {
          if (canClick && (ev.key === "Enter" || ev.key === " ")) {
            ev.preventDefault();
            open();
          }
        }}
        className={cn(
          "group flex min-h-[40px] w-full items-center justify-center gap-1 rounded-md border text-[11px] transition-colors",
          meta.cell,
          canClick ? "cursor-pointer" : "cursor-default opacity-70",
        )}
      >
        <Plus className="h-3 w-3 opacity-0 transition-opacity group-hover:opacity-100" />
        <span className="flex items-center gap-1">
          {meta.icon}
          {meta.label}
        </span>
      </div>
    );
  }

  // จองแล้ว → detail
  const primary = bs[0];
  return (
    <div
      role="button"
      tabIndex={0}
      onClick={() => onOpen(primary)}
      onKeyDown={(ev) => {
        if (ev.key === "Enter" || ev.key === " ") {
          ev.preventDefault();
          onOpen(primary);
        }
      }}
      className={cn(
        "flex min-h-[44px] w-full min-w-0 cursor-pointer flex-col justify-center gap-1 overflow-hidden rounded-md border px-1.5 py-1 text-left text-[11px] transition-colors hover:brightness-[0.98]",
        meta.cell,
      )}
    >
      <span className="truncate font-medium leading-tight text-gray-900">
        {bookerName(primary, members)}
      </span>
      <GridStatusBadge status={primary.status} />
    </div>
  );
}

function EmptyBayState() {
  return (
    <div className="flex flex-col items-center justify-center rounded-xl border border-gray-200 bg-white py-16 text-center">
      <div className="mb-4 rounded-full bg-gray-100 p-4">
        <Target className="h-8 w-8 text-gray-400" />
      </div>
      <Text className="text-sm font-medium text-gray-900">ยังไม่มี bay ไดร์ฟที่ตั้งค่าไว้</Text>
      <Text className="mt-1 max-w-xs text-sm text-gray-500">
        เพิ่ม bay และเวลาเปิด-ปิดในหน้า “ตั้งค่า” เพื่อให้ตารางจองไดร์ฟแสดงช่องเวลา
      </Text>
    </div>
  );
}
