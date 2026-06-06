import { Injectable, Logger } from '@nestjs/common';
import { getAdminClient } from '../lib/supabase';

// ─── Types ───────────────────────────────────────────────────────────────────
export type OcrExtractionResult = {
  document_type: string;
  document_variant: string | null;
  language: string;
  vendor: { name: string; tax_id: string | null; branch: string | null; address: string | null };
  customer: { name: string; tax_id: string | null; branch: string | null; address: string | null };
  document: { number: string | null; date: string | null; due_date: string | null; currency: string };
  amounts: {
    subtotal: number | null;
    discount: number | null;
    vat_rate: number | null;
    vat_amount: number | null;
    withholding_tax_rate: number | null;
    withholding_tax_amount: number | null;
    grand_total: number | null;
    paid_amount: number | null;
  };
  items: Array<{ description: string; qty: number | null; unit_price: number | null; amount: number | null; vat_eligible: boolean }>;
  payment: { method: string; bank_name: string | null; transaction_ref: string | null };
  confidence: { overall: number; date: number; tax_id: number; total: number; vat: number };
  warnings: string[];
};

export type ClassificationResult = {
  transaction_type: string;
  business_event: string;
  recommended_accounts: Array<{
    account_code: string;
    account_name: string;
    account_type: string;
    allocation_amount: number;
    reason: string;
    confidence: number;
  }>;
  tax_treatment: {
    vat_applicable: boolean;
    vat_type: string;
    vat_account_code: string | null;
    non_deductible_vat: boolean;
    withholding_tax_applicable: boolean;
    withholding_tax_rate: number | null;
    withholding_tax_account_code: string | null;
  };
  needs_review: boolean;
  review_reasons: string[];
};

export type JournalEntryResult = {
  journal_status: string;
  posting_date: string;
  document_ref: string | null;
  description: string;
  entries: Array<{ line: number; account_code: string; debit: number; credit: number; memo: string }>;
  totals: { debit: number; credit: number; balanced: boolean };
  tax_summary: { input_vat: number; output_vat: number; withholding_tax: number };
  confidence: number;
  needs_human_approval: boolean;
  approval_reason: string;
};

export type ClientContext = {
  client_id: string;
  client_name: string;
  business_type: string;
  vat_registered: boolean;
  withholding_tax_required: boolean;
  accounting_method: string;
  chart_of_accounts: Array<{ id: string; code: string; name: string; type: string }>;
  posting_rules: unknown[];
  contacts: Array<{ name: string; tax_id: string | null; contact_type: string }>;
};

// ─── Prompts ─────────────────────────────────────────────────────────────────
const PROMPT_OCR = `You are an expert Thai accounting document OCR extractor.
Your job is to read and convert document images/PDFs into structured JSON data.

Task:
Extract comprehensive information from the provided Thai receipt, tax invoice, bill, invoice, withholding tax certificate (หนังสือรับรองการหักภาษี ณ ที่จ่าย), or payment voucher.

Critical Extraction Rules:
1. DO NOT guess missing data. If a field is not visible or you are uncertain, return null.
2. Preserve Thai characters, names, and addresses exactly as written.
3. Normalize Date formats: Convert Thai Buddhist Era (พ.ศ.) to Christian Era (A.D. e.g., 2569 -> 2026) and output in ISO YYYY-MM-DD format.
4. Normalize Monetary Values: Convert all numeric string representations to float numbers. Strip commas.
5. Identify Document Details:
   - "document_type": Classify exactly as 'tax_invoice', 'receipt', 'receipt_tax_invoice', 'invoice', 'wht_certificate', 'delivery_note', 'billing_note', or 'unknown'.
   - "document_variant": Classify whether it's the original ('original') or copy ('copy') or substitute ('substitute').
6. Extract Entity Information (13-digit Tax ID & Branch):
   - Thai Tax IDs are exactly 13 digits.
   - Branch code: e.g., "00000" (for Head Office/สำนักงานใหญ่) or "00001" (for branch code).
7. Thai Tax Nuances:
   - Separate Subtotal (before tax), Discount (before/after tax), VAT Rate (usually 7%, 0%, or null for exempt), VAT Amount, WHT Rate (1%, 3%, 5%, etc.), WHT Amount.
   - Detect if withholding tax is calculated on the subtotal.
8. Line Items Details: Extract visible item lists.
9. Output JSON ONLY. No markdown wrapping except raw JSON.

Output JSON Schema:
{
  "document_type": "tax_invoice" | "receipt" | "receipt_tax_invoice" | "invoice" | "wht_certificate" | "delivery_note" | "billing_note" | "unknown",
  "document_variant": "original" | "copy" | "substitute" | null,
  "language": "th" | "en",
  "vendor": { "name": string, "tax_id": string (13 digits) | null, "branch": string (5 digits) | null, "address": string | null },
  "customer": { "name": string, "tax_id": string (13 digits) | null, "branch": string (5 digits) | null, "address": string | null },
  "document": { "number": string | null, "date": "YYYY-MM-DD" | null, "due_date": "YYYY-MM-DD" | null, "currency": "THB" },
  "amounts": {
    "subtotal": float | null, "discount": float | null, "vat_rate": float | null, "vat_amount": float | null,
    "withholding_tax_rate": float | null, "withholding_tax_amount": float | null, "grand_total": float | null, "paid_amount": float | null
  },
  "items": [ { "description": string, "qty": float | null, "unit_price": float | null, "amount": float | null, "vat_eligible": boolean } ],
  "payment": { "method": "cash" | "bank_transfer" | "credit_card" | "cheque" | "unpaid", "bank_name": string | null, "transaction_ref": string | null },
  "confidence": { "overall": float, "date": float, "tax_id": float, "total": float, "vat": float },
  "warnings": string[]
}`;

