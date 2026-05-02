"use client";

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Button, Input, Popover } from "rizzui";
import { Title, Text } from "rizzui/typography";
import toast from "react-hot-toast";
import AppSelect from "@core/ui/app-select";
import TablePagination from "@core/components/table/pagination";
import { getCoreRowModel, useReactTable } from "@tanstack/react-table";
import TableSearch from "@/components/table/table-search";
import { useSearchParams } from "next/navigation";
import { PiCaretDownBold } from "react-icons/pi";

import { Modal } from "@core/modal-views/modal";

import { useAuth } from "@/app/shared/auth-provider";
import { InvoiceCreateModal } from "@/components/billing/invoice-create-modal";
import FileUploader from "@/components/form/file-uploader";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import { buildQuotePdfBytes } from "@/utils/quote-pdf";

type CustomerOption = { id: string; name: string };
type ServiceOption = { id: string; name: string; sell_price: number };
type WorkerOption = {
  id: string;
  full_name: string;
  passport_no: string | null;
  os_sex: string | null;
  wp_number: string | null;
  wp_expire_date: string | null;
};

type QuotePreviewRow = {
  id: string;
  quote_no: string;
  customer_name: string;
  subtotal: number;
  discount_total: number;
  include_vat: boolean;
  vat_rate: number;
  vat_amount: number;
  wht_rate: number;
  wht_amount: number;
  grand_total: number;
  created_at: string;
};

type QuotePreviewItemRow = {
  id: string;
  name: string;
  quantity: number;
  unit_price: number;
  line_total: number;
  sort_order: number;
  created_at: string;
};

type OrderCustomerRel = { name: string } | { name: string }[] | null;

type OrderPaymentRow = {
  id: string;
  installment_no: number;
  amount: number;
  slip_url: string | null;
  slip_storage_provider?: string | null;
  slip_storage_bucket?: string | null;
  slip_storage_path?: string | null;
  slip_file_name?: string | null;
  created_at: string;
  confirmed_at: string | null;
};

type OrderRefundRow = {
  id: string;
  amount: number;
  slip_url: string | null;
  slip_storage_provider?: string | null;
  slip_storage_bucket?: string | null;
  slip_storage_path?: string | null;
  slip_file_name?: string | null;
  created_at: string;
};

type OrderDocumentRow = {
  id: string;
  doc_type: string | null;
  storage_provider?: string | null;
  storage_bucket?: string | null;
  storage_path?: string | null;
  file_name?: string | null;
  drive_web_view_link: string | null;
  drive_file_id: string | null;
  created_at: string;
};

type InvoiceLiteRow = {
  id: string;
  doc_no: string | null;
  status: string;
  grand_total: number;
  issued_at: string | null;
};

type ReceiptLiteRow = {
  id: string;
  doc_no: string | null;
};

type EventRow = {
  id: string;
  event_type: string;
  message: string;
  created_at: string;
  created_by_profile_id?: string | null;
  created_by_email?: string | null;
};

type FinanceTxnRow = {
  id: string;
  txn_type: string;
  source_type: string | null;
  amount: number;
  txn_date: string | null;
  expense_name: string | null;
  note: string | null;
};

type OrderRow = {
  id: string;
  display_id: string | null;
  customer_id: string;
  source_quote_id?: string | null;
  status: string;
  subtotal: number;
  discount: number;
  include_vat: boolean;
  vat_rate: number;
  vat_amount: number;
  wht_rate: number;
  wht_amount: number;
  total: number;
  paid_amount: number;
  remaining_amount: number;
  created_at: string;
  customers?: OrderCustomerRel;
};

type OrderItemRow = {
  id: string;
  service_id: string | null;
  quantity: number;
  description: string | null;
};

type DraftItem = {
  key: string;
  serviceId: string;
  quantity: string;
  note: string;
};

function looksUuid(v: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v);
}

function formatShortDate(v: string | null | undefined) {
  if (!v) return "-";
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) return v;
  const parts = new Intl.DateTimeFormat("en-US", { day: "numeric", month: "short", year: "numeric" }).formatToParts(d);
  const day = parts.find((p) => p.type === "day")?.value ?? "";
  const month = parts.find((p) => p.type === "month")?.value ?? "";
  const year = parts.find((p) => p.type === "year")?.value ?? "";
  if (!day || !month || !year) return "-";
  return `${day}-${month}-${year}`;
}

function formatDateTime(s: string | null | undefined) {
  if (!s) return "-";
  const d = new Date(s);
  if (!Number.isFinite(d.getTime())) return "-";
  return d.toLocaleString("th-TH", { year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" });
}

function workerLine(w: WorkerOption) {
  const sex = String(w.os_sex ?? "-") || "-";
  const wp = String(w.wp_number ?? "-") || "-";
  return `${w.full_name} / ${sex} / ${wp}`;
}

function round2(n: number) {
  return Math.round((Number.isFinite(n) ? n : 0) * 100) / 100;
}

function asMoney(n: number) {
  const x = Number.isFinite(n) ? n : 0;
  return x.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function isMissingTableError(err: any, table: string) {
  const msg = String(err?.message ?? "").toLowerCase();
  const code = String(err?.code ?? "");
  const t = table.toLowerCase();
  if (msg.includes(`could not find the table '${t}'`)) return true;
  if (msg.includes(`could not find the table "${t}"`)) return true;
  if (msg.includes("schema cache") && msg.includes(t)) return true;
  if (code === "PGRST205" && msg.includes(t)) return true;
  return false;
}

function extFromMime(mime: string | null | undefined) {
  const m = String(mime ?? "").toLowerCase();
  if (m.includes("image/jpeg")) return "jpg";
  if (m.includes("image/png")) return "png";
  if (m.includes("image/webp")) return "webp";
  if (m.includes("application/pdf")) return "pdf";
  return "bin";
}

function isPdfUrl(url: string) {
  const u = url.toLowerCase();
  return u.includes(".pdf") || u.includes("application/pdf");
}

function extFromUrl(url: string) {
  const u = url.toLowerCase().split("?")[0] || "";
  if (u.endsWith(".pdf")) return "pdf";
  if (u.endsWith(".jpg") || u.endsWith(".jpeg")) return "jpg";
  if (u.endsWith(".png")) return "png";
  if (u.endsWith(".webp")) return "webp";
  return "bin";
}

function extractDriveFileId(link: string) {
  const s = String(link || "");
  const m1 = s.match(/\/d\/([a-zA-Z0-9_-]{10,})/);
  if (m1?.[1]) return m1[1];
  const m2 = s.match(/[?&]id=([a-zA-Z0-9_-]{10,})/);
  if (m2?.[1]) return m2[1];
  const m3 = s.match(/uc\?export=download&id=([a-zA-Z0-9_-]{10,})/);
  if (m3?.[1]) return m3[1];
  return null;
}

function drivePreviewUrl(webViewLink: string, fileId: string | null) {
  const id = fileId || extractDriveFileId(webViewLink);
  if (id) return `https://drive.google.com/file/d/${id}/preview`;
  return webViewLink;
}

function driveDownloadUrl(webViewLink: string, fileId: string | null) {
  const id = fileId || extractDriveFileId(webViewLink);
  if (id) return `https://drive.google.com/uc?export=download&id=${id}`;
  return webViewLink;
}

async function downloadUrl(url: string, filename: string) {
  const res = await fetch(url);
  if (!res.ok) throw new Error("ดาวน์โหลดไม่สำเร็จ");
  const blob = await res.blob();
  const objUrl = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = objUrl;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(objUrl);
}

async function getSignedStorageUrl(params: { supabase: any; table: string; id: string; disposition: "inline" | "attachment" }) {
  const sessionRes = await params.supabase.auth.getSession();
  const token = sessionRes.data.session?.access_token;
  if (!token) throw new Error("ยังไม่ได้เข้าสู่ระบบ");
  const res = await fetch("/api/storage/signed-url", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ table: params.table, id: params.id, disposition: params.disposition }),
  });
  if (!res.ok) {
    const data = (await res.json().catch(() => ({}))) as { error?: string };
    throw new Error(data.error || "ขอ signed url ไม่สำเร็จ");
  }
  const data = (await res.json()) as { ok: true; url: string };
  return data.url;
}

