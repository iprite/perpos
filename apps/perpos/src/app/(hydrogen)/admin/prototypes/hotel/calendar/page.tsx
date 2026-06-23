"use client";

// calendar/page.tsx — ปฏิทินการจอง (grid ห้อง × วัน) — P4b
// แถบ booking ตามห้อง×วัน · คลิก cell ว่าง → BookingDialog (prefill ห้อง+วัน) · คลิก booking → detail
// นำทาง: ก่อนหน้า/ถัดไป/วันนี้ + เลือกมุมมอง 7/14 วัน · กันจองทับจัดการใน BookingDialog แล้ว

import { useMemo, useState } from "react";
import { CalendarRange, Plus, ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { CustomSelect } from "@/components/ui/custom-select";
import { Text } from "@/components/ui/typography";
import {
  HotelShell,
  useHotelRole,
  useHotelData,
  bookingOnDate,
  addDayIso,
  TODAY_ISO,
  fmtDateTH,
  ROOM_TYPE_LABEL,
  BookingDialog,
  BookingDetailDialog,
  PaymentDialog,
  NoAccess,
} from "../_components";
import cn from "@core/utils/class-names";
import type { Booking, RoomType } from "../_fixtures/types";

const TYPE_ORDER: RoomType[] = ["A", "V", "C"];
const TH_DOW = ["อา", "จ", "อ", "พ", "พฤ", "ศ", "ส"];

// สี booking bar ตามสถานะ (≤3 โทน) — token palette
function barClass(status: Booking["status"]): string {
  if (status === "reserved") return "bg-amber-100 text-amber-800 border-amber-200";
  if (status === "checked_in") return "bg-blue-100 text-blue-800 border-blue-200";
  return "bg-gray-100 text-gray-500 border-gray-200"; // checked_out
}

export default function CalendarPage() {
  const { can } = useHotelRole();
  const canView = can("view", "calendar");
  const canWrite = can("write", "calendar");
  const { rooms, bookings } = useHotelData();

  const [startDate, setStartDate] = useState(TODAY_ISO);
  const [days, setDays] = useState(7);

  const [bookOpen, setBookOpen] = useState(false);
  const [prefill, setPrefill] = useState<{ roomId?: string; date?: string }>({});
  const [detail, setDetail] = useState<Booking | null>(null);
  const [payFor, setPayFor] = useState<Booking | null>(null);

  // วันที่ที่จะแสดง
  const dateCols = useMemo(() => {
    const out: string[] = [];
    let d = startDate;
    for (let i = 0; i < days; i++) {
      out.push(d);
      d = addDayIso(d);
    }
    return out;
  }, [startDate, days]);

  const sortedRooms = useMemo(
    () =>
      [...rooms].sort(
        (a, b) =>
          TYPE_ORDER.indexOf(a.room_type) - TYPE_ORDER.indexOf(b.room_type) ||
          a.sort_order - b.sort_order,
      ),
    [rooms],
  );

  if (!canView)
    return (
      <NoAccess title="ปฏิทินการจอง" icon={<CalendarRange className="h-6 w-6" />}>
        บทบาทนี้ไม่สามารถดูปฏิทินการจองได้
      </NoAccess>
    );

  function shift(n: number) {
    setStartDate(addDayIso2(startDate, n));
  }

  function clickEmpty(roomId: string, date: string) {
    if (!canWrite) return;
    setPrefill({ roomId, date });
    setBookOpen(true);
  }

  return (
    <HotelShell
      title="ปฏิทินการจอง"
      description="ผังห้อง × วัน — เห็นช่องว่าง/เต็ม กันจองชน คลิกช่องว่างเพื่อจอง"
      icon={<CalendarRange className="h-6 w-6" />}
      actions={
        canWrite ? (
          <Button
            onClick={() => {
              setPrefill({ date: startDate });
              setBookOpen(true);
            }}
          >
            <Plus className="mr-1.5 h-4 w-4" /> จองใหม่
          </Button>
        ) : undefined
      }
    >
      {/* แถบนำทาง */}
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-gray-200 bg-white p-3">
        <div className="flex items-center gap-2">
          <Button variant="outline" size="icon" onClick={() => shift(-days)} aria-label="ก่อนหน้า">
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <Button variant="outline" size="sm" onClick={() => setStartDate(TODAY_ISO)}>
            วันนี้
          </Button>
          <Button variant="outline" size="icon" onClick={() => shift(days)} aria-label="ถัดไป">
            <ChevronRight className="h-4 w-4" />
          </Button>
          <Text className="ml-1 text-sm font-medium text-gray-700">
            {fmtDateTH(dateCols[0])} – {fmtDateTH(dateCols[dateCols.length - 1])}
          </Text>
        </div>
        <CustomSelect
          className="w-32"
          value={String(days)}
          onChange={(v) => setDays(Number(v))}
          options={[
            { value: "7", label: "7 วัน" },
            { value: "14", label: "14 วัน" },
          ]}
        />
      </div>

      {/* legend */}
      <div className="flex flex-wrap items-center gap-3 text-[11px] text-gray-500">
        <Legend cls="bg-amber-100 border-amber-200" label="จองแล้ว" />
        <Legend cls="bg-blue-100 border-blue-200" label="เข้าพักอยู่" />
        <Legend cls="bg-gray-100 border-gray-200" label="เช็คเอาท์แล้ว" />
        <span className="flex items-center gap-1.5">
          <span className="h-3 w-3 rounded border border-dashed border-gray-300 bg-white" /> ว่าง
          (คลิกเพื่อจอง)
        </span>
      </div>

      {/* grid */}
      <div className="overflow-x-auto rounded-xl border border-gray-200 bg-white">
        <div className="min-w-[720px]">
          {/* header แถววันที่ */}
          <div
            className="grid border-b border-gray-200 bg-gray-50"
            style={{ gridTemplateColumns: `120px repeat(${days}, minmax(0,1fr))` }}
          >
            <div className="px-3 py-2 text-xs font-semibold uppercase tracking-wide text-gray-400">
              ห้อง
            </div>
            {dateCols.map((d) => {
              const dt = new Date(d);
              const isToday = d === TODAY_ISO;
              return (
                <div
                  key={d}
                  className={cn(
                    "border-l border-gray-100 px-1 py-2 text-center",
                    isToday && "bg-primary/5",
                  )}
                >
                  <div className="text-[11px] text-gray-400">{TH_DOW[dt.getDay()]}</div>
                  <div
                    className={cn(
                      "text-sm font-medium",
                      isToday ? "text-primary" : "text-gray-700",
                    )}
                  >
                    {dt.getDate()}
                  </div>
                </div>
              );
            })}
          </div>

          {/* แถวห้อง (จัดกลุ่มตามประเภท) */}
          {TYPE_ORDER.map((type) => {
            const list = sortedRooms.filter((r) => r.room_type === type);
            if (list.length === 0) return null;
            return (
              <div key={type}>
                <div className="bg-gray-50/60 px-3 py-1 text-[11px] font-semibold uppercase tracking-wide text-gray-400">
                  ห้อง {ROOM_TYPE_LABEL[type]}
                </div>
                {list.map((room) => (
                  <div
                    key={room.id}
                    className="grid border-b border-gray-100"
                    style={{ gridTemplateColumns: `120px repeat(${days}, minmax(0,1fr))` }}
                  >
                    <div className="flex items-center px-3 py-2 text-sm font-medium text-gray-700">
                      {room.room_number}
                    </div>
                    {dateCols.map((d) => {
                      const b = bookings.find((x) => x.room_id === room.id && bookingOnDate(x, d));
                      const isToday = d === TODAY_ISO;
                      const isStart = b && b.check_in_date === d;
                      const cellLocked =
                        room.status === "maintenance" || room.status === "out_of_service";
                      const clickable = !b && !cellLocked && canWrite;
                      const open = () => {
                        if (b) setDetail(b);
                        else if (clickable) clickEmpty(room.id, d);
                      };
                      return (
                        <div
                          key={d}
                          role={b || clickable ? "button" : undefined}
                          tabIndex={b || clickable ? 0 : undefined}
                          onClick={open}
                          onKeyDown={(e) => {
                            if ((e.key === "Enter" || e.key === " ") && (b || clickable)) {
                              e.preventDefault();
                              open();
                            }
                          }}
                          className={cn(
                            "min-h-[40px] border-l border-gray-100 p-0.5 transition-colors duration-150",
                            isToday && "bg-primary/5",
                            cellLocked && "bg-gray-50",
                            clickable && "cursor-pointer hover:bg-green-50",
                            b && "cursor-pointer",
                          )}
                        >
                          {b && (
                            <div
                              className={cn(
                                "flex h-full items-center truncate rounded border px-1.5 py-1 text-[11px]",
                                barClass(b.status),
                              )}
                            >
                              {isStart ? b.guest_name : "›"}
                            </div>
                          )}
                          {!b && cellLocked && (
                            <div className="flex h-full items-center justify-center text-[10px] text-gray-300">
                              —
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                ))}
              </div>
            );
          })}
        </div>
      </div>

      {/* dialogs */}
      <BookingDialog
        open={bookOpen}
        onOpenChange={setBookOpen}
        prefillRoomId={prefill.roomId}
        prefillDate={prefill.date}
      />
      <BookingDetailDialog
        booking={detail}
        open={detail !== null}
        onOpenChange={(v) => !v && setDetail(null)}
        onOpenPayment={(b) => {
          setDetail(null);
          setPayFor(b);
        }}
      />
      <PaymentDialog
        open={payFor !== null}
        onOpenChange={(v) => !v && setPayFor(null)}
        booking={payFor}
      />
    </HotelShell>
  );
}

function Legend({ cls, label }: { cls: string; label: string }) {
  return (
    <span className="flex items-center gap-1.5">
      <span className={cn("h-3 w-3 rounded border", cls)} />
      {label}
    </span>
  );
}

function addDayIso2(iso: string, n: number): string {
  const d = new Date(iso);
  d.setDate(d.getDate() + n);
  return d.toISOString().slice(0, 10);
}
