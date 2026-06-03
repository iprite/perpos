"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { Menu, X, Globe } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Logo } from "@/components/ui/logo";
import { navigationItems, APP_URL } from "@/data/landing-content";
import { cn } from "@/lib/utils";
import { useLanguage } from "../landing/language-context";
import { translations } from "../landing/locales";

const getNavLabel = (label: string, lang: "th" | "en") => {
  if (lang === "en") {
    switch (label) {
      case "ฟีเจอร์": return "Features";
      case "โมดูล": return "Modules";
      case "LINE Bot": return "LINE Bot";
      case "ราคา": return "Pricing";
      case "FAQ": return "FAQ";
      default: return label;
    }
  }
  return label;
};

export function Header() {
  const [isScrolled, setIsScrolled] = useState(false);
  const [isVisible, setIsVisible] = useState(true);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const { lang, setLang } = useLanguage();
  const t = translations[lang];

  useEffect(() => {
    let lastScrollY = window.scrollY;
    const handleScroll = () => {
      const currentScrollY = window.scrollY;
      setIsScrolled(currentScrollY > 16);

      if (currentScrollY > lastScrollY && currentScrollY > 80) {
        setIsVisible(false);
      } else {
        setIsVisible(true);
      }
      lastScrollY = currentScrollY;
    };
    handleScroll();
    window.addEventListener("scroll", handleScroll, { passive: true });
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  return (
    <header className={cn(
      "fixed inset-x-0 top-0 z-50 transition-transform duration-300",
      isVisible ? "translate-y-0" : "-translate-y-full"
    )}>
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
                  {getNavLabel(item.label, lang)}
                </Link>
              ))}
            </div>

            <div className="hidden items-center gap-2 md:flex">
              <button
                onClick={() => setLang(lang === "th" ? "en" : "th")}
                className="flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-semibold text-slate-650 hover:bg-slate-50 transition-colors shadow-sm cursor-pointer mr-2"
                aria-label="Toggle Language"
              >
                <Globe size={14} className="text-slate-400" />
                <span className="uppercase">{lang === "th" ? "en" : "th"}</span>
              </button>

              <Button variant="ghost" size="sm" href={APP_URL}>
                {t.nav.login}
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
                {getNavLabel(item.label, lang)}
              </Link>
            ))}
            <div className="my-2 h-px bg-border" />
            
            <div className="flex flex-col gap-2">
              <button
                onClick={() => {
                  setLang(lang === "th" ? "en" : "th");
                }}
                className="flex items-center justify-center gap-1.5 rounded-xl border border-slate-200 bg-white py-2.5 text-sm font-bold text-slate-700 shadow-sm hover:bg-slate-50 transition-colors w-full cursor-pointer"
              >
                <Globe size={16} className="text-slate-400" />
                <span className="uppercase">{lang === "th" ? "en" : "th"}</span>
              </button>

              <Button variant="secondary" href={APP_URL} className="w-full">
                {t.nav.login}
              </Button>
            </div>
          </div>
        </div>
      )}
    </header>
  );
}
