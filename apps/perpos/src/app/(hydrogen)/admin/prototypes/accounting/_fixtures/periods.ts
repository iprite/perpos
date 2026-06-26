// periods.ts — acc_periods (งวดบัญชี)
// เดือนปัจจุบัน (มิ.ย. 2569) = open, เดือนก่อนหน้า = closed

import type { AccPeriod } from "./types";
import { MOCK_ORG_ID } from "./org-settings";

const ORG = MOCK_ORG_ID;

export const mockPeriods: AccPeriod[] = [
  {
    id: "period-jan-2026",
    org_id: ORG,
    year: 2026,
    month: 1,
    status: "closed",
    closed_at: "2026-02-05T17:00:00.000Z",
    closed_by: null,
  },
  {
    id: "period-feb-2026",
    org_id: ORG,
    year: 2026,
    month: 2,
    status: "closed",
    closed_at: "2026-03-04T17:00:00.000Z",
    closed_by: null,
  },
  {
    id: "period-mar-2026",
    org_id: ORG,
    year: 2026,
    month: 3,
    status: "closed",
    closed_at: "2026-04-03T17:00:00.000Z",
    closed_by: null,
  },
  {
    id: "period-apr-2026",
    org_id: ORG,
    year: 2026,
    month: 4,
    status: "closed",
    closed_at: "2026-05-07T17:00:00.000Z",
    closed_by: null,
  },
  {
    id: "period-may-2026",
    org_id: ORG,
    year: 2026,
    month: 5,
    status: "closed",
    closed_at: "2026-06-05T17:00:00.000Z",
    closed_by: null,
  },
  {
    id: "period-jun-2026",
    org_id: ORG,
    year: 2026,
    month: 6,
    status: "open", // เดือนปัจจุบัน
    closed_at: null,
    closed_by: null,
  },
];

export const currentPeriod = mockPeriods.find((p) => p.status === "open");
