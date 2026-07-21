// _components/index.ts — barrel shared foundation ของ prototype hotel
// หน้าต่าง ๆ import จากที่นี่:  import { HotelShell, useHotelRole, useHotelData, fmtMoney } from "../_components";

export * from "./format";
export * from "./money";
export * from "./badges";
export * from "./role-context";
export * from "./data-context";
export { RoleSwitcher } from "./role-switcher";
export { HotelShell } from "./nav";
export { BookingDialog } from "./booking-dialog";
export { PaymentDialog } from "./payment-dialog";
export { BookingDetailDialog } from "./booking-detail-dialog";
export { AiSummaryBox } from "./ai-summary-box";
export { NoAccess } from "./no-access";
export { RoomBoard } from "./room-board";
export { activeBookingForRoom, bookingOnDate, addDayIso } from "./booking-helpers";
