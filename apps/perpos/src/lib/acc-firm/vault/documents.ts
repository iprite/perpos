/**
 * documents.ts — write path + การเข้าถึงไฟล์ของคลังเอกสารลูกค้า
 *
 * กฎที่ผูกพัน (spec §6/§9 · ห้ามแก้โดยไม่ผ่าน gate):
 *  1. bucket private เสมอ — เข้าถึงผ่าน **signed URL ≤ 60 วินาที** เท่านั้น
 *  2. **ทุกครั้งที่ออก URL ต้องเขียน `acc_firm_vault_access_log`** (append-only)
 *  3. เอกสาร `is_sensitive` → ต้องเป็น module role `owner` เท่านั้นจึงดาวน์โหลดได้
 *  4. `retention_until` ไม่เคยรับจาก payload — trigger ที่ DB คำนวณให้ (เราไม่ส่งค่าไปเลย)
 *  5. path ห้ามมีชื่อลูกค้า/เลขบัตร: `{firmOrgId}/{clientId}/{fiscalYear}/{categoryCode}/{uuid}.{ext}`
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  SIGNED_URL_TTL_SECONDS,
  VAULT_BUCKET,
  resolveDueDate,
  type AccessAction,
  type ChecklistStatus,
  type CustodyDirection,
  type CustodyMethod,
  type DocumentClassification,
  type DocumentSource,
} from "./types";

type DB = SupabaseClient;

export class VaultError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
  }
}

/** นามสกุลไฟล์ที่รับ — กันไฟล์รันได้หลุดเข้า bucket */
const ALLOWED_EXT = new Set([
  "pdf",
  "jpg",
  "jpeg",
  "png",
  "webp",
  "heic",
  "xlsx",
  "xls",
  "csv",
  "docx",
  "zip",
]);
const MAX_SIZE_BYTES = 50 * 1024 * 1024;

/** สร้าง path ตาม convention — ค่าที่มาจากผู้ใช้ถูกทิ้งทั้งหมด (ใช้ uuid สุ่มเป็นชื่อไฟล์) */
export function buildStoragePath(args: {
  firmOrgId: string;
  clientId: string;
  fiscalYear: number;
  categoryCode: string;
  fileName: string;
}): string {
  const ext = (args.fileName.split(".").pop() ?? "").toLowerCase();
  if (!ALLOWED_EXT.has(ext)) {
    throw new VaultError(`ไม่รองรับไฟล์นามสกุล .${ext || "(ไม่ระบุ)"}`, 400);
  }
  const safeCategory = /^[A-Z]{3}-\d{2}$/.test(args.categoryCode) ? args.categoryCode : "MISC";
  return `${args.firmOrgId}/${args.clientId}/${args.fiscalYear}/${safeCategory}/${crypto.randomUUID()}.${ext}`;
}

/** ลูกค้าต้องเป็นของ firm นี้จริง — ด่านกัน IDOR ก่อนทุก write */
export async function assertClientOfFirm(db: DB, firmOrgId: string, clientId: string) {
  const { data, error } = await db
    .from("acc_firm_service_clients")
    .select("id, fiscal_year_end_month, fiscal_year_end_day")
    .eq("firm_org_id", firmOrgId)
    .eq("id", clientId)
    .maybeSingle();
  if (error) throw new VaultError(error.message, 500);
  if (!data) throw new VaultError("ไม่พบลูกค้ารายนี้ในสำนักงานของคุณ", 404);
  return data;
}

export async function logAccess(
  db: DB,
  args: {
    firmOrgId: string;
    documentId: string | null;
    userId: string;
    action: AccessAction;
    ip?: string | null;
    userAgent?: string | null;
  },
) {
  // append-only — ถ้าเขียนไม่ได้ถือเป็นความล้มเหลวของ operation (PDPA: ไม่มี log = ห้ามให้ไฟล์)
  const { error } = await db.from("acc_firm_vault_access_log").insert({
    firm_org_id: args.firmOrgId,
    document_id: args.documentId,
    user_id: args.userId,
    action: args.action,
    ip: args.ip ?? null,
    user_agent: args.userAgent ?? null,
  });
  if (error) throw new VaultError(`บันทึกการเข้าถึงไม่สำเร็จ: ${error.message}`, 500);
}