const PROMPT_CLASSIFY = `You are an intelligent accounting classification engine for a Thai accounting firm.
Your job is to classify the extracted document data into suitable accounting meanings based on the client's business context.

Input Context:
1. OCR Extracted JSON (Product of Prompt 1)
2. Client Business Profile (Name, industry type, VAT status)
3. Client's Chart of Accounts (List of approved codes, names, and types)
4. Client's Posting Rules (Preset configurations)
5. Historical Mappings (Successful vendor-to-account mappings)

Thai Tax & Accounting Rules to Follow:
1. VAT Eligibility:
   - If Client is registered for VAT ("vat_registered": true) and the document is 'tax_invoice' or 'receipt_tax_invoice':
     - Map the VAT amount to the Input VAT Account (ภาษีซื้อ - Asset category).
     - Exceptions (Non-deductible Input VAT / ภาษีซื้อต้องห้าม): e.g., entertainment expenses (ค่ารับรอง), passenger vehicles with less than 10 seats (รถยนต์นั่งไม่เกิน 10 ที่นั่ง). For these, you must capitalize the VAT amount directly into the main expense or asset account, NOT the Input VAT Account.
   - If Client is NOT registered for VAT: Capitalize the VAT amount into the main expense or asset account.
2. Withholding Tax (WHT) Treatment:
   - Identify WHT category (ภ.ง.ด. 1/3/53) based on WHT Certificate details.
   - Common WHT Rates in Thailand: 1% (transportation/ขนส่ง), 3% (service/ค่าบริการ/โฆษณา), 5% (rent/ค่าเช่า).
   - If WHT is present, flag the matching account (ภาษีหัก ณ ที่จ่ายค้างจ่าย - Liability category for purchase).
3. AP vs Cash:
   - If payment method is 'unpaid' or document is 'invoice', select Accounts Payable (เจ้าหนี้การค้า - Liability category) as the credit counterparty.
   - If payment method is cash, bank_transfer, or credit_card, select Cash/Bank equivalents as the credit counterparty.
4. ONLY USE ACCOUNT CODES PRESENT IN THE PROVIDED CHART OF ACCOUNTS. DO NOT CREATE NEW CODES.
5. If no suitable accounts exist, set "needs_review" = true.

Output JSON Schema:
{
  "transaction_type": "purchase" | "sale" | "expense_reimbursement" | "asset_purchase" | "tax_payment" | "unknown",
  "business_event": string,
  "recommended_accounts": [ { "account_code": string, "account_name": string, "account_type": "asset" | "liability" | "equity" | "income" | "expense", "allocation_amount": float, "reason": string, "confidence": float } ],
  "tax_treatment": {
    "vat_applicable": boolean, "vat_type": "input_vat" | "output_vat" | "none", "vat_account_code": string | null,
    "non_deductible_vat": boolean, "withholding_tax_applicable": boolean, "withholding_tax_rate": float | null, "withholding_tax_account_code": string | null
  },
  "needs_review": boolean,
  "review_reasons": string[]
}`;

