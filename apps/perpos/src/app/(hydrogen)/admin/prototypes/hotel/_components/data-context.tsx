"use client";

// data-context.tsx — HotelDataProvider: cross-page mock state (Context store) §14.A
// seed จาก _fixtures/* ตอน mount → mutator อัปเดต store ในหน่วยความจำ
// ทุกหน้าที่ subscribe เห็นผลทันที (workflow จอง→เช็คอิน→เช็คเอาท์→ชำระ→แม่บ้าน ข้ามหน้าจริง)
//
// import: import { HotelDataProvider, useHotelData } from "../_components/data-context";

import React, { createContext, useContext, useMemo, useState } from "react";
import {
  rooms as seedRooms,
  guests as seedGuests,
  bookings as seedBookings,
  payments as seedPayments,
  housekeepingTasks as seedHk,
  roomTypeConfigs as seedConfigs,
  MOCK_ORG_ID,
} from "../_fixtures";
import type {
  Room,
  Guest,
  Booking,
  Payment,
  HousekeepingTask,
  RoomTypeConfig,
  BookingStatus,
  RoomStatus,
  HousekeepingStatus,
} from "../_fixtures/types";

export interface NewBookingInput {
  room_id: string;
  guest_id: string | null;
  guest_name: string;
  nationality: string | null;
  phone: string | null;
  stay_type: Booking["stay_type"];
  source: Booking["source"];
  check_in_date: string;
  check_out_date: string | null;
  nights: number | null;
  hours: number | null;
  adults: number;
  children: number;
  room_rate: number;
  extra_charges: number;
  discount: number;
  notes: string | null;
  /** มัดจำที่จ่ายตอนจอง (optional) */
  deposit?: { amount: number; method: Payment["method"] } | null;
}

export interface NewPaymentInput {
  booking_id: string;
  kind: Payment["kind"];
  method: Payment["method"];
  amount: number;
  paid_at: string; // ISO
  reference: string | null;
  note: string | null;
}

interface HotelData {
  rooms: Room[];
  guests: Guest[];
  bookings: Booking[];
  payments: Payment[];
  housekeeping: HousekeepingTask[];
  roomTypeConfigs: RoomTypeConfig[];

  // ─── mutators ───
  addBooking: (input: NewBookingInput) => Booking;
  updateBooking: (id: string, patch: Partial<Booking>) => void;
  setBookingStatus: (id: string, status: BookingStatus) => void;
  /** workflow helpers — เปลี่ยนสถานะ booking + sync ห้อง/แม่บ้าน */
  checkIn: (id: string) => void;
  checkOut: (id: string) => void;
  cancelBooking: (id: string) => void;
  markNoShow: (id: string) => void;

  addPayment: (input: NewPaymentInput) => void;

  setRoomStatus: (roomId: string, status: RoomStatus) => void;
  setHkStatus: (roomId: string, status: HousekeepingStatus) => void;
  updateRoom: (id: string, patch: Partial<Room>) => void;
  addRoom: (input: Omit<Room, "id" | "org_id" | "created_at" | "updated_at">) => void;

  addGuest: (input: Omit<Guest, "id" | "org_id" | "created_at" | "updated_at">) => Guest;
  updateGuest: (id: string, patch: Partial<Guest>) => void;
  deleteGuest: (id: string) => void;

  updateRoomTypeConfig: (id: string, patch: Partial<RoomTypeConfig>) => void;

  /** มอบหมาย/อัปเดตงานแม่บ้าน */
  updateHkTask: (id: string, patch: Partial<HousekeepingTask>) => void;
}

const Ctx = createContext<HotelData | null>(null);

let counter = 1;
const uid = (prefix: string) => `${prefix}-new-${Date.now()}-${counter++}`;

function nextBookingCode(bookings: Booking[]): string {
  const max = bookings.reduce((m, b) => {
    const n = Number(b.booking_code.replace(/\D/g, "").slice(-4));
    return Number.isFinite(n) && n > m ? n : m;
  }, 0);
  return `BK-2026-${String(max + 1).padStart(4, "0")}`;
}

