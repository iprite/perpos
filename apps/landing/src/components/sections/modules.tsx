import {
  Calculator,
  Receipt,
  ShoppingBag,
  Boxes,
  Wallet,
  FileText,
  Landmark,
  CalendarCheck,
  type LucideIcon,
} from "lucide-react";
import { Container } from "@/components/ui/container";
import { SectionHeading } from "@/components/ui/section-heading";
import { modulesContent } from "@/data/landing-content";

const iconMap: Record<string, LucideIcon> = {
  Calculator,
  Receipt,
  ShoppingBag,
  Boxes,
  Wallet,
  FileText,
  Landmark,
  CalendarCheck,
};

export function ModulesSection() {
  return (
    <section id="modules" className="section-padding bg-background-secondary">
      <Container>
        <SectionHeading
          eyebrow="โมดูล"
          title="เลือกใช้เฉพาะโมดูลที่ธุรกิจคุณต้องการ"
          description="เปิดใช้งานได้ตามความต้องการ และขยายเพิ่มได้เมื่อธุรกิจเติบโต"
        />

        <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
          {modulesContent.map((module) => {
            const Icon = iconMap[module.icon] || Calculator;
            return (
              <div
                key={module.name}
                className="group rounded-card border border-border bg-white p-5 transition-all duration-300 hover:-translate-y-1 hover:border-primary/30 hover:shadow-card-hover"
              >
                <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-primary/10 text-primary transition-colors duration-300 group-hover:bg-primary group-hover:text-white">
                  <Icon className="h-5 w-5" />
                </div>
                <h3 className="mt-4 text-sm font-bold text-foreground">
                  {module.name}
                </h3>
                <p className="mt-1 text-xs leading-relaxed text-foreground-secondary">
                  {module.description}
                </p>
              </div>
            );
          })}
        </div>
      </Container>
    </section>
  );
}
