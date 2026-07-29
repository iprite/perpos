"use client";

// แถบตัวกรองของหน้าแรกคลังเอกสาร — searchParams-driven (SERVER_COMPONENT_PATTERN §2)
// ค่าที่กรองอยู่ใน URL เสมอ → หน้าเป็น server component ได้ + แชร์ลิงก์ได้

import { useEffect, useState } from "react";
import { useRouter, usePathname } from "next/navigation";
import { FilterBar, FilterSearch, FilterClear } from "@/components/ui/filter-bar";
import { CustomSelect } from "@/components/ui/custom-select";

const SCOPE_OPTIONS = [
  { value: "", label: "ลูกค้าทั้งหมด" },
  { value: "missing", label: "เฉพาะที่ยังขาดเอกสาร" },
  { value: "overdue", label: "เฉพาะที่เลยกำหนด" },
];

export function VaultClientFilter({ q, scope }: { q: string; scope: string }) {
  const router = useRouter();
  const pathname = usePathname();
  const [search, setSearch] = useState(q);

  // sync กลับเมื่อ URL เปลี่ยนจากที่อื่น (back/forward)
  useEffect(() => setSearch(q), [q]);

  function push(next: { q?: string; scope?: string }) {
    const params = new URLSearchParams();
    const nq = next.q ?? search;
    const ns = next.scope ?? scope;
    if (nq.trim()) params.set("q", nq.trim());
    if (ns) params.set("scope", ns);
    const qs = params.toString();
    router.push(qs ? `${pathname}?${qs}` : pathname);
  }

  return (
    <FilterBar>
      <FilterSearch
        value={search}
        onChange={setSearch}
        onEnter={() => push({})}
        placeholder="ค้นหา รหัส / ชื่อบริษัท / เลขผู้เสียภาษี"
      />
      <CustomSelect
        value={scope}
        onChange={(v) => push({ scope: v })}
        options={SCOPE_OPTIONS}
        className="w-56"
      />
      <FilterClear
        disabled={!q && !scope && !search}
        onClick={() => {
          setSearch("");
          router.push(pathname);
        }}
      />
    </FilterBar>
  );
}
