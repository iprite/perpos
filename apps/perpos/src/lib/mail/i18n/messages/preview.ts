import { defineMailMessages } from "../define";

/** พจนานุกรมพื้นที่ `preview` (กล่องดูตัวอย่างไฟล์แนบ / PDF) — คีย์ต้องขึ้นต้นด้วย `preview.` */
export const preview = defineMailMessages({
  "preview.unsupported.title": {
    th: "ไฟล์ชนิดนี้ดูตัวอย่างในเว็บไม่ได้",
    en: "This file type can't be previewed in the browser",
  },
  "preview.unsupported.desc": {
    th: "{type} · {size} — ดาวน์โหลดแล้วเปิดด้วยโปรแกรมในเครื่อง",
    en: "{type} · {size} — download it and open with an app on your device",
  },
  "preview.unknownType": { th: "ไม่ทราบชนิดไฟล์", en: "Unknown file type" },
  "preview.download": { th: "ดาวน์โหลด", en: "Download" },
  "preview.pdf.pageLabel": {
    th: "{label} หน้า {page} จาก {pages}",
    en: "{label} page {page} of {pages}",
  },
  "preview.pdf.prev": { th: "หน้าก่อนหน้า", en: "Previous page" },
  "preview.pdf.next": { th: "หน้าถัดไป", en: "Next page" },
});
