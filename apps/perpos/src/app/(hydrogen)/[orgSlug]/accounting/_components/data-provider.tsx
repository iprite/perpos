"use client";

// data-provider.tsx (production) — AccountingDataProvider: cross-page state ที่ fetch API จริง
//   แทน mock data-context ของ prototype. ทุก resource ดึงจาก /api/accounting/* (Bearer token) +
//   mutator เรียก POST/PATCH/DELETE จริง แล้ว refetch resource นั้น (พอเพียงสำหรับ CRUD UI).
//
// ── PATTERN การ wire data ───────────────────────────────────────────────────────────────
//   1) state ต่อ resource + `loading.<resource>` (skeleton ระหว่างโหลดครั้งแรก).
//   2) fetch: `apiGet(path)` แนบ Bearer token + `?orgId=`. โหลดครั้งแรกใน useEffect (auto-load).
//   3) mutate: `apiSend(method, path, body)` แนบ token + orgId. สำเร็จ → refetch resource นั้น
//      (server เป็น source of truth) · คืน `{ ok, error? }` ให้ page ตัดสิน toast เอง.
//   4) error: apiSend คืน error ภาษาไทยจาก API.
//
// resources (B4): entries/journalEntries/accounts/periods/taxFilings/assets/orgSettings
//   + products/contacts/documents (front agent consume).
//
// import: import { AccountingDataProvider, useAccountingData } from "../_components/data-provider";

import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import { backendUrl } from "@/lib/backend";
import type {
  AccEntry,
  AccContact,
  AccDocument,
  AccTaxFiling,
  AccOrgSettings,
  AccJournalEntry,
  AccAccount,
  AccPeriod,
  AccAsset,
  AccProduct,
  AccDocType,
} from "@/lib/accounting/types";

/** input ของ entry-dialog (A2) — ฟิลด์ที่ผู้ใช้กรอกได้ (= contract POST /api/accounting/entries) */
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

/** input journal-dialog (B1) — header + lines (= contract POST/PATCH /api/accounting/journal) */
export interface JournalLineInput {
  account_id: string;
  debit: number;
  credit: number;
  line_note: string | null;
}
export interface JournalInput {
  entry_date: string;
  description: string | null;
  lines: JournalLineInput[];
}

/** input account-dialog (B2) */
export interface AccountInput {
  code: string;
  name: string;
  account_type: AccAccount["account_type"];
  parent_id: string | null;
  is_active?: boolean;
}

/** input tax-filing-dialog (B4) */
export interface TaxFilingInput {
  tax_kind: AccTaxFiling["tax_kind"];
  period_year: number;
  period_month: number;
  sales_vat: number | null;
  purchase_vat: number | null;
  wht_total: number | null;
  net_payable: number | null;
  due_date: string;
}

/** input asset-dialog (B5) */
export interface AssetInput {
  name: string;
  asset_account_id: string;
  acquire_date: string;
  cost: number;
  salvage_value: number;
  useful_life_months: number;
}

/** input contact (front agent) */
export interface ContactInput {
  kind: AccContact["kind"];
  name: string;
  tax_id: string | null;
  branch: string | null;
  address: string | null;
  phone: string | null;
  email: string | null;
}

/** input product (front agent) */
export interface ProductInput {
  kind: AccProduct["kind"];
  code: string | null;
  name: string;
  unit: string | null;
  unit_price: number;
  is_active: boolean;
  description: string | null;
}

/** ผลของ mutator — page ใช้ตัดสิน toast (toast side-effect อยู่นอก provider) */
export interface MutResult {
  ok: boolean;
  error?: string;
  /** id ของ row ที่สร้าง (เฉพาะ POST ที่ API คืน id — ใช้ chain เช่น สร้างร่าง→post) */
  id?: string;
}

interface AccountingData {
  orgId: string;

  // ── resources ──
  entries: AccEntry[];
  journalEntries: AccJournalEntry[];
  accounts: AccAccount[];
  periods: AccPeriod[];
  taxFilings: AccTaxFiling[];
  assets: AccAsset[];
  contacts: AccContact[];
  products: AccProduct[];
  documents: AccDocument[];
  /** null = org ยังไม่ seed settings → UI ใช้ Non-VAT default */
  orgSettings: AccOrgSettings | null;

