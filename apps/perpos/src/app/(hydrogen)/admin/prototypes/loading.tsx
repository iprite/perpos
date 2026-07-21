import { PageSkeleton } from "@/components/ui/page-skeleton";

// Prototypes index — grid การ์ด (ใช้ dashboard variant ให้ใกล้เคียง layout จริง)
export default function Loading() {
  return <PageSkeleton variant="dashboard" width="default" />;
}
