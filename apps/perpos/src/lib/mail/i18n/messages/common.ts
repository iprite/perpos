import { defineMailMessages } from "../define";

/** คำที่ใช้ซ้ำทั่วเว็บเมล — คีย์ขึ้นต้นด้วย `common.` */
export const common = defineMailMessages({
  "common.save": { th: "บันทึก", en: "Save" },
  "common.saving": { th: "กำลังบันทึก…", en: "Saving…" },
  "common.cancel": { th: "ยกเลิก", en: "Cancel" },
  "common.close": { th: "ปิด", en: "Close" },
  "common.delete": { th: "ลบ", en: "Delete" },
  "common.confirm": { th: "ยืนยัน", en: "Confirm" },
  "common.back": { th: "กลับ", en: "Back" },
  "common.retry": { th: "ลองใหม่", en: "Retry" },
  "common.loading": { th: "กำลังโหลด…", en: "Loading…" },
  "common.undo": { th: "เลิกทำ", en: "Undo" },
  "common.error.generic": {
    th: "เกิดข้อผิดพลาด ลองใหม่อีกครั้ง",
    en: "Something went wrong. Please try again.",
  },
  "common.error.network": { th: "เชื่อมต่อเซิร์ฟเวอร์ไม่ได้", en: "Could not reach the server" },
  "common.language": { th: "ภาษา", en: "Language" },
  "common.language.th": { th: "ไทย", en: "Thai" },
  "common.language.en": { th: "อังกฤษ", en: "English" },
});
