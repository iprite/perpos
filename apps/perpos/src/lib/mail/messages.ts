/**
 * แปลง JMAP ↔ DTO และ fetch logic ของโมดูลอีเมล — **ที่เดียว** (spec §5.1)
 *
 * กฎ:
 *  - `starred` ไม่ใช่ mailbox → ใช้ `hasKeyword: $flagged` ห้ามใช้ `inMailbox`
 *  - `total` มาจาก `Email/query` เท่านั้น ห้ามนับจาก array ที่โหลดมา
 *  - undo = คืนค่าเดิมรายฉบับ ไม่ใช่ "ทำตรงข้าม"
 *  - ห้าม cache ข้าม request (ทุกอย่างเป็น argument/ตัวแปรใน scope)
 */

import {
  INLINE_IMAGE_TYPES,
  MailServiceError,
  fetchBlob,
  jmapRequest,
  pickResponse,
  responseType,
  sanitizeAttachmentName,
  type JmapMethodCall,
} from "./jmap";
import { MAIL_BOX_LABELS, MAIL_BOX_ORDER, resolveBoxSelector } from "./boxes";
import {
  INLINE_BUDGET_BYTES,
  buildInlineImageMap,
  prepareMailHtml,
  type InlineImageSource,
} from "./sanitize";
import type {
  JmapBodyPart,
  JmapEmail,
  JmapEmailAddress,
  JmapMailbox,
  JmapThread,
  MailAddress,
  MailAttachment,
  MailMessageDetail,
  MailThreadDetail,
  MailBoxKey,
  MailBulkAction,
  MailListParams,
  MailListResult,
  MailMessage,
  MailScope,
  MailSession,
  MailUndoItem,
  MailUndoToken,
  MailboxRole,
  MailboxSummary,
} from "./types";

const ROLE_KEYS: MailboxRole[] = ["inbox", "sent", "drafts", "archive", "junk", "trash"];

export const EMAIL_LIST_PROPERTIES = [
  "id",
  "threadId",
  "mailboxIds",
  "from",
  "subject",
  "preview",
  "receivedAt",
  "keywords",
  "size",
  "hasAttachment",
  // ชื่อไฟล์แนบสำหรับชิปในรายการ (แบบ Gmail) — ดู `LIST_ATTACHMENT_MAX`
  "attachments",
];

/** โชว์ชิปไฟล์แนบไม่เกินกี่ตัวต่อแถว — เกินกว่านี้แถวจะยาวกว่าหัวเรื่องเอง */
export const LIST_ATTACHMENT_MAX = 3;

/**
 * header ที่บอกว่า "เมลฉบับนี้ผ่านการตรวจอะไรมาบ้าง" — ชุดที่เจอจริงในทุกเซิร์ฟเวอร์หลัก
 * (Stalwart ของเราเขียน `X-Spam-*` · ผู้ส่งภายนอกอาจติด `Authentication-Results`/`Received-SPF` มาด้วย)
 */
export const SECURITY_HEADERS = [
  "X-Spam-Status",
  "X-Spam-Result",
  "X-Spam-Score",
  "X-Spam-Flag",
  "Authentication-Results",
  "Received-SPF",
] as const;

const SECURITY_HEADER_PROPERTIES = SECURITY_HEADERS.map((h) => `header:${h}:asText`);

export const EMAIL_DETAIL_PROPERTIES = [
  "id",
  "threadId",
  "mailboxIds",
  "from",
  "to",
  "cc",
  "subject",
  "receivedAt",
  "keywords",
  "size",
  "hasAttachment",
  "htmlBody",
  "textBody",
  "attachments",
  "bodyValues",
  // M2 — ต่อเธรดตอนตอบ (ผิดแล้วผู้รับเห็นเป็นเมลใหม่ลอย ๆ แก้ย้อนหลังไม่ได้)
  "messageId",
  "references",
  // ผลตรวจของเมลเซิร์ฟเวอร์ (ตัวกรองสแปม + SPF/DKIM/DMARC) — โชว์ดิบ ๆ ให้ผู้ใช้ตัดสินเอง
  // ⚠️ **ห้าม parse แล้วสรุปเอง** ชื่อ/รูปแบบ header ต่างกันตามเซิร์ฟเวอร์ที่ส่งมา
  ...SECURITY_HEADER_PROPERTIES,
];

export const MAX_BODY_VALUE_BYTES = 1024 * 1024;

export class MailArchiveError extends Error {
  constructor(message = "ยังสร้างกล่องคลังเก็บไม่ได้") {
    super(message);
    this.name = "MailArchiveError";
  }
}

// ─── mailbox ─────────────────────────────────────────────────────────────────

