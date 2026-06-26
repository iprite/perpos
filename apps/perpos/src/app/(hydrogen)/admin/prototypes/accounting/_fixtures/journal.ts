// journal.ts — acc_journal_entries + acc_journal_lines
// ทุก entry ที่ status=posted ต้อง Σdebit = Σcredit (ตรวจเองด้านล่าง)
// รวม payroll auto-post (8 บรรทัด) + ค่าเสื่อม + manual entries

import type { AccJournalEntry, AccJournalLine } from "./types";
import { MOCK_ORG_ID } from "./org-settings";

const ORG = MOCK_ORG_ID;

// ============================================================
// JOURNAL LINES
// ============================================================

export const mockJournalLines: AccJournalLine[] = [
  // ----------------------------------------------------------
  // jv-001: รับชำระค่าออกแบบโลโก้ 45,000 (posted)
  // Dr ลูกหนี้การค้า 45,000 | Cr รายได้จากการขาย/บริการ 45,000
  // Balance: Dr=45,000 Cr=45,000 ✓
  // ----------------------------------------------------------
  {
    id: "jl-001-1",
    org_id: ORG,
    journal_entry_id: "jv-001",
    account_id: "acc-1100",
    debit: 45000.0,
    credit: 0,
    line_note: "ลูกหนี้ INV-2026-0001",
    sort_order: 1,
    account_code: "1100",
    account_name: "ลูกหนี้การค้า",
  },
  {
    id: "jl-001-2",
    org_id: ORG,
    journal_entry_id: "jv-001",
    account_id: "acc-4100",
    debit: 0,
    credit: 45000.0,
    line_note: "รายได้ออกแบบโลโก้",
    sort_order: 2,
    account_code: "4100",
    account_name: "รายได้จากการขาย/บริการ",
  },

  // ----------------------------------------------------------
  // jv-002: รับชำระค่าออกแบบเว็บ 28,500 (posted)
  // Dr เงินฝากธนาคาร 28,500 | Cr รายได้ 28,500
  // Balance: Dr=28,500 Cr=28,500 ✓
  // ----------------------------------------------------------
  {
    id: "jl-002-1",
    org_id: ORG,
    journal_entry_id: "jv-002",
    account_id: "acc-1020",
    debit: 28500.0,
    credit: 0,
    line_note: "รับโอน INV-2026-0002",
    sort_order: 1,
    account_code: "1020",
    account_name: "เงินฝากธนาคาร",
  },
  {
    id: "jl-002-2",
    org_id: ORG,
    journal_entry_id: "jv-002",
    account_id: "acc-4100",
    debit: 0,
    credit: 28500.0,
    line_note: "รายได้ออกแบบเว็บ",
    sort_order: 2,
    account_code: "4100",
    account_name: "รายได้จากการขาย/บริการ",
  },

  // ----------------------------------------------------------
  // jv-003: รับชำระถ่ายภาพ 15,000 (posted)
  // Dr เงินสด 15,000 | Cr รายได้ 15,000
  // Balance: Dr=15,000 Cr=15,000 ✓
  // ----------------------------------------------------------
  {
    id: "jl-003-1",
    org_id: ORG,
    journal_entry_id: "jv-003",
    account_id: "acc-1010",
    debit: 15000.0,
    credit: 0,
    line_note: "รับเงินสด RC-2026-0001",
    sort_order: 1,
    account_code: "1010",
    account_name: "เงินสด",
  },
  {
    id: "jl-003-2",
    org_id: ORG,
    journal_entry_id: "jv-003",
    account_id: "acc-4100",
    debit: 0,
    credit: 15000.0,
    line_note: "รายได้ถ่ายภาพ",
    sort_order: 2,
    account_code: "4100",
    account_name: "รายได้จากการขาย/บริการ",
  },

  // ----------------------------------------------------------
  // jv-004: รายได้ POS 75,000 (posted)
  // Dr ลูกหนี้การค้า 75,000 | Cr รายได้ 75,000
  // Balance: Dr=75,000 Cr=75,000 ✓
  // ----------------------------------------------------------
  {
    id: "jl-004-1",
    org_id: ORG,
    journal_entry_id: "jv-004",
    account_id: "acc-1100",
    debit: 75000.0,
    credit: 0,
    line_note: "ลูกหนี้ INV-2026-0003",
    sort_order: 1,
    account_code: "1100",
    account_name: "ลูกหนี้การค้า",
  },
  {
    id: "jl-004-2",
    org_id: ORG,
    journal_entry_id: "jv-004",
    account_id: "acc-4100",
    debit: 0,
    credit: 75000.0,
    line_note: "รายได้พัฒนาระบบ POS",
    sort_order: 2,
    account_code: "4100",
    account_name: "รายได้จากการขาย/บริการ",
  },

  // ----------------------------------------------------------
  // jv-005: รายได้ packaging 22,000 (posted)
  // Dr ลูกหนี้การค้า 22,000 | Cr รายได้ 22,000
  // Balance: Dr=22,000 Cr=22,000 ✓
  // ----------------------------------------------------------
  {
    id: "jl-005-1",
    org_id: ORG,
    journal_entry_id: "jv-005",
    account_id: "acc-1100",
    debit: 22000.0,
    credit: 0,
    line_note: "ลูกหนี้ INV-2026-0004",
    sort_order: 1,
    account_code: "1100",
    account_name: "ลูกหนี้การค้า",
  },
  {
    id: "jl-005-2",
    org_id: ORG,
    journal_entry_id: "jv-005",
    account_id: "acc-4100",
    debit: 0,
    credit: 22000.0,
    line_note: "รายได้ออกแบบ packaging",
    sort_order: 2,
    account_code: "4100",
    account_name: "รายได้จากการขาย/บริการ",
  },

  // ----------------------------------------------------------
  // jv-006: draft journal (ค่าเช่าสำนักงาน มิถุนายน) — ยังไม่ post
  // Dr ค่าเช่า 18,000 | Cr เงินสด 18,000
  // ----------------------------------------------------------
  {
    id: "jl-006-1",
    org_id: ORG,
    journal_entry_id: "jv-006",
    account_id: "acc-5200",
    debit: 18000.0,
    credit: 0,
    line_note: "ค่าเช่าสำนักงาน มิถุนายน 2569",
    sort_order: 1,
    account_code: "5200",
    account_name: "ค่าเช่า",
  },
  {
    id: "jl-006-2",
    org_id: ORG,
    journal_entry_id: "jv-006",
    account_id: "acc-1010",
    debit: 0,
    credit: 18000.0,
    line_note: "จ่ายเงินสด",
    sort_order: 2,
    account_code: "1010",
    account_name: "เงินสด",
  },

  // ----------------------------------------------------------
  // jv-payroll-apr: Payroll เมษายน auto-post (8 บรรทัด)
  // สมการ I1 binding:
  //   total_earnings = net_total + wht_total + sso_employee_total + pvd_employee_total + extra_deductions_total
  //   58,500 = 49,850 + 3,150 + 2,700 + 2,700 + 100
  //   58,500 = 58,500 ✓
  //
  // Dr 5100 เงินเดือนและค่าจ้าง     = 58,500 (gross รวม OT, I1)
  // Dr 5110 ค่าใช้จ่าย SSO นายจ้าง  = 2,700
  // Dr 5120 ค่าใช้จ่าย PVD นายจ้าง  = 2,700
  //     Cr 1020 เงินฝากธนาคาร        = 49,850 (net)
  //     Cr 2210 WHT ค้างจ่าย PND1    = 3,150
  //     Cr 2220 SSO ค้างจ่าย          = 2,700+2,700 = 5,400
  //     Cr 2230 PVD ค้างจ่าย          = 2,700+2,700 = 5,400
  //     Cr 2240 เงินหักอื่นค้างจ่าย   = 100
  //
  // Σ Dr = 58,500 + 2,700 + 2,700 = 63,900
  // Σ Cr = 49,850 + 3,150 + 5,400 + 5,400 + 100 = 63,900 ✓
  // ----------------------------------------------------------
  {
    id: "jl-payroll-apr-1",
    org_id: ORG,
    journal_entry_id: "jv-payroll-apr",
    account_id: "acc-5100",
    debit: 58500.0,
    credit: 0,
    line_note: "เงินเดือนและค่าจ้าง (gross) เม.ย.",
    sort_order: 1,
    account_code: "5100",
    account_name: "เงินเดือนและค่าจ้าง (gross รวม OT/เบี้ย — I1)",
  },
  {
    id: "jl-payroll-apr-2",
    org_id: ORG,
    journal_entry_id: "jv-payroll-apr",
    account_id: "acc-5110",
    debit: 2700.0,
    credit: 0,
    line_note: "SSO นายจ้าง เม.ย.",
    sort_order: 2,
    account_code: "5110",
    account_name: "ค่าใช้จ่าย SSO นายจ้าง",
  },
  {
    id: "jl-payroll-apr-3",
    org_id: ORG,
    journal_entry_id: "jv-payroll-apr",
    account_id: "acc-5120",
    debit: 2700.0,
    credit: 0,
    line_note: "PVD นายจ้าง เม.ย.",
    sort_order: 3,
    account_code: "5120",
    account_name: "ค่าใช้จ่าย PVD นายจ้าง",
  },
  {
    id: "jl-payroll-apr-4",
    org_id: ORG,
    journal_entry_id: "jv-payroll-apr",
    account_id: "acc-1020",
    debit: 0,
    credit: 49850.0,
    line_note: "จ่ายสุทธิผ่านธนาคาร เม.ย.",
    sort_order: 4,
    account_code: "1020",
    account_name: "เงินฝากธนาคาร",
  },
  {
    id: "jl-payroll-apr-5",
    org_id: ORG,
    journal_entry_id: "jv-payroll-apr",
    account_id: "acc-2210",
    debit: 0,
    credit: 3150.0,
    line_note: "WHT PND1 ค้างจ่าย เม.ย.",
    sort_order: 5,
    account_code: "2210",
    account_name: "ภาษีหัก ณ ที่จ่ายค้างจ่าย (PND1)",
  },
  {
    id: "jl-payroll-apr-6",
    org_id: ORG,
    journal_entry_id: "jv-payroll-apr",
    account_id: "acc-2220",
    debit: 0,
    credit: 5400.0,
    line_note: "SSO ค้างจ่าย (ลูกจ้าง+นายจ้าง) เม.ย.",
    sort_order: 6,
    account_code: "2220",
    account_name: "ประกันสังคมค้างจ่าย (SSO)",
  },
  {
    id: "jl-payroll-apr-7",
    org_id: ORG,
    journal_entry_id: "jv-payroll-apr",
    account_id: "acc-2230",
    debit: 0,
    credit: 5400.0,
    line_note: "PVD ค้างจ่าย (ลูกจ้าง+นายจ้าง) เม.ย.",
    sort_order: 7,
    account_code: "2230",
    account_name: "กองทุนสำรองเลี้ยงชีพค้างจ่าย (PVD)",
  },
  {
    id: "jl-payroll-apr-8",
    org_id: ORG,
    journal_entry_id: "jv-payroll-apr",
    account_id: "acc-2240",
    debit: 0,
    credit: 100.0,
    line_note: "เงินหักอื่น เม.ย.",
    sort_order: 8,
    account_code: "2240",
    account_name: "เงินหักอื่นค้างจ่าย",
  },

  // ----------------------------------------------------------
  // jv-payroll-may: Payroll พฤษภาคม (8 บรรทัด, same pattern)
  // Σ Dr = 63,900 | Σ Cr = 63,900 ✓
  // ----------------------------------------------------------
  {
    id: "jl-payroll-may-1",
    org_id: ORG,
    journal_entry_id: "jv-payroll-may",
    account_id: "acc-5100",
    debit: 58500.0,
    credit: 0,
    line_note: "เงินเดือนและค่าจ้าง (gross) พ.ค.",
    sort_order: 1,
    account_code: "5100",
    account_name: "เงินเดือนและค่าจ้าง (gross รวม OT/เบี้ย — I1)",
  },
  {
    id: "jl-payroll-may-2",
    org_id: ORG,
    journal_entry_id: "jv-payroll-may",
    account_id: "acc-5110",
    debit: 2700.0,
    credit: 0,
    line_note: "SSO นายจ้าง พ.ค.",
    sort_order: 2,
    account_code: "5110",
    account_name: "ค่าใช้จ่าย SSO นายจ้าง",
  },
  {
    id: "jl-payroll-may-3",
    org_id: ORG,
    journal_entry_id: "jv-payroll-may",
    account_id: "acc-5120",
    debit: 2700.0,
    credit: 0,
    line_note: "PVD นายจ้าง พ.ค.",
    sort_order: 3,
    account_code: "5120",
    account_name: "ค่าใช้จ่าย PVD นายจ้าง",
  },
  {
    id: "jl-payroll-may-4",
    org_id: ORG,
    journal_entry_id: "jv-payroll-may",
    account_id: "acc-1020",
    debit: 0,
    credit: 49850.0,
    line_note: "จ่ายสุทธิผ่านธนาคาร พ.ค.",
    sort_order: 4,
    account_code: "1020",
    account_name: "เงินฝากธนาคาร",
  },
  {
    id: "jl-payroll-may-5",
    org_id: ORG,
    journal_entry_id: "jv-payroll-may",
    account_id: "acc-2210",
    debit: 0,
    credit: 3150.0,
    line_note: "WHT PND1 ค้างจ่าย พ.ค.",
    sort_order: 5,
    account_code: "2210",
    account_name: "ภาษีหัก ณ ที่จ่ายค้างจ่าย (PND1)",
  },
  {
    id: "jl-payroll-may-6",
    org_id: ORG,
    journal_entry_id: "jv-payroll-may",
    account_id: "acc-2220",
    debit: 0,
    credit: 5400.0,
    line_note: "SSO ค้างจ่าย (ลูกจ้าง+นายจ้าง) พ.ค.",
    sort_order: 6,
    account_code: "2220",
    account_name: "ประกันสังคมค้างจ่าย (SSO)",
  },
  {
    id: "jl-payroll-may-7",
    org_id: ORG,
    journal_entry_id: "jv-payroll-may",
    account_id: "acc-2230",
    debit: 0,
    credit: 5400.0,
    line_note: "PVD ค้างจ่าย (ลูกจ้าง+นายจ้าง) พ.ค.",
    sort_order: 7,
    account_code: "2230",
    account_name: "กองทุนสำรองเลี้ยงชีพค้างจ่าย (PVD)",
  },
  {
    id: "jl-payroll-may-8",
    org_id: ORG,
    journal_entry_id: "jv-payroll-may",
    account_id: "acc-2240",
    debit: 0,
    credit: 100.0,
    line_note: "เงินหักอื่น พ.ค.",
    sort_order: 8,
    account_code: "2240",
    account_name: "เงินหักอื่นค้างจ่าย",
  },

  // ----------------------------------------------------------
  // jv-payroll-jun: Payroll มิถุนายน (8 บรรทัด)
  // Σ Dr = 63,900 | Σ Cr = 63,900 ✓
  // ----------------------------------------------------------
  {
    id: "jl-payroll-jun-1",
    org_id: ORG,
    journal_entry_id: "jv-payroll-jun",
    account_id: "acc-5100",
    debit: 58500.0,
    credit: 0,
    line_note: "เงินเดือนและค่าจ้าง (gross) มิ.ย.",
    sort_order: 1,
    account_code: "5100",
    account_name: "เงินเดือนและค่าจ้าง (gross รวม OT/เบี้ย — I1)",
  },
  {
    id: "jl-payroll-jun-2",
    org_id: ORG,
    journal_entry_id: "jv-payroll-jun",
    account_id: "acc-5110",
    debit: 2700.0,
    credit: 0,
    line_note: "SSO นายจ้าง มิ.ย.",
    sort_order: 2,
    account_code: "5110",
    account_name: "ค่าใช้จ่าย SSO นายจ้าง",
  },
  {
    id: "jl-payroll-jun-3",
    org_id: ORG,
    journal_entry_id: "jv-payroll-jun",
    account_id: "acc-5120",
    debit: 2700.0,
    credit: 0,
    line_note: "PVD นายจ้าง มิ.ย.",
    sort_order: 3,
    account_code: "5120",
    account_name: "ค่าใช้จ่าย PVD นายจ้าง",
  },
  {
    id: "jl-payroll-jun-4",
    org_id: ORG,
    journal_entry_id: "jv-payroll-jun",
    account_id: "acc-1020",
    debit: 0,
    credit: 49850.0,
    line_note: "จ่ายสุทธิผ่านธนาคาร มิ.ย.",
    sort_order: 4,
    account_code: "1020",
    account_name: "เงินฝากธนาคาร",
  },
  {
    id: "jl-payroll-jun-5",
    org_id: ORG,
    journal_entry_id: "jv-payroll-jun",
    account_id: "acc-2210",
    debit: 0,
    credit: 3150.0,
    line_note: "WHT PND1 ค้างจ่าย มิ.ย.",
    sort_order: 5,
    account_code: "2210",
    account_name: "ภาษีหัก ณ ที่จ่ายค้างจ่าย (PND1)",
  },
  {
    id: "jl-payroll-jun-6",
    org_id: ORG,
    journal_entry_id: "jv-payroll-jun",
    account_id: "acc-2220",
    debit: 0,
    credit: 5400.0,
    line_note: "SSO ค้างจ่าย (ลูกจ้าง+นายจ้าง) มิ.ย.",
    sort_order: 6,
    account_code: "2220",
    account_name: "ประกันสังคมค้างจ่าย (SSO)",
  },
  {
    id: "jl-payroll-jun-7",
    org_id: ORG,
    journal_entry_id: "jv-payroll-jun",
    account_id: "acc-2230",
    debit: 0,
    credit: 5400.0,
    line_note: "PVD ค้างจ่าย (ลูกจ้าง+นายจ้าง) มิ.ย.",
    sort_order: 7,
    account_code: "2230",
    account_name: "กองทุนสำรองเลี้ยงชีพค้างจ่าย (PVD)",
  },
  {
    id: "jl-payroll-jun-8",
    org_id: ORG,
    journal_entry_id: "jv-payroll-jun",
    account_id: "acc-2240",
    debit: 0,
    credit: 100.0,
    line_note: "เงินหักอื่น มิ.ย.",
    sort_order: 8,
    account_code: "2240",
    account_name: "เงินหักอื่นค้างจ่าย",
  },

  // ----------------------------------------------------------
  // jv-depr-01: ค่าเสื่อมราคา asset-001 (คอมพิวเตอร์) มิ.ย. 2569
  // ค่าเสื่อม/เดือน = (60,000 - 5,000) / 36 = 1,527.78 ≈ 1,527.78
  // Dr 5800 ค่าเสื่อมราคา 1,527.78 | Cr 1590 ค่าเสื่อมสะสม 1,527.78
  // Balance: Dr=1,527.78 Cr=1,527.78 ✓
  // ----------------------------------------------------------
  {
    id: "jl-depr-01-1",
    org_id: ORG,
    journal_entry_id: "jv-depr-01",
    account_id: "acc-5800",
    debit: 1527.78,
    credit: 0,
    line_note: "ค่าเสื่อมราคาคอมพิวเตอร์ มิ.ย. 2569",
    sort_order: 1,
    account_code: "5800",
    account_name: "ค่าเสื่อมราคา",
  },
  {
    id: "jl-depr-01-2",
    org_id: ORG,
    journal_entry_id: "jv-depr-01",
    account_id: "acc-1590",
    debit: 0,
    credit: 1527.78,
    line_note: "ค่าเสื่อมสะสมคอมพิวเตอร์ มิ.ย. 2569",
    sort_order: 2,
    account_code: "1590",
    account_name: "ค่าเสื่อมราคาสะสม (contra asset)",
  },
];