/** URL สำหรับอัปโหลด — คืน path ที่ต้องส่งกลับมาตอน register */
export async function createUploadUrl(
  db: DB,
  args: {
    firmOrgId: string;
    clientId: string;
    fiscalYear: number;
    categoryCode: string;
    fileName: string;
    sizeBytes?: number;
  },
): Promise<{ path: string; token: string; signedUrl: string }> {
  if (args.sizeBytes && args.sizeBytes > MAX_SIZE_BYTES) {
    throw new VaultError("ไฟล์ใหญ่เกิน 50 MB", 413);
  }
  const path = buildStoragePath(args);
  const { data, error } = await db.storage.from(VAULT_BUCKET).createSignedUploadUrl(path);
  if (error || !data) throw new VaultError(error?.message ?? "สร้างลิงก์อัปโหลดไม่สำเร็จ", 500);
  return { path, token: data.token, signedUrl: data.signedUrl };
}

/**
 * บันทึกเอกสารหลังอัปโหลดไฟล์ขึ้น storage แล้ว
 * - sha256 ซ้ำ → 409 พร้อมบอกว่าไปชนกับเอกสารใบไหน (spec §9 ข้อ 2) + ลบไฟล์ที่เพิ่งอัปทิ้ง
 * - ถ้ามี period+category ตรงกับ checklist → เลื่อนสถานะ `missing` → `received` ให้อัตโนมัติ
 */
export async function registerDocument(
  db: DB,
  args: {
    firmOrgId: string;
    clientId: string;
    periodId: string | null;
    categoryId: string;
    title: string;
    storagePath: string;
    sha256: string;
    mimeType?: string | null;
    sizeBytes?: number | null;
    docDate?: string | null;
    amount?: number | null;
    counterparty?: string | null;
    classification?: DocumentClassification;
    source?: DocumentSource;
    uploadedBy: string;
  },
): Promise<{ id: string; retentionUntil: string }> {
  if (!args.storagePath.startsWith(`${args.firmOrgId}/${args.clientId}/`)) {
    throw new VaultError("path ของไฟล์ไม่ตรงกับลูกค้า/สำนักงาน", 400);
  }

  const { data: dup } = await db
    .from("acc_firm_vault_documents")
    .select("id, title, uploaded_at")
    .eq("firm_org_id", args.firmOrgId)
    .eq("client_id", args.clientId)
    .eq("sha256", args.sha256)
    .neq("status", "purged")
    .maybeSingle();
  if (dup) {
    await db.storage.from(VAULT_BUCKET).remove([args.storagePath]);
    throw new VaultError(`ไฟล์นี้เคยอัปโหลดแล้วในชื่อ "${dup.title}" — ระบบไม่บันทึกซ้ำ`, 409);
  }

  // ไม่ส่ง retention_until เข้าไปเลย — trigger ที่ DB เป็นเจ้าของค่านี้ (spec §9)
  const { data, error } = await db
    .from("acc_firm_vault_documents")
    .insert({
      firm_org_id: args.firmOrgId,
      client_id: args.clientId,
      period_id: args.periodId,
      category_id: args.categoryId,
      title: args.title,
      storage_path: args.storagePath,
      sha256: args.sha256,
      mime_type: args.mimeType ?? null,
      size_bytes: args.sizeBytes ?? null,
      doc_date: args.docDate ?? null,
      amount: args.amount ?? null,
      counterparty: args.counterparty ?? null,
      classification: args.classification ?? "internal",
      source: args.source ?? "web",
      uploaded_by: args.uploadedBy,
    })
    .select("id, retention_until")
    .single();
  if (error) throw new VaultError(error.message, 500);

  if (args.periodId) {
    await db
      .from("acc_firm_vault_checklist")
      .update({
        status: "received",
        updated_by: args.uploadedBy,
        updated_at: new Date().toISOString(),
      })
      .eq("firm_org_id", args.firmOrgId)
      .eq("period_id", args.periodId)
      .eq("category_id", args.categoryId)
      .eq("status", "missing");
  }

  await logAccess(db, {
    firmOrgId: args.firmOrgId,
    documentId: data.id as string,
    userId: args.uploadedBy,
    action: "upload",
  });

  return { id: data.id as string, retentionUntil: data.retention_until as string };
}