export function buildMailboxSummaries(boxes: JmapMailbox[]): MailboxSummary[] {
  const byRole = new Map<string, JmapMailbox>();
  for (const box of boxes) {
    const role = (box.role ?? "").toLowerCase();
    if (role && ROLE_KEYS.includes(role as MailboxRole) && !byRole.has(role)) {
      byRole.set(role, box);
    }
  }
  // archive อาจไม่มี role แต่มีชื่อ Archive ที่ระดับบนสุด (เราสร้างเอง §5.2)
  if (!byRole.has("archive")) {
    const named = boxes.find(
      (b) => b.parentId === null && (b.name ?? "").trim().toLowerCase() === "archive",
    );
    if (named) byRole.set("archive", named);
  }

  const summaries: MailboxSummary[] = [];
  for (const key of MAIL_BOX_ORDER) {
    if (key === "starred") {
      // ไม่ใช่ mailbox → ไม่มีตัวเลขให้ถาม (null ไม่ใช่ 0)
      summaries.push({
        id: "starred",
        key,
        role: null,
        name: MAIL_BOX_LABELS.starred,
        unreadCount: null,
        totalCount: null,
      });
      continue;
    }
    const box = byRole.get(key);
    // role ที่ไม่มีจริงบนเซิร์ฟเวอร์ → ซ่อนเมนูนั้นไปเลย
    if (!box) continue;
    summaries.push({
      id: box.id,
      key,
      role: key as MailboxRole,
      name: MAIL_BOX_LABELS[key],
      unreadCount: typeof box.unreadEmails === "number" ? box.unreadEmails : null,
      totalCount: typeof box.totalEmails === "number" ? box.totalEmails : null,
    });
  }
  return summaries;
}

export async function fetchMailboxes(session: MailSession): Promise<JmapMailbox[]> {
  const responses = await jmapRequest(session, [
    ["Mailbox/get", { accountId: session.accountId, ids: null }, "m"],
  ]);
  const list = pickResponse(responses, "m").list as JmapMailbox[] | undefined;
  return Array.isArray(list) ? list : [];
}

export function mailboxIdByKey(boxes: JmapMailbox[]): Partial<Record<MailBoxKey, string>> {
  const map: Partial<Record<MailBoxKey, string>> = {};
  for (const s of buildMailboxSummaries(boxes)) {
    if (s.key !== "starred") map[s.key] = s.id;
  }
  return map;
}

// ─── filter ──────────────────────────────────────────────────────────────────

export function buildFilter(
  params: Pick<MailListParams, "box" | "q" | "unread" | "attachment" | "searchScope">,
  ids: Partial<Record<MailBoxKey, string>>,
  /** id ของ mailbox ที่มีจริงบนเซิร์ฟเวอร์ — ต้องส่งมาเมื่อเปิดโฟลเดอร์ที่ผู้ใช้สร้างเอง (M3) */
  knownMailboxIds?: ReadonlySet<string>,
  /** `false` = ไม่ใส่เงื่อนไขคำค้นลง filter (ขอบเขตกล่องยังเหมือนกัน) — ใช้ตอนสแกนหาข้อความเอง */
  opts: { includeText?: boolean } = {},
): Record<string, unknown> {
  const conditions: Record<string, unknown>[] = [];
  const selector = resolveBoxSelector(params.box);
  const q = (params.q ?? "").trim();

  /**
   * ค้นหา = ค้น **ทั้งกล่องเมล** เป็นค่าเริ่มต้น (แบบ Gmail)
   *
   * เดิม AND กับกล่องที่เปิดอยู่เสมอ ⇒ เมลที่กฎกรองย้ายเข้าโฟลเดอร์ไปแล้ว "ค้นไม่เจอ" ตลอดกาล
   * ถ้ายืนอยู่กล่องขาเข้า — เป็นสาเหตุจริงที่ผู้ใช้บอกว่าค้นหาไม่ได้ (2026-08-19)
   *
   * ยกเว้น 2 อย่าง:
   *  - ผู้ใช้เลือก "กล่องนี้" เอง (`searchScope: "box"`)
   *  - ยืนอยู่ในถังขยะ/จดหมายขยะ → ค้นในกล่องนั้นตามที่เห็น (ไม่ใช่ทั้งระบบ)
   */
  const inTrashOrJunk =
    selector.kind === "system" && (selector.key === "trash" || selector.key === "junk");
  const searchEverywhere = !!q && (params.searchScope ?? "all") === "all" && !inTrashOrJunk;

  if (searchEverywhere) {
    // ของที่ทิ้ง/ถูกคัดว่าเป็นขยะไปแล้ว ไม่ควรโผล่ปนผลค้นหาโดยที่ผู้ใช้ไม่ได้ขอ
    const excluded = [ids.trash, ids.junk].filter((id): id is string => !!id);
    if (excluded.length > 0) {
      conditions.push({
        operator: "NOT",
        conditions: excluded.map((id) => ({ inMailbox: id })),
      });
    }
  } else if (selector.kind === "folder") {
    // id ที่ไม่มีจริง = 404 เสมอ ห้ามปล่อยผ่านไปให้เซิร์ฟเวอร์ตอบรายการว่างเปล่า (ผู้ใช้จะนึกว่าเมลหาย)
    if (!knownMailboxIds?.has(selector.mailboxId)) {
      throw new MailServiceError(404, "ไม่พบโฟลเดอร์นี้ในกล่องเมล");
    }
    conditions.push({ inMailbox: selector.mailboxId });
  } else if (selector.key === "starred") {
    conditions.push({ hasKeyword: "$flagged" });
  } else {
    const mailboxId = ids[selector.key];
    if (!mailboxId) throw new MailServiceError(404, "ไม่พบโฟลเดอร์นี้ในกล่องเมล");
    conditions.push({ inMailbox: mailboxId });
  }

  if (params.unread) conditions.push({ notKeyword: "$seen" });
  if (params.attachment) conditions.push({ hasAttachment: true });
  if (q && opts.includeText !== false) conditions.push({ text: q });

  if (conditions.length === 0) return {};
  if (conditions.length === 1) return conditions[0]!;
  return { operator: "AND", conditions };
}

