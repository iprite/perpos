// index.ts — barrel export ของ fixtures ทั้งหมด (golf-club module)
export * from "./types";
export * from "./resources";
export * from "./pricing";
export * from "./membership-plans";
export * from "./members";
export * from "./points";
export * from "./settings";
export * from "./bookings";
export * from "./bookings-history";
export * from "./ai-mocks";
export * from "./line-mocks";

import { golfBookings } from "./bookings";
import { golfBookingsHistory } from "./bookings-history";

// รวมทุก booking (วันนี้+พรุ่งนี้+variety + ประวัติย้อนหลัง 3 anchor member) — สะดวกสำหรับหน้า Bookings list / Members detail
export const allGolfBookings = [...golfBookings, ...golfBookingsHistory];
