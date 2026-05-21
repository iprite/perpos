import { Container } from "@/components/ui/container";
import { SectionHeading } from "@/components/ui/section-heading";
import { Button } from "@/components/ui/button";
import { pricingContent } from "@/data/landing-content";
import { Check } from "lucide-react";

export function PricingSection() {
  return (
    <section id="pricing" className="section-padding">
      <Container>
        <SectionHeading
          eyebrow="ราคา"
          title="เลือกแพ็กเกจที่เหมาะกับธุรกิจของคุณ"
          description="ราคาเริ่มต้นเพียง ฿990/เดือน ไม่มีค่าใช้จ่ายซ่อนเร้น"
        />

        <div className="grid gap-8 lg:grid-cols-3 lg:items-start">
          {pricingContent.map((plan, index) => (
            <div
              key={index}
              className={`relative rounded-2xl border p-8 ${
                plan.popular
                  ? "border-primary bg-primary shadow-xl shadow-primary/20 lg:-mt-4 lg:mb-4"
                  : "border-border bg-white"
              }`}
            >
              {plan.popular && (
                <div className="absolute -top-4 left-1/2 -translate-x-1/2 rounded-full bg-accent px-4 py-1 text-sm font-medium text-white">
                  แพ็กเกจยอดนิยม
                </div>
              )}

              <div className="mb-6">
                <h3
                  className={`text-xl font-heading font-semibold ${
                    plan.popular ? "text-white" : "text-foreground"
                  }`}
                >
                  {plan.name}
                </h3>
                <p
                  className={`mt-2 text-sm ${
                    plan.popular ? "text-primary-100" : "text-foreground-secondary"
                  }`}
                >
                  {plan.description}
                </p>
              </div>

              <div className="mb-6">
                <span
                  className={`text-4xl font-bold ${
                    plan.popular ? "text-white" : "text-foreground"
                  }`}
                >
                  {plan.price}
                </span>
                {plan.period && (
                  <span
                    className={`text-sm ${
                      plan.popular ? "text-primary-100" : "text-foreground-muted"
                    }`}
                  >
                    {" "}
                    / {plan.period}
                  </span>
                )}
              </div>

              <ul className="mb-8 space-y-3">
                {plan.features.map((feature, fIndex) => (
                  <li key={fIndex} className="flex items-start gap-3">
                    <Check
                      className={`mt-0.5 h-5 w-5 flex-shrink-0 ${
                        plan.popular ? "text-white" : "text-secondary"
                      }`}
                    />
                    <span
                      className={`text-sm ${
                        plan.popular ? "text-primary-100" : "text-foreground-secondary"
                      }`}
                    >
                      {feature}
                    </span>
                  </li>
                ))}
              </ul>

              <Button
                variant={plan.popular ? "secondary" : "secondary"}
                className={`w-full ${
                  plan.popular
                    ? "bg-white text-primary hover:bg-gray-100"
                    : "border-primary text-primary hover:bg-primary hover:text-white"
                }`}
                href={
                  plan.name === "Enterprise"
                    ? "mailto:contact@perpos.io"
                    : "https://app.perpos.io/signup"
                }
              >
                {plan.cta}
              </Button>
            </div>
          ))}
        </div>
      </Container>
    </section>
  );
}
