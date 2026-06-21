"use client";

import cn from "@core/utils/class-names";
import { withBasePath } from "@/utils/base-path";

/**
 * Brand glyph (Flow/Suite) — PNG mask recoloured ตามสีแบรนด์ของแต่ละผลิตภัณฑ์
 * - flow  = MINT (green)     · /brand/flow_icon.png
 * - suite = BITTERSWEET (orange) · /brand/suite_icon.png
 *
 * `fill` = tailwind bg-* class ที่ใช้ลงสีให้ glyph (default = สีแบรนด์ของผลิตภัณฑ์)
 * เมื่อวางบนพื้นสีแบรนด์ (pill active) ให้ส่ง fill="bg-white"
 */
export function BrandIcon({
  product,
  className,
  fill,
}: {
  product: "flow" | "suite";
  className?: string;
  fill?: string;
}) {
  const src = withBasePath(product === "flow" ? "/brand/flow_icon.png" : "/brand/suite_icon.png");
  const fillClass = fill ?? (product === "flow" ? "bg-green-500" : "bg-orange-500");
  return (
    <span
      aria-hidden
      className={cn("inline-block shrink-0", fillClass, className)}
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
