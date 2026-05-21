import Link from "next/link";
import { cn } from "@/lib/utils";

/** PERPOS brand mark — three rotated rounded bars. */
export function LogoMark({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 61 38"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={cn("h-7 w-auto", className)}
      aria-hidden="true"
    >
      <rect
        x="12.9901"
        y="7"
        width="13.7518"
        height="26.7397"
        rx="6.87592"
        transform="rotate(29.0647 12.9901 7)"
        fill="currentColor"
      />
      <rect
        x="36.9517"
        width="13.7518"
        height="34.3796"
        rx="6.87592"
        transform="rotate(29.0647 36.9517 0)"
        fill="currentColor"
      />
      <rect
        opacity="0.45"
        x="48.9799"
        y="18.4648"
        width="13.7518"
        height="13.7518"
        rx="6.87592"
        transform="rotate(29.0647 48.9799 18.4648)"
        fill="currentColor"
      />
    </svg>
  );
}

interface LogoProps {
  /** "dark" = dark text on light bg, "light" = white text on dark bg */
  tone?: "dark" | "light";
  href?: string;
  className?: string;
}

export function Logo({ tone = "dark", href = "/", className }: LogoProps) {
  const content = (
    <span className={cn("inline-flex items-center gap-2.5", className)}>
      <span className="text-primary">
        <LogoMark className="h-7 w-auto" />
      </span>
      <span
        className={cn(
          "font-heading text-xl font-bold tracking-tight",
          tone === "light" ? "text-white" : "text-foreground"
        )}
      >
        PERPOS
      </span>
    </span>
  );

  if (href) {
    return (
      <Link href={href} aria-label="PERPOS" className="inline-flex">
        {content}
      </Link>
    );
  }
  return content;
}
