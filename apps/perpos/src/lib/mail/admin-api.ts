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
import { randomInt } from "node:crypto";

const ADMIN_USING = ["urn:ietf:params:jmap:core", "urn:stalwart:jmap"] as const;
const ADMIN_TIMEOUT_MS = 15_000;

/** accountId ของ principal แอดมิน — Stalwart ต้องการเสมอแม้ object จะเป็นระดับเซิร์ฟเวอร์ */
const ADMIN_ACCOUNT_ID = "b";

/** object ที่หน้าหลังบ้านเรียกได้ — metadata ล้วน (ดูกฎด้านบน) */
const ADMIN_OBJECTS = [
  "x:AcmeProvider/query",
  "x:DkimSignature/get",
  "x:DkimSignature/set",
  "x:Domain/get",
  "x:Domain/set",
  "x:Account/query",
  "x:Account/get",
  "x:Account/set",
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
  /** โซนไฟล์ที่ Stalwart สร้างให้ (DKIM ฯลฯ) — ต้นทางของ record ที่ลูกค้าต้องคัดลอก */
  zoneFile: string | null;
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
  /** นามแฝง = ที่อยู่เพิ่มเติมที่ส่งเข้ากล่องนี้ (info@ → กล่องของฝ่ายขาย) */
  aliases: MailAdminAlias[];
  createdAt: string | null;
}

