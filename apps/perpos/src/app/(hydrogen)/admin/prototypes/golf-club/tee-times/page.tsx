"use client";

// tee-times/page.tsx — ตารางจองสนาม (tee-time grid) — P4a PATTERN PAGE (lock ก่อนขยาย)
// grid เวลา (แถว) × course (คอลัมน์) — cell = div + token map §5c-grid + legend bar (a11y)
// cell ว่าง = คลิกจอง (P4b) · จอง = ชื่อ+จำนวน+สถานะ · เต็ม = ป้าย (ไม่แดง) · เลือกวัน (ThaiDatePicker)

import { useMemo, useState } from "react";
import { CalendarRange, Flag, Plus } from "lucide-react";
import { ThaiDatePicker } from "@/components/ui/thai-date-picker";
import { CustomSelect } from "@/components/ui/custom-select";
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
  remainingSeats,
  seatsUsed,
  TEE_BANDS,
  parseTime,
  computeUtilization,
  buildTeeSlots,
  SLOT_STATE_META,
  SlotLegend,
  GridStatusBadge,
} from "../_components";
import { BookingFormDialog, type BookingFormPrefill } from "../_components/booking-form-dialog";
import { BookingDetailDialog } from "../_components/booking-detail-dialog";
import type { GolfBooking, GolfMember, GolfResource } from "../_fixtures/types";

