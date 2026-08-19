import type { MailLocale } from "./i18n";

/**
 * DTO ของโมดูลอีเมล (webmail M1)
 *
 * ชื่อทุกตัวถูกล็อกไว้ที่ `.claude/feature-factory/specs/mail-webmail-read.md` §4.3
 * — ห้ามตั้งชื่อใหม่เอง (ห้ามใช้ `unread`/`seen`/`sender`/`date`/`snippet`)
 * การแปลงจาก JMAP → DTO ทำที่ `lib/mail/messages.ts` ที่เดียว
 */

// ─── ที่อยู่ / กล่อง ───────────────────────────────────────────────────────────

export interface MailAddress {
  name: string | null;
  email: string;
}

/** role ของ mailbox ตามสเปก JMAP (`archive` เราสร้างเองถ้าเซิร์ฟเวอร์ไม่มี) */
export type MailboxRole = "inbox" | "sent" | "drafts" | "trash" | "junk" | "archive";

/** คีย์ที่ใช้ในเมนู/คิวรี — `starred` ไม่ใช่ mailbox แต่เป็น keyword `$flagged` */
export type MailBoxKey = "inbox" | "starred" | "sent" | "drafts" | "archive" | "junk" | "trash";

export interface MailboxSummary {
  id: string;
  key: MailBoxKey;
  role: MailboxRole | null;
  name: string;
  /** `null` = ไม่มีข้อมูล (เช่น `starred` ซึ่งไม่ใช่ mailbox) — ห้ามใส่ 0 แทน */
  unreadCount: number | null;
  totalCount: number | null;
}

/**
 * โฟลเดอร์ที่ผู้ใช้สร้างเอง (M3) — ทุกอย่างอยู่บนเมลเซิร์ฟเวอร์ **ห้ามมีตารางใน Supabase**
 * `path` = ชื่อเต็มไล่จากรากคั่นด้วย `/` (ต้องใช้กับ `fileinto` ของ Sieve — id ใช้ไม่ได้)
 */
export interface MailFolder {
  id: string;
  name: string;
  parentId: string | null;
  /** 0 = อยู่ระดับบนสุด */
  depth: number;
  path: string;
  unreadCount: number | null;
  totalCount: number | null;
}

// ─── ข้อความ ─────────────────────────────────────────────────────────────────

export interface MailMessage {
  id: string;
  threadId: string;
  mailboxIds: string[];
  from: MailAddress | null;
  subject: string;
  preview: string;
  /** ISO 8601 */
  receivedAt: string;
  isUnread: boolean;
  isFlagged: boolean;
  hasAttachment: boolean;
  /**
   * ไฟล์แนบสำหรับ "ชิป" ในรายการ (สูงสุด `LIST_ATTACHMENT_MAX`)
   * มี `blobId` ด้วยเพื่อให้กดชิปแล้วดูตัวอย่าง/ดาวน์โหลดได้ทันทีโดยไม่ต้องเปิดเมล
   * — ตัว `blobId` ใช้ได้เฉพาะกับ session ของเจ้าของกล่องเมลเอง (route ไฟล์แนบตรวจ session ทุกครั้ง)
   */
  attachments: MailAttachment[];
  /** จำนวนไฟล์แนบทั้งหมด (มากกว่าความยาวของ `attachments` ได้ → แสดง "+N") */
  attachmentCount: number;
  sizeBytes: number;
  threadCount: number;
}

export interface MailAttachment {
  blobId: string;
  name: string;
  type: string;
  sizeBytes: number;
}

export interface MailMessageDetail {
  id: string;
  from: MailAddress | null;
  to: MailAddress[];
  cc: MailAddress[];
  receivedAt: string;
  subject: string;
  isUnread: boolean;
  isFlagged: boolean;
  /** HTML ที่ผ่าน sanitize + ชั้นโครงสร้างแล้ว (ยังไม่ใช่ srcdoc) */
  htmlSanitized: string | null;
  textBody: string | null;
  hasRemoteImages: boolean;
  /** M2 — header สำหรับต่อเธรดเวลาตอบ (null = เซิร์ฟเวอร์ไม่ได้ให้มา) */
  messageId?: string[] | null;
  references?: string[] | null;
  attachments: MailAttachment[];
  /**
   * ผลตรวจจากเมลเซิร์ฟเวอร์ (สแปม/SPF/DKIM/DMARC) — **แสดงดิบตามที่ได้มา ห้ามตีความแทนผู้ใช้**
   * ว่างเปล่า = ไม่มี header พวกนี้ในเมลฉบับนั้น
   */
  securityHeaders: { name: string; value: string }[];
}

