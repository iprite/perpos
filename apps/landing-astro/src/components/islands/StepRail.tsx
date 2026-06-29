import { useEffect, useState } from "react";
import { Check, MousePointerClick, Send, Sparkles, Upload } from "lucide-react";
import { cn } from "@/lib/utils";

const STEPS = [
  { label: "โยนเข้า", icon: Upload },
  { label: "ยืนยัน", icon: MousePointerClick },
  { label: "จัดการ", icon: Sparkles },
  { label: "ส่งไฟล์", icon: Send },
];

/** Connected pipeline that auto-cycles the active step — light, no heavy cards. */
export function StepRail() {
  const [active, setActive] = useState(0);

  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      setActive(STEPS.length - 1);
      return;
    }
    const id = setInterval(() => setActive((a) => (a + 1) % (STEPS.length + 1)), 1200);
    return () => clearInterval(id);
  }, []);

  // active runs 0..length (the extra tick is a short "all done" pause before looping)
  const idx = Math.min(active, STEPS.length - 1);

  return (
    <div className="relative px-2 py-2">
      {/* connector track */}
      <div className="absolute left-[12.5%] right-[12.5%] top-7 h-[3px] -translate-y-1/2 rounded-full bg-border" />
      <div
        className="absolute left-[12.5%] top-7 h-[3px] -translate-y-1/2 rounded-full bg-secondary transition-[width] duration-700 ease-out"
        style={{ width: `${(idx / (STEPS.length - 1)) * 75}%` }}
      />
      <div className="relative grid grid-cols-4">
        {STEPS.map((step, i) => {
          const Icon = step.icon;
          const reached = active >= i;
          const current = idx === i && active < STEPS.length;
          return (
            <div key={step.label} className="flex flex-col items-center gap-2">
              <span
                className={cn(
                  "flex h-10 w-10 items-center justify-center rounded-full border-2 transition-all duration-300",
                  reached
                    ? "border-secondary bg-secondary text-white"
                    : "border-border bg-white text-foreground-muted",
                  current && "scale-110 ring-4 ring-secondary/20",
                )}
              >
                {active > i ? (
                  <Check className="h-4 w-4" strokeWidth={3} />
                ) : (
                  <Icon className="h-[18px] w-[18px]" strokeWidth={1.9} />
                )}
              </span>
              <span
                className={cn(
                  "text-xs font-semibold transition-colors duration-300",
                  reached ? "text-secondary-dark" : "text-foreground-muted",
                )}
              >
                {step.label}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export default StepRail;
