import { useEffect, useRef, useState } from "react";
import { Check, FileAudio, FileText } from "lucide-react";
import { cn } from "@/lib/utils";

type Scenario = {
  key: "stt" | "pdf";
  tab: string;
  icon: typeof FileAudio;
  file: { name: string; meta: string };
  ask: string;
  processing: string;
  result: { title: string; chips: string[]; cost: string };
};

const SCENARIOS: Scenario[] = [
  {
    key: "stt",
    tab: "เสียงประชุม",
    icon: FileAudio,
    file: { name: "meeting-audio.m4a", meta: "38 นาที · 82 MB" },
    ask: "ถอดเสียงและสรุปประชุมใช่ไหม?",
    processing: "กำลังสรุปประชุม…",
    result: {
      title: "สรุปประชุมพร้อมแล้ว",
      chips: ["Transcript", "MoM PDF"],
      cost: "−3,800 token",
    },
  },
  {
    key: "pdf",
    tab: "บีบ PDF",
    icon: FileText,
    file: { name: "quarter-report.pdf", meta: "24 หน้า · 48 MB" },
    ask: "บีบไฟล์นี้ให้เล็กลงใช่ไหม?",
    processing: "กำลังบีบไฟล์…",
    result: {
      title: "document-min.pdf",
      chips: ["เล็กลง 62%", "18 MB"],
      cost: "−2,400 token",
    },
  },
];

// step 0: file · 1: ask · 2: confirmed + processing · 3: result · 4: hold
const TIMINGS = [1100, 1300, 1800, 2400];

function usePrefersReducedMotion() {
  const [reduced, setReduced] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    setReduced(mq.matches);
    const on = () => setReduced(mq.matches);
    mq.addEventListener("change", on);
    return () => mq.removeEventListener("change", on);
  }, []);
  return reduced;
}