export function HotelDataProvider({ children }: { children: React.ReactNode }) {
  const [rooms, setRooms] = useState<Room[]>(() => seedRooms);
  const [guests, setGuests] = useState<Guest[]>(() => seedGuests);
  const [bookings, setBookings] = useState<Booking[]>(() => seedBookings);
  const [payments, setPayments] = useState<Payment[]>(() => seedPayments);
  const [housekeeping, setHousekeeping] = useState<HousekeepingTask[]>(() => seedHk);
  const [roomTypeConfigs, setRoomTypeConfigs] = useState<RoomTypeConfig[]>(() => seedConfigs);

  const value = useMemo<HotelData>(() => {
    const now = () => new Date().toISOString();

    const addBooking: HotelData["addBooking"] = (input) => {
      const room_total =
        input.stay_type === "hourly"
          ? input.room_rate * (input.hours ?? 0)
          : input.room_rate * (input.nights ?? 0);
      const grand_total = room_total + input.extra_charges - input.discount;
      const booking: Booking = {
        id: uid("bk"),
        org_id: MOCK_ORG_ID,
        booking_code: nextBookingCode(bookings),
        room_id: input.room_id,
        guest_id: input.guest_id,
        guest_name: input.guest_name,
        nationality: input.nationality,
        phone: input.phone,
        stay_type: input.stay_type,
        source: input.source,
        check_in_date: input.check_in_date,
        check_in_time: null,
        check_out_date: input.check_out_date,
        check_out_time: null,
        nights: input.nights,
        hours: input.hours,
        adults: input.adults,
        children: input.children,
        room_rate: input.room_rate,
        room_total,
        extra_charges: input.extra_charges,
        discount: input.discount,
        grand_total,
        status: "reserved",
        notes: input.notes,
        created_by: null,
        created_at: now(),
        updated_at: now(),
      };
      setBookings((prev) => [booking, ...prev]);
      // ห้อง → reserved
      setRooms((prev) =>
        prev.map((r) => (r.id === input.room_id ? { ...r, status: "reserved" } : r)),
      );
      // มัดจำ (ถ้ามี)
      if (input.deposit && input.deposit.amount > 0) {
        setPayments((prev) => [
          {
            id: uid("pay"),
            org_id: MOCK_ORG_ID,
            booking_id: booking.id,
            kind: "deposit",
            method: input.deposit!.method,
            amount: input.deposit!.amount,
            paid_at: now(),
            reference: null,
            received_by: null,
            note: "มัดจำตอนจอง",
            created_at: now(),
          },
          ...prev,
        ]);
      }
      return booking;
    };

    const updateBooking: HotelData["updateBooking"] = (id, patch) =>
      setBookings((prev) =>
        prev.map((b) => (b.id === id ? { ...b, ...patch, updated_at: now() } : b)),
      );

    const setBookingStatus: HotelData["setBookingStatus"] = (id, status) =>
      updateBooking(id, { status });

    const checkIn: HotelData["checkIn"] = (id) => {
      const b = bookings.find((x) => x.id === id);
      updateBooking(id, {
        status: "checked_in",
        check_in_time: new Date().toTimeString().slice(0, 5),
      });
      if (b)
        setRooms((prev) =>
          prev.map((r) => (r.id === b.room_id ? { ...r, status: "occupied" } : r)),
        );
    };

    const checkOut: HotelData["checkOut"] = (id) => {
      const b = bookings.find((x) => x.id === id);
      updateBooking(id, { status: "checked_out" });
      if (b) {
        setRooms((prev) =>
          prev.map((r) =>
            r.id === b.room_id ? { ...r, status: "available", housekeeping_status: "dirty" } : r,
          ),
        );
        // สร้างงานแม่บ้าน
        setHousekeeping((prev) => [
          {
            id: uid("hk"),
            org_id: MOCK_ORG_ID,
            room_id: b.room_id,
            task_date: new Date().toISOString().slice(0, 10),
            status: "dirty",
            assigned_to: null,
            started_at: null,
            completed_at: null,
            note: `${b.guest_name} เช็คเอาท์ — รอทำความสะอาด`,
            created_at: now(),
            updated_at: now(),
          },
          ...prev,
        ]);
      }
    };

    const releaseRoom = (id: string) => {
      const b = bookings.find((x) => x.id === id);
      if (b)
        setRooms((prev) =>
          prev.map((r) => (r.id === b.room_id ? { ...r, status: "available" } : r)),
        );
    };

    const cancelBooking: HotelData["cancelBooking"] = (id) => {
      updateBooking(id, { status: "cancelled" });
      releaseRoom(id);
    };
    const markNoShow: HotelData["markNoShow"] = (id) => {
      updateBooking(id, { status: "no_show" });
      releaseRoom(id);
    };

    const addPayment: HotelData["addPayment"] = (input) =>
      setPayments((prev) => [
        {
          id: uid("pay"),
          org_id: MOCK_ORG_ID,
          booking_id: input.booking_id,
          kind: input.kind,
          method: input.method,
          amount: input.amount,
          paid_at: input.paid_at,
          reference: input.reference,
          received_by: null,
          note: input.note,
          created_at: now(),
        },
        ...prev,
      ]);

    const setRoomStatus: HotelData["setRoomStatus"] = (roomId, status) =>
      setRooms((prev) =>
        prev.map((r) => (r.id === roomId ? { ...r, status, updated_at: now() } : r)),
      );

    const setHkStatus: HotelData["setHkStatus"] = (roomId, status) => {
      setRooms((prev) =>
        prev.map((r) =>
          r.id === roomId ? { ...r, housekeeping_status: status, updated_at: now() } : r,
        ),
      );
      setHousekeeping((prev) =>
        prev.map((t) =>
          t.room_id === roomId && t.task_date === new Date().toISOString().slice(0, 10)
            ? {
                ...t,
                status,
                started_at: status === "cleaning" ? now() : t.started_at,
                completed_at: status === "inspected" || status === "clean" ? now() : t.completed_at,
                updated_at: now(),
              }
            : t,
        ),
      );
    };

    const updateRoom: HotelData["updateRoom"] = (id, patch) =>
      setRooms((prev) =>
        prev.map((r) => (r.id === id ? { ...r, ...patch, updated_at: now() } : r)),
      );

    const addRoom: HotelData["addRoom"] = (input) =>
      setRooms((prev) => [
        ...prev,
        { ...input, id: uid("room"), org_id: MOCK_ORG_ID, created_at: now(), updated_at: now() },
      ]);

    const addGuest: HotelData["addGuest"] = (input) => {
      const g: Guest = {
        ...input,
        id: uid("guest"),
        org_id: MOCK_ORG_ID,
        created_at: now(),
        updated_at: now(),
      };
      setGuests((prev) => [g, ...prev]);
      return g;
    };
    const updateGuest: HotelData["updateGuest"] = (id, patch) =>
      setGuests((prev) =>
        prev.map((g) => (g.id === id ? { ...g, ...patch, updated_at: now() } : g)),
      );
    const deleteGuest: HotelData["deleteGuest"] = (id) =>
      setGuests((prev) => prev.filter((g) => g.id !== id));

    const updateRoomTypeConfig: HotelData["updateRoomTypeConfig"] = (id, patch) =>
      setRoomTypeConfigs((prev) =>
        prev.map((c) => (c.id === id ? { ...c, ...patch, updated_at: now() } : c)),
      );

    const updateHkTask: HotelData["updateHkTask"] = (id, patch) =>
      setHousekeeping((prev) =>
        prev.map((t) => (t.id === id ? { ...t, ...patch, updated_at: now() } : t)),
      );

    return {
      rooms,
      guests,
      bookings,
      payments,
      housekeeping,
      roomTypeConfigs,
      addBooking,
      updateBooking,
      setBookingStatus,
      checkIn,
      checkOut,
      cancelBooking,
      markNoShow,
      addPayment,
      setRoomStatus,
      setHkStatus,
      updateRoom,
      addRoom,
      addGuest,
      updateGuest,
      deleteGuest,
      updateRoomTypeConfig,
      updateHkTask,
    };
  }, [rooms, guests, bookings, payments, housekeeping, roomTypeConfigs]);

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useHotelData(): HotelData {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useHotelData ต้องใช้ภายใน <HotelDataProvider>");
  return ctx;
}

/** helper: ราคา/คืน (หรือ/ชม.) ของห้อง = price_override ?? base ของ room_type */
export function resolveRoomRate(
  room: Room,
  configs: RoomTypeConfig[],
  stayType: "daily" | "hourly",
): number {
  const cfg = configs.find((c) => c.room_type === room.room_type);
  if (stayType === "hourly") {
    return room.price_override ?? cfg?.base_price_hourly ?? 0;
  }
  return room.price_override ?? cfg?.base_price_daily ?? 0;
}