// ─── mapping ─────────────────────────────────────────────────────────────────

export function mapAddress(addr: JmapEmailAddress | null | undefined): MailAddress | null {
  if (!addr?.email) return null;
  return { name: addr.name?.trim() ? addr.name.trim() : null, email: addr.email };
}

export function mapAddresses(list: JmapEmailAddress[] | null | undefined): MailAddress[] {
  if (!Array.isArray(list)) return [];
  return list.map(mapAddress).filter((a): a is MailAddress => a !== null);
}

export function mapEmailToMessage(email: JmapEmail, threadCount = 1): MailMessage {
  const keywords = email.keywords ?? {};
  return {
    id: email.id,
    threadId: email.threadId ?? email.id,
    mailboxIds: Object.keys(email.mailboxIds ?? {}).filter((k) => email.mailboxIds?.[k]),
    from: mapAddress(email.from?.[0]),
    subject: (email.subject ?? "").trim() || "(ไม่มีหัวเรื่อง)",
    preview: (email.preview ?? "").trim(),
    receivedAt: email.receivedAt ?? new Date(0).toISOString(),
    isUnread: !keywords["$seen"],
    isFlagged: !!keywords["$flagged"],
    hasAttachment: !!email.hasAttachment,
    ...listAttachmentChips(email),
    sizeBytes: typeof email.size === "number" ? email.size : 0,
    threadCount: threadCount > 0 ? threadCount : 1,
  };
}

/**
 * ไฟล์แนบที่เอาไปทำ "ชิป" ในรายการ
 *
 * 🔴 **ต้องตัดรูป inline ทิ้ง** — JMAP นับ part ที่ฝังในเนื้อเมล (โลโก้/สเปเซอร์/พิกเซลติดตาม)
 *    รวมอยู่ใน `attachments` ด้วย ถ้าไม่กรอง จดหมายข่าวทุกฉบับจะขึ้นชิป `logo.png` `pixel.gif`
 *    ทั้งที่ผู้ใช้ไม่ได้รับไฟล์อะไรเลย (และ `hasAttachment` ของฉบับนั้นเป็น false ด้วยซ้ำ)
 *
 * ส่ง `blobId` มาด้วย (ชิปกดดูตัวอย่าง/ดาวน์โหลดได้) — ปลอดภัยเพราะ route ไฟล์แนบผูกกับ
 * session ของเจ้าของกล่องเมลเสมอ และยัง allowlist ชนิดไฟล์ที่แสดง inline ได้เหมือนเดิม
 */
export function listAttachmentChips(email: JmapEmail): {
  attachments: MailAttachment[];
  attachmentCount: number;
} {
  const real = (email.attachments ?? []).filter((p) => {
    if (!p.blobId) return false;
    const part = p as { disposition?: string | null; cid?: string | null };
    if (part.cid) return false;
    return (part.disposition ?? "attachment").toLowerCase() !== "inline";
  });
  return {
    attachments: real.slice(0, LIST_ATTACHMENT_MAX).map((p) => ({
      blobId: p.blobId as string,
      name: sanitizeAttachmentName(p.name),
      type: (p.type ?? "application/octet-stream").split(";")[0]?.trim() ?? "",
      sizeBytes: typeof p.size === "number" ? p.size : 0,
    })),
    attachmentCount: real.length,
  };
}

export function threadCountMap(threads: JmapThread[] | undefined): Record<string, number> {
  const map: Record<string, number> = {};
  for (const t of threads ?? []) {
    map[t.id] = Array.isArray(t.emailIds) ? t.emailIds.length : 1;
  }
  return map;
}

// ─── ค้นหาแบบ "มีข้อความนี้อยู่ข้างใน" (fallback) ─────────────────────────────

/**
 * ดัชนีค้นหาของเมลเซิร์ฟเวอร์ตัดคำด้วย **ช่องว่าง** และไม่รองรับคำบางส่วน/ไวลด์การ์ด
 * (ยืนยันกับ Stalwart จริง 2026-08-19: `tiktok` เจอ · `tik` ไม่เจอ · `tik*` ไม่เจอ
 *  · `คือรหัส` เจอ แต่ `รหัส` ไม่เจอ เพราะไทยเขียนติดกันจึงเป็นคำเดียวทั้งก้อน)
 *
 * ⇒ ถ้าค้นด้วยดัชนีแล้ว **ไม่เจอเลย** ให้สแกนหาข้อความบางส่วนจากหัวเรื่อง/ผู้ส่ง/ตัวอย่างเนื้อหา
 *   ของเมลล่าสุด `SEARCH_SCAN_LIMIT` ฉบับแทน — ผู้ใช้พิมพ์ "tik" แล้วต้องเจอ TikTok
 *
 * ทำเฉพาะตอน "ไม่เจอเลย" เท่านั้น (ทางปกติต้องเร็วเหมือนเดิม) และ **มีเพดานเสมอ**
 * — สแกนทั้งกล่องเมลที่มีหมื่นฉบับ = คำขอเดียวลาก metadata หลายสิบ MB
 */
