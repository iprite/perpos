"use client";

import React from "react";
import toast from "react-hot-toast";
import { Button } from "rizzui";
import { Modal } from "@core/modal-views/modal";

type InstallmentItem = {
  id: string;
  source: "quote" | "order";
  name: string;
  description: string;
  quantity: number;
  full_unit_price: number;
  billed_unit_price_sum: number;
  remaining_unit_price: number;
  sort_order: number;
};

type ItemsResponse = {
  ok: true;
  source: "quote" | "order";
  quoteId: string | null;
  includeVat: boolean;
  vatRate: number;
  whtRate: number;
  items: InstallmentItem[];
};

function safeNumber(v: unknown) {
  const n = Number(v ?? 0);
  return Number.isFinite(n) ? n : 0;
}

function round2(n: number) {
  return Math.round(safeNumber(n) * 100) / 100;
}

function asMoney(n: number) {
  const x = Number.isFinite(n) ? n : 0;
  return new Intl.NumberFormat("th-TH", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(x);
}

export function InvoiceCreateModal({
  isOpen,
  onClose,
  orderId,
  orderDisplayId,
  customerName,
  installmentNo,
  disabled,
  onCreated,
}: {
  isOpen: boolean;
  onClose: () => void;
  orderId: string | null;
  orderDisplayId?: string | null;
  customerName?: string | null;
  installmentNo: number;
  disabled?: boolean;
  onCreated?: (invoiceId: string) => void;
}) {
  const [mode, setMode] = React.useState<"full" | "installment">("full");
  const [loading, setLoading] = React.useState(false);
  const [itemsLoading, setItemsLoading] = React.useState(false);
  const [itemsError, setItemsError] = React.useState<string | null>(null);
  const [items, setItems] = React.useState<InstallmentItem[]>([]);
  const [itemsSource, setItemsSource] = React.useState<"quote" | "order">("order");
  const [includeVat, setIncludeVat] = React.useState(true);
  const [vatRate, setVatRate] = React.useState(7);
  const [whtRate, setWhtRate] = React.useState(0);
  const [billedUnitPrice, setBilledUnitPrice] = React.useState<Record<string, string>>({});

  React.useEffect(() => {
    if (!isOpen) return;
    setMode((prev) => (installmentNo !== 1 ? "installment" : prev));
    setItems([]);
    setBilledUnitPrice({});
    setItemsError(null);
  }, [installmentNo, isOpen]);

  const loadItems = React.useCallback(async () => {
    const id = String(orderId ?? "").trim();
    if (!id) return;
    setItemsLoading(true);
    setItemsError(null);
    try {
      const res = await fetch("/api/invoices/installment-items", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ orderId: id }),
      });
      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(data.error || "โหลดรายการบริการไม่สำเร็จ");
      }
      const data = (await res.json().catch(() => null)) as ItemsResponse | null;
      if (!data?.ok) throw new Error("โหลดรายการบริการไม่สำเร็จ");
      setItemsSource(data.source);
      setIncludeVat(!!data.includeVat);
      setVatRate(round2(data.vatRate));
      setWhtRate(round2(data.whtRate));
      const sorted = [...(data.items ?? [])].sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0));
      setItems(sorted);
      setBilledUnitPrice(() => {
        const next: Record<string, string> = {};
        for (const it of sorted) next[it.id] = "0";
        return next;
      });
    } catch (e: any) {
      setItemsError(e?.message ?? "โหลดรายการบริการไม่สำเร็จ");
      setItems([]);
      setBilledUnitPrice({});
    }
    setItemsLoading(false);
  }, [orderId]);

  React.useEffect(() => {
    if (!isOpen) return;
    if (mode !== "installment") return;
    loadItems();
  }, [isOpen, loadItems, mode]);

  const computed = React.useMemo(() => {
    const lines = items.map((it) => {
      const raw = String(billedUnitPrice[it.id] ?? "0").replaceAll(",", "").trim();
      const u = Math.max(0, safeNumber(raw));
      const unit = round2(u);
      const qty = Math.max(0, safeNumber(it.quantity) || 0) || 1;
      const lineTotal = round2(qty * unit);
      const remaining = round2(Math.max(0, safeNumber(it.remaining_unit_price)));
      const isOver = unit > remaining + 0.0001;
      return { id: it.id, unit, qty, lineTotal, remaining, isOver };
    });
    const subtotal = round2(lines.reduce((acc, x) => acc + x.lineTotal, 0));
    const vat = includeVat && vatRate > 0 ? round2(subtotal * (vatRate / 100)) : 0;
    const wht = whtRate > 0 ? round2(subtotal * (whtRate / 100)) : 0;
    const grand = round2(subtotal + vat - wht);
    const anyOver = lines.some((x) => x.isOver);
    const anyPositive = lines.some((x) => x.unit > 0);
    return { linesById: new Map(lines.map((x) => [x.id, x])), subtotal, vat, wht, grand, anyOver, anyPositive };
  }, [billedUnitPrice, includeVat, items, vatRate, whtRate]);

  const fillAllRemaining = React.useCallback(() => {
    setBilledUnitPrice((prev) => {
      const next = { ...prev };
      for (const it of items) {
        next[it.id] = String(round2(Math.max(0, safeNumber(it.remaining_unit_price))));
      }
      return next;
    });
  }, [items]);

  const clearAll = React.useCallback(() => {
    setBilledUnitPrice((prev) => {
      const next = { ...prev };
      for (const it of items) next[it.id] = "0";
      return next;
    });
  }, [items]);

  const submit = React.useCallback(async () => {
    const id = String(orderId ?? "").trim();
    if (!id) return;
    if (mode === "installment") {
      if (computed.anyOver) {
        toast.error("ยอดต่อหน่วยเกินยอดคงเหลือ");
        return;
      }
      if (!computed.anyPositive) {
        toast.error("กรุณาระบุยอดชำระอย่างน้อย 1 รายการ");
        return;
      }
    }

    setLoading(true);
    setItemsError(null);
    try {
      if (mode === "full") {
        const res = await fetch("/api/invoices/create-from-order-full", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ orderId: id }),
        });
        const data = (await res.json().catch(() => ({}))) as { ok?: boolean; invoiceId?: string; invoiceNo?: string | null; error?: string };
        if (!res.ok || !data.ok) throw new Error(data.error || "ออกใบแจ้งหนี้ไม่สำเร็จ");
        const invoiceId = String(data.invoiceId ?? "").trim();
        toast.success(`ออกใบแจ้งหนี้${data.invoiceNo ? ` ${data.invoiceNo}` : ""} แล้ว`);
        if (invoiceId) {
          onCreated?.(invoiceId);
          window.open(`/invoices/${invoiceId}`, "_blank", "noopener,noreferrer");
        }
        onClose();
        setLoading(false);
        return;
      }

      const payloadItems = items.map((it) => {
        const raw = String(billedUnitPrice[it.id] ?? "0").replaceAll(",", "").trim();
        const n = round2(Math.max(0, safeNumber(raw)));
        return itemsSource === "quote"
          ? { sourceQuoteItemId: it.id, billedUnitPrice: n }
          : { sourceOrderItemId: it.id, billedUnitPrice: n };
      });

      const res = await fetch("/api/invoices/create-from-order-installment-by-items", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ orderId: id, installmentNo, items: payloadItems }),
      });
      const data = (await res.json().catch(() => ({}))) as { ok?: boolean; invoiceId?: string; invoiceNo?: string | null; error?: string };
      if (!res.ok || !data.ok) throw new Error(data.error || "ออกใบแจ้งหนี้ไม่สำเร็จ");
      const invoiceId = String(data.invoiceId ?? "").trim();
      toast.success(`ออกใบแจ้งหนี้${data.invoiceNo ? ` ${data.invoiceNo}` : ""} แล้ว`);
      if (invoiceId) {
        onCreated?.(invoiceId);
        window.open(`/invoices/${invoiceId}`, "_blank", "noopener,noreferrer");
      }
      onClose();
    } catch (e: any) {
      setItemsError(e?.message ?? "ออกใบแจ้งหนี้ไม่สำเร็จ");
    }
    setLoading(false);
  }, [billedUnitPrice, computed.anyOver, computed.anyPositive, installmentNo, items, itemsSource, mode, onClose, onCreated, orderId]);

  return (
    <Modal isOpen={isOpen} onClose={onClose} size="lg" rounded="md">
      <div className="rounded-xl bg-white p-5">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div>
            <div className="text-base font-semibold text-gray-900">ออกใบแจ้งหนี้ (IV)</div>
            <div className="mt-1 text-sm text-gray-600">
              {orderDisplayId ? `ออเดอร์ ${orderDisplayId}` : ""}
              {customerName ? ` • ${customerName}` : ""}
              {mode === "installment" ? ` • งวด ${installmentNo}` : ""}
            </div>
          </div>
          {installmentNo === 1 ? (
            <div className="inline-flex overflow-hidden rounded-md border border-gray-200 bg-white">
              <button
                type="button"
                className={`h-9 px-3 text-sm font-medium ${
                  mode === "full" ? "bg-gray-100 text-gray-900" : "bg-white text-gray-700 hover:bg-gray-50"
                }`}
                onClick={() => setMode("full")}
                disabled={disabled || loading}
              >
                ชำระเต็ม
              </button>
              <button
                type="button"
                className={`h-9 border-l border-gray-200 px-3 text-sm font-medium ${
                  mode === "installment" ? "bg-gray-100 text-gray-900" : "bg-white text-gray-700 hover:bg-gray-50"
                }`}
                onClick={() => setMode("installment")}
                disabled={disabled || loading}
              >
                แบ่งชำระ
              </button>
            </div>
          ) : (
            <div className="inline-flex h-9 items-center rounded-md border border-gray-200 bg-gray-50 px-3 text-sm font-medium text-gray-700">แบ่งชำระ</div>
          )}
        </div>

        {itemsError ? <div className="mt-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{itemsError}</div> : null}

        {mode === "full" ? (
          <div className="mt-4 rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-sm text-gray-700">
            IV และ RT จะใช้รายการบริการเหมือน QT/ออเดอร์ 100% (เปลี่ยนเฉพาะหัวเอกสาร)
          </div>
        ) : (
          <div className="mt-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="text-sm font-semibold text-gray-900">กำหนดยอดชำระต่อบริการ (ต่อหน่วย)</div>
              <div className="flex flex-wrap gap-2">
                <Button size="sm" variant="outline" onClick={fillAllRemaining} disabled={disabled || loading || itemsLoading || items.length === 0}>
                  วางบิลเต็มคงเหลือ
                </Button>
                <Button size="sm" variant="outline" onClick={clearAll} disabled={disabled || loading || itemsLoading || items.length === 0}>
                  ล้าง
                </Button>
              </div>
            </div>

            <div className="mt-3 overflow-hidden rounded-lg border border-gray-200">
              <div className="grid grid-cols-[1.3fr_90px_120px_120px_140px_120px] gap-2 bg-gray-50 px-3 py-2 text-xs font-semibold text-gray-600">
                <div>บริการ</div>
                <div className="text-center">จำนวน</div>
                <div className="text-right">เต็ม/หน่วย</div>
                <div className="text-right">คงเหลือ/หน่วย</div>
                <div className="text-right">ชำระ/หน่วย</div>
                <div className="text-right">รวม</div>
              </div>
              <div className="divide-y divide-gray-100 bg-white">
                {itemsLoading ? (
                  <div className="px-3 py-3 text-sm text-gray-600">กำลังโหลด...</div>
                ) : items.length === 0 ? (
                  <div className="px-3 py-3 text-sm text-gray-600">ไม่พบรายการบริการ</div>
                ) : (
                  items.map((it) => {
                    const line = computed.linesById.get(it.id);
                    const over = !!line?.isOver;
                    return (
                      <div key={it.id} className="grid grid-cols-[1.3fr_90px_120px_120px_140px_120px] gap-2 px-3 py-2 text-sm">
                        <div className="min-w-0">
                          <div className="truncate font-medium text-gray-900">{it.name || "บริการ"}</div>
                          {it.description ? <div className="mt-0.5 truncate text-xs text-gray-500">{it.description}</div> : null}
                        </div>
                        <div className="text-center text-gray-700">{Number(it.quantity ?? 0).toLocaleString()}</div>
                        <div className="text-right text-gray-700">{asMoney(it.full_unit_price)}</div>
                        <div className="text-right text-gray-700">{asMoney(it.remaining_unit_price)}</div>
                        <div className="text-right">
                          <input
                            className={`h-9 w-full rounded-md border px-2 text-right text-sm ${
                              over ? "border-red-300 bg-red-50" : "border-gray-200 bg-white"
                            }`}
                            value={billedUnitPrice[it.id] ?? "0"}
                            onChange={(e) => {
                              const v = e.target.value;
                              setBilledUnitPrice((prev) => ({ ...prev, [it.id]: v }));
                            }}
                            inputMode="decimal"
                            disabled={disabled || loading}
                          />
                        </div>
                        <div className="text-right font-semibold text-gray-900">{asMoney(line?.lineTotal ?? 0)}</div>
                      </div>
                    );
                  })
                )}
              </div>
            </div>

            <div className="mt-3 rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-sm">
              <div className="flex items-center justify-between gap-2">
                <div className="text-gray-600">ยอดก่อน VAT</div>
                <div className="font-semibold text-gray-900">{asMoney(computed.subtotal)}</div>
              </div>
              <div className="mt-1 flex items-center justify-between gap-2">
                <div className="text-gray-600">VAT{includeVat && vatRate > 0 ? ` (${vatRate}%)` : ""}</div>
                <div className="font-semibold text-gray-900">{asMoney(computed.vat)}</div>
              </div>
              {whtRate > 0 ? (
                <div className="mt-1 flex items-center justify-between gap-2">
                  <div className="text-gray-600">หัก ณ ที่จ่าย ({whtRate}%)</div>
                  <div className="font-semibold text-gray-900">{asMoney(computed.wht)}</div>
                </div>
              ) : null}
              <div className="mt-2 flex items-center justify-between gap-2 border-t border-gray-200 pt-2">
                <div className="font-semibold text-gray-900">ยอดสุทธิ</div>
                <div className="font-semibold text-gray-900">{asMoney(computed.grand)}</div>
              </div>
            </div>
          </div>
        )}

        <div className="mt-5 flex flex-wrap justify-end gap-2">
          <Button variant="outline" onClick={onClose} disabled={disabled || loading}>
            ปิด
          </Button>
          <Button onClick={submit} disabled={disabled || loading || !orderId || (mode === "installment" && (itemsLoading || items.length === 0))}>
            ออกใบแจ้งหนี้
          </Button>
        </div>
      </div>
    </Modal>
  );
}
