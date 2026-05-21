import { Check, Star } from "lucide-react";
import { Container } from "@/components/ui/container";
import { SectionHeading } from "@/components/ui/section-heading";
import { Button } from "@/components/ui/button";
import { pricingContent, APP_URL } from "@/data/landing-content";
import { cn } from "@/lib/utils";

export function PricingSection() {
  return (
    <section id="pricing" className="section-padding bg-background-secondary">
      <Container>
        <SectionHeading
          eyebrow="ราคา"
          title="แพ็กเกจที่เหมาะกับทุกขนาดธุรกิจ"
          description="เริ่มต้นเพียง ฿990/เดือน โปร่งใส ไม่มีค่าใช้จ่ายแอบแฝง"
        />

        <div className="mx-auto grid max-w-5xl gap-6 lg:grid-cols-3 lg:items-center">
          {pricingContent.map((plan) => {
            const isPopular = plan.popular;
            return (
              <div
                key={plan.name}
                className={cn(
                  "relative flex flex-col rounded-2xl p-7 transition-all duration-300",
                  isPopular
                    ? "border border-primary/30 bg-ink text-white shadow-elevated lg:scale-[1.04]"
                    : "border border-border bg-white shadow-card hover:shadow-card-hover"
                )}
              >
                {isPopular && (
                  <div className="absolute -top-3.5 left-1/2 -translate-x-1/2">
                    <span className="inline-flex items-center gap-1 rounded-full bg-gradient-to-r from-primary to-primary-light px-3.5 py-1.5 text-xs font-semibold text-white shadow-glow">
                      <Star className="h-3.5 w-3.5 fill-white" />
                      ยอดนิยม
                    </span>
                  </div>
                )}

                <h3
                  className={cn(
                    "text-lg font-bold",
                    isPopular ? "text-white" : "text-foreground"
                  )}
                >
                  {plan.name}
                </h3>
                <p
                  className={cn(
                    "mt-1.5 text-sm",
                    isPopular ? "text-slate-300" : "text-foreground-secondary"
                  )}
                >
                  {plan.description}
                </p>

                <div className="mt-5 flex items-baseline gap-1">
                  {plan.price !== "ติดต่อ" && (
                    <span
                      className={cn(
                        "text-lg font-semibold",
                        isPopular ? "text-slate-300" : "text-foreground-muted"
                      )}
                    >
                      ฿
                    </span>
                  )}
                  <span
                    className={cn(
                      "text-4xl font-bold tracking-tight",
                      isPopular ? "text-white" : "text-foreground"
                    )}
                  >
                    {plan.price}
                  </span>
                  {plan.period && (
                    <span
                      className={cn(
                        "text-sm",
                        isPopular ? "text-slate-400" : "text-foreground-muted"
                      )}
                    >
                      /{plan.period}
                    </span>
                  )}
                </div>

                <div
                  className={cn(
                    "my-6 h-px w-full",
                    isPopular ? "bg-white/10" : "bg-border"
                  )}
                />

                <ul className="mb-7 flex-1 space-y-3">
                  {plan.features.map((feature) => (
                    <li key={feature} className="flex items-start gap-2.5">
                      <span
                        className={cn(
                          "mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full",
                          isPopular
                            ? "bg-primary/20 text-primary-200"
                            : "bg-secondary/15 text-secondary"
                        )}
                      >
                        <Check className="h-3 w-3" strokeWidth={3} />
                      </span>
                      <span
                        className={cn(
                          "text-sm",
                          isPopular ? "text-slate-300" : "text-foreground-secondary"
                        )}
                      >
                        {feature}
                      </span>
                    </li>
                  ))}
                </ul>

                <Button
                  variant={isPopular ? "white" : "secondary"}
                  className="w-full"
                  href={
                    plan.name === "Enterprise"
                      ? "mailto:contact@perpos.io"
                      : APP_URL
                  }
                >
                  {plan.cta}
                </Button>
              </div>
            );
          })}
        </div>
      </Container>
    </section>
  );
}
