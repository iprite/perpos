import Link from "next/link";
import { FlaskConical, ArrowRight } from "lucide-react";

import { requireSuperAdminPage } from "@/lib/admin/guard";
import { AdminPage } from "../_components/admin-page";
import { PROTOTYPE_REGISTRY } from "./_registry";

// Server Component — gate ตอน SSR (super_admin เท่านั้น), ไม่มี client fetch
export default async function PrototypesIndexPage() {
  await requireSuperAdminPage();

  return (
    <AdminPage
      title="Prototypes (preview)"
      icon={<FlaskConical className="h-6 w-6" />}
      description="โซน mock สำหรับพรีเซนโมดูลใหม่ก่อนสร้างจริง — ข้อมูลเป็นตัวอย่าง ไม่เชื่อมต่อฐานข้อมูล · เห็นเฉพาะ super_admin"
    >
      {PROTOTYPE_REGISTRY.length === 0 ? (
        // Empty state (DESIGN §8) — icon + คำอธิบาย + CTA
        <div className="flex flex-col items-center justify-center rounded-xl border border-gray-200 bg-white py-16 text-center shadow-sm">
          <div className="mb-4 rounded-full bg-gray-100 p-4">
            <FlaskConical className="h-8 w-8 text-gray-400" />
          </div>
          <h3 className="text-sm font-medium text-gray-900">ยังไม่มี prototype</h3>
          <p className="mt-1 max-w-sm text-sm text-gray-500">
            เมื่อ Module Factory สร้างโมดูลใหม่ในโหมด prototype รายการจะปรากฏที่นี่ให้คลิกเข้าดู
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {PROTOTYPE_REGISTRY.map((p) => (
            <Link
              key={p.key}
              href={p.href}
              className="group flex flex-col rounded-xl border border-gray-200 bg-white p-5 shadow-sm transition-colors duration-150 hover:border-gray-300 hover:bg-gray-50"
            >
              <div className="flex items-center gap-3">
                <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-gray-100 text-gray-600">
                  {p.icon}
                </span>
                <span className="text-base font-medium text-gray-900">{p.label}</span>
              </div>
              <p className="mt-3 flex-1 text-sm text-gray-500">{p.description}</p>
              <span className="mt-4 inline-flex items-center gap-1 text-sm font-medium text-primary">
                เปิดดู prototype
                <ArrowRight className="h-4 w-4 transition-transform duration-150 group-hover:translate-x-0.5" />
              </span>
            </Link>
          ))}
        </div>
      )}
    </AdminPage>
  );
}
