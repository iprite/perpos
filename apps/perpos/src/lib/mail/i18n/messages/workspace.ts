import { defineMailMessages } from "../define";

/** พจนานุกรมพื้นที่ `workspace` (หน้ารายการ+บานอ่าน `/`) — คีย์ต้องขึ้นต้นด้วย `workspace.` */
export const workspace = defineMailMessages({
  // หน้า SSR (ยังไม่ได้ตั้งค่า / ป้ายชั่วคราวของโฟลเดอร์)
  "workspace.setup.title": { th: "ยังไม่ได้ตั้งค่าระบบอีเมล", en: "Email is not set up yet" },
  "workspace.setup.desc": {
    th: "ผู้ดูแลระบบต้องตั้งค่าการเชื่อมต่อเซิร์ฟเวอร์อีเมลก่อนจึงจะใช้งานหน้านี้ได้",
    en: "An administrator must configure the mail server connection before this page can be used",
  },
  "workspace.folder": { th: "โฟลเดอร์", en: "Folder" },

  // ข้อผิดพลาดกลาง
  "workspace.error.generic": {
    th: "ระบบอีเมลไม่ตอบสนอง ลองใหม่อีกครั้ง",
    en: "The mail server is not responding. Please try again.",
  },

  // จำนวนฉบับ — ไทยไม่มีพหูพจน์ ทั้งสองคีย์เท่ากัน · อังกฤษแยก 1 / หลาย
  "workspace.count.one": { th: "{count} ฉบับ", en: "{count} message" },
  "workspace.count.many": { th: "{count} ฉบับ", en: "{count} messages" },

  // คิวลบ/เก็บ + เลิกทำ
  "workspace.action.archived": { th: "เก็บเข้าคลังแล้ว", en: "Archived" },
  "workspace.action.trashed": { th: "ย้ายไปถังขยะแล้ว", en: "Moved to trash" },
  "workspace.undo.message": { th: "{action} {n}", en: "{action} {n}" },
  "workspace.flush.failed": {
    th: "ทำรายการไม่สำเร็จ อีเมลถูกคืนกลับรายการแล้ว",
    en: "Action failed — the emails were put back in the list",
  },

  // ส่งเมล
  "workspace.send.sentNotMoved": {
    th: "ส่งแล้ว (แต่ยังไม่ได้ย้ายเข้ากล่องส่งแล้ว)",
    en: "Sent (but not yet moved to the Sent folder)",
  },
  "workspace.send.sent": { th: "ส่งอีเมลแล้ว", en: "Email sent" },
  "workspace.send.failed": {
    th: "ส่งไม่สำเร็จ — เปิดกล่องเขียนกลับมาให้แล้ว",
    en: "Sending failed — the compose window has been reopened",
  },
  "workspace.send.to": { th: "ส่งถึง {to}{more}", en: "Sending to {to}{more}" },
  "workspace.send.tooLate": {
    th: "ส่งออกไปแล้ว ยกเลิกไม่ทัน",
    en: "Already sent — too late to cancel",
  },

  // ฉบับร่าง
  "workspace.draft.openFailed": { th: "เปิดร่างไม่สำเร็จ", en: "Could not open the draft" },

  // ย้ายโฟลเดอร์ / สแปม
  "workspace.move.done": { th: "ย้ายไป “{label}” แล้ว", en: "Moved to “{label}”" },
  "workspace.move.failed": { th: "ย้ายอีเมลไม่สำเร็จ", en: "Could not move the email" },
  "workspace.spam.marked": { th: "ย้ายไปจดหมายขยะแล้ว", en: "Moved to Junk" },
  "workspace.spam.unmarked": { th: "ย้ายกลับกล่องขาเข้าแล้ว", en: "Moved back to Inbox" },

  // ล้างถังขยะ / จดหมายขยะ
  "workspace.empty.partialFail": {
    th: "ลบถาวรไปแล้ว {n} แล้วเจอปัญหา",
    en: "Permanently deleted {n}, then ran into a problem",
  },
  "workspace.empty.failed": { th: "ล้างกล่องไม่สำเร็จ", en: "Could not empty the folder" },
  "workspace.empty.nothing": { th: "ไม่มีอะไรให้ลบ", en: "Nothing to delete" },
  "workspace.empty.doneRemaining": {
    th: "ลบถาวรแล้ว {n} · เหลืออีก {left} กดล้างอีกครั้งได้",
    en: "Permanently deleted {n} · {left} left — empty again to continue",
  },
  "workspace.empty.done": { th: "ลบถาวรแล้ว {n}", en: "Permanently deleted {n}" },
  "workspace.empty.blocked": {
    th: "ล้างกล่องระหว่างใช้ตัวกรอง/ค้นหาไม่ได้ — ล้างตัวกรองก่อน",
    en: "Can't empty the folder while a filter or search is active — clear them first",
  },
  "workspace.empty.titleJunk": { th: "ล้างจดหมายขยะ", en: "Empty Junk" },
  "workspace.empty.titleTrash": { th: "ล้างถังขยะ", en: "Empty Trash" },
  "workspace.empty.desc": {
    th: "เมลทั้งหมดในกล่องนี้จะถูกลบถาวร — กู้คืนไม่ได้",
    en: "All emails in this folder will be permanently deleted — this cannot be undone",
  },
  "workspace.empty.descCount": {
    th: "เมลทั้งหมดในกล่องนี้ ({n}) จะถูกลบถาวร — กู้คืนไม่ได้",
    en: "All emails in this folder ({n}) will be permanently deleted — this cannot be undone",
  },
  "workspace.empty.deleting": { th: "กำลังลบ…", en: "Deleting…" },
  "workspace.empty.confirm": { th: "ลบถาวร", en: "Delete permanently" },

  // ตัวแบ่งลากได้
  "workspace.divider.aria": { th: "ปรับความกว้างคอลัมน์รายการ", en: "Resize the list column" },
  "workspace.divider.title": {
    th: "ลากเพื่อปรับความกว้าง (ดับเบิลคลิก = ค่าเริ่มต้น)",
    en: "Drag to resize (double-click to reset)",
  },

  // ปุ่ม FAB + แถบเลือกหลายฉบับ
  "workspace.compose": { th: "เขียนอีเมลใหม่", en: "New email" },
  "workspace.bulk.markRead": { th: "ทำเป็นอ่านแล้ว", en: "Mark as read" },
  "workspace.bulk.move": { th: "ย้ายไป", en: "Move to" },
  "workspace.bulk.archive": { th: "เก็บเข้าคลัง", en: "Archive" },
});