export default function TeeTimeGridPage() {
  const { can, canWrite } = useGolfRole();
  const writable = canWrite("tee_times");
  const { bookings, members, resources } = useGolfData();

  const courses = useMemo(
    () => resources.filter((r) => r.resource_type === "course" && r.status !== "inactive"),
    [resources],
  );

  const [date, setDate] = useState(TODAY_ISO);
  // "all" = แสดงทุกสนามเป็นคอลัมน์ · หรือเลือกสนามเดียว
  const [courseFilter, setCourseFilter] = useState("all");

  // dialogs (P4b) — booking form (create/edit) + detail
  const [formOpen, setFormOpen] = useState(false);
  const [formPrefill, setFormPrefill] = useState<BookingFormPrefill | undefined>(undefined);
  const [editBooking, setEditBooking] = useState<GolfBooking | null>(null);
  const [detailOpen, setDetailOpen] = useState(false);
  const [detailBooking, setDetailBooking] = useState<GolfBooking | null>(null);

  const openBook = (courseId: string, time: string) => {
    setEditBooking(null);
    setFormPrefill({ type: "tee_time", resourceId: courseId, date, time });
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

  const shownCourses = useMemo(
    () => (courseFilter === "all" ? courses : courses.filter((c) => c.id === courseFilter)),
    [courses, courseFilter],
  );

  // timeline หลัก (ใช้ config ของสนามแรก — v1 ทุกสนาม config เดียวกัน)
  const timeline = useMemo(() => {
    const c = courses[0];
    if (!c) return [];
    return generateSlots(c.open_time ?? "06:00", c.close_time ?? "16:00", c.tee_interval_min ?? 10);
  }, [courses]);

  // utilization รวมของวัน (จากสนามที่แสดง — ถ้าหลายสนามใช้สนามแรกเป็นตัวแทน headline)
  const util = useMemo(() => {
    const c = shownCourses[0];
    if (!c) return { booked: 0, total: 0, pct: 0 };
    return computeUtilization(buildTeeSlots(c, bookings, date));
  }, [shownCourses, bookings, date]);

  if (!can("view", "tee_times"))
    return (
      <NoAccess title="ตารางจองสนาม" icon={<CalendarRange className="h-6 w-6" />}>
        บทบาทนี้ไม่มีสิทธิ์ดูตารางจองสนาม
      </NoAccess>
    );

  const gridCols = `76px repeat(${shownCourses.length}, minmax(150px, 1fr))`;

  return (
    <GolfShell
      title="ตารางจองสนาม"
      description="ผังเวลา × สนาม — เห็นช่องว่าง/เต็มทั้งวันในตาเดียว คลิกช่องว่างเพื่อจอง"
      icon={<CalendarRange className="h-6 w-6" />}
    >
      {!writable && (
        <AccessLockBanner>
          โหมดดูอย่างเดียว — บทบาทนี้ดูตารางได้แต่สร้าง/แก้ไขการจองไม่ได้ (ต้องเป็นพนักงาน/ผู้จัดการ/เจ้าของ)
        </AccessLockBanner>
      )}

      {/* แถบควบคุม */}
      <div className="flex flex-col gap-3 rounded-xl border border-gray-200 bg-white p-3 sm:flex-row sm:items-end sm:justify-between">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
          <div>
            <Text className="mb-1 text-xs font-medium text-gray-500">วันที่</Text>
            <ThaiDatePicker value={date} onChange={(iso) => setDate(iso || TODAY_ISO)} />
          </div>
          <div>
            <Text className="mb-1 text-xs font-medium text-gray-500">สนาม</Text>
            <CustomSelect
              className="w-44"
              value={courseFilter}
              onChange={setCourseFilter}
              options={[
                { value: "all", label: "ทุกสนาม" },
                ...courses.map((c) => ({ value: c.id, label: c.name })),
              ]}
            />
          </div>
        </div>
        <div className="text-sm text-gray-500">
          <span className="font-medium text-gray-900">{dowTH(date)}</span> {fmtDateTH(date)} · ใช้สนาม{" "}
          <span className="font-semibold text-primary tabular-nums">{util.pct}%</span> ({util.booked}/
          {util.total} ช่อง)
        </div>
      </div>

      {/* legend bar (บังคับ — a11y) */}
      <SlotLegend states={["ว่าง", "บางส่วน", "เต็ม"]} className="px-1" />

      {/* grid */}
      {shownCourses.length === 0 || timeline.length === 0 ? (
        <EmptyCourseState />
      ) : (
        <div className="overflow-x-auto rounded-xl border border-gray-200 bg-white shadow-sm">
          <div className="min-w-[340px]">
            {/* header สนาม */}
            <div
              className="grid border-b border-gray-200 bg-gray-50"
              style={{ gridTemplateColumns: gridCols }}
            >
              <div className="px-2 py-2 text-center text-[11px] font-semibold uppercase tracking-wide text-gray-400">
                เวลา
              </div>
              {shownCourses.map((c) => (
                <div
                  key={c.id}
                  className="border-l border-gray-100 px-3 py-2 text-sm font-medium text-gray-700"
                >
                  {c.name}
                </div>
              ))}
            </div>

            {/* band + slot rows */}
            {TEE_BANDS.map((band) => {
              const s = parseTime(band.start);
              const e = parseTime(band.end);
              const times = timeline.filter((t) => {
                const tt = parseTime(t);
                return tt >= s && tt < e;
              });
              if (times.length === 0) return null;
              return (
                <div key={band.label}>
                  <div className="bg-gray-50/60 px-3 py-1 text-[11px] font-semibold uppercase tracking-wide text-gray-400">
                    {band.label}
                  </div>
                  {times.map((time) => (
                    <div
                      key={time}
                      className="grid border-b border-gray-100 last:border-b-0"
                      style={{ gridTemplateColumns: gridCols }}
                    >
                      <div className="flex items-center justify-center px-2 py-1.5 text-xs font-medium tabular-nums text-gray-500">
                        {time}
                      </div>
                      {shownCourses.map((course) => (
                        <div key={course.id} className="border-l border-gray-100 p-1">
                          <SlotCell
                            course={course}
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

// ── เซลล์ช่องเวลา (div — ไม่ใช่ raw table) + token map §5c-grid ──
function SlotCell({
  course,
  time,
  date,
  bookings,
  members,
  writable,
  onBook,
  onOpen,
}: {
  course: GolfResource;
  time: string;
  date: string;
  bookings: GolfBooking[];
  members: GolfMember[];
  writable: boolean;
  onBook: (courseId: string, time: string) => void;
  onOpen: (b: GolfBooking) => void;
}) {
  const bs = slotBookings(bookings, course.id, date, time);
  const max = course.max_party_size ?? 4;
  const occ = computeOccupancy(bs, max, course.status);
  const meta = SLOT_STATE_META[occ];

  // ว่าง → clickable เปิดจอง (P4b)
  if (occ === "ว่าง") {
    const canClick = writable;
    const open = () => {
      if (canClick) onBook(course.id, time);
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
          "group flex min-h-[38px] w-full items-center justify-center gap-1 rounded-md border text-xs transition-colors",
          meta.cell,
          canClick ? "cursor-pointer" : "cursor-default opacity-70",
        )}
      >
        <Plus className="h-3.5 w-3.5 opacity-0 transition-opacity group-hover:opacity-100" />
        <span className="flex items-center gap-1">
          {meta.icon}
          {meta.label}
        </span>
      </div>
    );
  }

  // ปิดซ่อม (ไม่เกิดกับ course active แต่ handle ทั่วไป)
  if (occ === "ปิดซ่อม") {
    return (
      <div
        className={cn(
          "flex min-h-[38px] items-center justify-center gap-1 rounded-md border text-xs",
          meta.cell,
        )}
      >
        {meta.icon}
        {meta.label}
      </div>
    );
  }

  // บางส่วน / เต็ม → แสดงผู้จอง + จำนวน + สถานะ
  const primary = bs[0];
  const remaining = remainingSeats(bs, max);
  const openDetail = () => onOpen(primary);
  return (
    <div
      role="button"
      tabIndex={0}
      onClick={openDetail}
      onKeyDown={(ev) => {
        if (ev.key === "Enter" || ev.key === " ") {
          ev.preventDefault();
          openDetail();
        }
      }}
      className={cn(
        "flex min-h-[38px] w-full min-w-0 cursor-pointer flex-col justify-center gap-1 overflow-hidden rounded-md border px-2 py-1 text-left text-xs transition-colors hover:brightness-[0.98]",
        meta.cell,
      )}
    >
      <div className="flex items-center justify-between gap-1">
        <span className="min-w-0 truncate font-medium leading-tight text-gray-900">
          {bookerName(primary, members)}
        </span>
        <span className="shrink-0 tabular-nums text-gray-500">
          {seatsUsed(bs)}/{max}
        </span>
      </div>
      <div className="flex flex-wrap items-center gap-1.5">
        <GridStatusBadge status={primary.status} />
        {occ === "บางส่วน" && (
          <span className="text-[11px] text-blue-700">เหลือ {remaining} ที่</span>
        )}
        {bs.length > 1 && <span className="text-[11px] text-gray-500">+{bs.length - 1}</span>}
      </div>
    </div>
  );
}

function EmptyCourseState() {
  return (
    <div className="flex flex-col items-center justify-center rounded-xl border border-gray-200 bg-white py-16 text-center">
      <div className="mb-4 rounded-full bg-gray-100 p-4">
        <Flag className="h-8 w-8 text-gray-400" />
      </div>
      <Text className="text-sm font-medium text-gray-900">ยังไม่มีสนามที่ตั้งค่าไว้</Text>
      <Text className="mt-1 max-w-xs text-sm text-gray-500">
        ตั้งค่าเวลาเปิด-ปิดและช่วงห่าง tee-time ของสนามในหน้า “ตั้งค่า” เพื่อให้ตารางจองแสดงช่องเวลา
      </Text>
    </div>
  );
}
