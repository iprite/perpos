"use client";

import Link from "next/link";
import { cn } from "@/lib/utils";

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: "primary" | "secondary" | "ghost" | "white" | "outline-light";
  size?: "sm" | "md" | "lg";
  href?: string;
  children: React.ReactNode;
}

export function Button({
  variant = "primary",
  size = "md",
  href,
  className,
  children,
  ...props
}: ButtonProps) {
  const base =
    "group/btn inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-xl font-medium transition-all duration-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50";

  const variants = {
    primary:
      "bg-primary text-white shadow-sm shadow-primary/25 hover:bg-primary-dark hover:shadow-lg hover:shadow-primary/30 active:scale-[0.98]",
    secondary:
      "border border-border bg-white text-foreground shadow-soft hover:border-primary/40 hover:bg-primary-50/60 active:scale-[0.98]",
    ghost:
      "text-foreground-secondary hover:bg-foreground/5 hover:text-foreground",
    white:
      "bg-white text-primary shadow-md shadow-black/10 hover:bg-primary-50 active:scale-[0.98]",
    "outline-light":
      "border border-white/25 text-white hover:bg-white/10 active:scale-[0.98]",
  };

  const sizes = {
    sm: "px-4 py-2 text-sm",
    md: "px-5 py-2.5 text-sm",
    lg: "px-7 py-3.5 text-base",
  };

  const classes = cn(base, variants[variant], sizes[size], className);

  if (href) {
    const external = href.startsWith("http") || href.startsWith("mailto:");
    return (
      <Link
        href={href}
        className={classes}
        {...(external ? { target: "_blank", rel: "noopener noreferrer" } : {})}
      >
        {children}
      </Link>
    );
  }

  return (
    <button className={classes} {...props}>
      {children}
    </button>
  );
}
