import { Header } from "@/components/layout/header";
import { Footer } from "@/components/layout/footer";
import { Container } from "@/components/ui/container";
import { Button } from "@/components/ui/button";

export default function TermsPage() {
  return (
    <>
      <Header />
      <main className="pt-24 pb-16">
        <Container>
          <div className="mx-auto max-w-3xl">
            <h1 className="mb-8 text-3xl font-heading font-bold text-foreground">
              เงื่อนไขการใช้งาน
            </h1>
            <div className="prose prose-lg max-w-none text-foreground-secondary">
              <p>อัปเดตล่าสุด: มกราคม 2568</p>

              <h2>1. การยอมรับเงื่อนไข</h2>
              <p>
                การเข้าใช้งานระบบ PERPOS ถือว่าคุณยอมรับเงื่อนไขการใช้งานนี้
                หากคุณไม่เห็นด้วยกับเงื่อนไขใดๆ กรุณาหยุดใช้งานระบบ
              </p>

              <h2>2. บริการ</h2>
              <p>
                PERPOS ให้บริการระบบบัญชีและ ERP สำหรับธุรกิจ SME
                โดยมีสิทธิ์เปลี่ยนแปลงหรือยกเลิกบริการได้ตามความเหมาะสม
              </p>

              <h2>3. บัญชีผู้ใช้</h2>
              <p>
                คุณรับผิดชอบในการรักษาความลับของบัญชีและรหัสผ่าน
                และยอมรับว่าคุณเป็นผู้รับผิดชอบต่อกิจกรรมทั้งหมดที่เกิดขึ้นภายใต้บัญชีของคุณ
              </p>

              <h2>4. ข้อมูลของคุณ</h2>
              <p>
                คุณคงเป็นเจ้าของข้อมูลที่คุณป้อนเข้าสู่ระบบ PERPOS
                เราจะไม่ใช้ข้อมูลของคุณโดยไม่ได้รับความยินยอม
              </p>

              <h2>5. การชำระเงิน</h2>
              <p>
                คุณยอมรับการชำระค่าบริการตามแพ็กเกจที่คุณเลือก
                และสามารถยกเลิกการสมัครได้ทุกเมื่อ
              </p>

              <h2>6. ข้อจำกัดความรับผิด</h2>
              <p>
                PERPOS ไม่รับผิดต่อความเสียหายใดๆ ที่เกิดจากการใช้งานระบบ
                และไม่รับประกันว่าระบบจะทำงานได้ตลอดเวลาหรือปราศจากข้อผิดพลาด
              </p>

              <h2>7. ติดต่อเรา</h2>
              <p>
                หากมีคำถามเกี่ยวกับเงื่อนไขการใช้งานนี้
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
