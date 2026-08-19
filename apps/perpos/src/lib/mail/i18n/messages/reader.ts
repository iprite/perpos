import { defineMailMessages } from "../define";

/** พจนานุกรมพื้นที่ `reader` (บานอ่านเมล) — คีย์ต้องขึ้นต้นด้วย `reader.` */
export const reader = defineMailMessages({
  // สถานะว่าง / ผิดพลาด
  "reader.error.title": { th: "เปิดอีเมลไม่สำเร็จ", en: "Could not open this email" },
  "reader.empty.title": { th: "เลือกอีเมลเพื่ออ่าน", en: "Select an email to read" },
  "reader.empty.desc": {
    th: "เลือกจากรายการทางซ้าย หรือกด j / k แล้ว Enter",
    en: "Pick one from the list on the left, or press j / k then Enter",
  },
  "reader.noSubject": { th: "(ไม่มีหัวเรื่อง)", en: "(no subject)" },
  "reader.noBody": { th: "(อีเมลฉบับนี้ไม่มีเนื้อหา)", en: "(this email has no content)" },

  // แถบเครื่องมือด้านบน
  "reader.back": { th: "กลับไปรายการ", en: "Back to list" },
  "reader.back.title": { th: "กลับไปรายการ (Esc)", en: "Back to list (Esc)" },
  "reader.find": { th: "ค้นในเมลฉบับนี้", en: "Find in this email" },
  "reader.star": { th: "ติดดาว", en: "Star" },
  "reader.star.title": { th: "ติดดาว (s)", en: "Star (s)" },
  "reader.spam": { th: "แจ้งว่าเป็นสแปม", en: "Report as spam" },
  "reader.spam.title": {
    th: "แจ้งว่าเป็นสแปม (ย้ายไปจดหมายขยะ + สอนตัวกรอง)",
    en: "Report as spam (move to Junk + train the filter)",
  },
  "reader.notSpam": { th: "ไม่ใช่สแปม", en: "Not spam" },
  "reader.notSpam.title": {
    th: "ไม่ใช่สแปม (ย้ายกลับกล่องขาเข้า + สอนตัวกรอง)",
    en: "Not spam (move back to Inbox + train the filter)",
  },
  "reader.rule": { th: "สร้างกฎกรองจากเมลนี้", en: "Create a filter from this email" },
  "reader.move": { th: "ย้ายไป", en: "Move to" },
  "reader.archive": { th: "เก็บเข้าคลัง", en: "Archive" },
  "reader.archive.title": { th: "เก็บเข้าคลัง (e)", en: "Archive (e)" },
  "reader.trash": { th: "ลบ", en: "Delete" },
  "reader.trash.title": { th: "ลบ (#)", en: "Delete (#)" },

  // แถบค้นในเมล
  "reader.find.notFound": { th: "ไม่พบ", en: "Not found" },
  "reader.find.prev": { th: "ผลก่อนหน้า", en: "Previous match" },
  "reader.find.prev.title": { th: "ก่อนหน้า (Shift+Enter)", en: "Previous (Shift+Enter)" },
  "reader.find.next": { th: "ผลถัดไป", en: "Next match" },
  "reader.find.next.title": { th: "ถัดไป (Enter)", en: "Next (Enter)" },
  "reader.find.close": { th: "ปิดการค้นหา", en: "Close search" },
  "reader.find.close.title": { th: "ปิดการค้นหา (Esc)", en: "Close search (Esc)" },

  // เธรด
  "reader.thread.truncated": {
    th: "เธรดนี้มี {total} ฉบับ — แสดง {shown} ฉบับล่าสุด",
    en: "This thread has {total} messages — showing the latest {shown}",
  },
  "reader.reply": { th: "ตอบ", en: "Reply" },
  "reader.reply.title": { th: "ตอบ (r)", en: "Reply (r)" },
  "reader.replyAll": { th: "ตอบทั้งหมด", en: "Reply all" },
  "reader.replyAll.title": { th: "ตอบทั้งหมด (a)", en: "Reply all (a)" },
  "reader.forward": { th: "ส่งต่อ", en: "Forward" },
  "reader.forward.title": { th: "ส่งต่อ (f)", en: "Forward (f)" },

  // การ์ดฉบับ
  "reader.to": { th: "ถึง: {list}", en: "To: {list}" },
  "reader.cc": { th: "สำเนา: {list}", en: "Cc: {list}" },
  "reader.expandHint": { th: "แตะเพื่อกางข้อความนี้", en: "Tap to expand this message" },
  "reader.images.blocked": {
    th: "บล็อกรูปจากภายนอกไว้ เพื่อไม่ให้ผู้ส่งรู้ว่าคุณเปิดอ่าน",
    en: "External images are blocked so the sender can't tell you opened this",
  },
  "reader.images.show": { th: "แสดงรูป", en: "Show images" },
  "reader.images.loading": { th: "กำลังโหลด…", en: "Loading…" },
  "reader.images.failed": {
    th: "โหลดรูปในอีเมลไม่สำเร็จ",
    en: "Could not load the images in this email",
  },
  "reader.images.notFound": {
    th: "ไม่พบเนื้อหาอีเมลฉบับนี้",
    en: "This email's content was not found",
  },
  "reader.fit.actualSize.title": {
    th: "ดูขนาดจริง (เลื่อนซ้าย-ขวา)",
    en: "View at actual size (scroll sideways)",
  },
  "reader.fit.actualSize": { th: "ขนาดจริง ({percent}%)", en: "Actual size ({percent}%)" },
  "reader.fit.shrink.title": { th: "ย่อให้พอดีกรอบ", en: "Shrink to fit the pane" },
  "reader.fit.shrink": { th: "ย่อให้พอดี", en: "Fit to width" },
  "reader.print": { th: "พิมพ์", en: "Print" },
  "reader.print.title": { th: "พิมพ์เฉพาะเนื้อเมล", en: "Print the email body only" },
  "reader.fullscreen": { th: "เปิดเต็มหน้า", en: "Open full screen" },
  "reader.security": { th: "ผลตรวจ", en: "Checks" },
  "reader.security.title": {
    th: "ผลตรวจสแปม / SPF / DKIM / DMARC ของฉบับนี้",
    en: "Spam / SPF / DKIM / DMARC results for this message",
  },
  "reader.security.dialogTitle": { th: "ผลตรวจของเมลฉบับนี้", en: "Checks for this email" },
  "reader.frame.title": { th: "เนื้อหาอีเมล", en: "Email content" },
  "reader.frame.fullscreenTitle": {
    th: "เนื้อหาอีเมล (เต็มหน้า)",
    en: "Email content (full screen)",
  },
  "reader.attachment.view": { th: "ดู", en: "View" },
  "reader.attachment.download": { th: "ดาวน์โหลด", en: "Download" },
  "reader.link.goto": { th: "ไปที่", en: "Go to" },
});
