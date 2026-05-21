import Link from "next/link";
import { cn } from "@/lib/utils";

/** PERPOS icon mark — uses logo-short.svg */
export function LogoMark({ className }: { className?: string }) {
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src="/logo-short.svg"
      alt="PERPOS"
      className={cn("h-8 w-8 object-contain", className)}
    />
  );
}

interface LogoProps {
  /** "dark" = logo on light bg, "light" = logo on dark bg */
  tone?: "dark" | "light";
  href?: string;
  className?: string;
}

export function Logo({ tone = "dark", href = "/", className }: LogoProps) {
  const content = (
    <span className={cn("inline-flex items-center", className)}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src="/logo.svg"
        alt="PERPOS"
        className={cn(
          "h-8 w-auto object-contain",
          tone === "light" && "brightness-0 invert"
        )}
      />
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