export default function OrdersPage() {
  const { role, userId } = useAuth();
  const supabase = useMemo(() => createSupabaseBrowserClient(), []);
  const topRef = useRef<HTMLDivElement | null>(null);
  const searchParams = useSearchParams();
  const autoOpenOrderIdRef = useRef<string | null>(null);
  const workersLoadSeq = useRef(0);

  const [loading, setLoading] = useState(false);
  const [rows, setRows] = useState<OrderRow[]>([]);
  const [customers, setCustomers] = useState<CustomerOption[]>([]);
  const [services, setServices] = useState<ServiceOption[]>([]);
  const [totalRows, setTotalRows] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [pagination, setPagination] = useState({ pageIndex: 0, pageSize: 10 });
  const [search, setSearch] = useState("");
  const [showClosedOnly, setShowClosedOnly] = useState(false);

  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingStatus, setEditingStatus] = useState<string | null>(null);
  const [editingDisplayId, setEditingDisplayId] = useState<string | null>(null);
  const [editingSourceQuoteId, setEditingSourceQuoteId] = useState<string | null>(null);
  const [editingTotalAmount, setEditingTotalAmount] = useState<number>(0);
  const [editingPaidAmount, setEditingPaidAmount] = useState<number>(0);
  const [editingRemainingAmount, setEditingRemainingAmount] = useState<number>(0);
  const [orderPayments, setOrderPayments] = useState<OrderPaymentRow[]>([]);
  const [orderRefund, setOrderRefund] = useState<OrderRefundRow | null>(null);
  const [orderDocuments, setOrderDocuments] = useState<OrderDocumentRow[]>([]);
  const [orderTransactions, setOrderTransactions] = useState<FinanceTxnRow[]>([]);
  const [events, setEvents] = useState<EventRow[]>([]);
  const hasRefundSlip = !!orderRefund;
  const hasOtherDocs = orderDocuments.length > 0;
  const hasAnyDocs = hasRefundSlip || hasOtherDocs;
  const [docViewerOpen, setDocViewerOpen] = useState(false);
  const [docViewerLoading, setDocViewerLoading] = useState(false);
  const [docViewerUrl, setDocViewerUrl] = useState<string | null>(null);
  const [docViewerDownloadUrl, setDocViewerDownloadUrl] = useState<string | null>(null);
  const [docViewerIsDirectFile, setDocViewerIsDirectFile] = useState(false);
  const [docViewerTitle, setDocViewerTitle] = useState<string | null>(null);
  const [docViewerSource, setDocViewerSource] = useState<{ table: string; id: string } | null>(null);

  const [addDocOpen, setAddDocOpen] = useState(false);
  const [addDocType, setAddDocType] = useState("");
  const [addDocFile, setAddDocFile] = useState<File | null>(null);

  const [customerId, setCustomerId] = useState("");
  const [employerLineStatus, setEmployerLineStatus] = useState<"NOT_CONNECTED" | "PENDING" | "CONNECTED" | "ERROR" | null>(null);
  const [discount, setDiscount] = useState("0");
  const [includeVat, setIncludeVat] = useState(true);
  const [whtRate, setWhtRate] = useState("3");
  const [items, setItems] = useState<DraftItem[]>([{ key: "1", serviceId: "", quantity: "1", note: "" }]);

  const [payOpen, setPayOpen] = useState(false);
  const [payOrderId, setPayOrderId] = useState<string | null>(null);
  const [payOrderDisplayId, setPayOrderDisplayId] = useState<string | null>(null);
  const [payCustomerName, setPayCustomerName] = useState<string | null>(null);
  const [payTotal, setPayTotal] = useState<number>(0);
  const [payAmount, setPayAmount] = useState("");

  const [firstIvOpen, setFirstIvOpen] = useState(false);
  const [firstIvOrderId, setFirstIvOrderId] = useState<string | null>(null);
  const [firstIvOrderDisplayId, setFirstIvOrderDisplayId] = useState<string | null>(null);
  const [firstIvCustomerName, setFirstIvCustomerName] = useState<string | null>(null);
  const [firstIvTotal, setFirstIvTotal] = useState<number>(0);
  const [firstIvLoading, setFirstIvLoading] = useState(false);
  const [firstIvInvoice, setFirstIvInvoice] = useState<InvoiceLiteRow | null>(null);
  const [firstIvPayAmount, setFirstIvPayAmount] = useState("");
  const [firstIvPayNote, setFirstIvPayNote] = useState("");
  const [firstIvPayFile, setFirstIvPayFile] = useState<File | null>(null);

  const [downloadMenuOpen, setDownloadMenuOpen] = useState(false);
  const [downloadInvoice, setDownloadInvoice] = useState<InvoiceLiteRow | null>(null);
  const [downloadReceipt, setDownloadReceipt] = useState<ReceiptLiteRow | null>(null);
  const [downloadDocsLoading, setDownloadDocsLoading] = useState(false);


  const [cancelOpen, setCancelOpen] = useState(false);
  const [cancelOrderId, setCancelOrderId] = useState<string | null>(null);
  const [cancelOrderDisplayId, setCancelOrderDisplayId] = useState<string | null>(null);
  const [cancelCustomerName, setCancelCustomerName] = useState<string | null>(null);
  const [cancelTotal, setCancelTotal] = useState<number>(0);
  const [cancelAmount, setCancelAmount] = useState("");
  const [cancelFile, setCancelFile] = useState<File | null>(null);

  const [quotePreviewOpen, setQuotePreviewOpen] = useState(false);
  const [quotePreviewLoading, setQuotePreviewLoading] = useState(false);
  const [quotePreviewError, setQuotePreviewError] = useState<string | null>(null);
  const [quotePreview, setQuotePreview] = useState<QuotePreviewRow | null>(null);
  const [quotePreviewItems, setQuotePreviewItems] = useState<QuotePreviewItemRow[]>([]);

  const [workers, setWorkers] = useState<WorkerOption[]>([]);
  const [orderItemWorkers, setOrderItemWorkers] = useState<Record<string, { ids: string[]; names: string[] }>>({});
  const [workerPickerOpen, setWorkerPickerOpen] = useState(false);
  const [workerPickerOrderItemId, setWorkerPickerOrderItemId] = useState<string | null>(null);
  const [workerPickerExpected, setWorkerPickerExpected] = useState(0);
  const [workerPickerSelected, setWorkerPickerSelected] = useState<string[]>([]);
  const [workerPickerSearch, setWorkerPickerSearch] = useState("");
  const [loadedOrderItemIds, setLoadedOrderItemIds] = useState<string[]>([]);

  const canEdit = role === "admin" || role === "sale" || role === "operation";
  const canConfirmFirstInstallmentPayment = role === "admin" || role === "operation";

  React.useEffect(() => {
    setPagination((p) => ({ ...p, pageIndex: 0 }));
  }, [rows.length, search]);

  const table = useReactTable({
    data: rows,
    columns: useMemo(() => [{ accessorKey: "id" }], []),
    state: { pagination },
    onPaginationChange: setPagination,
    manualPagination: true,
    pageCount: Math.max(1, Math.ceil(totalRows / Math.max(1, pagination.pageSize))),
    getCoreRowModel: getCoreRowModel(),
  });

  const resetForm = useCallback(() => {
    setEditingId(null);
    setEditingStatus(null);
    setEditingDisplayId(null);
    setEditingSourceQuoteId(null);
    setEditingTotalAmount(0);
    setEditingPaidAmount(0);
    setEditingRemainingAmount(0);
    setDownloadMenuOpen(false);
    setDownloadInvoice(null);
    setDownloadReceipt(null);
    setCustomerId("");
    setDiscount("0");
    setIncludeVat(true);
    setWhtRate("3");
    setItems([{ key: "1", serviceId: "", quantity: "1", note: "" }]);
    setLoadedOrderItemIds([]);
    setOrderItemWorkers({});
    setEvents([]);
  }, []);

  const loadFirstInstallmentInvoice = useCallback(
    async (orderId: string) => {
      if (!orderId) return null;
      const res = await supabase
        .from("invoices")
        .select("id,doc_no,status,grand_total,issued_at")
        .eq("order_id", orderId)
        .eq("installment_no", 1)
        .neq("status", "cancelled")
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (res.error) throw res.error;
      const row = res.data as any;
      if (!row?.id) return null;
      return {
        id: String(row.id),
        doc_no: row.doc_no ? String(row.doc_no) : null,
        status: String(row.status ?? ""),
        grand_total: Number(row.grand_total ?? 0),
        issued_at: row.issued_at ? String(row.issued_at) : null,
      } satisfies InvoiceLiteRow;
    },
    [supabase]
  );

  const loadLatestInvoiceForOrder = useCallback(
    async (orderId: string) => {
      if (!orderId) return null;
      const res = await supabase
        .from("invoices")
        .select("id,doc_no,status,grand_total,issued_at")
        .eq("order_id", orderId)
        .neq("status", "cancelled")
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (res.error) throw res.error;
      const row = res.data as any;
      if (!row?.id) return null;
      return {
        id: String(row.id),
        doc_no: row.doc_no ? String(row.doc_no) : null,
        status: String(row.status ?? ""),
        grand_total: Number(row.grand_total ?? 0),
        issued_at: row.issued_at ? String(row.issued_at) : null,
      } satisfies InvoiceLiteRow;
    },
    [supabase],
  );

  const downloadInvoicePdf = useCallback(
    async (invoice: InvoiceLiteRow) => {
      const res = await fetch("/api/invoices/pdf", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ invoiceId: invoice.id, issued_by_profile_id: userId }),
      });
      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(data.error || "ดาวน์โหลดใบแจ้งหนี้ไม่สำเร็จ");
      }
      const blob = await res.blob();
      const objUrl = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = objUrl;
      a.download = invoice.doc_no ? `${invoice.doc_no}.pdf` : `invoice-${invoice.id}.pdf`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(objUrl);
    },
    [userId]
  );

  const loadReceiptForInvoice = useCallback(
    async (invoiceId: string) => {
      if (!invoiceId) return null;
      const res = await supabase
        .from("receipts")
        .select("id,doc_no")
        .eq("invoice_id", invoiceId)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (res.error) throw res.error;
      const row = res.data as any;
      if (!row?.id) return null;
      return {
        id: String(row.id),
        doc_no: row.doc_no ? String(row.doc_no) : null,
      } satisfies ReceiptLiteRow;
    },
    [supabase]
  );

  const loadLatestReceiptForOrder = useCallback(
    async (orderId: string) => {
      if (!orderId) return null;
      const res = await supabase
        .from("receipts")
        .select("id,doc_no,invoice_id,invoices!inner(order_id)")
        .eq("invoices.order_id", orderId)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (res.error) throw res.error;
      const row = res.data as any;
      if (!row?.id) return null;
      return {
        id: String(row.id),
        doc_no: row.doc_no ? String(row.doc_no) : null,
      } satisfies ReceiptLiteRow;
    },
    [supabase],
  );

  const refreshDownloadDocsForOrder = useCallback(
    async (orderId: string) => {
      if (!orderId) {
        setDownloadDocsLoading(false);
        setDownloadInvoice(null);
        setDownloadReceipt(null);
        return;
      }
      setDownloadDocsLoading(true);
      try {
        let inv = await loadLatestInvoiceForOrder(orderId).catch(() => null);
        if (!inv?.id) {
          inv = await loadFirstInstallmentInvoice(orderId).catch(() => null);
        }
        setDownloadInvoice(inv);
        let rec = await loadLatestReceiptForOrder(orderId).catch(() => null);
        if (!rec?.id && inv?.id) {
          rec = await loadReceiptForInvoice(inv.id).catch(() => null);
        }
        setDownloadReceipt(rec);
      } finally {
        setDownloadDocsLoading(false);
      }
    },
    [loadFirstInstallmentInvoice, loadLatestInvoiceForOrder, loadLatestReceiptForOrder, loadReceiptForInvoice],
  );

  const createReceiptFromInvoice = useCallback(async (invoiceId: string) => {
    const res = await fetch("/api/receipts/from-invoice", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ invoiceId }),
    });
    if (!res.ok) {
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      throw new Error(data.error || "ออกใบเสร็จไม่สำเร็จ");
    }
    const data = (await res.json().catch(() => ({}))) as { receiptId?: string; receiptNo?: string | null };
    return { receiptId: String(data.receiptId ?? "").trim(), receiptNo: data.receiptNo ?? null };
  }, []);

  const downloadReceiptPdf = useCallback(async (receipt: ReceiptLiteRow) => {
    const res = await fetch("/api/receipts/pdf", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ receiptId: receipt.id, issued_by_profile_id: userId }),
    });
    if (!res.ok) {
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      throw new Error(data.error || "ดาวน์โหลดใบเสร็จไม่สำเร็จ");
    }
    const blob = await res.blob();
    const objUrl = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = objUrl;
    a.download = receipt.doc_no ? `${receipt.doc_no}.pdf` : `receipt-${receipt.id}.pdf`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(objUrl);
  }, [userId]);

  const downloadQuotePdf = useCallback(
    async (quoteId: string) => {
      if (!quoteId) return;
      setLoading(true);
      setError(null);
      try {
        const { data: quote, error: qErr } = await supabase
          .from("sales_quotes")
          .select(
            "id,quote_no,customer_id,customer_name,customer_company,customer_email,customer_phone,billing_address,notes,currency,subtotal,discount_total,include_vat,vat_rate,vat_amount,wht_rate,wht_amount,tax_total,grand_total,valid_until,status,created_by_profile_id,approved_by_profile_id,approved_at,pdf_storage_path,created_at,updated_at",
          )
          .eq("id", quoteId)
          .maybeSingle();
        if (qErr) throw qErr;
        if (!quote?.id) throw new Error("ไม่พบใบเสนอราคา");

        const { data: quoteItems, error: itErr } = await supabase
          .from("sales_quote_items")
          .select("id,quote_id,service_id,name,description,task_list,quantity,unit_price,line_total,sort_order,created_at")
          .eq("quote_id", quoteId)
          .order("sort_order", { ascending: true })
          .order("created_at", { ascending: true });
        if (itErr) throw itErr;

        const serviceIds = Array.from(
          new Set(
            (quoteItems ?? [])
              .map((it) => String((it as any).service_id ?? ""))
              .filter((x) => x.trim().length > 0),
          ),
        );
        const serviceTasksById = new Map<string, string[]>();
        if (serviceIds.length) {
          const { data: svcRows, error: svcErr } = await supabase.from("services").select("id,task_list").in("id", serviceIds);
          if (!svcErr) {
            for (const s of (svcRows ?? []) as any[]) {
              const id = String(s?.id ?? "");
              if (!id) continue;
              const list = Array.isArray(s?.task_list)
                ? (s.task_list as unknown[]).filter((x) => typeof x === "string" && x.trim().length).map((x) => String(x).trim())
                : [];
              serviceTasksById.set(id, list);
            }
          }
        }

        const itemsWithTasks = (quoteItems ?? []).map((it) => {
          const perQuoteTasks = Array.isArray((it as any).task_list)
            ? ((it as any).task_list as unknown[]).filter((x) => typeof x === "string" && x.trim().length).map((x) => String(x).trim())
            : [];
          const fallbackTasks = (it as any).service_id ? (serviceTasksById.get(String((it as any).service_id)) ?? []) : [];
          return { ...(it as any), task_list: perQuoteTasks.length ? perQuoteTasks : fallbackTasks };
        });

        const customerId = String((quote as any).customer_id ?? "").trim();
        const { data: cust } = customerId
          ? await supabase.from("customers").select("tax_id,branch_name,address,contact_name").eq("id", customerId).maybeSingle()
          : { data: null };
        const customer = cust
          ? {
              tax_id: (cust as any).tax_id ?? null,
              branch_name: (cust as any).branch_name ?? null,
              address: (cust as any).address ?? null,
              contact_name: (cust as any).contact_name ?? null,
            }
          : null;

        const bytes = await buildQuotePdfBytes({
          quote: quote as any,
          items: itemsWithTasks as any,
          customer,
          preparedByProfileId: userId,
        });

        const blob = new Blob([bytes], { type: "application/pdf" });
        const objUrl = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = objUrl;
        a.download = `${String((quote as any).quote_no ?? "quotation")}.pdf`;
        document.body.appendChild(a);
        a.click();
        a.remove();
        URL.revokeObjectURL(objUrl);
        setLoading(false);
      } catch (e: any) {
        setError(e?.message ?? "ดาวน์โหลดใบเสนอราคาไม่สำเร็จ");
        setLoading(false);
      }
    },
    [supabase, userId],
  );

  const statusLabel = useCallback((status: string) => {
    if (status === "draft") return "เปิดออเดอร์";
    if (status === "in_progress") return "กำลังดำเนินการ";
    if (status === "billed_first_installment") return "วางบิลงวดแรกแล้ว";
    if (status === "paid_first_installment") return "ชำระงวดแรกแล้ว";
    if (status === "completed") return "ปิดออเดอร์";
    if (status === "pending_approval") return "รออนุมัติ";
    if (status === "approved") return "อนุมัติแล้ว";
    if (status === "rejected") return "ไม่อนุมัติ";
    if (status === "cancelled") return "ยกเลิกออเดอร์";
    return status;
  }, []);

  const customerNameFromRel = useCallback((rel: OrderCustomerRel) => {
    if (!rel) return "-";
    if (Array.isArray(rel)) return rel[0]?.name ?? "-";
    return rel.name ?? "-";
  }, []);

  const serviceById = useMemo(() => {
    const m = new Map<string, ServiceOption>();
    for (const s of services) m.set(s.id, s);
    return m;
  }, [services]);

  const computed = useMemo(() => {
    const lines = items
      .map((it) => {
        const svc = it.serviceId ? serviceById.get(it.serviceId) ?? null : null;
        const qty = Math.max(0, Math.floor(Number(it.quantity || 0)));
        const unit = svc ? Number(svc.sell_price || 0) : 0;
        return { qty, unit, lineTotal: round2(unit * qty) };
      })
      .filter((x) => x.qty > 0);

    const subtotal = round2(lines.reduce((sum, x) => sum + x.lineTotal, 0));
    const discountNum = Math.max(0, Number(discount || 0));
    const safeDiscount = Number.isFinite(discountNum) ? discountNum : 0;
    const afterDiscount = round2(Math.max(0, subtotal - safeDiscount));

    const safeVatRate = includeVat ? 7 : 0;
    const vatAmount = round2(afterDiscount * (safeVatRate / 100));

    const whtRateNum = Math.max(0, Number(whtRate || 0));
    const safeWhtRate = Number.isFinite(whtRateNum) ? whtRateNum : 0;
    const whtAmount = round2(afterDiscount * (safeWhtRate / 100));

    const total = round2(afterDiscount + vatAmount - whtAmount);

    return {
      subtotal,
      discount: round2(safeDiscount),
      afterDiscount,
      includeVat,
      vatRate: safeVatRate,
      vatAmount,
      whtRate: safeWhtRate,
      whtAmount,
      total,
    };
  }, [discount, includeVat, items, serviceById, whtRate]);

  const refresh = useCallback(() => {
    Promise.resolve().then(async () => {
      setLoading(true);
      setError(null);
      try {
        const from = pagination.pageIndex * pagination.pageSize;
        const to = from + pagination.pageSize - 1;
        const q = search.trim();

        let ordersQuery = supabase
          .from("orders")
          .select(
            "id,display_id,customer_id,source_quote_id,status,subtotal,discount,include_vat,vat_rate,vat_amount,wht_rate,wht_amount,total,paid_amount,remaining_amount,created_at,customers(name)",
            { count: "estimated" },
          )
          .order("created_at", { ascending: false });

        if (showClosedOnly) {
          ordersQuery = ordersQuery.in("status", ["completed", "cancelled"]);
        } else {
          ordersQuery = ordersQuery.not("status", "in", "(completed,cancelled)");
        }

        if (q) {
          const like = `%${q.replaceAll("%", "\\%").replaceAll("_", "\\_")}%`;
          ordersQuery = ordersQuery.or([`display_id.ilike.${like}`, `status.ilike.${like}`].join(","));
        }

        const [custRes, svcRes, orderRes] = await Promise.all([
          supabase
            .from("customers")
            .select("id,name")
            .order("updated_at", { ascending: false })
            .order("created_at", { ascending: false })
            .range(0, 499),
          supabase.from("services").select("id,name,sell_price").order("created_at", { ascending: false }).range(0, 499),
          ordersQuery.range(from, to),
        ]);

        const firstError = svcRes.error ?? orderRes.error;
        if (custRes.error) {
          const msg = String(custRes.error.message ?? "");
          if (msg.includes("customers.updated_at") || (msg.includes("updated_at") && msg.toLowerCase().includes("does not exist"))) {
            const fallback = await supabase.from("customers").select("id,name").order("created_at", { ascending: false }).range(0, 499);
            if (!fallback.error) {
              setCustomers(((fallback.data ?? []) as CustomerOption[]) ?? []);
            }
          }
        }
        if (firstError) {
          setError(firstError.message);
          setCustomers([]);
          setServices([]);
          setRows([]);
          setTotalRows(0);
          setLoading(false);
          return;
        }

        if (!custRes.error) {
          setCustomers(((custRes.data ?? []) as CustomerOption[]) ?? []);
        }
        setServices(((svcRes.data ?? []) as ServiceOption[]) ?? []);
        setRows(((orderRes.data ?? []) as OrderRow[]) ?? []);
        setTotalRows(orderRes.count ?? 0);
        setLoading(false);
      } catch (e: any) {
        setError(e?.message ?? "โหลดข้อมูลไม่สำเร็จ");
        setCustomers([]);
        setServices([]);
        setRows([]);
        setTotalRows(0);
        setLoading(false);
      }
    });
  }, [pagination.pageIndex, pagination.pageSize, search, showClosedOnly, supabase]);

  React.useEffect(() => {
    refresh();
  }, [refresh]);

  React.useEffect(() => {
    setPagination((p) => ({ ...p, pageIndex: 0 }));
  }, [search, showClosedOnly]);

  const canEditOrder = canEdit && (!editingStatus || editingStatus === "draft");
  const isLockedFromQuote = !!editingSourceQuoteId;
  const canEditCustomer = canEditOrder && !isLockedFromQuote;
  const canEditItems = canEditOrder && !isLockedFromQuote;
  const canSave = canEditOrder && !isLockedFromQuote && customerId.length > 0 && items.some((x) => x.serviceId.length > 0);
  const canAssignWorkers =
    canEdit &&
    !!editingId &&
    (editingStatus === "draft" || editingStatus === "billed_first_installment" || editingStatus === "in_progress");

  const firstInstallment = useMemo(() => {
    return orderPayments.find((p) => Number(p.installment_no ?? 0) === 1 && !!p.confirmed_at && Number(p.amount ?? 0) > 0) ?? null;
  }, [orderPayments]);

  const workersComplete = useMemo(() => {
    if (!editingId) return false;
    const required = items
      .map((it) => {
        const qty = Math.max(0, Math.floor(Number(it.quantity || 0)));
        if (!it.serviceId || qty <= 0) return null;
        const key = looksUuid(it.key) ? it.key : null;
        if (!key) return null;
        return { id: key, qty };
      })
      .filter(Boolean) as { id: string; qty: number }[];
    if (required.length === 0) return false;
    return required.every((x) => (orderItemWorkers[x.id]?.ids?.length ?? 0) === x.qty);
  }, [editingId, items, orderItemWorkers]);

  const canStart = !!editingId && editingStatus === "draft" && !!firstInstallment && workersComplete;

  const canDownloadQuote = !!editingSourceQuoteId;
  const canDownloadInvoice = !!downloadInvoice;
  const canDownloadReceipt = !!downloadReceipt;
  const mayHaveFinanceDocs = editingStatus === "billed_first_installment" || editingStatus === "paid_first_installment" || !!firstInstallment;
  const hasDownloadMenu = canDownloadQuote || mayHaveFinanceDocs || canDownloadInvoice || canDownloadReceipt;

  useEffect(() => {
    if (!downloadMenuOpen) return;
    if (!editingId) return;
    refreshDownloadDocsForOrder(editingId);
  }, [downloadMenuOpen, editingId, refreshDownloadDocsForOrder]);

  const customerOptions = useMemo(
    () => customers.map((c) => ({ label: c.name, value: c.id })),
    [customers]
  );
  const selectedCustomerName = useMemo(
    () => customers.find((c) => c.id === customerId)?.name ?? "-",
    [customers, customerId]
  );
  const serviceOptions = useMemo(
    () => services.map((s) => ({ label: s.name, value: s.id })),
    [services]
  );
  const workerById = useMemo(() => new Map(workers.map((w) => [w.id, w])), [workers]);

  const refreshWorkersForCustomer = useCallback(
    (cid: string) => {
      Promise.resolve().then(async () => {
        if (!cid) {
          setWorkers([]);
          return;
        }
        setWorkers([]);
        const seq = ++workersLoadSeq.current;
        const { data } = await supabase
          .from("workers")
          .select("id,customer_id,full_name,passport_no,os_sex,wp_number,wp_expire_date")
          .eq("customer_id", cid)
          .order("full_name", { ascending: true })
          .limit(1000);
        if (seq !== workersLoadSeq.current) return;

        const list = ((data ?? []) as (WorkerOption & { customer_id?: string | null })[]) ?? [];
        const onlyThisCustomer = list.filter((w) => String((w as any).customer_id ?? cid) === cid);

        const seen = new Set<string>();
        const deduped: WorkerOption[] = [];

        for (const w of onlyThisCustomer) {
          const id = String((w as any).id ?? "");
          if (!id) continue;

          const wp = String((w as any).wp_number ?? "").trim();
          const pp = String((w as any).passport_no ?? "").trim();
          const name = String((w as any).full_name ?? "").trim().toLowerCase();
          const sex = String((w as any).os_sex ?? "").trim().toLowerCase();

          const key = wp
            ? `wp:${wp}`
            : pp
              ? `pp:${pp}`
              : name
                ? `name:${name}|sex:${sex}`
                : `id:${id}`;

          if (seen.has(key)) continue;
          seen.add(key);
          deduped.push(w);
        }
        setWorkers(deduped);
      });
    },
    [supabase]
  );

  const refreshOrderItemWorkers = useCallback(
    async (orderItemIds: string[]) => {
      if (orderItemIds.length === 0) {
        setOrderItemWorkers({});
        return;
      }
      const { data: links } = await supabase
        .from("order_item_workers")
        .select("order_item_id,worker_id")
        .in("order_item_id", orderItemIds);
      const pairs = (links ?? []) as { order_item_id: string; worker_id: string }[];
      const wids = Array.from(new Set(pairs.map((p) => p.worker_id)));
      const { data: ws } = wids.length
        ? await supabase.from("workers").select("id,full_name").in("id", wids).limit(2000)
        : { data: [] as any[] };
      const nameById = new Map((ws ?? []).map((w: any) => [String(w.id), String(w.full_name ?? "")]));
      const map: Record<string, { ids: string[]; names: string[] }> = {};
      for (const p of pairs) {
        const k = String(p.order_item_id);
        if (!map[k]) map[k] = { ids: [], names: [] };
        map[k].ids.push(String(p.worker_id));
        map[k].names.push(nameById.get(String(p.worker_id)) ?? String(p.worker_id));
      }
      setOrderItemWorkers(map);
    },
    [supabase]
  );

  const workerPickerFiltered = useMemo(() => {
    const q = workerPickerSearch.trim().toLowerCase();
    if (!q) return workers;
    return workers.filter((w) => {
      const hay = [w.full_name, w.passport_no, w.wp_number]
        .map((x) => String(x ?? "").toLowerCase())
        .join(" ");
      return hay.includes(q);
    });
  }, [workerPickerSearch, workers]);

  const ensureOrderItemId = useCallback(
    async (it: DraftItem) => {
      if (!editingId) return null;
      if (looksUuid(it.key)) return it.key;
      const svc = it.serviceId ? serviceById.get(it.serviceId) ?? null : null;
      const qty = Math.max(0, Math.floor(Number(it.quantity || 0)));
      if (!svc || qty <= 0) {
        setError("กรุณาเลือกบริการและจำนวนก่อน");
        return null;
      }
      const unit = Number(svc.sell_price || 0);
      const { data: created, error: e } = await supabase
        .from("order_items")
        .insert({ order_id: editingId, service_id: svc.id, quantity: qty, unit_price: unit, line_total: round2(unit * qty), description: it.note || null })
        .select("id")
        .single();
      if (e || !created?.id) {
        setError(e?.message ?? "สร้างรายการบริการไม่สำเร็จ");
        return null;
      }
      const newId = String((created as any).id);
      setItems((prev) => prev.map((x) => (x.key === it.key ? { ...x, key: newId } : x)));
      setLoadedOrderItemIds((prev) => (prev.includes(newId) ? prev : [...prev, newId]));
      setOrderItemWorkers((m) => {
        const old = m[it.key];
        if (!old) return m;
        const next = { ...m };
        delete next[it.key];
        next[newId] = old;
        return next;
      });
      return newId;
    },
    [editingId, serviceById, supabase]
  );

  const refreshOrderDocs = useCallback(
    async (orderId: string) => {
      if (!orderId) return;
      try {
        const [payRes, refRes] = await Promise.all([
          supabase
            .from("order_payments")
            .select("id,installment_no,amount,slip_url,slip_storage_provider,slip_storage_bucket,slip_storage_path,slip_file_name,created_at,confirmed_at")
            .eq("order_id", orderId)
            .order("installment_no", { ascending: true }),
          supabase
            .from("order_refunds")
            .select("id,amount,slip_url,slip_storage_provider,slip_storage_bucket,slip_storage_path,slip_file_name,created_at")
            .eq("order_id", orderId)
            .maybeSingle(),
        ]);
        const payErr = payRes.error && !isMissingTableError(payRes.error, "public.order_payments") ? payRes.error : null;
        const refErr = refRes.error && !isMissingTableError(refRes.error, "public.order_refunds") ? refRes.error : null;
        const firstErr = payErr ?? refErr;
        if (firstErr) {
          setError(firstErr.message);
          setOrderPayments([]);
          setOrderRefund(null);
          return;
        }
        setOrderPayments(((payRes.data ?? []) as unknown as OrderPaymentRow[]) ?? []);
        setOrderRefund((refRes.data as unknown as OrderRefundRow | null) ?? null);

        const docRes = await supabase
          .from("order_documents")
          .select("id,doc_type,storage_provider,storage_bucket,storage_path,file_name,drive_web_view_link,drive_file_id,created_at")
          .eq("order_id", orderId)
          .order("created_at", { ascending: false });
        if (docRes.error) {
          if (!isMissingTableError(docRes.error, "public.order_documents")) {
            setError(docRes.error.message);
          }
          setOrderDocuments([]);
          return;
        }
        setOrderDocuments(((docRes.data ?? []) as unknown as OrderDocumentRow[]) ?? []);
      } catch (e: any) {
        setError(e?.message ?? "โหลดเอกสารออเดอร์ไม่สำเร็จ");
        setOrderPayments([]);
        setOrderRefund(null);
        setOrderDocuments([]);
      }
    },
    [supabase]
  );

  const refreshOrderTransactions = useCallback(
    async (orderId: string) => {
      if (!orderId) {
        setOrderTransactions([]);
        return;
      }
      try {
        const res = await supabase
          .from("payment_transactions")
          .select("id,txn_type,source_type,amount,txn_date,expense_name,note")
          .eq("order_id", orderId)
          .order("txn_date", { ascending: false })
          .order("created_at", { ascending: false })
          .limit(2000);
        if (res.error) {
          if (!isMissingTableError(res.error, "public.payment_transactions")) setError(res.error.message);
          setOrderTransactions([]);
          return;
        }
        setOrderTransactions(((res.data ?? []) as unknown as FinanceTxnRow[]) ?? []);
      } catch (e: any) {
        setError(e?.message ?? "โหลดธุรกรรมออเดอร์ไม่สำเร็จ");
        setOrderTransactions([]);
      }
    },
    [supabase]
  );

  const refreshOrderEvents = useCallback(
    async (orderId: string) => {
      if (!orderId) {
        setEvents([]);
        return;
      }
      const sessionRes = await supabase.auth.getSession();
      const token = sessionRes.data.session?.access_token;
      if (!token) {
        setEvents([]);
        return;
      }
      const res = await fetch(`/api/orders/events?order_id=${encodeURIComponent(orderId)}`, {
        method: "GET",
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) {
        setEvents([]);
        return;
      }
      const data = (await res.json().catch(() => ({}))) as { events?: any[] };
      setEvents(((data.events ?? []) as EventRow[]) ?? []);
    },
    [supabase]
  );

  const addOrderEvent = useCallback(
    async (input: { orderId: string; eventType: string; message: string; entityTable?: string | null; entityId?: string | null }) => {
      const oid = String(input.orderId ?? "").trim();
      if (!oid) return;
      if (!userId) return;
      await supabase.from("order_events").insert({
        order_id: oid,
        event_type: input.eventType,
        message: input.message,
        entity_table: input.entityTable ?? null,
        entity_id: input.entityId ?? null,
        created_by_profile_id: userId,
      });
      await refreshOrderEvents(oid);
    },
    [refreshOrderEvents, supabase, userId]
  );

  const clearOrderIdParam = useCallback(() => {
    if (typeof window === "undefined") return;
    try {
      const url = new URL(window.location.href);
      if (!url.searchParams.has("order_id")) return;
      url.searchParams.delete("order_id");
      const q = url.searchParams.toString();
      const next = `${url.pathname}${q ? `?${q}` : ""}${url.hash ?? ""}`;
      window.history.replaceState({}, "", next);
    } catch {
      return;
    }
  }, []);

  const openOrderForEdit = useCallback(
    async (orderId: string) => {
      if (!canEdit) return;
      const id = String(orderId ?? "").trim();
      if (!id) return;
      setDownloadMenuOpen(false);
      setLoading(true);
      setError(null);
      try {
        const { data: ord, error: ordErr } = await supabase
          .from("orders")
          .select("id,status,display_id,source_quote_id,customer_id,total,paid_amount,remaining_amount,discount,include_vat,wht_rate")
          .eq("id", id)
          .single();
        if (ordErr) {
          setError(ordErr.message);
          setLoading(false);
          topRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
          return;
        }

        setEditingId((ord as any).id);
        setEditingStatus((ord as any).status);
        setEditingDisplayId((ord as any).display_id ?? null);
        setEditingSourceQuoteId((ord as any).source_quote_id ?? null);
        setEditingTotalAmount(Number((ord as any).total ?? 0));
        setEditingPaidAmount(Number((ord as any).paid_amount ?? 0));
        setEditingRemainingAmount(Number((ord as any).remaining_amount ?? 0));
        setShowForm(true);
        setCustomerId(String((ord as any).customer_id ?? ""));
        setDiscount(String((ord as any).discount ?? 0));
        setIncludeVat(!!(ord as any).include_vat);
        setWhtRate(String((ord as any).wht_rate ?? 3));

        const { data: itemRows, error: itemErr } = await supabase
          .from("order_items")
          .select("id,service_id,quantity,description")
          .eq("order_id", id)
          .order("created_at", { ascending: true });
        if (itemErr) {
          setError(itemErr.message);
          setItems([{ key: "1", serviceId: "", quantity: "1", note: "" }]);
          setLoadedOrderItemIds([]);
          setLoading(false);
          topRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
          return;
        }

        const mapped = ((itemRows ?? []) as OrderItemRow[])
          .map((x) => ({ key: x.id, serviceId: x.service_id ?? "", quantity: String(x.quantity ?? 1), note: x.description ?? "" }))
          .filter((x) => x.serviceId.length > 0);
        setItems(mapped.length ? mapped : [{ key: "1", serviceId: "", quantity: "1", note: "" }]);
        setLoadedOrderItemIds(mapped.map((x) => x.key));
        await refreshOrderItemWorkers(mapped.map((x) => x.key));
        refreshWorkersForCustomer(String((ord as any).customer_id ?? ""));
        await refreshOrderDocs(id);
        await refreshOrderTransactions(id);
        await refreshOrderEvents(id);
        await refreshDownloadDocsForOrder(id);
        setLoading(false);
        topRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
      } catch (e: any) {
        setError(e?.message ?? "โหลดข้อมูลออเดอร์ไม่สำเร็จ");
        setLoading(false);
        topRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
      }
    },
    [
      canEdit,
      refreshOrderDocs,
      refreshOrderEvents,
      refreshDownloadDocsForOrder,
      refreshOrderItemWorkers,
      refreshOrderTransactions,
      refreshWorkersForCustomer,
      supabase,
    ],
  );

  useEffect(() => {
    const target = searchParams.get("order_id");
    if (!target) return;
    if (!canEdit) return;
    if (autoOpenOrderIdRef.current === target) return;
    autoOpenOrderIdRef.current = target;
    clearOrderIdParam();
    openOrderForEdit(target);
  }, [canEdit, clearOrderIdParam, openOrderForEdit, searchParams]);

  useEffect(() => {
    const cid = String(customerId ?? "").trim();
    if (!editingId || !cid) {
      setEmployerLineStatus(null);
      return;
    }
    let cancelled = false;
    Promise.resolve().then(async () => {
      const res = await supabase.from("customer_line_connections").select("status").eq("customer_id", cid).maybeSingle();
      if (cancelled) return;
      if (res.error) {
        setEmployerLineStatus("NOT_CONNECTED");
        return;
      }
      const st = String((res.data as any)?.status ?? "NOT_CONNECTED");
      if (st === "CONNECTED" || st === "PENDING" || st === "ERROR" || st === "NOT_CONNECTED") setEmployerLineStatus(st);
      else setEmployerLineStatus("NOT_CONNECTED");
    });
    return () => {
      cancelled = true;
    };
  }, [customerId, editingId, supabase]);

  return (
    <div ref={topRef}>
      <div className="flex flex-col justify-between gap-3 md:flex-row md:items-end">
        {showForm && editingId ? (
          <div className="flex w-full flex-col justify-between gap-3 md:flex-row md:items-start">
            <div>
              <div className="text-xs font-medium text-gray-500">จัดการออเดอร์ / {editingDisplayId ?? "-"}</div>
              <Title as="h1" className="mt-1 text-xl font-semibold text-gray-900">
                ออเดอร์ {editingDisplayId ?? "-"}
              </Title>
              <Text className="mt-1 text-sm text-gray-600">อัปเดตสถานะงาน ผูกแรงงาน และจัดการเอกสารออเดอร์</Text>
            </div>
            <div className="flex flex-wrap items-center justify-end gap-2">
              {editingStatus === "draft" ? (
                <Button
                  size="sm"
                  variant="outline"
                  disabled={loading || !!firstInstallment}
                  onClick={() => {
                    setPayOrderId(editingId);
                    setPayOrderDisplayId(editingDisplayId ?? null);
                    setPayCustomerName(selectedCustomerName);
                    setPayTotal(editingTotalAmount);
                    setPayAmount("");
                    setPayOpen(true);
                  }}
                >
                  ออกใบแจ้งหนี้ (IV)
                </Button>
              ) : null}
              {editingStatus === "billed_first_installment" && canConfirmFirstInstallmentPayment ? (
                <Button
                  size="sm"
                  disabled={loading}
                  onClick={async () => {
                    if (!editingId) return;
                    setFirstIvOrderId(editingId);
                    setFirstIvOrderDisplayId(editingDisplayId ?? null);
                    setFirstIvCustomerName(selectedCustomerName);
                    setFirstIvTotal(editingTotalAmount);
                    setFirstIvPayAmount("");
                    setFirstIvPayNote("");
                    setFirstIvPayFile(null);
                    setFirstIvOpen(true);
                    try {
                      setFirstIvLoading(true);
                      setError(null);
                      const inv = await loadFirstInstallmentInvoice(editingId);
                      setFirstIvInvoice(inv);
                      if (inv?.grand_total != null) setFirstIvPayAmount(String(Number(inv.grand_total ?? 0)));
                    } catch (e: any) {
                      setFirstIvInvoice(null);
                      setError(e?.message ?? "โหลดใบแจ้งหนี้งวดแรกไม่สำเร็จ");
                    }
                    setFirstIvLoading(false);
                  }}
                >
                  ยืนยันชำระเงิน (แนบสลิป)
                </Button>
              ) : null}
              {editingStatus === "draft" && canStart ? (
                <Button
                  size="sm"
                  disabled={loading}
                  onClick={async () => {
                    if (!editingId) return;
                    setLoading(true);
                    setError(null);
                    try {
                      const sessionRes = await supabase.auth.getSession();
                      const token = sessionRes.data.session?.access_token;
                      if (!token) throw new Error("ยังไม่ได้เข้าสู่ระบบ");
                      const res = await fetch("/api/orders/start", {
                        method: "POST",
                        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
                        body: JSON.stringify({ orderId: editingId }),
                      });
                      const data = (await res.json().catch(() => ({}))) as { error?: string };
                      if (!res.ok) throw new Error(data.error || "เริ่มดำเนินการไม่สำเร็จ");
                      setEditingStatus("in_progress");
                      await refreshOrderEvents(editingId);
                      refresh();

                      try {
                        const lineRes = await fetch("/api/line/employer/send", {
                          method: "POST",
                          headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
                          body: JSON.stringify({ kind: "order", id: editingId }),
                        });
                        const lineData = (await lineRes.json().catch(() => ({}))) as any;
                        if (!lineRes.ok) {
                          const msg = String(lineData.error ?? "");
                          if (!msg.toLowerCase().includes("not connected")) toast(msg || "ส่ง LINE ไม่สำเร็จ");
                        }
                      } catch {
                      }
                    } catch (e: any) {
                      setError(e?.message ?? "เริ่มดำเนินการไม่สำเร็จ");
                    } finally {
                      setLoading(false);
                    }
                  }}
                >
                  เริ่มดำเนินการ
                </Button>
              ) : null}

              {editingId && (role === "admin" || role === "sale") && employerLineStatus === "CONNECTED" ? (
                <Button
                  size="sm"
                  variant="outline"
                  disabled={loading}
                  onClick={async () => {
                    if (!editingId) return;
                    setLoading(true);
                    setError(null);
                    try {
                      const sessionRes = await supabase.auth.getSession();
                      const token = sessionRes.data.session?.access_token;
                      if (!token) throw new Error("ยังไม่ได้เข้าสู่ระบบ");
                      const res = await fetch("/api/line/employer/send", {
                        method: "POST",
                        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
                        body: JSON.stringify({ kind: "order", id: editingId }),
                      });
                      const data = (await res.json().catch(() => ({}))) as any;
                      if (!res.ok) throw new Error(data.error || "ส่งไม่สำเร็จ");
                      toast.success("ส่งอัปเดต LINE แล้ว");
                    } catch (e: any) {
                      const msg = String(e?.message ?? "");
                      if (msg.toLowerCase().includes("not connected")) toast("นายจ้างยังไม่เชื่อมต่อ LINE");
                      else setError(msg || "ส่งไม่สำเร็จ");
                    } finally {
                      setLoading(false);
                    }
                  }}
                >
                  ส่งอัปเดต LINE
                </Button>
              ) : null}
              {hasDownloadMenu ? (
                <Popover isOpen={downloadMenuOpen} setIsOpen={setDownloadMenuOpen} shadow="sm" placement="bottom-end">
                  <Popover.Trigger>
                    <Button size="sm" variant="outline" type="button" disabled={loading} className="whitespace-nowrap">
                      ดาวน์โหลด
                      <PiCaretDownBold strokeWidth={3} className="ml-1.5 h-3.5 w-3.5 text-gray-500" />
                    </Button>
                  </Popover.Trigger>
                  <Popover.Content className="z-[9999] w-auto min-w-max p-2 [&>svg]:hidden">
                    <div className="flex flex-col gap-1">
                      {downloadDocsLoading && mayHaveFinanceDocs && !canDownloadInvoice && !canDownloadReceipt ? (
                        <div className="px-3 py-2 text-xs text-gray-500">กำลังโหลดเอกสาร...</div>
                      ) : null}
                      {canDownloadQuote ? (
                        <button
                          type="button"
                          className="w-full whitespace-nowrap rounded-md px-3 py-2 text-left text-sm text-gray-900 hover:bg-gray-100"
                          onClick={() => {
                            if (!editingSourceQuoteId) return;
                            setDownloadMenuOpen(false);
                            downloadQuotePdf(editingSourceQuoteId);
                          }}
                        >
                          ใบเสนอราคา
                        </button>
                      ) : null}
                      {canDownloadInvoice ? (
                        <button
                          type="button"
                          className="w-full whitespace-nowrap rounded-md px-3 py-2 text-left text-sm text-gray-900 hover:bg-gray-100"
                          onClick={async () => {
                            if (!downloadInvoice) return;
                            if (!downloadInvoice.doc_no) {
                              setDownloadMenuOpen(false);
                              setError("ใบแจ้งหนี้ยังไม่มีเลขที่เอกสาร จึงยังดาวน์โหลดไม่ได้");
                              return;
                            }
                            setDownloadMenuOpen(false);
                            setLoading(true);
                            setError(null);
                            try {
                              await downloadInvoicePdf(downloadInvoice);
                            } catch (e: any) {
                              setError(e?.message ?? "ดาวน์โหลดใบแจ้งหนี้ไม่สำเร็จ");
                            } finally {
                              setLoading(false);
                            }
                          }}
                        >
                          ใบแจ้งหนี้
                        </button>
                      ) : null}
                      {canDownloadReceipt ? (
                        <button
                          type="button"
                          className="w-full whitespace-nowrap rounded-md px-3 py-2 text-left text-sm text-gray-900 hover:bg-gray-100"
                          onClick={async () => {
                            if (!downloadReceipt) return;
                            if (!downloadReceipt.doc_no) {
                              setDownloadMenuOpen(false);
                              setError("ใบเสร็จรับเงินยังไม่มีเลขที่เอกสาร จึงยังดาวน์โหลดไม่ได้");
                              return;
                            }
                            setDownloadMenuOpen(false);
                            setLoading(true);
                            setError(null);
                            try {
                              await downloadReceiptPdf(downloadReceipt);
                            } catch (e: any) {
                              setError(e?.message ?? "ดาวน์โหลดใบเสร็จไม่สำเร็จ");
                            } finally {
                              setLoading(false);
                            }
                          }}
                        >
                          ใบเสร็จรับเงิน
                        </button>
                      ) : null}
                    </div>
                  </Popover.Content>
                </Popover>
              ) : null}
              <Button
                size="sm"
                variant="outline"
                onClick={() => {
                  setAddDocType("");
                  setAddDocFile(null);
                  setAddDocOpen(true);
                }}
                disabled={loading || !editingId}
              >
                เพิ่มเอกสาร
              </Button>
              <Button
                size="sm"
                variant="outline"
                disabled={loading}
                onClick={() => {
                  clearOrderIdParam();
                  resetForm();
                  setShowForm(false);
                }}
              >
                ปิด
              </Button>
            </div>
          </div>
        ) : (
          <>
            <div>
              <Title as="h1" className="text-lg font-semibold text-gray-900">
                ออเดอร์
              </Title>
              <Text className="mt-1 text-sm text-gray-600">จัดการบริการและผูกแรงงานให้ครบตามจำนวน</Text>
            </div>
            {!showForm ? (
              <div className="flex flex-wrap items-center gap-2">
                <TableSearch value={search} onChange={setSearch} />
                <Button variant="outline" onClick={() => setShowClosedOnly((v) => !v)} disabled={loading}>
                  {showClosedOnly ? "แสดงออเดอร์ที่กำลังดำเนินการ" : "แสดงออเดอร์ที่ปิดแล้ว"}
                </Button>
              </div>
            ) : null}
          </>
        )}
      </div>

      <Modal
        isOpen={workerPickerOpen && canEdit}
        onClose={() => {
          setWorkerPickerSearch("");
          setWorkerPickerOpen(false);
        }}
        size="lg"
        rounded="md"
      >
        <div className="border-b border-gray-200 px-5 py-4">
          <div className="text-sm font-semibold text-gray-900">เลือกแรงงานสำหรับบริการ</div>
          <div className="mt-1 text-xs text-gray-600">ต้องเลือกให้ครบ {workerPickerExpected} คน</div>
        </div>
        <div className="max-h-[70vh] overflow-auto px-5 py-4">
          <div className="mb-3">
            <TableSearch value={workerPickerSearch} onChange={setWorkerPickerSearch} disabled={loading} />
          </div>
          {workers.length === 0 ? <div className="text-sm text-gray-600">ยังไม่มีแรงงานของลูกค้านี้</div> : null}
          <div className="space-y-2">
            {workerPickerFiltered.map((w) => {
              const checked = workerPickerSelected.includes(w.id);
              const disabled = !checked && workerPickerSelected.length >= workerPickerExpected;
              return (
                <label key={w.id} className={`flex items-center justify-between rounded-lg border border-gray-200 bg-white px-3 py-2 ${disabled ? "opacity-60" : ""}`}>
                  <div className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      checked={checked}
                      disabled={disabled}
                      onChange={(e) => {
                        const nextChecked = e.target.checked;
                        setWorkerPickerSelected((prev) => {
                          if (nextChecked) {
                            if (prev.includes(w.id)) return prev;
                            if (prev.length >= workerPickerExpected) return prev;
                            return [...prev, w.id];
                          }
                          return prev.filter((x) => x !== w.id);
                        });
                      }}
                    />
                    <div className="min-w-0">
                      <div className="truncate text-sm font-medium text-gray-900">{w.full_name}</div>
                      <div className="mt-0.5 truncate text-xs text-gray-600">เพศ: {w.os_sex || "-"} • WP: {w.wp_number || "-"}</div>
                    </div>
                  </div>
                </label>
              );
            })}
          </div>
        </div>
        <div className="flex items-center justify-between gap-2 border-t border-gray-200 px-5 py-4">
          <Button variant="outline" onClick={() => setWorkerPickerOpen(false)} disabled={loading}>
            ยกเลิก
          </Button>
          <Button
            onClick={async () => {
              if (!workerPickerOrderItemId) return;
              if (workerPickerExpected <= 0) return;
              if (workerPickerSelected.length !== workerPickerExpected) return;
              setLoading(true);
              setError(null);

              const it = items.find((x) => x.key === workerPickerOrderItemId) ?? null;
              const realOrderItemId = it ? await ensureOrderItemId(it) : workerPickerOrderItemId;
              if (!realOrderItemId) {
                setLoading(false);
                return;
              }

              await supabase.from("order_item_workers").delete().eq("order_item_id", realOrderItemId);
              const { error: insErr } = await supabase.from("order_item_workers").insert(
                workerPickerSelected.map((wid) => ({
                  order_item_id: realOrderItemId,
                  worker_id: wid,
                  created_by_profile_id: userId,
                }))
              );
              if (insErr) {
                setError(insErr.message);
                setLoading(false);
                return;
              }

              const selectedWorkers = workerPickerSelected
                .map((id) => workerById.get(id) ?? null)
                .filter(Boolean) as WorkerOption[];
              const note = workerPickerSelected
                .map((id) => {
                  const w = workerById.get(id) ?? null;
                  return w ? workerLine(w) : String(id);
                })
                .join("\n");

              await supabase.from("order_items").update({ description: note || null }).eq("id", realOrderItemId);

              const names = selectedWorkers.map((w) => w.full_name);
              setOrderItemWorkers((m) => ({ ...m, [realOrderItemId]: { ids: [...workerPickerSelected], names } }));
              setItems((prev) => prev.map((x) => (x.key === realOrderItemId ? { ...x, note } : x)));

              if (editingId) {
                const itServiceName = (() => {
                  const key = it?.serviceId ? String(it.serviceId) : "";
                  const svc = key ? serviceById.get(key) ?? null : null;
                  return svc?.name ? `(${svc.name})` : "";
                })();
                const msg = `เลือกแรงงาน${itServiceName}: ${names.join(", ")}`.trim();
                await addOrderEvent({
                  orderId: editingId,
                  eventType: "workers_selected",
                  message: msg,
                  entityTable: "order_items",
                  entityId: realOrderItemId,
                });
              }

              setLoading(false);
              setWorkerPickerSearch("");
              setWorkerPickerOpen(false);
            }}
            disabled={loading || !workerPickerOrderItemId || workerPickerExpected <= 0 || workerPickerSelected.length !== workerPickerExpected}
          >
            บันทึก
          </Button>
        </div>
      </Modal>

      {showForm && canEdit ? (
        <div className="mt-5 grid gap-4">
          {!editingId ? (
            <AppSelect
              label="ลูกค้า"
              placeholder="เลือก"
              options={customerOptions}
              value={customerId}
              onChange={(v: string) => setCustomerId(v)}
              getOptionValue={(o) => o.value}
              displayValue={(selected) => customerOptions.find((o) => o.value === selected)?.label ?? ""}
              disabled={!canEditCustomer}
              autoFocus={!editingId}
              inPortal={false}
            />
          ) : null}

          {editingId ? (
            <div className="mt-4 grid items-start gap-4 lg:grid-cols-[1.6fr_0.9fr]">
              <div className="grid gap-4">
                <div className="rounded-xl border border-gray-200 bg-white p-4">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="text-sm font-semibold text-gray-900">ข้อมูลออเดอร์</div>
                  </div>
                  <div className="mt-2 grid gap-2 text-sm text-gray-700">
                    <div className="flex items-center justify-between">
                      <div className="text-gray-600">ลูกค้า</div>
                      <div className="truncate font-semibold text-gray-900">{selectedCustomerName}</div>
                    </div>
                    <div className="flex items-center justify-between">
                      <div className="text-gray-600">สถานะ</div>
                      <div className="font-medium text-gray-900">{statusLabel(editingStatus ?? "-")}</div>
                    </div>
                    <div className="flex items-center justify-between">
                      <div className="text-gray-600">งวดแรก</div>
                      <div className="font-medium text-gray-900">
                        {firstInstallment ? `ชำระแล้ว (${asMoney(Number(firstInstallment.amount ?? 0))})` : "ยังไม่ชำระ"}
                      </div>
                    </div>
                    <div className="flex items-center justify-between">
                      <div className="text-gray-600">แรงงาน</div>
                      <div className={`font-medium ${workersComplete ? "text-gray-900" : "text-red-600"}`}>{workersComplete ? "ครบตามจำนวน" : "ยังไม่ครบตามจำนวน"}</div>
                    </div>
                  </div>
                {editingStatus === "in_progress" ? (
                  <div className="mt-3 flex flex-wrap gap-2">
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={loading}
                      onClick={() => {
                        setCancelOrderId(editingId);
                        setCancelOrderDisplayId(editingDisplayId ?? null);
                        setCancelCustomerName(selectedCustomerName);
                        setCancelTotal(editingTotalAmount);
                        setCancelAmount("");
                        setCancelFile(null);
                        setCancelOpen(true);
                      }}
                    >
                      ยกเลิกออเดอร์
                    </Button>
                  </div>
                ) : null}
                </div>

                <div className="rounded-xl border border-gray-200 bg-white">
                  <div className="flex flex-wrap items-center justify-between gap-2 border-b border-gray-200 px-4 py-3">
                    <div className="text-sm font-semibold text-gray-900">งานบริการในออเดอร์</div>
                  </div>

                  <div className="space-y-3 p-3">
                    {items.length === 0 ? <div className="text-sm text-gray-600">ยังไม่มีบริการ</div> : null}
                    {items.map((it) => {
                      const svc = it.serviceId ? serviceById.get(it.serviceId) ?? null : null;
                      const qty = Math.max(0, Math.floor(Number(it.quantity || 0)));
                      const assigned = orderItemWorkers[it.key]?.ids?.length ?? 0;
                      const complete = qty > 0 && assigned === qty;

                      return (
                        <div key={it.key} className="rounded-xl border border-gray-200 bg-white p-3">
                          <div className="flex flex-wrap items-start justify-between gap-3">
                            <div className="min-w-0">
                              <div className="text-xs font-semibold text-gray-600">บริการ</div>
                              <div className="mt-1">
                                {canEditItems ? (
                                  <AppSelect
                                    placeholder="เลือก"
                                    options={serviceOptions}
                                    value={it.serviceId}
                                    onChange={(v: string) => {
                                      setItems((prev) => prev.map((x) => (x.key === it.key ? { ...x, serviceId: v } : x)));
                                    }}
                                    getOptionValue={(o) => o.value}
                                    displayValue={(selected) => serviceOptions.find((o) => o.value === selected)?.label ?? ""}
                                    disabled={!canEditItems}
                                    selectClassName="h-10 px-3"
                                    inPortal={false}
                                  />
                                ) : (
                                  <div className="text-sm font-semibold text-gray-900">{svc?.name ?? "-"}</div>
                                )}
                              </div>
                            </div>

                            <div className="flex shrink-0 flex-col items-end gap-2">
                              <div className="text-xs font-semibold text-gray-600">จำนวน</div>
                              {canEditItems ? (
                                <input
                                  className="h-10 w-24 rounded-md border border-gray-200 bg-white px-3 text-center text-sm"
                                  inputMode="numeric"
                                  value={it.quantity}
                                  onChange={(e) => {
                                    const v = e.target.value;
                                    setItems((prev) => prev.map((x) => (x.key === it.key ? { ...x, quantity: v } : x)));
                                  }}
                                  disabled={!canEditItems}
                                />
                              ) : (
                                <div className="rounded-md border border-gray-200 bg-gray-50 px-3 py-2 text-sm font-semibold text-gray-900">{qty || 0}</div>
                              )}

                              <div className={`text-[11px] font-semibold ${complete ? "text-gray-600" : "text-red-600"}`}>
                                แรงงาน {assigned}/{qty || 0}
                              </div>
                            </div>
                          </div>

                          <div className="mt-3">
                            <div className="text-xs font-semibold text-gray-600">แรงงานที่ผูก</div>
                            <div className="mt-2 min-h-10 rounded-lg border border-gray-200 bg-gray-50 p-2">
                              {(orderItemWorkers[it.key]?.ids?.length ?? 0) > 0 ? (
                                <div className="flex flex-col gap-2">
                                  {orderItemWorkers[it.key].ids.map((id, idx) => {
                                    const w = workerById.get(id) ?? null;
                                    const label = w ? workerLine(w) : orderItemWorkers[it.key]?.names?.[idx] ?? id;
                                    return (
                                      <div key={id} title={label} className="truncate rounded-md border border-gray-200 bg-white px-2 py-1 text-xs text-gray-800 whitespace-nowrap">
                                        {label}
                                      </div>
                                    );
                                  })}
                                </div>
                              ) : (
                                <div className="flex flex-col gap-2">
                                  {it.note
                                    ? it.note
                                        .split("\n")
                                        .map((x) => x.trim())
                                        .filter(Boolean)
                                        .map((line, idx) => (
                                          <div
                                            key={`${it.key}-note-${idx}`}
                                            title={line}
                                            className="truncate rounded-md border border-gray-200 bg-white px-2 py-1 text-xs text-gray-800 whitespace-nowrap"
                                          >
                                            {line}
                                          </div>
                                        ))
                                    : <div className="text-xs text-gray-500">-</div>}
                                </div>
                              )}
                            </div>
                          </div>

                          <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
                            <div className="text-xs text-gray-600">เลือกแรงงานให้ครบตามจำนวนของบริการ</div>

                            <button
                              type="button"
                              className="h-9 rounded-md border border-gray-200 bg-white px-3 text-xs font-semibold text-gray-700 hover:bg-gray-100"
                              disabled={!canAssignWorkers || qty <= 0 || !editingId}
                              onClick={async () => {
                                const realId = looksUuid(it.key) ? it.key : await ensureOrderItemId(it);
                                if (!realId) return;
                                refreshWorkersForCustomer(customerId);
                                setWorkerPickerOrderItemId(realId);
                                setWorkerPickerExpected(qty);
                                setWorkerPickerSelected(orderItemWorkers[realId]?.ids ?? orderItemWorkers[it.key]?.ids ?? []);
                                setWorkerPickerSearch("");
                                setWorkerPickerOpen(true);
                              }}
                            >
                              เลือกแรงงาน
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>

              <div className="grid h-fit gap-4 lg:sticky lg:top-4">
                <div className="rounded-xl border border-gray-200 bg-white p-4">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="text-sm font-semibold text-gray-900">ข้อมูลการเงิน</div>
                    <div className="flex flex-wrap items-center justify-end gap-2">
                    </div>
                  </div>
                  <div className="mt-2 grid gap-2 text-sm text-gray-700">
                    <div className="flex items-center justify-between gap-3">
                      <div className="text-gray-600">ยอดสุทธิ</div>
                      <div className="font-semibold text-gray-900">{asMoney(editingTotalAmount)}</div>
                    </div>
                    <div className="flex items-center justify-between gap-3">
                      <div className="text-gray-600">ยอดชำระแล้ว</div>
                      <div className="font-medium text-gray-900">{asMoney(editingPaidAmount)}</div>
                    </div>
                    <div className="flex items-center justify-between gap-3">
                      <div className="text-gray-600">ยอดคงเหลือ</div>
                      <div className="font-medium text-gray-900">{asMoney(editingRemainingAmount)}</div>
                    </div>
                  </div>

                {!isLockedFromQuote ? (
                  <div className="mt-3 border-t border-gray-200 pt-3">
                    <Button
                      className="w-full"
                      onClick={async () => {
                        if (!canSave) return;
                        setLoading(true);
                        setError(null);

                        const normalizedItems = items
                          .map((it) => {
                            const svc = it.serviceId ? serviceById.get(it.serviceId) ?? null : null;
                            const qty = Math.max(0, Math.floor(Number(it.quantity || 0)));
                            if (!svc || qty <= 0) return null;
                            const unit = Number(svc.sell_price || 0);
                            return {
                              key: it.key,
                              service_id: svc.id,
                              quantity: qty,
                              unit_price: unit,
                              line_total: round2(unit * qty),
                              description: it.note?.trim() ? it.note.trim() : null,
                            };
                          })
                          .filter(Boolean) as {
                          key: string;
                          service_id: string;
                          quantity: number;
                          unit_price: number;
                          line_total: number;
                          description: string | null;
                        }[];

                        if (!customerId || normalizedItems.length === 0) {
                          setError("กรุณาเลือกลูกค้าและเพิ่มอย่างน้อย 1 บริการ");
                          setLoading(false);
                          return;
                        }

                        const orderPayload = {
                          customer_id: customerId,
                          status: "draft",
                          subtotal: computed.subtotal,
                          discount: computed.discount,
                          include_vat: computed.includeVat,
                          vat_rate: computed.vatRate,
                          vat_amount: computed.vatAmount,
                          wht_rate: computed.whtRate,
                          wht_amount: computed.whtAmount,
                          total: computed.total,
                          created_by_profile_id: userId,
                        };

                        if (!editingId) {
                          setError("ไม่พบออเดอร์");
                          setLoading(false);
                          return;
                        }
                        if (!canEditOrder) {
                          setError("ออเดอร์นี้อยู่ระหว่างดำเนินการแล้ว ไม่สามารถแก้ไขรายการได้");
                          setLoading(false);
                          return;
                        }

                        const { error: upErr } = await supabase.from("orders").update(orderPayload).eq("id", editingId);
                        if (upErr) {
                          setError(upErr.message);
                          setLoading(false);
                          return;
                        }

                        const currentIds = normalizedItems.map((x) => x.key).filter(looksUuid);
                        const removedIds = loadedOrderItemIds.filter((id) => !currentIds.includes(id));
                        if (removedIds.length) {
                          await supabase.from("order_item_workers").delete().in("order_item_id", removedIds);
                          const { error: delErr } = await supabase.from("order_items").delete().in("id", removedIds);
                          if (delErr) {
                            setError(delErr.message);
                            setLoading(false);
                            return;
                          }
                        }

                        const toUpdate = normalizedItems.filter((x) => looksUuid(x.key));
                        if (toUpdate.length) {
                          const results = await Promise.all(
                            toUpdate.map((x) =>
                              supabase
                                .from("order_items")
                                .update({
                                  service_id: x.service_id,
                                  quantity: x.quantity,
                                  unit_price: x.unit_price,
                                  line_total: x.line_total,
                                  description: x.description,
                                })
                                .eq("id", x.key)
                            )
                          );
                          const firstErr = results.find((r) => (r as any).error)?.error as any;
                          if (firstErr) {
                            setError(firstErr.message);
                            setLoading(false);
                            return;
                          }
                        }

                        const toInsert = normalizedItems.filter((x) => !looksUuid(x.key));
                        if (toInsert.length) {
                          const { error: insItemsErr } = await supabase.from("order_items").insert(
                            toInsert.map((x) => ({
                              order_id: editingId,
                              service_id: x.service_id,
                              quantity: x.quantity,
                              unit_price: x.unit_price,
                              line_total: x.line_total,
                              description: x.description,
                            }))
                          );
                          if (insItemsErr) {
                            setError(insItemsErr.message);
                            setLoading(false);
                            return;
                          }
                        }

                        setLoading(false);
                        refresh();
                      }}
                      disabled={loading || !canSave || !canEditOrder}
                    >
                      อัปเดต
                    </Button>
                  </div>
                ) : null}
                </div>

                <div className="overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-sm">
                  <div className="flex items-center justify-between gap-2 bg-white px-4 py-3">
                    <div className="text-sm font-semibold text-gray-900">รายการเอกสาร</div>
                  </div>
                  <div className="p-3">
                    {!hasAnyDocs ? (
                      <div className="rounded-xl border border-dashed border-gray-200 bg-gray-50 p-3 text-sm text-gray-600">
                        ยังไม่มีรายการเอกสาร
                      </div>
                    ) : null}

                    {hasRefundSlip ? (
                      <div className="mt-4">
                        <div className="text-sm font-semibold text-gray-900">Slip คืนเงิน / เอกสารยกเลิก</div>
                        <div className="mt-2 space-y-2">
                          <button
                            type="button"
                            className="flex w-full flex-wrap items-center justify-between gap-2 rounded-xl border border-gray-200 bg-white px-3 py-2 text-left transition-colors hover:bg-gray-50"
                            onClick={async () => {
                              setError(null);
                              setDocViewerTitle("Slip คืนเงิน / เอกสารยกเลิก");
                              setDocViewerLoading(true);
                              setDocViewerOpen(true);
                              if (String(orderRefund?.slip_storage_provider ?? "") === "supabase") {
                                setDocViewerSource({ table: "order_refunds", id: orderRefund!.id });
                                setDocViewerUrl(null);
                                setDocViewerDownloadUrl(null);
                                setDocViewerIsDirectFile(true);
                                try {
                                  const url = await getSignedStorageUrl({ supabase, table: "order_refunds", id: orderRefund!.id, disposition: "inline" });
                                  setDocViewerUrl(url);
                                } catch (e: any) {
                                  setError(e?.message ?? "โหลดสลิปไม่สำเร็จ");
                                }
                                setDocViewerLoading(false);
                                return;
                              }
                              if (!orderRefund?.slip_url) {
                                setError("ไม่พบลิงก์สลิป");
                                setDocViewerLoading(false);
                                return;
                              }
                              setDocViewerSource(null);
                              setDocViewerUrl(orderRefund!.slip_url);
                              setDocViewerDownloadUrl(orderRefund!.slip_url);
                              setDocViewerIsDirectFile(true);
                              setDocViewerLoading(false);
                            }}
                          >
                            <div className="text-sm text-gray-800">คืนเงิน • {asMoney(Number(orderRefund?.amount ?? 0))} บาท</div>
                            <span className="inline-flex items-center rounded-full border border-gray-200 bg-gray-100 px-2 py-0.5 text-xs font-semibold text-gray-700">
                              {formatShortDate(orderRefund?.created_at)}
                            </span>
                          </button>
                        </div>
                      </div>
                    ) : null}

                    {hasOtherDocs ? (
                      <div className="mt-4">
                        <div className="text-sm font-semibold text-gray-900">เอกสารอื่นๆ</div>
                        <div className="mt-2 space-y-2">
                          {orderDocuments.map((d) => (
                            <div
                              key={d.id}
                              className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-gray-200 bg-white px-3 py-2 transition-colors hover:bg-gray-50"
                            >
                              <div className="min-w-0">
                                <div className="truncate text-sm font-semibold text-gray-900">{d.doc_type || "เอกสาร"}</div>
                                <div className="mt-1">
                                  <span className="inline-flex items-center rounded-full border border-gray-200 bg-gray-100 px-2 py-0.5 text-xs font-semibold text-gray-700">
                                    {formatShortDate(d.created_at)}
                                  </span>
                                </div>
                              </div>
                              <button
                                type="button"
                                className="inline-flex h-8 items-center rounded-full bg-blue-50 px-3 text-xs font-semibold text-blue-700 hover:bg-blue-100"
                                onClick={async () => {
                                  setError(null);
                                  setDocViewerTitle(d.doc_type || "เอกสาร");
                                  setDocViewerLoading(true);
                                  setDocViewerOpen(true);
                                  if (String(d.storage_provider ?? "") === "supabase") {
                                    setDocViewerSource({ table: "order_documents", id: d.id });
                                    setDocViewerUrl(null);
                                    setDocViewerDownloadUrl(null);
                                    setDocViewerIsDirectFile(true);
                                    try {
                                      const url = await getSignedStorageUrl({ supabase, table: "order_documents", id: d.id, disposition: "inline" });
                                      setDocViewerUrl(url);
                                    } catch (e: any) {
                                      setError(e?.message ?? "โหลดเอกสารไม่สำเร็จ");
                                    }
                                    setDocViewerLoading(false);
                                  } else if (d.drive_web_view_link) {
                                    setDocViewerSource(null);
                                    setDocViewerUrl(drivePreviewUrl(d.drive_web_view_link, d.drive_file_id));
                                    setDocViewerDownloadUrl(driveDownloadUrl(d.drive_web_view_link, d.drive_file_id));
                                    setDocViewerIsDirectFile(false);
                                    setDocViewerLoading(false);
                                  } else {
                                    setDocViewerSource(null);
                                    setDocViewerUrl(null);
                                    setDocViewerLoading(false);
                                  }
                                }}
                              >
                                ดู
                              </button>
                            </div>
                          ))}
                        </div>
                      </div>
                    ) : null}
                  </div>
                </div>

                <div className="overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-sm">
                  <div className="flex items-center justify-between gap-2 bg-white px-4 py-3">
                    <div className="text-sm font-semibold text-gray-900">รายการธุรกรรม</div>
                  </div>
                  <div className="p-3">
                    {orderTransactions.length === 0 ? (
                      <div className="rounded-xl border border-dashed border-gray-200 bg-gray-50 p-3 text-sm text-gray-600">{loading ? "กำลังโหลด..." : "ยังไม่มีรายการธุรกรรม"}</div>
                    ) : (
                      <div className="grid gap-2">
                        {orderTransactions.slice(0, 12).map((t) => {
                          const isIncome = String(t.txn_type) === "INCOME";
                          const typeText = isIncome ? "รายรับ" : "รายจ่าย";
                          const detail = [t.expense_name, t.note].filter(Boolean).join(" • ");
                          return (
                            <div key={t.id} className="rounded-xl border border-gray-200 bg-white p-3">
                              <div className="flex items-start justify-between gap-2">
                                <div className={isIncome ? "text-sm font-semibold text-green-700" : "text-sm font-semibold text-red-700"}>
                                  {typeText} • {asMoney(Number(t.amount ?? 0))} บาท
                                </div>
                                <span className="inline-flex items-center rounded-full border border-gray-200 bg-gray-100 px-2 py-0.5 text-xs font-semibold text-gray-700">
                                  {t.txn_date ?? "-"}
                                </span>
                              </div>
                              {detail ? <div className="mt-1 text-xs text-gray-600">{detail}</div> : null}
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                </div>

                <div className="overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-sm">
                  <div className="flex items-center justify-between gap-2 bg-white px-4 py-3">
                    <div className="text-sm font-semibold text-gray-900">ประวัติการทำรายการ</div>
                  </div>
                  <div className="p-3">
                    {events.length === 0 ? (
                      <div className="rounded-xl border border-dashed border-gray-200 bg-gray-50 p-3 text-sm text-gray-600">{loading ? "กำลังโหลด..." : "ยังไม่มีประวัติ"}</div>
                    ) : (
                      <div className="grid gap-2">
                        {events.map((ev) => (
                          <div key={ev.id} className="rounded-xl border border-gray-200 bg-white p-3">
                            <div className="text-sm font-semibold text-gray-900">{ev.message}</div>
                            <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-gray-600">
                              <span className="inline-flex items-center rounded-full border border-gray-200 bg-gray-100 px-2 py-0.5 font-semibold text-gray-700">
                                {formatDateTime(ev.created_at)}
                              </span>
                              {ev.created_by_email ? <span className="truncate">{ev.created_by_email}</span> : null}
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </div>
          ) : (
            <>
              <div className="rounded-xl border border-gray-200 bg-white">
                <div className="flex flex-wrap items-center justify-between gap-2 border-b border-gray-200 px-4 py-3">
                  <div className="text-sm font-semibold text-gray-900">งานบริการในออเดอร์</div>
                  <div className="text-xs text-gray-600">เพิ่มบริการและระบุจำนวน</div>
                </div>
                <div className="space-y-3 p-3">
                  {items.length === 0 ? <div className="text-sm text-gray-600">ยังไม่มีบริการ</div> : null}
                  {items.map((it) => {
                    const svc = it.serviceId ? serviceById.get(it.serviceId) ?? null : null;
                    const qty = Math.max(0, Math.floor(Number(it.quantity || 0)));
                    const assigned = orderItemWorkers[it.key]?.ids?.length ?? 0;
                    const complete = qty > 0 && assigned === qty;

                    return (
                      <div key={it.key} className="rounded-xl border border-gray-200 bg-white p-3">
                        <div className="flex flex-wrap items-start justify-between gap-3">
                          <div className="min-w-0">
                            <div className="text-xs font-semibold text-gray-600">บริการ</div>
                            <div className="mt-1">
                              {canEditItems ? (
                                <AppSelect
                                  placeholder="เลือก"
                                  options={serviceOptions}
                                  value={it.serviceId}
                                  onChange={(v: string) => {
                                    setItems((prev) => prev.map((x) => (x.key === it.key ? { ...x, serviceId: v } : x)));
                                  }}
                                  getOptionValue={(o) => o.value}
                                  displayValue={(selected) => serviceOptions.find((o) => o.value === selected)?.label ?? ""}
                                  disabled={!canEditItems}
                                  selectClassName="h-10 px-3"
                                  inPortal={false}
                                />
                              ) : (
                                <div className="text-sm font-semibold text-gray-900">{svc?.name ?? "-"}</div>
                              )}
                            </div>
                          </div>

                          <div className="flex shrink-0 flex-col items-end gap-2">
                            <div className="text-xs font-semibold text-gray-600">จำนวน</div>
                            <input
                              className="h-10 w-24 rounded-md border border-gray-200 bg-white px-3 text-center text-sm"
                              inputMode="numeric"
                              value={it.quantity}
                              onChange={(e) => {
                                const v = e.target.value;
                                setItems((prev) => prev.map((x) => (x.key === it.key ? { ...x, quantity: v } : x)));
                              }}
                              disabled={!canEditItems}
                            />
                            <div className={`text-[11px] font-semibold ${complete ? "text-gray-600" : "text-red-600"}`}>
                              แรงงาน {assigned}/{qty || 0}
                            </div>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              <div className="flex flex-wrap gap-2">
                {!isLockedFromQuote ? (
                  <Button
                    onClick={async () => {
                    if (!canSave) return;
                    setLoading(true);
                    setError(null);

                    const normalizedItems = items
                      .map((it) => {
                        const svc = it.serviceId ? serviceById.get(it.serviceId) ?? null : null;
                        const qty = Math.max(0, Math.floor(Number(it.quantity || 0)));
                        if (!svc || qty <= 0) return null;
                        const unit = Number(svc.sell_price || 0);
                        return {
                          key: it.key,
                          service_id: svc.id,
                          quantity: qty,
                          unit_price: unit,
                          line_total: round2(unit * qty),
                          description: it.note?.trim() ? it.note.trim() : null,
                        };
                      })
                      .filter(Boolean) as {
                      key: string;
                      service_id: string;
                      quantity: number;
                      unit_price: number;
                      line_total: number;
                      description: string | null;
                    }[];

                    if (!customerId || normalizedItems.length === 0) {
                      setError("กรุณาเลือกลูกค้าและเพิ่มอย่างน้อย 1 บริการ");
                      setLoading(false);
                      return;
                    }

                    const orderPayload = {
                      customer_id: customerId,
                      status: "draft",
                      subtotal: computed.subtotal,
                      discount: computed.discount,
                      include_vat: computed.includeVat,
                      vat_rate: computed.vatRate,
                      vat_amount: computed.vatAmount,
                      wht_rate: computed.whtRate,
                      wht_amount: computed.whtAmount,
                      total: computed.total,
                      created_by_profile_id: userId,
                    };

                    const { data: created, error: insErr } = await supabase
                      .from("orders")
                      .insert(orderPayload)
                      .select("id")
                      .single();
                    if (insErr || !created?.id) {
                      setError(insErr?.message ?? "สร้างออเดอร์ไม่สำเร็จ");
                      setLoading(false);
                      return;
                    }
                    const orderId = (created as { id: string }).id;
                    const { error: insItemsErr } = await supabase
                      .from("order_items")
                      .insert(
                        normalizedItems.map((x) => ({
                          order_id: orderId,
                          service_id: x.service_id,
                          quantity: x.quantity,
                          unit_price: x.unit_price,
                          line_total: x.line_total,
                          description: x.description,
                        }))
                      );
                    if (insItemsErr) {
                      setError(insItemsErr.message);
                      setLoading(false);
                      return;
                    }

                    resetForm();
                    setShowForm(false);
                    setLoading(false);
                    refresh();
                    }}
                    disabled={loading || !canSave || !canEditOrder}
                  >
                    บันทึกออเดอร์
                  </Button>
                ) : null}
              </div>
            </>
          )}
        </div>
      ) : null}

      {error ? <div className="mt-4 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">{error}</div> : null}

      {!showForm ? (
        <div className="mt-4 overflow-hidden rounded-xl border border-gray-200 bg-white">
          <div className="overflow-x-auto">
            <div className="min-w-[980px] overflow-hidden rounded-xl">
              <div className="grid grid-cols-[0.8fr_1.6fr_0.8fr_0.9fr_0.9fr_0.9fr] gap-3 border-b border-gray-200 bg-gray-50 px-4 py-2 text-xs font-semibold text-gray-600">
                <div>ID</div>
                <div>ลูกค้า</div>
                <div>สถานะ</div>
                <div className="text-right">ยอดสุทธิ</div>
                <div className="text-right">ยอดชำระแล้ว</div>
                <div className="text-right">ยอดคงเหลือ</div>
              </div>
              {rows.length === 0 ? (
                <div className="px-4 py-8 text-sm text-gray-500">{loading ? "กำลังโหลด..." : "ยังไม่มีข้อมูล"}</div>
              ) : (
                table.getRowModel().rows.map((row) => {
                  const r = row.original as OrderRow;
                  return (
                    <div
                      key={r.id}
                      role={canEdit ? "button" : undefined}
                      tabIndex={canEdit ? 0 : undefined}
                      className={`grid grid-cols-[0.8fr_1.6fr_0.8fr_0.9fr_0.9fr_0.9fr] items-center gap-3 border-b border-gray-100 px-4 py-3 last:border-b-0 ${
                        canEdit ? "cursor-pointer transition-colors hover:bg-gray-100 active:bg-gray-200" : ""
                      }`}
                      onClick={async () => {
                        if (!canEdit) return;
                        setLoading(true);
                        setError(null);
                        setEditingId(r.id);
                        setEditingStatus(r.status);
                        setEditingDisplayId(r.display_id ?? null);
                        setEditingSourceQuoteId((r as any).source_quote_id ?? null);
                        setEditingTotalAmount(Number(r.total ?? 0));
                        setEditingPaidAmount(Number(r.paid_amount ?? 0));
                        setEditingRemainingAmount(Number(r.remaining_amount ?? 0));
                        setShowForm(true);
                        setCustomerId(r.customer_id);
                        setDiscount(String(r.discount ?? 0));
                        setIncludeVat(!!r.include_vat);
                        setWhtRate(String(r.wht_rate ?? 3));

                        const { data: itemRows, error: itemErr } = await supabase
                          .from("order_items")
                          .select("id,service_id,quantity,description")
                          .eq("order_id", r.id)
                          .order("created_at", { ascending: true });
                        if (itemErr) {
                          setError(itemErr.message);
                          setItems([{ key: "1", serviceId: "", quantity: "1", note: "" }]);
                          setLoadedOrderItemIds([]);
                          setLoading(false);
                          topRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
                          return;
                        }

                        const mapped = ((itemRows ?? []) as OrderItemRow[])
                          .map((x) => ({ key: x.id, serviceId: x.service_id ?? "", quantity: String(x.quantity ?? 1), note: x.description ?? "" }))
                          .filter((x) => x.serviceId.length > 0);
                        setItems(mapped.length ? mapped : [{ key: "1", serviceId: "", quantity: "1", note: "" }]);
                        setLoadedOrderItemIds(mapped.map((x) => x.key));
                        await refreshOrderItemWorkers(mapped.map((x) => x.key));
                        refreshWorkersForCustomer(r.customer_id);
                        await refreshOrderDocs(r.id);
                        await refreshOrderTransactions(r.id);
                        await refreshOrderEvents(r.id);
                        setLoading(false);
                        topRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
                      }}
                      onKeyDown={(e) => {
                        if (!canEdit) return;
                        if (e.key !== "Enter") return;
                        (e.currentTarget as HTMLDivElement).click();
                      }}
                    >
                      <div className="text-sm font-medium text-gray-900">{r.display_id ?? "-"}</div>
                      <div className="text-sm font-medium text-gray-900">{customerNameFromRel(r.customers ?? null)}</div>
                      <div className="text-sm text-gray-700">{statusLabel(r.status)}</div>
                      <div className="text-right text-sm font-medium text-gray-900">{asMoney(Number(r.total ?? 0))}</div>
                      <div className="text-right text-sm text-gray-700">{asMoney(Number(r.paid_amount ?? 0))}</div>
                      <div className="text-right text-sm text-gray-700">{asMoney(Number(r.remaining_amount ?? 0))}</div>
                    </div>
                  );
                })
              )}
            </div>
          </div>
          <TablePagination table={table} />
        </div>
      ) : null}

      <Modal isOpen={quotePreviewOpen} onClose={() => setQuotePreviewOpen(false)} size="lg" rounded="md">
        <div className="rounded-xl bg-white p-5">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div>
              <div className="text-base font-semibold text-gray-900">ใบเสนอราคา</div>
              <div className="mt-1 text-sm text-gray-600">ดูรายละเอียดราคาของออเดอร์จากใบเสนอราคา</div>
            </div>
            <Button size="sm" variant="outline" onClick={() => setQuotePreviewOpen(false)} disabled={quotePreviewLoading}>
              ปิด
            </Button>
          </div>

          {quotePreviewLoading ? <div className="mt-4 text-sm text-gray-600">กำลังโหลด...</div> : null}
          {quotePreviewError ? <div className="mt-4 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">{quotePreviewError}</div> : null}

          {!quotePreviewLoading && !quotePreviewError && quotePreview ? (
            <div className="mt-4">
              <div className="rounded-lg border border-gray-200 bg-gray-50 p-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="text-sm font-semibold text-gray-900">{quotePreview.quote_no}</div>
                  <div className="text-sm font-semibold text-gray-900">ยอดสุทธิ: {asMoney(Number(quotePreview.grand_total ?? 0))}</div>
                </div>
                <div className="mt-1 text-sm text-gray-700">ลูกค้า: {quotePreview.customer_name}</div>
                <div className="mt-1 text-xs text-gray-600">วันที่ออก: {formatShortDate(quotePreview.created_at)}</div>
              </div>

              <div className="mt-4 rounded-lg border border-gray-200">
                <div className="border-b border-gray-200 bg-gray-50 px-3 py-2 text-sm font-semibold text-gray-900">รายการบริการ</div>
                <div className="grid grid-cols-[1fr_90px_130px_130px] gap-2 px-3 py-2 text-xs font-semibold text-gray-600">
                  <div>บริการ</div>
                  <div className="text-right">จำนวน</div>
                  <div className="text-right">ราคาต่อหน่วย</div>
                  <div className="text-right">รวม</div>
                </div>
                <div className="divide-y divide-gray-100">
                  {quotePreviewItems.length === 0 ? (
                    <div className="px-3 py-3 text-sm text-gray-600">ยังไม่มีรายการ</div>
                  ) : (
                    quotePreviewItems.map((it) => (
                      <div key={it.id} className="grid grid-cols-[1fr_90px_130px_130px] gap-2 px-3 py-3 text-sm">
                        <div className="min-w-0">
                          <div className="truncate font-medium text-gray-900">{it.name}</div>
                        </div>
                        <div className="text-right text-gray-700">{Number(it.quantity ?? 0)}</div>
                        <div className="text-right text-gray-700">{asMoney(Number(it.unit_price ?? 0))}</div>
                        <div className="text-right font-semibold text-gray-900">{asMoney(Number(it.line_total ?? 0))}</div>
                      </div>
                    ))
                  )}
                </div>
              </div>

              <div className="mt-4 rounded-lg border border-gray-200 bg-white p-3">
                <div className="text-sm font-semibold text-gray-900">สรุปราคา</div>
                <div className="mt-2 space-y-1 text-sm">
                  {Number(quotePreview.discount_total ?? 0) > 0 ? (
                    <>
                      <div className="flex items-center justify-between">
                        <div className="text-gray-600">รวมก่อนส่วนลด</div>
                        <div className="font-medium text-gray-900">{asMoney(Number(quotePreview.subtotal ?? 0))}</div>
                      </div>
                      <div className="flex items-center justify-between">
                        <div className="text-gray-600">ส่วนลด</div>
                        <div className="font-medium text-gray-900">{asMoney(Number(quotePreview.discount_total ?? 0))}</div>
                      </div>
                      <div className="flex items-center justify-between">
                        <div className="text-gray-600">ยอดหลังส่วนลด</div>
                        <div className="font-medium text-gray-900">
                          {asMoney(Math.max(0, Number(quotePreview.subtotal ?? 0) - Number(quotePreview.discount_total ?? 0)))}
                        </div>
                      </div>
                    </>
                  ) : null}

                  {quotePreview.include_vat ? (
                    <div className="flex items-center justify-between">
                      <div className="text-gray-600">VAT ({Number(quotePreview.vat_rate ?? 0)}%)</div>
                      <div className="font-medium text-gray-900">{asMoney(Number(quotePreview.vat_amount ?? 0))}</div>
                    </div>
                  ) : null}

                  {Number(quotePreview.wht_rate ?? 0) > 0 ? (
                    <div className="flex items-center justify-between">
                      <div className="text-gray-600">หัก ณ ที่จ่าย ({Number(quotePreview.wht_rate ?? 0)}%)</div>
                      <div className="font-medium text-gray-900">-{asMoney(Number(quotePreview.wht_amount ?? 0))}</div>
                    </div>
                  ) : null}

                  <div className="mt-2 flex items-center justify-between border-t border-gray-200 pt-2">
                    <div className="text-sm font-semibold text-gray-900">ยอดสุทธิ</div>
                    <div className="text-sm font-semibold text-gray-900">{asMoney(Number(quotePreview.grand_total ?? 0))}</div>
                  </div>
                </div>
              </div>
            </div>
          ) : null}
        </div>
      </Modal>

      <InvoiceCreateModal
        isOpen={payOpen}
        onClose={() => {
          setPayOpen(false);
          setPayOrderId(null);
          setPayOrderDisplayId(null);
          setPayCustomerName(null);
          setPayTotal(0);
          setPayAmount("");
        }}
        orderId={payOrderId}
        orderDisplayId={payOrderDisplayId}
        customerName={payCustomerName}
        installmentNo={1}
        disabled={loading}
        onCreated={async (invoiceId) => {
          const billedOrderId = String(payOrderId ?? "").trim();
          if (!billedOrderId) return;
          try {
            await addOrderEvent({
              orderId: billedOrderId,
              eventType: "first_installment_billed",
              message: "ออกใบแจ้งหนี้งวดแรก",
              entityTable: "invoices",
              entityId: invoiceId,
            });
          } catch {}
          try {
            const { data: ord } = await supabase
              .from("orders")
              .select("status,paid_amount,remaining_amount,total,source_quote_id")
              .eq("id", billedOrderId)
              .single();
            if (ord && editingId === billedOrderId) {
              setEditingStatus((ord as any).status ?? null);
              setEditingSourceQuoteId((ord as any).source_quote_id ?? null);
              setEditingTotalAmount(Number((ord as any).total ?? 0));
              setEditingPaidAmount(Number((ord as any).paid_amount ?? 0));
              setEditingRemainingAmount(Number((ord as any).remaining_amount ?? 0));
            }
          } catch {}
          await refreshOrderDocs(billedOrderId);
          await refreshDownloadDocsForOrder(billedOrderId);
          refresh();
        }}
      />

      <Modal
        isOpen={firstIvOpen}
        onClose={() => {
          setFirstIvOpen(false);
          setFirstIvLoading(false);
          setFirstIvInvoice(null);
          setFirstIvPayAmount("");
          setFirstIvPayNote("");
          setFirstIvPayFile(null);
          setFirstIvOrderId(null);
          setFirstIvOrderDisplayId(null);
          setFirstIvCustomerName(null);
          setFirstIvTotal(0);
        }}
      >
        <div className="rounded-xl bg-white p-5">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div>
              <div className="text-base font-semibold text-gray-900">ใบแจ้งหนี้งวดแรก</div>
              <div className="mt-1 text-sm text-gray-600">แนบหลักฐานการโอนและยืนยันการชำระเงิน</div>
            </div>
            {firstIvInvoice?.id ? (
              <Button
                size="sm"
                variant="outline"
                onClick={async () => {
                  if (!firstIvInvoice) return;
                  try {
                    setFirstIvLoading(true);
                    setError(null);
                    await downloadInvoicePdf(firstIvInvoice);
                  } catch (e: any) {
                    setError(e?.message ?? "ดาวน์โหลดใบแจ้งหนี้ไม่สำเร็จ");
                  }
                  setFirstIvLoading(false);
                }}
                disabled={firstIvLoading}
              >
                ดาวน์โหลดใบแจ้งหนี้
              </Button>
            ) : null}
          </div>

          <div className="mt-3 rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-sm text-gray-700">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="font-medium text-gray-900">{firstIvOrderDisplayId ?? firstIvOrderId ?? "-"}</div>
              <div className="font-medium text-gray-900">ยอดสุทธิ: {asMoney(Number(firstIvTotal ?? 0))}</div>
            </div>
            <div className="mt-0.5 truncate text-xs text-gray-600">{firstIvCustomerName ?? "-"}</div>
          </div>

          {firstIvLoading ? <div className="mt-4 text-sm text-gray-600">กำลังโหลด...</div> : null}
          {!firstIvLoading && !firstIvInvoice ? (
            <div className="mt-4 rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-700">ไม่พบใบแจ้งหนี้งวดแรก</div>
          ) : null}

          {!firstIvLoading && firstIvInvoice ? (
            <div className="mt-4 rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-700">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  เลขที่: <span className="font-semibold text-gray-900">{firstIvInvoice.doc_no ?? "-"}</span>
                </div>
                <div className="font-semibold text-gray-900">ยอด: {asMoney(Number(firstIvInvoice.grand_total ?? 0))}</div>
              </div>
              <div className="mt-1 text-xs text-gray-600">ออกเอกสารเมื่อ: {firstIvInvoice.issued_at ?? "-"}</div>
            </div>
          ) : null}

          <div className="mt-4 grid gap-3">
            <div>
              <div className="text-sm font-medium text-gray-700">ยอดที่ชำระ</div>
              <input
                className="mt-2 h-10 w-full rounded-md border border-gray-200 bg-white px-3 text-right text-sm"
                value={firstIvPayAmount}
                onChange={(e) => setFirstIvPayAmount(e.target.value)}
                inputMode="decimal"
                disabled={firstIvLoading || !firstIvInvoice}
              />
            </div>
            <div>
              <div className="text-sm font-medium text-gray-700">แนบ slip</div>
              <div className="mt-2">
                <FileUploader
                  label=""
                  helperText="คลิกเพื่อแนบ slip หรือ ลากไฟล์มาวาง"
                  accept={{ "image/*": [], "application/pdf": [] }}
                  multiple={false}
                  maxFiles={1}
                  maxSizeBytes={10 * 1024 * 1024}
                  files={firstIvPayFile ? [firstIvPayFile] : []}
                  onFilesChange={(next) => setFirstIvPayFile(next[0] ?? null)}
                  disabled={firstIvLoading || !firstIvInvoice}
                />
              </div>
            </div>
            <div>
              <div className="text-sm font-medium text-gray-700">หมายเหตุ (ถ้ามี)</div>
              <Input value={firstIvPayNote} onChange={(e) => setFirstIvPayNote(e.target.value)} disabled={firstIvLoading || !firstIvInvoice} />
            </div>
          </div>

          <div className="mt-5 flex flex-wrap justify-end gap-2">
            <Button
              onClick={async () => {
                if (!firstIvInvoice || !firstIvPayFile) return;
                const amtNum = Number(firstIvPayAmount || 0);
                const amt = Number.isFinite(amtNum) ? amtNum : 0;
                if (amt <= 0) {
                  setError("กรุณาใส่ยอดที่ชำระ");
                  return;
                }
                try {
                  setFirstIvLoading(true);
                  setError(null);
                  const form = new FormData();
                  form.set("invoiceId", firstIvInvoice.id);
                  form.set("amount", String(amt));
                  if (firstIvPayNote.trim()) form.set("note", firstIvPayNote.trim());
                  form.set("file", firstIvPayFile);
                  const res = await fetch("/api/invoices/confirm-payment", { method: "POST", body: form });
                  if (!res.ok) {
                    const data = (await res.json().catch(() => ({}))) as { error?: string };
                    throw new Error(data.error || "ยืนยันการชำระไม่สำเร็จ");
                  }
                  try {
                    const created = await createReceiptFromInvoice(firstIvInvoice.id);
                    if (created.receiptNo) toast.success(`ยืนยันการชำระแล้ว • ออกใบเสร็จ ${created.receiptNo} แล้ว`);
                    else toast.success("ยืนยันการชำระแล้ว");
                  } catch {
                    toast.success("ยืนยันการชำระแล้ว");
                  }
                  const orderId = firstIvOrderId;
                  setFirstIvOpen(false);
                  setFirstIvInvoice(null);
                  setFirstIvPayAmount("");
                  setFirstIvPayNote("");
                  setFirstIvPayFile(null);
                  setFirstIvOrderId(null);
                  setFirstIvOrderDisplayId(null);
                  setFirstIvCustomerName(null);
                  setFirstIvTotal(0);
                  if (orderId) {
                    try {
                      const { data: ord } = await supabase
                        .from("orders")
                        .select("status,paid_amount,remaining_amount,total,source_quote_id")
                        .eq("id", orderId)
                        .single();
                      if (ord && editingId === orderId) {
                        setEditingStatus((ord as any).status ?? null);
                        setEditingSourceQuoteId((ord as any).source_quote_id ?? null);
                        setEditingTotalAmount(Number((ord as any).total ?? 0));
                        setEditingPaidAmount(Number((ord as any).paid_amount ?? 0));
                        setEditingRemainingAmount(Number((ord as any).remaining_amount ?? 0));
                      }
                    } catch {}
                    await refreshOrderDocs(orderId);
                    refresh();
                  }
                } catch (e: any) {
                  setError(e?.message ?? "ยืนยันการชำระไม่สำเร็จ");
                }
                setFirstIvLoading(false);
              }}
              disabled={
                firstIvLoading ||
                !firstIvInvoice ||
                !firstIvPayFile ||
                (() => {
                  const n = Number(firstIvPayAmount || 0);
                  return !Number.isFinite(n) || n <= 0;
                })()
              }
            >
              ยืนยันชำระ
            </Button>
            <Button
              variant="outline"
              onClick={() => {
                setFirstIvOpen(false);
                setFirstIvLoading(false);
                setFirstIvInvoice(null);
                setFirstIvPayAmount("");
                setFirstIvPayNote("");
                setFirstIvPayFile(null);
                setFirstIvOrderId(null);
                setFirstIvOrderDisplayId(null);
                setFirstIvCustomerName(null);
                setFirstIvTotal(0);
              }}
              disabled={firstIvLoading}
            >
              ปิด
            </Button>
          </div>
        </div>
      </Modal>

      <Modal isOpen={cancelOpen} onClose={() => setCancelOpen(false)}>
        <div className="rounded-xl bg-white p-5">
          <div className="text-base font-semibold text-gray-900">ยกเลิกออเดอร์ (คืนเงิน)</div>
          <div className="mt-2 rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-sm text-gray-700">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="font-medium text-gray-900">{cancelOrderDisplayId ?? cancelOrderId ?? "-"}</div>
              <div className="font-medium text-gray-900">ยอดสุทธิ: {asMoney(Number(cancelTotal ?? 0))}</div>
            </div>
            <div className="mt-0.5 truncate text-xs text-gray-600">{cancelCustomerName ?? "-"}</div>
          </div>
          <div className="mt-4 grid gap-3">
            <div>
              <div className="text-sm font-medium text-gray-700">จำนวนเงินคืน</div>
              <input
                className="mt-2 h-10 w-full rounded-md border border-gray-200 bg-white px-3 text-right text-sm"
                value={cancelAmount}
                onChange={(e) => setCancelAmount(e.target.value)}
                inputMode="decimal"
              />
            </div>
            <div>
              <div className="text-sm font-medium text-gray-700">แนบ slip คืนเงิน</div>
              <div className="mt-2">
                <FileUploader
                  label=""
                  helperText="คลิกเพื่อแนบ slip คืนเงิน หรือ ลากไฟล์มาวาง"
                  accept={{ "image/*": [], "application/pdf": [] }}
                  multiple={false}
                  maxFiles={1}
                  maxSizeBytes={10 * 1024 * 1024}
                  files={cancelFile ? [cancelFile] : []}
                  onFilesChange={(next) => setCancelFile(next[0] ?? null)}
                  disabled={loading}
                />
              </div>
            </div>
          </div>

          <div className="mt-5 flex flex-wrap justify-end gap-2">
            <Button
              onClick={async () => {
                if (!cancelOrderId || !cancelFile) return;
                const amtNum = Number(cancelAmount || 0);
                const amt = Number.isFinite(amtNum) ? amtNum : 0;
                if (amt <= 0) {
                  setError("กรุณาใส่จำนวนเงินคืน");
                  return;
                }
                setLoading(true);
                setError(null);
                const form = new FormData();
                form.set("orderId", cancelOrderId);
                form.set("amount", String(amt));
                form.set("file", cancelFile);
                const res = await fetch("/api/orders/cancel", { method: "POST", body: form });
                if (!res.ok) {
                  const data = (await res.json().catch(() => ({}))) as { error?: string };
                  setError(data.error || "ยกเลิกออเดอร์ไม่สำเร็จ");
                  setLoading(false);
                  return;
                }
                setCancelOpen(false);
                setCancelOrderId(null);
                setCancelOrderDisplayId(null);
                setCancelCustomerName(null);
                setCancelTotal(0);
                setCancelAmount("");
                setCancelFile(null);
                resetForm();
                setShowForm(false);
                setLoading(false);
                await refreshOrderDocs(cancelOrderId);
                refresh();
              }}
              disabled={
                loading ||
                !cancelOrderId ||
                !cancelFile ||
                (() => {
                  const n = Number(cancelAmount || 0);
                  return !Number.isFinite(n) || n <= 0;
                })()
              }
            >
              ยืนยันยกเลิกออเดอร์
            </Button>
            <Button variant="outline" onClick={() => setCancelOpen(false)} disabled={loading}>
              ปิด
            </Button>
          </div>
        </div>
      </Modal>

      <Modal
        isOpen={docViewerOpen}
        onClose={() => {
          setDocViewerOpen(false);
          setDocViewerLoading(false);
          setDocViewerUrl(null);
          setDocViewerDownloadUrl(null);
          setDocViewerIsDirectFile(false);
          setDocViewerTitle(null);
          setDocViewerSource(null);
        }}
        size="lg"
        rounded="md"
      >
        <div className="rounded-xl bg-white p-5">
          <div className="flex items-center justify-between gap-2">
            <div className="min-w-0 truncate text-base font-semibold text-gray-900">{docViewerTitle ?? "เอกสาร"}</div>
            <div className="flex shrink-0 gap-2">
              <Button
                variant="outline"
                onClick={async () => {
                  if (docViewerSource) {
                    setLoading(true);
                    setError(null);
                    try {
                      const url = await getSignedStorageUrl({
                        supabase,
                        table: docViewerSource.table,
                        id: docViewerSource.id,
                        disposition: "attachment",
                      });
                      window.open(url, "_blank", "noopener,noreferrer");
                    } catch (e: any) {
                      setError(e?.message ?? "ดาวน์โหลดไม่สำเร็จ");
                    }
                    setLoading(false);
                    return;
                  }

                  const url = docViewerDownloadUrl || docViewerUrl;
                  if (!url) return;
                  if (!docViewerIsDirectFile) {
                    window.open(url, "_blank", "noopener,noreferrer");
                    return;
                  }
                  const title = (docViewerTitle ?? "document").trim() || "document";
                  const filename = `${title}.${extFromUrl(url)}`;
                  setLoading(true);
                  setError(null);
                  try {
                    await downloadUrl(url, filename);
                  } catch (e: any) {
                    setError(e?.message ?? "ดาวน์โหลดไม่สำเร็จ");
                  }
                  setLoading(false);
                }}
                disabled={loading || !(docViewerDownloadUrl || docViewerUrl)}
              >
                ดาวน์โหลด
              </Button>
              <Button
                variant="outline"
                onClick={() => {
                  setDocViewerOpen(false);
                  setDocViewerLoading(false);
                  setDocViewerUrl(null);
                  setDocViewerTitle(null);
                  setDocViewerDownloadUrl(null);
                  setDocViewerIsDirectFile(false);
                  setDocViewerSource(null);
                }}
                disabled={loading}
              >
                ปิด
              </Button>
            </div>
          </div>
          <div className="mt-4 overflow-hidden rounded-lg border border-gray-200 bg-gray-50">
            {docViewerUrl ? (
              docViewerIsDirectFile ? (
                isPdfUrl(docViewerUrl) ? (
                  <iframe src={docViewerUrl} className="h-[70vh] w-full" />
                ) : (
                  <img src={docViewerUrl} alt={docViewerTitle ?? "slip"} className="h-[70vh] w-full object-contain" />
                )
              ) : (
                <iframe src={docViewerUrl} className="h-[70vh] w-full" />
              )
            ) : docViewerLoading ? (
              <div className="p-6 text-sm text-gray-600">กำลังโหลด...</div>
            ) : (
              <div className="p-6 text-sm text-gray-600">ไม่พบไฟล์</div>
            )}
          </div>
        </div>
      </Modal>

      <Modal
        isOpen={addDocOpen && !!editingId}
        onClose={() => {
          setAddDocOpen(false);
          setAddDocType("");
          setAddDocFile(null);
        }}
        size="lg"
        rounded="md"
      >
        <div className="rounded-xl bg-white p-5">
          <div className="text-base font-semibold text-gray-900">เพิ่มเอกสาร</div>
          <div className="mt-4 grid gap-3">
            <Input label="ประเภทเอกสาร" value={addDocType} onChange={(e) => setAddDocType(e.target.value)} />
            <div>
              <div className="text-sm font-medium text-gray-700">อัปโหลดไฟล์ไป Google Cloud Storage (GCS)</div>
              <div className="mt-2">
                <FileUploader
                  label=""
                  helperText="คลิกเพื่อแนบไฟล์ หรือ ลากไฟล์มาวาง"
                  accept={{ "image/*": [], "application/pdf": [] }}
                  multiple={false}
                  maxFiles={1}
                  maxSizeBytes={20 * 1024 * 1024}
                  files={addDocFile ? [addDocFile] : []}
                  onFilesChange={(next) => setAddDocFile(next[0] ?? null)}
                  disabled={loading}
                />
              </div>
            </div>
          </div>

          <div className="mt-5 flex flex-wrap justify-end gap-2">
            <Button
              onClick={async () => {
                if (!editingId) return;
                if (!addDocFile) return;
                setLoading(true);
                setError(null);
                const form = new FormData();
                form.set("entityType", "order");
                form.set("entityId", editingId);
                form.set("docType", addDocType.trim());
                form.set("file", addDocFile);
                const res = await fetch("/api/storage/upload", { method: "POST", body: form });
                if (!res.ok) {
                  const data = (await res.json().catch(() => ({}))) as { error?: string };
                  setError(data.error || "อัปโหลดเอกสารไม่สำเร็จ");
                  setLoading(false);
                  return;
                }
                setAddDocOpen(false);
                setAddDocType("");
                setAddDocFile(null);
                setLoading(false);
                await refreshOrderDocs(editingId);
              }}
              disabled={loading || !editingId || !addDocFile}
            >
              บันทึก
            </Button>
            <Button
              variant="outline"
              onClick={() => {
                setAddDocOpen(false);
                setAddDocType("");
                setAddDocFile(null);
              }}
              disabled={loading}
            >
              ยกเลิก
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