export const SEARCH_SCAN_LIMIT = 500;

/** ตัดช่องว่าง + ตัวพิมพ์ใหญ่-เล็ก ให้เทียบแบบ "มีอยู่ข้างใน" ได้ทั้งไทยและอังกฤษ */
function normalizeForScan(value: string): string {
  return value.trim().toLowerCase();
}

export function messageMatchesText(m: MailMessage, needle: string): boolean {
  const q = normalizeForScan(needle);
  if (!q) return false;
  const haystack = [
    m.subject,
    m.preview,
    m.from?.name ?? "",
    m.from?.email ?? "",
    ...m.attachments.map((a) => a.name),
  ]
    .join(" ")
    .toLowerCase();
  return haystack.includes(q);
}

// ─── รายการเมล ───────────────────────────────────────────────────────────────

export async function listMessages(
  session: MailSession,
  params: MailListParams,
): Promise<MailListResult> {
  const boxes = await fetchMailboxes(session);
  const filter = buildFilter(params, mailboxIdByKey(boxes), new Set(boxes.map((b) => b.id)));
  const limit = Math.min(Math.max(params.limit ?? 50, 1), 100);

  const queryArgs: Record<string, unknown> = {
    accountId: session.accountId,
    filter,
    sort: [{ property: "receivedAt", isAscending: false }],
    collapseThreads: true,
    calculateTotal: true,
    limit,
  };
  if (params.anchor) {
    queryArgs.anchor = params.anchor;
    queryArgs.anchorOffset = params.anchorOffset ?? 1;
  } else {
    queryArgs.position = Math.max(params.position ?? 0, 0);
  }

  const calls: JmapMethodCall[] = [
    ["Email/query", queryArgs, "q"],
    [
      "Email/get",
      {
        accountId: session.accountId,
        "#ids": { resultOf: "q", name: "Email/query", path: "/ids" },
        properties: EMAIL_LIST_PROPERTIES,
        // ขอเฉพาะฟิลด์ที่ชิปต้องใช้ — ของทั้งก้อนหนักโดยไม่จำเป็น (25 แถว × ไฟล์แนบหลายตัว)
        // `disposition`/`cid` จำเป็นสำหรับกรองรูป inline ออก (ดู `listAttachmentChips`)
        bodyProperties: ["blobId", "name", "type", "size", "disposition", "cid"],
      },
      "g",
    ],
    [
      "Thread/get",
      {
        accountId: session.accountId,
        "#ids": { resultOf: "g", name: "Email/get", path: "/list/*/threadId" },
      },
      "t",
    ],
  ];

  const responses = await jmapRequest(session, calls);
  const query = pickResponse(responses, "q");
  const emails = (pickResponse(responses, "g").list as JmapEmail[] | undefined) ?? [];
  const threads = (pickResponse(responses, "t").list as JmapThread[] | undefined) ?? [];
  const counts = threadCountMap(threads);

  const messages = emails.map((e) => mapEmailToMessage(e, counts[e.threadId ?? ""] ?? 1));
  const total = typeof query.total === "number" ? query.total : null;
  const position = typeof query.position === "number" ? query.position : 0;
  const hasMore = total !== null ? position + messages.length < total : messages.length === limit;

  const q = (params.q ?? "").trim();
  // ดัชนีหาไม่เจอ + เป็นหน้าแรกของการค้น → ลองสแกนหาข้อความบางส่วนให้ (ดู SEARCH_SCAN_LIMIT)
  if (q && messages.length === 0 && !params.anchor && (params.position ?? 0) === 0) {
    return scanMessagesByText(session, params, boxes, limit, q);
  }

  return {
    messages,
    total,
    hasMore,
    queryState: typeof query.queryState === "string" ? query.queryState : null,
  };
}

/** สแกนเมลล่าสุด `SEARCH_SCAN_LIMIT` ฉบับในขอบเขตเดิม แล้วกรองด้วย "มีข้อความนี้อยู่ข้างใน" */
async function scanMessagesByText(
  session: MailSession,
  params: MailListParams,
  boxes: JmapMailbox[],
  limit: number,
  q: string,
): Promise<MailListResult> {
  const filter = buildFilter(params, mailboxIdByKey(boxes), new Set(boxes.map((b) => b.id)), {
    includeText: false,
  });

  const responses = await jmapRequest(session, [
    [
      "Email/query",
      {
        accountId: session.accountId,
        filter,
        sort: [{ property: "receivedAt", isAscending: false }],
        collapseThreads: true,
        calculateTotal: true,
        limit: SEARCH_SCAN_LIMIT,
        position: 0,
      },
      "q",
    ],
    [
      "Email/get",
      {
        accountId: session.accountId,
        "#ids": { resultOf: "q", name: "Email/query", path: "/ids" },
        properties: EMAIL_LIST_PROPERTIES,
        bodyProperties: ["blobId", "name", "type", "size", "disposition", "cid"],
      },
      "g",
    ],
  ]);

  const query = pickResponse(responses, "q");
  const emails = (pickResponse(responses, "g").list as JmapEmail[] | undefined) ?? [];
  const scanned = emails.length;
  const scannedTotal = typeof query.total === "number" ? query.total : scanned;
  const matched = emails.map((e) => mapEmailToMessage(e)).filter((m) => messageMatchesText(m, q));

  return {
    messages: matched.slice(0, limit),
    total: matched.length,
    hasMore: matched.length > limit,
    queryState: null,
    /** บอกหน้าเว็บว่าผลนี้มาจากการสแกน ไม่ใช่ดัชนี — และสแกนไม่ครบทั้งกล่องหรือเปล่า */
    scan: { scanned, truncated: scannedTotal > scanned },
  };
}

