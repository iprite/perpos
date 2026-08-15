/**
 * JMAP client ดิบ — ชั้นล่างสุดของโมดูลอีเมล
 *
 * กฎที่ห้ามพัง (spec §5.1 / §7.6 / §7.7):
 *  - ทุก fetch ไป Stalwart ใช้ redirect แบบ manual (302 พา header Authorization ออกนอกโดเมนได้)
 *    ยกเว้นการ discovery `/.well-known/jmap` ที่ตอบ 307 เท่านั้น (assert origin ก่อนใช้ผล)
 *  - ห้ามมีตัวแปร module-level ที่เก็บ token/ผลลัพธ์จาก JMAP (serverless instance เสิร์ฟหลายคน)
 *  - ห้ามใช้ credential ของแอดมิน — token ของผู้ใช้จาก cookie เท่านั้น
 *  - ห้าม log subject/preview/from/to/ชื่อไฟล์/token
 */

import type { JmapDiscovery, MailSession } from "./types";

export const JMAP_USING = ["urn:ietf:params:jmap:core", "urn:ietf:params:jmap:mail"] as const;

export const JMAP_TIMEOUT_MS = 15_000;
export const JMAP_BLOB_TIMEOUT_MS = 60_000;

/** ชนิดรูปที่อนุญาตให้แสดง inline (ชุดเดียวกับ cid: → data: — spec §7.3/§7.7) */
export const INLINE_IMAGE_TYPES = ["image/png", "image/jpeg", "image/gif", "image/webp"] as const;

export type JmapMethodCall = [string, Record<string, unknown>, string];
export type JmapMethodResponse = [string, Record<string, unknown>, string];

export class MailUnauthorizedError extends Error {
  constructor(message = "เซสชันอีเมลหมดอายุ") {
    super(message);
    this.name = "MailUnauthorizedError";
  }
}

export class MailServiceError extends Error {
  status: number;
  constructor(status: number, message = "ระบบอีเมลไม่ตอบสนอง ลองใหม่อีกครั้ง") {
    super(message);
    this.name = "MailServiceError";
    this.status = status;
  }
}

// ─── request หลัก ────────────────────────────────────────────────────────────

