/** ชนิด+ตัวช่วยประกาศพจนานุกรม — แยกไฟล์กัน import วน (messages/* ↔ index) */

/** หนึ่งข้อความ = ทั้งสองภาษาเสมอ */
export interface MailMessage {
  th: string;
  en: string;
}

/** ล็อกคีย์เป็น literal เพื่อให้ `MailMessageKey` แม่น + บังคับให้มีทั้ง th/en ทุกคีย์ */
export function defineMailMessages<const T extends Record<string, MailMessage>>(messages: T): T {
  return messages;
}
