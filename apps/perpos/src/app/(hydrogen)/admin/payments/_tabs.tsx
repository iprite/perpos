"use client";

/** แถบแท็บของ Payments console — รวมทุกหน้าเกี่ยวกับเงินไว้ที่เดียว */
import Link from "next/link";
import { usePathname } from "next/navigation";
import cn from "@core/utils/class-names";

const TABS = [
  { href: "/admin/payments", label: "ภาพรวม" },
  { href: "/admin/billing", label: "องค์กร (B2B)" },
  { href: "/admin/stt-billing", label: "บุคคล (B2C)" },
  { href: "/admin/tokens", label: "เครดิต & Token" },
];

export function PaymentsTabs() {
  const pathname = usePathname();
  return (
    <div className="flex flex-wrap gap-1 border-b border-gray-200">
      {TABS.map((t) => {
        const active = pathname === t.href;
        return (
          <Link
            key={t.href}
            href={t.href}
            className={cn(
              "relative -mb-px rounded-t-lg px-3.5 py-2 text-sm font-medium transition-colors",
              active
                ? "border-b-2 border-primary text-primary"
                : "border-b-2 border-transparent text-gray-500 hover:text-gray-800",
            )}
          >
            {t.label}
          </Link>
        );
      })}
    </div>
  );
}
