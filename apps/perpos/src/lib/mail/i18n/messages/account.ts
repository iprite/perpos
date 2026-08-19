import { defineMailMessages } from "../define";

/** หน้า `/account` — คีย์ขึ้นต้นด้วย `account.` */
export const account = defineMailMessages({
  "account.title": { th: "บัญชีของฉัน", en: "My account" },
  "account.back": { th: "กลับไปที่กล่องเมล", en: "Back to mailbox" },

  /** เมนูย่อยของหน้าบัญชี */
  "account.tab.profile": { th: "โปรไฟล์", en: "Profile" },
  "account.tab.signature": { th: "ลายเซ็น", en: "Signature" },
  "account.tab.password": { th: "รหัสผ่าน", en: "Password" },
  "account.tab.language": { th: "ภาษา", en: "Language" },

  "account.signature.title": { th: "ลายเซ็น", en: "Signature" },
  "account.signature.desc": {
    th: "ข้อความต่อท้ายเมลที่คุณเขียน — ใส่ให้อัตโนมัติตอนกดเขียนใหม่ (ยังลบ/แก้ในกล่องเขียนได้)",
    en: "Text appended to emails you write — added automatically when you start a new message (still editable before sending)",
  },
  "account.signature.label": { th: "ข้อความลายเซ็น", en: "Signature text" },
  "account.signature.placeholder": {
    th: "เช่น\nสมชาย ใจดี\nฝ่ายขาย · โทร 08x-xxx-xxxx",
    en: "e.g.\nJohn Doe\nSales · +66 8x-xxx-xxxx",
  },
  "account.signature.counter": { th: "{used}/{max} ตัวอักษร", en: "{used}/{max} characters" },
  "account.signature.onReply": { th: "ตอนตอบ / ส่งต่อ", en: "On replies & forwards" },
  "account.signature.onReply.on": { th: "ใส่ลายเซ็น", en: "Include" },
  "account.signature.onReply.off": { th: "ไม่ใส่", en: "Skip" },
  "account.signature.hint": {
    th: "ลายเซ็นถูกคั่นด้วยบรรทัด “-- ” ตามมาตรฐานอีเมล และวางไว้เหนือข้อความที่อ้างถึงเสมอ",
    en: 'Separated by the standard "-- " line and always placed above quoted text',
  },
  "account.signature.preview": { th: "ตัวอย่างท้ายเมล", en: "Preview" },
  "account.signature.saved": {
    th: "บันทึกแล้ว — ใช้กับเมลที่เขียนหลังจากนี้",
    en: "Saved — applies to messages you write from now on",
  },
  "account.signature.failed": { th: "บันทึกลายเซ็นไม่สำเร็จ", en: "Could not save signature" },

  "account.avatar.title": { th: "รูปโปรไฟล์", en: "Profile picture" },
  "account.avatar.desc": {
    th: "เห็นเฉพาะในเว็บเมลนี้ · ผู้รับปลายทางไม่เห็น (อีเมลไม่มีมาตรฐานรูปโปรไฟล์) · PNG/JPEG/WEBP ไม่เกิน 256 KB",
    en: "Shown only in this webmail · recipients never see it (email has no avatar standard) · PNG/JPEG/WEBP up to 256 KB",
  },
  "account.avatar.alt": { th: "รูปโปรไฟล์", en: "Profile picture" },
  "account.avatar.upload": { th: "อัปโหลดรูป", en: "Upload picture" },
  "account.avatar.change": { th: "เปลี่ยนรูป", en: "Change picture" },
  "account.avatar.uploading": { th: "กำลังอัปโหลด…", en: "Uploading…" },
  "account.avatar.remove": { th: "เอาออก", en: "Remove" },
  "account.avatar.changed": { th: "เปลี่ยนรูปแล้ว", en: "Picture updated" },
  "account.avatar.removed": { th: "เอารูปออกแล้ว", en: "Picture removed" },
  "account.avatar.failed": { th: "อัปโหลดไม่สำเร็จ", en: "Upload failed" },

  "account.name.title": { th: "ชื่อที่แสดง", en: "Display name" },
  "account.name.desc": {
    th: "ชื่อที่ผู้รับเห็นหน้าที่อยู่อีเมลของคุณ",
    en: "The name recipients see next to your email address",
  },
  "account.name.label": { th: "ชื่อ", en: "Name" },
  "account.name.placeholder": { th: "เช่น ฝ่ายขาย EXWorker", en: "e.g. EXWorker Sales" },
  "account.name.saved": {
    th: "บันทึกแล้ว — ผู้รับจะเห็นชื่อนี้ในเมลฉบับต่อไป",
    en: "Saved — recipients will see this name on your next email",
  },
  "account.name.failed": { th: "บันทึกไม่สำเร็จ", en: "Could not save" },

  "account.language.title": { th: "ภาษา", en: "Language" },
  "account.language.desc": {
    th: "ภาษาของเมนูและข้อความในเว็บเมลนี้ — จำไว้กับบัญชีของคุณ ใช้เครื่องไหนก็เหมือนกัน",
    en: "Language of menus and messages in this webmail — saved to your account and follows you on every device",
  },
  "account.language.hint": {
    th: "มีผลทันที · ไม่กระทบเนื้อหาอีเมลหรือชื่อโฟลเดอร์ที่คุณตั้งเอง",
    en: "Applies immediately · does not change email content or folder names you created",
  },

  "account.password.title": { th: "รหัสผ่าน", en: "Password" },
  "account.password.desc": {
    th: "ใช้กับทั้งเว็บเมลนี้และการตั้งค่าใน Outlook / มือถือ — เปลี่ยนแล้วต้องอัปเดตทุกอุปกรณ์",
    en: "Used by this webmail and by Outlook / mobile setups — after changing it, update every device",
  },
  "account.password.current": { th: "รหัสผ่านปัจจุบัน", en: "Current password" },
  "account.password.new": { th: "รหัสผ่านใหม่", en: "New password" },
  "account.password.newHint": {
    th: "เซิร์ฟเวอร์ปฏิเสธรหัสที่เดาง่าย — ใช้ให้ยาวหรือผสมคำที่ไม่ใช่คำทั่วไป",
    en: "The server rejects easy-to-guess passwords — make it long or mix in uncommon words",
  },
  "account.password.confirm": { th: "ยืนยันรหัสผ่านใหม่", en: "Confirm new password" },
  "account.password.submit": { th: "เปลี่ยนรหัสผ่าน", en: "Change password" },
  "account.password.submitting": { th: "กำลังเปลี่ยน…", en: "Changing…" },
  "account.password.mismatch": {
    th: "รหัสผ่านใหม่กับการยืนยันไม่ตรงกัน",
    en: "New password and confirmation do not match",
  },
  "account.password.changed": {
    th: "เปลี่ยนรหัสผ่านแล้ว — อุปกรณ์อื่น (Outlook/มือถือ) ต้องใส่รหัสใหม่ด้วย",
    en: "Password changed — other devices (Outlook/mobile) must use the new password too",
  },
  "account.password.failed": { th: "เปลี่ยนรหัสผ่านไม่สำเร็จ", en: "Could not change password" },
});
