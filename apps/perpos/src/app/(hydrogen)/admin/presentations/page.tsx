import Link from "next/link";
import { Presentation, ArrowRight, FileText } from "lucide-react";

import { requireSuperAdminPage } from "@/lib/admin/guard";
import { StatusBadge } from "@/components/ui/badge";
import { AdminPage } from "../_components/admin-page";
import { listDecks } from "@/lib/admin/presentations";

// Server Component — gate SSR (super_admin) + ดึง deck list ตอน render
export default async function PresentationDeskPage() {
  const admin = await requireSuperAdminPage();
  const decks = await listDecks(admin);

  return (
    <AdminPage
      title="สื่อนำเสนอ (Desk)"
      icon={<Presentation className="h-6 w-6" />}
      description="คลังสื่อนำเสนอ HTML ที่ Presentation Factory ผลิต — พรีวิว แก้ HTML ได้โดยตรง และดูประวัติเวอร์ชัน · เห็นเฉพาะ super_admin"
    >
      {decks.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-xl border border-gray-200 bg-white py-16 text-center shadow-sm">
          <div className="mb-4 rounded-full bg-gray-100 p-4">
            <Presentation className="h-8 w-8 text-gray-400" />
          </div>
          <h3 className="text-sm font-medium text-gray-900">ยังไม่มีสื่อนำเสนอ</h3>
          <p className="mt-1 max-w-sm text-sm text-gray-500">
            สั่งทีม Presentation Factory (หลังบ้าน) ให้ผลิต deck —
            ผลงานจะถูกเขียนเข้าระบบเป็นฉบับร่าง แล้วมาแก้เล็กน้อย/เผยแพร่ที่นี่
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {decks.map((d) => (
            <Link
              key={d.id}
              href={`/admin/presentations/${d.id}`}
              className="group flex flex-col rounded-xl border border-gray-200 bg-white p-5 shadow-sm transition-colors duration-150 hover:border-gray-300 hover:bg-gray-50"
            >
              <div className="flex items-start justify-between gap-2">
                <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-gray-100 text-gray-600">
                  {d.format === "one_pager" ? (
                    <FileText className="h-5 w-5" />
                  ) : (
                    <Presentation className="h-5 w-5" />
                  )}
                </span>
                <StatusBadge tone={d.status === "published" ? "success" : "neutral"}>
                  {d.status === "published" ? "เผยแพร่" : "ฉบับร่าง"}
                </StatusBadge>
              </div>
              <span className="mt-3 text-base font-medium text-gray-900">{d.title}</span>
              {d.description && (
                <p className="mt-1 line-clamp-2 flex-1 text-sm text-gray-500">{d.description}</p>
              )}
              <span className="mt-3 text-xs text-gray-400">
                {d.audience ? `${d.audience} · ` : ""}เวอร์ชัน {d.version}
              </span>
              <span className="mt-3 inline-flex items-center gap-1 text-sm font-medium text-primary">
                เปิดดู
                <ArrowRight className="h-4 w-4 transition-transform duration-150 group-hover:translate-x-0.5" />
              </span>
            </Link>
          ))}
        </div>
      )}
    </AdminPage>
  );
}