export interface MailThreadDetail {
  threadId: string;
  subject: string;
  messages: MailMessageDetail[];
  /** จำนวนฉบับทั้งหมดในเธรด — มากกว่า `messages.length` = ถูกตัดตามเพดาน (ห้ามตัดเงียบ) */
  totalMessages: number;
}

// ─── การกระทำ / เลิกทำ ────────────────────────────────────────────────────────

export type MailBulkAction =
  | "read"
  | "unread"
  | "star"
  | "unstar"
  | "archive"
  | "trash"
  /** M3 — ย้ายเข้าโฟลเดอร์ที่ผู้ใช้สร้างเอง (ต้องส่ง `mailboxId` มาด้วย) */
  | "move";

export type MailScope = "thread" | "email";

/** สถานะเดิมรายฉบับ ณ ก่อนทำ — undo = เขียนค่าเดิมกลับ ไม่ใช่ "ทำตรงข้าม" */
export interface MailUndoItem {
  id: string;
  mailboxIds: string[];
  wasUnread: boolean;
  wasFlagged: boolean;
}

export interface MailUndoToken {
  action: MailBulkAction;
  by: MailScope;
  items: MailUndoItem[];
}

// ─── คำขอ/ผลลัพธ์ของรายการ ────────────────────────────────────────────────────

export type MailSearchScope = "all" | "box";

export interface MailListParams {
  /** ตัวเลือกกล่อง — คีย์ระบบ (`inbox`…) หรือ `f:<mailboxId>` ของโฟลเดอร์เอง (ดู `boxes.ts`) */
  box: string;
  q?: string;
  /**
   * ขอบเขตการค้นหา — มีผลเฉพาะเมื่อมี `q`
   * `all` (ค่าเริ่มต้น) = ทั้งกล่องเมล **ยกเว้นถังขยะ/จดหมายขยะ** · `box` = เฉพาะกล่องที่เปิดอยู่
   * (ค้นในกล่องขาเข้าอย่างเดียวแปลว่าเมลที่กฎกรองย้ายไปโฟลเดอร์แล้วจะหาไม่เจอตลอดกาล)
   */
  searchScope?: MailSearchScope;
  unread?: boolean;
  attachment?: boolean;
  anchor?: string;
  anchorOffset?: number;
  position?: number;
  limit?: number;
}

export interface MailListResult {
  messages: MailMessage[];
  /**
   * มีเมื่อผลลัพธ์มาจาก **การสแกนหาข้อความบางส่วน** (ดัชนีของเมลเซิร์ฟเวอร์หาไม่เจอ)
   * `truncated` = ยังมีเมลเก่ากว่านั้นที่ไม่ได้สแกน ⇒ หน้าเว็บต้องบอกผู้ใช้ ห้ามเงียบ
   */
  scan?: { scanned: number; truncated: boolean };
  total: number | null;
  hasMore: boolean;
  queryState: string | null;
}

// ─── ความชอบส่วนตัวของผู้ใช้ (เก็บในกล่องเมลเอง — ดู `lib/mail/prefs.ts`) ─────

/** `split` = รายการ + บานอ่านคู่กัน · `list` = รายการเต็มความกว้าง */
export type MailPaneMode = "split" | "list";

export interface MailPrefs {
  pane: MailPaneMode;
  /** ความกว้างคอลัมน์รายการ (px) ตอนมุมมอง `split` — ผู้ใช้ลากตัวแบ่งเองได้ */
  listWidth: number;
  /** ภาษาของเว็บเมล (th/en) — ดู `lib/mail/i18n` */
  locale: MailLocale;
  /** ลายเซ็นต่อท้ายเมล (ข้อความล้วน) — ว่าง = ไม่ใส่ */
  signature: string;
  /** ใส่ลายเซ็นตอนตอบ/ส่งต่อด้วยไหม (เมลใหม่ใส่เสมอเมื่อมีลายเซ็น) */
  signatureOnReply: boolean;
  /**
   * ลายเซ็นเฉพาะของแต่ละที่อยู่ (นามแฝง) — คีย์ = อีเมลตัวพิมพ์เล็ก
   * ที่อยู่ที่ไม่มีในนี้ใช้ `signature` (ค่าเริ่มต้น) เสมอ
   */
  signatureByAddress: Record<string, string>;
  /** ที่อยู่ผู้ส่งที่ใช้ตอนเขียนใหม่ — ว่าง = ที่อยู่หลักของกล่อง */
  defaultFromEmail: string;
  /** ตอบ/ส่งต่อ ให้ส่งจาก "ที่อยู่ที่เขาส่งหา" ถ้าที่อยู่นั้นเป็นของเรา */
  replyFromReceived: boolean;
}

