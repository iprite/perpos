// loading.tsx — skeleton ระหว่าง SSR layout/page โหลด (DESIGN §9 — ไม่ใช้ spinner กลางจอ)
// เลียนโครง AccountingShell: header + sidebar 2 กลุ่ม + KPI 4 ใบ + ตาราง

import { PageShell } from "@/components/ui/page-shell";

function Bar({ className = "" }: { className?: string }) {
  return <div className={`rounded bg-gray-100 ${className}`} />;
}

export default function AccountingLoading() {
  return (
    <PageShell width="full" title="บัญชี & การเงิน" description="กำลังโหลด…">
      <div className="grid animate-pulse grid-cols-1 gap-5 lg:grid-cols-12">
        {/* sidebar */}
        <aside className="lg:col-span-3 xl:col-span-2">
          <div className="rounded-xl border border-gray-200 bg-white p-3 shadow-sm">
            <Bar className="mb-3 h-3 w-16" />
            <div className="space-y-2">
              {Array.from({ length: 6 }).map((_, i) => (
                <Bar key={i} className="h-8 w-full" />
              ))}
            </div>
            <Bar className="mb-2 mt-4 h-3 w-20" />
            <div className="space-y-2">
              {Array.from({ length: 3 }).map((_, i) => (
                <Bar key={i} className="h-8 w-full" />
              ))}
            </div>
          </div>
        </aside>

        {/* main */}
        <main className="min-w-0 space-y-5 lg:col-span-9 xl:col-span-10">
          {/* KPI 4 ใบ */}
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
                <Bar className="h-4 w-24" />
                <Bar className="mt-3 h-7 w-32" />
              </div>
            ))}
          </div>

          {/* ตาราง */}
          <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
            <Bar className="mb-4 h-5 w-40" />
            <div className="space-y-3">
              {Array.from({ length: 6 }).map((_, i) => (
                <Bar key={i} className="h-10 w-full" />
              ))}
            </div>
          </div>
        </main>
      </div>
    </PageShell>
  );
}
