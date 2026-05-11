"use client";

import { useEffect, useState } from "react";
import cn from "@core/utils/class-names";

export default function StickyFooter({
  className,
  children,
  offset = 2,
}: React.PropsWithChildren<{ className?: string; offset?: number }>) {
  const [atBottom, setAtBottom] = useState(false);

  useEffect(() => {
    const check = () => {
      const distanceFromBottom =
        document.documentElement.scrollHeight -
        window.scrollY -
        window.innerHeight;
      setAtBottom(distanceFromBottom <= offset);
    };
    check();
    window.addEventListener("scroll", check, { passive: true });
    window.addEventListener("resize", check, { passive: true });
    return () => {
      window.removeEventListener("scroll", check);
      window.removeEventListener("resize", check);
    };
  }, [offset]);

  return (
    <footer
      className={cn(
        "sticky bottom-0 bg-gray-0/80 backdrop-blur-xl transition-shadow",
        atBottom ? "" : "card-shadow",
        className
      )}
    >
      {children}
    </footer>
  );
}
