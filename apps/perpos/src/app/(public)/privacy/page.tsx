import type { Metadata } from "next";
import Link from "next/link";
import React from "react";

export const metadata: Metadata = {
  title: "PERPOS | นโยบายความเป็นส่วนตัว",
  description: "นโยบายความเป็นส่วนตัวของ PERPOS อธิบายการเก็บ ใช้ และเปิดเผยข้อมูล",
  openGraph: {
    title: "PERPOS | นโยบายความเป็นส่วนตัว",
    description: "นโยบายความเป็นส่วนตัวของ PERPOS อธิบายการเก็บ ใช้ และเปิดเผยข้อมูล",
    type: "website",
  },
};

export default function PrivacyPage() {
  return (
    <article className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm sm:p-8">
      <header className="border-b border-gray-100 pb-5">
        <h1 className="text-2xl font-semibold tracking-tight text-gray-900 sm:text-3xl">นโยบายความเป็นส่วนตัว</h1>
        <div className="mt-2 text-sm text-gray-600">ปรับปรุงล่าสุด: 4 พฤษภาคม 2026</div>
        <div className="mt-3 text-sm text-gray-700">
          PERPOS ให้ความสำคัญกับความเป็นส่วนตัวของคุณ เอกสารนี้อธิบายว่าเรารวบรวม ใช้ จัดเก็บ และเปิดเผยข้อมูลของคุณอย่างไร
        </div>
      </header>

      <div className="mt-6 space-y-6 text-sm leading-7 text-gray-700">
        <section>
          <h2 className="text-base font-semibold text-gray-900">1) ขอบเขตของนโยบาย</h2>
          <p className="mt-2">
            นโยบายนี้ครอบคลุมการใช้งานบริการ PERPOS ผ่านเว็บไซต์ของเรา รวมถึงการเชื่อมต่อกับบริการภายนอก เช่น Google และ LINE
          </p>
        </section>

        <section>
          <h2 className="text-base font-semibold text-gray-900">2) ข้อมูลที่เราเก็บ</h2>
          <div className="mt-2 space-y-2">
            <p>
              <span className="font-medium text-gray-900">ข้อมูลบัญชี</span>: อีเมล, รหัสผู้ใช้, ข้อมูลโปรไฟล์ที่คุณตั้งค่า (เช่น ชื่อที่แสดง, รูปโปรไฟล์)
            </p>
            <p>
              <span className="font-medium text-gray-900">ข้อมูลการเชื่อมต่อ LINE</span>: ตัวระบุผู้ใช้ LINE เมื่อคุณผูกบัญชีเพื่อใช้งานบอท/ฟีเจอร์ที่เกี่ยวข้อง
            </p>
            <p>
              <span className="font-medium text-gray-900">ข้อมูลการเชื่อมต่อ Google</span>: ข้อมูลที่จำเป็นเพื่อให้ระบบทำงานกับ Google Drive (เช่น โทเค็นสำหรับการเชื่อมต่อ และโฟลเดอร์ปลายทาง)
            </p>
            <p>
              <span className="font-medium text-gray-900">ข้อมูลการใช้งาน</span>: บันทึกการทำงานที่เกี่ยวข้องกับความปลอดภัย การแก้ปัญหา และการปรับปรุงบริการ (เช่น เวลาเรียกใช้งาน, ข้อผิดพลาด)
            </p>
          </div>
        </section>

        <section>
          <h2 className="text-base font-semibold text-gray-900">3) วัตถุประสงค์ในการใช้ข้อมูล</h2>
          <div className="mt-2 space-y-2">
            <p>เพื่อให้บริการและฟีเจอร์ตามที่คุณร้องขอ เช่น การยืนยันตัวตน การเชื่อมต่อ LINE และการอัปโหลดไฟล์ไปยัง Google Drive</p>
            <p>เพื่อดูแลความปลอดภัย ป้องกันการใช้งานที่ไม่เหมาะสม และตรวจสอบสิทธิ์การใช้งาน</p>
            <p>เพื่อการสนับสนุนลูกค้า การแก้ไขปัญหา และการปรับปรุงคุณภาพบริการ</p>
          </div>
        </section>

        <section>
          <h2 className="text-base font-semibold text-gray-900">4) การเปิดเผย/การแชร์ข้อมูล</h2>
          <div className="mt-2 space-y-2">
            <p>
              เราอาจเปิดเผยข้อมูลเท่าที่จำเป็นให้กับผู้ให้บริการที่เกี่ยวข้องกับการทำงานของระบบ เช่น ผู้ให้บริการโครงสร้างพื้นฐาน/ฐานข้อมูล, Google (เพื่อเชื่อมต่อ Drive),
              และ LINE (เพื่อการสื่อสารผ่านบอท)
            </p>
            <p>เราไม่ขายข้อมูลส่วนบุคคลของคุณ</p>
          </div>
        </section>

        <section>
          <h2 className="text-base font-semibold text-gray-900">5) คุกกี้และเทคโนโลยีที่คล้ายกัน</h2>
          <p className="mt-2">
            เราอาจใช้คุกกี้หรือข้อมูลในเบราว์เซอร์ (เช่น localStorage/sessionStorage) เพื่อการทำงานของระบบ การคงสถานะการเข้าสู่ระบบ และการปรับปรุงประสบการณ์ใช้งาน
          </p>
        </section>

        <section>
          <h2 className="text-base font-semibold text-gray-900">6) ระยะเวลาการเก็บรักษาข้อมูล</h2>
          <p className="mt-2">
            เราจะเก็บข้อมูลเท่าที่จำเป็นต่อการให้บริการ หรือเพื่อปฏิบัติตามกฎหมาย/ข้อกำหนดที่เกี่ยวข้อง เมื่อหมดความจำเป็น เราจะลบหรือทำให้ข้อมูลไม่สามารถระบุตัวตนได้
          </p>
        </section>

        <section>
          <h2 className="text-base font-semibold text-gray-900">7) ความปลอดภัยของข้อมูล</h2>
          <p className="mt-2">
            เราใช้มาตรการที่เหมาะสมเพื่อปกป้องข้อมูล เช่น การควบคุมการเข้าถึง การส่งข้อมูลผ่านการเชื่อมต่อที่ปลอดภัย และแนวทางปฏิบัติด้านความปลอดภัยของระบบ
          </p>
        </section>

        <section>
          <h2 className="text-base font-semibold text-gray-900">8) สิทธิของเจ้าของข้อมูล</h2>
          <div className="mt-2 space-y-2">
            <p>คุณสามารถขอเข้าถึง แก้ไข หรือลบข้อมูลบางส่วนได้ตามความเหมาะสม</p>
            <p>คุณสามารถยกเลิกการเชื่อมต่อบริการภายนอก (เช่น Google Drive) ได้จากหน้า “ตั้งค่าผู้ใช้งาน” ภายในระบบ</p>
          </div>
        </section>

        <section>
          <h2 className="text-base font-semibold text-gray-900">9) การเปลี่ยนแปลงนโยบาย</h2>
          <p className="mt-2">
            เราอาจปรับปรุงนโยบายนี้เป็นครั้งคราว โดยจะอัปเดตวันที่ “ปรับปรุงล่าสุด” ด้านบน และเผยแพร่ฉบับล่าสุดบนหน้านี้
          </p>
        </section>

        <section className="rounded-xl border border-gray-200 bg-gray-50 p-4">
          <h2 className="text-base font-semibold text-gray-900">ติดต่อเรา</h2>
          <p className="mt-2">
            หากมีคำถามเกี่ยวกับนโยบายความเป็นส่วนตัว กรุณาติดต่อ <a className="font-medium text-gray-900 underline hover:text-gray-700" href="mailto:support@perpos.io">support@perpos.io</a>
          </p>
          <p className="mt-2">
            ต้องการกลับไปดูข้อกำหนดการให้บริการ? <Link className="font-medium text-gray-900 underline hover:text-gray-700" href="/terms">ไปที่ /terms</Link>
          </p>
        </section>
      </div>
    </article>
  );
}

