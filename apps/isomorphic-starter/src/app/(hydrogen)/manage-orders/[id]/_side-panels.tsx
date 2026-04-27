"use client";

import React from "react";
import { Button } from "rizzui";
import { Modal } from "@core/modal-views/modal";
import FileUploader from "@/components/form/file-uploader";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";

import { asMoney, customerNameFromRel, statusLabel, type OrderRow } from "./_types";

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

async function getSignedStorageUrl(params: {
  supabase: any;
  table: "order_payments" | "order_documents" | "order_item_documents";
  id: string;
  disposition: "inline" | "attachment";
}) {
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

export function ManageOrderPaymentsPanel({
  order,
  isLocked,
  loading,
  onOpenAdd,
}: {
  order: OrderRow | null;
  isLocked: boolean;
  loading: boolean;
  onOpenAdd: () => void;
}) {
  const remaining = Number(order?.remaining_amount ?? 0);
  const hasOutstanding = Number.isFinite(remaining) ? remaining > 0 : false;
  return (
    <div className="rounded-xl border border-gray-200 bg-white p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="text-sm font-semibold text-gray-900">ยอดคงค้าง</div>
        </div>
        {hasOutstanding ? (
          <Button
            size="sm"
            variant="outline"
            className="whitespace-nowrap"
            onClick={onOpenAdd}
            disabled={
              loading ||
              isLocked ||
              order?.status !== "in_progress"
            }
          >
            วางบิลงวดถัดไป
          </Button>
        ) : null}
      </div>

      <div className="mt-3 rounded-lg border border-gray-200 bg-gray-50 px-3 py-2">
        <div className="mt-1 text-right text-lg font-semibold text-gray-900">{asMoney(remaining)}</div>
      </div>
    </div>
  );
}

function formatDateOnly(s: string | null | undefined) {
  if (!s) return "-";
  const d = new Date(s);
  if (!Number.isFinite(d.getTime())) return "-";
  const parts = new Intl.DateTimeFormat("en-US", { day: "numeric", month: "short", year: "numeric" }).formatToParts(d);
  const day = parts.find((p) => p.type === "day")?.value ?? "";
  const month = parts.find((p) => p.type === "month")?.value ?? "";
  const year = parts.find((p) => p.type === "year")?.value ?? "";
  if (!day || !month || !year) return "-";
  return `${day}-${month}-${year}`;
}

export function ManageOrderDocumentsPanel({
  order,
  orderDocuments,
  orderItemDocuments,
  isLocked,
  loading,
  onOpenAdd,
}: {
  order: OrderRow | null;
  orderDocuments: any[];
  orderItemDocuments: any[];
  isLocked: boolean;
  loading: boolean;
  onOpenAdd: () => void;
}) {
  const hasDocs = (orderDocuments?.length ?? 0) > 0;
  const hasItemDocs = (orderItemDocuments?.length ?? 0) > 0;
  const supabase = React.useMemo(() => createSupabaseBrowserClient(), []);
  const [docViewerOpen, setDocViewerOpen] = React.useState(false);
  const [docViewerLoading, setDocViewerLoading] = React.useState(false);
  const [docViewerUrl, setDocViewerUrl] = React.useState<string | null>(null);
  const [docViewerDownloadUrl, setDocViewerDownloadUrl] = React.useState<string | null>(null);
  const [docViewerIsDirectFile, setDocViewerIsDirectFile] = React.useState(false);
  const [docViewerTitle, setDocViewerTitle] = React.useState<string | null>(null);
  const [docViewerSource, setDocViewerSource] = React.useState<{ table: "order_payments" | "order_documents" | "order_item_documents"; id: string } | null>(null);
  const [docViewerError, setDocViewerError] = React.useState<string | null>(null);

  if (!order?.id) return null;

  return (
    <div className="overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-sm">
      <div className="flex items-center justify-between gap-2 bg-white px-4 py-3">
        <div className="text-sm font-semibold text-gray-900">รายการเอกสาร</div>
        <Button size="sm" variant="outline" onClick={onOpenAdd} disabled={loading || isLocked}>
          เพิ่มเอกสาร
        </Button>
      </div>

      <div className="p-3">
        {!hasDocs && !hasItemDocs ? (
          <div className="rounded-xl border border-dashed border-gray-200 bg-gray-50 p-3 text-sm text-gray-600">ยังไม่มีรายการเอกสาร</div>
        ) : null}

        {hasDocs ? (
          <div>
            <div className="text-sm font-semibold text-gray-900">เอกสารออเดอร์</div>
            <div className="mt-2 space-y-2">
              {orderDocuments.map((d: any) => {
                const title = d?.doc_type || d?.file_name || "เอกสาร";
                const workerName = d?.worker?.full_name ? String(d.worker.full_name) : null;
                const serviceName = d?.order_items?.services?.name ? String(d.order_items.services.name) : null;

                return (
                  <button
                    key={d.id}
                    type="button"
                    className="flex w-full flex-wrap items-center justify-between gap-2 rounded-xl border border-gray-200 bg-white px-3 py-2 text-left transition-colors hover:bg-gray-50"
                    disabled={loading}
                    onClick={async () => {
                      setDocViewerError(null);
                      setDocViewerTitle(String(title));
                      setDocViewerLoading(true);
                      setDocViewerOpen(true);

                      if (String(d.storage_provider ?? "") === "supabase") {
                        setDocViewerSource({ table: "order_documents", id: String(d.id) });
                        setDocViewerUrl(null);
                        setDocViewerDownloadUrl(null);
                        setDocViewerIsDirectFile(true);
                        try {
                          const url = await getSignedStorageUrl({ supabase, table: "order_documents", id: String(d.id), disposition: "inline" });
                          setDocViewerUrl(url);
                        } catch (e: any) {
                          setDocViewerError(e?.message ?? "โหลดเอกสารไม่สำเร็จ");
                        }
                        setDocViewerLoading(false);
                        return;
                      }

                      if (d.drive_web_view_link) {
                        const web = String(d.drive_web_view_link);
                        const fileId = d.drive_file_id ? String(d.drive_file_id) : null;
                        setDocViewerSource(null);
                        setDocViewerUrl(drivePreviewUrl(web, fileId));
                        setDocViewerDownloadUrl(driveDownloadUrl(web, fileId));
                        setDocViewerIsDirectFile(false);
                        setDocViewerLoading(false);
                        return;
                      }

                      setDocViewerSource(null);
                      setDocViewerUrl(null);
                      setDocViewerDownloadUrl(null);
                      setDocViewerIsDirectFile(false);
                      setDocViewerLoading(false);
                    }}
                  >
                    <div className="min-w-0">
                      <div className="truncate text-sm font-semibold text-gray-900">{title}</div>
                      {workerName ? <div className="mt-0.5 truncate text-xs text-gray-600">แรงงาน: {workerName}</div> : null}
                      {serviceName ? <div className="mt-0.5 truncate text-xs text-gray-600">บริการ: {serviceName}</div> : null}
                    </div>
                    <span className="inline-flex items-center rounded-full border border-gray-200 bg-gray-100 px-2 py-0.5 text-xs font-semibold text-gray-700">
                      {formatDateOnly(d.created_at)}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        ) : null}

        {hasItemDocs ? (
          <div className={hasDocs ? "mt-4" : ""}>
            <div className="text-sm font-semibold text-gray-900">เอกสารบริการในออเดอร์</div>
            <div className="mt-2 space-y-2">
              {orderItemDocuments.map((d: any) => {
                const serviceName = d?.order_items?.services?.name ?? null;
                const title = d?.doc_type || d?.file_name || "เอกสาร";
                const subtitle = serviceName ? `บริการ: ${serviceName}` : null;

                return (
                  <button
                    key={d.id}
                    type="button"
                    className="flex w-full flex-wrap items-center justify-between gap-2 rounded-xl border border-gray-200 bg-white px-3 py-2 text-left transition-colors hover:bg-gray-50"
                    disabled={loading}
                    onClick={async () => {
                      setDocViewerError(null);
                      setDocViewerTitle(subtitle ? `${String(title)} • ${String(serviceName)}` : String(title));
                      setDocViewerLoading(true);
                      setDocViewerOpen(true);

                      if (String(d.storage_provider ?? "") === "supabase") {
                        setDocViewerSource({ table: "order_item_documents", id: String(d.id) });
                        setDocViewerUrl(null);
                        setDocViewerDownloadUrl(null);
                        setDocViewerIsDirectFile(true);
                        try {
                          const url = await getSignedStorageUrl({ supabase, table: "order_item_documents", id: String(d.id), disposition: "inline" });
                          setDocViewerUrl(url);
                        } catch (e: any) {
                          setDocViewerError(e?.message ?? "โหลดเอกสารไม่สำเร็จ");
                        }
                        setDocViewerLoading(false);
                        return;
                      }

                      if (d.drive_web_view_link) {
                        const web = String(d.drive_web_view_link);
                        const fileId = d.drive_file_id ? String(d.drive_file_id) : null;
                        setDocViewerSource(null);
                        setDocViewerUrl(drivePreviewUrl(web, fileId));
                        setDocViewerDownloadUrl(driveDownloadUrl(web, fileId));
                        setDocViewerIsDirectFile(false);
                        setDocViewerLoading(false);
                        return;
                      }

                      setDocViewerSource(null);
                      setDocViewerUrl(null);
                      setDocViewerDownloadUrl(null);
                      setDocViewerIsDirectFile(false);
                      setDocViewerLoading(false);
                    }}
                  >
                    <div className="min-w-0">
                      <div className="truncate text-sm font-semibold text-gray-900">{title}</div>
                      {subtitle ? <div className="mt-0.5 truncate text-xs text-gray-600">{subtitle}</div> : null}
                    </div>
                    <span className="inline-flex items-center rounded-full border border-gray-200 bg-gray-100 px-2 py-0.5 text-xs font-semibold text-gray-700">
                      {formatDateOnly(d.created_at)}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        ) : null}
      </div>

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
          setDocViewerError(null);
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
                    try {
                      const url = await getSignedStorageUrl({
                        supabase,
                        table: docViewerSource.table,
                        id: docViewerSource.id,
                        disposition: "attachment",
                      });
                      window.open(url, "_blank", "noopener,noreferrer");
                    } catch (e: any) {
                      setDocViewerError(e?.message ?? "ดาวน์โหลดไม่สำเร็จ");
                    }
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
                  try {
                    await downloadUrl(url, filename);
                  } catch (e: any) {
                    setDocViewerError(e?.message ?? "ดาวน์โหลดไม่สำเร็จ");
                  }
                }}
                disabled={loading || docViewerLoading || !(docViewerDownloadUrl || docViewerUrl || docViewerSource)}
              >
                ดาวน์โหลด
              </Button>
              <Button
                variant="outline"
                onClick={() => {
                  setDocViewerOpen(false);
                  setDocViewerLoading(false);
                  setDocViewerUrl(null);
                  setDocViewerDownloadUrl(null);
                  setDocViewerIsDirectFile(false);
                  setDocViewerTitle(null);
                  setDocViewerSource(null);
                  setDocViewerError(null);
                }}
                disabled={loading || docViewerLoading}
              >
                ปิด
              </Button>
            </div>
          </div>

          {docViewerError ? <div className="mt-4 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">{docViewerError}</div> : null}

          <div className="mt-4 overflow-hidden rounded-lg border border-gray-200 bg-gray-50">
            {docViewerUrl ? (
              docViewerIsDirectFile ? (
                isPdfUrl(docViewerUrl) ? (
                  <iframe src={docViewerUrl} className="h-[70vh] w-full" />
                ) : (
                  <img src={docViewerUrl} alt={docViewerTitle ?? "document"} className="h-[70vh] w-full object-contain" />
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
    </div>
  );
}

type FinanceTxnRow = {
  id: string;
  txn_type: string;
  source_type?: string | null;
  amount: number;
  txn_date?: string | null;
  expense_name?: string | null;
  note?: string | null;
};

export function ManageOrderTransactionsPanel({
  order,
  transactions,
  loading,
}: {
  order: OrderRow | null;
  transactions: FinanceTxnRow[];
  loading: boolean;
}) {
  const hasTxns = (transactions?.length ?? 0) > 0;

  if (!order?.id) return null;

  return (
    <div className="overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-sm">
      <div className="flex items-center justify-between gap-2 bg-white px-4 py-3">
        <div className="text-sm font-semibold text-gray-900">รายการธุรกรรม</div>
      </div>

      <div className="p-3">
        {!hasTxns ? (
          <div className="rounded-xl border border-dashed border-gray-200 bg-gray-50 p-3 text-sm text-gray-600">{loading ? "กำลังโหลด..." : "ยังไม่มีรายการธุรกรรม"}</div>
        ) : null}

        {hasTxns ? (
          <div>
            <div className="mt-2 grid gap-2">
              {transactions.slice(0, 12).map((t) => {
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
          </div>
        ) : null}
      </div>
    </div>
  );
}

export function ManageOrderClosePanel({
  order,
  canCloseOrder,
  canCancelOrder,
  isLocked,
  allServicesDone,
  noOutstanding,
  pendingReason,
  loading,
  onCloseOrder,
  onCancelOrder,
}: {
  order: OrderRow | null;
  canCloseOrder: boolean;
  canCancelOrder: boolean;
  isLocked: boolean;
  allServicesDone: boolean;
  noOutstanding: boolean;
  pendingReason: string;
  loading: boolean;
  onCloseOrder: () => void;
  onCancelOrder: () => void;
}) {
  return (
    <div className="rounded-xl border border-gray-200 bg-white p-4">
      <div className="text-sm font-semibold text-gray-900">ปิดออเดอร์</div>
      <div className="mt-1 text-xs text-gray-500">ปิดได้เมื่อทุกบริการเสร็จ และไม่มียอดคงค้าง</div>

      <div className="mt-3 grid gap-2">
        <div className="flex items-start gap-2 text-sm">
          <input type="checkbox" checked={allServicesDone} readOnly className="mt-0.5" />
          <div>ทุกบริการเสร็จสิ้น</div>
        </div>
        <div className="flex items-start gap-2 text-sm">
          <input type="checkbox" checked={noOutstanding} readOnly className="mt-0.5" />
          <div>ยอดคงค้าง = 0</div>
        </div>
      </div>

      {!canCloseOrder ? (
        <div className="mt-3 rounded-lg border border-gray-200 bg-gray-50 p-3 text-xs text-gray-600">{isLocked ? `ออเดอร์อยู่สถานะ ${statusLabel(order?.status ?? "-")}` : pendingReason}</div>
      ) : null}

      <div className="mt-3">
        <Button onClick={onCloseOrder} disabled={loading || !canCloseOrder} className="w-full">
          ปิดออเดอร์
        </Button>
      </div>

      {canCancelOrder && !isLocked && order?.status === "in_progress" ? (
        <div className="mt-2">
          <Button color="danger" variant="outline" onClick={onCancelOrder} disabled={loading} className="w-full">
            ยกเลิกออเดอร์
          </Button>
        </div>
      ) : null}
    </div>
  );
}

export function RecordInstallmentModal({
  isOpen,
  onClose,
  disabled,
  order,
  orderId,
  installmentNo,
  unbilledRemaining,
  unpaidBilledTotal,
  amount,
  onAmountChange,
  onSubmit,
}: {
  isOpen: boolean;
  onClose: () => void;
  disabled: boolean;
  order: OrderRow | null;
  orderId: string;
  installmentNo: number;
  unbilledRemaining: number;
  unpaidBilledTotal: number;
  amount: string;
  onAmountChange: (v: string) => void;
  onSubmit: () => void;
}) {
  const remaining = Number(order?.remaining_amount ?? 0);
  const unpaidBilled = Number(unpaidBilledTotal ?? 0);
  const unbilled = Number(unbilledRemaining ?? 0);
  const maxAmount = Math.max(0, unbilled);
  return (
    <Modal isOpen={isOpen} onClose={onClose}>
      <div className="rounded-xl bg-white p-5">
        <div className="text-base font-semibold text-gray-900">วางบิลงวดถัดไป</div>
        <div className="mt-2 rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-sm text-gray-700">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="font-medium text-gray-900">{order?.display_id ?? orderId}</div>
            <div className="font-medium text-gray-900">งวด {installmentNo}</div>
          </div>
          <div className="mt-0.5 truncate text-xs text-gray-600">{customerNameFromRel(order?.customers ?? null)}</div>
          <div className="mt-2 grid gap-1 text-xs text-gray-700">
            <div className="flex items-center justify-between gap-2">
              <div className="text-gray-600">ยอดคงเหลือ</div>
              <div className="font-semibold text-gray-900">{asMoney(remaining)}</div>
            </div>
            <div className="flex items-center justify-between gap-2">
              <div className="text-gray-600">ยอดวางบิลค้างชำระ</div>
              <div className="font-semibold text-amber-700">{asMoney(unpaidBilled)}</div>
            </div>
            <div className="flex items-center justify-between gap-2">
              <div className="text-gray-600">ยอดคงเหลือที่ยังไม่ได้วางบิล</div>
              <div className="font-semibold text-gray-900">{asMoney(maxAmount)}</div>
            </div>
          </div>
        </div>

        <div className="mt-4 grid gap-3">
          <div>
            <div className="text-sm font-medium text-gray-700">ยอดเงิน</div>
            <input
              className="mt-2 h-10 w-full rounded-md border border-gray-200 bg-white px-3 text-right text-sm"
              value={amount}
              onChange={(e) => onAmountChange(e.target.value)}
              inputMode="decimal"
              disabled={disabled}
            />
            <div className="mt-1 text-xs text-gray-500">ใส่ได้ไม่เกิน {asMoney(maxAmount)} บาท</div>
            <div className="mt-2 flex flex-wrap justify-end gap-2">
              <Button
                size="sm"
                variant="outline"
                onClick={() => onAmountChange(String(maxAmount))}
                disabled={disabled || maxAmount <= 0}
              >
                ยอดคงเหลือทั้งหมด
              </Button>
            </div>
          </div>
        </div>

        <div className="mt-5 flex flex-wrap justify-end gap-2">
          <Button
            onClick={onSubmit}
            disabled={
              disabled ||
              (() => {
                const n = Number(amount || 0);
                return !Number.isFinite(n) || n <= 0 || n > maxAmount;
              })()
            }
          >
            ออกใบแจ้งหนี้ (IV)
          </Button>
          <Button variant="outline" onClick={onClose} disabled={disabled}>
            ปิด
          </Button>
        </div>
      </div>
    </Modal>
  );
}
