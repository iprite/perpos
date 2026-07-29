"use client";

// LinkRow — แถวตารางที่คลิกแล้วไปหน้าอื่น (TableRow มี onClick อย่างเดียว ไม่มี href)
// แยกเป็น client component เล็ก ๆ เพื่อให้หน้า list ยังเป็น Server Component ได้

import type { ReactNode } from "react";
import { useRouter } from "next/navigation";
import { TableRow } from "@/components/ui/table";

export function LinkRow({ href, children }: { href: string; children: ReactNode }) {
  const router = useRouter();
  return (
    <TableRow clickable onClick={() => router.push(href)}>
      {children}
    </TableRow>
  );
}
