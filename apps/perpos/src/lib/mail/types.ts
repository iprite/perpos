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
}

export interface MailThreadDetail {
  threadId: string;
  subject: string;
  messages: MailMessageDetail[];
  /** จำนวนฉบับทั้งหมดในเธรด — มากกว่า `messages.length` = ถูกตัดตามเพดาน (ห้ามตัดเงียบ) */
  totalMessages: number;
}

// ─── การกระทำ / เลิกทำ ────────────────────────────────────────────────────────

export type MailBulkAction = "read" | "unread" | "star" | "unstar" | "archive" | "trash";

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

export interface MailListParams {
  box: MailBoxKey;
  q?: string;
  unread?: boolean;
  attachment?: boolean;
  anchor?: string;
  anchorOffset?: number;
  position?: number;
  limit?: number;
}

export interface MailListResult {
  messages: MailMessage[];
  total: number | null;
  hasMore: boolean;
  queryState: string | null;
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