// ============================================================
// JOURNAL ENTRIES (HEADERS)
// ============================================================

export const mockJournalEntries: AccJournalEntry[] = [
  {
    id: "jv-001",
    org_id: ORG,
    entry_number: "JV-2026-0001",
    entry_date: "2026-04-02",
    description: "รับชำระค่าออกแบบโลโก้ INV-2026-0001",
    status: "posted",
    period_id: "period-apr-2026",
    source: "document",
    source_ref_id: "doc-inv01",
    period_year: null,
    period_month: null,
    total_debit: 45000.0,
    total_credit: 45000.0, // balanced ✓
    created_by: null,
    created_at: "2026-04-02T09:30:00.000Z",
  },
  {
    id: "jv-002",
    org_id: ORG,
    entry_number: "JV-2026-0002",
    entry_date: "2026-04-08",
    description: "รับชำระค่าออกแบบเว็บ INV-2026-0002",
    status: "posted",
    period_id: "period-apr-2026",
    source: "document",
    source_ref_id: "doc-inv02",
    period_year: null,
    period_month: null,
    total_debit: 28500.0,
    total_credit: 28500.0, // balanced ✓
    created_by: null,
    created_at: "2026-04-08T10:30:00.000Z",
  },
  {
    id: "jv-003",
    org_id: ORG,
    entry_number: "JV-2026-0003",
    entry_date: "2026-04-20",
    description: "รับเงินสดค่าถ่ายภาพสินค้า RC-2026-0001",
    status: "posted",
    period_id: "period-apr-2026",
    source: "document",
    source_ref_id: "doc-rc01",
    period_year: null,
    period_month: null,
    total_debit: 15000.0,
    total_credit: 15000.0, // balanced ✓
    created_by: null,
    created_at: "2026-04-20T14:00:00.000Z",
  },
  {
    id: "jv-004",
    org_id: ORG,
    entry_number: "JV-2026-0004",
    entry_date: "2026-05-02",
    description: "ค่าพัฒนาระบบ POS INV-2026-0003",
    status: "posted",
    period_id: "period-may-2026",
    source: "document",
    source_ref_id: "doc-inv03",
    period_year: null,
    period_month: null,
    total_debit: 75000.0,
    total_credit: 75000.0, // balanced ✓
    created_by: null,
    created_at: "2026-05-02T11:00:00.000Z",
  },
  {
    id: "jv-005",
    org_id: ORG,
    entry_number: "JV-2026-0005",
    entry_date: "2026-05-10",
    description: "รายได้ออกแบบ packaging INV-2026-0004",
    status: "posted",
    period_id: "period-may-2026",
    source: "document",
    source_ref_id: "doc-inv04",
    period_year: null,
    period_month: null,
    total_debit: 22000.0,
    total_credit: 22000.0, // balanced ✓
    created_by: null,
    created_at: "2026-05-10T11:30:00.000Z",
  },
  {
    id: "jv-006",
    org_id: ORG,
    entry_number: "JV-2026-0006",
    entry_date: "2026-06-03",
    description: "ค่าเช่าสำนักงาน มิถุนายน 2569 (รอ post)",
    status: "draft",
    period_id: "period-jun-2026",
    source: "manual",
    source_ref_id: null,
    period_year: null,
    period_month: null,
    total_debit: 18000.0,
    total_credit: 18000.0, // balanced ✓ (draft แต่ยอดถูก)
    created_by: null,
    created_at: "2026-06-03T10:00:00.000Z",
  },
  // Payroll auto-post เมษายน
  {
    id: "jv-payroll-apr",
    org_id: ORG,
    entry_number: "JV-2026-0007",
    entry_date: "2026-04-30",
    description: "เงินเดือนพนักงาน เมษายน 2569 (auto-post จาก HRM)",
    status: "posted",
    period_id: "period-apr-2026",
    source: "payroll",
    source_ref_id: "payroll-run-apr-2026",
    period_year: 2026,
    period_month: 4,
    total_debit: 63900.0, // 58,500+2,700+2,700
    total_credit: 63900.0, // 49,850+3,150+5,400+5,400+100 ✓
    created_by: null,
    created_at: "2026-04-30T18:00:00.000Z",
  },
  // Payroll auto-post พฤษภาคม
  {
    id: "jv-payroll-may",
    org_id: ORG,
    entry_number: "JV-2026-0008",
    entry_date: "2026-05-31",
    description: "เงินเดือนพนักงาน พฤษภาคม 2569 (auto-post จาก HRM)",
    status: "posted",
    period_id: "period-may-2026",
    source: "payroll",
    source_ref_id: "payroll-run-may-2026",
    period_year: 2026,
    period_month: 5,
    total_debit: 63900.0,
    total_credit: 63900.0, // ✓
    created_by: null,
    created_at: "2026-05-31T18:00:00.000Z",
  },
  // Payroll auto-post มิถุนายน
  {
    id: "jv-payroll-jun",
    org_id: ORG,
    entry_number: "JV-2026-0009",
    entry_date: "2026-06-20",
    description: "เงินเดือนพนักงาน มิถุนายน 2569 (auto-post จาก HRM)",
    status: "posted",
    period_id: "period-jun-2026",
    source: "payroll",
    source_ref_id: "payroll-run-jun-2026",
    period_year: 2026,
    period_month: 6,
    total_debit: 63900.0,
    total_credit: 63900.0, // ✓
    created_by: null,
    created_at: "2026-06-20T18:00:00.000Z",
  },
  // ค่าเสื่อมราคา มิถุนายน
  {
    id: "jv-depr-01",
    org_id: ORG,
    entry_number: "JV-2026-0010",
    entry_date: "2026-06-30",
    description: "ค่าเสื่อมราคาสินทรัพย์ มิถุนายน 2569 (auto-post)",
    status: "posted",
    period_id: "period-jun-2026",
    source: "depreciation",
    source_ref_id: "asset-001",
    period_year: 2026,
    period_month: 6,
    total_debit: 1527.78,
    total_credit: 1527.78, // ✓
    created_by: null,
    created_at: "2026-06-30T23:59:00.000Z",
  },
];