  // ── loading flags (skeleton ระหว่างโหลดครั้งแรก) ──
  loading: {
    entries: boolean;
    journalEntries: boolean;
    accounts: boolean;
    periods: boolean;
    taxFilings: boolean;
    assets: boolean;
    contacts: boolean;
    products: boolean;
    documents: boolean;
    orgSettings: boolean;
  };

  // ── reload helpers (auto-load — ไม่มีปุ่ม refresh; เรียกหลัง mutate) ──
  reloadEntries: () => Promise<void>;
  reloadJournal: () => Promise<void>;
  reloadAccounts: () => Promise<void>;
  reloadPeriods: () => Promise<void>;
  reloadTaxFilings: () => Promise<void>;
  reloadAssets: () => Promise<void>;
  reloadContacts: () => Promise<void>;
  reloadProducts: () => Promise<void>;
  reloadDocuments: () => Promise<void>;
  reloadSettings: () => Promise<void>;

  /** GET ใด ๆ ใต้ /accounting (สำหรับรายงาน on-demand) — คืน JSON หรือ throw */
  apiGetRaw: <T = unknown>(path: string) => Promise<T>;

  // ── entries (A2) ──
  addEntry: (input: NewEntryInput) => Promise<MutResult>;
  updateEntry: (id: string, input: NewEntryInput) => Promise<MutResult>;
  deleteEntry: (id: string) => Promise<MutResult>;

  // ── journal (B1) ──
  addJournal: (input: JournalInput) => Promise<MutResult>;
  updateJournal: (id: string, input: JournalInput) => Promise<MutResult>;
  postJournal: (id: string) => Promise<MutResult>;
  voidJournal: (id: string) => Promise<MutResult>;

  // ── accounts (B2) ──
  addAccount: (input: AccountInput) => Promise<MutResult>;
  updateAccount: (id: string, input: Partial<AccountInput>) => Promise<MutResult>;
  deleteAccount: (id: string) => Promise<MutResult>;

  // ── periods (B4) ──
  closePeriod: (id: string) => Promise<MutResult>;
  reopenPeriod: (id: string) => Promise<MutResult>;
  /** สร้างงวด (open) ถ้ายังไม่มี — ใช้ก่อนปิด/รันค่าเสื่อมงวดที่ยังไม่ถูกสร้าง */
  ensurePeriod: (year: number, month: number) => Promise<MutResult>;

  // ── tax filings (B4) ──
  addTaxFiling: (input: TaxFilingInput) => Promise<MutResult>;
  updateTaxFiling: (id: string, input: Partial<TaxFilingInput>) => Promise<MutResult>;
  recomputeTaxFiling: (id: string) => Promise<MutResult>;
  markFiled: (id: string) => Promise<MutResult>;

  // ── assets (B5) ──
  addAsset: (input: AssetInput) => Promise<MutResult>;
  updateAsset: (
    id: string,
    input: Partial<AssetInput> & { status?: AccAsset["status"] },
  ) => Promise<MutResult>;
  deleteAsset: (id: string) => Promise<MutResult>;
  /** ตั้งค่าเสื่อมงวดนี้ให้ทุกสินทรัพย์ active — เรียก depreciate ต่อ asset แล้วสรุปผล */
  runDepreciation: (year: number, month: number) => Promise<DepreciationRunResult>;

  // ── org settings (A5/B6) ──
  updateOrgSettings: (patch: Partial<AccOrgSettings>) => Promise<MutResult>;

  // ── contacts (front agent) ──
  addContact: (input: ContactInput) => Promise<MutResult>;
  updateContact: (id: string, input: Partial<ContactInput>) => Promise<MutResult>;
  deleteContact: (id: string) => Promise<MutResult>;

  // ── products (front agent) ──
  addProduct: (input: ProductInput) => Promise<MutResult>;
  updateProduct: (id: string, input: Partial<ProductInput>) => Promise<MutResult>;
  deleteProduct: (id: string) => Promise<MutResult>;

  // ── documents (front agent) ──
  addDocument: (body: Record<string, unknown>) => Promise<MutResult>;
  updateDocument: (id: string, body: Record<string, unknown>) => Promise<MutResult>;
  deleteDocument: (id: string) => Promise<MutResult>;
  convertDocument: (id: string, toType: AccDocType) => Promise<MutResult>;
}

