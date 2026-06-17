import * as React from "react";

import cn from "@core/utils/class-names";

/**
 * Avatar — รูปโปรไฟล์ + fallback อักษรย่อ (แทน rizzui Avatar)
 * default = สี่เหลี่ยมมุมมน 40px พื้นเทา — override ขนาด/รูปทรงด้วย className
 */

function initials(name?: string): string {
  const n = (name ?? "").trim();
  if (!n) return "?";
  const parts = n.split(/\s+/);
  return (parts[0]!.charAt(0) + (parts[1]?.charAt(0) ?? "")).toUpperCase();
}

type AvatarProps = {
  src?: string | null;
  name?: string;
  className?: string;
};

export function Avatar({ src, name, className }: AvatarProps) {
  return (
    <span
      className={cn(
        "inline-flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-gray-100 text-sm font-semibold text-gray-700",
        className,
      )}
    >
      {src ? (
        <img src={src} alt={name ?? ""} className="h-full w-full object-cover" />
      ) : (
        initials(name)
      )}
    </span>
  );
}
