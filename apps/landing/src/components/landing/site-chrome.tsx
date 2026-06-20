"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Building2, Home, MessageCircle, UserRound } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { BrandIcon } from "./brand-icon";

export const LINE_URL = "https://line.me/R/ti/p/@perpos";
export const APP_URL = "https://app.perpos.ai/signin";
export const CONTACT_URL = "mailto:hello@perpos.ai";

const NAV = [
  { href: "/", label: "PERPOS", icon: Home, exact: true, brand: null },
  { href: "/flow", label: "Flow", icon: MessageCircle, exact: false, brand: "flow" as const },
  { href: "/suite", label: "Suite", icon: Building2, exact: false, brand: "suite" as const },
];

const MOBILE_NAV = NAV;

/** PERPOS | FLOW style lockup using the NeoTech display font. */
export function Lockup({
  children,
  tone = "ink",
  className,
}: {
  children: string;
  tone?: "ink" | "muted" | "mint" | "suite" | "light";
  className?: string;
}) {
  const tones = {
    ink: "text-primary",
    muted: "text-foreground-muted",
    mint: "text-secondary-dark",
    suite: "text-accent-dark",
    light: "text-white/70",
  } as const;
  return (
    <p className={cn("font-neo-tech text-xs uppercase tracking-[0.18em]", tones[tone], className)}>
      {children}
    </p>
  );
}

/** Section heading block — eyebrow + title (+ optional description). */
export function SectionHeading({
  eyebrow,
  title,
  description,
  align = "left",
  dark = false,
  tone = "mint",
  className,
}: {
  eyebrow?: string;
  title: string;
  description?: string;
  align?: "left" | "center";
  dark?: boolean;
  tone?: "mint" | "accent";
  className?: string;
}) {
  const eyebrowColor =
    tone === "accent"
      ? dark
        ? "text-accent"
        : "text-accent-dark"
      : dark
        ? "text-secondary"
        : "text-secondary-dark";
  return (
    <div
      className={cn(align === "center" ? "mx-auto max-w-2xl text-center" : "max-w-2xl", className)}
    >
      {eyebrow && <p className={cn("text-sm font-semibold", eyebrowColor)}>{eyebrow}</p>}
      <h2
        className={cn(
          "mt-3 text-balance text-3xl font-semibold tracking-tight sm:text-4xl",
          dark ? "text-white" : "text-foreground",
        )}
      >
        {title}
      </h2>
      {description && (
        <p
          className={cn(
            "mt-4 text-base leading-7",
            dark ? "text-white/65" : "text-foreground-secondary",
          )}
        >
          {description}
        </p>
      )}
    </div>
  );
}

function contextualCta(pathname: string) {
  if (pathname.startsWith("/suite")) return { href: CONTACT_URL, label: "ขอเดโม Suite" };
  if (pathname.startsWith("/flow")) return { href: LINE_URL, label: "เพิ่มเพื่อนใน LINE" };
  return null;
}

/** Floating glassmorphism toggle — mobile only, sits at the bottom of the screen.
 *  Shrinks (collapses inactive labels) when the user scrolls the page up. */
