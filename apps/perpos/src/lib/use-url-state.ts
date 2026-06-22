"use client";

/**
 * useUrlState — sync filter/view ลง URL searchParams (saved view)
 *
 * ให้หน้า list ที่ "บันทึก view ได้" — bookmark/แชร์ลิงก์แล้วกลับมาเห็น filter เดิม
 *   const url = useUrlState();
 *   const [q, setQ] = useState(() => url.get("q"));
 *   // ตอน apply filter: url.commit({ q, status });
 *
 * commit ใช้ router.replace (ไม่เพิ่ม history) + scroll:false — เปลี่ยน URL เงียบ ๆ
 * ค่าว่างจะถูกตัดออกจาก URL (ไม่รก)
 */

import { useCallback } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

export function useUrlState() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const get = useCallback(
    (key: string, fallback = "") => searchParams.get(key) ?? fallback,
    [searchParams],
  );

  const commit = useCallback(
    (values: Record<string, string | number | null | undefined>) => {
      const p = new URLSearchParams();
      for (const [k, v] of Object.entries(values)) {
        // ตัดเฉพาะค่าว่างจริง — เก็บ 0 ไว้ (อาจเป็น id/จำนวน/สถานะที่ valid)
        if (v !== null && v !== undefined && v !== "") p.set(k, String(v));
      }
      const qs = p.toString();
      router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
    },
    [router, pathname],
  );

  return { get, commit };
}
