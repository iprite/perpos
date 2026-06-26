"use client";

// data-context.tsx — AccountingDataProvider: cross-page mock state (Context store)
// seed จาก _fixtures/* ตอน mount → mutator อัปเดต store ในหน่วยความจำ
// ทุกหน้าที่ subscribe เห็นผลทันที (บันทึกหน้าบ้าน → นักบัญชีเห็นหลังบ้าน ข้ามหน้าจริง)
//
// P4a: entries (addEntry/updateEntry/deleteEntry) + setVatRegistered
// P4b: เพิ่ม mutators ครบทุก entity หลังบ้าน (documents/contacts/journal/accounts/periods/
//      tax/assets) + สะพาน runPayrollBridge + runDepreciation
//
// 🔒 กฎ (บทเรียน): toast side-effect ต้องอยู่ **นอก** state updater (updater ต้อง pure)
//    → mutator คืน result/ok แล้วให้ page ยิง toast เอง, หรือเรียก toast หลัง setState
//
// import: import { AccountingDataProvider, useAccountingData } from "../_components/data-context";

import React, { createContext, useContext, useMemo, useRef, useState } from "react";
import {
  mockEntries as seedEntries,
  mockContacts as seedContacts,
  mockAccounts as seedAccounts,
  mockDocumentsWithLines as seedDocuments,
  mockJournalEntriesWithLines as seedJournal,
  mockPeriods as seedPeriods,
  mockTaxFilings as seedTaxFilings,
  mockAssets as seedAssets,
  mockProducts as seedProducts,
  mockOrgSettings as seedOrgSettings,
  mockPayrollBridgeRun,
  MOCK_ORG_ID,
} from "../_fixtures";
import type {
  AccEntry,
  AccContact,
  AccAccount,
  AccDocument,
  AccJournalEntry,
  AccJournalLine,
  AccPeriod,
  AccTaxFiling,
  AccAsset,
  AccProduct,
  AccOrgSettings,
  PayrollBridgePayload,
} from "../_fixtures/types";

/** input ของ entry-dialog (A2) — ฟิลด์ที่ผู้ใช้กรอกได้ */
export interface NewEntryInput {
  kind: AccEntry["kind"];
  entry_date: string; // ISO YYYY-MM-DD
  amount: number;
  category: string | null;
  description: string | null;
  contact_id: string | null;
  wht_rate: number | null;
  wht_amount: number | null;
}

/** ผลของสะพานเงินเดือน (โชว์ใน dialog สรุป B1) */
export interface PayrollBridgeRunResult {
  ok: boolean;
  skipped: boolean; // idempotent — run_id นี้บันทึกแล้ว
  run_number: string;
  period_year: number;
  period_month: number;
  journal_entry_number: string;
  total_debit: number;
  total_credit: number;
  pnd1_wht_total: number;
  pnd1_due_date: string;
}

/** ผลของการรันค่าเสื่อม (โชว์ใน dialog สรุป B5) */
export interface DepreciationLine {
  asset_id: string;
  asset_name: string;
  amount: number;
}
export interface DepreciationRunResult {
  ok: boolean;
  period_year: number;
  period_month: number;
  posted: DepreciationLine[]; // ตั้งค่าเสื่อมสำเร็จงวดนี้
  skipped: DepreciationLine[]; // ลงงวดนี้ไปแล้ว/เต็มแล้ว
  total_amount: number;
  journal_entry_number: string | null;
}

interface AccountingData {
  entries: AccEntry[];
  contacts: AccContact[];
  accounts: AccAccount[];
  documents: AccDocument[];
  journal: AccJournalEntry[];
  periods: AccPeriod[];
  taxFilings: AccTaxFiling[];
  assets: AccAsset[];
  products: AccProduct[];
  orgSettings: AccOrgSettings;

  // ─── entries (A2) ───
  addEntry: (input: NewEntryInput) => AccEntry;
  updateEntry: (id: string, patch: Partial<AccEntry>) => void;
  deleteEntry: (id: string) => void;

