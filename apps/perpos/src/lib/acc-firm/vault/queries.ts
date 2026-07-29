/**
 * queries.ts — read path ของคลังเอกสารลูกค้า
 *
 * caller (route/page) เช็คสิทธิ์เองก่อนเสมอ (`requireModuleMember` / `getModuleRoleForCurrentUser`)
 * แล้วส่ง client เข้ามา — ท่าเดียวกับ lib/acc-firm/{tax-calendar,billing,close-check}.ts
 * เหตุผลที่ใช้ service-role: firm member ไม่ได้เป็นสมาชิก org ของลูกค้า (spec D4)
 *
 * **ทุกฟังก์ชันต้องรับ `firmOrgId` และกรองด้วยเสมอ** — เป็นด่าน tenant ชั้นแอปคู่กับ RLS
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  type ChecklistRow,
  type ChecklistStatus,
  type ClientVaultSummary,
  type CustodyEntry,
  type VaultCategory,
  type VaultClient,
  type VaultDocument,
  type VaultPeriod,
} from "./types";

type DB = SupabaseClient;

const CLIENT_COLUMNS =
  "id, client_code, company_name, tax_id, vat_registered, fiscal_year_end_month, " +
  "fiscal_year_end_day, storage_location, dbd_relocation_notified, client_org_id, is_active";

function mapClient(r: Record<string, unknown>): VaultClient {
  return {
    id: r.id as string,
    clientCode: r.client_code as string,
    companyName: r.company_name as string,
    taxId: (r.tax_id as string) ?? null,
    vatRegistered: Boolean(r.vat_registered),
    fiscalYearEndMonth: Number(r.fiscal_year_end_month ?? 12),
    fiscalYearEndDay: Number(r.fiscal_year_end_day ?? 31),
    storageLocation: (r.storage_location as string) ?? null,
    dbdRelocationNotified: Boolean(r.dbd_relocation_notified),
    clientOrgId: (r.client_org_id as string) ?? null,
    isActive: Boolean(r.is_active),
  };
}

export async function listCategories(db: DB): Promise<VaultCategory[]> {
  const { data, error } = await db
    .from("acc_firm_vault_categories")
    .select(
      "id, code, group_code, name_th, frequency, retention_years, is_sensitive, required_by_default, sort_order",
    )
    .eq("is_active", true)
    .order("sort_order");
  if (error) throw new Error(error.message);
  return (data ?? []).map((r) => ({
    id: r.id as string,
    code: r.code as string,
    groupCode: r.group_code as VaultCategory["groupCode"],
    nameTh: r.name_th as string,
    frequency: r.frequency as VaultCategory["frequency"],
    retentionYears: Number(r.retention_years),
    isSensitive: Boolean(r.is_sensitive),
    requiredByDefault: Boolean(r.required_by_default),
    sortOrder: Number(r.sort_order),
  }));
}

export async function getClient(
  db: DB,
  firmOrgId: string,
  clientId: string,
): Promise<VaultClient | null> {
  const { data, error } = await db
    .from("acc_firm_service_clients")
    .select(CLIENT_COLUMNS)
    .eq("firm_org_id", firmOrgId)
    .eq("id", clientId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return data ? mapClient(data as unknown as Record<string, unknown>) : null;
}

/**
 * หน้าแรกของคลัง — ลูกค้าทุกรายพร้อมตัวเลข "ขาดอะไรบ้าง"
 * นับจาก checklist ที่ยัง `missing` และ required เท่านั้น (na/ยกเว้นไม่นับ)
 */