export async function jmapRequest(
  session: Pick<MailSession, "apiUrl" | "accessToken">,
  methodCalls: JmapMethodCall[],
): Promise<JmapMethodResponse[]> {
  let res: Response;
  try {
    res = await fetch(session.apiUrl, {
      method: "POST",
      redirect: "manual",
      cache: "no-store",
      headers: {
        Authorization: `Bearer ${session.accessToken}`,
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify({ using: [...JMAP_USING], methodCalls }),
      signal: AbortSignal.timeout(JMAP_TIMEOUT_MS),
    });
  } catch {
    throw new MailServiceError(504);
  }

  if (res.status === 401) throw new MailUnauthorizedError();
  if (!res.ok) throw new MailServiceError(res.status);

  let body: unknown;
  try {
    body = await res.json();
  } catch {
    throw new MailServiceError(502);
  }
  const responses = (body as { methodResponses?: JmapMethodResponse[] })?.methodResponses;
  if (!Array.isArray(responses)) throw new MailServiceError(502);
  return responses;
}

/** หยิบผลลัพธ์ตาม callId — เจอ error = โยน MailServiceError (ไม่ leak เนื้อหา) */
export function pickResponse(
  responses: JmapMethodResponse[],
  callId: string,
): Record<string, unknown> {
  const found = responses.find((r) => r[2] === callId);
  if (!found) throw new MailServiceError(502);
  if (found[0] === "error") throw new MailServiceError(502);
  return found[1] ?? {};
}

/** ชนิดของ response ตาม callId (ใช้เช็คแบบไม่โยน เช่นตอน Mailbox/set) */
export function responseType(responses: JmapMethodResponse[], callId: string): string | null {
  const found = responses.find((r) => r[2] === callId);
  return found ? found[0] : null;
}

// ─── discovery (ข้อยกเว้นเดียวที่ตาม redirect ได้) ────────────────────────────

/**
 * ดึง JMAP session (apiUrl/downloadUrl/accountId) จากเซิร์ฟเวอร์เมล
 *
 * 🔴 pin กับ **origin ของ `MAIL_JMAP_URL`** ไม่ใช่ของ issuer — เป็นด่านกัน SSRF/redirect
 *    ไปเครื่องอื่น (ปลายทางหลัง 307 และ apiUrl ที่เซิร์ฟเวอร์ประกาศ ต้องอยู่ origin เดียวกับที่เราตั้งใน env)
 *
 *    ⚠️ ห้ามเปลี่ยนกลับไป pin กับ issuer: หน้า OAuth ของเราอยู่คนละชื่อกับ JMAP โดยตั้งใจ
 *    (`login.perpos.ai` = ชื่อที่ลูกค้าเห็นตอนกรอกรหัสผ่าน · `stalwart.perpos.ai` = ชื่อที่เซิร์ฟเวอร์
 *    ประกาศใน apiUrl) — เคย pin กับ issuer แล้วล็อกอินไม่ผ่านทั้งระบบ ขึ้นแค่ "เข้าสู่ระบบไม่สำเร็จ"
 */
export async function fetchJmapDiscovery(
  jmapUrl: string,
  accessToken: string,
): Promise<JmapDiscovery> {
  const jmapOrigin = new URL(jmapUrl).origin;
  let res: Response;
  try {
    res = await fetch(`${jmapOrigin}/.well-known/jmap`, {
      method: "GET",
      // ข้อยกเว้นเดียวของกฎ redirect manual — Stalwart ตอบ 307 ไป /jmap/session
      redirect: "follow",
      cache: "no-store",
      headers: { Authorization: `Bearer ${accessToken}`, Accept: "application/json" },
      signal: AbortSignal.timeout(JMAP_TIMEOUT_MS),
    });
  } catch {
    throw new MailServiceError(504);
  }
  if (res.status === 401) throw new MailUnauthorizedError();
  if (!res.ok) throw new MailServiceError(res.status);
  // ปลายทางต้องยังอยู่ origin เดียวกับ JMAP host ที่ตั้งไว้
  if (res.url && new URL(res.url).origin !== jmapOrigin) throw new MailServiceError(502);

  const data = (await res.json()) as {
    apiUrl?: string;
    downloadUrl?: string;
    primaryAccounts?: Record<string, string>;
    accounts?: Record<string, { name?: string }>;
  };

  const accountId = data.primaryAccounts?.["urn:ietf:params:jmap:mail"];
  const apiUrl = data.apiUrl;
  const downloadUrl = data.downloadUrl;
  if (!accountId || !apiUrl || !downloadUrl) throw new MailServiceError(502);

  const resolvedApiUrl = new URL(apiUrl, jmapOrigin);
  if (resolvedApiUrl.origin !== jmapOrigin) throw new MailServiceError(502);

  return {
    accountId,
    apiUrl: resolvedApiUrl.toString(),
    downloadUrl,
    email: data.accounts?.[accountId]?.name ?? "",
  };
}

// ─── ไฟล์แนบ (จุดอ่อนที่สุด — spec §7.7) ────────────────────────────────────

export function isValidBlobId(blobId: string): boolean {
  return /^[A-Za-z0-9_-]{1,128}$/.test(blobId);
}

const BACKSLASH = String.fromCharCode(92);
const DOUBLE_QUOTE = String.fromCharCode(34);

/**
 * ชื่อไฟล์มาจากเมล = ผู้โจมตีคุมได้ → ตัดอักขระควบคุม (รวม CR/LF) และ " \ /
 * ก่อนเอาไปใส่ header ทุกครั้ง (กัน header injection / path traversal)
 */
export function sanitizeAttachmentName(raw: string | null | undefined): string {
  const cleaned = Array.from(raw ?? "")
    .filter((ch) => {
      const code = ch.codePointAt(0) ?? 0;
      if (code < 32 || code === 127) return false;
      return ch !== DOUBLE_QUOTE && ch !== BACKSLASH && ch !== "/";
    })
    .join("")
    .split("..")
    .join("")
    .trim()
    .slice(0, 120);
  return cleaned.length > 0 ? cleaned : "attachment";
}

/** M1 ตอบ attachment เสมอ ยกเว้น allowlist รูป 4 ชนิด → นอกนั้น octet-stream */
export function resolveDownloadType(type: string | null | undefined): string {
  const normalized = (type ?? "").split(";")[0]?.trim().toLowerCase() ?? "";
  return (INLINE_IMAGE_TYPES as readonly string[]).includes(normalized)
    ? normalized
    : "application/octet-stream";
}

/** ฐานของ downloadUrl ก่อน placeholder ตัวแรก — ใช้ assert prefix ก่อน fetch */
export function downloadUrlPrefix(template: string): string {
  const idx = template.indexOf("{");
  return idx === -1 ? template : template.slice(0, idx);
}

/**
 * ประกอบ URL ดาวน์โหลดจาก template ที่มาจาก JMAP session (ห้ามฮาร์ดโค้ด)
 * — encode ทุก placeholder + assert prefix + assert origin เดียวกับ apiUrl
 */
export function buildDownloadUrl(
  session: Pick<MailSession, "downloadUrl" | "accountId" | "apiUrl">,
  args: { blobId: string; name: string; type: string },
): string {
  if (!isValidBlobId(args.blobId)) throw new MailServiceError(400);
  const url = session.downloadUrl
    .split("{accountId}")
    .join(encodeURIComponent(session.accountId))
    .split("{blobId}")
    .join(encodeURIComponent(args.blobId))
    .split("{name}")
    .join(encodeURIComponent(args.name))
    .split("{type}")
    .join(encodeURIComponent(args.type));

  const prefix = downloadUrlPrefix(session.downloadUrl);
  if (!url.startsWith(prefix)) throw new MailServiceError(502);
  if (new URL(url).origin !== new URL(session.apiUrl).origin) {
    throw new MailServiceError(502);
  }
  return url;
}

/** ดึง blob จาก Stalwart (stream) — timeout 60 วิ, ไม่ตาม redirect */
export async function fetchBlob(
  session: Pick<MailSession, "downloadUrl" | "accountId" | "accessToken" | "apiUrl">,
  args: { blobId: string; name: string; type: string },
): Promise<Response> {
  const url = buildDownloadUrl(session, args);
  let res: Response;
  try {
    res = await fetch(url, {
      method: "GET",
      redirect: "manual",
      cache: "no-store",
      headers: { Authorization: `Bearer ${session.accessToken}` },
      signal: AbortSignal.timeout(JMAP_BLOB_TIMEOUT_MS),
    });
  } catch {
    throw new MailServiceError(504);
  }
  if (res.status === 401) throw new MailUnauthorizedError();
  if (!res.ok) throw new MailServiceError(res.status);
  return res;
}