function MobileNav() {
  const pathname = usePathname();
  const [collapsed, setCollapsed] = useState(false);

  useEffect(() => {
    let last = window.scrollY;
    const onScroll = () => {
      const y = window.scrollY;
      if (y < 48)
        setCollapsed(false); // always expanded near the top
      else if (y > last + 6)
        setCollapsed(true); // finger up → shrink
      else if (y < last - 6) setCollapsed(false); // finger down → expand
      last = y;
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  return (
    <nav className="pointer-events-none fixed inset-x-0 bottom-0 z-50 flex h-24 items-center justify-center px-4 md:hidden">
      <div
        className={cn(
          "pointer-events-auto flex items-center gap-1 rounded-full border border-white/50 bg-white/55 shadow-elevated backdrop-blur-xl backdrop-saturate-150 transition-all duration-300 ease-out",
          collapsed ? "p-0.5" : "p-1.5",
        )}
      >
        {MOBILE_NAV.map((item) => {
          const Icon = item.icon;
          const active = item.exact ? pathname === item.href : pathname.startsWith(item.href);
          const showLabel = !collapsed || active;
          return (
            <Link
              key={item.href}
              href={item.href}
              aria-current={active ? "page" : undefined}
              aria-label={item.label}
              className={cn(
                "inline-flex items-center rounded-full transition-all duration-300 ease-out",
                collapsed ? "h-9" : "h-11",
                showLabel ? "px-4" : "px-2.5",
                active
                  ? "bg-primary text-white shadow-sm"
                  : "text-foreground-secondary hover:text-foreground",
              )}
            >
              {item.brand ? (
                <BrandIcon
                  product={item.brand}
                  className={cn(collapsed ? "h-5 w-5" : "h-[18px] w-[18px]")}
                />
              ) : (
                <Icon
                  className={cn(collapsed ? "h-5 w-5" : "h-[18px] w-[18px]")}
                  strokeWidth={1.9}
                />
              )}
              <span
                className={cn(
                  "font-neo-tech translate-y-[1.5px] overflow-hidden whitespace-nowrap text-[13px] leading-none tracking-[0.06em] transition-all duration-300 ease-out",
                  showLabel ? "ms-1.5 max-w-[90px] opacity-100" : "ms-0 max-w-0 opacity-0",
                )}
              >
                {item.label}
              </span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}

export function SiteHeader() {
  const pathname = usePathname();
  const cta = contextualCta(pathname);

  return (
    <>
      <header className="sticky top-0 z-50 border-b border-border bg-white/85 backdrop-blur-xl">
        <div className="mx-auto grid h-16 max-w-7xl grid-cols-[auto_1fr_auto] items-center gap-2 px-4 sm:gap-4 sm:px-6 lg:px-8">
          <Link
            href="/"
            className="font-neo-tech inline-flex translate-y-[3px] items-center text-base leading-none tracking-[0.14em] text-primary sm:text-lg"
          >
            PERPOS
          </Link>

          {/* desktop: toggle lives in the header */}
          <nav className="hidden min-w-0 justify-center md:flex">
            <div className="inline-flex items-center gap-1 rounded-full border border-border bg-background-secondary p-1">
              {NAV.map((item) => {
                const Icon = item.icon;
                const active = item.exact ? pathname === item.href : pathname.startsWith(item.href);
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    className={cn(
                      "inline-flex h-9 items-center gap-1.5 rounded-full px-3.5 text-sm transition sm:px-4",
                      active
                        ? "bg-primary text-white shadow-sm"
                        : "text-foreground-secondary hover:text-foreground",
                    )}
                  >
                    {item.brand ? (
                      <BrandIcon product={item.brand} className="h-4 w-4" />
                    ) : (
                      <Icon className="h-4 w-4" strokeWidth={1.8} />
                    )}
                    <span className="font-neo-tech translate-y-[1.5px] text-[13px] leading-none tracking-[0.06em]">
                      {item.label}
                    </span>
                  </Link>
                );
              })}
            </div>
          </nav>
          <span className="md:hidden" aria-hidden />

          <div className="flex items-center gap-2">
            <Link
              href={APP_URL}
              className="hidden text-sm font-medium text-foreground-secondary transition hover:text-foreground sm:inline"
            >
              เข้าสู่ระบบ
            </Link>
            {cta ? (
              <Button href={cta.href} size="sm" className="hidden sm:inline-flex">
                {cta.label}
              </Button>
            ) : (
              <Button
                href={APP_URL}
                variant="secondary"
                size="sm"
                className="hidden sm:inline-flex"
              >
                เข้าสู่ระบบ
              </Button>
            )}
            <Link
              href={cta?.href ?? APP_URL}
              aria-label={cta?.label ?? "เข้าสู่ระบบ"}
              className="inline-flex h-9 w-9 items-center justify-center text-primary transition hover:text-foreground-secondary sm:hidden"
            >
              <UserRound className="h-[20px] w-[20px]" strokeWidth={1.8} />
            </Link>
          </div>
        </div>
      </header>
      <MobileNav />
    </>
  );
}

export function SiteFooter() {
  return (
    <footer className="border-t border-border bg-primary-dark text-white">
      <div className="mx-auto flex max-w-7xl flex-col gap-6 px-5 py-12 sm:px-6 md:flex-row md:items-end md:justify-between lg:px-8">
        <div>
          <p className="font-neo-tech text-lg tracking-[0.14em]">PERPOS</p>
          <p className="mt-3 max-w-md text-sm leading-6 text-white/60">
            Flow สำหรับงานส่วนตัวบน LINE และ Suite สำหรับระบบองค์กรที่ต้องการ workflow เฉพาะธุรกิจ
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-x-6 gap-y-2 text-sm text-white/70">
          <Link href="/flow" className="font-neo-tech tracking-[0.08em] hover:text-white">
            Flow
          </Link>
          <Link href="/suite" className="font-neo-tech tracking-[0.08em] hover:text-white">
            Suite
          </Link>
          <Link href="/privacy" className="font-neo-tech tracking-[0.08em] hover:text-white">
            Privacy
          </Link>
          <Link href="/terms" className="font-neo-tech tracking-[0.08em] hover:text-white">
            Terms
          </Link>
        </div>
      </div>
      <div className="border-t border-white/10">
        <div className="mx-auto max-w-7xl px-5 pb-28 pt-5 text-xs text-white/45 sm:px-6 md:pb-5 lg:px-8">
          © {new Date().getFullYear()} PERPOS · P2P Solutions Co., Ltd.
        </div>
      </div>
    </footer>
  );
}
