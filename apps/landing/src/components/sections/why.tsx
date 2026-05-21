import { Globe, ShieldCheck, Layers, Zap, type LucideIcon } from "lucide-react";
import { Container } from "@/components/ui/container";
import { SectionHeading } from "@/components/ui/section-heading";
import { whyContent } from "@/data/landing-content";

const iconMap: Record<string, LucideIcon> = {
  Globe,
  ShieldCheck,
  Layers,
  Zap,
};

export function WhySection() {
  return (
    <section className="section-padding">
      <Container>
        <SectionHeading
          eyebrow="ทำไมต้อง PERPOS"
          title="สร้างมาเพื่อธุรกิจไทยโดยเฉพาะ"
          description="ทุกรายละเอียดออกแบบให้ตรงกับการทำงานจริงของ SME ไทย"
        />

        <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
          {whyContent.map((item) => {
            const Icon = iconMap[item.icon] || Globe;
            return (
              <div
                key={item.title}
                className="relative rounded-card border border-border bg-white p-6 transition-shadow duration-300 hover:shadow-card-hover"
              >
                <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-primary-50 text-primary ring-1 ring-primary/10">
                  <Icon className="h-6 w-6" />
                </div>
                <h3 className="mt-5 text-base font-bold text-foreground">
                  {item.title}
                </h3>
                <p className="mt-2 text-sm leading-relaxed text-foreground-secondary">
                  {item.description}
                </p>
              </div>
            );
          })}
        </div>
      </Container>
    </section>
  );
}
