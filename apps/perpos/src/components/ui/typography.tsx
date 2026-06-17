import * as React from "react";

import cn from "@core/utils/class-names";

/**
 * Typography — Title / Text มาตรฐาน (แทน rizzui/typography)
 * ดีไซน์อิง DESIGN.md §3 · ค่า default กลาง ๆ แล้ว override ด้วย className ได้
 */

type TitleProps = React.HTMLAttributes<HTMLHeadingElement> & {
  as?: "h1" | "h2" | "h3" | "h4" | "h5" | "h6";
};

export function Title({ as = "h2", className, ...props }: TitleProps) {
  const Tag = as as React.ElementType;
  return <Tag className={cn("font-semibold text-primary", className)} {...props} />;
}

type TextProps = React.HTMLAttributes<HTMLElement> & {
  as?: "p" | "span" | "div";
};

export function Text({ as = "p", className, ...props }: TextProps) {
  const Tag = as as React.ElementType;
  return <Tag className={cn("text-sm text-gray-600", className)} {...props} />;
}
