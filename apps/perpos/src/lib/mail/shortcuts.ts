/**
 * คีย์ลัดของหน้าอีเมล — ประกาศเป็น "ข้อมูลชุดเดียว" (registry-as-data)
 *
 * เครดิต (MIT): แนวคิด registry-as-data ของคีย์ลัดอ้างอิงจาก Mail-0/Zero
 * (https://github.com/Mail-0/Zero) — เป็นแนวคิด/คอนฟิก **ไม่ได้คัดลอกโค้ด**
 * ⚠️ จุดที่เราตั้งใจทำต่างจากเขา: `g i` ต้องเป็น sequence `'g>i'` (syntax ของ
 * react-hotkeys-hook v5) ไม่ใช่ `['g','i']` ซึ่งกลายเป็น "กด g+i พร้อมกัน"
 *
 * ไฟล์นี้ถูกใช้ **ทั้ง** ผูก handler **และ** เรนเดอร์ตารางคีย์ลัด (`?`) → ไม่มีทางหลุด sync
 * M1 มีเฉพาะคีย์ที่ทำงานจริง — `c r a f` (เขียน/ตอบ/ส่งต่อ) เป็น M2 จึงยังไม่อยู่ในนี้
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
  | "gotoInbox";

export type MailShortcutScope = "global" | "list" | "reader";

export interface MailShortcut {
  /** สตริงที่ส่งให้ react-hotkeys-hook (v5) */
  keys: string;
  scope: MailShortcutScope;
  action: MailShortcutAction;
  /** ป้ายภาษาไทยในตารางคีย์ลัด */
  label: string;
  /** โทเคนของปุ่มสำหรับเรนเดอร์ (แปลงตาม OS ด้วย formatDisplayKeys) */
  display: string[];
}

export const MAIL_SHORTCUTS: readonly MailShortcut[] = [
  { keys: "j", scope: "list", action: "next", label: "ลง (ฉบับถัดไป)", display: ["j"] },
  { keys: "k", scope: "list", action: "prev", label: "ขึ้น (ฉบับก่อนหน้า)", display: ["k"] },
  { keys: "enter", scope: "list", action: "open", label: "เปิดเมล", display: ["enter"] },
  {
    keys: "escape",
    scope: "global",
    action: "close",
    label: "ปิด / กลับรายการ",
    display: ["escape"],
  },
  { keys: "x", scope: "list", action: "selectToggle", label: "เลือก / ไม่เลือก", display: ["x"] },
  { keys: "e", scope: "global", action: "archive", label: "เก็บเข้าคลัง", display: ["e"] },
  { keys: "shift+3", scope: "global", action: "trash", label: "ลบ", display: ["#"] },
  { keys: "s", scope: "global", action: "star", label: "ติดดาว", display: ["s"] },
  { keys: "u", scope: "global", action: "markUnread", label: "ทำเป็นยังไม่อ่าน", display: ["u"] },
  { keys: "slash", scope: "global", action: "search", label: "ค้นหา", display: ["/"] },
  { keys: "shift+slash", scope: "global", action: "help", label: "ตารางคีย์ลัด", display: ["?"] },
  {
    keys: "g>i",
    scope: "global",
    action: "gotoInbox",
    label: "ไปกล่องขาเข้า",
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
