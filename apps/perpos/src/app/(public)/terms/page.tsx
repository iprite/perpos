import type { Metadata } from "next";
import Link from "next/link";
import React from "react";

export const metadata: Metadata = {
  title: "PERPOS | ข้อกำหนดการให้บริการ",
  description: "ข้อกำหนดการให้บริการของ PERPOS สำหรับการใช้งานระบบ",
  openGraph: {
    title: "PERPOS | ข้อกำหนดการให้บริการ",
    description: "ข้อกำหนดการให้บริการของ PERPOS สำหรับการใช้งานระบบ",
    type: "website",
  },
};

export default function TermsPage() {
  return (
    <article className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm sm:p-8">
      <header className="border-b border-gray-100 pb-5">
        <h1 className="text-2xl font-semibold tracking-tight text-gray-900 sm:text-3xl">ข้อกำหนดการให้บริการ</h1>
        <div className="mt-2 text-sm text-gray-600">ปรับปรุงล่าสุด: 4 พฤษภาคม 2026</div>
        <div className="mt-3 text-sm text-gray-700">โปรดอ่านข้อกำหนดนี้ก่อนใช้งาน PERPOS เมื่อคุณใช้งาน ถือว่าคุณยอมรับข้อกำหนดฉบับนี้</div>
      </header>

      <div className="mt-6 space-y-6 text-sm leading-7 text-gray-700">
        <section>
          <h2 className="text-base font-semibold text-gray-900">1) การยอมรับข้อกำหนด</h2>
          <p className="mt-2">
            การเข้าถึงหรือใช้งาน PERPOS ไม่ว่าทางใดทางหนึ่ง ถือว่าคุณยืนยันว่าคุณอ่าน เข้าใจ และยอมรับข้อกำหนดการให้บริการนี้
          </p>
        </section>

        <section>
          <h2 className="text-base font-semibold text-gray-900">2) ขอบเขตบริการ</h2>
          <div className="mt-2 space-y-2">
            <p>PERPOS เป็นระบบผู้ช่วยทำงานที่รองรับการทำงานร่วมกับ LINE และฟีเจอร์เสริม เช่น การเชื่อมต่อ Google Drive เพื่อจัดเก็บไฟล์</p>
            <p>เราอาจเพิ่ม ปรับปรุง หรือลดทอนฟีเจอร์บางส่วนเพื่อพัฒนาบริการ โดยพยายามคงความต่อเนื่องในการใช้งาน</p>
          </div>
        </section>

        <section>
          <h2 className="text-base font-semibold text-gray-900">3) บัญชีและการยืนยันตัวตน</h2>
          <div className="mt-2 space-y-2">
            <p>คุณอาจต้องเข้าสู่ระบบเพื่อใช้งานฟีเจอร์ภายใน โดยระบบอาจใช้การยืนยันตัวตนผ่านผู้ให้บริการภายนอก เช่น Google</p>
            <p>คุณต้องรักษาความปลอดภัยของบัญชีและอุปกรณ์ของคุณ และรับผิดชอบการใช้งานภายใต้บัญชีของคุณ</p>
          </div>
        </section>

        <section>
          <h2 className="text-base font-semibold text-gray-900">4) การใช้งานที่ต้องห้าม</h2>
          <div className="mt-2 space-y-2">
            <p>ห้ามใช้งานเพื่อกระทำการที่ผิดกฎหมาย ละเมิดสิทธิผู้อื่น หรือส่งข้อมูล/ไฟล์ที่มีมัลแวร์</p>
            <p>ห้ามพยายามเข้าถึงระบบโดยไม่ได้รับอนุญาต รบกวนการทำงานของระบบ หรือทำ reverse engineering ในส่วนที่ผิดกฎหมาย/ขัดต่อสิทธิของเรา</p>
          </div>
        </section>

        <section>
          <h2 className="text-base font-semibold text-gray-900">5) บริการของบุคคลที่สาม</h2>
          <div className="mt-2 space-y-2">
            <p>
              PERPOS อาจเชื่อมต่อกับบริการของบุคคลที่สาม เช่น Google Drive และ LINE การใช้งานบริการเหล่านั้นอาจอยู่ภายใต้ข้อกำหนดและนโยบายของบุคคลที่สาม
            </p>
            <p>เราไม่รับผิดชอบต่อความขัดข้องหรือการเปลี่ยนแปลงนโยบายของบริการบุคคลที่สามที่อยู่นอกเหนือการควบคุมของเรา</p>
          </div>
        </section>

        <section>
          <h2 className="text-base font-semibold text-gray-900">6) ทรัพย์สินทางปัญญา</h2>
          <p className="mt-2">เนื้อหา ซอฟต์แวร์ เครื่องหมายการค้า และองค์ประกอบต่าง ๆ ของ PERPOS เป็นทรัพย์สินของเรา หรือได้รับอนุญาตให้ใช้งานอย่างถูกต้อง</p>
        </section>

        <section>
          <h2 className="text-base font-semibold text-gray-900">7) การระงับหรือยกเลิกการให้บริการ</h2>
          <p className="mt-2">
            เราอาจระงับหรือยกเลิกการเข้าถึงบริการของคุณ หากพบการใช้งานที่ผิดข้อกำหนด หรือมีความจำเป็นด้านความปลอดภัย/กฎหมาย
          </p>
        </section>

        <section>
          <h2 className="text-base font-semibold text-gray-900">8) การปฏิเสธการรับประกัน</h2>
          <p className="mt-2">บริการให้ “ตามสภาพ” และ “ตามที่มี” เราพยายามอย่างเหมาะสมเพื่อให้บริการเสถียร แต่ไม่รับประกันว่าจะปราศจากข้อผิดพลาดตลอดเวลา</p>
        </section>

        <section>
          <h2 className="text-base font-semibold text-gray-900">9) การจำกัดความรับผิด</h2>
          <p className="mt-2">
            ในขอบเขตสูงสุดที่กฎหมายอนุญาต เราจะไม่รับผิดชอบต่อความเสียหายทางอ้อม หรือความเสียหายที่เกิดจากการใช้งานหรือไม่สามารถใช้งานบริการได้
          </p>
        </section>

        <section>
          <h2 className="text-base font-semibold text-gray-900">10) กฎหมายที่ใช้บังคับ</h2>
          <p className="mt-2">ข้อกำหนดนี้อยู่ภายใต้กฎหมายของประเทศไทย และข้อพิพาทใด ๆ ให้พิจารณาตามเขตอำนาจศาลที่เกี่ยวข้อง</p>
        </section>

        <section>
          <h2 className="text-base font-semibold text-gray-900">11) การเปลี่ยนแปลงข้อกำหนด</h2>
          <p className="mt-2">
            เราอาจปรับปรุงข้อกำหนดนี้เป็นครั้งคราว โดยจะอัปเดตวันที่ “ปรับปรุงล่าสุด” ด้านบน และเผยแพร่ฉบับล่าสุดบนหน้านี้
          </p>
        </section>

        <section className="rounded-xl border border-gray-200 bg-gray-50 p-4">
          <h2 className="text-base font-semibold text-gray-900">ติดต่อเรา</h2>
          <p className="mt-2">
            หากมีคำถามเกี่ยวกับข้อกำหนดการให้บริการ กรุณาติดต่อ <a className="font-medium text-gray-900 underline hover:text-gray-700" href="mailto:support@perpos.io">support@perpos.io</a>
          </p>
          <p className="mt-2">
            ต้องการดูนโยบายความเป็นส่วนตัว? <Link className="font-medium text-gray-900 underline hover:text-gray-700" href="/privacy">ไปที่ /privacy</Link>
          </p>
        </section>
      </div>
    </article>
  );
}

