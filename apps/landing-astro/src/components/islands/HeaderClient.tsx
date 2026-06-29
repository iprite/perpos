import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { Building2, Home, MessageCircle, UserRound } from "lucide-react";
import { cn } from "@/lib/utils";
import { APP_URL, LINE_URL } from "@/lib/site";
import { SuiteDemoDialog } from "./SuiteDemo";

const NAV = [
  { href: "/", label: "PERPOS", icon: Home, exact: true, brand: null },
  { href: "/flow", label: "Flow", icon: MessageCircle, exact: false, brand: "flow" as const },
  { href: "/suite", label: "Suite", icon: Building2, exact: false, brand: "suite" as const },
];

const BTN_BASE =
  "group/btn inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-xl font-medium transition-all duration-200 focus:outline-hidden focus-visible:ring-2 focus-visible:ring-primary/40 focus-visible:ring-offset-2";
const BTN_SM = "px-4 py-2 text-sm";
const BTN_PRIMARY =
  "bg-primary text-white shadow-xs shadow-primary/25 hover:bg-primary-dark hover:shadow-lg hover:shadow-primary/30 active:scale-[0.98]";
const BTN_SECONDARY =
  "border border-border bg-white text-foreground shadow-soft hover:border-primary/40 hover:bg-primary-50/60 active:scale-[0.98]";

/** Mono brand glyph recoloured to the product accent (React version for islands). */
function BrandIcon({ product, className }: { product: "flow" | "suite"; className?: string }) {
  const src = product === "flow" ? "/home/flow_icon.png" : "/home/suite_icon.png";
  const fill = product === "flow" ? "bg-secondary" : "bg-accent";
  return (
    <span
      aria-hidden
      className={cn("inline-block h-6 w-6", fill, className)}
      style={{
        WebkitMaskImage: `url(${src})`,
        maskImage: `url(${src})`,
        WebkitMaskSize: "contain",
        maskSize: "contain",
        WebkitMaskRepeat: "no-repeat",
        maskRepeat: "no-repeat",
        WebkitMaskPosition: "center",
        maskPosition: "center",
      }}
    />
  );
}

function contextualCta(pathname: string) {
  if (pathname.startsWith("/suite")) return { href: null, label: "ขอเดโม Suite", demo: true };
  if (pathname.startsWith("/flow"))
    return { href: LINE_URL, label: "เพิ่มเพื่อนใน LINE", demo: false };
  return null;
}

/** Floating glassmorphism toggle — mobile only, sits at the bottom of the screen. */
function MobileNav({ pathname }: { pathname: string }) {
  const [collapsed, setCollapsed] = useState(false);

  useEffect(() => {
    let last = window.scrollY;
    const onScroll = () => {
      const y = window.scrollY;
      if (y < 48) setCollapsed(false);
      else if (y > last + 6) setCollapsed(true);
      else if (y < last - 6) setCollapsed(false);
      last = y;
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  return (
    <nav className="pointer-events-none fixed inset-x-0 bottom-0 z-50 flex h-24 items-center justify-center px-4 md:hidden">
      <div
        className={cn(
          "shadow-elevated pointer-events-auto flex items-center gap-1 rounded-full border border-white/50 bg-white/55 backdrop-blur-xl backdrop-saturate-150 transition-all duration-300 ease-out",
          collapsed ? "p-0.5" : "p-1.5",
        )}
      >
        {NAV.map((item) => {
          const Icon = item.icon;
          const active = item.exact ? pathname === item.href : pathname.startsWith(item.href);
          const showLabel = !collapsed || active;
          return (
            <a
              key={item.href}
              href={item.href}
              aria-current={active ? "page" : undefined}
              aria-label={item.label}
              className={cn(
                "inline-flex items-center rounded-full transition-all duration-300 ease-out",
                collapsed ? "h-9" : "h-11",
                showLabel ? "px-4" : "px-2.5",
                active
                  ? "bg-primary text-white shadow-xs"
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
                  "font-neo-tech translate-y-[1.5px] overflow-hidden text-[13px] leading-none tracking-[0.06em] whitespace-nowrap transition-all duration-300 ease-out",
                  showLabel ? "ms-1.5 max-w-[90px] opacity-100" : "ms-0 max-w-0 opacity-0",
                )}
              >
                {item.label}
              </span>
            </a>
          );
        })}
      </div>
    </nav>
  );
}

/** Header right-side actions + the mobile bottom nav + the demo popup. */
export function HeaderClient({ pathname }: { pathname: string }) {
  const cta = contextualCta(pathname);
  const [demoOpen, setDemoOpen] = useState(false);
  // The header has `backdrop-blur-sm` → it is a containing block for fixed/`position`
  // descendants. Portal the full-screen overlays to <body> so they anchor to the
  // viewport (mobile nav at the bottom, dialog centered) instead of the header.
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  return (
    <>
      <div className="flex items-center gap-2">
        <a href={APP_URL} className={cn(BTN_BASE, BTN_SECONDARY, BTN_SM, "hidden sm:inline-flex")}>
          <UserRound className="h-4 w-4" strokeWidth={1.8} />
          เข้าสู่ระบบ
        </a>
        {cta &&
          (cta.demo ? (
            <button
              type="button"
              onClick={() => setDemoOpen(true)}
              className={cn(BTN_BASE, BTN_PRIMARY, BTN_SM, "hidden sm:inline-flex")}
            >
              {cta.label}
            </button>
          ) : (
            <a
              href={cta.href ?? undefined}
              className={cn(BTN_BASE, BTN_PRIMARY, BTN_SM, "hidden sm:inline-flex")}
            >
              {cta.label}
            </a>
          ))}
        {/* mobile: ไอคอนขวาบน — suite เปิด popup, อื่น ๆ ลิงก์ออก/เข้าสู่ระบบ */}
        {cta?.demo ? (
          <button
            type="button"
            onClick={() => setDemoOpen(true)}
            aria-label={cta.label}
            className="text-primary hover:text-foreground-secondary inline-flex h-9 w-9 items-center justify-center transition sm:hidden"
          >
            <UserRound className="h-[20px] w-[20px]" strokeWidth={1.8} />
          </button>
        ) : (
          <a
            href={cta?.href ?? APP_URL}
            aria-label={cta?.label ?? "เข้าสู่ระบบ"}
            className="text-primary hover:text-foreground-secondary inline-flex h-9 w-9 items-center justify-center transition sm:hidden"
          >
            <UserRound className="h-[20px] w-[20px]" strokeWidth={1.8} />
          </a>
        )}
      </div>

      {mounted &&
        createPortal(
          <>
            <SuiteDemoDialog open={demoOpen} onOpenChange={setDemoOpen} />
            <MobileNav pathname={pathname} />
          </>,
          document.body,
        )}
    </>
  );
}

export default HeaderClient;