// ─── กล่องคลังเก็บ (ต้องสร้างเอง — §5.2) ─────────────────────────────────────

/** idempotent + lazy: เรียกตอนกด archive ครั้งแรกเท่านั้น ห้ามเรียกตอนโหลดหน้า */
export async function ensureArchiveMailbox(session: MailSession): Promise<string> {
  const boxes = await fetchMailboxes(session);
  const existing = mailboxIdByKey(boxes).archive;
  if (existing) return existing;

  const create = async (withRole: boolean) => {
    const props: Record<string, unknown> = { name: "Archive", parentId: null };
    if (withRole) props.role = "archive";
    const responses = await jmapRequest(session, [
      ["Mailbox/set", { accountId: session.accountId, create: { archive: props } }, "s"],
    ]);
    if (responseType(responses, "s") === "error") return null;
    const result = pickResponse(responses, "s");
    const created = (result.created as Record<string, { id?: string }> | undefined)?.archive;
    return created?.id ?? null;
  };

  const withRole = await create(true);
  if (withRole) return withRole;
  const plain = await create(false);
  if (plain) return plain;
  throw new MailArchiveError();
}

// ─── สถานะเดิม (สำหรับ undo) + การกระทำ ──────────────────────────────────────

export function toUndoItem(email: JmapEmail): MailUndoItem {
  const keywords = email.keywords ?? {};
  return {
    id: email.id,
    mailboxIds: Object.keys(email.mailboxIds ?? {}).filter((k) => email.mailboxIds?.[k]),
    wasUnread: !keywords["$seen"],
    wasFlagged: !!keywords["$flagged"],
  };
}

/** ขยายรายการ id ตาม scope แล้วอ่านสถานะเดิมของทุกฉบับที่จะถูกแตะ */
export async function resolveTargets(
  session: MailSession,
  ids: string[],
  by: MailScope,
): Promise<MailUndoItem[]> {
  if (ids.length === 0) return [];
  const props = ["id", "threadId", "mailboxIds", "keywords"];
  const calls: JmapMethodCall[] = [
    ["Email/get", { accountId: session.accountId, ids, properties: props }, "a"],
  ];
  if (by === "thread") {
    calls.push([
      "Thread/get",
      {
        accountId: session.accountId,
        "#ids": { resultOf: "a", name: "Email/get", path: "/list/*/threadId" },
      },
      "b",
    ]);
    calls.push([
      "Email/get",
      {
        accountId: session.accountId,
        "#ids": { resultOf: "b", name: "Thread/get", path: "/list/*/emailIds" },
        properties: props,
      },
      "c",
    ]);
  }
  const responses = await jmapRequest(session, calls);
  const list =
    (pickResponse(responses, by === "thread" ? "c" : "a").list as JmapEmail[] | undefined) ?? [];
  return list.map(toUndoItem);
}

export interface MailPatch {
  isUnread?: boolean;
  isFlagged?: boolean;
  moveTo?: "archive" | "trash" | "inbox";
  /** M3 — ย้ายเข้ากล่องใด ๆ ด้วย id (โฟลเดอร์ที่ผู้ใช้สร้างเอง) · ใช้คู่กับ `moveTo` ไม่ได้ */
  moveToMailboxId?: string;
}

/** แปลง action/patch → update ของ Email/set (pure — มีเทสคุม) */
export function buildUpdatePatch(
  patch: MailPatch,
  targetMailboxId: string | null,
): Record<string, unknown> {
  const update: Record<string, unknown> = {};
  if (patch.isUnread !== undefined) update["keywords/$seen"] = patch.isUnread ? null : true;
  if (patch.isFlagged !== undefined) update["keywords/$flagged"] = patch.isFlagged ? true : null;
  if ((patch.moveTo || patch.moveToMailboxId) && targetMailboxId) {
    update.mailboxIds = { [targetMailboxId]: true };
  }
  return update;
}

export function actionToPatch(action: MailBulkAction, mailboxId?: string): MailPatch {
  switch (action) {
    case "read":
      return { isUnread: false };
    case "unread":
      return { isUnread: true };
    case "star":
      return { isFlagged: true };
    case "unstar":
      return { isFlagged: false };
    case "archive":
      return { moveTo: "archive" };
    case "trash":
      return { moveTo: "trash" };
    case "move":
      if (!mailboxId) throw new MailServiceError(400, "ยังไม่ได้เลือกโฟลเดอร์ปลายทาง");
      return { moveToMailboxId: mailboxId };
  }
}

