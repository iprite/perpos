// _components/index.ts — barrel shared foundation ของ module accounting (production)
// หน้าต่าง ๆ import จากที่นี่:
//   import { AccountingShell, useAccountingRole, useAccountingData, fmtMoney } from "../_components";

export * from "./format";
export * from "./money";
export * from "./badges";
export * from "./backstage-badges";
export * from "./role-context";
export * from "./data-provider";
export { AccountingShell } from "./nav";
export { NoAccess } from "./no-access";
export { EntryDialog } from "./entry-dialog";
export { ContactDialog } from "./contact-dialog";
export { ProductDialog } from "./product-dialog";
export { DocumentDialog, DocumentCreateDialog } from "./document-dialog";
export { DocumentPreview } from "./document-preview";
export { PurchaseDocumentCreateDialog } from "./purchase-document-dialog";
export { JournalDialog } from "./journal-dialog";
export { AccountDialog } from "./account-dialog";
export { TaxFilingDialog } from "./tax-filing-dialog";
export { AssetDialog } from "./asset-dialog";
