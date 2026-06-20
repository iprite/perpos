import { cn } from "@/lib/utils";

const BRAND = {
  flow: { src: "/home/flow_icon.png", fill: "bg-secondary" },
  suite: { src: "/home/suite_icon.png", fill: "bg-accent" },
} as const;

/** Mono brand glyph recoloured to the product's accent (mint = Flow, bittersweet = Suite).
 *  Renders just the icon — wrap it in your own chip. Pass size via `className`. */
export function BrandIcon({
  product,
  className,
}: {
  product: "flow" | "suite";
  className?: string;
}) {
  const b = BRAND[product];
  return (
    <span
      aria-hidden
      className={cn("inline-block h-6 w-6", b.fill, className)}
      style={{
        WebkitMaskImage: `url(${b.src})`,
        maskImage: `url(${b.src})`,
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
