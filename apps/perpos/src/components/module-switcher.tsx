"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import cn from "@core/utils/class-names";

const MODULES = [
  { id: "accounting", label: "Accounting", href: "/me",             match: (p: string) => !p.startsWith("/payroll") && !p.startsWith("/admin") },
  { id: "payroll",    label: "Payroll",    href: "/payroll/salary", match: (p: string) => p.startsWith("/payroll") },
];

export function ModuleSwitcher() {
  const pathname = usePathname() ?? "/";
  const active = MODULES.find((m) => m.match(pathname))?.id ?? "accounting";

  return (
    <div className="flex items-center rounded-lg border border-slate-200 bg-white p-0.5">
      {MODULES.map((m) => (
        <Link
          key={m.id}
          href={m.href}
          className={cn(
            "rounded-md px-3 py-1 text-sm font-medium transition-colors",
            active === m.id
              ? "bg-slate-900 text-white"
              : "text-slate-500 hover:text-slate-700",
          )}
        >
          {m.label}
        </Link>
      ))}
    </div>
  );
}
