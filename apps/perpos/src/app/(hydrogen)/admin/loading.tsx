import { PageSkeleton } from "@/components/ui/page-skeleton";

// Admin console — ส่วนใหญ่เป็น list/table
export default function Loading() {
  return <PageSkeleton variant="table" width="wide" />;
}
