import { useEffect, useState } from "react";
import { Bot, LayoutDashboard, Workflow } from "lucide-react";
import { cn } from "@/lib/utils";

const MODULES = ["บัญชี", "HR", "Approval", "Reporting"];

/** Suite hero visual — highlight cycles through the workspace modules for life. */
export function SuiteVisual() {
  const [active, setActive] = useState(0);

  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const id = setInterval(() => setActive((a) => (a + 1) % MODULES.length), 1400);
    return () => clearInterval(id);
  }, []);

  return (
    <div className="shadow-elevated rounded-2xl border border-white/10 bg-white/4 p-5">
      <div className="grid gap-3">
        <div className="text-primary rounded-xl bg-white p-4">
          <div className="flex items-center justify-between">
            <p className="text-sm font-semibold">Organization Workspace</p>
            <LayoutDashboard className="text-accent h-5 w-5" />
          </div>
          <div className="mt-4 grid gap-2.5 sm:grid-cols-2">
            {MODULES.map((item, i) => (
              <div
                key={item}
                className={cn(
                  "flex items-center justify-between rounded-lg px-3 py-2.5 text-sm font-medium transition-all duration-300",
                  i === active
                    ? "bg-accent/12 text-accent-dark ring-accent/30 ring-1 ring-inset"
                    : "bg-background-secondary text-foreground",
                )}
              >
                {item}
                <span
                  className={cn(
                    "bg-accent h-1.5 w-1.5 rounded-full transition-opacity duration-300",
                    i === active ? "opacity-100" : "opacity-0",
                  )}
                />
              </div>
            ))}
          </div>
        </div>
        <div className="grid gap-3 sm:grid-cols-[1fr_0.8fr]">
          <div className="border-accent/25 bg-accent/8 rounded-xl border p-4">
            <Workflow className="text-accent h-5 w-5" />
            <p className="mt-3 text-sm font-semibold">Tailor-made workflow</p>
            <p className="mt-1.5 text-sm text-white/55">
              เชื่อมเอกสาร ทีม และ approval เฉพาะองค์กร
            </p>
          </div>
          <div className="rounded-xl border border-white/10 bg-white/6 p-4">
            <div className="flex items-center justify-between">
              <span className="bg-accent/15 text-accent flex h-8 w-8 items-center justify-center rounded-lg">
                <Bot className="h-4 w-4" strokeWidth={1.9} />
              </span>
              <span className="text-accent inline-flex items-center gap-1 text-[10px] font-bold tracking-wide">
                <span className="relative flex h-1.5 w-1.5">
                  <span className="bg-accent absolute inline-flex h-full w-full animate-ping rounded-full opacity-75" />
                  <span className="bg-accent relative inline-flex h-1.5 w-1.5 rounded-full" />
                </span>
                LIVE
              </span>
            </div>
            <p className="mt-3 text-sm font-semibold">AI Agent</p>
            <p className="mt-1.5 text-sm text-white/55">ทำงานแทนคุณ ลดงานซ้ำในระบบ</p>
          </div>
        </div>
      </div>
    </div>
  );
}

export default SuiteVisual;
