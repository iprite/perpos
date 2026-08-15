import { Skeleton } from "@/components/ui/skeleton";

/**
 * baseline skeleton ของ PERPOS Mail (ครอบทุกหน้าในโซนนี้ — DESIGN.md §9 ห้าม spinner กลางจอ)
 * หน้ารายการเมลมี skeleton ของตัวเองที่ละเอียดกว่าอยู่แล้ว (`mail/loading.tsx`)
 */
export default function Loading() {
  return (
    <div className="mx-auto w-full max-w-md space-y-3 py-10">
      <Skeleton className="h-10 w-full rounded-xl" />
      <Skeleton className="h-40 w-full rounded-xl" />
    </div>
  );
}
