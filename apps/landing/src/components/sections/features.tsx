import {
  BookOpen,
  ShoppingCart,
  Package,
  Users,
  Percent,
  MessageSquare,
  ArrowUpRight,
  type LucideIcon,
} from "lucide-react";
import { Container } from "@/components/ui/container";
import { SectionHeading } from "@/components/ui/section-heading";
import { featuresContent } from "@/data/landing-content";

const iconMap: Record<string, LucideIcon> = {
  BookOpen,
  ShoppingCart,
  Package,
  Users,
  Percent,
  MessageSquare,
};

export function FeaturesSection() {
  return (
    <section id="features" className="section-padding">
      <Container>
        <SectionHeading
          eyebrow="ฟีเจอร์"
          title="ครอบคลุมทุกงานบัญชีและการเงิน"
          description="เครื่องมือที่ออกแบบจากการทำงานจริงของธุรกิจไทย ใช้งานง่าย ไม่ซับซ้อน"
        />

        <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {featuresContent.map((feature) => {
            const Icon = iconMap[feature.icon] || BookOpen;
            return (
              <div
                key={feature.title}
                className="group relative overflow-hidden rounded-card border border-border bg-white p-7 shadow-card transition-all duration-300 hover:-translate-y-1 hover:border-primary/30 hover:shadow-card-hover"
              >
                {/* top accent glow */}
                <div className="pointer-events-none absolute -right-12 -top-12 h-32 w-32 rounded-full bg-primary/0 blur-2xl transition-colors duration-300 group-hover:bg-primary/10" />

                <div className="relative flex items-center justify-between">
                  <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-gradient-to-br from-primary to-primary-light text-white shadow-sm shadow-primary/25">
                    <Icon className="h-6 w-6" />
                  </div>
                  <ArrowUpRight className="h-5 w-5 text-foreground-muted opacity-0 transition-all duration-300 group-hover:translate-x-0.5 group-hover:opacity-100" />
                </div>

                <h3 className="relative mt-5 text-lg font-bold text-foreground">
                  {feature.title}
                </h3>
                <p className="relative mt-2 text-sm leading-relaxed text-foreground-secondary">
                  {feature.description}
                </p>
              </div>
            );
          })}
        </div>
      </Container>
    </section>
  );
}
