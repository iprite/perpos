import { Container } from "@/components/ui/container";
import { SectionHeading } from "@/components/ui/section-heading";
import { Accordion } from "@/components/ui/accordion";
import { faqContent } from "@/data/landing-content";

export function FaqSection() {
  return (
    <section id="faq" className="section-padding">
      <Container>
        <div className="mx-auto max-w-3xl">
          <SectionHeading
            eyebrow="FAQ"
            title="คำถามที่พบบ่อย"
            description="ยังมีคำถามอื่น? ติดต่อเราได้ที่ contact@perpos.io"
          />
          <Accordion items={faqContent} />
        </div>
      </Container>
    </section>
  );
}
