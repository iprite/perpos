export type PurchaseDocType =
  | "purchase_order"
  | "deposit_payment"
  | "goods_receipt"
  | "expense_record"
  | "wht_expense"
  | "purchase_tax_invoice"
  | "payment_summary"
  | "received_credit_note"
  | "received_debit_note";

export type PurchaseOrderStatus = "draft" | "issued" | "approved" | "received" | "cancelled" | "voided";
export type PurchaseDocStatus   = "draft" | "issued" | "voided";

export type AnyPurchaseDocStatus = PurchaseOrderStatus | PurchaseDocStatus;

export type PurchaseDocTypeConfig = {
  docType:        PurchaseDocType;
  nameTh:         string;
  nameEn:         string;
  prefix:         string;
  path:           string;
  canHaveDueDate: boolean;
  canRefDoc:      boolean;
  hasWht:         boolean;
  statuses:       AnyPurchaseDocStatus[];
};

export const PURCHASE_DOC_TYPE_CONFIGS: Record<PurchaseDocType, PurchaseDocTypeConfig> = {
  purchase_order: {
    docType:        "purchase_order",
    nameTh:         "ใบสั่งซื้อ",
    nameEn:         "Purchase Order",
    prefix:         "PO",
    path:           "/purchase/orders",
    canHaveDueDate: true,
    canRefDoc:      false,
    hasWht:         false,
    statuses:       ["draft","issued","approved","received","cancelled","voided"],
  },
  deposit_payment: {
    docType:        "deposit_payment",
    nameTh:         "ใบจ่ายมัดจำ",
    nameEn:         "Deposit Payment",
    prefix:         "DEPAY",
    path:           "/purchase/deposits",
    canHaveDueDate: false,
    canRefDoc:      true,
    hasWht:         false,
    statuses:       ["draft","issued","voided"],
  },
  goods_receipt: {
    docType:        "goods_receipt",
    nameTh:         "บันทึกซื้อสินค้า",
    nameEn:         "Goods Receipt",
    prefix:         "GR",
    path:           "/purchase/goods-receipts",
    canHaveDueDate: false,
    canRefDoc:      true,
    hasWht:         false,
    statuses:       ["draft","issued","voided"],
  },
  expense_record: {
    docType:        "expense_record",
    nameTh:         "บันทึกค่าใช้จ่าย และการจ่ายเงิน",
    nameEn:         "Expense & Payment Record",
    prefix:         "EXP",
    path:           "/purchase/expenses",
    canHaveDueDate: false,
    canRefDoc:      false,
    hasWht:         false,
    statuses:       ["draft","issued","voided"],
  },
  wht_expense: {
    docType:        "wht_expense",
    nameTh:         "บันทึกรายจ่ายที่มีภาษีหัก ณ ที่จ่าย",
    nameEn:         "WHT Expense Record",
    prefix:         "WHTEXP",
    path:           "/purchase/wht-expenses",
    canHaveDueDate: false,
    canRefDoc:      false,
    hasWht:         true,
    statuses:       ["draft","issued","voided"],
  },
  purchase_tax_invoice: {
    docType:        "purchase_tax_invoice",
    nameTh:         "ใบกำกับภาษีซื้อ",
    nameEn:         "Purchase Tax Invoice",
    prefix:         "PTINV",
    path:           "/purchase/tax-invoices",
    canHaveDueDate: true,
    canRefDoc:      true,
    hasWht:         false,
    statuses:       ["draft","issued","voided"],
  },
  payment_summary: {
    docType:        "payment_summary",
    nameTh:         "ใบรวมจ่าย",
    nameEn:         "Payment Summary",
    prefix:         "PAYSUM",
    path:           "/purchase/payment-summaries",
    canHaveDueDate: false,
    canRefDoc:      false,
    hasWht:         true,
    statuses:       ["draft","issued","voided"],
  },
  received_credit_note: {
    docType:        "received_credit_note",
    nameTh:         "รับใบลดหนี้",
    nameEn:         "Received Credit Note",
    prefix:         "RCN",
    path:           "/purchase/received-credit-notes",
    canHaveDueDate: false,
    canRefDoc:      true,
    hasWht:         false,
    statuses:       ["draft","issued","voided"],
  },
  received_debit_note: {
    docType:        "received_debit_note",
    nameTh:         "รับใบเพิ่มหนี้",
    nameEn:         "Received Debit Note",
    prefix:         "RDN",
    path:           "/purchase/received-debit-notes",
    canHaveDueDate: false,
    canRefDoc:      true,
    hasWht:         false,
    statuses:       ["draft","issued","voided"],
  },
};

export const ALL_PURCHASE_DOC_TYPES: PurchaseDocType[] = [
  "purchase_order","deposit_payment","goods_receipt",
  "expense_record","wht_expense","purchase_tax_invoice",
  "payment_summary","received_credit_note","received_debit_note",
];

export function getPurchaseDocConfig(docType: PurchaseDocType): PurchaseDocTypeConfig {
  return PURCHASE_DOC_TYPE_CONFIGS[docType];
}

export const PURCHASE_STATUS_LABEL: Record<AnyPurchaseDocStatus, string> = {
  draft:     "แบบร่าง",
  issued:    "ออกแล้ว",
  voided:    "ยกเลิก",
  approved:  "อนุมัติแล้ว",
  received:  "รับสินค้าแล้ว",
  cancelled: "ยกเลิก PO",
};
