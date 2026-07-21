// loading.tsx — skeleton ระหว่างหน้า acc-firm โหลด (DESIGN §9 — ไม่ใช้ spinner กลางจอ)
// เลียนโครง dashboard: header + KPI 4 ใบ + การ์ดต่อ client 2 คอลัมน์

import { PageShell } from "@/components/ui/page-shell";

function Bar({ className = "" }: { className?: string }) {
  return <div className={`rounded bg-gray-100 ${className}`} />;
}

export default function AccFirmLoading() {
  return (
    <PageShell width="full" title="สำนักงานบัญชี" description="กำลังโหลด…">
      <div className="animate-pulse space-y-5">
        {/* KPI 4 ใบ */}
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
              <Bar className="h-4 w-24" />
              <Bar className="mt-3 h-7 w-28" />
              <Bar className="mt-2 h-3 w-16" />
            </div>
          ))}
        </div>

        {/* การ์ดต่อ client */}
        <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
          {Array.from({ length: 4 }).map((_, i) => (
            <div
              key={i}
              className="space-y-3 rounded-xl border border-gray-200 bg-white p-4 shadow-sm"
            >
              <div className="flex items-center gap-2.5">
                <Bar className="h-9 w-9 rounded-lg" />
                <div className="space-y-1.5">
                  <Bar className="h-4 w-32" />
                  <Bar className="h-3 w-20" />
                </div>
              </div>
              <div className="grid grid-cols-3 gap-2">
                {Array.from({ length: 3 }).map((_, j) => (
                  <Bar key={j} className="h-10 w-full" />
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    </PageShell>
  );
}
