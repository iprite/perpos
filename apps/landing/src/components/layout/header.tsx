"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { Menu, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { navigationItems } from "@/data/landing-content";

export function Header() {
  const [isScrolled, setIsScrolled] = useState(false);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

  useEffect(() => {
    const handleScroll = () => {
      setIsScrolled(window.scrollY > 50);
    };

    window.addEventListener("scroll", handleScroll);
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  return (
    <header
      className={`fixed left-0 right-0 top-0 z-50 transition-all duration-300 ${
        isScrolled
          ? "glass-effect shadow-sm"
          : "bg-transparent"
      }`}
    >
      <nav className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="flex h-16 items-center justify-between md:h-20">
          <Link href="/" className="flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary">
              <span className="text-lg font-bold text-white">P</span>
            </div>
            <span className="text-xl font-heading font-bold text-foreground">
              PERPOS
            </span>
          </Link>

          <div className="hidden items-center gap-8 md:flex">
            {navigationItems.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className="text-foreground-secondary transition-colors hover:text-primary"
              >
                {item.label}
              </Link>
            ))}
          </div>

          <div className="hidden items-center gap-4 md:flex">
            <Button
              variant="ghost"
              href="https://app.perpos.io/signin"
            >
              เข้าสู่ระบบ
            </Button>
            <Button
              href="https://app.perpos.io/signup"
            >
              เริ่มใช้ฟรี
            </Button>
          </div>

          <button
            className="p-2 text-foreground-secondary md:hidden"
            onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
            aria-label="Toggle menu"
          >
            {isMobileMenuOpen ? (
              <X className="h-6 w-6" />
            ) : (
              <Menu className="h-6 w-6" />
            )}
          </button>
        </div>
      </nav>

      {isMobileMenuOpen && (
        <div className="absolute left-0 right-0 top-full bg-white shadow-lg md:hidden">
          <div className="flex flex-col gap-4 p-4">
            {navigationItems.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className="py-2 text-foreground-secondary transition-colors hover:text-primary"
                onClick={() => setIsMobileMenuOpen(false)}
              >
                {item.label}
              </Link>
            ))}
            <hr className="my-2 border-border" />
            <Button
              variant="secondary"
              href="https://app.perpos.io/signin"
              className="w-full"
            >
              เข้าสู่ระบบ
            </Button>
            <Button
              href="https://app.perpos.io/signup"
              className="w-full"
            >
              เริ่มใช้ฟรี
            </Button>
          </div>
        </div>
      )}
    </header>
  );
}
