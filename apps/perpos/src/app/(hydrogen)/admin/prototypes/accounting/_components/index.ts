// _components/index.ts — barrel shared foundation ของ prototype accounting
// หน้าต่าง ๆ import จากที่นี่:
//   import { AccountingShell, useAccountingRole, useAccountingData, fmtMoney } from "../_components";

export * from "./format";
export * from "./money";
export * from "./badges";
export * from "./backstage-badges";
export * from "./role-context";
export * from "./data-context";
export { RoleSwitcher } from "./role-switcher";
export { AccountingShell } from "./nav";
export { NoAccess } from "./no-access";
export { AiSuggestBox } from "./ai-suggest-box";
export { EntryDialog } from "./entry-dialog";
export { JournalDialog } from "./journal-dialog";
export { AccountDialog } from "./account-dialog";
export { TaxFilingDialog } from "./tax-filing-dialog";
export { AssetDialog } from "./asset-dialog";
