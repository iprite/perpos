"use client";

import React, { useCallback, useMemo, useRef, useState } from "react";
import toast from "react-hot-toast";
import { Button, Input, Textarea } from "rizzui";
import { Title, Text } from "rizzui/typography";
import dayjs from "dayjs";
import { DatePicker } from "@core/ui/datepicker";
import AppSelect from "@core/ui/app-select";
import TablePagination from "@core/components/table/pagination";
import { getCoreRowModel, useReactTable } from "@tanstack/react-table";

import { Modal } from "@core/modal-views/modal";
import TableSearch from "@/components/table/table-search";

import { useAuth } from "@/app/shared/auth-provider";
import { useConfirmDialog } from "@/app/shared/confirm-dialog/provider";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import { buildQuotePdfBytes } from "@/utils/quote-pdf";
import { useSearchParams } from "next/navigation";

import type { SalesFollowupRow, SalesQuoteItemRow, SalesQuoteRow, QuoteStatus } from "./quote-types";
import { quotesListGlobalDueTasks, quoteIsDueRelevant } from "./quote-data";
import { QuoteRemindersModal } from "./_components/quote-reminders-modal";
import { QuoteFollowupModal } from "./_components/quote-followup-modal";

type CustomerOption = {
  id: string;
  name: string;
  tax_id: string | null;
  branch_name: string | null;
  contact_name: string | null;
  phone: string | null;
  email: string | null;
  address: string | null;
};

type ServiceOption = { id: string; name: string; sell_price: number; task_list: string[] | null };

type DraftItem = {
  key: string;
  serviceId: string;
  quantity: string;
  unitPrice: string;
  tasks: string;
};

function tasksFromService(taskList: unknown) {
  const arr = Array.isArray(taskList) ? taskList : [];
  return arr
    .filter((x) => typeof x === "string")
    .map((x) => x.trim())
    .filter((x) => x.length > 0);
}

function tasksTextFromService(taskList: unknown) {
  return tasksFromService(taskList).join("\n");
}

function parseTasksText(text: string) {
  return String(text ?? "")
    .split(/\r?\n/)
    .map((x) => x.trim())
    .filter((x) => x.length > 0);
}

function round2(n: number) {
  return Math.round((Number.isFinite(n) ? n : 0) * 100) / 100;
}

