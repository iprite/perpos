/**
 * คีย์ลัดของหน้าอีเมล — ประกาศเป็น "ข้อมูลชุดเดียว" (registry-as-data)
 *
 * เครดิต (MIT): แนวคิด registry-as-data ของคีย์ลัดอ้างอิงจาก Mail-0/Zero
 * (https://github.com/Mail-0/Zero) — เป็นแนวคิด/คอนฟิก **ไม่ได้คัดลอกโค้ด**
 * ⚠️ จุดที่เราตั้งใจทำต่างจากเขา: `g i` ต้องเป็น sequence `'g>i'` (syntax ของ
 * react-hotkeys-hook v5) ไม่ใช่ `['g','i']` ซึ่งกลายเป็น "กด g+i พร้อมกัน"
 *
 * ไฟล์นี้ถูกใช้ **ทั้ง** ผูก handler **และ** เรนเดอร์ตารางคีย์ลัด (`?`) → ไม่มีทางหลุด sync
 * มีเฉพาะคีย์ที่ทำงานจริงเสมอ — เพิ่มคีย์ใหม่ต้องมี handler พร้อมกัน ห้ามใส่ปุ่มที่กดแล้วเงียบ
 */

export type MailShortcutAction =
  | "next"
  | "prev"
  | "open"
  | "close"
  | "selectToggle"
  | "archive"
  | "trash"
  | "star"
  | "markUnread"
  | "search"
  | "help"
  | "gotoInbox"
  // M2 — เขียน/ตอบ/ส่งต่อ
  | "compose"
  | "reply"
  | "replyAll"
  | "forward";

export type MailShortcutScope = "global" | "list" | "reader";

export interface MailShortcut {
  /** สตริงที่ส่งให้ react-hotkeys-hook (v5) */
  keys: string;
  scope: MailShortcutScope;
  action: MailShortcutAction;
  /** ป้ายภาษาไทยในตารางคีย์ลัด */
  label: string;
  /** คำอธิบายภาษาอังกฤษ (ตาราง `?` เลือกตามภาษาผู้ใช้) */
  labelEn: string;
  /** โทเคนของปุ่มสำหรับเรนเดอร์ (แปลงตาม OS ด้วย formatDisplayKeys) */
  display: string[];
}

export const MAIL_SHORTCUTS: readonly MailShortcut[] = [
  {
    keys: "j",
    scope: "list",
    action: "next",
    label: "ลง (ฉบับถัดไป)",
    labelEn: "Down (next message)",
    display: ["j"],
  },
  {
    keys: "k",
    scope: "list",
    action: "prev",
    label: "ขึ้น (ฉบับก่อนหน้า)",
    labelEn: "Up (previous message)",
    display: ["k"],
  },
  {
    keys: "enter",
    scope: "list",
    action: "open",
    label: "เปิดเมล",
    labelEn: "Open message",
    display: ["enter"],
  },
  {
    keys: "escape",
    scope: "global",
    action: "close",
    label: "ปิด / กลับรายการ",
    labelEn: "Close / back to list",
    display: ["escape"],
  },
  {
    keys: "x",
    scope: "list",
    action: "selectToggle",
    label: "เลือก / ไม่เลือก",
    labelEn: "Select / deselect",
    display: ["x"],
  },
  {
    keys: "e",
    scope: "global",
    action: "archive",
    label: "เก็บเข้าคลัง",
    labelEn: "Archive",
    display: ["e"],
  },
  {
    keys: "shift+3",
    scope: "global",
    action: "trash",
    label: "ลบ",
    labelEn: "Delete",
    display: ["#"],
  },
  { keys: "s", scope: "global", action: "star", label: "ติดดาว", labelEn: "Star", display: ["s"] },
  {
    keys: "u",
    scope: "global",
    action: "markUnread",
    label: "ทำเป็นยังไม่อ่าน",
    labelEn: "Mark as unread",
    display: ["u"],
  },
  {
    keys: "slash",
    scope: "global",
    action: "search",
    label: "ค้นหา",
    labelEn: "Search",
    display: ["/"],
  },
  {
    keys: "shift+slash",
    scope: "global",
    action: "help",
    label: "ตารางคีย์ลัด",
    labelEn: "Keyboard shortcuts",
    display: ["?"],
  },
  {
    keys: "c",
    scope: "global",
    action: "compose",
    label: "เขียนอีเมลใหม่",
    labelEn: "Compose",
    display: ["c"],
  },
  { keys: "r", scope: "reader", action: "reply", label: "ตอบ", labelEn: "Reply", display: ["r"] },
  {
    keys: "a",
    scope: "reader",
    action: "replyAll",
    label: "ตอบทั้งหมด",
    labelEn: "Reply all",
    display: ["a"],
  },
  {
    keys: "f",
    scope: "reader",
    action: "forward",
    label: "ส่งต่อ",
    labelEn: "Forward",
    display: ["f"],
  },
  {
    keys: "g>i",
    scope: "global",
    action: "gotoInbox",
    label: "ไปกล่องขาเข้า",
    labelEn: "Go to inbox",
    display: ["g", "i"],
  },
] as const;

/** ลำดับสำหรับเรนเดอร์ตาราง `?` — มาจาก registry ตัวเดียวกับที่ผูก handler */
export function mailShortcutRows(): readonly MailShortcut[] {
  return MAIL_SHORTCUTS;
}

export type MailKeyPlatform = "mac" | "win";

const MAC_SYMBOLS: Record<string, string> = {
  mod: "⌘",
  meta: "⌘",
  ctrl: "⌃",
  shift: "⇧",
  alt: "⌥",
  enter: "↵",
  backspace: "⌫",
  escape: "Esc",
};

const WIN_SYMBOLS: Record<string, string> = {
  mod: "Ctrl",
  meta: "Ctrl",
  ctrl: "Ctrl",
  shift: "Shift",
  alt: "Alt",
  enter: "Enter",
  backspace: "Backspace",
  escape: "Esc",
};

/** แปลงโทเคนปุ่มให้ตรงกับระบบปฏิบัติการ (mac → ⌘ ⇧ ↵ ⌫ · win → Ctrl Shift Enter Backspace) */
export function formatDisplayKeys(tokens: readonly string[], platform: MailKeyPlatform): string[] {
  const table = platform === "mac" ? MAC_SYMBOLS : WIN_SYMBOLS;
  return tokens.map((t) => table[t.toLowerCase()] ?? t);
}

/** ตรวจจาก userAgent ฝั่ง client (ไม่มี = ถือเป็น win) */
export function detectKeyPlatform(userAgent: string | undefined): MailKeyPlatform {
  return (userAgent ?? "").toLowerCase().includes("mac") ? "mac" : "win";
}

/**
 * ปิดคีย์ลัดเมื่อโฟกัสอยู่ในช่องพิมพ์ (input/textarea/select/contenteditable)
 * — react-hotkeys-hook v5 กันให้อยู่แล้ว แต่แยกออกมาเป็นฟังก์ชันเพื่อ "มีเทสยืนยัน"
 */
export function shouldFireShortcut(
  target: {
    tagName?: string;
    isContentEditable?: boolean;
  } | null,
): boolean {
  if (!target) return true;
  if (target.isContentEditable) return false;
  const tag = (target.tagName ?? "").toUpperCase();
  return tag !== "INPUT" && tag !== "TEXTAREA" && tag !== "SELECT";
}
