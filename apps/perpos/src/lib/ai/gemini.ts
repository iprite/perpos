import { createSupabaseAdminClient } from '../supabase/admin';

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
  "vendor": {
    "name": string,
    "tax_id": string (13 digits) | null,
    "branch": string (5 digits) | null,
    "address": string | null
  },
  "customer": {
    "name": string,
    "tax_id": string (13 digits) | null,
    "branch": string (5 digits) | null,
    "address": string | null
  },
  "document": {
    "number": string | null,
    "date": "YYYY-MM-DD" | null,
    "due_date": "YYYY-MM-DD" | null,
    "currency": "THB"
  },
  "amounts": {
    "subtotal": float | null,
    "discount": float | null,
    "vat_rate": float | null,
    "vat_amount": float | null,
    "withholding_tax_rate": float | null,
    "withholding_tax_amount": float | null,
    "grand_total": float | null,
    "paid_amount": float | null
  },
  "items": [
    {
      "description": string,
      "qty": float | null,
      "unit_price": float | null,
      "amount": float | null,
      "vat_eligible": boolean
    }
  ],
  "payment": {
    "method": "cash" | "bank_transfer" | "credit_card" | "cheque" | "unpaid",
    "bank_name": string | null,
    "transaction_ref": string | null
  },
  "confidence": {
    "overall": float,
    "date": float,
    "tax_id": float,
    "total": float,
    "vat": float
  },
  "warnings": string[]
}`;

export type OcrExtractionResult = {
  document_type: string;
  document_variant: string | null;
  language: string;
  vendor: {
    name: string;
    tax_id: string | null;
    branch: string | null;
    address: string | null;
  };
  customer: {
    name: string;
    tax_id: string | null;
    branch: string | null;
    address: string | null;
  };
  document: {
    number: string | null;
    date: string | null;
    due_date: string | null;
    currency: string;
  };
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
  items: Array<{
    description: string;
    qty: number | null;
    unit_price: number | null;
    amount: number | null;
    vat_eligible: boolean;
  }>;
  payment: {
    method: string;
    bank_name: string | null;
    transaction_ref: string | null;
  };
  confidence: {
    overall: number;
    date: number;
    tax_id: number;
    total: number;
    vat: number;
  };
  warnings: string[];
};

/**
 * Parses the document URL and downloads it from Supabase Storage 'client_documents' bucket,
 * converting it to a Base64 string.
 */
export async function downloadAndEncodeDocument(documentUrl: string): Promise<{ base64: string; mimeType: string }> {
  const admin = createSupabaseAdminClient();
  
  // Extract path inside bucket
  let storagePath = documentUrl;
  if (documentUrl.includes('/client_documents/')) {
    storagePath = documentUrl.split('/client_documents/')[1].split('?')[0];
  }

  const { data, error } = await admin
    .storage
    .from('client_documents')
    .download(storagePath);

  if (error) {
    throw new Error(`Failed to download document from storage: ${error.message}`);
  }

  const arrayBuffer = await data.arrayBuffer();
  const buffer = Buffer.from(arrayBuffer);
  const base64 = buffer.toString('base64');
  const mimeType = data.type || 'application/pdf';

  return { base64, mimeType };
}

/**
 * Validates the mathematical consistency of the OCR result and appends warning messages if necessary.
 */
export function validateOcrMathematics(data: OcrExtractionResult): string[] {
  const warnings: string[] = [...(data.warnings || [])];
  const amounts = data.amounts;

  if (amounts.subtotal !== null && amounts.grand_total !== null) {
    const subtotal = amounts.subtotal;
    const discount = amounts.discount || 0;
    const vat = amounts.vat_amount || 0;
    const wht = amounts.withholding_tax_amount || 0;
    const grandTotal = amounts.grand_total;

    // Standard Math: Grand Total should be Subtotal - Discount + VAT
    // Note WHT is usually deducted from payment, but might or might not affect invoice grand total depending on display layout
    const calculatedInvoiceTotal = subtotal - discount + vat;
    const diff = Math.abs(calculatedInvoiceTotal - grandTotal);
    
    // Check with 0.1 tolerance for rounding errors
    if (diff > 0.1) {
      // Check if grand total is calculated by subtracting WHT (e.g. Net Paid display)
      const calculatedNetPaid = subtotal - discount + vat - wht;
      if (Math.abs(calculatedNetPaid - grandTotal) <= 0.1) {
        warnings.push('ยอดเงินสุทธิคำนวณแบบหักภาษี ณ ที่จ่ายโดยตรง (Net Paid)');
      } else {
        warnings.push(`ผลรวมตัวเลขไม่สอดคล้องกัน (คำนวณได้: ${calculatedInvoiceTotal.toFixed(2)}, ยอดในเอกสาร: ${grandTotal.toFixed(2)})`);
      }
    }
  }

  // Check confidence scores
  if (data.confidence) {
    if (data.confidence.overall < 0.8) {
      warnings.push(`ระดับความแม่นยำภาพรวมต่ำกว่าเกณฑ์ (${(data.confidence.overall * 100).toFixed(0)}%)`);
    }
    if (data.confidence.tax_id < 0.8 && (data.vendor.tax_id || data.customer.tax_id)) {
      warnings.push('ระดับความแม่นยำของเลขประจำตัวผู้เสียภาษีต่ำ');
    }
  }

  return warnings;
}

/**
 * Calls the Gemini 2.5 Flash API to extract document details from Base64 file stream.
 */
export async function extractOcrWithGemini(
  base64Data: string,
  mimeType: string
): Promise<OcrExtractionResult> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error('GEMINI_API_KEY is not configured in environment variables.');
  }

  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        contents: [
          {
            parts: [
              { text: PROMPT_OCR },
              {
                inline_data: {
                  mime_type: mimeType,
                  data: base64Data,
                },
              },
            ],
          },
        ],
        generationConfig: {
          maxOutputTokens: 4000,
          temperature: 0.1,
          responseMimeType: 'application/json', // Force JSON structure
        },
      }),
    }
  );

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Gemini API request failed: ${response.status} - ${errorText}`);
  }

  const result = await response.json();
  
  if (!result.candidates || result.candidates.length === 0) {
    const blockReason = result.promptFeedback?.blockReason || 'Blocked by Gemini safety settings or filter';
    throw new Error(`Gemini API returned no candidates. Reason: ${blockReason}`);
  }

  const text = result.candidates[0].content?.parts?.[0]?.text || '';
  const cleaned = text.replace(/^```[a-z]*\n?/i, '').replace(/\n?```$/i, '').trim();

  let parsed: OcrExtractionResult;
  try {
    parsed = JSON.parse(cleaned) as OcrExtractionResult;
  } catch (err) {
    throw new Error(`Failed to parse JSON response from Gemini. Raw response: ${text}`);
  }

  // Run math checks and enrich warnings
  parsed.warnings = validateOcrMathematics(parsed);

  return parsed;
}