export async function listClientSummaries(
  db: DB,
  firmOrgId: string,
  opts: { includeInactive?: boolean } = {},
): Promise<ClientVaultSummary[]> {
  let q = db
    .from("acc_firm_service_clients")
    .select(CLIENT_COLUMNS)
    .eq("firm_org_id", firmOrgId)
    .order("client_code");
  if (!opts.includeInactive) q = q.eq("is_active", true);

  const { data: clients, error } = await q;
  if (error) throw new Error(error.message);
  const list = (clients ?? []).map((r) => mapClient(r as unknown as Record<string, unknown>));
  if (list.length === 0) return [];

  const ids = list.map((c) => c.id);
  const today = new Date().toISOString().slice(0, 10);

  const [checklistRes, docsRes] = await Promise.all([
    db
      .from("acc_firm_vault_checklist")
      .select("client_id, status, is_required, due_date")
      .eq("firm_org_id", firmOrgId)
      .in("client_id", ids)
      .eq("status", "missing")
      .eq("is_required", true),
    db
      .from("acc_firm_vault_documents")
      .select("client_id, uploaded_at")
      .eq("firm_org_id", firmOrgId)
      .in("client_id", ids)
      .neq("status", "purged"),
  ]);
  if (checklistRes.error) throw new Error(checklistRes.error.message);
  if (docsRes.error) throw new Error(docsRes.error.message);

  const missing = new Map<string, { missing: number; overdue: number }>();
  for (const row of checklistRes.data ?? []) {
    const key = row.client_id as string;
    const cur = missing.get(key) ?? { missing: 0, overdue: 0 };
    cur.missing += 1;
    if (row.due_date && (row.due_date as string) < today) cur.overdue += 1;
    missing.set(key, cur);
  }

  const docStat = new Map<string, { count: number; last: string | null }>();
  for (const row of docsRes.data ?? []) {
    const key = row.client_id as string;
    const cur = docStat.get(key) ?? { count: 0, last: null };
    cur.count += 1;
    const at = row.uploaded_at as string;
    if (!cur.last || at > cur.last) cur.last = at;
    docStat.set(key, cur);
  }

  return list.map((client) => ({
    client,
    missingRequired: missing.get(client.id)?.missing ?? 0,
    overdueRequired: missing.get(client.id)?.overdue ?? 0,
    documentCount: docStat.get(client.id)?.count ?? 0,
    lastUploadAt: docStat.get(client.id)?.last ?? null,
  }));
}

export async function listPeriods(
  db: DB,
  firmOrgId: string,
  clientId: string,
): Promise<VaultPeriod[]> {
  const { data, error } = await db
    .from("acc_firm_vault_periods")
    .select("id, client_id, kind, period_start, period_end, fiscal_year, closed_at")
    .eq("firm_org_id", firmOrgId)
    .eq("client_id", clientId)
    .order("period_start", { ascending: false });
  if (error) throw new Error(error.message);
  return (data ?? []).map((r) => ({
    id: r.id as string,
    clientId: r.client_id as string,
    kind: r.kind as VaultPeriod["kind"],
    periodStart: r.period_start as string,
    periodEnd: r.period_end as string,
    fiscalYear: Number(r.fiscal_year),
    closedAt: (r.closed_at as string) ?? null,
  }));
}

/** checklist ของงวดหนึ่ง + จำนวนเอกสารที่แนบในแต่ละหมวด */
export async function getChecklist(
  db: DB,
  firmOrgId: string,
  periodId: string,
): Promise<ChecklistRow[]> {
  const { data, error } = await db
    .from("acc_firm_vault_checklist")
    .select(
      `id, period_id, category_id, status, is_required, due_date, waived_reason,
       category:acc_firm_vault_categories!inner (code, name_th, group_code, is_sensitive, sort_order)`,
    )
    .eq("firm_org_id", firmOrgId)
    .eq("period_id", periodId);
  if (error) throw new Error(error.message);

  const { data: docs, error: docErr } = await db
    .from("acc_firm_vault_documents")
    .select("category_id")
    .eq("firm_org_id", firmOrgId)
    .eq("period_id", periodId)
    .neq("status", "purged");
  if (docErr) throw new Error(docErr.message);

  const perCategory = new Map<string, number>();
  for (const d of docs ?? []) {
    const k = d.category_id as string;
    perCategory.set(k, (perCategory.get(k) ?? 0) + 1);
  }

  return (data ?? [])
    .map((r) => {
      const cat = r.category as unknown as Record<string, unknown>;
      return {
        id: r.id as string,
        periodId: r.period_id as string,
        categoryId: r.category_id as string,
        categoryCode: cat.code as string,
        categoryName: cat.name_th as string,
        groupCode: cat.group_code as ChecklistRow["groupCode"],
        isSensitive: Boolean(cat.is_sensitive),
        status: r.status as ChecklistStatus,
        isRequired: Boolean(r.is_required),
        dueDate: (r.due_date as string) ?? null,
        waivedReason: (r.waived_reason as string) ?? null,
        documentCount: perCategory.get(r.category_id as string) ?? 0,
        sortOrder: Number(cat.sort_order ?? 100),
      };
    })
    .sort((a, b) => a.sortOrder - b.sortOrder)
    .map(({ sortOrder: _sortOrder, ...row }) => row);
}

