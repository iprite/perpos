/**
 * เรียก JMAP ฝั่ง "จัดการเซิร์ฟเวอร์" ของ Stalwart — ใช้เฉพาะหน้าหลังบ้านของเรา (`/admin/mail`)
 *
 * 🔴 แยกจาก [lib/mail/jmap.ts](./jmap.ts) โดยเจตนา — ไฟล์นั้นมีกฎว่า "ห้ามใช้ credential ของแอดมิน"
 *    เพราะเป็นเส้นทางที่ลูกค้าเรียกผ่าน cookie ของตัวเอง · ไฟล์นี้ตรงข้าม: ใช้ API key ของแอดมิน
 *    และ **ห้ามถูกเรียกจากโซน `(mail)` หรือ `/api/mail/*` เด็ดขาด**
 *
 * กฎที่ห้ามพัง:
 *  - **ห้ามอ่านเนื้อหาเมลของลูกค้า** (MAIL_UI_SPEC §6) — เรียกได้เฉพาะ object ใน `ADMIN_OBJECTS`
 *    ซึ่งเป็น metadata ล้วน ห้ามเพิ่ม `Email/*`, `Mailbox/*`, `x:QueuedMessage/MessageContents`
 *  - key อยู่ใน env ฝั่งเซิร์ฟเวอร์เท่านั้น (`MAIL_ADMIN_API_KEY`) — ห้ามส่งลง client และห้าม log
 *  - ไม่ตั้งค่า = คืน `null` แล้วให้หน้าเว็บขึ้น "ยังไม่ได้ตั้งค่า" (ห้าม throw จนหน้าพัง)
 *  - Stalwart 0.16 ต้องใส่ capability `urn:stalwart:jmap` + object ขึ้นต้น `x:` (ดู MAIL_HANDOFF §G)
 */

import "server-only";

const ADMIN_USING = ["urn:ietf:params:jmap:core", "urn:stalwart:jmap"] as const;
const ADMIN_TIMEOUT_MS = 15_000;

/** accountId ของ principal แอดมิน — Stalwart ต้องการเสมอแม้ object จะเป็นระดับเซิร์ฟเวอร์ */
const ADMIN_ACCOUNT_ID = "b";

/** object ที่หน้าหลังบ้านเรียกได้ — metadata ล้วน (ดูกฎด้านบน) */
const ADMIN_OBJECTS = [
  "x:Domain/get",
  "x:Account/query",
  "x:Account/get",
  "x:Certificate/get",
  "x:QueuedMessage/query",
] as const;
type AdminObject = (typeof ADMIN_OBJECTS)[number];

export interface MailAdminConfig {
  jmapUrl: string;
  apiKey: string;
}

export function readMailAdminConfig(): MailAdminConfig | null {
  const jmapUrl = process.env.MAIL_JMAP_URL?.trim();
  const apiKey = process.env.MAIL_ADMIN_API_KEY?.trim();
  if (!jmapUrl || !apiKey) return null;
  try {
    const url = new URL(jmapUrl);
    if (url.protocol !== "https:" && url.hostname !== "localhost") return null;
  } catch {
    return null;
  }
  return { jmapUrl, apiKey };
}

type MethodCall = [AdminObject, Record<string, unknown>, string];
type MethodResponse = [string, Record<string, unknown>, string];

export class MailAdminError extends Error {
  constructor(message = "เรียกเมลเซิร์ฟเวอร์ไม่สำเร็จ") {
    super(message);
    this.name = "MailAdminError";
  }
}

