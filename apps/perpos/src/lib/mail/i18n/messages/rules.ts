import { defineMailMessages } from "../define";

/** พจนานุกรมพื้นที่ `rules` (หน้ากฎกรอง + กล่อง "สร้างกฎกรองจากเมลนี้") — คีย์ต้องขึ้นต้นด้วย `rules.` */
export const rules = defineMailMessages({
  // ── หน้า /rules ──
  "rules.title": { th: "กฎกรอง", en: "Filter rules" },
  "rules.subtitle": {
    th: "จัดการอีเมลที่เข้ามาใหม่โดยอัตโนมัติ — ตรวจจากบนลงล่าง",
    en: "Handle incoming email automatically — checked from top to bottom",
  },
  "rules.defaultName": { th: "กฎที่ {n}", en: "Rule {n}" },
  "rules.load.failed": { th: "โหลดกฎกรองไม่สำเร็จ", en: "Could not load filter rules" },
  "rules.target.none": { th: "— ไม่ย้าย —", en: "— Do not move —" },
  "rules.validation.emptyCondition": {
    th: "“{name}” ยังไม่ได้กรอกเงื่อนไข",
    en: "“{name}” has no condition filled in",
  },
  "rules.save.foreignExists": { th: "มีกฎกรองเดิมอยู่", en: "Existing filter rules found" },
  "rules.save.failed": { th: "บันทึกกฎกรองไม่สำเร็จ", en: "Could not save filter rules" },
  "rules.save.done": { th: "บันทึกกฎกรองแล้ว", en: "Filter rules saved" },
  "rules.collapseAll": { th: "ยุบทั้งหมด", en: "Collapse all" },
  "rules.expandAll": { th: "กางทั้งหมด", en: "Expand all" },
  "rules.add": { th: "เพิ่มกฎ", en: "Add rule" },
  "rules.foreign.warning.before": {
    th: "กล่องเมลนี้มีกฎกรองเดิมที่ตั้งไว้จากที่อื่น (ไม่ได้สร้างจากหน้านี้) — กดบันทึกจะ",
    en: "This mailbox has filter rules set up elsewhere (not from this page) — saving will ",
  },
  "rules.foreign.warning.strong": { th: "เขียนทับทั้งหมด", en: "overwrite all of them" },
  "rules.foreign.warning.after": {
    th: " กรุณาตรวจกับผู้ดูแลก่อนถ้าไม่แน่ใจ",
    en: ". Check with your administrator first if unsure.",
  },
  "rules.empty.title": { th: "ยังไม่มีกฎกรอง", en: "No filter rules yet" },
  "rules.empty.example": {
    th: "เช่น “ถ้าผู้ส่งมีคำว่า invoice ให้ย้ายไปโฟลเดอร์ ใบแจ้งหนี้”",
    en: "e.g. “If the sender contains invoice, move it to the folder Invoices”",
  },
  "rules.empty.addFirst": { th: "เพิ่มกฎแรก", en: "Add first rule" },
  "rules.footer.before": {
    th: "กฎถูกตรวจจากบนลงล่าง · เมลที่ไม่ตรงกฎไหนเลยจะเข้ากล่องขาเข้าตามปกติ · กฎมีผลกับอีเมลที่เข้ามา",
    en: "Rules are checked from top to bottom · email matching no rule goes to Inbox as usual · rules apply only to email arriving ",
  },
  "rules.footer.strong": { th: "หลังบันทึก", en: "after saving" },
  "rules.footer.after": { th: "เท่านั้น (ไม่ย้อนหลัง)", en: " (not retroactive)" },

  // ── การ์ดกฎ ──
  "rules.card.collapse": { th: "ยุบกฎนี้", en: "Collapse this rule" },
  "rules.card.expand": { th: "กางกฎนี้", en: "Expand this rule" },
  "rules.card.name": { th: "ชื่อกฎ", en: "Rule name" },
  "rules.card.enabledAria": { th: "เปิดใช้งานกฎนี้", en: "Enable this rule" },
  "rules.on": { th: "เปิด", en: "On" },
  "rules.off": { th: "ปิด", en: "Off" },
  "rules.card.moveUp": { th: "เลื่อนขึ้น", en: "Move up" },
  "rules.card.moveDown": { th: "เลื่อนลง", en: "Move down" },
  "rules.card.remove": { th: "ลบกฎ", en: "Delete rule" },
  "rules.if": { th: "ถ้า", en: "If" },
  "rules.match.aria": { th: "เงื่อนไขต้องตรงแบบไหน", en: "How conditions must match" },
  "rules.match.all": { th: "ตรงทุกข้อ", en: "all conditions match" },
  "rules.match.any": { th: "ตรงข้อใดข้อหนึ่ง", en: "any condition matches" },
  "rules.condition.placeholder": { th: "เช่น @exworker.co.th", en: "e.g. @exworker.co.th" },
  "rules.condition.valueAria": { th: "ค่าที่ใช้เทียบ", en: "Value to match" },
  "rules.condition.remove": { th: "เอาเงื่อนไขนี้ออก", en: "Remove this condition" },
  "rules.condition.add": { th: "เพิ่มเงื่อนไข", en: "Add condition" },
  "rules.then": { th: "ให้", en: "Then" },
  "rules.action.moveTo": { th: "ย้ายไป", en: "Move to" },
  "rules.action.markRead": { th: "ทำเป็นอ่านแล้ว", en: "Mark as read" },
  "rules.action.star": { th: "ติดดาว", en: "Star" },
  "rules.action.stop": { th: "หยุดตรวจกฎถัดไป", en: "Stop checking further rules" },
  "rules.yes": { th: "ใช่", en: "Yes" },
  "rules.no": { th: "ไม่", en: "No" },

  // ── สรุปกฎบรรทัดเดียว (ตอนยุบ) ──
  "rules.summary.and": { th: " และ ", en: " and " },
  "rules.summary.or": { th: " หรือ ", en: " or " },
  "rules.summary.condition": { th: "{field}{op}“{value}”", en: "{field} {op} “{value}”" },
  "rules.summary.moveTo": { th: "ย้ายไป {target}", en: "Move to {target}" },
  "rules.summary.selectedFolder": { th: "โฟลเดอร์ที่เลือก", en: "the selected folder" },
  "rules.summary.noCondition": { th: "ยังไม่ได้กรอกเงื่อนไข", en: "No condition filled in" },
  "rules.summary.noAction": { th: "ไม่ทำอะไร", en: "do nothing" },
  "rules.summary.line": { th: "ถ้า {conditions} → {actions}", en: "If {conditions} → {actions}" },

  // ── กล่อง "สร้างกฎกรองจากเมลนี้" ──
  "rules.dialog.title": { th: "สร้างกฎกรองจากเมลนี้", en: "Create a filter rule from this email" },
  "rules.dialog.readFailed": {
    th: "อ่านกฎกรองเดิมไม่สำเร็จ",
    en: "Could not read existing filter rules",
  },
  "rules.dialog.foreign": {
    th: "กล่องเมลนี้มีกฎกรองเดิมจากที่อื่น — เปิดหน้า “กฎกรอง” เพื่อยืนยันก่อน",
    en: "This mailbox has filter rules set up elsewhere — open the “Filter rules” page to confirm first",
  },
  "rules.dialog.maxReached": {
    th: "มีกฎครบ {max} ข้อแล้ว — ลบของเดิมก่อน",
    en: "Already at the limit of {max} rules — delete one first",
  },
  "rules.dialog.subjectEmpty": {
    th: "เปิดเงื่อนไขหัวเรื่องไว้ แต่ยังไม่ได้กรอกคำ",
    en: "The subject condition is on but no text was entered",
  },
  "rules.dialog.created": {
    th: "สร้างกฎกรองแล้ว — มีผลกับเมลที่เข้ามาใหม่",
    en: "Filter rule created — applies to new incoming email",
  },
  "rules.dialog.applyFailedFirst": {
    th: "สร้างกฎแล้ว แต่ใช้กับเมลเดิมไม่สำเร็จ",
    en: "Rule created, but it could not be applied to existing email",
  },
  "rules.dialog.applyFailedPartial": {
    th: "จัดการไปแล้ว {done} ฉบับ แล้วเจอปัญหา — กดสร้างกฎซ้ำเพื่อทำต่อได้",
    en: "Processed {done} messages, then hit a problem — create the rule again to continue",
  },
  "rules.dialog.createdNoMatch": {
    th: "สร้างกฎกรองแล้ว — ไม่พบเมลเดิมที่ตรงเงื่อนไข",
    en: "Filter rule created — no existing email matched",
  },
  "rules.dialog.appliedDone": {
    th: "จัดการเมลเดิมแล้ว {done} ฉบับ",
    en: "Processed {done} existing messages",
  },
  "rules.dialog.appliedLeft": { th: " · เหลืออีก {left}", en: " · {left} left" },
  "rules.dialog.undoFailed": {
    th: "เลิกทำไม่สำเร็จทั้งหมด — บางฉบับยังอยู่ที่ใหม่",
    en: "Could not undo everything — some messages remain in their new location",
  },
  "rules.dialog.createFailed": { th: "สร้างกฎกรองไม่สำเร็จ", en: "Could not create filter rule" },
  "rules.dialog.conditionsHeader": {
    th: "เงื่อนไข — ต้องตรงทุกข้อที่เปิดไว้",
    en: "Conditions — every enabled one must match",
  },
  "rules.dialog.senderContains": { th: "ผู้ส่งมีคำว่า", en: "Sender contains" },
  "rules.dialog.always": { th: "เสมอ", en: "Always" },
  "rules.dialog.subjectContains": { th: "หัวเรื่องมีคำว่า", en: "Subject contains" },
  "rules.dialog.useSubjectAria": {
    th: "ใช้เงื่อนไขหัวเรื่องด้วย",
    en: "Also use the subject condition",
  },
  "rules.dialog.subjectPlaceholder": {
    th: "คำที่มีในหัวเรื่องทุกฉบับ",
    en: "Words that appear in every subject",
  },
  "rules.dialog.moveTo": { th: "ย้ายไปที่", en: "Move to" },
  "rules.dialog.markReadAuto": { th: "ทำเป็นอ่านแล้วอัตโนมัติ", en: "Mark as read automatically" },
  "rules.dialog.applyExisting": {
    th: "ใช้กับเมลเดิมในกล่องขาเข้าด้วย",
    en: "Also apply to existing email in Inbox",
  },
  "rules.dialog.applyExistingAria": { th: "ใช้กับเมลเดิมด้วย", en: "Also apply to existing email" },
  "rules.dialog.counting": { th: "กำลังนับ…", en: "Counting…" },
  "rules.dialog.newOnly": {
    th: "กฎมีผลกับอีเมลที่เข้ามาหลังจากนี้เท่านั้น",
    en: "The rule applies only to email arriving from now on",
  },
  "rules.dialog.noMatch": { th: "ไม่พบเมลเดิมที่ตรงเงื่อนไข", en: "No existing email matches" },
  "rules.dialog.found": { th: "พบ {count} ฉบับ", en: "{count} messages found" },
  "rules.dialog.foundBatched": {
    th: " — ทยอยทำเป็นก้อนละ {limit} จนครบ",
    en: " — processed in batches of {limit} until done",
  },
  "rules.dialog.noActionWarning": {
    th: "กฎนี้ยังไม่มีการกระทำ (ไม่ย้าย/ไม่ทำเป็นอ่านแล้ว) จึงไม่มีอะไรทำกับเมลเดิม",
    en: "This rule has no action (no move / no mark as read), so there is nothing to do with existing email",
  },
  "rules.dialog.moreAt": {
    th: "แก้ไขเพิ่มเติม (เงื่อนไขหลายข้อ, ลำดับการตรวจ) ได้ที่หน้า",
    en: "For more options (multiple conditions, check order), go to",
  },
  "rules.dialog.progress": { th: "จัดการแล้ว {done} ฉบับ", en: "Processed {done}" },
  "rules.dialog.progressLeft": { th: " · เหลือ {left}", en: " · {left} left" },
  "rules.dialog.stop": { th: "หยุด", en: "Stop" },
  "rules.dialog.create": { th: "สร้างกฎ", en: "Create rule" },
  "rules.dialog.applying": { th: "กำลังจัดการ…", en: "Processing…" },
});
