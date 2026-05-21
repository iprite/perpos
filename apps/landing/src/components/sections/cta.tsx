import { Container } from "@/components/ui/container";
import { Button } from "@/components/ui/button";

export function CtaSection() {
  return (
    <section className="section-padding">
      <Container>
        <div className="relative overflow-hidden rounded-3xl bg-primary px-8 py-16 md:px-16 md:py-24">
          <div className="absolute inset-0 bg-gradient-to-br from-primary via-primary to-secondary opacity-90" />
          <div className="absolute -right-20 -top-20 h-64 w-64 rounded-full bg-white/10 blur-3xl" />
          <div className="absolute -bottom-20 -left-20 h-64 w-64 rounded-full bg-white/10 blur-3xl" />

          <div className="relative mx-auto max-w-3xl text-center">
            <h2 className="mb-4 text-3xl font-heading font-bold text-white md:text-4xl lg:text-5xl">
              พร้อมเริ่มต้นใช้งานแล้วหรือยัง?
            </h2>
            <p className="mb-8 text-lg text-primary-100">
              ทดลองใช้ฟรี 14 วัน ไม่ต้องใส่ข้อมูลบัตรเครดิต
              <br />
              เริ่มบริหารธุรกิจได้เลยวันนี้
            </p>
            <div className="flex flex-col items-center justify-center gap-4 sm:flex-row">
              <Button
                size="lg"
                variant="secondary"
                href="https://app.perpos.io/signup"
                className="bg-white text-primary hover:bg-gray-100"
              >
                เริ่มใช้ฟรีทันที
              </Button>
              <Button
                size="lg"
                variant="ghost"
                href="mailto:contact@perpos.io"
                className="text-white hover:bg-white/10 hover:text-white"
              >
                ติดต่อทีมงาน
              </Button>
            </div>
          </div>
        </div>
      </Container>
    </section>
  );
}
