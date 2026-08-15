/**
 * ล้างข้อมูลส่วนบุคคลของโมดูลอีเมลออกจาก event ก่อนส่ง Sentry (contract §7.8)
 *
 * ทำไมต้องมี: URL ของ `/api/mail/*` พก **ชื่อไฟล์แนบจริง** มาใน query (`?name=…`)
 * และ body ของ `POST /api/mail/messages` พก **คำค้นของผู้ใช้** — ทั้งสองอย่างเป็นข้อมูล
 * ส่วนบุคคลตามสัญญา ห้ามไหลออกไปที่ไหนที่ลบไม่ได้
 *
 * ครอบ 3 ทาง: `event.request` · breadcrumb ของ fetch/xhr (พก url เต็มเหมือนกัน) ·
 * ชื่อ transaction — **ห้ามพึ่งแค่ `event.request`**
 *
 * ไฟล์นี้ pure ไม่ import `@sentry/*` เพื่อให้เทสได้ตรง ๆ และใช้ได้ทั้ง node/edge/browser
 */

const MAIL_PATH = "/api/mail/";

type UnknownRecord = Record<string, unknown>;

/** URL นี้เป็นของโมดูลอีเมลไหม (รับได้ทั้ง path ล้วนและ absolute URL) */
export function isMailUrl(url: unknown): boolean {
  return typeof url === "string" && url.includes(MAIL_PATH);
}

/** ตัด query string ทิ้ง เหลือเฉพาะ path (คง origin ไว้ถ้ามี) */
export function stripQuery(url: string): string {
  const cut = url.search(/[?#]/);
  return cut === -1 ? url : url.slice(0, cut);
}

function scrubBreadcrumb(crumb: UnknownRecord): UnknownRecord {
  const data = crumb.data as UnknownRecord | undefined;
  if (!data || !isMailUrl(data.url)) return crumb;
  return {
    ...crumb,
    data: { ...data, url: stripQuery(data.url as string) },
    message: isMailUrl(crumb.message) ? stripQuery(crumb.message as string) : crumb.message,
  };
}

/**
 * คืน event ที่ล้างแล้ว — ถ้าไม่เกี่ยวกับอีเมลเลยคืนตัวเดิม (ไม่ copy เปล่า ๆ)
 * ใช้เป็น `beforeSend` และ `beforeSendTransaction` ของ Sentry ทุก runtime
 */
export function scrubMailEvent<T extends object>(event: T): T {
  // Sentry มี type ของตัวเอง (ErrorEvent/TransactionEvent) — มองเป็น record ธรรมดาพอ
  const ev = event as UnknownRecord;
  const request = ev.request as UnknownRecord | undefined;
  const breadcrumbs = ev.breadcrumbs as UnknownRecord[] | undefined;
  const requestIsMail = isMailUrl(request?.url);
  const hasMailCrumb = breadcrumbs?.some((c) =>
    isMailUrl((c.data as UnknownRecord | undefined)?.url),
  );
  if (!requestIsMail && !hasMailCrumb) return event;

  const next: UnknownRecord = { ...ev };

  if (requestIsMail && request) {
    // เก็บแค่ path — ทิ้ง query/body/header/cookie ทั้งหมด (session cookie ก็อยู่ในนั้น)
    next.request = { url: stripQuery(request.url as string), method: request.method };
    if (isMailUrl(next.transaction)) next.transaction = stripQuery(next.transaction as string);
  }

  if (hasMailCrumb && breadcrumbs) {
    next.breadcrumbs = breadcrumbs.map(scrubBreadcrumb);
  }

  return next as T;
}
