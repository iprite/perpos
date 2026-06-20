"use client";

import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";

/** Types a short word out letter-by-letter when it scrolls into view. */
export function TypeWord({
  text,
  className,
  startDelay = 0,
  speed = 110,
}: {
  text: string;
  className?: string;
  startDelay?: number;
  speed?: number;
}) {
  const [n, setN] = useState(0);
  const [started, setStarted] = useState(false);
  const ref = useRef<HTMLSpanElement>(null);

  // begin typing the first time the word is in view (respects reduced motion)
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      setN(text.length);
      return;
    }
    const io = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting) {
          setStarted(true);
          io.disconnect();
        }
      },
      { threshold: 0.6 },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [text.length]);

  useEffect(() => {
    if (!started || n >= text.length) return;
    const t = setTimeout(() => setN((v) => v + 1), n === 0 ? startDelay + speed : speed);
    return () => clearTimeout(t);
  }, [started, n, text.length, speed, startDelay]);

  const typing = started && n < text.length;

  return (
    <span
      ref={ref}
      aria-label={text}
      className={cn("relative inline-block whitespace-pre", className)}
    >
      {/* invisible spacer reserves the final width so the line never reflows */}
      <span aria-hidden className="invisible">
        {text}
      </span>
      <span aria-hidden className="absolute inset-0">
        {text.slice(0, n)}
        {typing && (
          <span className="ml-[2px] inline-block h-[0.9em] w-[3px] translate-y-[1px] animate-pulse rounded-full bg-current align-middle" />
        )}
      </span>
    </span>
  );
}
