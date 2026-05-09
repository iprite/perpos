export type SaleDocType =
  | "quotation"
  | "deposit_receipt"
  | "receipt"
  | "tax_invoice"
  | "etax_invoice"
  | "credit_note"
  | "debit_note"
  | "billing_note";

export type QuotationStatus = "draft" | "issued" | "accepted" | "rejected" | "expired" | "voided";
export type SaleDocStatus   = "draft" | "issued" | "voided";

export type AnyDocStatus = QuotationStatus | SaleDocStatus;

export type DocTypeConfig = {
  docType:     SaleDocType;
  nameTh:      string;
  nameEn:      string;
  prefix:      string;
  path:        string;
  canHaveDueDate: boolean;
  canRefInvoice:  boolean;
  statuses:    AnyDocStatus[];
};

export const DOC_TYPE_CONFIGS: Record<SaleDocType, DocTypeConfig> = {
  quotation: {
    docType:        "quotation",
    nameTh:         "ใบเสนอราคา",
    nameEn:         "Quotation",
    prefix:         "QT",
    path:           "/sales/quotations",
    canHaveDueDate: true,
    canRefInvoice:  false,
    statuses:       ["draft","issued","accepted","rejected","expired","voided"],
  },
  deposit_receipt: {
    docType:        "deposit_receipt",
    nameTh:         "ใบรับมัดจำ",
    nameEn:         "Deposit Receipt",
    prefix:         "DEP",
    path:           "/sales/deposits",
    canHaveDueDate: false,
    canRefInvoice:  false,
    statuses:       ["draft","issued","voided"],
  },
  receipt: {
    docType:        "receipt",
    nameTh:         "ใบเสร็จรับเงิน",
    nameEn:         "Receipt",
    prefix:         "RCT",
    path:           "/sales/receipts",
    canHaveDueDate: false,
    canRefInvoice:  true,
    statuses:       ["draft","issued","voided"],
  },
  tax_invoice: {
    docType:        "tax_invoice",
    nameTh:         "ใบกำกับภาษีขาย",
    nameEn:         "Tax Invoice",
    prefix:         "TINV",
    path:           "/sales/tax-invoices",
    canHaveDueDate: true,
    canRefInvoice:  true,
    statuses:       ["draft","issued","voided"],
  },
  etax_invoice: {
    docType:        "etax_invoice",
    nameTh:         "e-Tax Invoice",
    nameEn:         "e-Tax Invoice",
    prefix:         "ETAX",
    path:           "/sales/etax-invoices",
    canHaveDueDate: true,
    canRefInvoice:  true,
    statuses:       ["draft","issued","voided"],
  },
  credit_note: {
    docType:        "credit_note",
    nameTh:         "ใบลดหนี้",
    nameEn:         "Credit Note",
    prefix:         "CN",
    path:           "/sales/credit-notes",
    canHaveDueDate: false,
    canRefInvoice:  true,
    statuses:       ["draft","issued","voided"],
  },
  debit_note: {
    docType:        "debit_note",
    nameTh:         "ใบเพิ่มหนี้",
    nameEn:         "Debit Note",
    prefix:         "DN",
    path:           "/sales/debit-notes",
    canHaveDueDate: false,
    canRefInvoice:  true,
    statuses:       ["draft","issued","voided"],
  },
  billing_note: {
    docType:        "billing_note",
    nameTh:         "ใบวางบิล",
    nameEn:         "Billing Note",
    prefix:         "BN",
    path:           "/sales/billing-notes",
    canHaveDueDate: true,
    canRefInvoice:  true,
    statuses:       ["draft","issued","voided"],
  },
};

export const ALL_DOC_TYPES: SaleDocType[] = [
  "quotation","deposit_receipt","receipt",
  "tax_invoice","etax_invoice",
  "credit_note","debit_note","billing_note",
];

export function getDocConfig(docType: SaleDocType): DocTypeConfig {
  return DOC_TYPE_CONFIGS[docType];
}

export const STATUS_LABEL: Record<AnyDocStatus, string> = {
  draft:    "แบบร่าง",
  issued:   "ออกแล้ว",
  voided:   "ยกเลิก",
  accepted: "ยอมรับ",
  rejected: "ปฏิเสธ",
  expired:  "หมดอายุ",
};
