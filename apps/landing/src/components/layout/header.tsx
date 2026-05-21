"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { Menu, X, ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Logo } from "@/components/ui/logo";
import { navigationItems, APP_URL } from "@/data/landing-content";
import { cn } from "@/lib/utils";

export function Header() {
  const [isScrolled, setIsScrolled] = useState(false);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

  useEffect(() => {
    const handleScroll = () => setIsScrolled(window.scrollY > 16);
    handleScroll();
    window.addEventListener("scroll", handleScroll, { passive: true });
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  return (
    <header className="fixed inset-x-0 top-0 z-50">
      <div
        className={cn(
          "transition-all duration-300",
          isScrolled
            ? "glass border-b border-border/70 shadow-soft"
            : "border-b border-transparent bg-transparent"
        )}
      >
        <nav className="mx-auto max-w-7xl px-5 sm:px-6 lg:px-8">
          <div className="flex h-16 items-center justify-between md:h-[72px]">
            <Logo />

            <div className="hidden items-center gap-1 lg:flex">
              {navigationItems.map((item) => (
                <Link
                  key={item.href}
                  href={item.href}
                  className="rounded-lg px-3.5 py-2 text-sm font-medium text-foreground-secondary transition-colors hover:bg-foreground/5 hover:text-foreground"
                >
                  {item.label}
                </Link>
              ))}
            </div>

            <div className="hidden items-center gap-2 md:flex">
              <Button variant="ghost" size="sm" href={APP_URL}>
                เข้าสู่ระบบ
              </Button>
              <Button size="sm" href={APP_URL}>
                เริ่มใช้ฟรี
                <ArrowRight className="h-4 w-4 transition-transform duration-200 group-hover/btn:translate-x-0.5" />
              </Button>
            </div>

            <button
              className="-mr-1.5 rounded-lg p-2 text-foreground-secondary transition-colors hover:bg-foreground/5 md:hidden"
              onClick={() => setIsMobileMenuOpen((v) => !v)}
              aria-label="เมนู"
            >
              {isMobileMenuOpen ? (
                <X className="h-6 w-6" />
              ) : (
                <Menu className="h-6 w-6" />
              )}
            </button>
          </div>
        </nav>
      </div>

      {/* Mobile menu */}
      {isMobileMenuOpen && (
        <div className="glass absolute inset-x-0 top-full animate-fade-in border-b border-border shadow-card md:hidden">
          <div className="flex flex-col gap-1 p-4">
            {navigationItems.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className="rounded-lg px-3 py-2.5 text-sm font-medium text-foreground-secondary transition-colors hover:bg-foreground/5 hover:text-foreground"
                onClick={() => setIsMobileMenuOpen(false)}
              >
                {item.label}
              </Link>
            ))}
            <div className="my-2 h-px bg-border" />
            <Button variant="secondary" href={APP_URL} className="w-full">
              เข้าสู่ระบบ
            </Button>
            <Button href={APP_URL} className="w-full">
              เริ่มใช้ฟรี
            </Button>
          </div>
        </div>
      )}
    </header>
  );
}