// ─── Phase 3: AI Classification & Journal Entry Generation Prompts & Functions ───

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
  "recommended_accounts": [
    {
      "account_code": string,
      "account_name": string,
      "account_type": "asset" | "liability" | "equity" | "income" | "expense",
      "allocation_amount": float,
      "reason": string,
      "confidence": float
    }
  ],
  "tax_treatment": {
    "vat_applicable": boolean,
    "vat_type": "input_vat" | "output_vat" | "none",
    "vat_account_code": string | null,
    "non_deductible_vat": boolean,
    "withholding_tax_applicable": boolean,
    "withholding_tax_rate": float | null,
    "withholding_tax_account_code": string | null
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
  "entries": [
    {
      "line": integer,
      "account_code": string,
      "debit": float,
      "credit": float,
      "memo": string
    }
  ],
  "totals": {
    "debit": float,
    "credit": float,
    "balanced": boolean
  },
  "tax_summary": {
    "input_vat": float,
    "output_vat": float,
    "withholding_tax": float
  },
  "confidence": float,
  "needs_human_approval": true,
  "approval_reason": string
}`;

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
  entries: Array<{
    line: number;
    account_code: string;
    debit: number;
    credit: number;
    memo: string;
  }>;
  totals: {
    debit: number;
    credit: number;
    balanced: boolean;
  };
  tax_summary: {
    input_vat: number;
    output_vat: number;
    withholding_tax: number;
  };
  confidence: number;
  needs_human_approval: boolean;
  approval_reason: string;
};

/**
 * Fetches relevant client configurations, active Chart of Accounts, and contacts
 * to construct a Client Context JSON payload.
 */
export async function getClientContext(firmOrgId: string, clientOrgId: string) {
  const admin = createSupabaseAdminClient();

  // 1. Fetch organization details
  const { data: org, error: orgError } = await admin
    .from('organizations')
    .select('id, name')
    .eq('id', clientOrgId)
    .single();
    
  if (orgError) throw new Error(`Failed to load client organization: ${orgError.message}`);

  // 2. Fetch active Chart of Accounts (accounts table)
  const { data: accounts, error: accountsError } = await admin
    .from('accounts')
    .select('id, code, name, type')
    .eq('organization_id', clientOrgId)
    .eq('is_active', true);

  if (accountsError) throw new Error(`Failed to load client accounts: ${accountsError.message}`);

  // 3. Fetch configs from acc_firm_client_configs
  const { data: config, error: configError } = await admin
    .from('acc_firm_client_configs')
    .select('*')
    .eq('firm_org_id', firmOrgId)
    .eq('client_org_id', clientOrgId)
    .maybeSingle();

  if (configError) throw new Error(`Failed to load client configuration: ${configError.message}`);

  const vatRegistered = config ? config.vat_registered : true;
  const withholdingTaxRequired = config ? config.withholding_tax_required : true;
  const accountingMethod = config ? config.accounting_method : 'accrual';
  const customPostingRules = config ? config.custom_posting_rules : [];

  // 4. Fetch contacts for context matching
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
    vat_registered: vatRegistered,
    withholding_tax_required: withholdingTaxRequired,
    accounting_method: accountingMethod,
    chart_of_accounts: accounts || [],
    posting_rules: customPostingRules || [],
    contacts: contacts || []
  };
}

/**
 * Calls Gemini 2.5 Flash to classify the transaction based on OCR extraction and Client Context.
 */
export async function classifyTransaction(
  ocrData: OcrExtractionResult,
  clientContext: any
): Promise<ClassificationResult> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error('GEMINI_API_KEY is not configured.');

  const inputContext = `