export function patchToAction(patch: MailPatch): MailBulkAction {
  if (patch.moveToMailboxId) return "move";
  if (patch.moveTo === "trash") return "trash";
  if (patch.moveTo) return "archive";
  if (patch.isFlagged !== undefined) return patch.isFlagged ? "star" : "unstar";
  return patch.isUnread ? "unread" : "read";
}

/** undo = เขียนค่าเดิมกลับรายฉบับ (ห้าม "ทำตรงข้าม") */
export function buildUndoUpdates(token: MailUndoToken): Record<string, Record<string, unknown>> {
  const update: Record<string, Record<string, unknown>> = {};
  for (const item of token.items) {
    const mailboxIds: Record<string, boolean> = {};
    for (const id of item.mailboxIds) mailboxIds[id] = true;
    update[item.id] = {
      mailboxIds,
      "keywords/$seen": item.wasUnread ? null : true,
      "keywords/$flagged": item.wasFlagged ? true : null,
    };
  }
  return update;
}

async function runEmailSet(
  session: MailSession,
  update: Record<string, Record<string, unknown>>,
): Promise<number> {
  if (Object.keys(update).length === 0) return 0;
  const responses = await jmapRequest(session, [
    ["Email/set", { accountId: session.accountId, update }, "u"],
  ]);
  const result = pickResponse(responses, "u");
  const updated = result.updated as Record<string, unknown> | null | undefined;
  return updated ? Object.keys(updated).length : 0;
}

export interface MailMutationResult {
  affected: number;
  undo: MailUndoToken;
}

/** ใช้ทั้ง PATCH รายฉบับและ bulk — เก็บสถานะเดิมก่อนเสมอ */
export async function applyMailPatch(
  session: MailSession,
  args: { ids: string[]; by: MailScope; patch: MailPatch },
): Promise<MailMutationResult> {
  const items = await resolveTargets(session, args.ids, args.by);
  const action = patchToAction(args.patch);

  let targetMailboxId: string | null = null;
  if (args.patch.moveToMailboxId) {
    const boxes = await fetchMailboxes(session);
    // ต้องมีจริงบนเซิร์ฟเวอร์ ไม่งั้น `mailboxIds` ที่เขียนไปทำให้เมล "หายจากทุกกล่อง"
    if (!boxes.some((b) => b.id === args.patch.moveToMailboxId)) {
      throw new MailServiceError(404, "ไม่พบโฟลเดอร์ปลายทาง");
    }
    targetMailboxId = args.patch.moveToMailboxId;
  } else if (args.patch.moveTo === "archive") {
    targetMailboxId = await ensureArchiveMailbox(session);
  } else if (args.patch.moveTo) {
    const boxes = mailboxIdByKey(await fetchMailboxes(session));
    targetMailboxId = boxes[args.patch.moveTo] ?? null;
    if (!targetMailboxId) throw new MailServiceError(404, "ไม่พบโฟลเดอร์ปลายทาง");
  }

  const patchBody = buildUpdatePatch(args.patch, targetMailboxId);
  const update: Record<string, Record<string, unknown>> = {};
  for (const item of items) update[item.id] = patchBody;

  const affected = await runEmailSet(session, update);
  return { affected, undo: { action, by: args.by, items } };
}

export async function applyMailBulk(
  session: MailSession,
  args: { ids: string[]; action: MailBulkAction; by: MailScope; mailboxId?: string },
): Promise<MailMutationResult> {
  return applyMailPatch(session, {
    ids: args.ids,
    by: args.by,
    patch: actionToPatch(args.action, args.mailboxId),
  });
}

export async function applyMailUndo(
  session: MailSession,
  token: MailUndoToken,
): Promise<{ affected: number }> {
  const affected = await runEmailSet(session, buildUndoUpdates(token));
  return { affected };
}

// ─── บานอ่าน (เธรด) ──────────────────────────────────────────────────────────

const MAX_INLINE_IMAGES = 12;

function bodyValueOf(email: JmapEmail, parts: JmapBodyPart[] | undefined): string | null {
  const partId = parts?.find((p) => p.partId)?.partId;
  if (!partId) return null;
  return email.bodyValues?.[partId]?.value ?? null;
}

function normalizeCid(cid: string | null | undefined): string {
  return (cid ?? "").replace(/^</, "").replace(/>$/, "").trim();
}

export function mapAttachments(email: JmapEmail): MailAttachment[] {
  return (email.attachments ?? [])
    .filter((p) => !!p.blobId)
    .map((p) => ({
      blobId: p.blobId as string,
      name: sanitizeAttachmentName(p.name),
      type: (p.type ?? "application/octet-stream").split(";")[0]?.trim() ?? "",
      sizeBytes: typeof p.size === "number" ? p.size : 0,
    }));
}

/** เพดานต่อรูป — ใหญ่กว่านี้ไม่ inline (ยังเปิดเป็นไฟล์แนบได้ตามปกติ) */
const MAX_INLINE_IMAGE_BYTES = 4 * 1024 * 1024;

