import { PageSkeleton } from "@/components/ui/page-skeleton";

// Fallback ระหว่าง navigation/SSR ของหน้า protected ที่ไม่มี loading เฉพาะ
export default function Loading() {
  return <PageSkeleton variant="dashboard" />;
}