OCR EXTRACTED DOCUMENT:
${JSON.stringify(ocrData, null, 2)}

CLIENT CONTEXT:
${JSON.stringify(clientContext, null, 2)}
`;

  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [
          {
            parts: [
              { text: PROMPT_CLASSIFY },
              { text: inputContext }
            ]
          }
        ],
        generationConfig: {
          maxOutputTokens: 2000,
          temperature: 0.1,
          responseMimeType: 'application/json'
        }
      })
    }
  );

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Gemini Classification failed: ${response.status} - ${errorText}`);
  }

  const result = await response.json();
  if (!result.candidates || result.candidates.length === 0) {
    throw new Error('Gemini API returned no candidates for classification.');
  }
  const text = result.candidates[0].content?.parts?.[0]?.text || '';
  const cleaned = text.replace(/^```[a-z]*\n?/i, '').replace(/\n?```$/i, '').trim();

  try {
    return JSON.parse(cleaned) as ClassificationResult;
  } catch (err) {
    throw new Error(`Failed to parse Gemini classification JSON: ${text}`);
  }
}

/**
 * Calls Gemini 2.5 Flash to generate a balanced double-entry journal voucher.
 */
export async function generateJournalEntry(
  ocrData: OcrExtractionResult,
  classification: ClassificationResult,
  clientContext: any
): Promise<JournalEntryResult> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error('GEMINI_API_KEY is not configured.');

  const inputContext = `
OCR EXTRACTED DOCUMENT:
${JSON.stringify(ocrData, null, 2)}

ACCOUNTING CLASSIFICATION:
${JSON.stringify(classification, null, 2)}

CLIENT CONTEXT:
${JSON.stringify(clientContext, null, 2)}
`;

  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [
          {
            parts: [
              { text: PROMPT_JOURNAL },
              { text: inputContext }
            ]
          }
        ],
        generationConfig: {
          maxOutputTokens: 2000,
          temperature: 0.1,
          responseMimeType: 'application/json'
        }
      })
    }
  );

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Gemini Journal Generation failed: ${response.status} - ${errorText}`);
  }

  const result = await response.json();
  if (!result.candidates || result.candidates.length === 0) {
    throw new Error('Gemini API returned no candidates for journal entry generation.');
  }
  const text = result.candidates[0].content?.parts?.[0]?.text || '';
  const cleaned = text.replace(/^```[a-z]*\n?/i, '').replace(/\n?```$/i, '').trim();

  try {
    return JSON.parse(cleaned) as JournalEntryResult;
  } catch (err) {
    throw new Error(`Failed to parse Gemini journal entry JSON: ${text}`);
  }
}

