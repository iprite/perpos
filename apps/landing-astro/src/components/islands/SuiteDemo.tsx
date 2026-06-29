import { useState } from "react";
import { ArrowRight, CalendarCheck, Check, X } from "lucide-react";
import { API_BASE } from "@/lib/site";

/** Controlled "ขอเดโม Suite" popup — กรอกชื่อ/เบอร์ → POST เข้า API เก็บ lead. */
export function SuiteDemoDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [website, setWebsite] = useState(""); // honeypot — ผู้ใช้จริงไม่เห็น/ไม่กรอก
  const [sent, setSent] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  function close() {
    onOpenChange(false);
    window.setTimeout(() => {
      setSent(false);
      setName("");
      setPhone("");
      setWebsite("");
      setError("");
    }, 200);
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (submitting) return;
    setError("");
    setSubmitting(true);
    try {
      const res = await fetch(`${API_BASE}/api/public/demo-request`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          name,
          phone,
          product: "suite",
          source: "landing/suite",
          company_website: website,
        }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok || !data?.ok) throw new Error(data?.error ?? "failed");
      setSent(true);
    } catch {
      setError("ส่งไม่สำเร็จ กรุณาลองใหม่อีกครั้ง หรือทักผ่าน LINE @perpos");
    } finally {
      setSubmitting(false);
    }
  }

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-60 flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
    >
      <div className="bg-ink/60 absolute inset-0 backdrop-blur-xs" onClick={close} aria-hidden />
      <div className="border-border text-foreground shadow-elevated relative w-full max-w-md rounded-2xl border bg-white p-6 text-left sm:p-7">
        <button
          type="button"
          onClick={close}
          aria-label="ปิด"
          className="text-foreground-muted hover:text-foreground absolute top-4 right-4 transition"
        >
          <X className="h-5 w-5" />
        </button>

        {sent ? (
          <div className="py-3 text-center">
            <div className="bg-accent/12 text-accent-dark mx-auto flex h-12 w-12 items-center justify-center rounded-full">
              <Check className="h-6 w-6" strokeWidth={2.4} />
            </div>
            <h3 className="mt-4 text-xl font-semibold">ส่งข้อมูลแล้ว</h3>
            <p className="text-foreground-secondary mt-2 text-sm leading-7">
              ทีมงาน PERPOS จะติดต่อกลับโดยเร็ว ขอบคุณครับ
            </p>
            <button
              type="button"
              onClick={close}
              className="bg-primary hover:bg-primary-dark mt-6 w-full rounded-xl px-5 py-3 text-sm font-semibold text-white transition active:scale-[0.98]"
            >
              ปิด
            </button>
          </div>
        ) : (
          <form onSubmit={submit}>
            <p className="font-neo-tech text-accent-dark text-xs tracking-[0.18em] uppercase">
              PERPOS | SUITE
            </p>
            <h3 className="mt-2 text-xl font-semibold tracking-tight">ขอเดโม Suite</h3>
            <p className="text-foreground-secondary mt-1.5 text-sm leading-7">
              กรอกชื่อและเบอร์โทร ทีมงานจะติดต่อกลับเพื่อนัดเดโม
            </p>

            <div className="mt-5 space-y-4">
              <div>
                <label htmlFor="demo-name" className="text-sm font-medium">
                  ชื่อ
                </label>
                <input
                  id="demo-name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  required
                  placeholder="ชื่อ-นามสกุล"
                  className="border-border bg-background-secondary focus:border-accent mt-1.5 w-full rounded-xl border px-3.5 py-2.5 text-sm outline-hidden transition focus:bg-white"
                />
              </div>
              <div>
                <label htmlFor="demo-phone" className="text-sm font-medium">
                  เบอร์โทร
                </label>
                <input
                  id="demo-phone"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  required
                  type="tel"
                  inputMode="tel"
                  placeholder="08x-xxx-xxxx"
                  className="border-border bg-background-secondary focus:border-accent mt-1.5 w-full rounded-xl border px-3.5 py-2.5 text-sm outline-hidden transition focus:bg-white"
                />
              </div>
            </div>

            {/* honeypot — ซ่อนจากผู้ใช้จริง, ดักบอท */}
            <input
              type="text"
              name="company_website"
              tabIndex={-1}
              autoComplete="off"
              value={website}
              onChange={(e) => setWebsite(e.target.value)}
              aria-hidden
              className="absolute left-[-9999px] h-0 w-0 opacity-0"
            />

            {error && <p className="mt-4 text-sm text-red-600">{error}</p>}

            <button
              type="submit"
              disabled={submitting}
              className="bg-accent hover:bg-accent-dark mt-6 inline-flex w-full items-center justify-center gap-2 rounded-xl px-5 py-3 text-sm font-semibold text-white transition active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-60"
            >
              {submitting ? "กำลังส่ง…" : "ส่งข้อมูลให้ติดต่อกลับ"}
              {!submitting && <ArrowRight className="h-4 w-4" />}
            </button>
            <p className="text-foreground-muted mt-3 text-center text-xs">
              ข้อมูลจะถูกส่งให้ทีมงาน PERPOS เพื่อติดต่อกลับ
            </p>
          </form>
        )}
      </div>
    </div>
  );
}

/** "ขอเดโม Suite" button + popup (self-contained) — ใช้ใน hero/ท้ายหน้า.
 *  - default look: white pill with calendar icon.
 *  - pass `className` for a custom trigger (label + arrow), e.g. the home final CTA. */
export function SuiteDemoButton({
  className,
  label = "ขอเดโม Suite",
}: {
  className?: string;
  label?: string;
}) {
  const [open, setOpen] = useState(false);

  return (
    <>
      {className ? (
        <button type="button" onClick={() => setOpen(true)} className={className}>
          {label}
          <ArrowRight className="h-4 w-4 transition group-hover:translate-x-0.5" />
        </button>
      ) : (
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="group/cta text-primary inline-flex items-center justify-center gap-2.5 rounded-2xl bg-white px-7 py-4 text-base font-semibold shadow-lg shadow-black/25 transition-all duration-200 hover:-translate-y-0.5 hover:shadow-xl active:translate-y-0 active:scale-[0.98]"
        >
          <span className="bg-accent flex h-6 w-6 items-center justify-center rounded-lg text-white shadow-xs">
            <CalendarCheck className="h-4 w-4" strokeWidth={2.2} />
          </span>
          {label}
          <ArrowRight className="h-4 w-4 transition-transform group-hover/cta:translate-x-0.5" />
        </button>
      )}

      <SuiteDemoDialog open={open} onOpenChange={setOpen} />
    </>
  );
}

export default SuiteDemoButton;