/** ผลรวมการรันค่าเสื่อมทั้งงวด (สรุปจากการเรียก depreciate ต่อ asset) */
export interface DepreciationLine {
  asset_id: string;
  asset_name: string;
  amount: number;
}
export interface DepreciationRunResult {
  ok: boolean;
  period_year: number;
  period_month: number;
  posted: DepreciationLine[];
  skipped: DepreciationLine[];
  total_amount: number;
  error?: string;
}

const Ctx = createContext<AccountingData | null>(null);

export function AccountingDataProvider({
  orgId,
  children,
}: {
  orgId: string;
  children: React.ReactNode;
}) {
  const supabase = useMemo(() => createSupabaseBrowserClient(), []);

  const [entries, setEntries] = useState<AccEntry[]>([]);
  const [journalEntries, setJournalEntries] = useState<AccJournalEntry[]>([]);
  const [accounts, setAccounts] = useState<AccAccount[]>([]);
  const [periods, setPeriods] = useState<AccPeriod[]>([]);
  const [taxFilings, setTaxFilings] = useState<AccTaxFiling[]>([]);
  const [assets, setAssets] = useState<AccAsset[]>([]);
  const [contacts, setContacts] = useState<AccContact[]>([]);
  const [products, setProducts] = useState<AccProduct[]>([]);
  const [documents, setDocuments] = useState<AccDocument[]>([]);
  const [orgSettings, setOrgSettings] = useState<AccOrgSettings | null>(null);

  const [loading, setLoading] = useState({
    entries: true,
    journalEntries: true,
    accounts: true,
    periods: true,
    taxFilings: true,
    assets: true,
    contacts: true,
    products: true,
    documents: true,
    orgSettings: true,
  });

  // ── token + fetch helpers ──────────────────────────────────────────────────
  const getToken = useCallback(async (): Promise<string> => {
    const { data } = await supabase.auth.getSession();
    return data.session?.access_token ?? "";
  }, [supabase]);

  /** GET /api/accounting/<path>?orgId= → JSON (throw ถ้า !ok) */
  const apiGet = useCallback(
    async <T,>(path: string): Promise<T> => {
      const token = await getToken();
      const sep = path.includes("?") ? "&" : "?";
      const res = await fetch(backendUrl(`/accounting/${path}${sep}orgId=${orgId}`), {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(body.error ?? "โหลดข้อมูลไม่สำเร็จ");
      }
      return (await res.json()) as T;
    },
    [getToken, orgId],
  );

  /** mutate (POST/PATCH/PUT/DELETE) — แนบ orgId + token. คืน { ok, error? } (ภาษาไทยจาก API) */
  const apiSend = useCallback(
    async (
      method: "POST" | "PATCH" | "PUT" | "DELETE",
      path: string,
      body?: unknown,
    ): Promise<MutResult> => {
      const token = await getToken();
      const headers: Record<string, string> = { Authorization: `Bearer ${token}` };
      const init: RequestInit = { method, headers };
      let url = backendUrl(`/accounting/${path}`);
      if (method === "DELETE") {
        const sep = path.includes("?") ? "&" : "?";
        url = backendUrl(`/accounting/${path}${sep}orgId=${orgId}`);
      } else {
        headers["Content-Type"] = "application/json";
        init.body = JSON.stringify({ orgId, ...(body as Record<string, unknown> | undefined) });
      }
      const res = await fetch(url, init);
      if (!res.ok) {
        const errBody = (await res.json().catch(() => ({}))) as { error?: string };
        return { ok: false, error: errBody.error ?? "บันทึกไม่สำเร็จ" };
      }
      const okBody = (await res.json().catch(() => ({}))) as { id?: string };
      return { ok: true, id: okBody.id };
    },
    [getToken, orgId],
  );

  // ── loaders ต่อ resource ───────────────────────────────────────────────────
  const reloadEntries = useCallback(async () => {
    try {
      const { entries: rows } = await apiGet<{ entries: AccEntry[] }>("entries");
      setEntries(rows);
    } catch {
      /* keep previous */
    } finally {
      setLoading((s) => ({ ...s, entries: false }));
    }
  }, [apiGet]);

  const reloadJournal = useCallback(async () => {
    try {
      const { entries: rows } = await apiGet<{ entries: AccJournalEntry[] }>("journal");
      setJournalEntries(rows);
    } catch {
      /* noop */
    } finally {
      setLoading((s) => ({ ...s, journalEntries: false }));
    }
  }, [apiGet]);

  const reloadAccounts = useCallback(async () => {
    try {
      const { accounts: rows } = await apiGet<{ accounts: AccAccount[] }>("accounts");
      setAccounts(rows);
    } catch {
      /* noop */
    } finally {
      setLoading((s) => ({ ...s, accounts: false }));
    }
  }, [apiGet]);

  const reloadPeriods = useCallback(async () => {
    try {
      const { periods: rows } = await apiGet<{ periods: AccPeriod[] }>("periods");
      setPeriods(rows);
    } catch {
      /* noop */
    } finally {
      setLoading((s) => ({ ...s, periods: false }));
    }
  }, [apiGet]);

  const reloadTaxFilings = useCallback(async () => {
    try {
      const { filings } = await apiGet<{ filings: AccTaxFiling[] }>("tax-filings");
      setTaxFilings(filings);
    } catch {
      /* noop */
    } finally {
      setLoading((s) => ({ ...s, taxFilings: false }));
    }
  }, [apiGet]);

  const reloadAssets = useCallback(async () => {
    try {
      const { assets: rows } = await apiGet<{ assets: AccAsset[] }>("assets");
      setAssets(rows);
    } catch {
      /* noop */
    } finally {
      setLoading((s) => ({ ...s, assets: false }));
    }
  }, [apiGet]);

  const reloadContacts = useCallback(async () => {
    try {
      const { contacts: rows } = await apiGet<{ contacts: AccContact[] }>("contacts");
      setContacts(rows);
    } catch {
      /* noop */
    } finally {
      setLoading((s) => ({ ...s, contacts: false }));
    }
  }, [apiGet]);

  const reloadProducts = useCallback(async () => {
    try {
      const { products: rows } = await apiGet<{ products: AccProduct[] }>("products");
      setProducts(rows);
    } catch {
      /* noop */
    } finally {
      setLoading((s) => ({ ...s, products: false }));
    }
  }, [apiGet]);

  const reloadDocuments = useCallback(async () => {
    try {
      const { documents: rows } = await apiGet<{ documents: AccDocument[] }>("documents");
      setDocuments(rows);
    } catch {
      /* noop */
    } finally {
      setLoading((s) => ({ ...s, documents: false }));
    }
  }, [apiGet]);

  const reloadSettings = useCallback(async () => {
    try {
      const { settings } = await apiGet<{ settings: AccOrgSettings | null }>("settings");
      setOrgSettings(settings);
    } catch {
      /* noop */
    } finally {
      setLoading((s) => ({ ...s, orgSettings: false }));
    }
  }, [apiGet]);

  const apiGetRaw = useCallback(<T = unknown,>(path: string) => apiGet<T>(path), [apiGet]);

  // โหลดครั้งแรกเมื่อ orgId เปลี่ยน (auto-load) — loaders เป็น useCallback stable (dep = apiGet ← orgId)
  useEffect(() => {
    void reloadEntries();
    void reloadJournal();
    void reloadAccounts();
    void reloadPeriods();
    void reloadTaxFilings();
    void reloadAssets();
    void reloadContacts();
    void reloadProducts();
    void reloadDocuments();
    void reloadSettings();
  }, [
    reloadEntries,
    reloadJournal,
    reloadAccounts,
    reloadPeriods,
    reloadTaxFilings,
    reloadAssets,
    reloadContacts,
    reloadProducts,
    reloadDocuments,
    reloadSettings,
  ]);

  // ── entries mutators ───────────────────────────────────────────────────────
  const addEntry = useCallback(
    async (input: NewEntryInput): Promise<MutResult> => {
      const r = await apiSend("POST", "entries", input);
      if (r.ok) await reloadEntries();
      return r;
    },
    [apiSend, reloadEntries],
  );
  const updateEntry = useCallback(
    async (id: string, input: NewEntryInput): Promise<MutResult> => {
      const r = await apiSend("PATCH", `entries/${id}`, input);
      if (r.ok) await reloadEntries();
      return r;
    },
    [apiSend, reloadEntries],
  );
  const deleteEntry = useCallback(
    async (id: string): Promise<MutResult> => {
      const r = await apiSend("DELETE", `entries/${id}`);
      if (r.ok) await reloadEntries();
      return r;
    },
    [apiSend, reloadEntries],
  );

  // ── journal mutators (post/void แตะ entries ด้วย — auto-post ก็โผล่ที่ cockpit) ──
  const addJournal = useCallback(
    async (input: JournalInput): Promise<MutResult> => {
      const r = await apiSend("POST", "journal", input);
      if (r.ok) await reloadJournal();
      return r;
    },
    [apiSend, reloadJournal],
  );
  const updateJournal = useCallback(
    async (id: string, input: JournalInput): Promise<MutResult> => {
      const r = await apiSend("PATCH", `journal/${id}`, input);
      if (r.ok) await reloadJournal();
      return r;
    },
    [apiSend, reloadJournal],
  );
  const postJournal = useCallback(
    async (id: string): Promise<MutResult> => {
      const r = await apiSend("POST", `journal/${id}/post`);
      if (r.ok) await Promise.all([reloadJournal(), reloadEntries()]);
      return r;
    },
    [apiSend, reloadJournal, reloadEntries],
  );
  const voidJournal = useCallback(
    async (id: string): Promise<MutResult> => {
      const r = await apiSend("POST", `journal/${id}/void`);
      if (r.ok) await Promise.all([reloadJournal(), reloadEntries()]);
      return r;
    },
    [apiSend, reloadJournal, reloadEntries],
  );

  // ── accounts mutators ──────────────────────────────────────────────────────
  const addAccount = useCallback(
    async (input: AccountInput): Promise<MutResult> => {
      const r = await apiSend("POST", "accounts", input);
      if (r.ok) await reloadAccounts();
      return r;
    },
    [apiSend, reloadAccounts],
  );
  const updateAccount = useCallback(
    async (id: string, input: Partial<AccountInput>): Promise<MutResult> => {
      const r = await apiSend("PATCH", `accounts/${id}`, input);
      if (r.ok) await reloadAccounts();
      return r;
    },
    [apiSend, reloadAccounts],
  );
  const deleteAccount = useCallback(
    async (id: string): Promise<MutResult> => {
      const r = await apiSend("DELETE", `accounts/${id}`);
      if (r.ok) await reloadAccounts();
      return r;
    },
    [apiSend, reloadAccounts],
  );

  // ── periods mutators ───────────────────────────────────────────────────────
  const closePeriod = useCallback(
    async (id: string): Promise<MutResult> => {
      const r = await apiSend("POST", `periods/${id}/close`);
      if (r.ok) await reloadPeriods();
      return r;
    },
    [apiSend, reloadPeriods],
  );
  const reopenPeriod = useCallback(
    async (id: string): Promise<MutResult> => {
      const r = await apiSend("POST", `periods/${id}/reopen`);
      if (r.ok) await reloadPeriods();
      return r;
    },
    [apiSend, reloadPeriods],
  );
  const ensurePeriod = useCallback(
    async (year: number, month: number): Promise<MutResult> => {
      const r = await apiSend("POST", "periods", { year, month });
      if (r.ok) await reloadPeriods();
      return r;
    },
    [apiSend, reloadPeriods],
  );

  // ── tax filings mutators ───────────────────────────────────────────────────
  const addTaxFiling = useCallback(
    async (input: TaxFilingInput): Promise<MutResult> => {
      const r = await apiSend("POST", "tax-filings", input);
      if (r.ok) await reloadTaxFilings();
      return r;
    },
    [apiSend, reloadTaxFilings],
  );
  const updateTaxFiling = useCallback(
    async (id: string, input: Partial<TaxFilingInput>): Promise<MutResult> => {
      const r = await apiSend("PATCH", `tax-filings/${id}`, input);
      if (r.ok) await reloadTaxFilings();
      return r;
    },
    [apiSend, reloadTaxFilings],
  );
  const recomputeTaxFiling = useCallback(
    async (id: string): Promise<MutResult> => {
      const r = await apiSend("POST", `tax-filings/${id}/recompute`);
      if (r.ok) await reloadTaxFilings();
      return r;
    },
    [apiSend, reloadTaxFilings],
  );
  const markFiled = useCallback(
    async (id: string): Promise<MutResult> => {
      const r = await apiSend("POST", `tax-filings/${id}/mark-filed`);
      if (r.ok) await reloadTaxFilings();
      return r;
    },
    [apiSend, reloadTaxFilings],
  );

  // ── assets mutators ────────────────────────────────────────────────────────
  const addAsset = useCallback(
    async (input: AssetInput): Promise<MutResult> => {
      const r = await apiSend("POST", "assets", input);
      if (r.ok) await reloadAssets();
      return r;
    },
    [apiSend, reloadAssets],
  );
  const updateAsset = useCallback(
    async (
      id: string,
      input: Partial<AssetInput> & { status?: AccAsset["status"] },
    ): Promise<MutResult> => {
      const r = await apiSend("PATCH", `assets/${id}`, input);
      if (r.ok) await reloadAssets();
      return r;
    },
    [apiSend, reloadAssets],
  );
  const deleteAsset = useCallback(
    async (id: string): Promise<MutResult> => {
      // ไม่มี DELETE endpoint สำหรับ asset → ปลดใช้งาน (disposed) แทน (RESTRICT: journal อ้างอิง)
      const r = await apiSend("PATCH", `assets/${id}`, { status: "disposed" });
      if (r.ok) await reloadAssets();
      return r;
    },
    [apiSend, reloadAssets],
  );

  // runDepreciation — ตั้งค่าเสื่อมงวดนี้ทุก asset active (เรียก depreciate ต่อ asset), สรุป posted/skipped
  const runDepreciation = useCallback(
    async (year: number, month: number): Promise<DepreciationRunResult> => {
      // ensure งวดเปิดก่อน (idempotent) — depreciate 409 ถ้างวดปิด
      await apiSend("POST", "periods", { year, month });
      const active = assets.filter((a) => a.status === "active");
      const posted: DepreciationLine[] = [];
      const skipped: DepreciationLine[] = [];
      for (const a of active) {
        const r = await apiSend("POST", `assets/${a.id}/depreciate`, {
          period_year: year,
          period_month: month,
        });
        if (r.ok) {
          posted.push({ asset_id: a.id, asset_name: a.name, amount: a.monthly_depreciation ?? 0 });
        } else {
          // 409 = ตั้งค่าเสื่อมงวดนี้แล้ว / คิดครบแล้ว / งวดปิด → ถือเป็น skipped
          skipped.push({ asset_id: a.id, asset_name: a.name, amount: 0 });
        }
      }
      await Promise.all([reloadAssets(), reloadJournal(), reloadPeriods()]);
      const total = posted.reduce((s, p) => s + p.amount, 0);
      return {
        ok: posted.length > 0,
        period_year: year,
        period_month: month,
        posted,
        skipped,
        total_amount: Math.round(total * 100) / 100,
      };
    },
    [apiSend, assets, reloadAssets, reloadJournal, reloadPeriods],
  );

  // ── org settings ───────────────────────────────────────────────────────────
  const updateOrgSettings = useCallback(
    async (patch: Partial<AccOrgSettings>): Promise<MutResult> => {
      const r = await apiSend("PUT", "settings", patch);
      if (r.ok) await reloadSettings();
      return r;
    },
    [apiSend, reloadSettings],
  );

  // ── contacts mutators (front agent) ────────────────────────────────────────
  const addContact = useCallback(
    async (input: ContactInput): Promise<MutResult> => {
      const r = await apiSend("POST", "contacts", input);
      if (r.ok) await reloadContacts();
      return r;
    },
    [apiSend, reloadContacts],
  );
  const updateContact = useCallback(
    async (id: string, input: Partial<ContactInput>): Promise<MutResult> => {
      const r = await apiSend("PATCH", `contacts/${id}`, input);
      if (r.ok) await reloadContacts();
      return r;
    },
    [apiSend, reloadContacts],
  );
  const deleteContact = useCallback(
    async (id: string): Promise<MutResult> => {
      const r = await apiSend("DELETE", `contacts/${id}`);
      if (r.ok) await reloadContacts();
      return r;
    },
    [apiSend, reloadContacts],
  );

  // ── products mutators (front agent) ────────────────────────────────────────
  const addProduct = useCallback(
    async (input: ProductInput): Promise<MutResult> => {
      const r = await apiSend("POST", "products", input);
      if (r.ok) await reloadProducts();
      return r;
    },
    [apiSend, reloadProducts],
  );
  const updateProduct = useCallback(
    async (id: string, input: Partial<ProductInput>): Promise<MutResult> => {
      const r = await apiSend("PATCH", `products/${id}`, input);
      if (r.ok) await reloadProducts();
      return r;
    },
    [apiSend, reloadProducts],
  );
  const deleteProduct = useCallback(
    async (id: string): Promise<MutResult> => {
      const r = await apiSend("DELETE", `products/${id}`);
      if (r.ok) await reloadProducts();
      return r;
    },
    [apiSend, reloadProducts],
  );

  // ── documents mutators (front agent) ───────────────────────────────────────
  const addDocument = useCallback(
    async (body: Record<string, unknown>): Promise<MutResult> => {
      const r = await apiSend("POST", "documents", body);
      if (r.ok) await reloadDocuments();
      return r;
    },
    [apiSend, reloadDocuments],
  );
  const updateDocument = useCallback(
    async (id: string, body: Record<string, unknown>): Promise<MutResult> => {
      const r = await apiSend("PATCH", `documents/${id}`, body);
      if (r.ok) await reloadDocuments();
      return r;
    },
    [apiSend, reloadDocuments],
  );
  const deleteDocument = useCallback(
    async (id: string): Promise<MutResult> => {
      const r = await apiSend("DELETE", `documents/${id}`);
      if (r.ok) await reloadDocuments();
      return r;
    },
    [apiSend, reloadDocuments],
  );
  const convertDocument = useCallback(
    async (id: string, toType: AccDocType): Promise<MutResult> => {
      const r = await apiSend("POST", `documents/${id}/convert`, { toType });
      if (r.ok) await reloadDocuments();
      return r;
    },
    [apiSend, reloadDocuments],
  );

  const value = useMemo<AccountingData>(
    () => ({
      orgId,
      entries,
      journalEntries,
      accounts,
      periods,
      taxFilings,
      assets,
      contacts,
      products,
      documents,
      orgSettings,
      loading,
      reloadEntries,
      reloadJournal,
      reloadAccounts,
      reloadPeriods,
      reloadTaxFilings,
      reloadAssets,
      reloadContacts,
      reloadProducts,
      reloadDocuments,
      reloadSettings,
      apiGetRaw,
      addEntry,
      updateEntry,
      deleteEntry,
      addJournal,
      updateJournal,
      postJournal,
      voidJournal,
      addAccount,
      updateAccount,
      deleteAccount,
      closePeriod,
      reopenPeriod,
      ensurePeriod,
      addTaxFiling,
      updateTaxFiling,
      recomputeTaxFiling,
      markFiled,
      addAsset,
      updateAsset,
      deleteAsset,
      runDepreciation,
      updateOrgSettings,
      addContact,
      updateContact,
      deleteContact,
      addProduct,
      updateProduct,
      deleteProduct,
      addDocument,
      updateDocument,
      deleteDocument,
      convertDocument,
    }),
    [
      orgId,
      entries,
      journalEntries,
      accounts,
      periods,
      taxFilings,
      assets,
      contacts,
      products,
      documents,
      orgSettings,
      loading,
      reloadEntries,
      reloadJournal,
      reloadAccounts,
      reloadPeriods,
      reloadTaxFilings,
      reloadAssets,
      reloadContacts,
      reloadProducts,
      reloadDocuments,
      reloadSettings,
      apiGetRaw,
      addEntry,
      updateEntry,
      deleteEntry,
      addJournal,
      updateJournal,
      postJournal,
      voidJournal,
      addAccount,
      updateAccount,
      deleteAccount,
      closePeriod,
      reopenPeriod,
      ensurePeriod,
      addTaxFiling,
      updateTaxFiling,
      recomputeTaxFiling,
      markFiled,
      addAsset,
      updateAsset,
      deleteAsset,
      runDepreciation,
      updateOrgSettings,
      addContact,
      updateContact,
      deleteContact,
      addProduct,
      updateProduct,
      deleteProduct,
      addDocument,
      updateDocument,
      deleteDocument,
      convertDocument,
    ],
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useAccountingData(): AccountingData {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useAccountingData ต้องใช้ภายใน <AccountingDataProvider>");
  return ctx;
}
