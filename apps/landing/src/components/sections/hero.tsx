import { ArrowRight, Check, Sparkles } from "lucide-react";
import { Container } from "@/components/ui/container";
import { Button } from "@/components/ui/button";
import { heroContent } from "@/data/landing-content";
import { DashboardMockup } from "@/components/sections/dashboard-mockup";

export function HeroSection() {
  return (
    <section className="relative overflow-hidden bg-background pt-28 md:pt-36">
      {/* Background layers */}
      <div className="pointer-events-none absolute inset-0 -z-10">
        <div className="absolute inset-0 bg-gradient-to-b from-primary-50/70 via-white to-white" />
        <div className="absolute inset-x-0 top-0 h-[640px] bg-grid mask-fade" />
        <div className="absolute -left-32 top-10 h-[420px] w-[420px] rounded-full bg-primary/15 blur-[120px]" />
        <div className="absolute -right-24 top-32 h-[380px] w-[380px] rounded-full bg-cyan-400/15 blur-[120px]" />
      </div>

      <Container className="relative">
        <div className="mx-auto max-w-3xl text-center">
          {/* Announcement pill */}
          <div className="animate-fade-up inline-flex items-center gap-2 rounded-full border border-primary/15 bg-white/80 px-4 py-1.5 text-sm font-medium text-primary shadow-soft backdrop-blur">
            <Sparkles className="h-4 w-4" />
            {heroContent.badge}
          </div>

          {/* Headline */}
          <h1 className="animate-fade-up animate-stagger-1 mt-6 text-balance text-4xl font-bold leading-[1.12] text-foreground sm:text-5xl lg:text-6xl">
            {heroContent.headline.lead}
            <br className="hidden sm:block" />{" "}
            <span className="gradient-text">{heroContent.headline.accent}</span>
          </h1>

          {/* Subheadline */}
          <p className="animate-fade-up animate-stagger-2 mx-auto mt-6 max-w-2xl text-pretty text-base leading-relaxed text-foreground-secondary md:text-lg">
            {heroContent.subheadline}
          </p>

          {/* CTAs */}
          <div className="animate-fade-up animate-stagger-3 mt-9 flex flex-col items-center justify-center gap-3 sm:flex-row">
            <Button size="lg" href={heroContent.primaryCta.href}>
              {heroContent.primaryCta.label}
              <ArrowRight className="h-4 w-4 transition-transform duration-200 group-hover/btn:translate-x-0.5" />
            </Button>
            <Button size="lg" variant="secondary" href={heroContent.secondaryCta.href}>
              {heroContent.secondaryCta.label}
            </Button>
          </div>

          {/* Highlights */}
          <div className="animate-fade-up animate-stagger-4 mt-8 flex flex-wrap items-center justify-center gap-x-6 gap-y-2 text-sm text-foreground-secondary">
            {heroContent.highlights.map((item) => (
              <div key={item} className="flex items-center gap-1.5">
                <span className="flex h-4 w-4 items-center justify-center rounded-full bg-secondary/15 text-secondary">
                  <Check className="h-3 w-3" strokeWidth={3} />
                </span>
                {item}
              </div>
            ))}
          </div>
        </div>

        {/* Product mockup */}
        <div className="animate-fade-up animate-stagger-5 relative mx-auto mt-16 max-w-6xl pb-24 md:mt-20">
          <div className="absolute -inset-x-8 -top-6 bottom-16 -z-10 rounded-[2.5rem] bg-gradient-to-tr from-primary/20 via-cyan-300/15 to-transparent blur-2xl" />
          <DashboardMockup />
        </div>
      </Container>
    </section>
  );
}