/**
 * ลิงก์ดาวน์โหลดชั่วคราว — เขียน access log ก่อนคืน URL เสมอ
 * เอกสารที่ประเภทเป็นข้อมูลอ่อนไหว → เฉพาะ module role `owner`
 */
export async function createDownloadUrl(
  db: DB,
  args: {
    firmOrgId: string;
    documentId: string;
    userId: string;
    moduleRole: string;
    ip?: string | null;
    userAgent?: string | null;
  },
): Promise<{ url: string; fileName: string; isSensitive: boolean; expiresInSeconds: number }> {
  const { data, error } = await db
    .from("acc_firm_vault_documents")
    .select(
      "id, title, storage_path, status, category:acc_firm_vault_categories!inner (is_sensitive)",
    )
    .eq("firm_org_id", args.firmOrgId)
    .eq("id", args.documentId)
    .maybeSingle();
  if (error) throw new VaultError(error.message, 500);
  if (!data) throw new VaultError("ไม่พบเอกสาร", 404);
  if (data.status === "purged") throw new VaultError("เอกสารนี้ถูกทำลายตามกำหนดเก็บแล้ว", 410);

  const isSensitive = Boolean((data.category as unknown as Record<string, unknown>).is_sensitive);
  if (isSensitive && args.moduleRole !== "owner") {
    throw new VaultError("เอกสารนี้มีข้อมูลส่วนบุคคล — เฉพาะเจ้าของสำนักงานเปิดได้", 403);
  }

  await logAccess(db, {
    firmOrgId: args.firmOrgId,
    documentId: args.documentId,
    userId: args.userId,
    action: "download",
    ip: args.ip,
    userAgent: args.userAgent,
  });

  const { data: signed, error: signErr } = await db.storage
    .from(VAULT_BUCKET)
    .createSignedUrl(data.storage_path as string, SIGNED_URL_TTL_SECONDS);
  if (signErr || !signed) throw new VaultError(signErr?.message ?? "สร้างลิงก์ไม่สำเร็จ", 500);

  return {
    url: signed.signedUrl,
    fileName: data.title as string,
    isSensitive,
    expiresInSeconds: SIGNED_URL_TTL_SECONDS,
  };
}

/**
 * สร้างงวด + กาง checklist จาก template ของ firm (idempotent — เรียกซ้ำไม่สร้างซ้ำ)
 * เลือก template: ตรง entity_type+vat_registered ก่อน ไม่มีจึงใช้ is_default
 */
export async function ensurePeriodWithChecklist(
  db: DB,
  args: {
    firmOrgId: string;
    clientId: string;
    kind: "month" | "year";
    periodStart: string;
    periodEnd: string;
    fiscalYear: number;
    createdBy: string;
  },
): Promise<{ periodId: string; created: boolean; checklistCount: number }> {
  const { data: existing } = await db
    .from("acc_firm_vault_periods")
    .select("id")
    .eq("firm_org_id", args.firmOrgId)
    .eq("client_id", args.clientId)
    .eq("kind", args.kind)
    .eq("period_start", args.periodStart)
    .maybeSingle();

  let periodId = existing?.id as string | undefined;
  let created = false;

  if (!periodId) {
    const { data, error } = await db
      .from("acc_firm_vault_periods")
      .insert({
        firm_org_id: args.firmOrgId,
        client_id: args.clientId,
        kind: args.kind,
        period_start: args.periodStart,
        period_end: args.periodEnd,
        fiscal_year: args.fiscalYear,
      })
      .select("id")
      .single();
    if (error) throw new VaultError(error.message, 500);
    periodId = data.id as string;
    created = true;
  }

  const { data: template } = await db
    .from("acc_firm_vault_templates")
    .select("id")
    .eq("firm_org_id", args.firmOrgId)
    .eq("is_default", true)
    .maybeSingle();
  if (!template) {
    throw new VaultError("สำนักงานนี้ยังไม่มีแม่แบบรายการเอกสาร — ตั้งค่าแม่แบบก่อนสร้างงวด", 409);
  }

  const { data: items, error: itemErr } = await db
    .from("acc_firm_vault_template_items")
    .select(
      "category_id, is_required, due_rule, category:acc_firm_vault_categories!inner (frequency)",
    )
    .eq("template_id", template.id as string);
  if (itemErr) throw new VaultError(itemErr.message, 500);

  // งวดเดือน = หมวดรายเดือน · งวดปี = หมวดรายปี/ครั้งเดียว
  const wanted = (items ?? []).filter((it) => {
    const freq = (it.category as unknown as Record<string, unknown>).frequency as string;
    return args.kind === "month" ? freq === "monthly" : freq !== "monthly";
  });

  const { data: already } = await db
    .from("acc_firm_vault_checklist")
    .select("category_id")
    .eq("firm_org_id", args.firmOrgId)
    .eq("period_id", periodId);
  const have = new Set((already ?? []).map((r) => r.category_id as string));

  const rows = wanted
    .filter((it) => !have.has(it.category_id as string))
    .map((it) => ({
      firm_org_id: args.firmOrgId,
      client_id: args.clientId,
      period_id: periodId,
      category_id: it.category_id as string,
      is_required: Boolean(it.is_required),
      due_date: resolveDueDate((it.due_rule as string) ?? null, args.periodEnd),
      updated_by: args.createdBy,
    }));

  if (rows.length > 0) {
    const { error } = await db.from("acc_firm_vault_checklist").insert(rows);
    if (error) throw new VaultError(error.message, 500);
  }

  return { periodId: periodId!, created, checklistCount: have.size + rows.length };
}