function asMoney(n: number) {
  const x = Number.isFinite(n) ? n : 0;
  return x.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function formatDateDMonYYYY(input: string | Date) {
  const d = typeof input === "string" ? new Date(input) : input;
  if (!(d instanceof Date) || Number.isNaN(d.getTime())) return "-";
  const parts = new Intl.DateTimeFormat("en-US", { day: "numeric", month: "short", year: "numeric" }).formatToParts(d);
  const day = parts.find((p) => p.type === "day")?.value ?? "";
  const month = parts.find((p) => p.type === "month")?.value ?? "";
  const year = parts.find((p) => p.type === "year")?.value ?? "";
  if (!day || !month || !year) return "-";
  return `${day}-${month}-${year}`;
}

function statusLabel(s: QuoteStatus) {
  if (s === "draft") return "ร่าง";
  if (s === "pending_approval") return "รออนุมัติ";
  if (s === "approved") return "อนุมัติแล้ว";
  if (s === "rejected") return "ไม่อนุมัติ";
  if (s === "cancelled") return "ยกเลิก";
  return s;
}

function statusClass(s: QuoteStatus) {
  if (s === "approved") return "bg-green-50 text-green-700 border-green-200";
  if (s === "pending_approval") return "bg-amber-50 text-amber-700 border-amber-200";
  if (s === "rejected") return "bg-red-50 text-red-700 border-red-200";
  if (s === "cancelled") return "bg-gray-100 text-gray-700 border-gray-200";
  return "bg-blue-50 text-blue-700 border-blue-200";
}

function CheckCircle({ checked }: { checked: boolean }) {
  return (
    <span
      aria-hidden
      className={`inline-flex h-6 w-6 items-center justify-center rounded-full border transition-colors ${
        checked ? "border-gray-900 bg-gray-900 text-white" : "border-gray-300 bg-white text-transparent"
      }`}
    >
      <svg width="14" height="14" viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg">
        <path
          d="M16.667 5.833L8.333 14.167L4.167 10"
          stroke="currentColor"
          strokeWidth="2.2"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    </span>
  );
}

function ToggleRateInput(props: {
  label: string;
  checked: boolean;
  onCheckedChange: (next: boolean) => void;
  value: string;
  onValueChange: (next: string) => void;
  disabled?: boolean;
  containerClassName?: string;
  inputClassName?: string;
}) {
  const { label, checked, onCheckedChange, value, onValueChange, disabled, containerClassName, inputClassName } = props;
  const locked = Boolean(disabled);
  return (
    <div className={containerClassName}>
      <div className="mb-1 text-sm font-medium text-gray-700">{label}</div>
      <div className="relative">
        <button
          type="button"
          className="absolute left-3 top-1/2 -translate-y-1/2"
          onClick={() => {
            if (locked) return;
            onCheckedChange(!checked);
          }}
          disabled={locked}
          aria-label={checked ? `ปิด ${label}` : `เปิด ${label}`}
        >
          <CheckCircle checked={checked} />
        </button>
        <input
          className={`h-10 ${inputClassName ?? "w-full"} rounded-md border px-3 pl-12 text-sm outline-none transition-colors ${
            locked || !checked
              ? "border-gray-200 bg-gray-50 text-gray-400"
              : "border-gray-200 bg-white text-gray-900 focus:border-gray-300"
          }`}
          inputMode="decimal"
          value={value}
          onChange={(e) => onValueChange(e.target.value)}
          disabled={locked || !checked}
        />
      </div>
    </div>
  );
}

function DiscountInput(props: {
  mode: "amount" | "percent";
  onModeChange: (next: "amount" | "percent") => void;
  value: string;
  onValueChange: (next: string) => void;
  disabled?: boolean;
  className?: string;
}) {
  const { mode, onModeChange, value, onValueChange, disabled, className } = props;
  const locked = Boolean(disabled);
  const percentOn = mode === "percent";

  return (
    <div className={className}>
      <div className="mb-1 text-sm font-medium text-gray-700">ส่วนลด</div>
      <div
        className={`relative flex h-10 w-full items-center overflow-hidden rounded-md border text-sm !shadow-none ring-0 ring-offset-0 transition-colors focus-within:!shadow-none focus-within:ring-0 focus-within:ring-offset-0 ${
          locked
            ? "!border-gray-200 bg-gray-50 text-gray-400"
            : "!border-gray-200 bg-white text-gray-900 focus-within:!border-gray-200"
        }`}
      >
        <input
          className="h-full w-full border-0 bg-transparent px-3 pr-24 outline-none shadow-none focus:outline-none focus:shadow-none focus-visible:outline-none focus-visible:shadow-none focus:ring-0 focus-visible:ring-0"
          inputMode="decimal"
          value={value}
          onChange={(e) => onValueChange(e.target.value)}
          disabled={locked}
          aria-label={mode === "percent" ? "ส่วนลดเปอร์เซ็นต์" : "ส่วนลดจำนวนเงิน"}
        />

        <div className="absolute right-2 top-1/2 -translate-y-1/2">
          <div
            className={`inline-flex items-center rounded-full p-0.5 text-xs font-semibold ${locked ? "bg-white/60" : "bg-gray-50"}`}
            role="group"
            aria-label="ประเภทส่วนลด"
          >
            <button
              type="button"
              className={`h-7 rounded-full px-2.5 outline-none transition focus:outline-none focus-visible:outline-none focus-visible:ring-0 ${
                !percentOn ? "bg-gray-900 text-white" : "text-gray-700 hover:bg-gray-100"
              }`}
              onClick={() => {
                if (locked) return;
                onModeChange("amount");
              }}
              disabled={locked}
              aria-pressed={!percentOn}
            >
              ฿
            </button>
            <button
              type="button"
              className={`h-7 rounded-full px-2.5 outline-none transition focus:outline-none focus-visible:outline-none focus-visible:ring-0 ${
                percentOn ? "bg-gray-900 text-white" : "text-gray-700 hover:bg-gray-100"
              }`}
              onClick={() => {
                if (locked) return;
                onModeChange("percent");
              }}
              disabled={locked}
              aria-pressed={percentOn}
            >
              %
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function QuotesPage() {
  const { role, userId } = useAuth();
  const supabase = useMemo(() => createSupabaseBrowserClient(), []);
  const topRef = useRef<HTMLDivElement | null>(null);
  const searchParams = useSearchParams();
  const autoOpenQuoteIdRef = useRef<string | null>(null);
  const confirm = useConfirmDialog();

  const canEdit = role === "admin" || role === "sale";
  const canApprove = role === "admin" || role === "sale";

  const [loading, setLoading] = useState(false);
  const [rows, setRows] = useState<SalesQuoteRow[]>([]);
  const [totalRows, setTotalRows] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [pagination, setPagination] = useState({ pageIndex: 0, pageSize: 10 });
  const [search, setSearch] = useState("");

  const [customers, setCustomers] = useState<CustomerOption[]>([]);
  const [services, setServices] = useState<ServiceOption[]>([]);

  const [selected, setSelected] = useState<SalesQuoteRow | null>(null);
  const [detailOpen, setDetailOpen] = useState(false);
  const [selectedItems, setSelectedItems] = useState<SalesQuoteItemRow[]>([]);
  const [selectedFollowups, setSelectedFollowups] = useState<SalesFollowupRow[]>([]);
  
  const [existingOrder, setExistingOrder] = useState<{ id: string; display_id: string | null } | null | undefined>(undefined);

  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [customerId, setCustomerId] = useState("");
  const [validUntil, setValidUntil] = useState("");
  const [discountMode, setDiscountMode] = useState<"amount" | "percent">("amount");
  const [discountValue, setDiscountValue] = useState("0");
  const [notes, setNotes] = useState("");
  const [includeVat, setIncludeVat] = useState(true);
  const [vatRate, setVatRate] = useState("7");
  const [includeWht, setIncludeWht] = useState(true);
  const [whtRate, setWhtRate] = useState("3");
  const [items, setItems] = useState<DraftItem[]>([{ key: "1", serviceId: "", quantity: "1", unitPrice: "", tasks: "" }]);

  const [remindersOpen, setRemindersOpen] = useState(false);
  const [globalTasks, setGlobalTasks] = useState<SalesFollowupRow[]>([]);
  const quoteNoById = useMemo(() => Object.fromEntries(rows.map((r) => [r.id, r.quote_no])), [rows]);

  const [followupOpen, setFollowupOpen] = useState(false);
  const [editingFollowup, setEditingFollowup] = useState<SalesFollowupRow | null>(null);

  const customerOptions = useMemo(() => customers.map((c) => ({ label: c.name, value: c.id })), [customers]);
  const serviceOptions = useMemo(() => services.map((s) => ({ label: s.name, value: s.id })), [services]);
  const serviceById = useMemo(() => new Map(services.map((s) => [s.id, s])), [services]);
  const customerById = useMemo(() => new Map(customers.map((c) => [c.id, c])), [customers]);
  const selectedCustomer = useMemo(() => (customerId ? customerById.get(customerId) ?? null : null), [customerById, customerId]);

  const computed = useMemo(() => {
    const normalized = items
      .map((it, idx) => ({ ...it, sort_order: idx }))
      .filter((it) => it.serviceId.trim().length > 0)
      .map((it) => {
        const svc = serviceById.get(it.serviceId) ?? null;
        const qty = Math.max(0, Math.floor(Number(it.quantity || 0)));
        const unitInput = String(it.unitPrice ?? "").replaceAll(",", "").trim();
        const unitFromInput = unitInput.length ? Number(unitInput) : Number.NaN;
        const fallbackUnit = svc ? Number(svc.sell_price || 0) : 0;
        const unit = Math.max(0, Number.isFinite(unitFromInput) ? unitFromInput : fallbackUnit);
        const lineTotal = round2(unit * qty);
        const task_list = parseTasksText(it.tasks);
        return {
          ...it,
          qty,
          unit,
          lineTotal,
          name: svc?.name ?? "-",
          task_list,
        };
      })
      .filter((it) => it.qty > 0);

    const subtotal = round2(normalized.reduce((sum, x) => sum + x.lineTotal, 0));
    const discountRaw = Number(String(discountValue ?? "0").replaceAll(",", "").trim() || 0);
    const discountTotal =
      discountMode === "percent"
        ? round2((subtotal * Math.max(0, Math.min(100, discountRaw))) / 100)
        : round2(Math.max(0, discountRaw));
    const afterDiscount = round2(Math.max(0, subtotal - discountTotal));
    const vatRateNum = Math.max(0, Number(vatRate || 0));
    const whtRateNum = Math.max(0, Number(whtRate || 0));
    const vatAmount = includeVat ? round2((afterDiscount * vatRateNum) / 100) : 0;
    const whtAmount = includeWht ? round2((afterDiscount * whtRateNum) / 100) : 0;
    const total = round2(Math.max(0, afterDiscount + vatAmount - whtAmount));
    return { normalized, subtotal, discountTotal, afterDiscount, vatRateNum, vatAmount, whtRateNum, whtAmount, total };
  }, [discountMode, discountValue, includeVat, includeWht, items, serviceById, vatRate, whtRate]);

  const resetForm = useCallback(() => {
    setEditingId(null);
    setCustomerId("");
    setValidUntil(dayjs().add(30, "day").format("YYYY-MM-DD"));
    setDiscountMode("amount");
    setDiscountValue("0");
    setNotes("");
    setIncludeVat(true);
    setVatRate("7");
    setIncludeWht(true);
    setWhtRate("3");
    setItems([{ key: "1", serviceId: "", quantity: "1", unitPrice: "", tasks: "" }]);
  }, []);

  const refreshCustomersAndServices = useCallback(() => {
    Promise.resolve().then(async () => {
      try {
        const [{ data: cData }, { data: sData }] = await Promise.all([
          supabase
            .from("customers")
            .select("id,name,tax_id,branch_name,contact_name,phone,email,address")
            .order("created_at", { ascending: false })
            .limit(500),
          supabase.from("services").select("id,name,sell_price,task_list").eq("status", "active").order("name", { ascending: true }),
        ]);
        setCustomers((cData ?? []) as CustomerOption[]);
        setServices((sData ?? []) as ServiceOption[]);
      } catch {
        return;
      }
    });
  }, [supabase]);

  const refresh = useCallback(() => {
    Promise.resolve().then(async () => {
      setLoading(true);
      setError(null);
      try {
        const from = pagination.pageIndex * pagination.pageSize;
        const to = from + pagination.pageSize - 1;
        const q = search.trim();

        let query = supabase
          .from("sales_quotes")
          .select(
            "id,quote_no,customer_id,customer_name,customer_company,customer_email,customer_phone,billing_address,notes,currency,subtotal,discount_total,include_vat,vat_rate,vat_amount,wht_rate,wht_amount,tax_total,grand_total,valid_until,status,created_by_profile_id,approved_by_profile_id,approved_at,pdf_storage_path,created_at,updated_at",
            { count: "estimated" },
          )
          .order("created_at", { ascending: false });

        if (q) {
          const like = `%${q.replaceAll("%", "\\%").replaceAll("_", "\\_")}%`;
          query = query.or([`quote_no.ilike.${like}`, `customer_name.ilike.${like}`].join(","));
        }

        const { data, error: e, count } = await query.range(from, to);
        if (e) {
          setError(e.message);
          setRows([]);
          setTotalRows(0);
          setLoading(false);
          return;
        }
        const list = (data ?? []) as SalesQuoteRow[];
        setRows(list);
        setTotalRows(count ?? 0);
        setSelected((cur) => {
          if (cur) {
            const next = list.find((x) => x.id === cur.id) ?? null;
            if (next) return next;
            if (detailOpen) return cur;
            return list[0] ?? null;
          }
          return list[0] ?? null;
        });
        setLoading(false);
      } catch (e: any) {
        setError(e?.message ?? "โหลดข้อมูลไม่สำเร็จ");
        setRows([]);
        setTotalRows(0);
        setLoading(false);
      }
    });
  }, [detailOpen, pagination.pageIndex, pagination.pageSize, search, supabase]);

  const refreshSelected = useCallback(
    (quoteId: string) => {
      Promise.resolve().then(async () => {
        try {
          const [{ data: it, error: itErr }, { data: fu, error: fuErr }] = await Promise.all([
            supabase
              .from("sales_quote_items")
              .select("id,quote_id,service_id,name,description,task_list,quantity,unit_price,line_total,sort_order,created_at")
              .eq("quote_id", quoteId)
              .order("sort_order", { ascending: true })
              .order("created_at", { ascending: true }),
            supabase
              .from("sales_followups")
              .select("id,quote_id,type,subject,notes,due_at,reminder_at,completed_at,assigned_to_profile_id,created_at,updated_at")
              .eq("quote_id", quoteId)
              .order("created_at", { ascending: false }),
          ]);
          if (!itErr) setSelectedItems((it ?? []) as SalesQuoteItemRow[]);
          if (!fuErr) setSelectedFollowups((fu ?? []) as SalesFollowupRow[]);
        } catch {
          return;
        }
      });
    },
    [supabase],
  );

  const refreshGlobalTasks = useCallback(() => {
    Promise.resolve().then(async () => {
      try {
        const tasks = await quotesListGlobalDueTasks(supabase);
        setGlobalTasks(tasks);
      } catch {
        return;
      }
    });
  }, [supabase]);

  const clearQuoteIdParam = useCallback(() => {
    if (typeof window === "undefined") return;
    try {
      const url = new URL(window.location.href);
      if (!url.searchParams.has("quote_id")) return;
      url.searchParams.delete("quote_id");
      const q = url.searchParams.toString();
      const next = `${url.pathname}${q ? `?${q}` : ""}${url.hash ?? ""}`;
      window.history.replaceState({}, "", next);
    } catch {
      return;
    }
  }, []);

  React.useEffect(() => {
    refreshCustomersAndServices();
  }, [refreshCustomersAndServices]);

  React.useEffect(() => {
    if (!showForm) return;
    setItems((prev) => {
      let changed = false;
      const next = prev.map((x) => {
        if (!x.serviceId || x.tasks.trim().length) return x;
        const svc = serviceById.get(x.serviceId) ?? null;
        if (!svc) return x;
        const def = tasksTextFromService((svc as any).task_list);
        if (!def.trim().length) return x;
        changed = true;
        return { ...x, tasks: def };
      });
      return changed ? next : prev;
    });
  }, [serviceById, showForm]);

  React.useEffect(() => {
    setPagination((p) => ({ ...p, pageIndex: 0 }));
  }, [search]);

  React.useEffect(() => {
    refresh();
  }, [refresh]);

  React.useEffect(() => {
    refreshGlobalTasks();
  }, [refreshGlobalTasks]);

  React.useEffect(() => {
    const target = searchParams.get("quote_id");
    if (!target) return;
    if (autoOpenQuoteIdRef.current === target) return;
    autoOpenQuoteIdRef.current = target;
    clearQuoteIdParam();
    Promise.resolve().then(async () => {
      try {
        setLoading(true);
        setError(null);
        const { data, error: e } = await supabase
          .from("sales_quotes")
          .select(
            "id,quote_no,customer_id,customer_name,customer_company,customer_email,customer_phone,billing_address,notes,currency,subtotal,discount_total,include_vat,vat_rate,vat_amount,wht_rate,wht_amount,tax_total,grand_total,valid_until,status,created_by_profile_id,approved_by_profile_id,approved_at,pdf_storage_path,created_at,updated_at",
          )
          .eq("id", target)
          .single();
        if (e) {
          setError(e.message);
          setLoading(false);
          return;
        }
        setSelected((data ?? null) as SalesQuoteRow | null);
        setDetailOpen(true);
        setLoading(false);
        topRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
      } catch (err: any) {
        setError(err?.message ?? "โหลดใบเสนอราคาไม่สำเร็จ");
        setLoading(false);
      }
    });
  }, [clearQuoteIdParam, searchParams, supabase]);

  React.useEffect(() => {
    if (!selected) return;
    refreshSelected(selected.id);
  }, [refreshSelected, selected]);

  React.useEffect(() => {
    if (!selected) {
      setExistingOrder(null);
      return;
    }
    setExistingOrder(undefined);
    const quoteId = selected.id;
    Promise.resolve().then(async () => {
      try {
        const { data, error: e } = await supabase
          .from("orders")
          .select("id,display_id")
          .eq("source_quote_id", quoteId)
          .maybeSingle();
        if (e) {
          setExistingOrder(undefined);
          return;
        }
        setExistingOrder(data?.id ? { id: data.id, display_id: (data as any).display_id ?? null } : null);
      } catch {
        setExistingOrder(undefined);
      }
    });

  }, [selected, supabase]);

  const deleteSelectedQuote = useCallback(async () => {

    if (!selected) return;
    if (!canEdit) return;
    if (selected.status !== "draft") {
      setError("ลบได้เฉพาะใบเสนอราคาสถานะร่างเท่านั้น");
      return;
    }
    if (existingOrder === undefined) {
      setError("กำลังตรวจสอบความเชื่อมโยงกับออเดอร์ กรุณาลองใหม่อีกครั้ง");
      return;
    }
    if (existingOrder) {
      setError("ลบไม่ได้: ใบเสนอราคานี้ถูก link กับออเดอร์แล้ว");
      return;
    }
    const ok = await confirm({
      title: "ยืนยันการลบใบเสนอราคา",
      message: (
        <div>
          ต้องการลบใบเสนอราคา <span className="font-semibold text-gray-900">{selected.quote_no}</span> ใช่หรือไม่
        </div>
      ),
      confirmText: "ลบ",
      cancelText: "ยกเลิก",
      tone: "danger",
    });
    if (!ok) return;
    setLoading(true);
    setError(null);
    try {
      const { error: delErr } = await supabase.from("sales_quotes").delete().eq("id", selected.id);
      if (delErr) {
        const msg = String(delErr.message ?? "ลบไม่สำเร็จ");
        if (msg.toLowerCase().includes("violates foreign key constraint") || msg.toLowerCase().includes("foreign key")) {
          setError("ลบไม่ได้: ใบเสนอราคานี้ถูก link กับออเดอร์แล้ว");
        } else {
          setError(msg);
        }
        setLoading(false);
        return;
      }
      setDetailOpen(false);
      setSelected(null);
      setSelectedItems([]);
      setSelectedFollowups([]);
      setExistingOrder(null);
      setLoading(false);
      refresh();
    } catch (e: any) {
      setError(e?.message ?? "ลบไม่สำเร็จ");
      setLoading(false);
    }
  }, [canEdit, confirm, existingOrder, refresh, selected, supabase]);

  const table = useReactTable({
    data: rows,
    columns: useMemo(() => [{ accessorKey: "id" }], []),
    state: { pagination },
    onPaginationChange: setPagination,
    manualPagination: true,
    pageCount: Math.max(1, Math.ceil(totalRows / Math.max(1, pagination.pageSize))),
    getCoreRowModel: getCoreRowModel(),
  });

  const openEdit = useCallback(
    (q: SalesQuoteRow) => {
      setEditingId(q.id);
      setCustomerId(q.customer_id ?? "");
      setValidUntil(q.valid_until ?? "");
      setDiscountMode("amount");
      setDiscountValue(String(q.discount_total ?? 0));
      setNotes(q.notes ?? "");
      setIncludeVat(Boolean(q.include_vat));
      setVatRate(String(q.vat_rate ?? 7));
      const whtOn = Number(q.wht_rate ?? 0) > 0;
      setIncludeWht(whtOn);
      setWhtRate(whtOn ? String(q.wht_rate ?? 3) : "3");
      setItems([{ key: "seed", serviceId: "", quantity: "1", unitPrice: "", tasks: "" }]);
      Promise.resolve().then(async () => {
        const { data } = await supabase
          .from("sales_quote_items")
          .select("id,service_id,quantity,unit_price,description,task_list")
          .eq("quote_id", q.id)
          .order("sort_order", { ascending: true })
          .order("created_at", { ascending: true });
        const mapped = ((data ?? []) as any[])
          .map((x) => {
            const taskList = (x as any).task_list;
            const desc = String((x as any).description ?? "");
            const tasksText = Array.isArray(taskList) ? tasksFromService(taskList).join("\n") : desc;
            return {
              key: String((x as any).id),
              serviceId: String((x as any).service_id ?? ""),
              quantity: String((x as any).quantity ?? 1),
              unitPrice: String((x as any).unit_price ?? ""),
              tasks: tasksText,
            };
          })
          .filter((x) => x.serviceId.length > 0);
        setItems(mapped.length ? mapped : [{ key: "1", serviceId: "", quantity: "1", unitPrice: "", tasks: "" }]);
      });
      setShowForm(true);
      window.setTimeout(() => {
        topRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
      }, 0);
    },
    [supabase],
  );

  const openCreate = useCallback(() => {
    resetForm();
    setShowForm(true);
  }, [resetForm]);

  const saveQuote = useCallback(async () => {
    if (!canEdit) return;
    const cust = customerById.get(customerId) ?? null;
    if (!cust) {
      setError("กรุณาเลือกลูกค้า");
      return;
    }
    if (computed.normalized.length === 0) {
      setError("กรุณาเพิ่มอย่างน้อย 1 รายการ");
      return;
    }

    const quotePayload = {
      customer_id: cust.id,
      customer_name: cust.name,
      customer_company: cust.branch_name || null,
      customer_email: cust.email,
      customer_phone: cust.phone,
      billing_address: cust.address,
      notes: notes.trim() || null,
      currency: "THB",
      subtotal: computed.subtotal,
      discount_total: computed.discountTotal,
      include_vat: includeVat,
      vat_rate: includeVat ? computed.vatRateNum : 0,
      vat_amount: computed.vatAmount,
      wht_rate: includeWht ? computed.whtRateNum : 0,
      wht_amount: includeWht ? computed.whtAmount : 0,
      tax_total: computed.vatAmount,
      grand_total: computed.total,
      valid_until: validUntil.trim() || null,
      status: (editingId ? undefined : "draft") as any,
      created_by_profile_id: userId,
      updated_at: new Date().toISOString(),
    };

    const quoteItemsPayload = computed.normalized.map((x, idx) => ({
      service_id: x.serviceId,
      name: x.name,
      description: null,
      task_list: x.task_list,
      quantity: x.qty,
      unit_price: x.unit,
      line_total: x.lineTotal,
      sort_order: idx,
    }));

    setLoading(true);
    setError(null);
    try {
      if (editingId) {
        const { error: upErr } = await supabase
          .from("sales_quotes")
          .update({
            customer_id: cust.id,
            customer_name: cust.name,
            customer_company: cust.branch_name || null,
            customer_email: cust.email,
            customer_phone: cust.phone,
            billing_address: cust.address,
            notes: notes.trim() || null,
            currency: "THB",
            subtotal: computed.subtotal,
            discount_total: computed.discountTotal,
            include_vat: includeVat,
            vat_rate: computed.vatRateNum,
            vat_amount: computed.vatAmount,
            wht_rate: computed.whtRateNum,
            wht_amount: computed.whtAmount,
            tax_total: computed.vatAmount,
            grand_total: computed.total,
            valid_until: validUntil.trim() || null,
            updated_at: new Date().toISOString(),
          })
          .eq("id", editingId);
        if (upErr) {
          setError(upErr.message);
          setLoading(false);
          return;
        }
        await supabase.from("sales_quote_items").delete().eq("quote_id", editingId);
        const { error: insItemsErr } = await supabase
          .from("sales_quote_items")
          .insert(quoteItemsPayload.map((x) => ({ ...x, quote_id: editingId })));
        if (insItemsErr) {
          setError(insItemsErr.message);
          setLoading(false);
          return;
        }
      } else {
        const { data: created, error: insErr } = await supabase
          .from("sales_quotes")
          .insert({ ...quotePayload, quote_no: null })
          .select("id,quote_no")
          .single();
        if (insErr || !created?.id) {
          setError(insErr?.message ?? "สร้างใบเสนอราคาไม่สำเร็จ");
          setLoading(false);
          return;
        }
        const quoteId = (created as any).id as string;
        const { error: insItemsErr } = await supabase
          .from("sales_quote_items")
          .insert(quoteItemsPayload.map((x) => ({ ...x, quote_id: quoteId })));
        if (insItemsErr) {
          setError(insItemsErr.message);
          setLoading(false);
          return;
        }
      }
      resetForm();
      setShowForm(false);
      setLoading(false);
      await refresh();
    } catch (e: any) {
      setError(e?.message ?? "บันทึกไม่สำเร็จ");
      setLoading(false);
    }
  }, [canEdit, computed.discountTotal, computed.normalized, computed.subtotal, computed.total, computed.vatAmount, computed.vatRateNum, computed.whtAmount, computed.whtRateNum, customerById, customerId, editingId, includeVat, includeWht, notes, refresh, resetForm, supabase, userId, validUntil]);

  const sendEmployerLineUpdate = useCallback(
    async (kind: "quote" | "order", id: string) => {
      const sessionRes = await supabase.auth.getSession();
      const token = sessionRes.data.session?.access_token;
      if (!token) throw new Error("ยังไม่ได้เข้าสู่ระบบ");
      const res = await fetch("/api/line/employer/send", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ kind, id }),
      });
      const data = (await res.json().catch(() => ({}))) as any;
      if (!res.ok) {
        const msg = String(data.error ?? "ส่งไม่สำเร็จ");
        if (msg.toLowerCase().includes("not connected")) {
          toast("นายจ้างยังไม่เชื่อมต่อ LINE");
          return;
        }
        throw new Error(msg);
      }
      toast.success("ส่งอัปเดต LINE แล้ว");
    },
    [supabase],
  );

  const sendForApproval = useCallback(async () => {
    if (!selected) return;
    if (!canEdit) return;
    if (selected.status !== "draft") return;
    setLoading(true);
    setError(null);
    const now = new Date().toISOString();
    const selectedId = selected.id;
    const { error: e } = await supabase
      .from("sales_quotes")
      .update({ status: "pending_approval", updated_at: now })
      .eq("id", selectedId);
    if (e) {
      setError(e.message);
      setLoading(false);
      return;
    }
    setRows((rs) => rs.map((r) => (r.id === selectedId ? { ...r, status: "pending_approval", updated_at: now } : r)));
    setSelected((s) => (s && s.id === selectedId ? { ...s, status: "pending_approval", updated_at: now } : s));
    setLoading(false);
    refresh();

    try {
      await sendEmployerLineUpdate("quote", selectedId);
    } catch {
    }
  }, [canEdit, refresh, selected, sendEmployerLineUpdate, supabase]);

  const approveOrReject = useCallback(
    async (next: "approved" | "rejected") => {
      if (!selected) return;
      if (!canApprove) return;
      if (selected.status !== "pending_approval") return;
      setLoading(true);
      setError(null);
      const now = new Date().toISOString();
      const selectedId = selected.id;
      const { error: e } = await supabase
        .from("sales_quotes")
        .update({
          status: next,
          approved_by_profile_id: userId,
          approved_at: now,
          updated_at: now,
        })
        .eq("id", selectedId);
      if (e) {
        setError(e.message);
        setLoading(false);
        return;
      }
      setRows((rs) =>
        rs.map((r) =>
          r.id === selectedId
            ? { ...r, status: next, approved_by_profile_id: userId, approved_at: now, updated_at: now }
            : r,
        ),
      );
      setSelected((s) =>
        s && s.id === selectedId ? { ...s, status: next, approved_by_profile_id: userId, approved_at: now, updated_at: now } : s,
      );
      setLoading(false);
      refresh();

      try {
        await sendEmployerLineUpdate("quote", selectedId);
      } catch {
      }
    },
    [canApprove, refresh, selected, sendEmployerLineUpdate, supabase, userId],
  );

  const downloadPdf = useCallback(async () => {
    if (!selected) return;
    setLoading(true);
    setError(null);
    try {
      const serviceTasksById = new Map(
        services.map((s) => [
          s.id,
          Array.isArray(s.task_list) ? s.task_list.filter((x) => typeof x === "string" && x.trim().length) : [],
        ]),
      );
      const itemsWithTasks = selectedItems.map((it) => {
        const perQuoteTasks = Array.isArray((it as any).task_list)
          ? ((it as any).task_list as unknown[]).filter((x) => typeof x === "string" && x.trim().length).map((x) => String(x).trim())
          : [];
        const fallbackTasks = it.service_id ? (serviceTasksById.get(it.service_id) ?? []) : [];
        return {
          ...it,
          task_list: perQuoteTasks.length ? perQuoteTasks : fallbackTasks,
        };
      });
      const cust = selected.customer_id ? (customerById.get(selected.customer_id) ?? null) : null;
      const bytes = await buildQuotePdfBytes({
        quote: selected,
        items: itemsWithTasks,
        customer: cust
          ? {
              tax_id: cust.tax_id,
              branch_name: cust.branch_name,
              address: cust.address,
              contact_name: cust.contact_name,
            }
          : null,
        preparedByProfileId: userId,
      });
      const blob = new Blob([bytes], { type: "application/pdf" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${selected.quote_no}.pdf`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      setLoading(false);
    } catch (e: any) {
      setError(e?.message ?? "ดาวน์โหลด PDF ไม่สำเร็จ");
      setLoading(false);
    }
  }, [customerById, selected, selectedItems, services, userId]);

  const createOrderFromQuote = useCallback(async () => {
    if (!selected) return;
    if (selected.status !== "approved") return;
    if (!selected.customer_id) {
      setError("ใบเสนอราคานี้ไม่มี customer_id (กรุณาแก้ไขใบเสนอราคาแล้วเลือก 'ลูกค้า')");
      return;
    }
    if (selectedItems.length === 0) {
      setError("ใบเสนอราคาไม่มีรายการ");
      return;
    }

    setLoading(true);
    setError(null);
    try {
      const { data: exist } = await supabase.from("orders").select("id,display_id").eq("source_quote_id", selected.id).maybeSingle();
      if (exist?.id) {
        setExistingOrder({ id: exist.id, display_id: (exist as any).display_id ?? null });
        setError("มีออเดอร์จากใบเสนอราคานี้แล้ว");
        setLoading(false);
        return;
      }

      const orderPayload = {
        customer_id: selected.customer_id,
        status: "draft",
        subtotal: Number(selected.subtotal ?? 0),
        discount: Number(selected.discount_total ?? 0),
        include_vat: Boolean(selected.include_vat),
        vat_rate: Number(selected.vat_rate ?? 0),
        vat_amount: Number(selected.vat_amount ?? 0),
        wht_rate: Number(selected.wht_rate ?? 3),
        wht_amount: Number(selected.wht_amount ?? 0),
        total: Number(selected.grand_total ?? 0),
        created_by_profile_id: userId,
        source_quote_id: selected.id,
      };

      const { data: created, error: insErr } = await supabase.from("orders").insert(orderPayload).select("id,display_id").single();
      if (insErr || !created?.id) {
        setError(insErr?.message ?? "สร้างออเดอร์ไม่สำเร็จ");
        setLoading(false);
        return;
      }
      const orderId = (created as any).id as string;
      const orderItems = selectedItems
        .filter((it) => it.service_id)
        .map((it) => ({
          order_id: orderId,
          service_id: it.service_id,
          description: it.description,
          quantity: Number(it.quantity ?? 1),
          unit_price: Number(it.unit_price ?? 0),
          line_total: Number(it.line_total ?? 0),
        }));
      if (orderItems.length === 0) {
        setError("รายการใบเสนอราคาไม่มี service_id จึงสร้างออเดอร์ไม่ได้");
        setLoading(false);
        return;
      }
      const { error: itErr } = await supabase.from("order_items").insert(orderItems);
      if (itErr) {
        setError(itErr.message);
        setLoading(false);
        return;
      }

      const sessionRes = await supabase.auth.getSession();
      const token = sessionRes.data.session?.access_token;
      if (token) {
        await fetch("/api/notifications/line/order-created", {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
          body: JSON.stringify({ orderId }),
        }).catch(() => null);
      }

      setExistingOrder({ id: orderId, display_id: (created as any).display_id ?? null });
      setLoading(false);
    } catch (e: any) {
      setError(e?.message ?? "สร้างออเดอร์ไม่สำเร็จ");
      setLoading(false);
    }
  }, [selected, selectedItems, supabase, userId]);

  const saveFollowup = useCallback(
    async (payload: { id?: string; type: any; subject: string; notes: string | null; due_at: string | null; reminder_at: string | null }) => {
      if (!selected) return;
      if (!canEdit) return;
      const base = {
        quote_id: selected.id,
        type: payload.type,
        subject: payload.subject,
        notes: payload.notes,
        due_at: payload.due_at,
        reminder_at: payload.reminder_at,
        updated_at: new Date().toISOString(),
      };
      if (payload.id) {
        await supabase.from("sales_followups").update(base).eq("id", payload.id);
      } else {
        await supabase.from("sales_followups").insert({ ...base, created_at: new Date().toISOString() });
      }
      refreshSelected(selected.id);
      refreshGlobalTasks();
    },
    [canEdit, refreshGlobalTasks, refreshSelected, selected, supabase],
  );

  const markComplete = useCallback(
    async (id: string) => {
      if (!canEdit) return;
      await supabase.from("sales_followups").update({ completed_at: new Date().toISOString(), updated_at: new Date().toISOString() }).eq("id", id);
      if (selected) refreshSelected(selected.id);
      refreshGlobalTasks();
    },
    [canEdit, refreshGlobalTasks, refreshSelected, selected, supabase],
  );

  const openQuoteFromReminder = useCallback(
    (quoteId: string) => {
      const found = rows.find((r) => r.id === quoteId) ?? null;
      if (found) {
        setSelected(found);
        setDetailOpen(true);
      }
    },
    [rows],
  );

  const canSave = !!customerId && computed.normalized.length > 0;
  const canEditSelected = selected ? selected.status === "draft" || selected.status === "pending_approval" : false;

  return (
    <div ref={topRef}>
      <div className="flex flex-col justify-between gap-3 md:flex-row md:items-end">
        {detailOpen && selected ? (
          <div className="flex w-full flex-col justify-between gap-3 md:flex-row md:items-start">
            <div>
              <div className="text-xs font-medium text-gray-500">จัดการใบเสนอราคา / {selected.quote_no}</div>
              <Title as="h1" className="mt-1 text-xl font-semibold text-gray-900">
                ใบเสนอราคา {selected.quote_no}
              </Title>
              <Text className="mt-1 text-sm text-gray-600">ข้อมูลรายละเอียดในใบเสนอราคา</Text>
            </div>
            <div className="flex flex-wrap items-center justify-end gap-2">
              {canEdit && canEditSelected ? (
                <Button size="sm" variant="outline" disabled={loading} onClick={() => openEdit(selected)}>
                  แก้ไข
                </Button>
              ) : null}
              {canEdit && selected.status === "draft" && existingOrder === null ? (
                <Button size="sm" variant="outline" disabled={loading} onClick={deleteSelectedQuote}>
                  ลบ
                </Button>
              ) : null}
              {canEdit && selected.status === "draft" ? (
                <Button size="sm" variant="outline" disabled={loading} onClick={sendForApproval}>
                  ส่งขออนุมัติ
                </Button>
              ) : null}
              {canApprove && selected.status === "pending_approval" ? (
                <Button size="sm" disabled={loading} onClick={() => approveOrReject("approved")}>
                  อนุมัติ
                </Button>
              ) : null}
              {canApprove && selected.status === "pending_approval" ? (
                <Button size="sm" variant="outline" disabled={loading} onClick={() => approveOrReject("rejected")}>
                  ไม่อนุมัติ
                </Button>
              ) : null}
              {role === "admin" || role === "sale" ? (
                <Button
                  size="sm"
                  variant="outline"
                  disabled={loading}
                  onClick={async () => {
                    try {
                      setLoading(true);
                      await sendEmployerLineUpdate("quote", selected.id);
                    } catch (e: any) {
                      toast.error(e?.message ?? "ส่งไม่สำเร็จ");
                    } finally {
                      setLoading(false);
                    }
                  }}
                >
                  ส่งอัปเดต LINE
                </Button>
              ) : null}
              <Button size="sm" variant="outline" disabled={loading} onClick={downloadPdf}>
                ดาวน์โหลด PDF
              </Button>
              {existingOrder ? (
                <Button
                  size="sm"
                  variant="outline"
                  disabled={loading}
                  onClick={() => (window.location.href = `/orders?order_id=${existingOrder.id}`)}
                >
                  ออเดอร์ {existingOrder.display_id ?? ""}
                </Button>
              ) : null}
              {selected.status === "approved" && existingOrder === null ? (
                <Button size="sm" variant="outline" disabled={loading} onClick={createOrderFromQuote}>
                  สร้างออเดอร์
                </Button>
              ) : null}
              <Button
                size="sm"
                variant="outline"
                onClick={() => {
                  clearQuoteIdParam();
                  setDetailOpen(false);
                }}
                disabled={loading}
              >
                ปิด
              </Button>
            </div>
          </div>
        ) : (
          <>
            <div>
              <Title as="h1" className="text-lg font-semibold text-gray-900">
                ใบเสนอราคา
              </Title>
              <Text className="mt-1 text-sm text-gray-600">ข้อมูลรายละเอียดในใบเสนอราคา</Text>
            </div>
            <div className="flex flex-wrap gap-2">
              <TableSearch value={search} onChange={setSearch} />
              <Button
                variant="outline"
                onClick={() => {
                  refreshGlobalTasks();
                  setRemindersOpen(true);
                }}
                disabled={loading}
              >
                งานเตือน {globalTasks.filter(quoteIsDueRelevant).length > 0 ? `(${globalTasks.filter(quoteIsDueRelevant).length})` : ""}
              </Button>
              {canEdit ? (
                <Button variant="outline" onClick={openCreate} disabled={loading}>
                  สร้างใบเสนอราคา
                </Button>
              ) : null}
            </div>
          </>
        )}
      </div>

      <Modal isOpen={showForm && canEdit} onClose={() => setShowForm(false)} size="lg" rounded="md">
        <div className="border-b border-gray-200 px-5 py-4">
          <div className="text-sm font-semibold text-gray-900">{editingId ? "แก้ไขใบเสนอราคา" : "สร้างใบเสนอราคา"}</div>
        </div>
        <div className="grid gap-3 px-5 py-4">
          <div className="grid gap-3 md:grid-cols-10">
            <div className="md:col-span-7">
              <AppSelect
                label="ลูกค้า"
                placeholder="เลือก"
                options={customerOptions}
                value={customerId}
                onChange={(v: string) => setCustomerId(v)}
                getOptionValue={(o) => o.value}
                displayValue={(selected) => customerOptions.find((o) => o.value === selected)?.label ?? ""}
                inPortal={false}
              />
            </div>
            <div className="md:col-span-3">
              <DatePicker
                selected={validUntil ? dayjs(validUntil).toDate() : null}
                onChange={(date: Date | null) => setValidUntil(date ? dayjs(date).format("YYYY-MM-DD") : "")}
                dateFormat="dd/MM/yyyy"
                placeholderText="เลือกวันที่"
                disabled={loading}
                inputProps={{ label: "ใช้ได้ถึง" }}
              />
            </div>
          </div>

          {selectedCustomer ? (
            <div className="rounded-lg border border-gray-200 bg-white p-3">
              <div className="text-sm font-semibold text-gray-900">ข้อมูลลูกค้า</div>
              <div className="mt-2 grid gap-2 md:grid-cols-2">
                <div>
                  <div className="text-xs font-medium text-gray-600">เลขที่ภาษี</div>
                  <div className="mt-0.5 text-sm text-gray-900">{selectedCustomer.tax_id || "-"}</div>
                </div>
                <div>
                  <div className="text-xs font-medium text-gray-600">สาขา</div>
                  <div className="mt-0.5 text-sm text-gray-900">{selectedCustomer.branch_name || "-"}</div>
                </div>
                <div className="md:col-span-2">
                  <div className="text-xs font-medium text-gray-600">ที่อยู่</div>
                  <div className="mt-0.5 whitespace-pre-line text-sm text-gray-900">{selectedCustomer.address || "-"}</div>
                </div>
                <div className="md:col-span-2">
                  <div className="text-xs font-medium text-gray-600">ชื่อผู้ติดต่อ</div>
                  <div className="mt-0.5 text-sm text-gray-900">{selectedCustomer.contact_name || "-"}</div>
                </div>
              </div>
            </div>
          ) : null}

          <div className="flex flex-col gap-3 md:flex-row md:items-end">
            <ToggleRateInput
              label="VAT (%)"
              checked={includeVat}
              onCheckedChange={(next) => {
                setIncludeVat(next);
                if (next && (!vatRate || vatRate === "0")) setVatRate("7");
              }}
              value={vatRate}
              onValueChange={setVatRate}
              disabled={loading}
              containerClassName="md:w-[100px]"
              inputClassName="w-full"
            />
            <ToggleRateInput
              label="หัก ณ ที่จ่าย (%)"
              checked={includeWht}
              onCheckedChange={(next) => {
                setIncludeWht(next);
                if (next && (!whtRate || whtRate === "0")) setWhtRate("3");
              }}
              value={whtRate}
              onValueChange={setWhtRate}
              disabled={loading}
              containerClassName="md:w-[100px]"
              inputClassName="w-full"
            />
            <DiscountInput
              mode={discountMode}
              onModeChange={setDiscountMode}
              value={discountValue}
              onValueChange={setDiscountValue}
              disabled={loading}
              className="md:flex-1"
            />
          </div>

            <div className="rounded-lg border border-gray-200 overflow-hidden">
            <div className="flex items-center justify-between border-b border-gray-200 bg-gray-50 px-3 py-2">
              <div className="text-sm font-semibold text-gray-900">รายการบริการ</div>
              <Button
                variant="outline"
                onClick={() => {
                  setItems((prev) => [...prev, { key: String(Date.now()), serviceId: "", quantity: "1", unitPrice: "", tasks: "" }]);
                }}
                disabled={loading}
              >
                เพิ่มบริการ
              </Button>
            </div>

            <div className="grid grid-cols-[1.2fr_0.35fr_0.45fr_0.45fr_40px] gap-2 px-3 py-2 text-xs font-semibold text-gray-600">
              <div>บริการ</div>
              <div className="text-center">จำนวน</div>
              <div className="text-right">ราคาต่อหน่วย</div>
              <div className="text-right">รวม</div>
              <div />
            </div>

            {items.map((it) => {
              const svc = it.serviceId ? serviceById.get(it.serviceId) ?? null : null;
              const qty = Math.max(0, Math.floor(Number(it.quantity || 0)));
              const unitInput = String(it.unitPrice ?? "").replaceAll(",", "").trim();
              const unitFromInput = unitInput.length ? Number(unitInput) : Number.NaN;
              const fallbackUnit = svc ? Number(svc.sell_price || 0) : 0;
              const unit = Math.max(0, Number.isFinite(unitFromInput) ? unitFromInput : fallbackUnit);
              const lineTotal = round2(unit * qty);
              const svcTasksText = svc ? tasksTextFromService((svc as any).task_list) : "";

              return (
                <div key={it.key} className="border-t border-gray-100 px-3 py-2">
                  <div className="grid grid-cols-[1.2fr_0.35fr_0.45fr_0.45fr_40px] items-center gap-2">
                    <div>
                      <AppSelect
                        placeholder="เลือก"
                        options={serviceOptions}
                        value={it.serviceId}
                        onChange={(v: string) => {
                          setItems((prev) =>
                            prev.map((x) => {
                              if (x.key !== it.key) return x;
                              const prevSvc = x.serviceId ? (serviceById.get(x.serviceId) ?? null) : null;
                              const prevDefault = prevSvc ? tasksTextFromService((prevSvc as any).task_list) : "";
                              const nextSvc = v ? (serviceById.get(v) ?? null) : null;
                              const nextDefault = nextSvc ? tasksTextFromService((nextSvc as any).task_list) : "";
                              const shouldReplaceTasks = x.tasks.trim().length === 0 || x.tasks.trim() === prevDefault.trim();
                              const prevUnitDefault = prevSvc ? String(prevSvc.sell_price ?? 0) : "";
                              const nextUnitDefault = nextSvc ? String(nextSvc.sell_price ?? 0) : "";
                              const shouldReplaceUnit = x.unitPrice.trim().length === 0 || x.unitPrice.trim() === prevUnitDefault.trim();
                              return {
                                ...x,
                                serviceId: v,
                                unitPrice: shouldReplaceUnit ? nextUnitDefault : x.unitPrice,
                                tasks: shouldReplaceTasks ? nextDefault : x.tasks,
                              };
                            }),
                          );
                        }}
                        getOptionValue={(o) => o.value}
                        displayValue={(selected) => serviceOptions.find((o) => o.value === selected)?.label ?? ""}
                        selectClassName="h-10 px-3"
                        inPortal={false}
                      />
                    </div>
                    <div className="text-center">
                      <input
                        className="h-10 w-full rounded-md border border-gray-200 bg-white px-3 text-center text-sm"
                        inputMode="numeric"
                        value={it.quantity}
                        onChange={(e) => {
                          const v = e.target.value;
                          setItems((prev) => prev.map((x) => (x.key === it.key ? { ...x, quantity: v } : x)));
                        }}
                        disabled={loading}
                      />
                    </div>
                    <div className="text-right">
                      <input
                        className={`h-10 w-full rounded-md border px-3 text-right text-sm outline-none transition-colors ${
                          loading || !svc
                            ? "border-gray-200 bg-gray-50 text-gray-400"
                            : "border-gray-200 bg-white text-gray-900 focus:border-gray-300"
                        }`}
                        inputMode="decimal"
                        value={it.unitPrice}
                        onChange={(e) => {
                          const v = e.target.value;
                          setItems((prev) => prev.map((x) => (x.key === it.key ? { ...x, unitPrice: v } : x)));
                        }}
                        disabled={loading || !svc}
                        aria-label="ราคาต่อหน่วย"
                      />
                    </div>
                    <div className="text-right text-sm font-medium text-gray-900">{svc && qty > 0 ? asMoney(lineTotal) : "-"}</div>
                    <div className="text-right">
                      <button
                        type="button"
                        className="h-8 w-8 rounded-md border border-gray-200 text-gray-600 hover:bg-gray-100"
                        onClick={() => {
                          setItems((prev) => {
                            const next = prev.filter((x) => x.key !== it.key);
                            return next.length ? next : [{ key: "1", serviceId: "", quantity: "1", unitPrice: "", tasks: "" }];
                          });
                        }}
                        disabled={loading}
                        aria-label="ลบบรรทัดบริการ"
                      >
                        ×
                      </button>
                    </div>
                  </div>
                  {it.serviceId ? (
                    <div className="mt-2">
                      <Textarea
                        label="งานย่อย (แก้ไขเฉพาะใบเสนอราคานี้ได้)"
                        value={it.tasks}
                        onChange={(e) => {
                          const v = e.target.value;
                          setItems((prev) => prev.map((x) => (x.key === it.key ? { ...x, tasks: v } : x)));
                        }}
                        rows={Math.max(3, Math.min(8, (it.tasks || svcTasksText || "").split(/\r?\n/).length + 1))}
                        placeholder={svcTasksText ? "ดึงจาก Service มาให้อัตโนมัติ" : "พิมพ์งานย่อยเป็นบรรทัด ๆ"}
                        disabled={loading}
                      />
                    </div>
                  ) : null}
                </div>
              );
            })}

            <div className="border-t border-gray-200 bg-gray-50 px-3 py-3">
              <div className="grid gap-2 md:ml-auto md:max-w-md">
                <div className="flex items-center justify-between text-sm">
                  <div className="text-gray-600">ยอดรวมก่อนส่วนลด</div>
                  <div className="font-medium text-gray-900">{asMoney(computed.subtotal)}</div>
                </div>
                <div className="flex items-center justify-between text-sm">
                  <div className="text-gray-600">ส่วนลด</div>
                  <div className="font-medium text-gray-900">{asMoney(computed.discountTotal)}</div>
                </div>
                <div className="flex items-center justify-between text-sm">
                  <div className="text-gray-600">ยอดหลังส่วนลด</div>
                  <div className="font-medium text-gray-900">{asMoney(computed.afterDiscount)}</div>
                </div>
                {includeVat ? (
                  <div className="flex items-center justify-between text-sm">
                    <div className="text-gray-600">VAT ({computed.vatRateNum}%)</div>
                    <div className="font-medium text-gray-900">{asMoney(computed.vatAmount)}</div>
                  </div>
                ) : null}
                {includeWht ? (
                  <div className="flex items-center justify-between text-sm">
                    <div className="text-gray-600">หัก ณ ที่จ่าย ({computed.whtRateNum}%)</div>
                    <div className="font-medium text-gray-900">-{asMoney(computed.whtAmount)}</div>
                  </div>
                ) : null}
                <div className="flex items-center justify-between text-sm">
                  <div className="text-gray-600">ยอดสุทธิ</div>
                  <div className="text-base font-semibold text-gray-900">{asMoney(computed.total)}</div>
                </div>
              </div>
            </div>
          </div>

          <Textarea
            label="หมายเหตุ"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            rows={3}
            placeholder="พิมพ์หมายเหตุที่จะแสดงในใบเสนอราคา"
            disabled={loading}
          />
        </div>
        <div className="flex flex-wrap justify-end gap-2 border-t border-gray-200 px-5 py-4">
          <Button
            variant="outline"
            onClick={() => {
              resetForm();
              setShowForm(false);
            }}
            disabled={loading}
          >
            ยกเลิก
          </Button>
          <Button onClick={saveQuote} disabled={loading || !canSave}>
            {editingId ? "อัปเดต" : "บันทึก"}
          </Button>
        </div>
      </Modal>

      <QuoteRemindersModal
        open={remindersOpen}
        onClose={() => setRemindersOpen(false)}
        tasks={globalTasks.filter(quoteIsDueRelevant)}
        quoteNoById={quoteNoById}
        onOpenQuote={openQuoteFromReminder}
      />

      <QuoteFollowupModal
        open={followupOpen}
        onClose={() => setFollowupOpen(false)}
        canEdit={canEdit}
        editing={editingFollowup}
        onSave={saveFollowup}
      />

      {error ? <div className="mt-4 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">{error}</div> : null}

      {detailOpen && selected && (
        <div className="mt-4">
          <div className="mt-3 space-y-3">
            <div className="grid gap-3 lg:grid-cols-12">
              <div className="space-y-3 lg:col-span-5">
                <div className="rounded-xl border border-gray-200 bg-white p-4">
                  <div className="text-sm font-semibold text-gray-900">ข้อมูลลูกค้า</div>
                  <div className="mt-2 grid gap-1 text-sm text-gray-700">
                    <div>{selected.customer_name}</div>
                    <div>{selected.customer_company ? `บริษัท/สาขา: ${selected.customer_company}` : null}</div>
                    <div className="flex gap-4">
                      <div>{selected.customer_phone ? `โทร: ${selected.customer_phone}` : null}</div>
                      <div>{selected.customer_email ? `อีเมล: ${selected.customer_email}` : null}</div>
                    </div>
                    <div>{selected.billing_address ? `ที่อยู่: ${selected.billing_address}` : null}</div>
                  </div>

                  <div className="mt-4 text-sm font-semibold text-gray-900">การอนุมัติ</div>
                  <div className="mt-2 text-sm text-gray-700">
                    {selected.status === "approved" && selected.approved_at ? (
                      <div className="flex flex-wrap items-center gap-2">
                        <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-semibold ${statusClass(selected.status)}`}>
                          {statusLabel(selected.status)}
                        </span>
                        <span className="inline-flex items-center rounded-full border border-gray-200 bg-gray-100 px-2 py-0.5 text-xs font-semibold text-gray-700">
                          {formatDateDMonYYYY(selected.approved_at)}
                        </span>
                      </div>
                    ) : null}
                    {selected.status === "pending_approval" ? "รอการอนุมัติ" : null}
                    {selected.status === "rejected" ? (
                      <div className="flex flex-wrap items-center gap-2">
                        <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-semibold ${statusClass(selected.status)}`}>
                          {statusLabel(selected.status)}
                        </span>
                        <span className="inline-flex items-center rounded-full border border-gray-200 bg-gray-100 px-2 py-0.5 text-xs font-semibold text-gray-700">
                          {formatDateDMonYYYY(selected.approved_at || selected.updated_at || selected.created_at)}
                        </span>
                      </div>
                    ) : null}
                  </div>
                </div>
                <div className="rounded-xl border border-gray-200 bg-white p-4">
                  <div className="flex items-center justify-between">
                    <div className="text-sm font-semibold text-gray-900">ติดตามงาน</div>
                    {canEdit ? (
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => {
                          setEditingFollowup(null);
                          setFollowupOpen(true);
                        }}
                      >
                        เพิ่ม
                      </Button>
                    ) : null}
                  </div>
                  <div className="mt-3 space-y-2">
                    {selectedFollowups.length === 0 ? <div className="text-sm text-gray-600">ยังไม่มีรายการติดตาม</div> : null}
                    {selectedFollowups.map((t) => (
                      <div key={t.id} className="flex items-start justify-between gap-3 rounded-lg border border-gray-200 p-3">
                        <div className="min-w-0">
                          <div className="truncate text-sm font-medium text-gray-900">{t.subject}</div>
                          <div className="mt-0.5 text-xs text-gray-600">{t.type.toUpperCase()} {t.due_at ? `• Due ${new Date(t.due_at).toLocaleString()}` : ""}</div>
                          {t.notes ? <div className="mt-1 text-xs text-gray-500">{t.notes}</div> : null}
                          {t.completed_at ? <div className="mt-1 text-xs font-semibold text-green-700">Completed</div> : null}
                        </div>
                        <div className="flex shrink-0 flex-col items-end gap-2">
                          {canEdit && !t.completed_at ? (
                            <Button size="sm" variant="outline" onClick={() => markComplete(t.id)}>
                              เสร็จแล้ว
                            </Button>
                          ) : null}
                          {canEdit ? (
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => {
                                setEditingFollowup(t);
                                setFollowupOpen(true);
                              }}
                            >
                              แก้ไข
                            </Button>
                          ) : null}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              <div className="space-y-3 lg:col-span-7">
                <div className="rounded-xl border border-gray-200 bg-white p-4">
                  <div className="text-sm font-semibold text-gray-900">รายการบริการ</div>
                  <div className="mt-3 space-y-2">
                    {selectedItems.length === 0 ? <div className="text-sm text-gray-600">ยังไม่มีรายการ</div> : null}
                    {selectedItems.map((it) => (
                      <div key={it.id} className="flex items-start justify-between gap-3 rounded-lg border border-gray-200 p-3">
                        <div className="min-w-0">
                          <div className="truncate text-sm font-medium text-gray-900">{it.name}</div>
                          <div className="mt-0.5 text-xs text-gray-600">จำนวน {it.quantity} × {asMoney(Number(it.unit_price ?? 0))}</div>
                          {Array.isArray((it as any).task_list) && (it as any).task_list.length ? (
                            <ul className="mt-2 list-disc space-y-0.5 pl-4 text-xs text-gray-600">
                              {((it as any).task_list as unknown[])
                                .filter((x) => typeof x === "string" && x.trim().length)
                                .slice(0, 12)
                                .map((t, idx) => (
                                  <li key={idx}>{String(t).trim()}</li>
                                ))}
                            </ul>
                          ) : null}
                        </div>
                        <div className="text-sm font-semibold text-gray-900">{asMoney(Number(it.line_total ?? 0))}</div>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="rounded-xl border border-gray-200 bg-white p-4">
                  <div className="text-sm font-semibold text-gray-900">หมายเหตุ</div>
                  <div className="mt-2 whitespace-pre-wrap text-sm text-gray-700">{selected.notes?.trim() || "-"}</div>
                </div>

                <div className="rounded-xl border border-gray-200 bg-white p-4">
                  <div className="text-sm font-semibold text-gray-900">สรุปยอด</div>
                  <div className="mt-3 space-y-1 text-sm">
                    <div className="flex items-center justify-between">
                      <div className="text-gray-600">รวมก่อนส่วนลด</div>
                      <div className="font-medium text-gray-900">{asMoney(Number(selected.subtotal ?? 0))}</div>
                    </div>
                    <div className="flex items-center justify-between">
                      <div className="text-gray-600">ส่วนลด</div>
                      <div className="font-medium text-gray-900">{asMoney(Number(selected.discount_total ?? 0))}</div>
                    </div>
                    <div className="flex items-center justify-between">
                      <div className="text-gray-600">ยอดหลังส่วนลด</div>
                      <div className="font-medium text-gray-900">
                        {asMoney(Math.max(0, Number(selected.subtotal ?? 0) - Number(selected.discount_total ?? 0)))}
                      </div>
                    </div>
                    {selected.include_vat ? (
                      <div className="flex items-center justify-between">
                        <div className="text-gray-600">VAT ({Number(selected.vat_rate ?? 0)}%)</div>
                        <div className="font-medium text-gray-900">{asMoney(Number(selected.vat_amount ?? 0))}</div>
                      </div>
                    ) : null}
                    {Number(selected.wht_rate ?? 0) > 0 ? (
                      <div className="flex items-center justify-between">
                        <div className="text-gray-600">หัก ณ ที่จ่าย ({Number(selected.wht_rate ?? 0)}%)</div>
                        <div className="font-medium text-gray-900">-{asMoney(Number(selected.wht_amount ?? 0))}</div>
                      </div>
                    ) : null}
                    <div className="flex items-center justify-between">
                      <div className="text-gray-600">ยอดสุทธิ</div>
                      <div className="text-base font-semibold text-gray-900">{asMoney(Number(selected.grand_total ?? 0))}</div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {!detailOpen && (
        <div className="mt-4 overflow-hidden rounded-xl border border-gray-200 bg-white">
          <div className="overflow-x-auto">
            <div className="min-w-[980px] overflow-hidden rounded-xl">
              <div className="grid grid-cols-[0.9fr_1.2fr_0.7fr_0.8fr_0.7fr] gap-3 border-b border-gray-200 bg-gray-50 px-4 py-2 text-xs font-semibold text-gray-600">
                <div>เลขที่</div>
                <div>ลูกค้า</div>
                <div className="text-center">สถานะ</div>
                <div className="text-right">ยอดสุทธิ</div>
                <div className="text-center">อัปเดต</div>
              </div>
              {rows.length === 0 ? (
                <div className="px-4 py-8 text-sm text-gray-500">{loading ? "กำลังโหลด..." : "ยังไม่มีข้อมูล"}</div>
              ) : (
                table.getRowModel().rows.map((row) => {
                  const r = row.original as SalesQuoteRow;
                  return (
                    <div
                      key={r.id}
                      role="button"
                      tabIndex={0}
                      className="grid grid-cols-[0.9fr_1.2fr_0.7fr_0.8fr_0.7fr] items-center gap-3 border-b border-gray-100 px-4 py-3 last:border-b-0 cursor-pointer transition-colors hover:bg-gray-100 active:bg-gray-200"
                      onClick={() => {
                        setSelected(r);
                        setDetailOpen(true);
                      }}
                      onKeyDown={(e) => {
                        if (e.key !== "Enter") return;
                        (e.currentTarget as HTMLDivElement).click();
                      }}
                    >
                      <div className="text-sm font-medium text-gray-900">{r.quote_no}</div>
                      <div className="text-sm font-medium text-gray-900">{r.customer_name}</div>
                      <div className="flex justify-center">
                        <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-semibold ${statusClass(r.status)}`}>
                          {statusLabel(r.status)}
                        </span>
                      </div>
                      <div className="text-right text-sm font-medium text-gray-900">{asMoney(Number(r.grand_total ?? 0))}</div>
                      <div className="flex justify-center">
                        <span className="inline-flex items-center rounded-full border border-gray-200 bg-gray-100 px-2 py-0.5 text-xs font-semibold text-gray-700">
                          {formatDateDMonYYYY(r.updated_at || r.created_at)}
                        </span>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>
          <TablePagination table={table} />
        </div>
      )}
    </div>
  );
}
