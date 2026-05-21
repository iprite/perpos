import {
  BookOpen,
  ShoppingCart,
  Package,
  Users,
  Calendar,
  MessageSquare,
  LucideIcon,
} from "lucide-react";
import { Container } from "@/components/ui/container";
import { SectionHeading } from "@/components/ui/section-heading";
import { Card } from "@/components/ui/card";
import { featuresContent } from "@/data/landing-content";

const iconMap: Record<string, LucideIcon> = {
  BookOpen,
  ShoppingCart,
  Package,
  Users,
  Calendar,
  MessageSquare,
};

export function FeaturesSection() {
  return (
    <section id="features" className="section-padding">
      <Container>
        <SectionHeading
          eyebrow="ฟีเจอร์"
          title="ทำงานได้ครบทุกอย่างในที่เดียว"
          description="ระบบ ERP ครบวงจรสำหรับธุรกิจ SME ไทย ออกแบบมาให้ใช้งานง่าย ไม่ซับซ้อน"
        />

        <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
          {featuresContent.map((feature, index) => {
            const Icon = iconMap[feature.icon] || BookOpen;
            return (
              <Card key={index} hover className="group">
                <div className="mb-4 inline-flex h-12 w-12 items-center justify-center rounded-xl bg-primary/10 text-primary transition-colors group-hover:bg-primary group-hover:text-white">
                  <Icon className="h-6 w-6" />
                </div>
                <h3 className="mb-2 text-xl font-heading font-semibold text-foreground">
                  {feature.title}
                </h3>
                <p className="text-foreground-secondary">{feature.description}</p>
              </Card>
            );
          })}
        </div>
      </Container>
    </section>
  );
}