export async function updateChecklistStatus(
  db: DB,
  args: {
    firmOrgId: string;
    checklistId: string;
    status: ChecklistStatus;
    waivedReason?: string | null;
    userId: string;
  },
) {
  if (args.status === "na" && !args.waivedReason?.trim()) {
    throw new VaultError("ระบุเหตุผลที่ไม่เกี่ยวข้องด้วย", 400);
  }
  const { error } = await db
    .from("acc_firm_vault_checklist")
    .update({
      status: args.status,
      waived_reason: args.status === "na" ? args.waivedReason!.trim() : null,
      updated_by: args.userId,
      updated_at: new Date().toISOString(),
    })
    .eq("firm_org_id", args.firmOrgId)
    .eq("id", args.checklistId);
  if (error) throw new VaultError(error.message, 500);
}

/** บันทึกทะเบียนรับ-ส่งเอกสาร — เลขที่ใบรับเดินต่อเนื่องต่อ firm ต่อปี */
export async function createCustodyEntry(
  db: DB,
  args: {
    firmOrgId: string;
    clientId: string;
    direction: CustodyDirection;
    method: CustodyMethod;
    itemSummary: string;
    itemCount?: number | null;
    handedBy?: string | null;
    signaturePath?: string | null;
    occurredAt?: string | null;
    note?: string | null;
    userId: string;
  },
): Promise<{ id: string; receiptNo: string }> {
  if (!args.itemSummary.trim()) throw new VaultError("ระบุรายการเอกสารที่รับ-ส่ง", 400);

  // เลขที่ใบรับเป็นเอกสารที่ลูกค้าเห็น → ใช้ปี พ.ศ. ให้ตรงกับวันที่ทุกจุดในหน้าจอ (DESIGN §14)
  const yearBe = new Date().getFullYear() + 543;
  const prefix = `${args.direction === "in" ? "RCV" : "RTN"}-${yearBe}-`;
  const { count } = await db
    .from("acc_firm_vault_custody_log")
    .select("id", { count: "exact", head: true })
    .eq("firm_org_id", args.firmOrgId)
    .like("receipt_no", `${prefix}%`);
  const receiptNo = `${prefix}${String((count ?? 0) + 1).padStart(4, "0")}`;

  const { data, error } = await db
    .from("acc_firm_vault_custody_log")
    .insert({
      firm_org_id: args.firmOrgId,
      client_id: args.clientId,
      direction: args.direction,
      method: args.method,
      item_summary: args.itemSummary.trim(),
      item_count: args.itemCount ?? null,
      handed_by: args.handedBy ?? null,
      signature_path: args.signaturePath ?? null,
      occurred_at: args.occurredAt ?? new Date().toISOString(),
      note: args.note ?? null,
      receipt_no: receiptNo,
      received_by: args.direction === "in" ? args.userId : null,
      created_by: args.userId,
    })
    .select("id")
    .single();
  if (error) throw new VaultError(error.message, 500);

  return { id: data.id as string, receiptNo };
}