export function FlowChat({ compact = false }: { compact?: boolean }) {
  const [tab, setTab] = useState(0);
  const [step, setStep] = useState(0);
  const reduced = usePrefersReducedMotion();
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const s = SCENARIOS[tab];

  useEffect(() => {
    if (reduced) {
      setStep(3);
      return;
    }
    setStep(0);
  }, [tab, reduced]);

  useEffect(() => {
    if (reduced) return;
    if (timer.current) clearTimeout(timer.current);
    const next = step >= 4 ? 0 : step + 1;
    const delay = step >= 4 ? 600 : (TIMINGS[step] ?? 2200);
    timer.current = setTimeout(() => setStep(next), delay);
    return () => {
      if (timer.current) clearTimeout(timer.current);
    };
  }, [step, reduced]);

  const confirmed = step >= 2;
  const processing = step === 2;
  const done = step >= 3;
  const Icon = s.icon;

  return (
    <div className="border-border shadow-elevated relative overflow-hidden rounded-2xl border bg-white p-4 sm:p-5">
      {/* header */}
      <div className="mb-4 flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <span className="flex h-8 w-8 items-center justify-center rounded-full bg-[#06C755] text-white">
            <Icon className="h-4 w-4" strokeWidth={1.9} />
          </span>
          <div>
            <p className="text-foreground-muted text-[11px] font-medium">LINE OA</p>
            <p className="font-neo-tech text-foreground text-sm tracking-[0.08em]">PERPOS Flow</p>
          </div>
        </div>
        <div className="border-border bg-background-secondary inline-flex rounded-full border p-0.5">
          {SCENARIOS.map((sc, i) => (
            <button
              key={sc.key}
              type="button"
              onClick={() => setTab(i)}
              className={cn(
                "rounded-full px-3 py-1 text-[11px] font-semibold transition",
                i === tab
                  ? "text-primary bg-white shadow-xs"
                  : "text-foreground-muted hover:text-foreground",
              )}
            >
              {sc.tab}
            </button>
          ))}
        </div>
      </div>

      {/* conversation — bubbles mount/unmount so the result rises into freed space */}
      <div className={cn("flex flex-col gap-2.5", compact ? "min-h-[260px]" : "min-h-[280px]")}>
        {/* user: dropped file */}
        {step >= 0 && (
          <div className="animate-fade-up flex justify-end">
            <div className="w-[82%] rounded-2xl rounded-tr-sm bg-[#06C755] px-4 py-3 text-sm font-medium text-white shadow-xs">
              {s.file.name}
              <span className="mt-0.5 block text-xs text-white/80">{s.file.meta}</span>
            </div>
          </div>
        )}

        {/* bot: confirm ask */}
        {step >= 1 && (
          <div className="animate-fade-up bg-background-secondary text-foreground w-[86%] rounded-2xl rounded-tl-sm px-4 py-3 text-sm">
            {s.ask}
            <span
              className={cn(
                "mt-2 ml-2 inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-semibold ring-1 transition",
                confirmed
                  ? "bg-secondary/15 text-secondary-dark ring-secondary/30"
                  : "text-primary ring-border bg-white",
              )}
            >
              {confirmed && <Check className="h-3 w-3" strokeWidth={2.4} />}
              {confirmed ? "ยืนยันแล้ว" : "ยืนยัน"}
            </span>
          </div>
        )}

        {/* bot: processing (transient — unmounts when done) */}
        {processing && (
          <div className="animate-fade-up bg-primary w-[76%] rounded-2xl rounded-tl-sm px-4 py-3 text-sm text-white">
            {s.processing}
            <span className="mt-2 block h-1.5 overflow-hidden rounded-full bg-white/20">
              <span className="bar-grow bg-secondary block h-full rounded-full" />
            </span>
          </div>
        )}

        {/* bot: result */}
        {done && (
          <div className="animate-fade-up bg-background-secondary text-foreground w-[88%] rounded-2xl rounded-tl-sm px-4 py-3 text-sm">
            <span className="flex items-center gap-1.5 font-medium">
              <Check className="text-secondary-dark h-4 w-4" strokeWidth={2.2} />
              {s.result.title}
            </span>
            <span className="mt-2 flex flex-wrap gap-2">
              {s.result.chips.map((chip) => (
                <span
                  key={chip}
                  className="text-primary ring-border rounded-full bg-white px-3 py-1 text-xs font-semibold ring-1"
                >
                  {chip}
                </span>
              ))}
              <span className="bg-secondary/12 text-secondary-dark ring-secondary/25 rounded-full px-3 py-1 text-xs font-semibold tabular-nums ring-1">
                {s.result.cost}
              </span>
            </span>
          </div>
        )}
      </div>

      {/* signature step rail — connected pipeline */}
      <div className="relative mt-5">
        {/* track that links the four nodes */}
        <div className="bg-border absolute top-3 right-[12.5%] left-[12.5%] h-[3px] -translate-y-1/2 rounded-full" />
        <div
          className="bg-secondary absolute top-3 left-[12.5%] h-[3px] -translate-y-1/2 rounded-full transition-[width] duration-500 ease-out"
          style={{ width: `${(Math.min(step, 3) / 3) * 75}%` }}
        />
        <div className="relative grid grid-cols-4">
          {["โยนเข้า", "ยืนยัน", "จัดการ", "ส่งไฟล์"].map((label, i) => {
            const reached = step >= i;
            const current = Math.min(step, 3) === i;
            return (
              <div key={label} className="flex flex-col items-center gap-1.5">
                <span
                  className={cn(
                    "flex h-6 w-6 items-center justify-center rounded-full border-2 text-[10px] font-bold transition-all duration-300",
                    reached
                      ? "border-secondary bg-secondary text-white"
                      : "border-border text-foreground-muted bg-white",
                    current && "ring-secondary/20 scale-110 ring-4",
                  )}
                >
                  {step > i ? <Check className="h-3 w-3" strokeWidth={3} /> : i + 1}
                </span>
                <span
                  className={cn(
                    "text-[11px] font-semibold transition-colors duration-300",
                    reached ? "text-secondary-dark" : "text-foreground-muted",
                  )}
                >
                  {label}
                </span>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

export default FlowChat;