const PROMPT_JOURNAL = `You are an expert accounting journal entry generator for a Thai accounting firm.
Your job is to generate a mathematically balanced double-entry journal entry from the OCR details and accounting classification.

Important Rules:
1. Total Debit MUST EQUAL Total Credit (Tolerance = 0.00). If they do not balance, return "journal_status" = "draft_review_required".
2. Only use account codes defined in the classification input. Do not make up account codes.
3. Determine the perspective: Generate the entry from the CLIENT COMPANY'S PERSPECTIVE.
4. Typical Double Entry Patterns:
   - Purchase with VAT & WHT (Accrual/Invoice):
     Debit: Expense or Asset (Amount = Subtotal + Non-deductible VAT)
     Debit: Input VAT (Amount = VAT Amount, if deductible)
     Credit: Accounts Payable (Amount = Grand Total)
   - Purchase with VAT & WHT (Cash/Paid):
     Debit: Expense or Asset (Amount = Subtotal + Non-deductible VAT)
     Debit: Input VAT (Amount = VAT Amount, if deductible)
     Credit: Withholding Tax Payable (ภาษีหัก ณ ที่จ่ายค้างจ่าย - ภ.ง.ด. 3 หรือ 53) (Amount = WHT Amount)
     Credit: Cash / Bank (Amount = Net paid: Grand Total - WHT Amount)
5. Set "journal_status" = "draft" (Never set to "posted").
6. Set "needs_human_approval" = true.

Output JSON Schema:
{
  "journal_status": "draft",
  "posting_date": "YYYY-MM-DD",
  "document_ref": string | null,
  "description": string,
  "entries": [ { "line": integer, "account_code": string, "debit": float, "credit": float, "memo": string } ],
  "totals": { "debit": float, "credit": float, "balanced": boolean },
  "tax_summary": { "input_vat": float, "output_vat": float, "withholding_tax": float },
  "confidence": float,
  "needs_human_approval": true,
  "approval_reason": string
}`;

const GEMINI_MODEL = 'gemini-2.5-flash';

@Injectable()
export class OcrService {
  private readonly log = new Logger(OcrService.name);

  // ── Public entrypoint (never throws — invoked fire-and-forget) ──────────────
  async processJob(jobId: string, firmOrgId: string): Promise<void> {
    try {
      await this.runJob(jobId, firmOrgId);
    } catch (e) {
      this.log.error(
        `Unhandled error processing job ${jobId}: ${e instanceof Error ? e.message : String(e)}`,
      );
    }
  }