async function adminRequest(
  config: MailAdminConfig,
  calls: MethodCall[],
): Promise<MethodResponse[]> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), ADMIN_TIMEOUT_MS);
  let res: Response;
  try {
    res = await fetch(config.jmapUrl, {
      method: "POST",
      // 302 พา header Authorization ออกนอกโดเมนได้ → ห้าม follow อัตโนมัติ (กฎเดียวกับฝั่งลูกค้า)
      redirect: "manual",
      cache: "no-store",
      signal: controller.signal,
      headers: {
        Authorization: `Bearer ${config.apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ using: ADMIN_USING, methodCalls: calls }),
    });
  } catch {
    throw new MailAdminError("ต่อเมลเซิร์ฟเวอร์ไม่ได้");
  } finally {
    clearTimeout(timer);
  }

  if (res.status === 401 || res.status === 403) {
    throw new MailAdminError("กุญแจแอดมินของเมลเซิร์ฟเวอร์ใช้ไม่ได้ (หมดอายุหรือถูกเพิกถอน)");
  }
  if (!res.ok) throw new MailAdminError();

  const body = (await res.json().catch(() => null)) as {
    methodResponses?: MethodResponse[];
  } | null;
  if (!body?.methodResponses) throw new MailAdminError();
  return body.methodResponses;
}

function resultOf(responses: MethodResponse[], callId: string): Record<string, unknown> | null {
  const found = responses.find((r) => r[2] === callId);
  if (!found || found[0] === "error") return null;
  return found[1];
}

function listOf<T>(responses: MethodResponse[], callId: string): T[] {
  const res = resultOf(responses, callId);
  return Array.isArray(res?.list) ? (res.list as T[]) : [];
}

// ─── ชนิดข้อมูลที่หน้าเว็บใช้ (แบนแล้ว ไม่ปล่อย raw ของ Stalwart ออกไป) ─────────

export interface MailAdminDomain {
  id: string;
  name: string;
  enabled: boolean;
  createdAt: string | null;
  /** ใบรับรอง/DKIM ต่ออายุเองได้ไหม — `Automatic` = ปล่อยได้ · `Manual` = ต้องมีคนคอยดู */
  certificateMode: string;
  dkimMode: string;
  catchAll: string | null;
}

export interface MailAdminAccount {
  id: string;
  name: string;
  email: string | null;
  domain: string | null;
  role: string;
  /** ไบต์ที่ใช้จริง · `null` = เซิร์ฟเวอร์ไม่ได้บอก (ไม่ใช่ 0) */
  usedBytes: number | null;
  quotaBytes: number | null;
  aliasCount: number;
  createdAt: string | null;
}

export interface MailAdminCertificate {
  id: string;
  issuer: string | null;
  notValidAfter: string | null;
  daysLeft: number | null;
  hostnames: string[];
}

export interface MailAdminStatus {
  domains: MailAdminDomain[];
  accounts: MailAdminAccount[];
  certificates: MailAdminCertificate[];
  /** จำนวนเมลที่ค้างอยู่ในคิวส่งออก — ค้างเยอะ = ปลายทางไม่รับ/เราถูกบล็อก */
  queuedCount: number;
  fetchedAt: string;
}

// ─── ตัวแปลงค่าจาก Stalwart (โครงสร้าง variant ใช้ `@type` เป็นตัวแยกชนิด) ──────

function variantType(value: unknown, fallback = "—"): string {
  if (value && typeof value === "object" && "@type" in value) {
    const t = (value as { "@type": unknown })["@type"];
    if (typeof t === "string") return t;
  }
  return fallback;
}

function asString(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value : null;
}

function asNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function countKeys(value: unknown): number {
  return value && typeof value === "object" ? Object.keys(value).length : 0;
}

function daysUntil(iso: string | null, now: number): number | null {
  if (!iso) return null;
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return null;
  return Math.floor((t - now) / 86_400_000);
}

/**
 * ดึงสถานะเมลเซิร์ฟเวอร์ทั้งหมดในคำขอเดียว (JMAP รวม method call ได้)
 * โยน `MailAdminError` เมื่อเรียกไม่ได้ — หน้าเว็บจับแล้วแสดงข้อความ ไม่ปล่อยให้ 500
 */
export async function fetchMailAdminStatus(config: MailAdminConfig): Promise<MailAdminStatus> {
  const now = Date.now();
  const first = await adminRequest(config, [
    ["x:Domain/get", { accountId: ADMIN_ACCOUNT_ID }, "domains"],
    ["x:Certificate/get", { accountId: ADMIN_ACCOUNT_ID }, "certs"],
    ["x:QueuedMessage/query", { accountId: ADMIN_ACCOUNT_ID }, "queue"],
    ["x:Account/query", { accountId: ADMIN_ACCOUNT_ID }, "accountIds"],
  ]);

  const rawDomains = listOf<Record<string, unknown>>(first, "domains");
  const domainNameById = new Map<string, string>();
  const domains: MailAdminDomain[] = rawDomains.map((d) => {
    const id = asString(d.id) ?? "";
    const name = asString(d.name) ?? "(ไม่มีชื่อ)";
    if (id) domainNameById.set(id, name);
    return {
      id,
      name,
      enabled: d.isEnabled !== false,
      createdAt: asString(d.createdAt),
      certificateMode: variantType(d.certificateManagement),
      dkimMode: variantType(d.dkimManagement),
      catchAll: asString(d.catchAllAddress),
    };
  });

  const certificates: MailAdminCertificate[] = listOf<Record<string, unknown>>(first, "certs").map(
    (c) => {
      const notValidAfter = asString(c.notValidAfter);
      return {
        id: asString(c.id) ?? "",
        issuer: asString(c.issuer),
        notValidAfter,
        daysLeft: daysUntil(notValidAfter, now),
        hostnames: Object.keys(
          (c.subjectAlternativeNames as Record<string, unknown> | undefined) ?? {},
        ),
      };
    },
  );

  const queueRes = resultOf(first, "queue");
  const queuedCount = Array.isArray(queueRes?.ids) ? (queueRes.ids as unknown[]).length : 0;

  const accountIdsRes = resultOf(first, "accountIds");
  const accountIds = Array.isArray(accountIdsRes?.ids)
    ? (accountIdsRes.ids as unknown[]).filter((v): v is string => typeof v === "string")
    : [];

  let accounts: MailAdminAccount[] = [];
  if (accountIds.length > 0) {
    const second = await adminRequest(config, [
      ["x:Account/get", { accountId: ADMIN_ACCOUNT_ID, ids: accountIds }, "accounts"],
    ]);
    accounts = listOf<Record<string, unknown>>(second, "accounts").map((a) => {
      const domainId = asString(a.domainId);
      const name = asString(a.name) ?? "(ไม่มีชื่อ)";
      const domain = domainId ? (domainNameById.get(domainId) ?? null) : null;
      const quotas = (a.quotas as Record<string, unknown> | undefined) ?? {};
      return {
        id: asString(a.id) ?? "",
        name,
        email: asString(a.emailAddress) ?? (domain ? `${name}@${domain}` : null),
        domain,
        role: variantType(a.roles, "User"),
        usedBytes: asNumber(a.usedDiskQuota),
        quotaBytes: asNumber(quotas.diskQuota ?? quotas.disk),
        aliasCount: countKeys(a.aliases),
        createdAt: asString(a.createdAt),
      };
    });
  }

  return {
    domains,
    accounts,
    certificates,
    queuedCount,
    fetchedAt: new Date(now).toISOString(),
  };
}