export interface MailAdminAlias {
  /** ส่วนหน้า @ */
  name: string;
  domainId: string;
  /** ชื่อโดเมนสำหรับแสดงผล — `null` ถ้าโดเมนถูกลบไปแล้ว */
  domain: string | null;
  enabled: boolean;
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

/**
 * `aliases` ของ Stalwart เป็น objectList = ออบเจ็กต์ที่คีย์เป็นลำดับ ("0","1",…) ไม่ใช่อาร์เรย์
 * → ต้องแปลงเองทุกครั้ง (ทั้งตอนอ่านและตอนเขียน) ไม่งั้นได้ค่าว่างเงียบ ๆ
 */
function readAliases(value: unknown, domainNameById: Map<string, string>): MailAdminAlias[] {
  if (!value || typeof value !== "object") return [];
  return Object.values(value as Record<string, unknown>)
    .map((raw) => {
      const a = (raw ?? {}) as Record<string, unknown>;
      const name = asString(a.name);
      const domainId = asString(a.domainId);
      if (!name || !domainId) return null;
      return {
        name,
        domainId,
        domain: domainNameById.get(domainId) ?? null,
        enabled: a.enabled !== false,
      };
    })
    .filter((a): a is MailAdminAlias => a !== null);
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
      zoneFile: asString(d.dnsZoneFile),
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
        // คีย์โควตาดิสก์ของ Stalwart คือ `maxDiskQuota` (หน่วยไบต์) — ชื่ออื่นไม่มีจริง
        quotaBytes: asNumber(quotas.maxDiskQuota),
        aliases: readAliases(a.aliases, domainNameById),
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

// ─── เขียน: เพิ่ม/ลบโดเมน ────────────────────────────────────────────────────

/** ชื่อโดเมนที่รับได้ — กันคนพิมพ์ URL/อีเมล/ช่องว่างเข้ามา */
const DOMAIN_RE = /^(?=.{1,253}$)([a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/;

export function normalizeDomainName(raw: string): string | null {
  const name = raw
    .trim()
    .toLowerCase()
    .replace(/^https?:\/\//, "")
    .replace(/^@/, "")
    .replace(/\/.*$/, "")
    .replace(/\.$/, "");
  return DOMAIN_RE.test(name) ? name : null;
}

interface SetErrorEntry {
  description?: string;
  type?: string;
  linkedObjects?: { object?: string }[];
}

/**
 * Stalwart ไม่ได้ส่ง `description` มาทุกครั้ง — บางกรณีมีแค่ `type` (เช่น `objectIsLinked`)
 * ถ้าปล่อยไปตรง ๆ ผู้ใช้จะเห็นแค่ "ปฏิเสธคำขอ" แล้วไม่รู้ว่าต้องทำอะไรต่อ
 */
function firstSetError(res: Record<string, unknown> | null): string | null {
  if (!res) return "เมลเซิร์ฟเวอร์ปฏิเสธคำขอ";
  const notCreated = res.notCreated as Record<string, SetErrorEntry> | undefined;
  const notDestroyed = res.notDestroyed as Record<string, SetErrorEntry> | undefined;
  for (const bag of [notCreated, notDestroyed]) {
    const first = bag && Object.values(bag)[0];
    if (!first) continue;
    if (first.description) return first.description;
    if (first.type === "objectIsLinked") {
      const kinds = new Set((first.linkedObjects ?? []).map((o) => o.object));
      if (kinds.has("Account") || kinds.has("Principal")) {
        return "ยังมีกล่องเมลอยู่ใต้โดเมนนี้ — ต้องลบกล่องเมลก่อน";
      }
      return "ยังมีข้อมูลอื่นผูกกับโดเมนนี้อยู่ ลบไม่ได้";
    }
    return first.type ? `เมลเซิร์ฟเวอร์ปฏิเสธคำขอ (${first.type})` : "เมลเซิร์ฟเวอร์ปฏิเสธคำขอ";
  }
  return null;
}

/**
 * เพิ่มโดเมนใหม่ — ตั้ง DKIM/ใบรับรองเป็น "อัตโนมัติ" เสมอ (ให้ Stalwart หมุนกุญแจ/ต่ออายุเอง)
 * ส่วน DNS เป็น `Manual` เพราะโดเมนอยู่กับผู้ให้บริการของลูกค้า เราตั้งให้ไม่ได้
 */
export async function createMailDomain(config: MailAdminConfig, rawName: string): Promise<string> {
  const name = normalizeDomainName(rawName);
  if (!name) throw new MailAdminError("ชื่อโดเมนไม่ถูกต้อง");

  // ใบรับรองอัตโนมัติต้องผูกกับ ACME provider ที่มีอยู่จริง — ไม่ส่ง id ไป Stalwart ตอบ
  // "ACME provider not found" · ถ้าเครื่องยังไม่ได้ตั้ง ACME เลย ให้สร้างแบบ Manual ไปก่อน
  // (โดเมนใช้งานได้ ค่อยมาเปิดใบรับรองทีหลัง ดีกว่าเพิ่มโดเมนไม่ได้เลย)
  const acme = await adminRequest(config, [
    ["x:AcmeProvider/query", { accountId: ADMIN_ACCOUNT_ID }, "acme"],
  ]);
  const acmeRes = resultOf(acme, "acme");
  const acmeProviderId = Array.isArray(acmeRes?.ids)
    ? ((acmeRes.ids as unknown[]).find((v): v is string => typeof v === "string") ?? null)
    : null;

  const responses = await adminRequest(config, [
    [
      "x:Domain/set",
      {
        accountId: ADMIN_ACCOUNT_ID,
        create: {
          new: {
            name,
            isEnabled: true,
            dkimManagement: { "@type": "Automatic" },
            certificateManagement: acmeProviderId
              ? {
                  "@type": "Automatic",
                  acmeProviderId,
                  // ยังไม่ขอใบรับรองให้ subdomain (autoconfig/mta-sts) เพราะ DNS ของลูกค้า
                  // ยังไม่ชี้มาที่เรา — ACME จะ challenge ไม่ผ่านแล้วเข้าลูป retry
                  subjectAlternativeNames: {},
                }
              : { "@type": "Manual" },
            dnsManagement: { "@type": "Manual" },
          },
        },
      },
      "create",
    ],
  ]);

  const res = resultOf(responses, "create");
  const error = firstSetError(res);
  if (error) throw new MailAdminError(error);
  const created = res?.created as Record<string, { id?: string }> | undefined;
  const id = created?.new?.id;
  if (!id) throw new MailAdminError("สร้างโดเมนแล้วแต่ไม่ได้รหัสกลับมา");
  return id;
}

/**
 * ลบโดเมน — ใช้ตอนพิมพ์ผิด/ทดสอบ
 *
 * ⚠️ ต้องลบลายเซ็น DKIM ที่ผูกกับโดเมนก่อนเสมอ ไม่งั้น Stalwart ตอบ `objectIsLinked` ทุกครั้ง
 *    (เราตั้ง DKIM เป็น Automatic ⇒ ทุกโดเมนมีลายเซ็นติดมาตั้งแต่วินาทีแรก = ลบไม่ได้เลย)
 *    ส่วนกล่องเมลไม่ลบให้อัตโนมัติ — ข้อมูลของลูกค้าต้องให้คนตัดสินใจลบเอง
 */
export async function deleteMailDomain(config: MailAdminConfig, id: string): Promise<void> {
  const dkim = await adminRequest(config, [
    ["x:DkimSignature/get", { accountId: ADMIN_ACCOUNT_ID }, "dkim"],
  ]);
  const dkimIds = listOf<Record<string, unknown>>(dkim, "dkim")
    .filter((s) => asString(s.domainId) === id)
    .map((s) => asString(s.id))
    .filter((v): v is string => !!v);

  if (dkimIds.length > 0) {
    const dropped = await adminRequest(config, [
      ["x:DkimSignature/set", { accountId: ADMIN_ACCOUNT_ID, destroy: dkimIds }, "dropDkim"],
    ]);
    const dkimError = firstSetError(resultOf(dropped, "dropDkim"));
    if (dkimError) throw new MailAdminError(`ลบลายเซ็น DKIM ของโดเมนไม่สำเร็จ — ${dkimError}`);
  }

  const responses = await adminRequest(config, [
    ["x:Domain/set", { accountId: ADMIN_ACCOUNT_ID, destroy: [id] }, "destroy"],
  ]);
  const error = firstSetError(resultOf(responses, "destroy"));
  if (error) throw new MailAdminError(error);
}

// ─── เขียน: กล่องเมล (บัญชีผู้ใช้) ───────────────────────────────────────────

/**
 * ตัวอักษรที่ใช้สุ่มรหัสผ่าน — **ตัดตัวที่อ่านสับสน** (0/O, 1/l/I) ออก
 * เพราะรหัสนี้ถูกอ่าน/พิมพ์ต่อทางโทรศัพท์หรือ LINE จริง ๆ
 */
const PASSWORD_ALPHABET = "abcdefghijkmnopqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789";
const PASSWORD_LENGTH = 16;

/**
 * รหัสผ่านของกล่องเมล **ระบบเป็นคนสุ่มเสมอ** ไม่ให้แอดมินตั้งเอง
 * (แอดมินตั้งเองมักได้รหัสซ้ำ/เดาง่าย และกลายเป็นรหัสที่ "มีคนอื่นรู้" ตั้งแต่วันแรก)
 * · คืนค่าเพียงครั้งเดียวตอนสร้าง/รีเซ็ต — **ห้ามเก็บ ห้าม log ห้ามส่งเข้า Sentry**
 */
export function generateMailPassword(): string {
  let out = "";
  for (let i = 0; i < PASSWORD_LENGTH; i += 1) {
    out += PASSWORD_ALPHABET[randomInt(PASSWORD_ALPHABET.length)];
  }
  return out;
}

/** ชื่อกล่อง (ส่วนหน้า @) ตาม RFC ที่ Stalwart รับจริง — กันช่องว่าง/อักขระแปลก */
const LOCAL_PART_RE = /^[a-z0-9]([a-z0-9._-]{0,62}[a-z0-9])?$/;

export function normalizeLocalPart(raw: string): string | null {
  const name = raw.trim().toLowerCase().replace(/^@/, "").split("@")[0];
  return LOCAL_PART_RE.test(name) ? name : null;
}

export interface CreateMailAccountInput {
  localPart: string;
  domainId: string;
  displayName?: string | null;
  /** เพดานพื้นที่เป็นไบต์ · ไม่ส่ง = ไม่จำกัด */
  quotaBytes?: number | null;
}

export async function createMailAccount(
  config: MailAdminConfig,
  input: CreateMailAccountInput,
): Promise<{ id: string; password: string }> {
  const name = normalizeLocalPart(input.localPart);
  if (!name) throw new MailAdminError("ชื่อกล่องเมลไม่ถูกต้อง (ใช้ a-z 0-9 . _ - เท่านั้น)");
  if (!input.domainId) throw new MailAdminError("ต้องเลือกโดเมน");

  const password = generateMailPassword();
  const quotas =
    typeof input.quotaBytes === "number" && input.quotaBytes > 0
      ? { maxDiskQuota: Math.floor(input.quotaBytes) }
      : {};

  const responses = await adminRequest(config, [
    [
      "x:Account/set",
      {
        accountId: ADMIN_ACCOUNT_ID,
        create: {
          new: {
            "@type": "User",
            name,
            domainId: input.domainId,
            description: input.displayName?.trim() || null,
            roles: { "@type": "User" },
            credentials: { "0": { "@type": "Password", secret: password } },
            quotas,
          },
        },
      },
      "create",
    ],
  ]);

  const res = resultOf(responses, "create");
  const error = firstSetError(res);
  if (error) throw new MailAdminError(error);
  const created = res?.created as Record<string, { id?: string }> | undefined;
  const id = created?.new?.id;
  if (!id) throw new MailAdminError("สร้างกล่องเมลแล้วแต่ไม่ได้รหัสกลับมา");
  return { id, password };
}

/**
 * ตั้งรหัสผ่านใหม่ — **เป็นการเขียนทับ ไม่ใช่การอ่านของเดิม**
 * (Stalwart คืน `secret` เป็น `****` เสมอ อ่านรหัสเก่าไม่ได้ตั้งแต่ต้น ซึ่งถูกต้องแล้ว)
 */
export async function resetMailAccountPassword(
  config: MailAdminConfig,
  id: string,
): Promise<{ password: string }> {
  const password = generateMailPassword();
  const responses = await adminRequest(config, [
    [
      "x:Account/set",
      {
        accountId: ADMIN_ACCOUNT_ID,
        update: { [id]: { credentials: { "0": { "@type": "Password", secret: password } } } },
      },
      "reset",
    ],
  ]);
  const res = resultOf(responses, "reset");
  const notUpdated = res?.notUpdated as Record<string, SetErrorEntry> | undefined;
  const first = notUpdated && Object.values(notUpdated)[0];
  if (first) throw new MailAdminError(first.description ?? "ตั้งรหัสผ่านใหม่ไม่สำเร็จ");
  return { password };
}

/**
 * แปลงรายการนามแฝงเป็น objectList ของ Stalwart (คีย์ "0","1",… ไม่ใช่อาร์เรย์)
 * ตรวจรูปแบบ/ซ้ำกันเองตั้งแต่ที่นี่ — เขียนไปแล้วชนกันทีหลัง Stalwart ปฏิเสธทั้งชุด
 */
function buildAliasObjectList(
  aliases: { name: string; domainId: string; enabled?: boolean }[],
): Record<string, unknown> {
  const seen = new Set<string>();
  const objectList: Record<string, unknown> = {};
  aliases.forEach((alias, index) => {
    const name = normalizeLocalPart(alias.name);
    if (!name)
      throw new MailAdminError(`นามแฝง "${alias.name}" ไม่ถูกต้อง (ใช้ a-z 0-9 . _ - เท่านั้น)`);
    if (!alias.domainId) throw new MailAdminError("นามแฝงต้องเลือกโดเมน");
    const key = `${name}@${alias.domainId}`;
    if (seen.has(key)) throw new MailAdminError(`นามแฝง "${name}" ซ้ำในรายการ`);
    seen.add(key);
    objectList[String(index)] = {
      name,
      domainId: alias.domainId,
      enabled: alias.enabled !== false,
      description: null,
    };
  });
  return objectList;
}

/**
 * แก้ชื่อที่แสดง / โควตา / นามแฝง — ชื่อกล่องกับโดเมนเปลี่ยนไม่ได้ (เท่ากับเปลี่ยนที่อยู่อีเมล)
 *
 * ⚠️ ทุกอย่างต้องไปใน `x:Account/set` **ครั้งเดียว** — เคยแยกเป็น 2 คำขอ (ข้อมูลทั่วไป แล้วค่อย
 *    นามแฝง) ซึ่งถ้าคำขอหลังพัง (เช่นนามแฝงชนกับที่อยู่ที่มีอยู่) ชื่อ/โควตาจะถูกบันทึกไปแล้ว
 *    ทั้งที่หน้าเว็บขึ้นว่า "บันทึกไม่สำเร็จ" = ผู้ใช้เห็นสถานะไม่ตรงกับของจริง
 *
 * นามแฝงเป็น **การเขียนทับทั้งชุด** (objectList แก้ทีละรายการไม่ได้) ⇒ ผู้เรียกต้องส่งรายการเต็ม
 * ที่ต้องการเสมอ · ส่งมาไม่ครบ = นามแฝงที่หายไปถูกลบจริง
 */
export async function updateMailAccount(
  config: MailAdminConfig,
  id: string,
  patch: {
    displayName?: string | null;
    quotaBytes?: number | null;
    aliases?: { name: string; domainId: string; enabled?: boolean }[];
  },
): Promise<void> {
  const update: Record<string, unknown> = {};
  if (patch.displayName !== undefined) update.description = patch.displayName?.trim() || null;
  if (patch.quotaBytes !== undefined) {
    update.quotas =
      typeof patch.quotaBytes === "number" && patch.quotaBytes > 0
        ? { maxDiskQuota: Math.floor(patch.quotaBytes) }
        : {};
  }
  if (patch.aliases !== undefined) update.aliases = buildAliasObjectList(patch.aliases);
  if (Object.keys(update).length === 0) return;

  const responses = await adminRequest(config, [
    ["x:Account/set", { accountId: ADMIN_ACCOUNT_ID, update: { [id]: update } }, "update"],
  ]);
  const res = resultOf(responses, "update");
  const notUpdated = res?.notUpdated as Record<string, SetErrorEntry> | undefined;
  const first = notUpdated && Object.values(notUpdated)[0];
  if (first) {
    // นามแฝงชนกับที่อยู่ที่มีอยู่แล้วคือสาเหตุที่เจอบ่อยสุดเมื่อบันทึกไม่ผ่าน
    throw new MailAdminError(
      first.description ??
        (patch.aliases ? "บันทึกไม่สำเร็จ — นามแฝงบางตัวอาจถูกใช้ไปแล้ว" : "บันทึกไม่สำเร็จ"),
    );
  }
}

/** ลบกล่องเมล — **เมลทั้งหมดในกล่องหายถาวร** ผู้เรียกต้องยืนยันกับคนก่อนเสมอ */
export async function deleteMailAccount(config: MailAdminConfig, id: string): Promise<void> {
  const responses = await adminRequest(config, [
    ["x:Account/set", { accountId: ADMIN_ACCOUNT_ID, destroy: [id] }, "destroy"],
  ]);
  const error = firstSetError(resultOf(responses, "destroy"));
  if (error) throw new MailAdminError(error);
}
