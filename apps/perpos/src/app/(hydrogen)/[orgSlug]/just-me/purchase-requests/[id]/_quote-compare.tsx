"use client";

/**
 * _quote-compare.tsx — ตารางเทียบราคาผู้ขาย (แถว = รายการ · คอลัมน์ = ผู้ขาย)
 * ไฮไลต์ราคาต่ำสุดของแต่ละแถว + เจ้าที่ถูกเลือก · ปุ่ม "เลือกเจ้านี้"
 * ⛔ ยอดรวมของแต่ละเจ้าคิดฝั่ง server (`quoteTotal`) — ที่นี่แสดงอย่างเดียว
 */

import { useEffect, useState } from "react";
import { BadgeCheck, Plus } from "lucide-react";
import { StatusBadge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { CustomSelect } from "@/components/ui/custom-select";
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Table,
  TableBody,
  TableCell,
  TableEmpty,
  TableFooter,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { ThaiDatePicker } from "@/components/ui/thai-date-picker";
import { Text } from "@/components/ui/typography";
import { notify } from "@/lib/toast";
import { VENDOR_QUOTE_STATUS_LABEL } from "@/lib/just-me/labels";
import type { JustMePrItem, JustMeVendorQuote, JustMeVendorQuoteItem } from "@/lib/just-me/types";
import { jmSend } from "../../_components/api-client";
import { money } from "../../_components/format";
import type { PrOption } from "./_types";

interface QuoteForm {
  quote_id: string | null;
  vendor_id: string;
  quote_no: string;
  quote_date: string;
  delivery_days: string;
  credit_terms: string;
  note: string;
  prices: Record<string, string>;
}

const EMPTY_FORM: QuoteForm = {
  quote_id: null,
  vendor_id: "",
  quote_no: "",
  quote_date: "",
  delivery_days: "",
  credit_terms: "",
  note: "",
  prices: {},
};

export function QuoteCompare({
  orgId,
  prId,
  canWrite,
  canSelect,
  items,
  quotes,
  quoteItems,
  vendorOptions,
  selectedVendorId,
  onChanged,
}: {
  orgId: string;
  prId: string;
  canWrite: boolean;
  /** เลือกผู้ขายได้เมื่อใบอนุมัติแล้วและยังไม่ได้รับของ */
  canSelect: boolean;
  items: JustMePrItem[];
  quotes: JustMeVendorQuote[];
  quoteItems: JustMeVendorQuoteItem[];
  vendorOptions: PrOption[];
  selectedVendorId: string | null;
  onChanged: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<QuoteForm>(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [selecting, setSelecting] = useState<string | null>(null);

  useEffect(() => {
    if (!open) setForm(EMPTY_FORM);
  }, [open]);

  const vendorName = new Map(vendorOptions.map((v) => [v.value, v.label]));
  const priceOf = (quoteId: string, prItemId: string): number | null => {
    const line = quoteItems.find((l) => l.quote_id === quoteId && l.pr_item_id === prItemId);
    return line?.unit_cost ?? null;
  };

  function openCreate() {
    setForm({ ...EMPTY_FORM, prices: {} });
    setOpen(true);
  }

  function openEdit(quote: JustMeVendorQuote) {
    const prices: Record<string, string> = {};
    for (const item of items) {
      const v = priceOf(quote.id, item.id);
      prices[item.id] = v === null ? "" : String(v);
    }
    setForm({
      quote_id: quote.id,
      vendor_id: quote.vendor_id,
      quote_no: quote.quote_no ?? "",
      quote_date: quote.quote_date ?? "",
      delivery_days: quote.delivery_days === null ? "" : String(quote.delivery_days),
      credit_terms: quote.credit_terms ?? "",
      note: quote.note ?? "",
      prices,
    });
    setOpen(true);
  }

  async function save() {
    if (!form.quote_id && !form.vendor_id) {
      notify.error("กรุณาเลือกผู้ขาย");
      return;
    }
    setSaving(true);
    try {
      const lines = items
        .filter((it) => (form.prices[it.id] ?? "").trim() !== "")
        .map((it) => ({ pr_item_id: it.id, unit_cost: Number(form.prices[it.id]), qty: it.qty }));
      const body = {
        quote_id: form.quote_id,
        vendor_id: form.vendor_id || null,
        quote_no: form.quote_no.trim() || null,
        quote_date: form.quote_date || null,
        delivery_days: form.delivery_days.trim() || null,
        credit_terms: form.credit_terms.trim() || null,
        note: form.note.trim() || null,
        lines,
      };
      await jmSend(
        orgId,
        `purchase-requests/${prId}/quotes`,
        form.quote_id ? "PATCH" : "POST",
        body,
      );
      notify.success("บันทึกใบเสนอราคาแล้ว");
      setOpen(false);
      onChanged();
    } catch (e) {
      notify.error(e, "บันทึกใบเสนอราคาไม่สำเร็จ");
    } finally {
      setSaving(false);
    }
  }

  async function selectVendor(quote: JustMeVendorQuote) {
    setSelecting(quote.id);
    try {
      await jmSend(orgId, `purchase-requests/${prId}`, "PATCH", {
        action: "select-vendor",
        quote_id: quote.id,
      });
      notify.success(`เลือก ${vendorName.get(quote.vendor_id) ?? "ผู้ขาย"} แล้ว`);
      onChanged();
    } catch (e) {
      notify.error(e, "เลือกผู้ขายไม่สำเร็จ");
    } finally {
      setSelecting(null);
    }
  }

  return (
    <div className="space-y-2.5">
      <div className="flex items-center gap-2 px-1">
        <div className="text-sm font-semibold text-gray-900">เทียบราคาผู้ขาย</div>
        {canWrite && (
          <Button size="sm" variant="outline" className="ms-auto" onClick={openCreate}>
            <Plus className="h-4 w-4" /> เพิ่มใบเสนอราคา
          </Button>
        )}
      </div>

      <Table className="shadow-sm">
        <TableHeader>
          <TableRow>
            <TableHead>รายการ</TableHead>
            <TableHead align="right">จำนวน</TableHead>
            {quotes.map((qt) => (
              <TableHead key={qt.id} align="right">
                <span className="inline-flex items-center gap-1">
                  {vendorName.get(qt.vendor_id) ?? "ผู้ขาย"}
                  {qt.vendor_id === selectedVendorId && (
                    <BadgeCheck className="h-4 w-4 text-green-600" />
                  )}
                </span>
              </TableHead>
            ))}
          </TableRow>
        </TableHeader>
        <TableBody>
          {items.length === 0 || quotes.length === 0 ? (
            <TableEmpty colSpan={2 + quotes.length}>
              {items.length === 0
                ? "ยังไม่มีรายการในใบขอซื้อ"
                : "ยังไม่มีใบเสนอราคา — เพิ่มราคาจากผู้ขาย 2–3 เจ้าเพื่อเทียบ"}
            </TableEmpty>
          ) : (
            items.map((item) => {
              const prices = quotes.map((qt) => priceOf(qt.id, item.id));
              const valid = prices.filter((p): p is number => p !== null);
              const min = valid.length > 0 ? Math.min(...valid) : null;
              return (
                <TableRow key={item.id}>
                  <TableCell className="font-medium text-gray-900">{item.name}</TableCell>
                  <TableCell align="right" className="tabular-nums">
                    {item.qty.toLocaleString("th-TH")} {item.unit}
                  </TableCell>
                  {quotes.map((qt, i) => (
                    <TableCell
                      key={qt.id}
                      align="right"
                      tabular
                      className={
                        prices[i] !== null && min !== null && prices[i] === min
                          ? "font-semibold text-green-600"
                          : undefined
                      }
                    >
                      {money(prices[i])}
                    </TableCell>
                  ))}
                </TableRow>
              );
            })
          )}
        </TableBody>
        {quotes.length > 0 && items.length > 0 && (
          <TableFooter>
            <TableRow>
              <TableCell className="font-semibold">ยอดรวม</TableCell>
              <TableCell />
              {quotes.map((qt) => (
                <TableCell key={qt.id} align="right" tabular className="font-semibold">
                  {money(qt.total_amount)}
                </TableCell>
              ))}
            </TableRow>
          </TableFooter>
        )}
      </Table>

      {quotes.length > 0 && (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {quotes.map((qt) => (
            <div key={qt.id} className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
              <div className="flex items-center gap-2">
                <Text className="text-sm font-medium text-gray-900">
                  {vendorName.get(qt.vendor_id) ?? "ผู้ขาย"}
                </Text>
                <StatusBadge
                  tone={
                    qt.status === "selected"
                      ? "success"
                      : qt.status === "rejected"
                        ? "neutral"
                        : "info"
                  }
                >
                  {VENDOR_QUOTE_STATUS_LABEL[qt.status]}
                </StatusBadge>
              </div>
              <Text className="mt-1 text-xs text-gray-500">
                ยอด {money(qt.total_amount)}
                {qt.delivery_days !== null ? ` · ส่งของใน ${qt.delivery_days} วัน` : ""}
                {qt.credit_terms ? ` · ${qt.credit_terms}` : ""}
              </Text>
              {canWrite && (
                <div className="mt-3 flex gap-2">
                  <Button size="sm" variant="outline" onClick={() => openEdit(qt)}>
                    แก้ราคา
                  </Button>
                  {canSelect && qt.status !== "selected" && (
                    <Button
                      size="sm"
                      onClick={() => selectVendor(qt)}
                      disabled={selecting === qt.id || qt.total_amount === null}
                    >
                      {selecting === qt.id ? "กำลังเลือก…" : "เลือกเจ้านี้"}
                    </Button>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent size="2xl">
          <DialogHeader>
            <DialogTitle>{form.quote_id ? "แก้ไขใบเสนอราคา" : "เพิ่มใบเสนอราคาผู้ขาย"}</DialogTitle>
          </DialogHeader>
          <DialogBody>
            <div className="space-y-4">
              {!form.quote_id && (
                <div>
                  <Label>ผู้ขาย *</Label>
                  <div className="mt-1">
                    <CustomSelect
                      value={form.vendor_id}
                      onChange={(v) => setForm((f) => ({ ...f, vendor_id: v }))}
                      options={[{ value: "", label: "— เลือกผู้ขาย —" }, ...vendorOptions]}
                    />
                  </div>
                </div>
              )}
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div>
                  <Label htmlFor="jm-quote-no">เลขที่ใบเสนอราคา</Label>
                  <Input
                    id="jm-quote-no"
                    className="mt-1"
                    value={form.quote_no}
                    onChange={(e) => setForm((f) => ({ ...f, quote_no: e.target.value }))}
                  />
                </div>
                <div>
                  <Label>วันที่เสนอราคา</Label>
                  <div className="mt-1">
                    <ThaiDatePicker
                      value={form.quote_date}
                      onChange={(iso) => setForm((f) => ({ ...f, quote_date: iso }))}
                    />
                  </div>
                </div>
                <div>
                  <Label htmlFor="jm-quote-days">ส่งของภายใน (วัน)</Label>
                  <Input
                    id="jm-quote-days"
                    className="mt-1"
                    inputMode="numeric"
                    value={form.delivery_days}
                    onChange={(e) => setForm((f) => ({ ...f, delivery_days: e.target.value }))}
                  />
                </div>
                <div>
                  <Label htmlFor="jm-quote-terms">เงื่อนไขชำระเงิน</Label>
                  <Input
                    id="jm-quote-terms"
                    className="mt-1"
                    value={form.credit_terms}
                    onChange={(e) => setForm((f) => ({ ...f, credit_terms: e.target.value }))}
                    placeholder="เช่น เครดิต 30 วัน"
                  />
                </div>
              </div>

              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>รายการ</TableHead>
                    <TableHead align="right">จำนวน</TableHead>
                    <TableHead align="right">ราคา/หน่วยที่เสนอ</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {items.length === 0 ? (
                    <TableEmpty colSpan={3}>ยังไม่มีรายการในใบขอซื้อ</TableEmpty>
                  ) : (
                    items.map((it) => (
                      <TableRow key={it.id}>
                        <TableCell wrap>{it.name}</TableCell>
                        <TableCell align="right" className="tabular-nums">
                          {it.qty.toLocaleString("th-TH")} {it.unit}
                        </TableCell>
                        <TableCell align="right">
                          <Input
                            className="w-32 text-right"
                            inputMode="decimal"
                            value={form.prices[it.id] ?? ""}
                            onChange={(e) =>
                              setForm((f) => ({
                                ...f,
                                prices: { ...f.prices, [it.id]: e.target.value },
                              }))
                            }
                          />
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>

              <div>
                <Label htmlFor="jm-quote-note">หมายเหตุ</Label>
                <Input
                  id="jm-quote-note"
                  className="mt-1"
                  value={form.note}
                  onChange={(e) => setForm((f) => ({ ...f, note: e.target.value }))}
                />
              </div>
            </div>
          </DialogBody>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)} disabled={saving}>
              ยกเลิก
            </Button>
            <Button onClick={save} disabled={saving}>
              {saving ? "กำลังบันทึก…" : "บันทึก"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