/** เพิ่ม lines เข้า entries (สะดวกใช้ใน dialog) */
export const mockJournalEntriesWithLines: AccJournalEntry[] = mockJournalEntries.map((entry) => ({
  ...entry,
  lines: mockJournalLines.filter((l) => l.journal_entry_id === entry.id),
}));

// ============================================================
// SELF-CHECK — journal balance verification
// (ทุก posted entry ต้อง total_debit = total_credit)
// ============================================================
// jv-001:         Dr=45,000.00    Cr=45,000.00   ✓
// jv-002:         Dr=28,500.00    Cr=28,500.00   ✓
// jv-003:         Dr=15,000.00    Cr=15,000.00   ✓
// jv-004:         Dr=75,000.00    Cr=75,000.00   ✓
// jv-005:         Dr=22,000.00    Cr=22,000.00   ✓
// jv-006 (draft): Dr=18,000.00    Cr=18,000.00   (draft)
// jv-payroll-apr: Dr=63,900.00    Cr=63,900.00   ✓
//   line check:   58,500+2,700+2,700=63,900 | 49,850+3,150+5,400+5,400+100=63,900 ✓
// jv-payroll-may: Dr=63,900.00    Cr=63,900.00   ✓
// jv-payroll-jun: Dr=63,900.00    Cr=63,900.00   ✓
// jv-depr-01:     Dr=1,527.78     Cr=1,527.78    ✓
// ALL POSTED ENTRIES BALANCED ✓
