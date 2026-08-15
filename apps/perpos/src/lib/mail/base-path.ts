/**
 * PERPOS Mail อยู่ได้ 2 ที่ — **URL ที่ผู้ใช้เห็นต่างกัน แต่ไฟล์ route ชุดเดียว**
 *
 * | host                | ผู้ใช้เห็น            | ไฟล์จริงใน app router |
 * | ------------------- | --------------------- | --------------------- |
 * | `mail.perpos.ai`    | `/` · `/login`        | `(mail)/mail/*`       |
 * | dev / โดเมนอื่น      | `/mail` · `/mail/login` | เหมือนกัน            |
 *
 * โดเมนเมลไม่ควรมี `/mail` ซ้ำซ้อน (mail.perpos.ai/mail) — middleware จึง **rewrite**
 * `/`→`/mail` และ `/login`→`/mail/login` ให้ (rewrite ไม่ใช่ redirect: URL บนแถบที่อยู่ยังสะอาด)
 *
 * ⚠️ ลิงก์ทุกอันในโซนนี้ต้องประกอบจาก `mailBasePath(host)` **ห้ามฮาร์ดโค้ด `/mail`**
 *    ไม่งั้นบนโดเมนเมลจะพาผู้ใช้ไป `mail.perpos.ai/mail` (ซ้ำ) และบน dev จะพาไปหน้าแรกของ PERPOS
 *
 * ไฟล์นี้ pure — ใช้ได้ทั้ง middleware (edge), server component และ client
 */

export const MAIL_DEFAULT_HOST = "mail.perpos.ai";

/** ชื่อโฮสต์ของ webmail — มาจาก `MAIL_APP_BASE_URL` ถ้าตั้งไว้ */
export function mailHostname(appBaseUrl = process.env.MAIL_APP_BASE_URL): string {
  if (!appBaseUrl) return MAIL_DEFAULT_HOST;
  try {
    return new URL(appBaseUrl).hostname.toLowerCase();
  } catch {
    return MAIL_DEFAULT_HOST;
  }
}

/** host ปัจจุบันเป็นโดเมนของ webmail ไหม (ตัดพอร์ตทิ้งก่อนเทียบ) */
export function isMailHost(host: string | null | undefined, mailHost = mailHostname()): boolean {
  if (!host) return false;
  return (host.split(":")[0] ?? "").toLowerCase() === mailHost;
}

/**
 * คำนำหน้าของทุกลิงก์ในโซนเมล — `""` บนโดเมนเมล · `"/mail"` ที่อื่น
 * ใช้เป็น `${base}/` (กล่องขาเข้า) · `${base}/login` · `${base}/?box=sent`
 */
export function mailBasePath(host: string | null | undefined, mailHost = mailHostname()): string {
  return isMailHost(host, mailHost) ? "" : "/mail";
}
