// index.ts — barrel re-export ทุก fixture ของ accounting prototype
// ui-designer import จากที่นี่ที่เดียว

// ---- Constants ----
export const MOCK_ORG_ID = "00000000-0000-0000-0000-000000000001";
export const TODAY_ISO = "2026-06-26";

// ---- Types (ทุก interface + enum) ----
export * from "./types";

// ---- org-settings ----
export { mockOrgSettings } from "./org-settings";

// ---- accounts (ผังบัญชี ~37 บัญชี) ----
export { mockAccounts, accountById, accountByCode } from "./accounts";

// ---- contacts (~8 ลูกค้า/ผู้ขาย) ----
export { mockContacts, contactNameById } from "./contacts";

// ---- entries (รายรับ/รายจ่าย ~30 แถว) ----
export { mockEntries, summarizeEntries, currentMonthSummary, allTimeSummary } from "./entries";

// ---- documents + lines ----
export {
  mockDocumentLines,
  mockDocuments,
  mockDocumentsWithLines,
  overdueDocuments,
  readyToSendLineDocuments,
} from "./documents";

// ---- journal entries + lines ----
export { mockJournalLines, mockJournalEntries, mockJournalEntriesWithLines } from "./journal";

// ---- periods ----
export { mockPeriods, currentPeriod } from "./periods";

// ---- tax-filings + helpers ----
export { mockTaxFilings, pendingTaxFilings, TAX_GLOSSARY, dueDateLabel } from "./tax-filings";

// ---- assets + computed ----
export { mockAssets, totalMonthlyDepreciation, totalBookValue } from "./assets";

// ---- payroll bridge mock ----
export { mockPayrollBridgeRun, mockPayrollBridgeResult } from "./payroll-bridge";

// ---- AI mocks (AI-1..5) ----
export {
  categorizeMocks,
  getCategorizeMock,
  journalSuggestMocks,
  taxSummaryMocks,
  anomalyMocks,
  askMocks,
  getAskMock,
} from "./ai-mocks";

// ---- Products / Master Catalog (~10 รายการ good+service) ----
export { mockProducts, productById } from "./products";

// ---- LINE Flex card mocks (L1..5 + L2b PP30) ----
export {
  lineFlexL1,
  lineFlexL2,
  lineFlexL2pp30,
  lineFlexL3,
  lineFlexL4,
  lineFlexL5,
  lineFlexPreviews,
} from "./line-mocks";
