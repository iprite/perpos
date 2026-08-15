import { PageShell } from "@/components/ui/page-shell";
import { Skeleton } from "@/components/ui/skeleton";
import { MailListSkeleton } from "@/components/mail/mail-list";

/**
 * loading.tsx ของหน้าเมล — layout ต่างจากหน้าอื่นในแอป (2 pane) จึงต้องมีของตัวเอง
 * skeleton 8 แถวทรงเดียวกับ <MailRow> ตาม MAIL_UI_SPEC §9 — **ห้าม spinner กลางจอ**
 */
export default function Loading() {
  return (
    <PageShell width="full">
      <div className="flex h-[calc(100vh-5rem)] min-h-[30rem] overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
        <div className="flex min-h-0 w-full flex-col border-gray-200 lg:w-[380px] lg:shrink-0 lg:border-r">
          <div className="flex h-12 items-center gap-2 border-b border-gray-200 px-3">
            <Skeleton className="h-4 w-24" />
            <Skeleton className="ms-auto h-8 w-48 rounded-md" />
          </div>
          <div className="min-h-0 flex-1 overflow-hidden">
            <MailListSkeleton />
          </div>
        </div>
        <div className="hidden min-h-0 flex-1 lg:block">
          <div className="flex items-center gap-2 border-b border-gray-200 px-3 py-2.5">
            <Skeleton className="h-5 w-2/3" />
          </div>
          <div className="mx-auto w-full max-w-3xl space-y-3 px-5 py-5">
            <Skeleton className="h-12 w-full rounded-lg" />
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-4 w-11/12" />
            <Skeleton className="h-4 w-2/3" />
          </div>
        </div>
      </div>
    </PageShell>
  );
}
