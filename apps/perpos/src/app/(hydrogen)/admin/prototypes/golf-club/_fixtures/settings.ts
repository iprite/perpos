// settings.ts — golf_settings (1 row/org) — prototype = client state seed, ไม่ persist ข้าม reload
// allow_overbooking = reserved-for-future (D4 ห้าม overbook v1) — ไม่โชว์ toggle ในหน้า settings
import type { GolfSettings } from "./types";

export const golfSettings: GolfSettings = {
  org_id: "org-golf-greenvalley",
  course_open_time: "06:00",
  course_close_time: "16:00",
  default_tee_interval_min: 10,
  range_open_time: "08:00",
  range_close_time: "20:00",
  allow_overbooking: false, // LOCKED — v1 ห้าม overbook เสมอ
  require_deposit: true,
  deposit_amount_default: 500,
  reminder_hours_before: 12,
  line_booking_enabled: true,
  line_confirm_enabled: true,
  line_reminder_enabled: true,
  line_owner_report_enabled: true,
  line_recipients: { owner: true, manager: true },
  created_at: "2026-01-05T02:00:00.000Z",
  updated_at: "2026-07-01T02:00:00.000Z",
};
