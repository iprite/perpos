import { defineMailMessages } from "../define";

/** พจนานุกรมพื้นที่ `list` — คีย์ต้องขึ้นต้นด้วย `list.` (รายการเมล · แถว · แถบเครื่องมือ) */
export const list = defineMailMessages({
  // ── MailList ──
  "list.error.title": { th: "โหลดรายการอีเมลไม่สำเร็จ", en: "Couldn't load your emails" },
  "list.empty.search.title": {
    th: "ไม่พบอีเมลที่ตรงกับ «{term}»",
    en: "No emails match “{term}”",
  },
  "list.empty.search.description": {
    th: "ลองใช้คำค้นที่สั้นลง หรือค้นจากชื่อผู้ส่ง",
    en: "Try a shorter search term, or search by sender name",
  },
  "list.empty.search.clear": { th: "ล้างการค้นหา", en: "Clear search" },
  "list.empty.box.title": { th: "ยังไม่มีอีเมลในกล่องนี้", en: "No emails in this folder yet" },
  "list.empty.box.description": {
    th: "เมื่อมีอีเมลเข้ามา จะแสดงที่นี่ทันที",
    en: "New emails will show up here as soon as they arrive",
  },
  "list.scan.notice": {
    th: "ค้นแบบตรงตัวจากเมลล่าสุด {count} ฉบับ",
    en: "Exact-match search across your latest {count} emails",
  },
  "list.scan.truncated": {
    th: " — ยังมีเมลเก่ากว่านั้นที่ยังไม่ได้ค้น ลองพิมพ์ให้เต็มคำ",
    en: " — older emails were not searched; try typing the full word",
  },
  "list.loadMore": { th: "โหลดเพิ่ม", en: "Load more" },
  "list.allLoaded": { th: "แสดงครบทุกฉบับแล้ว", en: "You've reached the end" },
  "list.newMail": { th: "มีเมลใหม่ {count} ฉบับ", en: "{count} new emails" },

  // ── MailRow ──
  "list.row.noSender": { th: "(ไม่ระบุผู้ส่ง)", en: "(unknown sender)" },
  "list.row.noSubject": { th: "(ไม่มีหัวเรื่อง)", en: "(no subject)" },
  "list.row.swipe.releaseArchive": { th: "ปล่อยเพื่อเก็บ", en: "Release to archive" },
  "list.row.swipe.releaseTrash": { th: "ปล่อยเพื่อลบ", en: "Release to delete" },
  "list.row.archive": { th: "เก็บเข้าคลัง", en: "Archive" },
  "list.row.select": { th: "เลือกอีเมลนี้", en: "Select this email" },
  "list.row.deselect": { th: "ไม่เลือกอีเมลนี้", en: "Deselect this email" },
  "list.row.star": { th: "ติดดาว", en: "Star" },
  "list.row.unstar": { th: "เอาดาวออก", en: "Remove star" },
  "list.row.hasAttachment": { th: "มีไฟล์แนบ", en: "Has attachment" },
  "list.row.markRead": { th: "ทำเป็นอ่านแล้ว", en: "Mark as read" },
  "list.row.markUnread": { th: "ทำเป็นยังไม่ได้อ่าน", en: "Mark as unread" },

  // ── MailToolbar ──
  "list.toolbar.unread": { th: "ยังไม่ได้อ่าน {count}", en: "{count} unread" },
  "list.toolbar.search.placeholder": { th: "ค้นหาในเมล", en: "Search mail" },
  "list.toolbar.search.scope": { th: "ขอบเขตการค้นหา", en: "Search scope" },
  "list.toolbar.search.scope.all": { th: "ทั้งหมด", en: "All mail" },
  "list.toolbar.search.scope.box": { th: "กล่องนี้", en: "This folder" },
  "list.toolbar.compose.title": { th: "เขียนอีเมลใหม่ (c)", en: "New email (c)" },
  "list.toolbar.compose": { th: "เขียน", en: "Compose" },
  "list.toolbar.selectAll": { th: "เลือกทั้งหมดในรายการ", en: "Select all in list" },
  "list.toolbar.deselectAll": { th: "ยกเลิกการเลือกทั้งหมด", en: "Deselect all" },
  "list.toolbar.emptyBox.title": {
    th: "ล้างกล่องนี้ (ลบถาวร)",
    en: "Empty this folder (permanent)",
  },
  "list.toolbar.emptyBox": { th: "ล้างกล่องนี้", en: "Empty this folder" },
  "list.toolbar.refresh": { th: "รีเฟรช", en: "Refresh" },
  "list.toolbar.pane.hide.title": {
    th: "ซ่อนบานอ่าน (ดูเป็นรายการ)",
    en: "Hide reading pane (list view)",
  },
  "list.toolbar.pane.show.title": {
    th: "แสดงบานอ่านคู่รายการ",
    en: "Show reading pane beside the list",
  },
  "list.toolbar.pane.hide": { th: "ซ่อนบานอ่าน", en: "Hide reading pane" },
  "list.toolbar.pane.show": { th: "แสดงบานอ่าน", en: "Show reading pane" },
  "list.toolbar.filters": { th: "ตัวกรอง", en: "Filters" },
  "list.toolbar.shortcuts.title": { th: "ตารางคีย์ลัด (?)", en: "Keyboard shortcuts (?)" },
  "list.toolbar.shortcuts": { th: "ตารางคีย์ลัด", en: "Keyboard shortcuts" },
  "list.toolbar.filter.read": { th: "สถานะการอ่าน", en: "Read status" },
  "list.toolbar.filter.read.all": { th: "ทั้งหมด", en: "All" },
  "list.toolbar.filter.read.unread": { th: "ยังไม่ได้อ่าน", en: "Unread" },
  "list.toolbar.filter.attachment": { th: "ไฟล์แนบ", en: "Attachments" },
  "list.toolbar.filter.attachment.any": { th: "ทุกฉบับ", en: "Any" },
  "list.toolbar.filter.attachment.with": { th: "มีไฟล์แนบ", en: "With attachments" },
  "list.toolbar.filter.clear": { th: "ล้างตัวกรอง", en: "Clear filters" },
});
