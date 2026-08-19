/**
 * รูปแบบเวลา/ขนาดไฟล์ของโมดูลอีเมล — ไทย = ปี พ.ศ. (DESIGN.md §14) · อังกฤษ = ค.ศ.
 * เวลาทั้งหมดคิดตามเขตเวลาไทยเสมอ (เซิร์ฟเวอร์เป็น UTC)
 * ภาษาส่งเข้ามาเป็นพารามิเตอร์ (ค่าเริ่มต้นไทย — ผู้เรียกเดิมที่ยังไม่ส่งไม่พัง)
 */

import { MAIL_LOCALE_DEFAULT, type MailLocale } from "./i18n";

const TIME_ZONE = "Asia/Bangkok";

const EN_MONTHS_SHORT = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
];

const TH_MONTHS_SHORT = [
  "ม.ค.",
  "ก.พ.",
  "มี.ค.",
  "เม.ย.",
  "พ.ค.",
  "มิ.ย.",
  "ก.ค.",
  "ส.ค.",
  "ก.ย.",
  "ต.ค.",
  "พ.ย.",
  "ธ.ค.",
];

interface ZonedParts {
  year: number;
  month: number;
  day: number;
  hour: string;
  minute: string;
}

const PART_FORMATTER = new Intl.DateTimeFormat("en-GB", {
  timeZone: TIME_ZONE,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
});

function zonedParts(date: Date): ZonedParts {
  const parts = PART_FORMATTER.formatToParts(date);
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? "00";
  return {
    year: Number(get("year")),
    month: Number(get("month")),
    day: Number(get("day")),
    hour: get("hour") === "24" ? "00" : get("hour"),
    minute: get("minute"),
  };
}

function dayNumber(p: ZonedParts): number {
  return Date.UTC(p.year, p.month - 1, p.day) / 86_400_000;
}

/** พ.ศ. เต็ม */
export function buddhistYear(ce: number): number {
  return ce + 543;
}

/**
 * เวลาสัมพัทธ์สำหรับแถวรายการ:
 *  วันนี้ → `14:32` · เมื่อวาน → `เมื่อวาน` · ปีนี้ → `12 ส.ค.` · ปีก่อน → `12 ส.ค. 67`
 */
export function formatMailTime(
  iso: string,
  now: Date = new Date(),
  locale: MailLocale = MAIL_LOCALE_DEFAULT,
): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  const d = zonedParts(date);
  const n = zonedParts(now);
  const diffDays = dayNumber(n) - dayNumber(d);
  const month = (locale === "en" ? EN_MONTHS_SHORT : TH_MONTHS_SHORT)[d.month - 1] ?? "";

  if (diffDays === 0) return `${d.hour}:${d.minute}`;
  if (diffDays === 1) return locale === "en" ? "Yesterday" : "เมื่อวาน";
  if (d.year === n.year) return `${d.day} ${month}`;
  const shortYear = String(locale === "en" ? d.year : buddhistYear(d.year)).slice(-2);
  return `${d.day} ${month} ${shortYear}`;
}

/** วันเวลาแบบเต็มสำหรับบานอ่าน: `12 ส.ค. 2568 14:32` · en: `12 Aug 2025 14:32` */
export function formatMailDateTime(iso: string, locale: MailLocale = MAIL_LOCALE_DEFAULT): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  const d = zonedParts(date);
  const month = (locale === "en" ? EN_MONTHS_SHORT : TH_MONTHS_SHORT)[d.month - 1] ?? "";
  const year = locale === "en" ? d.year : buddhistYear(d.year);
  return `${d.day} ${month} ${year} ${d.hour}:${d.minute}`;
}

/** ขนาดไฟล์แนบ */
export function formatMailSize(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return "0 KB";
  if (bytes < 1024) return `${bytes} B`;
  const kb = bytes / 1024;
  if (kb < 1024) return `${kb < 10 ? kb.toFixed(1) : Math.round(kb)} KB`;
  const mb = kb / 1024;
  return `${mb < 10 ? mb.toFixed(1) : Math.round(mb)} MB`;
}

/** ชื่อที่แสดงของผู้ส่ง (ไม่มีชื่อ → ใช้อีเมล) */
export function mailDisplayName(addr: { name: string | null; email: string } | null): string {
  if (!addr) return "ไม่ทราบผู้ส่ง";
  const name = (addr.name ?? "").trim();
  return name.length > 0 ? name : addr.email;
}
