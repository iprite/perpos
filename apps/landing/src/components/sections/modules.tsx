import {
  Calculator,
  Receipt,
  ShoppingBag,
  Boxes,
  Wallet,
  FileText,
  Landmark,
  CalendarCheck,
  LucideIcon,
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
    <section className="section-padding bg-background-secondary">
      <Container>
        <SectionHeading
          eyebrow="โมดูล"
          title="ระบบครบทุกฟังก์ชันที่ธุรกิจ SME ต้องการ"
          description="เลือกใช้งานได้ตามความต้องการของธุรกิจ ขยายได้เมื่อธุรกิจเติบโต"
        />

        <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
          {modulesContent.map((module, index) => {
            const Icon = iconMap[module.icon] || Calculator;
            return (
              <div
                key={index}
                className="group flex flex-col items-center rounded-xl border border-border bg-white p-6 text-center transition-all hover:border-primary hover:shadow-lg"
              >
                <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-xl bg-primary/10 text-primary transition-colors group-hover:bg-primary group-hover:text-white">
                  <Icon className="h-7 w-7" />
                </div>
                <span className="font-medium text-foreground">{module.name}</span>
              </div>
            );
          })}
        </div>
      </Container>
    </section>
  );
}