  // ─── documents (A3) ───
  addDocument: (doc: AccDocument) => void;
  updateDocument: (doc: AccDocument) => void;
  deleteDocument: (id: string) => void;
  convertDocument: (id: string, toType: "invoice" | "receipt") => AccDocument | null;

  // ─── contacts (A4) ───
  addContact: (c: AccContact) => void;
  updateContact: (c: AccContact) => void;
  deleteContact: (id: string) => void;

  // ─── products / สินค้าและบริการ (A6) ───
  addProduct: (p: AccProduct) => void;
  updateProduct: (p: AccProduct) => void;
  deleteProduct: (id: string) => void;

  // ─── journal (B1) ───
  addJournal: (entry: AccJournalEntry) => void;
  updateJournal: (entry: AccJournalEntry) => void;
  postJournal: (id: string) => void;
  voidJournal: (id: string) => void;

  // ─── accounts / ผังบัญชี (B2) ───
  addAccount: (a: AccAccount) => void;
  updateAccount: (a: AccAccount) => void;
  deleteAccount: (id: string) => void;

  // ─── periods (B4) ───
  closePeriod: (id: string) => void;
  reopenPeriod: (id: string) => void;

  // ─── tax filings (B4) ───
  addTaxFiling: (f: AccTaxFiling) => void;
  updateTaxFiling: (f: AccTaxFiling) => void;
  recomputeTaxFiling: (id: string) => void;
  markFiled: (id: string) => void;

  // ─── assets + ค่าเสื่อม (B5) ───
  addAsset: (a: AccAsset) => void;
  updateAsset: (a: AccAsset) => void;
  deleteAsset: (id: string) => void;
  runDepreciation: (year: number, month: number) => DepreciationRunResult;

  // ─── สะพานเงินเดือน (B1) ───
  runPayrollBridge: () => PayrollBridgeRunResult;

  // ─── org settings (VAT toggle — A5/B6) ───
  setVatRegistered: (v: boolean) => void;
  updateOrgSettings: (patch: Partial<AccOrgSettings>) => void;

  /** helper — หา period (year, month); สร้างถ้ายังไม่มี (ใช้ภายใน mutator) */
  findPeriodStatus: (year: number, month: number) => "open" | "closed" | "none";
}

const Ctx = createContext<AccountingData | null>(null);

let counter = 1;
const uid = (prefix: string) => `${prefix}-new-${Date.now()}-${counter++}`;

