"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import React, { useCallback, useMemo, useRef, useState } from "react";
import { Button } from "rizzui";
import { Title, Text } from "rizzui/typography";
import toast from "react-hot-toast";

import { useAuth } from "@/app/shared/auth-provider";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import { Modal } from "@core/modal-views/modal";
import FileUploader from "@/components/form/file-uploader";

import { asMoney, customerNameFromRel, serviceNameFromRel, type EventRow, type OrderItemRow, type OrderRow, type PaymentRow } from "./_types";
import { ManageOrderEventsCard, ManageOrderServicesCard, ManageOrderSummaryCard } from "./_services-events";
import { ManageOrderClosePanel, ManageOrderDocumentsPanel, ManageOrderTransactionsPanel, RecordInstallmentModal } from "./_side-panels";
import { useManageOrderActions } from "./_actions";
import { TransactionModal } from "@/components/finance/transaction-modal";

const supabaseHost = (() => {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!url) return null;
  try {
    return new URL(url).host;
  } catch {
    return url;
  }
})();

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

type FinanceTxnRow = {
  id: string;
  txn_type: string;
  source_type: string | null;
  amount: number;
  txn_date: string | null;
  expense_name: string | null;
  note: string | null;
};

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

export default function ManageOrderDetailPage() {
  const { id } = useParams<{ id: string }>();
  const orderId = String(id ?? "").trim();
  const { role, userId } = useAuth();
  const supabase = useMemo(() => createSupabaseBrowserClient(), []);
  const router = useRouter();
  const topRef = useRef<HTMLDivElement | null>(null);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [order, setOrder] = useState<OrderRow | null>(null);
  const [items, setItems] = useState<OrderItemRow[]>([]);
  const [payments, setPayments] = useState<PaymentRow[]>([]);
  const [financeTxns, setFinanceTxns] = useState<FinanceTxnRow[]>([]);
  const [events, setEvents] = useState<EventRow[]>([]);
  const [orderDocuments, setOrderDocuments] = useState<any[]>([]);
  const [orderItemDocuments, setOrderItemDocuments] = useState<any[]>([]);

  const [payOpen, setPayOpen] = useState(false);
  const [payAmount, setPayAmount] = useState("");
  const [payFile, setPayFile] = useState<File | null>(null);

  const [cancelOpen, setCancelOpen] = useState(false);
  const [cancelAmount, setCancelAmount] = useState("");
  const [cancelFile, setCancelFile] = useState<File | null>(null);

  const [expenseOpen, setExpenseOpen] = useState(false);

  const [addDocOpen, setAddDocOpen] = useState(false);
  const [addDocType, setAddDocType] = useState("");
  const [addDocFile, setAddDocFile] = useState<File | null>(null);
  const [addDocOrderItemId, setAddDocOrderItemId] = useState<string | null>(null);
  const [addDocServiceName, setAddDocServiceName] = useState<string | null>(null);

  const [quotePreviewOpen, setQuotePreviewOpen] = useState(false);
  const [quotePreviewLoading, setQuotePreviewLoading] = useState(false);
  const [quotePreviewError, setQuotePreviewError] = useState<string | null>(null);
  const [quotePreview, setQuotePreview] = useState<QuotePreviewRow | null>(null);
  const [quotePreviewItems, setQuotePreviewItems] = useState<QuotePreviewItemRow[]>([]);

  const canUsePage = role === "admin" || role === "operation";
  const canCancelOrder = role === "admin" || role === "operation";

  const refresh = useCallback(() => {
    Promise.resolve().then(async () => {
      if (!orderId) return;
      setLoading(true);
      setError(null);

      const eventsPromise = (async () => {
        const sessionRes = await supabase.auth.getSession();
        const token = sessionRes.data.session?.access_token;
        if (!token) return { data: [], error: { message: "Unauthorized" } };
        const res = await fetch(`/api/orders/events?order_id=${encodeURIComponent(orderId)}`, {
          method: "GET",
          headers: { Authorization: `Bearer ${token}` },
        });
        if (!res.ok) {
          const data = (await res.json().catch(() => ({}))) as { error?: string };
          return { data: [], error: { message: data.error || "โหลดประวัติไม่สำเร็จ" } };
        }
        const data = (await res.json().catch(() => ({}))) as { events?: any[] };
        return { data: (data.events ?? []) as any[], error: null };
      })();

      const [ordRes, itemRes, payRes, finRes, evtRes] = await Promise.all([
        supabase
          .from("orders")
          .select("id,display_id,status,total,paid_amount,remaining_amount,created_at,closed_at,source_quote_id,customers(name)")
          .eq("id", orderId)
          .single(),
        supabase
          .from("order_items")
          .select("id,quantity,unit_price,line_total,ops_status,ops_started_at,ops_completed_at,services(name)")
          .eq("order_id", orderId)
          .order("created_at", { ascending: true }),
        supabase
          .from("order_payments")
          .select("id,installment_no,amount,slip_url,slip_storage_provider,slip_storage_bucket,slip_storage_path,slip_file_name,created_at,confirmed_at")
          .eq("order_id", orderId)
          .order("installment_no", { ascending: true }),
        supabase
          .from("payment_transactions")
          .select("id,txn_type,source_type,amount,txn_date,expense_name,note")
          .eq("order_id", orderId)
          .order("txn_date", { ascending: false })
          .limit(2000),
        eventsPromise,
      ]);

      const [docRes, itemDocRes] = await Promise.all([
        supabase
          .from("order_documents")
          .select("id,doc_type,storage_provider,storage_bucket,storage_path,file_name,mime_type,size_bytes,drive_web_view_link,drive_file_id,created_at")
          .eq("order_id", orderId)
          .order("created_at", { ascending: false })
          .limit(100),
        supabase
          .from("order_item_documents")
          .select(
            "id,order_item_id,doc_type,storage_provider,storage_bucket,storage_path,file_name,mime_type,size_bytes,drive_web_view_link,drive_file_id,created_at,order_items(services(name))",
          )
          .eq("order_id", orderId)
          .order("created_at", { ascending: false })
          .limit(200),
      ]);

      const errors = [ordRes.error, itemRes.error, payRes.error, finRes.error, evtRes.error, docRes.error, itemDocRes.error]
        .filter((e): e is NonNullable<typeof e> => Boolean(e))
        .map((e) => e.message);
      setError(errors[0] ?? null);

      setOrder(ordRes.error ? null : ((ordRes.data as unknown as OrderRow) ?? null));
      setItems(itemRes.error ? [] : (((itemRes.data ?? []) as unknown as OrderItemRow[]) ?? []));
      setPayments(payRes.error ? [] : (((payRes.data ?? []) as unknown as PaymentRow[]) ?? []));
      setFinanceTxns(finRes.error ? [] : (((finRes.data ?? []) as unknown as FinanceTxnRow[]) ?? []));
      setEvents(evtRes.error ? [] : (((evtRes.data ?? []) as unknown as EventRow[]) ?? []));
      setOrderDocuments(docRes.error ? [] : (((docRes.data ?? []) as unknown as any[]) ?? []));
      setOrderItemDocuments(itemDocRes.error ? [] : (((itemDocRes.data ?? []) as unknown as any[]) ?? []));
      setLoading(false);
    });
  }, [orderId, supabase]);

  const showQuotation = useCallback(async () => {
    const quoteId = String(order?.source_quote_id ?? "").trim();
    if (!quoteId) {
      setError("ออเดอร์นี้ไม่มีใบเสนอราคา");
      return;
    }
    setQuotePreviewOpen(true);
    setQuotePreviewLoading(true);
    setQuotePreviewError(null);
    try {
      const [qRes, itRes] = await Promise.all([
        supabase
          .from("sales_quotes")
          .select("id,quote_no,customer_name,subtotal,discount_total,include_vat,vat_rate,vat_amount,wht_rate,wht_amount,grand_total,created_at")
          .eq("id", quoteId)
          .single(),
        supabase
          .from("sales_quote_items")
          .select("id,name,quantity,unit_price,line_total,sort_order,created_at")
          .eq("quote_id", quoteId)
          .order("sort_order", { ascending: true })
          .order("created_at", { ascending: true }),
      ]);

      if ((qRes as any).error) {
        setQuotePreviewError((qRes as any).error.message);
        setQuotePreview(null);
        setQuotePreviewItems([]);
        setQuotePreviewLoading(false);
        return;
      }
      if ((itRes as any).error) {
        setQuotePreviewError((itRes as any).error.message);
        setQuotePreview(null);
        setQuotePreviewItems([]);
        setQuotePreviewLoading(false);
        return;
      }

      setQuotePreview(((qRes as any).data ?? null) as QuotePreviewRow | null);
      setQuotePreviewItems((((itRes as any).data ?? []) as QuotePreviewItemRow[]) ?? []);
      setQuotePreviewLoading(false);
    } catch (e: any) {
      setQuotePreviewError(e?.message ?? "โหลดใบเสนอราคาไม่สำเร็จ");
      setQuotePreview(null);
      setQuotePreviewItems([]);
      setQuotePreviewLoading(false);
    }
  }, [order?.source_quote_id, supabase]);

  React.useEffect(() => {
    refresh();
  }, [refresh]);

  const isLocked = order?.status === "completed" || order?.status === "cancelled";
  const maxInstallmentNo = useMemo(() => {
    const nums = payments.map((p) => Number(p.installment_no ?? 0)).filter((n) => Number.isFinite(n) && n > 0);
    return nums.length ? Math.max(...nums) : 1;
  }, [payments]);
  const nextInstallmentNo = Math.max(2, maxInstallmentNo + 1);

  const allServicesDone = items.length > 0 && items.every((it) => it.ops_status === "done");
  const remaining = Number(order?.remaining_amount ?? 0);
  const noOutstanding = Number.isFinite(remaining) ? remaining <= 0 : false;
  const canCloseOrder = !isLocked && order?.status === "in_progress" && allServicesDone && noOutstanding;

  const pendingReason = useMemo(() => {
    if (order?.status !== "in_progress") return "ออเดอร์ต้องอยู่สถานะกำลังดำเนินการ";
    if (!allServicesDone) return "ยังมีบริการที่ไม่เสร็จสิ้น";
    if (!noOutstanding) return `ยังมียอดคงค้าง ${asMoney(Number(order?.remaining_amount ?? 0))} บาท`;
    return "ยังไม่พร้อมปิดออเดอร์";
  }, [allServicesDone, noOutstanding, order?.remaining_amount, order?.status]);

  const { startService, doneService, closeOrder, openAddInstallment, recordInstallment } = useManageOrderActions({
    orderId,
    userId,
    supabase,
    refresh,
    setLoading,
    setError,
    topRef,
    nextInstallmentNo,
    payAmount,
    payFile,
    setPayOpen,
    setPayAmount,
    setPayFile,
    canCloseOrder,
  });

  const financeTotals = useMemo(() => {
    const income = financeTxns.filter((t) => String(t.txn_type) === "INCOME").reduce((acc, t) => acc + Number(t.amount ?? 0), 0);
    const expense = financeTxns.filter((t) => String(t.txn_type) === "EXPENSE").reduce((acc, t) => acc + Number(t.amount ?? 0), 0);
    return { income, expense, net: income - expense };
  }, [financeTxns]);

  const orderOptions = useMemo(() => {
    const title = [order?.display_id ?? orderId, customerNameFromRel(order?.customers ?? null)].filter(Boolean).join(" • ");
    return [{ value: orderId, label: title || orderId }];
  }, [order?.customers, order?.display_id, orderId]);

  if (!canUsePage) {
    return (
      <div>
        <Title as="h1" className="text-lg font-semibold text-gray-900">
          จัดการออเดอร์
        </Title>
        <div className="mt-3 rounded-xl border border-gray-200 bg-white p-4 text-sm text-gray-700">หน้านี้สำหรับทีมงานปฏิบัติการเท่านั้น</div>
      </div>
    );
  }

  return (
    <div ref={topRef}>
      <div className="flex flex-col justify-between gap-3 md:flex-row md:items-end">
        <div>
          <div className="text-sm text-gray-500">
            <Link href="/manage-orders" className="hover:underline">
              จัดการออเดอร์
            </Link>
            <span> / </span>
            <span>{order?.display_id ?? orderId}</span>
          </div>
          <Title as="h1" className="mt-1 text-lg font-semibold text-gray-900">
            ออเดอร์ {order?.display_id ?? "-"}
          </Title>
          <Text className="mt-1 text-sm text-gray-600">อัปเดตสถานะงานรายบริการ บันทึกการชำระ และปิดออเดอร์</Text>
        </div>
        <div className="flex justify-end">
          <Button
            variant="outline"
            disabled={loading}
            onClick={() => {
              router.push("/manage-orders");
            }}
          >
            ปิด
          </Button>
        </div>
      </div>

      {error ? (
        <div className="mt-4 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
          <div>{error}</div>
          {supabaseHost ? <div className="mt-1 text-xs text-red-600">Supabase: {supabaseHost}</div> : null}
        </div>
      ) : null}

      <div className="mt-4 grid items-start gap-4 lg:grid-cols-[1.6fr_0.9fr]">
        <div className="grid gap-4">
          <ManageOrderSummaryCard
            order={order}
            items={items}
            events={events}
            loading={loading || quotePreviewLoading}
            isLocked={isLocked}
            onShowQuotation={showQuotation}
            onOpenAddInstallment={openAddInstallment}
            incomeTotal={financeTotals.income}
            expenseTotal={financeTotals.expense}
            netProfit={financeTotals.net}
            onCreateExpense={() => {
              setExpenseOpen(true);
            }}
          />
          <ManageOrderServicesCard
            items={items}
            orderStatus={order?.status ?? ""}
            isLocked={isLocked}
            loading={loading}
            onStart={startService}
            onDone={doneService}
            onAddDocument={(it) => {
              setAddDocType("");
              setAddDocFile(null);
              setAddDocOrderItemId(it.id);
              setAddDocServiceName(serviceNameFromRel(it.services ?? null));
              setAddDocOpen(true);
            }}
          />
          <ManageOrderEventsCard events={events} loading={loading} />
        </div>

        <div className="grid h-fit gap-4 lg:sticky lg:top-4">
          <ManageOrderDocumentsPanel
            order={order}
            orderDocuments={orderDocuments}
            orderItemDocuments={orderItemDocuments}
            isLocked={isLocked}
            loading={loading}
            onOpenAdd={() => {
              setAddDocType("");
              setAddDocFile(null);
              setAddDocOrderItemId(null);
              setAddDocServiceName(null);
              setAddDocOpen(true);
            }}
          />

          <ManageOrderTransactionsPanel order={order} transactions={financeTxns as any} loading={loading} />

          <ManageOrderClosePanel
            order={order}
            canCloseOrder={canCloseOrder}
            canCancelOrder={canCancelOrder}
            isLocked={isLocked}
            allServicesDone={allServicesDone}
            noOutstanding={noOutstanding}
            pendingReason={pendingReason}
            loading={loading}
            onCloseOrder={closeOrder}
            onCancelOrder={() => {
              setCancelAmount("");
              setCancelFile(null);
              setCancelOpen(true);
            }}
          />
        </div>
      </div>

      <TransactionModal
        open={expenseOpen}
        mode="create"
        variant="expense"
        fixedOrderId={orderId}
        supabase={supabase as any}
        userId={userId}
        loading={loading}
        setLoading={setLoading}
        setError={setError}
        orderOptions={orderOptions as any}
        initial={{ txn_type: "EXPENSE", source_type: "OPS", amount: 0, txn_date: new Date().toISOString().slice(0, 10), order_id: orderId }}
        onSaved={() => {
          toast.success("บันทึกรายจ่ายแล้ว");
          setExpenseOpen(false);
          refresh();
        }}
        onClose={() => setExpenseOpen(false)}
      />

      <RecordInstallmentModal
        isOpen={payOpen}
        onClose={() => setPayOpen(false)}
        disabled={loading || isLocked || order?.status !== "in_progress"}
        order={order}
        orderId={orderId}
        installmentNo={nextInstallmentNo}
        amount={payAmount}
        onAmountChange={setPayAmount}
        file={payFile}
        onFileChange={setPayFile}
        onSubmit={recordInstallment}
      />

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

      <Modal isOpen={addDocOpen} onClose={() => setAddDocOpen(false)}>
        <div className="rounded-xl bg-white p-5">
          <div className="text-base font-semibold text-gray-900">เพิ่มเอกสาร</div>
          {addDocServiceName ? <div className="mt-1 text-sm text-gray-600">บริการ: {addDocServiceName}</div> : null}

          <div className="mt-4 grid gap-3">
            <div>
              <div className="text-sm font-medium text-gray-700">ประเภทเอกสาร</div>
              <input
                className="mt-2 h-10 w-full rounded-md border border-gray-200 bg-white px-3 text-sm"
                value={addDocType}
                onChange={(e) => setAddDocType(e.target.value)}
                disabled={loading}
                placeholder="เช่น ใบเสร็จ, หนังสือรับรอง, อื่นๆ"
              />
            </div>
            <div>
              <div className="text-sm font-medium text-gray-700">แนบไฟล์</div>
              <div className="mt-2">
                <FileUploader
                  label=""
                  helperText="คลิกเพื่อแนบไฟล์ หรือ ลากไฟล์มาวาง"
                  accept={{ "image/*": [], "application/pdf": [] }}
                  multiple={false}
                  maxFiles={1}
                  maxSizeBytes={10 * 1024 * 1024}
                  files={addDocFile ? [addDocFile] : []}
                  onFilesChange={(next: File[]) => setAddDocFile(next[0] ?? null)}
                  disabled={loading}
                />
              </div>
            </div>
          </div>

          <div className="mt-5 flex flex-wrap justify-end gap-2">
            <Button
              onClick={async () => {
                if (!orderId || !addDocFile) return;
                setLoading(true);
                setError(null);

                const form = new FormData();
                form.set("entityType", addDocOrderItemId ? "order_item" : "order");
                form.set("entityId", addDocOrderItemId ? addDocOrderItemId : orderId);
                if (addDocOrderItemId) form.set("orderId", orderId);
                form.set("docType", addDocType.trim());
                form.set("file", addDocFile);

                const res = await fetch("/api/storage/upload", { method: "POST", body: form });
                if (!res.ok) {
                  const data = (await res.json().catch(() => ({}))) as { error?: string };
                  setError(data.error || "เพิ่มเอกสารไม่สำเร็จ");
                  setLoading(false);
                  return;
                }
                setAddDocOpen(false);
                setAddDocType("");
                setAddDocFile(null);
                setAddDocOrderItemId(null);
                setAddDocServiceName(null);
                setLoading(false);
                toast.success("เพิ่มเอกสารแล้ว");
                refresh();
              }}
              disabled={loading || !addDocFile}
            >
              เพิ่มเอกสาร
            </Button>
            <Button variant="outline" onClick={() => setAddDocOpen(false)} disabled={loading}>
              ปิด
            </Button>
          </div>
        </div>
      </Modal>

      <Modal isOpen={cancelOpen} onClose={() => setCancelOpen(false)}>
        <div className="rounded-xl bg-white p-5">
          <div className="text-base font-semibold text-gray-900">ยกเลิกออเดอร์ (คืนเงิน)</div>
          <div className="mt-4 grid gap-3">
            <div>
              <div className="text-sm font-medium text-gray-700">จำนวนเงินคืน</div>
              <input
                className="mt-2 h-10 w-full rounded-md border border-gray-200 bg-white px-3 text-right text-sm"
                value={cancelAmount}
                onChange={(e) => setCancelAmount(e.target.value)}
                inputMode="decimal"
                disabled={loading}
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
                  onFilesChange={(next: File[]) => setCancelFile(next[0] ?? null)}
                  disabled={loading}
                />
              </div>
            </div>
          </div>

          <div className="mt-5 flex flex-wrap justify-end gap-2">
            <Button
              color="danger"
              onClick={async () => {
                if (!orderId || !cancelFile) return;
                const amtNum = Number(cancelAmount || 0);
                const amt = Number.isFinite(amtNum) ? amtNum : 0;
                if (amt <= 0) {
                  setError("กรุณาใส่จำนวนเงินคืน");
                  return;
                }
                setLoading(true);
                setError(null);
                const form = new FormData();
                form.set("orderId", orderId);
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
                setCancelAmount("");
                setCancelFile(null);
                setLoading(false);
                toast.success("ยกเลิกออเดอร์แล้ว");
                refresh();
                topRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
              }}
              disabled={
                loading ||
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
    </div>
  );
}