export async function listDocuments(
  db: DB,
  firmOrgId: string,
  filters: { clientId: string; periodId?: string; categoryId?: string; includePurged?: boolean },
): Promise<VaultDocument[]> {
  let q = db
    .from("acc_firm_vault_documents")
    .select(
      `id, client_id, period_id, category_id, title, storage_path, mime_type, size_bytes, sha256,
       doc_date, amount, counterparty, classification, status, retention_until, legal_hold,
       version, source, uploaded_at,
       category:acc_firm_vault_categories!inner (code, name_th, is_sensitive),
       uploader:profiles!acc_firm_vault_documents_uploaded_by_fkey (display_name, email)`,
    )
    .eq("firm_org_id", firmOrgId)
    .eq("client_id", filters.clientId)
    .order("uploaded_at", { ascending: false });

  if (filters.periodId) q = q.eq("period_id", filters.periodId);
  if (filters.categoryId) q = q.eq("category_id", filters.categoryId);
  if (!filters.includePurged) q = q.neq("status", "purged");

  const { data, error } = await q;
  if (error) throw new Error(error.message);

  return (data ?? []).map((r) => {
    const cat = r.category as unknown as Record<string, unknown>;
    const up = r.uploader as unknown as Record<string, unknown> | null;
    return {
      id: r.id as string,
      clientId: r.client_id as string,
      periodId: (r.period_id as string) ?? null,
      categoryId: r.category_id as string,
      categoryCode: cat.code as string,
      categoryName: cat.name_th as string,
      isSensitive: Boolean(cat.is_sensitive),
      title: r.title as string,
      storagePath: r.storage_path as string,
      mimeType: (r.mime_type as string) ?? null,
      sizeBytes: r.size_bytes === null ? null : Number(r.size_bytes),
      sha256: r.sha256 as string,
      docDate: (r.doc_date as string) ?? null,
      amount: r.amount === null ? null : Number(r.amount),
      counterparty: (r.counterparty as string) ?? null,
      classification: r.classification as VaultDocument["classification"],
      status: r.status as VaultDocument["status"],
      retentionUntil: r.retention_until as string,
      legalHold: Boolean(r.legal_hold),
      version: Number(r.version ?? 1),
      source: r.source as VaultDocument["source"],
      uploadedAt: r.uploaded_at as string,
      uploadedByName: (up?.display_name as string) ?? (up?.email as string) ?? null,
    };
  });
}

export async function listCustody(
  db: DB,
  firmOrgId: string,
  clientId: string,
): Promise<CustodyEntry[]> {
  const { data, error } = await db
    .from("acc_firm_vault_custody_log")
    .select(
      `id, client_id, direction, handed_by, method, item_summary, item_count, receipt_no,
       signature_path, occurred_at, note,
       receiver:profiles!acc_firm_vault_custody_log_received_by_fkey (display_name, email)`,
    )
    .eq("firm_org_id", firmOrgId)
    .eq("client_id", clientId)
    .order("occurred_at", { ascending: false });
  if (error) throw new Error(error.message);

  return (data ?? []).map((r) => {
    const rec = r.receiver as unknown as Record<string, unknown> | null;
    return {
      id: r.id as string,
      clientId: r.client_id as string,
      direction: r.direction as CustodyEntry["direction"],
      handedBy: (r.handed_by as string) ?? null,
      method: r.method as CustodyEntry["method"],
      itemSummary: r.item_summary as string,
      itemCount: r.item_count === null ? null : Number(r.item_count),
      receiptNo: (r.receipt_no as string) ?? null,
      signaturePath: (r.signature_path as string) ?? null,
      occurredAt: r.occurred_at as string,
      note: (r.note as string) ?? null,
      receivedByName: (rec?.display_name as string) ?? (rec?.email as string) ?? null,
    };
  });
}