export function AccountingDataProvider({ children }: { children: React.ReactNode }) {
  const [entries, setEntries] = useState<AccEntry[]>(() => seedEntries);
  const [contacts, setContacts] = useState<AccContact[]>(() => seedContacts);
  const [accounts, setAccounts] = useState<AccAccount[]>(() => seedAccounts);
  const [documents, setDocuments] = useState<AccDocument[]>(() => seedDocuments);
  const [journal, setJournal] = useState<AccJournalEntry[]>(() => seedJournal);
  const [periods, setPeriods] = useState<AccPeriod[]>(() => seedPeriods);
  const [taxFilings, setTaxFilings] = useState<AccTaxFiling[]>(() => seedTaxFilings);
  const [assets, setAssets] = useState<AccAsset[]>(() => seedAssets);
  const [products, setProducts] = useState<AccProduct[]>(() => seedProducts);
  const [orgSettings, setOrgSettings] = useState<AccOrgSettings>(() => seedOrgSettings);

  // ตัวนับ entry_number / payroll run สำหรับ demo (mutable ref ไม่ trigger re-render)
  const jvSeqRef = useRef(11); // ต่อจาก JV-2026-0010 ใน seed
  const payrollMonthRef = useRef(7); // เริ่มจำลองงวดถัดไป (ก.ค.) — มิ.ย. มีใน seed แล้ว

  const value = useMemo<AccountingData>(() => {
    const now = () => new Date().toISOString();
    const nextJvNumber = () => `JV-2026-${String(jvSeqRef.current++).padStart(4, "0")}`;

    const contactName = (id: string | null): string | undefined =>
      id ? (contacts.find((c) => c.id === id)?.name ?? undefined) : undefined;

    const findPeriodStatus = (year: number, month: number): "open" | "closed" | "none" => {
      const p = periods.find((x) => x.year === year && x.month === month);
      return p ? p.status : "none";
    };

    // ───────────────────────── entries (A2) ─────────────────────────
    const addEntry: AccountingData["addEntry"] = (input) => {
      const entry: AccEntry = {
        id: uid("ent"),
        org_id: MOCK_ORG_ID,
        kind: input.kind,
        entry_date: input.entry_date,
        amount: input.amount,
        category: input.category,
        description: input.description,
        contact_id: input.contact_id,
        source: "manual",
        source_ref_id: null,
        wht_rate: input.wht_rate,
        wht_amount: input.wht_amount,
        journal_entry_id: null,
        created_at: now(),
        contact_name: contactName(input.contact_id),
      };
      setEntries((prev) => [entry, ...prev]);
      return entry;
    };

    const updateEntry: AccountingData["updateEntry"] = (id, patch) =>
      setEntries((prev) =>
        prev.map((e) =>
          e.id === id
            ? {
                ...e,
                ...patch,
                contact_name:
                  patch.contact_id !== undefined ? contactName(patch.contact_id) : e.contact_name,
              }
            : e,
        ),
      );

    const deleteEntry: AccountingData["deleteEntry"] = (id) =>
      setEntries((prev) => prev.filter((e) => e.id !== id));

    // ──────────────────────── documents (A3) ────────────────────────
    const addDocument: AccountingData["addDocument"] = (doc) =>
      setDocuments((prev) => [{ ...doc, contact_name: contactName(doc.contact_id) }, ...prev]);

    const updateDocument: AccountingData["updateDocument"] = (doc) =>
      setDocuments((prev) =>
        prev.map((d) =>
          d.id === doc.id ? { ...doc, contact_name: contactName(doc.contact_id) } : d,
        ),
      );

    const deleteDocument: AccountingData["deleteDocument"] = (id) =>
      setDocuments((prev) => prev.filter((d) => d.id !== id));

    const convertDocument: AccountingData["convertDocument"] = (id, toType) => {
      const src = documents.find((d) => d.id === id);
      if (!src) return null;
      const seq = String(jvSeqRef.current).padStart(4, "0");
      const prefix = toType === "invoice" ? "INV" : "RC";
      const created: AccDocument = {
        ...src,
        id: uid("doc"),
        doc_type: toType,
        doc_number: `${prefix}-2026-${seq}`,
        status: toType === "receipt" ? "paid" : "sent",
        converted_from_id: src.id,
        created_at: now(),
        lines: src.lines?.map((l, i) => ({ ...l, id: uid("dl"), sort_order: i + 1 })),
        contact_name: contactName(src.contact_id),
      };
      jvSeqRef.current++;
      // เอกสารต้นทาง → accepted (quotation) / paid (invoice→receipt)
      setDocuments((prev) => [
        created,
        ...prev.map((d) =>
          d.id === src.id
            ? {
                ...d,
                status: toType === "receipt" ? "paid" : ("accepted" as AccDocument["status"]),
              }
            : d,
        ),
      ]);
      return created;
    };

    // ───────────────────────── contacts (A4) ─────────────────────────
    const addContact: AccountingData["addContact"] = (c) => setContacts((prev) => [c, ...prev]);
    const updateContact: AccountingData["updateContact"] = (c) =>
      setContacts((prev) => prev.map((x) => (x.id === c.id ? c : x)));
    const deleteContact: AccountingData["deleteContact"] = (id) =>
      setContacts((prev) => prev.filter((x) => x.id !== id));

    // ─────────────────── products / สินค้าและบริการ (A6) ───────────────────
    const addProduct: AccountingData["addProduct"] = (p) => setProducts((prev) => [p, ...prev]);
    const updateProduct: AccountingData["updateProduct"] = (p) =>
      setProducts((prev) => prev.map((x) => (x.id === p.id ? p : x)));
    const deleteProduct: AccountingData["deleteProduct"] = (id) =>
      setProducts((prev) => prev.filter((x) => x.id !== id));

    // ───────────────────────── journal (B1) ─────────────────────────
    const addJournal: AccountingData["addJournal"] = (entry) =>
      setJournal((prev) => [entry, ...prev]);
    const updateJournal: AccountingData["updateJournal"] = (entry) =>
      setJournal((prev) => prev.map((j) => (j.id === entry.id ? entry : j)));
    const postJournal: AccountingData["postJournal"] = (id) =>
      setJournal((prev) => prev.map((j) => (j.id === id ? { ...j, status: "posted" } : j)));
    const voidJournal: AccountingData["voidJournal"] = (id) =>
      setJournal((prev) => prev.map((j) => (j.id === id ? { ...j, status: "void" } : j)));

    // ──────────────────────── accounts (B2) ────────────────────────
    const addAccount: AccountingData["addAccount"] = (a) => setAccounts((prev) => [...prev, a]);
    const updateAccount: AccountingData["updateAccount"] = (a) =>
      setAccounts((prev) => prev.map((x) => (x.id === a.id ? a : x)));
    const deleteAccount: AccountingData["deleteAccount"] = (id) =>
      setAccounts((prev) => prev.filter((x) => x.id !== id && x.parent_id !== id));

    // ───────────────────────── periods (B4) ─────────────────────────
    const closePeriod: AccountingData["closePeriod"] = (id) =>
      setPeriods((prev) =>
        prev.map((p) => (p.id === id ? { ...p, status: "closed", closed_at: now() } : p)),
      );
    const reopenPeriod: AccountingData["reopenPeriod"] = (id) =>
      setPeriods((prev) =>
        prev.map((p) => (p.id === id ? { ...p, status: "open", closed_at: null } : p)),
      );

    // ─────────────────────── tax filings (B4) ───────────────────────
    const addTaxFiling: AccountingData["addTaxFiling"] = (f) =>
      setTaxFilings((prev) => [f, ...prev]);
    const updateTaxFiling: AccountingData["updateTaxFiling"] = (f) =>
      setTaxFilings((prev) => prev.map((x) => (x.id === f.id ? f : x)));
    const recomputeTaxFiling: AccountingData["recomputeTaxFiling"] = (id) =>
      setTaxFilings((prev) =>
        prev.map((f) => {
          if (f.id !== id) return f;
          // recompute mock: PP30 net = sales − purchase, PND net = wht_total
          if (f.tax_kind === "pp30") {
            const net = (f.sales_vat ?? 0) - (f.purchase_vat ?? 0);
            return { ...f, net_payable: net, status: "ready" };
          }
          return { ...f, net_payable: f.wht_total ?? 0, status: "ready" };
        }),
      );
    const markFiled: AccountingData["markFiled"] = (id) =>
      setTaxFilings((prev) =>
        prev.map((f) => (f.id === id ? { ...f, status: "filed", filed_at: now() } : f)),
      );

    // ───────────────────── assets + ค่าเสื่อม (B5) ─────────────────────
    const addAsset: AccountingData["addAsset"] = (a) => setAssets((prev) => [a, ...prev]);
    const updateAsset: AccountingData["updateAsset"] = (a) =>
      setAssets((prev) => prev.map((x) => (x.id === a.id ? a : x)));
    const deleteAsset: AccountingData["deleteAsset"] = (id) =>
      setAssets((prev) => prev.filter((x) => x.id !== id));

    // runDepreciation — ค่าเสื่อมเส้นตรงทุก asset active + post journal (Dr 5800 / Cr 1590)
    // idempotent ต่อ (asset, period): ถ้ามี journal depreciation ของ asset+งวดแล้ว → skip
    const runDepreciation: AccountingData["runDepreciation"] = (year, month) => {
      const posted: DepreciationLine[] = [];
      const skipped: DepreciationLine[] = [];

      const round2 = (n: number) => Math.round(n * 100) / 100;

      const activeAssets = assets.filter((a) => a.status === "active");
      const updatedAssets = new Map<string, number>(); // asset_id → new accumulated

      for (const a of activeAssets) {
        const depreciable = a.cost - a.salvage_value;
        // มี journal depreciation ของ asset นี้ในงวดนี้แล้ว?
        const already = journal.some(
          (j) =>
            j.source === "depreciation" &&
            j.source_ref_id === a.id &&
            j.period_year === year &&
            j.period_month === month &&
            j.status !== "void",
        );
        if (already || a.accumulated_depreciation >= depreciable - 0.001) {
          skipped.push({ asset_id: a.id, asset_name: a.name, amount: 0 });
          continue;
        }
        let amount = round2(depreciable / a.useful_life_months);
        // งวดสุดท้าย — ปัดไม่ให้เกิน depreciable
        const remaining = round2(depreciable - a.accumulated_depreciation);
        if (amount > remaining) amount = remaining;
        if (amount <= 0) {
          skipped.push({ asset_id: a.id, asset_name: a.name, amount: 0 });
          continue;
        }
        posted.push({ asset_id: a.id, asset_name: a.name, amount });
        updatedAssets.set(a.id, round2(a.accumulated_depreciation + amount));
      }

      const total = round2(posted.reduce((s, p) => s + p.amount, 0));
      let jvNumber: string | null = null;

      if (posted.length > 0) {
        // สร้าง journal posted ต่อ asset (1 entry/asset เพื่อ idempotency ต่อ asset+period)
        const newEntries: AccJournalEntry[] = posted.map((p) => {
          const jvId = uid("jv-depr");
          jvNumber = nextJvNumber();
          const lines: AccJournalLine[] = [
            {
              id: uid("jl"),
              org_id: MOCK_ORG_ID,
              journal_entry_id: jvId,
              account_id: "acc-5800",
              debit: p.amount,
              credit: 0,
              line_note: `ค่าเสื่อมราคา ${p.asset_name}`,
              sort_order: 1,
              account_code: "5800",
              account_name: "ค่าเสื่อมราคา",
            },
            {
              id: uid("jl"),
              org_id: MOCK_ORG_ID,
              journal_entry_id: jvId,
              account_id: "acc-1590",
              debit: 0,
              credit: p.amount,
              line_note: `ค่าเสื่อมสะสม ${p.asset_name}`,
              sort_order: 2,
              account_code: "1590",
              account_name: "ค่าเสื่อมราคาสะสม (contra asset)",
            },
          ];
          return {
            id: jvId,
            org_id: MOCK_ORG_ID,
            entry_number: jvNumber,
            entry_date: `${year}-${String(month).padStart(2, "0")}-28`,
            description: `ค่าเสื่อมราคา ${p.asset_name} ${month}/${year}`,
            status: "posted",
            period_id: null,
            source: "depreciation",
            source_ref_id: p.asset_id,
            period_year: year,
            period_month: month,
            total_debit: p.amount,
            total_credit: p.amount,
            created_by: null,
            created_at: now(),
            lines,
          };
        });
        setJournal((prev) => [...newEntries, ...prev]);
        setAssets((prev) =>
          prev.map((a) =>
            updatedAssets.has(a.id)
              ? {
                  ...a,
                  accumulated_depreciation: updatedAssets.get(a.id)!,
                  book_value: round2(a.cost - updatedAssets.get(a.id)!),
                }
              : a,
          ),
        );
      }

      return {
        ok: posted.length > 0,
        period_year: year,
        period_month: month,
        posted,
        skipped,
        total_amount: total,
        journal_entry_number: jvNumber,
      };
    };

    // ──────────────────── สะพานเงินเดือน (B1) ────────────────────
    // จาก mockPayrollBridgeRun → สร้าง acc_entries(expense,payroll) + journal posted 8 บรรทัด
    //   + pnd1 filing draft. idempotent ต่อ run_id (กดซ้ำ → skip).
    // demo: เลื่อนงวดถัดไปทุกครั้งที่กด (run_id ใหม่) → เห็น journal เด้งเสมอ
    const runPayrollBridge: AccountingData["runPayrollBridge"] = () => {
      const base: PayrollBridgePayload = mockPayrollBridgeRun;
      const month = payrollMonthRef.current;
      const runId = `payroll-run-${month}-2026`;
      const runNumber = `PAY-2026-${String(month).padStart(2, "0")}`;

      // idempotent — run_id นี้สร้าง journal payroll แล้วหรือยัง
      const exists = journal.some((j) => j.source === "payroll" && j.source_ref_id === runId);
      if (exists) {
        return {
          ok: false,
          skipped: true,
          run_number: runNumber,
          period_year: 2026,
          period_month: month,
          journal_entry_number: "",
          total_debit: 0,
          total_credit: 0,
          pnd1_wht_total: base.wht_total,
          pnd1_due_date: `2026-${String(month + 1).padStart(2, "0")}-07`,
        };
      }

      const jvId = uid("jv-payroll");
      const jvNumber = nextJvNumber();
      const totalDebit = base.total_earnings + base.sso_employer_total + base.pvd_employer_total;
      const totalCredit =
        base.net_total +
        base.wht_total +
        (base.sso_employee_total + base.sso_employer_total) +
        (base.pvd_employee_total + base.pvd_employer_total) +
        base.extra_deductions_total;

      const mk = (
        account_id: string,
        code: string,
        name: string,
        debit: number,
        credit: number,
        note: string,
        order: number,
      ): AccJournalLine => ({
        id: uid("jl"),
        org_id: MOCK_ORG_ID,
        journal_entry_id: jvId,
        account_id,
        debit,
        credit,
        line_note: note,
        sort_order: order,
        account_code: code,
        account_name: name,
      });

      const lines: AccJournalLine[] = [
        mk(
          "acc-5100",
          "5100",
          "เงินเดือนและค่าจ้าง (gross รวม OT/เบี้ย — I1)",
          base.total_earnings,
          0,
          "เงินเดือนและค่าจ้าง (gross)",
          1,
        ),
        mk(
          "acc-5110",
          "5110",
          "ค่าใช้จ่าย SSO นายจ้าง",
          base.sso_employer_total,
          0,
          "SSO นายจ้าง",
          2,
        ),
        mk(
          "acc-5120",
          "5120",
          "ค่าใช้จ่าย PVD นายจ้าง",
          base.pvd_employer_total,
          0,
          "PVD นายจ้าง",
          3,
        ),
        mk("acc-1020", "1020", "เงินฝากธนาคาร", 0, base.net_total, "จ่ายสุทธิผ่านธนาคาร", 4),
        mk(
          "acc-2210",
          "2210",
          "ภาษีหัก ณ ที่จ่ายค้างจ่าย (PND1)",
          0,
          base.wht_total,
          "WHT PND1 ค้างจ่าย",
          5,
        ),
        mk(
          "acc-2220",
          "2220",
          "ประกันสังคมค้างจ่าย (SSO)",
          0,
          base.sso_employee_total + base.sso_employer_total,
          "SSO ค้างจ่าย (ลูกจ้าง+นายจ้าง)",
          6,
        ),
        mk(
          "acc-2230",
          "2230",
          "กองทุนสำรองเลี้ยงชีพค้างจ่าย (PVD)",
          0,
          base.pvd_employee_total + base.pvd_employer_total,
          "PVD ค้างจ่าย (ลูกจ้าง+นายจ้าง)",
          7,
        ),
        mk(
          "acc-2240",
          "2240",
          "เงินหักอื่นค้างจ่าย",
          0,
          base.extra_deductions_total,
          "เงินหักอื่น",
          8,
        ),
      ];

      const jvEntry: AccJournalEntry = {
        id: jvId,
        org_id: MOCK_ORG_ID,
        entry_number: jvNumber,
        entry_date: `2026-${String(month).padStart(2, "0")}-28`,
        description: `เงินเดือนพนักงาน งวด ${month}/2569 (auto-post จาก HRM)`,
        status: "posted",
        period_id: null,
        source: "payroll",
        source_ref_id: runId,
        period_year: 2026,
        period_month: month,
        total_debit: totalDebit,
        total_credit: totalCredit,
        created_by: null,
        created_at: now(),
        lines,
      };

      // acc_entries (expense, payroll) — โผล่ใน cockpit เจ้าของ
      const accEntry: AccEntry = {
        id: uid("ent-payroll"),
        org_id: MOCK_ORG_ID,
        kind: "expense",
        entry_date: `2026-${String(month).padStart(2, "0")}-28`,
        amount: base.total_earnings,
        category: "เงินเดือนและค่าจ้าง",
        description: `เงินเดือนพนักงาน งวด ${runNumber}`,
        contact_id: null,
        source: "payroll",
        source_ref_id: runId,
        wht_rate: null,
        wht_amount: null,
        journal_entry_id: jvId,
        created_at: now(),
      };

      // pnd1 filing draft — upsert ต่องวด
      const dueDate = `2026-${String(month + 1).padStart(2, "0")}-07`;
      const pnd1Existing = taxFilings.find(
        (t) => t.tax_kind === "pnd1" && t.period_year === 2026 && t.period_month === month,
      );

      setJournal((prev) => [jvEntry, ...prev]);
      setEntries((prev) => [accEntry, ...prev]);
      if (pnd1Existing && pnd1Existing.status === "draft") {
        setTaxFilings((prev) =>
          prev.map((t) =>
            t.id === pnd1Existing.id
              ? {
                  ...t,
                  wht_total: (t.wht_total ?? 0) + base.wht_total,
                  net_payable: (t.net_payable ?? 0) + base.wht_total,
                }
              : t,
          ),
        );
      } else if (!pnd1Existing) {
        const newFiling: AccTaxFiling = {
          id: uid("tax-pnd1"),
          org_id: MOCK_ORG_ID,
          tax_kind: "pnd1",
          period_year: 2026,
          period_month: month,
          status: "draft",
          sales_vat: null,
          purchase_vat: null,
          net_payable: base.wht_total,
          wht_total: base.wht_total,
          due_date: dueDate,
          filed_at: null,
          created_at: now(),
        };
        setTaxFilings((prev) => [newFiling, ...prev]);
      }

      payrollMonthRef.current = month + 1;

      return {
        ok: true,
        skipped: false,
        run_number: runNumber,
        period_year: 2026,
        period_month: month,
        journal_entry_number: jvNumber,
        total_debit: totalDebit,
        total_credit: totalCredit,
        pnd1_wht_total: base.wht_total,
        pnd1_due_date: dueDate,
      };
    };

    // ─────────────────────── org settings ───────────────────────
    const setVatRegistered: AccountingData["setVatRegistered"] = (v) =>
      setOrgSettings((prev) => ({ ...prev, is_vat_registered: v }));
    const updateOrgSettings: AccountingData["updateOrgSettings"] = (patch) =>
      setOrgSettings((prev) => ({ ...prev, ...patch }));

    return {
      entries,
      contacts,
      accounts,
      documents,
      journal,
      periods,
      taxFilings,
      assets,
      products,
      orgSettings,
      addEntry,
      updateEntry,
      deleteEntry,
      addDocument,
      updateDocument,
      deleteDocument,
      convertDocument,
      addContact,
      updateContact,
      deleteContact,
      addProduct,
      updateProduct,
      deleteProduct,
      addJournal,
      updateJournal,
      postJournal,
      voidJournal,
      addAccount,
      updateAccount,
      deleteAccount,
      closePeriod,
      reopenPeriod,
      addTaxFiling,
      updateTaxFiling,
      recomputeTaxFiling,
      markFiled,
      addAsset,
      updateAsset,
      deleteAsset,
      runDepreciation,
      runPayrollBridge,
      setVatRegistered,
      updateOrgSettings,
      findPeriodStatus,
    };
  }, [
    entries,
    contacts,
    accounts,
    documents,
    journal,
    periods,
    taxFilings,
    assets,
    products,
    orgSettings,
  ]);

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useAccountingData(): AccountingData {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useAccountingData ต้องใช้ภายใน <AccountingDataProvider>");
  return ctx;
}
