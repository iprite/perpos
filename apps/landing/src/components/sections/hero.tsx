import { Container } from "@/components/ui/container";
import { Button } from "@/components/ui/button";
import { heroContent } from "@/data/landing-content";

export function HeroSection() {
  return (
    <section className="relative min-h-screen gradient-hero pt-20 md:pt-0">
      <div className="absolute inset-0 overflow-hidden">
        <div className="absolute -right-20 -top-20 h-96 w-96 rounded-full bg-primary/5 blur-3xl" />
        <div className="absolute -bottom-40 -left-20 h-96 w-96 rounded-full bg-secondary/5 blur-3xl" />
      </div>

      <Container className="relative flex min-h-screen flex-col items-center justify-center py-16 md:py-24">
        <div className="mx-auto max-w-4xl text-center">
          <div className="mb-6 inline-flex items-center gap-2 rounded-full border border-primary/20 bg-primary/5 px-4 py-2 text-sm text-primary">
            <span className="relative flex h-2 w-2">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-primary opacity-75" />
              <span className="relative inline-flex h-2 w-2 rounded-full bg-primary" />
            </span>
            LINE Bot Assistant พร้อมใช้งานแล้ว
          </div>

          <h1 className="mb-6 animate-fade-up text-4xl font-heading font-bold tracking-tight text-foreground md:text-5xl lg:text-6xl">
            {heroContent.headline}
          </h1>

          <p className="mx-auto mb-10 max-w-2xl animate-fade-up animate-stagger-1 text-lg text-foreground-secondary md:text-xl">
            {heroContent.subheadline}
          </p>

          <div className="animate-fade-up animate-stagger-2 flex flex-col items-center justify-center gap-4 sm:flex-row">
            <Button size="lg" href={heroContent.primaryCta.href}>
              {heroContent.primaryCta.label}
            </Button>
            <Button size="lg" variant="secondary" href={heroContent.secondaryCta.href}>
              {heroContent.secondaryCta.label}
            </Button>
          </div>

          <div className="animate-fade-up animate-stagger-3 mt-12 flex items-center justify-center gap-8 text-sm text-foreground-muted">
            <div className="flex items-center gap-2">
              <svg className="h-5 w-5 text-secondary" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
              </svg>
              ทดลองใช้ฟรี 14 วัน
            </div>
            <div className="flex items-center gap-2">
              <svg className="h-5 w-5 text-secondary" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
              </svg>
              ไม่ต้องใส่บัตรเครดิต
            </div>
            <div className="flex items-center gap-2">
              <svg className="h-5 w-5 text-secondary" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
              </svg>
              Cancel ได้ทุกเมื่อ
            </div>
          </div>
        </div>

        <div className="mt-16 w-full max-w-5xl animate-fade-up animate-stagger-4">
          <div className="relative">
            <div className="absolute inset-0 top-8 bg-gradient-to-b from-white via-transparent to-transparent" />
            <div className="rounded-xl border border-border bg-white p-4 shadow-2xl">
              <div className="flex items-center gap-2 border-b border-border pb-4">
                <div className="flex gap-1.5">
                  <div className="h-3 w-3 rounded-full bg-red-400" />
                  <div className="h-3 w-3 rounded-full bg-yellow-400" />
                  <div className="h-3 w-3 rounded-full bg-green-400" />
                </div>
                <span className="ml-4 text-sm text-foreground-muted">
                  app.perpos.io
                </span>
              </div>
              <div className="aspect-video rounded-lg bg-gradient-to-br from-background-secondary to-background p-8">
                <div className="flex h-full items-center justify-center">
                  <div className="grid w-full max-w-md grid-cols-3 gap-4">
                    {[
                      { label: "บัญชี", value: "12" },
                      { label: "รายได้เดือนนี้", value: "฿125,000" },
                      { label: "งานรอ", value: "8" },
                    ].map((stat) => (
                      <div key={stat.label} className="rounded-lg bg-white p-4 text-center shadow-sm">
                        <div className="text-2xl font-bold text-primary">{stat.value}</div>
                        <div className="text-xs text-foreground-muted">{stat.label}</div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </Container>

      <div className="absolute bottom-8 left-1/2 -translate-x-1/2 animate-bounce">
        <svg className="h-6 w-6 text-foreground-muted" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 14l-7 7m0 0l-7-7m7 7V3" />
        </svg>
      </div>
    </section>
  );
}
