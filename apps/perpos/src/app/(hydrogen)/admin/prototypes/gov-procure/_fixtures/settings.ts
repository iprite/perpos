// settings.ts — default GovProcureSettings (spec §3.2b)
// prototype = client state ในหน้า settings (ไม่ persist ข้าม reload) — production = ตาราง gov_procure_settings

import type { GovProcureSettings } from "./types";

export const DEFAULT_GOV_PROCURE_SETTINGS: GovProcureSettings = {
  org_id: "org-gov-procure-demo",
  sla_threshold: 30, // เกณฑ์ overdue (วัน) — spec §9 Q2 LOCKED = 30
  pct_customer_change: 10, // % ทอนลูกค้า
  pct_petty: 5, // % petty cash
  pct_operate: 10, // % ค่าดำเนินการ 89
  line_alert_enabled: true,
  line_recipients: ["owner", "manager"], // default LOCKED (spec §5c)
  line_weekly_enabled: true,
  line_event_paid: true, // T3 paid=on (default LOCKED)
  line_event_delivered: false, // T3 delivered=off (default LOCKED)
  created_at: "2026-01-01T00:00:00Z",
  updated_at: "2026-01-01T00:00:00Z",
};