/**
 * เพดานจำนวนฉบับที่ "กาง" ในบานอ่านต่อหนึ่งคำขอ
 * เธรด mailing list มีเป็นร้อยฉบับได้ — ถ้าแมปทุกฉบับ ต้องดึง body ฉบับละ ≤1MB + รูป inline อีก
 * ⇒ ชน memory/timeout ของ serverless แล้ว **เมลฉบับนั้นเปิดไม่ได้ถาวร**
 */
export const MAX_THREAD_MESSAGES = 30;

/** งบรูป inline ที่แชร์กันทั้งคำขอ (ไม่ใช่ต่อฉบับ) — mutable โดยตั้งใจ ส่งต่อเป็น reference */
export interface InlineBudget {
  remaining: number;
}

/**
 * งบรวมของ "ไบต์ดิบที่ยอมดาวน์โหลด" — ต้องต่ำกว่างบตอนประกอบ data: (`INLINE_BUDGET_BYTES`)
 * เพราะ base64 พองราว 4/3 เท่า · คิดจาก `part.size` **ก่อน** ยิง `fetchBlob` เสมอ
 */
const INLINE_FETCH_BUDGET_BYTES = Math.floor((INLINE_BUDGET_BYTES * 3) / 4);

/**
 * อ่าน blob โดยนับ byte จริงระหว่างสตรีม — เกินเพดานเมื่อไรตัดทิ้งทันที
 *
 * 🔴 ห้ามใช้ `res.arrayBuffer()` ตรง ๆ กับของที่มาจากภายนอก: `part.size` เป็นค่าที่
 *    **เซิร์ฟเวอร์ปลายทางบอกมา** ถ้าไม่ตรงกับของจริง (หรือถูกหลอก) จะโหลดทั้งก้อนเข้า RAM ก่อนรู้ตัว
 */
async function readBlobCapped(res: Response, maxBytes: number): Promise<Buffer | null> {
  const body = res.body;
  if (!body) return null;
  const reader = body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > maxBytes) {
        await reader.cancel();
        return null;
      }
      chunks.push(value);
    }
  } catch {
    return null;
  }
  return Buffer.concat(chunks);
}

/**
 * ดึงรูป inline (cid:) มาเป็น data: — ผ่านด่าน MIME + งบ byte ที่ `buildInlineImageMap`
 *
 * 🔴 กันหน่วยความจำระเบิด (contract §7): ต้องตัดสินจาก `part.size` **ก่อนโหลด** เสมอ
 *    ไม่งั้นผู้ส่งภายนอกแนบ PNG 300MB มา 3 ใบ = แค่เปิดอ่านก็ทำ serverless หมดหน่วยความจำ
 *    และเมลฉบับนั้นอ่านไม่ได้ถาวร · ไม่รู้ขนาด (ไม่มี `size`) = **ไม่โหลด** ปล่อยเป็นไฟล์แนบ
 */
async function collectInlineImages(
  session: MailSession,
  email: JmapEmail,
  html: string,
  budget: InlineBudget,
): Promise<Record<string, string>> {
  if (!html.toLowerCase().includes("cid:")) return {};
  const candidates = (email.attachments ?? [])
    .filter((p) => p.blobId && normalizeCid(p.cid))
    .filter((p) => (INLINE_IMAGE_TYPES as readonly string[]).includes((p.type ?? "").toLowerCase()))
    .filter((p) => typeof p.size === "number" && p.size > 0 && p.size <= MAX_INLINE_IMAGE_BYTES)
    .slice(0, MAX_INLINE_IMAGES);
  if (candidates.length === 0) return {};

  const sources: InlineImageSource[] = [];
  for (const part of candidates) {
    const size = part.size as number;
    // เกินงบแล้ว → ข้ามใบนี้ (ใบถัดไปอาจเล็กพอ) ห้ามโหลดแล้วค่อยตัดทีหลัง
    if (size > budget.remaining) continue;
    budget.remaining -= size;
    try {
      const res = await fetchBlob(session, {
        blobId: part.blobId as string,
        name: sanitizeAttachmentName(part.name),
        type: (part.type ?? "").toLowerCase(),
      });
      const buf = await readBlobCapped(res, Math.min(size, MAX_INLINE_IMAGE_BYTES));
      // ขนาดจริงไม่ตรงกับที่ metadata บอก = ไม่เชื่อ ข้ามไปเลย (ยังเปิดเป็นไฟล์แนบได้)
      if (!buf) continue;
      sources.push({
        cid: normalizeCid(part.cid),
        type: (part.type ?? "").toLowerCase(),
        base64: buf.toString("base64"),
      });
    } catch {
      // ดึงรูป inline ไม่ได้ = ปล่อยเป็น cid: (CSP บล็อก) แล้วโชว์เป็นไฟล์แนบ
    }
  }
  return buildInlineImageMap(sources);
}

