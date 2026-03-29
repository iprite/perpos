"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import React, { useEffect, useMemo, useState } from "react";

import { useRole } from "@/app/providers";
import { cn } from "@/lib/cn";
import { firstNavHref, navForRole } from "@/lib/roles";

export function AppShell({ children }: { children: React.ReactNode }) {
  const { loading, profile, role, signOut, user } = useRole();
  const router = useRouter();
  const pathname = usePathname();
  const [collapsed, setCollapsed] = useState(false);

  const allowedNav = useMemo(() => (role ? navForRole(role) : []), [role]);
  const isAllowedPath = useMemo(() => {
    if (!role) return false;
    if (pathname === "/login") return true;
    return allowedNav.some((n) => pathname === n.href || pathname.startsWith(n.href + "/"));
  }, [allowedNav, pathname, role]);

  useEffect(() => {
    if (loading) return;
    if (!user) {
      router.replace("/login");
      return;
    }
    if (!role) return;
    if (pathname === "/") {
      router.replace(firstNavHref(role));
      return;
    }
    if (!isAllowedPath) {
      router.replace(firstNavHref(role));
    }
  }, [isAllowedPath, loading, pathname, role, router, user]);

  const onLogout = async () => {
    await signOut();
    router.replace("/login");
  };

  return (
    <div className="min-h-screen bg-[color:var(--color-background)] text-[color:var(--color-foreground)]">
      <div className="grid min-h-screen grid-rows-[56px_1fr] grid-cols-[auto_1fr]">
        <aside
          className={cn(
            "row-span-2 border-r bg-[color:var(--color-surface)]",
            collapsed ? "w-[72px]" : "w-[240px]",
          )}
        >
          <div className="h-[56px] px-4 flex items-center justify-between border-b">
            <Link href={role ? firstNavHref(role) : "/"} className="font-semibold text-sm">
              {collapsed ? "EX" : "ExApp"}
            </Link>
            <button
              type="button"
              onClick={() => setCollapsed((v) => !v)}
              className="h-8 w-8 rounded-md border bg-[color:var(--color-surface-2)] hover:bg-white/40 dark:hover:bg-white/5 transition"
              aria-label="Toggle sidebar"
            >
              <span className="text-xs text-[color:var(--color-muted)]">≡</span>
            </button>
          </div>
          <nav className="p-2">
            {allowedNav.map((item) => {
              const active = pathname === item.href || pathname.startsWith(item.href + "/");
              return (
                <Link
                  key={item.key}
                  href={item.href}
                  className={cn(
                    "flex items-center gap-3 rounded-md px-3 py-2 text-sm transition",
                    active
                      ? "bg-[color:var(--color-surface-2)] border border-[color:var(--color-border)]"
                      : "hover:bg-[color:var(--color-surface-2)]",
                  )}
                >
                  <span className="h-8 w-8 rounded-md border bg-[color:var(--color-surface-2)] flex items-center justify-center text-xs text-[color:var(--color-muted)]">
                    {item.label.slice(0, 1)}
                  </span>
                  {!collapsed ? <span className="truncate">{item.label}</span> : null}
                </Link>
              );
            })}
          </nav>
        </aside>

        <header className="col-start-2 row-start-1 border-b bg-[color:var(--color-surface-2)]">
          <div className="h-[56px] px-4 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="text-sm font-semibold">Internal Company Management</div>
              <div className="text-xs text-[color:var(--color-muted)]">Role-based navigation</div>
            </div>
            <div className="flex items-center gap-3">
              <div className="hidden md:flex items-center gap-2 text-sm">
                <span className="text-[color:var(--color-muted)]">{profile?.email ?? user?.email ?? ""}</span>
                {role ? (
                  <span className="rounded-full border bg-[color:var(--color-surface)] px-2 py-0.5 text-xs">{role}</span>
                ) : null}
              </div>
              <button
                type="button"
                onClick={onLogout}
                className="h-9 rounded-md border bg-[color:var(--color-surface)] px-3 text-sm hover:bg-[color:var(--color-surface-2)] transition"
              >
                ออกจากระบบ
              </button>
            </div>
          </div>
        </header>

        <main className="col-start-2 row-start-2 bg-[color:var(--color-background)]">
          <div className="mx-auto max-w-[1200px] p-6">
            {isAllowedPath ? children : null}
          </div>
        </main>
      </div>
    </div>
  );
}
