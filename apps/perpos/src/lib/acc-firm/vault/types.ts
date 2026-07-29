/**
 * types.ts — ชนิดข้อมูล + คำไทยของทุก enum ในคลังเอกสารลูกค้า (acc-firm-vault)
 *
 * **แหล่งเดียวของคำไทย** — หน้าไหนก็ตามที่แสดงสถานะ/ประเภท ต้อง import จากที่นี่
 * ห้ามเขียนคำไทยของ enum ซ้ำในคอมโพเนนต์ (กันคำไม่ตรงกันระหว่างหน้า)
 *
 * contract: .claude/feature-factory/specs/acc-firm-vault.md §2 (naming lock)
 */

export const VAULT_BUCKET = "acc_vault";

/** TTL ของ signed URL — PDPA §6: ต้องไม่เกิน 60 วินาที */
export const SIGNED_URL_TTL_SECONDS = 60;

export type VaultGroupCode = "REG" | "ENG" | "SRC" | "BOK" | "TAX" | "ADM";
export type VaultFrequency = "once" | "monthly" | "yearly";
export type VaultPeriodKind = "month" | "year";
export type ChecklistStatus = "missing" | "received" | "verified" | "na";
export type DocumentStatus = "draft" | "active" | "superseded" | "pending_purge" | "purged";
export type DocumentClassification = "public" | "internal" | "confidential" | "personal_data";
export type DocumentSource = "web" | "line" | "email" | "scan" | "api";
export type CustodyDirection = "in" | "out";
export type CustodyMethod = "in_person" | "courier" | "line" | "email" | "other";
export type AccessAction = "view" | "download" | "share" | "delete" | "upload";
export type IncidentType = "document_lost" | "document_damaged" | "data_breach";
export type IncidentStatus = "open" | "reported" | "closed";

export const GROUP_LABELS: Record<VaultGroupCode, string> = {
  REG: "ทะเบียนบริษัท",
  ENG: "สัญญา & กฎหมาย",
  SRC: "เอกสารประกอบการลงบัญชี",
  BOK: "สมุดบัญชี & งบการเงิน",
  TAX: "แบบภาษี & ประกันสังคม",
  ADM: "งานสำนักงาน",
};

export const CHECKLIST_STATUS_LABELS: Record<ChecklistStatus, string> = {
  missing: "ยังไม่ได้รับ",
  received: "รับแล้ว",
  verified: "ตรวจแล้ว",
  na: "ไม่เกี่ยวข้อง",
};

/** โทนสีของ StatusBadge ต่อสถานะ checklist (DESIGN.md §6) */
export const CHECKLIST_STATUS_TONE: Record<
  ChecklistStatus,
  "danger" | "warning" | "success" | "neutral"
> = {
  missing: "danger",
  received: "warning",
  verified: "success",
  na: "neutral",
};

export const DOCUMENT_STATUS_LABELS: Record<DocumentStatus, string> = {
  draft: "ฉบับร่าง",
  active: "ใช้งาน",
  superseded: "ถูกแทนที่",
  pending_purge: "รอทำลาย",
  purged: "ทำลายแล้ว",
};

export const CLASSIFICATION_LABELS: Record<DocumentClassification, string> = {
  public: "เปิดเผยได้",
  internal: "ใช้ภายใน",
  confidential: "ความลับ",
  personal_data: "ข้อมูลส่วนบุคคล",
};

export const SOURCE_LABELS: Record<DocumentSource, string> = {
  web: "เว็บ",
  line: "LINE",
  email: "อีเมล",
  scan: "สแกน",
  api: "ระบบอื่น",
};

export const CUSTODY_DIRECTION_LABELS: Record<CustodyDirection, string> = {
  in: "รับเข้า",
  out: "ส่งคืน",
};

export const CUSTODY_METHOD_LABELS: Record<CustodyMethod, string> = {
  in_person: "รับ-ส่งด้วยตนเอง",
  courier: "ขนส่ง",
  line: "LINE",
  email: "อีเมล",
  other: "อื่น ๆ",
};

export const INCIDENT_TYPE_LABELS: Record<IncidentType, string> = {
  document_lost: "เอกสารสูญหาย",
  document_damaged: "เอกสารเสียหาย",
  data_breach: "ข้อมูลรั่วไหล",
};