  private async runJob(jobId: string, firmOrgId: string): Promise<void> {
    const admin = getAdminClient();

    const { data: job, error: jobError } = await admin
      .from('ocr_processing_jobs')
      .select('*')
      .eq('id', jobId)
      .eq('firm_org_id', firmOrgId)
      .maybeSingle();

    if (jobError) {
      this.log.error(`Failed to load job ${jobId}: ${jobError.message}`);
      return;
    }
    if (!job) {
      this.log.warn(`Job ${jobId} not found for firm ${firmOrgId}`);
      return;
    }
    if (job.status === 'completed') {
      this.log.log(`Job ${jobId} already completed; skipping.`);
      return;
    }

    // Best-effort: attribute downstream audit-log rows to the user who triggered
    // the job (Tier-1 GUC). created_by on journal_entries provides Tier-2 fallback.
    if (job.triggered_by) {
      await admin
        .rpc('set_audit_context', { p_actor_id: job.triggered_by, p_org_id: job.client_org_id })
        .then(
          () => undefined,
          (e: unknown) => this.log.warn(`set_audit_context failed: ${String(e)}`),
        );
    }

    try {
      // 1. Client relationship must still be active.
      const { data: relation, error: relError } = await admin
        .from('acc_firm_clients')
        .select('id, status')
        .eq('firm_org_id', firmOrgId)
        .eq('client_org_id', job.client_org_id)
        .maybeSingle();
      if (relError) throw new Error(`โหลดความสัมพันธ์ลูกค้าล้มเหลว: ${relError.message}`);
      if (!relation || relation.status !== 'active') {
        throw new Error('ความสัมพันธ์ลูกค้าไม่อยู่ในสถานะที่ใช้งานได้');
      }

      // 2. Storage path must belong to this client org (defense against cross-tenant reads).
      const storagePath = this.extractStoragePath(job.document_url);
      if (!storagePath.startsWith(`${job.client_org_id}/`)) {
        throw new Error('เส้นทางไฟล์เอกสารไม่ตรงกับองค์กรลูกค้า');
      }

      // 3. Download → OCR → classify → journal.
      const { base64, mimeType } = await this.downloadAndEncodeDocument(storagePath);
      const extractedData = await this.extractOcrWithGemini(base64, mimeType);
      const clientContext = await this.getClientContext(firmOrgId, job.client_org_id);
      const classification = await this.classifyTransaction(extractedData, clientContext);
      const journalData = await this.generateJournalEntry(extractedData, classification, clientContext);

      // 4. Persist draft journal (idempotent: clear stale draft first).
      const draftJournalId = await this.persistDraftJournal(
        admin,
        job,
        journalData,
        clientContext,
      );

      // 5. Mark job completed.
      const { error: updateEndError } = await admin
        .from('ocr_processing_jobs')
        .update({
          status: 'completed',
          extracted_json: extractedData,
          classified_json: { classification, journal: journalData },
          draft_journal_id: draftJournalId,
          error_message: null,
          updated_at: new Date().toISOString(),
        })
        .eq('id', jobId);
      if (updateEndError) throw new Error(updateEndError.message);

      this.log.log(`Job ${jobId} completed (draft_journal_id=${draftJournalId ?? 'none'}).`);
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : 'เกิดข้อผิดพลาดในการประมวลผลเอกสาร';
      this.log.error(`Job ${jobId} failed: ${errorMsg}`);
      await admin
        .from('ocr_processing_jobs')
        .update({ status: 'failed', error_message: errorMsg, updated_at: new Date().toISOString() })
        .eq('id', jobId);
    }
  }

  // ── Draft journal persistence (with idempotency + integrity guards) ──────────
  private async persistDraftJournal(
    admin: ReturnType<typeof getAdminClient>,
    job: any,
    journalData: JournalEntryResult,
    clientContext: ClientContext,
  ): Promise<string | null> {
    if (!journalData.entries || journalData.entries.length < 2) return null;

    // Idempotency: remove a previously-generated draft (only if still 'draft')
    // so a re-run does not orphan duplicate journals.
    if (job.draft_journal_id) {
      const { data: existing } = await admin
        .from('journal_entries')
        .select('id, status')
        .eq('id', job.draft_journal_id)
        .maybeSingle();
      if (existing && existing.status === 'draft') {
        await admin.from('journal_items').delete().eq('journal_entry_id', existing.id);
        await admin.from('journal_entries').delete().eq('id', existing.id);
      }
    }

    const { data: je, error: jeError } = await admin
      .from('journal_entries')
      .insert({
        organization_id: job.client_org_id,
        entry_date: journalData.posting_date || new Date().toISOString().split('T')[0],
        reference_number: journalData.document_ref || null,
        memo: journalData.description || 'บันทึกบัญชีอัตโนมัติจากใบเสร็จ/บิล',
        status: 'draft',
        created_by: job.triggered_by,
        created_by_ai: true,
        ocr_job_id: job.id,
      })
      .select('id')
      .single();
    if (jeError) throw new Error(jeError.message);
    const draftJournalId = je.id as string;

    try {
      const itemsToInsert = journalData.entries.map((entry, idx) => {
        const acc = clientContext.chart_of_accounts.find((a) => a.code === entry.account_code);
        if (!acc) throw new Error(`ไม่พบรหัสบัญชี "${entry.account_code}" ในผังบัญชีของลูกค้า`);

        const debit = Math.max(0, Number(entry.debit || 0));
        const credit = Math.max(0, Number(entry.credit || 0));
        if (debit > 0 && credit > 0) {
          throw new Error(`บรรทัดรหัสบัญชี "${entry.account_code}" ต้องมีเดบิตหรือเครดิตเพียงฝั่งเดียว`);
        }
        if (debit === 0 && credit === 0) {
          throw new Error(`บรรทัดรหัสบัญชี "${entry.account_code}" มียอดเงินเป็นศูนย์ทั้งสองฝั่ง`);
        }

        return {
          organization_id: job.client_org_id,
          journal_entry_id: draftJournalId,
          line_no: idx + 1, // sequential — never trust AI-provided line numbers
          account_id: acc.id,
          description: entry.memo || null,
          debit,
          credit,
        };
      });

      const { error: jiError } = await admin.from('journal_items').insert(itemsToInsert);
      if (jiError) throw new Error(jiError.message);
    } catch (insertError) {
      // Roll back the header so we never leave a journal with no lines.
      await admin.from('journal_entries').delete().eq('id', draftJournalId);
      throw insertError;
    }

    return draftJournalId;
  }

