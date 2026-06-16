import { redirect } from 'next/navigation';

// รวมเข้ากับหน้า "จัดการผู้ใช้" แล้ว (org + โควต้าผู้ช่วย AI ที่เดียว)
export default function SttUsersRedirect() {
  redirect('/admin/users');
}
