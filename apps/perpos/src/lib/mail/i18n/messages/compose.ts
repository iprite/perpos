import { defineMailMessages } from "../define";

/** พจนานุกรมพื้นที่ `compose` (กล่องเขียนเมล + ช่องผู้รับ) — คีย์ต้องขึ้นต้นด้วย `compose.` */
export const compose = defineMailMessages({
  "compose.title.new": { th: "เขียนอีเมล", en: "New email" },
  "compose.title.reply": { th: "ตอบอีเมล", en: "Reply" },

  "compose.field.from": { th: "จาก", en: "From" },
  "compose.field.to": { th: "ถึง *", en: "To *" },
  /** ป้ายในแถวแบบมือถือ (Gmail style) — ไม่มีดอกจัน เพราะเป็นแถวไม่ใช่ฟอร์มมีป้ายกำกับ */
  "compose.field.toShort": { th: "ถึง", en: "To" },
  "compose.field.ccBccToggle": { th: "สำเนา / สำเนาลับ", en: "Cc / Bcc" },
  "compose.field.cc": { th: "สำเนา", en: "Cc" },
  "compose.field.bcc": { th: "สำเนาลับ", en: "Bcc" },
  "compose.field.subject": { th: "หัวเรื่อง", en: "Subject" },
  "compose.field.body": { th: "เนื้อหา", en: "Message" },
  "compose.to.placeholder": {
    th: "name@example.com — พิมพ์แล้วกด Enter",
    en: "name@example.com — type and press Enter",
  },
  "compose.body.placeholder": { th: "พิมพ์ข้อความ…", en: "Write your message…" },

  "compose.attachment.remove": { th: "เอา {name} ออก", en: "Remove {name}" },
  "compose.attachment.failed": {
    th: 'แนบไฟล์ "{name}" ไม่สำเร็จ',
    en: 'Could not attach "{name}"',
  },
  "compose.attachment.uploading": {
    th: "กำลังอัปโหลด {count} ไฟล์…",
    en: "Uploading {count} file(s)…",
  },
  "compose.attachment.hint": {
    th: "ลากไฟล์มาวางได้ · รวมกันไม่เกิน 25 MB",
    en: "Drag files here · 25 MB total",
  },

  "compose.attachment.tooLarge": {
    th: 'ไฟล์ "{name}" ใหญ่เกิน {limit} MB',
    en: '"{name}" is larger than {limit} MB',
  },

  "compose.error.noRecipient": { th: "ยังไม่ได้ใส่ผู้รับ", en: "Add at least one recipient" },
  "compose.error.badAddress": {
    th: "ที่อยู่อีเมลไม่ถูกต้อง: {list}",
    en: "Invalid email address: {list}",
  },
  "compose.error.tooLarge": {
    th: "ไฟล์แนบรวมกันเกิน 25 MB",
    en: "Attachments exceed 25 MB in total",
  },
  "compose.error.uploading": {
    th: "รอไฟล์แนบอัปโหลดให้เสร็จก่อน",
    en: "Wait for attachments to finish uploading",
  },
  "compose.error.draftNotSaved": {
    th: "ยังบันทึกร่างไม่ได้ — ปิดตอนนี้ข้อความจะหาย ลองใหม่อีกครั้ง",
    en: "Draft could not be saved — closing now would lose your message. Please try again.",
  },

  "compose.draft.kept": { th: "เก็บเป็นร่างแล้ว", en: "Saved as draft" },
  "compose.draft.saving": { th: "กำลังบันทึกร่าง…", en: "Saving draft…" },
  "compose.draft.saved": { th: "✓ บันทึกร่างแล้ว {time}", en: "✓ Draft saved {time}" },
  "compose.draft.failed": { th: "⚠ บันทึกร่างไม่สำเร็จ", en: "⚠ Draft not saved" },
  "compose.action.keepDraft": { th: "เก็บเป็นร่าง", en: "Save draft" },
  "compose.action.close": { th: "ปิด (เก็บเป็นร่าง)", en: "Close (saves draft)" },
  "compose.action.attach": { th: "แนบไฟล์", en: "Attach files" },
  "compose.action.send": { th: "ส่ง", en: "Send" },
  "compose.action.sending": { th: "กำลังส่ง…", en: "Sending…" },

  "compose.recipient.invalid": { th: "ที่อยู่อีเมลไม่ถูกต้อง", en: "Invalid email address" },
  "compose.recipient.remove": { th: "เอา {address} ออก", en: "Remove {address}" },
});