  // ── Storage ──────────────────────────────────────────────────────────────────
  private extractStoragePath(documentUrl: string): string {
    if (documentUrl.includes('/client_documents/')) {
      return documentUrl.split('/client_documents/')[1].split('?')[0];
    }
    return documentUrl.split('?')[0];
  }

  private async downloadAndEncodeDocument(
    storagePath: string,
  ): Promise<{ base64: string; mimeType: string }> {
    const admin = getAdminClient();
    const { data, error } = await admin.storage.from('client_documents').download(storagePath);
    if (error) throw new Error(`ดาวน์โหลดเอกสารจาก storage ล้มเหลว: ${error.message}`);

    const arrayBuffer = await data.arrayBuffer();
    const base64 = Buffer.from(arrayBuffer).toString('base64');
    const mimeType = data.type || 'application/pdf';
    return { base64, mimeType };
  }

  // ── Gemini calls ─────────────────────────────────────────────────────────────
  private async callGemini(parts: unknown[], maxOutputTokens: number): Promise<string> {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) throw new Error('GEMINI_API_KEY is not configured.');

    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${apiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts }],
          generationConfig: {
            maxOutputTokens,
            temperature: 0.1,
            responseMimeType: 'application/json',
          },
        }),
      },
    );

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Gemini API request failed: ${response.status} - ${errorText}`);
    }

    const result: any = await response.json();
    if (!result.candidates || result.candidates.length === 0) {
      const blockReason = result.promptFeedback?.blockReason || 'Blocked by Gemini safety settings or filter';
      throw new Error(`Gemini API returned no candidates. Reason: ${blockReason}`);
    }
    const finishReason = result.candidates[0].finishReason;
    if (finishReason && finishReason !== 'STOP') {
      throw new Error(`Gemini response incomplete (finishReason=${finishReason}). อาจมีเนื้อหายาวเกินไป`);
    }
    return result.candidates[0].content?.parts?.[0]?.text || '';
  }

  private parseJson<T>(text: string, context: string): T {
    const cleaned = text.replace(/^```[a-z]*\n?/i, '').replace(/\n?```$/i, '').trim();
    try {
      return JSON.parse(cleaned) as T;
    } catch {
      throw new Error(`แปลงผลลัพธ์ JSON จาก Gemini (${context}) ล้มเหลว`);
    }
  }

  private async extractOcrWithGemini(base64Data: string, mimeType: string): Promise<OcrExtractionResult> {
    const text = await this.callGemini(
      [{ text: PROMPT_OCR }, { inline_data: { mime_type: mimeType, data: base64Data } }],
      8000,
    );
    const parsed = this.parseJson<OcrExtractionResult>(text, 'OCR');
    parsed.warnings = this.validateOcrMathematics(parsed);
    return parsed;
  }

  private async classifyTransaction(
    ocrData: OcrExtractionResult,
    clientContext: ClientContext,
  ): Promise<ClassificationResult> {
    const input = `OCR EXTRACTED DOCUMENT:\n${JSON.stringify(ocrData, null, 2)}\n\nCLIENT CONTEXT:\n${JSON.stringify(clientContext, null, 2)}`;
    const text = await this.callGemini([{ text: PROMPT_CLASSIFY }, { text: input }], 2000);
    return this.parseJson<ClassificationResult>(text, 'classification');
  }

  private async generateJournalEntry(
    ocrData: OcrExtractionResult,
    classification: ClassificationResult,
    clientContext: ClientContext,
  ): Promise<JournalEntryResult> {
    const input = `OCR EXTRACTED DOCUMENT:\n${JSON.stringify(ocrData, null, 2)}\n\nACCOUNTING CLASSIFICATION:\n${JSON.stringify(classification, null, 2)}\n\nCLIENT CONTEXT:\n${JSON.stringify(clientContext, null, 2)}`;
    const text = await this.callGemini([{ text: PROMPT_JOURNAL }, { text: input }], 2000);
    return this.parseJson<JournalEntryResult>(text, 'journal entry');
  }

  // ── Validation ─────────────────────────────────────────────────────────────
  private validateOcrMathematics(data: OcrExtractionResult): string[] {
    const warnings: string[] = [...(data.warnings || [])];
    const amounts = data.amounts;

    if (amounts && amounts.subtotal !== null && amounts.grand_total !== null) {
      const subtotal = amounts.subtotal;
      const discount = amounts.discount || 0;
      const vat = amounts.vat_amount || 0;
      const wht = amounts.withholding_tax_amount || 0;
      const grandTotal = amounts.grand_total;

      const calculatedInvoiceTotal = subtotal - discount + vat;
      const diff = Math.abs(calculatedInvoiceTotal - grandTotal);
      if (diff > 0.1) {
        const calculatedNetPaid = subtotal - discount + vat - wht;
        if (Math.abs(calculatedNetPaid - grandTotal) <= 0.1) {
          warnings.push('ยอดเงินสุทธิคำนวณแบบหักภาษี ณ ที่จ่ายโดยตรง (Net Paid)');
        } else {
          warnings.push(`ผลรวมตัวเลขไม่สอดคล้องกัน (คำนวณได้: ${calculatedInvoiceTotal.toFixed(2)}, ยอดในเอกสาร: ${grandTotal.toFixed(2)})`);
        }
      }
    }

    if (data.confidence) {
      if (typeof data.confidence.overall === 'number' && data.confidence.overall < 0.8) {
        warnings.push(`ระดับความแม่นยำภาพรวมต่ำกว่าเกณฑ์ (${(data.confidence.overall * 100).toFixed(0)}%)`);
      }
      if (
        typeof data.confidence.tax_id === 'number' &&
        data.confidence.tax_id < 0.8 &&
        (data.vendor?.tax_id || data.customer?.tax_id)
      ) {
        warnings.push('ระดับความแม่นยำของเลขประจำตัวผู้เสียภาษีต่ำ');
      }
    }

    return warnings;
  }

  // ── Client context ───────────────────────────────────────────────────────────
  private async getClientContext(firmOrgId: string, clientOrgId: string): Promise<ClientContext> {
    const admin = getAdminClient();

    const { data: org, error: orgError } = await admin
      .from('organizations')
      .select('id, name')
      .eq('id', clientOrgId)
      .single();
    if (orgError) throw new Error(`โหลดข้อมูลองค์กรลูกค้าล้มเหลว: ${orgError.message}`);

    const { data: accounts, error: accountsError } = await admin
      .from('accounts')
      .select('id, code, name, type')
      .eq('organization_id', clientOrgId)
      .eq('is_active', true);
    if (accountsError) throw new Error(`โหลดผังบัญชีลูกค้าล้มเหลว: ${accountsError.message}`);

    const { data: config, error: configError } = await admin
      .from('acc_firm_client_configs')
      .select('*')
      .eq('firm_org_id', firmOrgId)
      .eq('client_org_id', clientOrgId)
      .maybeSingle();
    if (configError) throw new Error(`โหลดค่ากำหนดลูกค้าล้มเหลว: ${configError.message}`);

    const { data: contacts } = await admin
      .from('contacts')
      .select('name, tax_id, contact_type')
      .eq('organization_id', clientOrgId)
      .eq('is_active', true)
      .limit(100);

    return {
      client_id: clientOrgId,
      client_name: org.name,
      business_type: 'general',
      vat_registered: config ? config.vat_registered : true,
      withholding_tax_required: config ? config.withholding_tax_required : true,
      accounting_method: config ? config.accounting_method : 'accrual',
      chart_of_accounts: accounts || [],
      posting_rules: config?.custom_posting_rules || [],
      contacts: contacts || [],
    };
  }
}