async function mapMessageDetail(
  session: MailSession,
  email: JmapEmail,
  showImages: boolean,
  budget: InlineBudget,
): Promise<MailMessageDetail> {
  const rawHtml = bodyValueOf(email, email.htmlBody);
  const text = bodyValueOf(email, email.textBody);
  const keywords = email.keywords ?? {};

  let htmlSanitized: string | null = null;
  let hasRemoteImages = false;
  if (rawHtml) {
    const inlineImages = await collectInlineImages(session, email, rawHtml, budget);
    const prepared = prepareMailHtml(rawHtml, {
      inlineImages,
      stripRemoteImages: !showImages,
    });
    htmlSanitized = prepared.html;
    hasRemoteImages = prepared.hasRemoteImages;
  }

  return {
    id: email.id,
    from: mapAddress(email.from?.[0]),
    to: mapAddresses(email.to),
    cc: mapAddresses(email.cc),
    receivedAt: email.receivedAt ?? new Date(0).toISOString(),
    subject: (email.subject ?? "").trim() || "(ไม่มีหัวเรื่อง)",
    isUnread: !keywords["$seen"],
    isFlagged: !!keywords["$flagged"],
    htmlSanitized,
    textBody: text,
    hasRemoteImages,
    attachments: mapAttachments(email),
    messageId: Array.isArray(email.messageId) ? email.messageId : null,
    references: Array.isArray(email.references) ? email.references : null,
    securityHeaders: SECURITY_HEADERS.flatMap((name) => {
      const value = readHeaderText(email, name);
      return value ? [{ name: name as string, value }] : [];
    }),
  };
}

/** ค่าที่ JMAP คืนมาเป็น `header:<ชื่อ>:asText` — ไม่มี = ผู้ส่ง/เซิร์ฟเวอร์ไม่ได้ใส่ */
function readHeaderText(email: JmapEmail, name: string): string | null {
  const raw = (email as unknown as Record<string, unknown>)[`header:${name}:asText`];
  if (typeof raw !== "string") return null;
  const value = raw.trim();
  return value ? value.slice(0, 2000) : null;
}

const DETAIL_GET_ARGS = {
  properties: EMAIL_DETAIL_PROPERTIES,
  bodyProperties: ["partId", "blobId", "size", "name", "type", "cid", "disposition"],
  fetchHTMLBodyValues: true,
  fetchTextBodyValues: true,
  maxBodyValueBytes: MAX_BODY_VALUE_BYTES,
};

/**
 * เลือก "ฉบับล่าสุด ≤ max" ของเธรด — และ **ต้องมีฉบับที่ผู้ใช้กดเปิดเสมอ**
 * (คลิกจากผลค้นหาอาจเป็นฉบับเก่ากลางเธรด ถ้าตัดทิ้งจะกลายเป็นเปิดแล้วไม่เจอสิ่งที่กด)
 * input ต้องเรียงเก่า→ใหม่มาแล้ว · คืนค่าเรียงเก่า→ใหม่เหมือนกัน
 */
export function selectThreadWindow<T extends { id: string }>(
  emails: T[],
  anchorId: string,
  max = MAX_THREAD_MESSAGES,
): T[] {
  if (emails.length <= max) return emails;
  const window = emails.slice(-max);
  if (window.some((e) => e.id === anchorId)) return window;
  const anchor = emails.find((e) => e.id === anchorId);
  if (!anchor) return window;
  return [anchor, ...window.slice(1)];
}

export async function getMailThread(
  session: MailSession,
  id: string,
  by: MailScope,
  opts: { showImages?: boolean } = {},
): Promise<MailThreadDetail> {
  const showImages = !!opts.showImages;
  let emails: JmapEmail[];

  if (by === "email") {
    const responses = await jmapRequest(session, [
      ["Email/get", { accountId: session.accountId, ids: [id], ...DETAIL_GET_ARGS }, "a"],
    ]);
    emails = (pickResponse(responses, "a").list as JmapEmail[] | undefined) ?? [];
  } else {
    const responses = await jmapRequest(session, [
      [
        "Email/get",
        { accountId: session.accountId, ids: [id], properties: ["id", "threadId"] },
        "a",
      ],
      [
        "Thread/get",
        {
          accountId: session.accountId,
          "#ids": { resultOf: "a", name: "Email/get", path: "/list/*/threadId" },
        },
        "b",
      ],
      [
        "Email/get",
        {
          accountId: session.accountId,
          "#ids": { resultOf: "b", name: "Thread/get", path: "/list/*/emailIds" },
          ...DETAIL_GET_ARGS,
        },
        "c",
      ],
    ]);
    emails = (pickResponse(responses, "c").list as JmapEmail[] | undefined) ?? [];
  }

  if (emails.length === 0) throw new MailServiceError(404, "ไม่พบอีเมลฉบับนี้");

  emails.sort((a, b) => (a.receivedAt ?? "").localeCompare(b.receivedAt ?? ""));
  const totalMessages = emails.length;
  const shown = selectThreadWindow(emails, id);

  // งบเดียวใช้ร่วมทั้งเธรด — ห้ามรีเซ็ตต่อฉบับ ไม่งั้นเธรดยาวก็ยังดึงรูปได้ไม่จำกัด
  const budget: InlineBudget = { remaining: INLINE_FETCH_BUDGET_BYTES };
  const messages: MailMessageDetail[] = [];
  for (const email of shown) {
    messages.push(await mapMessageDetail(session, email, showImages, budget));
  }

  const anchor = shown.find((e) => e.id === id) ?? shown[shown.length - 1]!;
  return {
    threadId: anchor.threadId ?? id,
    subject: messages[0]?.subject ?? "(ไม่มีหัวเรื่อง)",
    messages,
    totalMessages,
  };
}
