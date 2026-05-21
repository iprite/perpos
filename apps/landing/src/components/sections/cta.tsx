import { ArrowRight, Check } from "lucide-react";
import { Container } from "@/components/ui/container";
import { Button } from "@/components/ui/button";
import { heroContent, APP_URL } from "@/data/landing-content";

export function CtaSection() {
  return (
    <section className="section-padding pt-0">
      <Container>
        <div className="relative overflow-hidden rounded-[2rem] bg-ink px-6 py-16 text-center md:px-16 md:py-20">
          {/* background */}
          <div className="pointer-events-none absolute inset-0">
            <div className="absolute inset-0 bg-grid-dark opacity-50" />
            <div className="absolute -left-10 -top-10 h-72 w-72 rounded-full bg-primary/35 blur-[110px]" />
            <div className="absolute -bottom-16 -right-10 h-72 w-72 rounded-full bg-cyan-400/25 blur-[110px]" />
          </div>

          <div className="relative mx-auto max-w-2xl">
            <h2 className="text-balance text-3xl font-bold text-white md:text-4xl lg:text-[2.75rem]">
              พร้อมยกระดับการจัดการธุรกิจของคุณแล้วหรือยัง?
            </h2>
            <p className="mx-auto mt-4 max-w-xl text-pretty text-slate-300">
              เข้าสู่ระบบด้วยบัญชี Google แล้วเริ่มใช้งาน PERPOS
              ได้ทันที — ไม่มีค่าใช้จ่ายเริ่มต้น
            </p>

            <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
              <Button size="lg" variant="white" href={APP_URL}>
                เริ่มใช้งานฟรี
                <ArrowRight className="h-4 w-4 transition-transform duration-200 group-hover/btn:translate-x-0.5" />
              </Button>
              <Button size="lg" variant="outline-light" href="mailto:contact@perpos.io">
                ติดต่อทีมงาน
              </Button>
            </div>

            <div className="mt-7 flex flex-wrap items-center justify-center gap-x-6 gap-y-2 text-sm text-slate-400">
              {heroContent.highlights.map((item) => (
                <div key={item} className="flex items-center gap-1.5">
                  <Check className="h-4 w-4 text-secondary" strokeWidth={3} />
                  {item}
                </div>
              ))}
            </div>
          </div>
        </div>
      </Container>
    </section>
  );
}