// ─── กฎกรองอัตโนมัติ (Sieve — M3) ─────────────────────────────────────────────

/** ช่องของเมลที่เอามาเทียบ — แมปเป็น header test ของ Sieve ที่ `lib/mail/sieve.ts` */
export type MailRuleField = "from" | "to" | "cc" | "subject";

export type MailRuleOperator = "contains" | "is" | "not_contains";

export interface MailRuleCondition {
  field: MailRuleField;
  op: MailRuleOperator;
  value: string;
}

/** `all` = ต้องตรงทุกข้อ · `any` = ตรงข้อใดข้อหนึ่ง */
export type MailRuleMatch = "all" | "any";

export interface MailRule {
  id: string;
  name: string;
  enabled: boolean;
  match: MailRuleMatch;
  conditions: MailRuleCondition[];
  /** id ของกล่องปลายทาง (โฟลเดอร์เอง/จดหมายขยะ/ถังขยะ) — `null` = ไม่ย้าย */
  moveToMailboxId: string | null;
  markRead: boolean;
  star: boolean;
  /** เจอกฎนี้แล้วหยุด ไม่ตรวจกฎถัดไป */
  stop: boolean;
}

export interface MailRulesResult {
  rules: MailRule[];
  /**
   * บนเซิร์ฟเวอร์มีสคริปต์กรองที่ **ไม่ได้สร้างจากหน้านี้** อยู่
   * ⇒ ห้ามเขียนทับเงียบ ๆ (UI ต้องเตือนและให้ผู้ใช้ยืนยันก่อน)
   */
  foreignScript: boolean;
}

// ─── session / OAuth (เก็บใน cookie เข้ารหัสเท่านั้น ไม่มีอะไรลง Supabase) ────

export interface MailSession {
  v: 1;
  accessToken: string;
  refreshToken: string;
  /** epoch ms */
  expiresAt: number;
  /** epoch ms — ใช้บังคับ absolute expiry 30 วัน */
  issuedAt: number;
  email: string;
  accountId: string;
  apiUrl: string;
  /** template ดิบจาก JMAP session — ห้ามฮาร์ดโค้ด */
  downloadUrl: string;
  /** เพิ่มใน M2 — optional เพราะ cookie ที่ออกก่อนหน้ายังไม่มีฟิลด์นี้ (ผู้เรียกต้องมี fallback) */
  uploadUrl?: string;
}

export interface MailOAuthState {
  state: string;
  codeVerifier: string;
  returnTo: string;
  /** epoch ms */
  issuedAt: number;
}

export interface MailApiErrorBody {
  error: string;
  message: string;
}

// ─── โครง JMAP ดิบเท่าที่ใช้ ────────────────────────────────────────────────

export interface JmapDiscovery {
  apiUrl: string;
  downloadUrl: string;
  /** M2 — ใช้แนบไฟล์ · ไม่มี = เซิร์ฟเวอร์ไม่ประกาศ (ผู้เรียกมี fallback จาก apiUrl) */
  uploadUrl?: string;
  accountId: string;
  email: string;
}

export interface JmapMailbox {
  id: string;
  name: string;
  role: string | null;
  parentId: string | null;
  totalEmails?: number;
  unreadEmails?: number;
  /** นับเป็น "เธรด" (RFC 8621 §2) — รายการของเราเป็นเธรด จึงใช้ตัวนี้เป็นตัวเลขยังไม่ได้อ่าน */
  totalThreads?: number;
  unreadThreads?: number;
}

export interface JmapEmailAddress {
  name?: string | null;
  email?: string | null;
}

export interface JmapBodyPart {
  partId?: string | null;
  blobId?: string | null;
  size?: number;
  name?: string | null;
  type?: string | null;
  cid?: string | null;
  disposition?: string | null;
}

export interface JmapEmail {
  messageId?: string[] | null;
  references?: string[] | null;
  id: string;
  threadId?: string;
  mailboxIds?: Record<string, boolean>;
  from?: JmapEmailAddress[] | null;
  to?: JmapEmailAddress[] | null;
  cc?: JmapEmailAddress[] | null;
  subject?: string | null;
  preview?: string | null;
  receivedAt?: string | null;
  keywords?: Record<string, boolean> | null;
  size?: number;
  hasAttachment?: boolean;
  htmlBody?: JmapBodyPart[];
  textBody?: JmapBodyPart[];
  attachments?: JmapBodyPart[];
  bodyValues?: Record<string, { value?: string; isTruncated?: boolean }>;
}

export interface JmapThread {
  id: string;
  emailIds: string[];
}
