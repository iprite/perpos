import { defineMailMessages } from "../define";

/** พจนานุกรมพื้นที่ `shell` (เปลือก · rail · เมนูบัญชี · จัดการโฟลเดอร์ · คีย์ลัด) — คีย์ต้องขึ้นต้นด้วย `shell.` */
export const shell = defineMailMessages({
  // ── เมนูบัญชี (topbar) ──
  "shell.account.myAccount": { th: "บัญชีของฉัน", en: "My account" },
  "shell.account.connectedMailbox": { th: "กล่องเมลที่เชื่อมอยู่", en: "Connected mailbox" },
  "shell.account.signOutNotePrefix": {
    th: "การออกจากระบบจะลบสิทธิ์เข้าถึงกล่องเมล ",
    en: "Signing out removes access to this mailbox ",
  },
  "shell.account.signOutNoteDevice": { th: "บนอุปกรณ์นี้", en: "on this device" },
  "shell.account.signOutNoteSuffix": { th: " เท่านั้น", en: " only" },
  "shell.account.signOut": { th: "ออกจากระบบ", en: "Sign out" },
  "shell.account.signingOut": { th: "กำลังออกจากระบบ…", en: "Signing out…" },

  // ── rail ──
  "shell.rail.aria": { th: "กล่องเมล", en: "Mailboxes" },
  "shell.rail.folders": { th: "โฟลเดอร์", en: "Folders" },
  "shell.rail.manageFolders": { th: "จัดการโฟลเดอร์", en: "Manage folders" },
  "shell.rail.rules": { th: "กฎกรอง", en: "Filters" },

  // ── จัดการโฟลเดอร์ ──
  "shell.folders.title": { th: "จัดการโฟลเดอร์", en: "Manage folders" },
  "shell.folders.apiFailed": { th: "ทำรายการไม่สำเร็จ", en: "The action could not be completed" },
  "shell.folders.create.section": { th: "สร้างโฟลเดอร์ใหม่", en: "New folder" },
  "shell.folders.create.name": { th: "ชื่อโฟลเดอร์ *", en: "Folder name *" },
  "shell.folders.create.namePlaceholder": {
    th: "เช่น ลูกค้า, ใบแจ้งหนี้",
    en: "e.g. Customers, Invoices",
  },
  "shell.folders.create.parent": { th: "อยู่ใต้โฟลเดอร์", en: "Inside folder" },
  "shell.folders.create.parentTop": { th: "— ระดับบนสุด —", en: "— Top level —" },
  "shell.folders.create.submit": { th: "สร้างโฟลเดอร์", en: "Create folder" },
  "shell.folders.created": { th: "สร้างโฟลเดอร์แล้ว", en: "Folder created" },
  "shell.folders.createFailed": { th: "สร้างโฟลเดอร์ไม่สำเร็จ", en: "Could not create folder" },
  "shell.folders.renamed": { th: "เปลี่ยนชื่อโฟลเดอร์แล้ว", en: "Folder renamed" },
  "shell.folders.renameFailed": { th: "เปลี่ยนชื่อไม่สำเร็จ", en: "Could not rename" },
  "shell.folders.deleted": { th: "ลบโฟลเดอร์แล้ว", en: "Folder deleted" },
  "shell.folders.deleteFailed": { th: "ลบโฟลเดอร์ไม่สำเร็จ", en: "Could not delete folder" },
  "shell.folders.mine": { th: "โฟลเดอร์ของฉัน", en: "My folders" },
  "shell.folders.empty": {
    th: "ยังไม่มีโฟลเดอร์ — สร้างอันแรกจากช่องด้านบน",
    en: "No folders yet — create your first one above",
  },
  "shell.folders.count": { th: "{count} ฉบับ", en: "{count} messages" },
  "shell.folders.renameAria": { th: "เปลี่ยนชื่อ {name}", en: "Rename {name}" },
  "shell.folders.deleteAria": { th: "ลบ {name}", en: "Delete {name}" },
  "shell.folders.hint": {
    th: "ลบได้เฉพาะโฟลเดอร์ที่ไม่มีอีเมลและไม่มีโฟลเดอร์ย่อยเหลืออยู่ · ซ้อนได้ลึกสุด {max} ชั้น",
    en: "Only empty folders with no subfolders can be deleted · nest up to {max} levels deep",
  },

  // ── คีย์ลัด ──
  "shell.shortcuts.title": { th: "คีย์ลัด", en: "Keyboard shortcuts" },
  "shell.shortcuts.hint": {
    th: "คีย์ลัดจะถูกปิดอัตโนมัติเมื่อกำลังพิมพ์อยู่ในช่องค้นหาหรือช่องกรอกข้อความ",
    en: "Shortcuts are disabled automatically while typing in the search box or a text field",
  },
  "shell.shortcuts.scope.global": { th: "ทั่วไป", en: "General" },
  "shell.shortcuts.scope.list": { th: "รายการเมล", en: "Message list" },
  "shell.shortcuts.scope.reader": { th: "บานอ่าน", en: "Reading pane" },
});
