import { redirect } from "next/navigation";

// กลุ่ม "การเงิน & บริการ" ยุบเป็นเมนูเดียว — เข้าหน้าแรก = ภาพรวม (payments)
// (สลับแท็บอื่น: องค์กร B2B / บุคคล B2C / เครดิต Token ผ่านแถบแท็บในหน้า)
export default function AdminFinancePage() {
  redirect("/admin/payments");
}
