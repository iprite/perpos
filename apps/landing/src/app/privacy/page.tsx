import { Header } from "@/components/layout/header";
import { Footer } from "@/components/layout/footer";
import { Container } from "@/components/ui/container";
import { Button } from "@/components/ui/button";

export default function PrivacyPage() {
  return (
    <>
      <Header />
      <main className="pt-24 pb-16">
        <Container>
          <div className="mx-auto max-w-3xl">
            <h1 className="mb-8 text-3xl font-heading font-bold text-foreground">
              นโยบายความเป็นส่วนตัว
            </h1>
            <div className="prose prose-lg max-w-none text-foreground-secondary">
              <p>อัปเดตล่าสุด: มกราคม 2568</p>

              <h2>1. ข้อมูลที่เราเก็บรวบรวม</h2>
              <p>
                PERPOS เก็บรวบรวมข้อมูลที่จำเป็นสำหรับการให้บริการระบบบัญชีและ ERP
                รวมถึงข้อมูลผู้ใช้ ข้อมูลองค์กร และข้อมูลการเงินที่คุณป้อนเข้าสู่ระบบ
              </p>

              <h2>2. การใช้ข้อมูล</h2>
              <p>
                เราใช้ข้อมูลของคุณเพื่อให้บริการระบบ ปรับปรุงประสบการณ์การใช้งาน
                และสื่อสารกับคุณเกี่ยวกับบริการของเรา
              </p>

              <h2>3. การแชร์ข้อมูล</h2>
              <p>
                เราไม่ขายหรือแชร์ข้อมูลส่วนบุคคลของคุณกับบุคคลที่สามโดยไม่ได้รับความยินยอมจากคุณ
                ยกเว้นกรณีที่กฎหมายกำหนด
              </p>

              <h2>4. การรักษาความปลอดภัย</h2>
              <p>
                ข้อมูลของคุณถูกเก็บบน Google Cloud พร้อมการเข้ารหัสทุก transaction
                และมีมาตรการรักษาความปลอดภัยระดับองค์กร
              </p>

              <h2>5. สิทธิ์ของคุณ</h2>
              <p>
                คุณมีสิทธิ์เข้าถึง แก้ไข หรือลบข้อมูลส่วนบุคคลของคุณได้ตลอดเวลา
                ผ่านการตั้งค่าบัญชีหรือติดต่อทีมงานของเรา
              </p>

              <h2>6. ติดต่อเรา</h2>
              <p>
                หากมีคำถามเกี่ยวกับนโยบายความเป็นส่วนตัวนี้
                ติดต่อเราได้ที่{" "}
                <a href="mailto:contact@perpos.io" className="text-primary hover:underline">
                  contact@perpos.io
                </a>
              </p>
            </div>

            <div className="mt-12">
              <Button href="https://app.perpos.io/signup">
                สมัครใช้งาน PERPOS
              </Button>
            </div>
          </div>
        </Container>
      </main>
      <Footer />
    </>
  );
}