export const INCIDENT_STATUS_LABELS: Record<IncidentStatus, string> = {
  open: "เปิดอยู่",
  reported: "แจ้งหน่วยงานแล้ว",
  closed: "ปิดเรื่องแล้ว",
};

/** กำหนดเวลาแจ้งตามกฎหมาย — ใช้ทำนับถอยหลังในหน้า incident (spec §6) */
export const INCIDENT_DEADLINES = {
  /** พ.ร.บ.การบัญชี ม.15 — แจ้งสารวัตรบัญชีภายใน 15 วันนับแต่ทราบเหตุ */
  dbdDays: 15,
  /** PDPA — แจ้ง PDPC ภายใน 72 ชั่วโมง */
  pdpcHours: 72,
} as const;

export type VaultCategory = {
  id: string;
  code: string;
  groupCode: VaultGroupCode;
  nameTh: string;
  frequency: VaultFrequency;
  retentionYears: number;
  isSensitive: boolean;
  requiredByDefault: boolean;
  sortOrder: number;
};

export type VaultClient = {
  id: string;
  clientCode: string;
  companyName: string;
  taxId: string | null;
  vatRegistered: boolean;
  fiscalYearEndMonth: number;
  fiscalYearEndDay: number;
  storageLocation: string | null;
  dbdRelocationNotified: boolean;
  clientOrgId: string | null;
  isActive: boolean;
};

export type VaultPeriod = {
  id: string;
  clientId: string;
  kind: VaultPeriodKind;
  periodStart: string;
  periodEnd: string;
  fiscalYear: number;
  closedAt: string | null;
};

export type ChecklistRow = {
  id: string;
  periodId: string;
  categoryId: string;
  categoryCode: string;
  categoryName: string;
  groupCode: VaultGroupCode;
  isSensitive: boolean;
  status: ChecklistStatus;
  isRequired: boolean;
  dueDate: string | null;
  waivedReason: string | null;
  documentCount: number;
};

export type VaultDocument = {
  id: string;
  clientId: string;
  periodId: string | null;
  categoryId: string;
  categoryCode: string;
  categoryName: string;
  isSensitive: boolean;
  title: string;
  storagePath: string;
  mimeType: string | null;
  sizeBytes: number | null;
  sha256: string;
  docDate: string | null;
  amount: number | null;
  counterparty: string | null;
  classification: DocumentClassification;
  status: DocumentStatus;
  retentionUntil: string;
  legalHold: boolean;
  version: number;
  source: DocumentSource;
  uploadedAt: string;
  uploadedByName: string | null;
};

export type CustodyEntry = {
  id: string;
  clientId: string;
  direction: CustodyDirection;
  handedBy: string | null;
  method: CustodyMethod;
  itemSummary: string;
  itemCount: number | null;
  receiptNo: string | null;
  signaturePath: string | null;
  occurredAt: string;
  note: string | null;
  receivedByName: string | null;
};

/** สรุปความครบของเอกสารต่อลูกค้า — ใช้ทำการ์ด/ตารางหน้าแรกของคลัง */
export type ClientVaultSummary = {
  client: VaultClient;
  missingRequired: number;
  overdueRequired: number;
  documentCount: number;
  lastUploadAt: string | null;
};

/**
 * คำนวณวันครบกำหนดจาก due_rule ของ template — รูปแบบเดียวที่รองรับคือ `PERIOD_END+<n>d`
 * (ห้ามคำนวณ deadline ยื่นแบบเองที่นี่ — ของนั้นอยู่ที่ lib/acc-firm/tax-calendar.ts)
 */
export function resolveDueDate(dueRule: string | null, periodEnd: string): string | null {
  if (!dueRule) return null;
  const m = /^PERIOD_END\+(\d+)d$/.exec(dueRule.trim());
  if (!m) return null;
  const d = new Date(`${periodEnd}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + Number(m[1]));
  return d.toISOString().slice(0, 10);
}

/** ขอบเขตงวดรายเดือน/รายปีจากปี+เดือน (เดือน 1-12; ปีใช้ ค.ศ.) */
export function monthPeriodBounds(year: number, month: number): { start: string; end: string } {
  const start = new Date(Date.UTC(year, month - 1, 1));
  const end = new Date(Date.UTC(year, month, 0));
  return { start: start.toISOString().slice(0, 10), end: end.toISOString().slice(0, 10) };
}
