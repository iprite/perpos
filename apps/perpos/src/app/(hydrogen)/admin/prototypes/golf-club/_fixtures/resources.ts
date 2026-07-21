// resources.ts — golf_resources fixture (1 course 18 หลุม + 12 bay ไดร์ฟ)
import type { GolfResource } from "./types";

const now = "2026-01-05T02:00:00.000Z";

export const golfCourse: GolfResource = {
  id: "res-course-a",
  org_id: "org-golf-greenvalley",
  resource_type: "course",
  name: "สนาม A (18 หลุม)",
  code: "A",
  holes: 18,
  tee_interval_min: 10,
  open_time: "06:00",
  close_time: "16:00",
  max_party_size: 4,
  status: "active",
  sort_order: 1,
  created_at: now,
  updated_at: now,
};

// bay-09 และ bay-12 = maintenance (โชว์สถานะซ่อมใน bay grid)
export const golfBays: GolfResource[] = Array.from({ length: 12 }, (_, i) => {
  const n = i + 1;
  const id = `res-bay-${String(n).padStart(2, "0")}`;
  const isMaintenance = n === 9 || n === 12;
  return {
    id,
    org_id: "org-golf-greenvalley",
    resource_type: "bay",
    name: `Bay ${n}`,
    code: `B${n}`,
    holes: null,
    tee_interval_min: null,
    open_time: "08:00",
    close_time: "20:00",
    max_party_size: 1,
    status: isMaintenance ? "maintenance" : "active",
    sort_order: n,
    created_at: now,
    updated_at: now,
  } satisfies GolfResource;
});

export const golfResources: GolfResource[] = [golfCourse, ...golfBays];
