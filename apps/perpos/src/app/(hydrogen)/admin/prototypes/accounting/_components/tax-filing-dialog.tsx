"use client";

// tax-filing-dialog.tsx — ฟอร์มแบบภาษี (B4, accountant lens เต็ม — เห็น enum/เลขดิบ)
// PP30 (ภาษีขาย/ซื้อ/สุทธิ) · PND1/3/53 (WHT) · recompute / mark-filed
// เครื่องมือมืออาชีพ → โชว์ tax_kind, period, ตัวเลขดิบทั้งหมด

import { useEffect, useState } from "react";
import { Calculator, CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { CustomSelect } from "@/components/ui/custom-select";
import { ThaiDatePicker } from "@/components/ui/thai-date-picker";
import { Text } from "@/components/ui/typography";
import {
  Dialog,
  DialogContent,
  DialogBody,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { toast } from "@/lib/toast";
import { useAccountingData } from "./data-context";
import { TaxStatusBadge, TAX_KIND_LABEL } from "./backstage-badges";
import { fmtMoney, fmtDateTH, fmtMonthYearTH } from "./format";
import type { AccTaxFiling, AccTaxKind } from "../_fixtures/types";

const KIND_OPTIONS: { value: AccTaxKind; label: string }[] = [
  { value: "pp30", label: "ภ.พ.30 — ภาษีมูลค่าเพิ่ม (PP30)" },
  { value: "pnd1", label: "ภ.ง.ด.1 — ภาษีเงินเดือนพนักงาน (PND1)" },
  { value: "pnd3", label: "ภ.ง.ด.3 — หักค่าจ้างบุคคล (PND3)" },
  { value: "pnd53", label: "ภ.ง.ด.53 — หักค่าจ้างบริษัท (PND53)" },
];

const MONTH_OPTIONS = Array.from({ length: 12 }, (_, i) => ({
  value: String(i + 1),
  label: `${i + 1}`,
}));

export function TaxFilingDialog({
  open,
  onOpenChange,
  filing,
  vatRegistered,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  filing: AccTaxFiling | null;
  vatRegistered: boolean;
}) {
  const { addTaxFiling, updateTaxFiling, recomputeTaxFiling, markFiled } = useAccountingData();
  const isEdit = filing !== null;

  const [kind, setKind] = useState<AccTaxKind>("pnd1");
  const [year, setYear] = useState("2026");
  const [month, setMonth] = useState("6");
  const [salesVat, setSalesVat] = useState("");
  const [purchaseVat, setPurchaseVat] = useState("");
  const [whtTotal, setWhtTotal] = useState("");
  const [dueDate, setDueDate] = useState("");

  const kindOptions = vatRegistered ? KIND_OPTIONS : KIND_OPTIONS.filter((o) => o.value !== "pp30");

  const key = `${open}-${filing?.id ?? "new"}`;
  const [lastKey, setLastKey] = useState("");
  useEffect(() => {
    if (!open || key === lastKey) return;
    setLastKey(key);
    if (filing) {
      setKind(filing.tax_kind);
      setYear(String(filing.period_year));
      setMonth(String(filing.period_month));
      setSalesVat(filing.sales_vat != null ? String(filing.sales_vat) : "");
      setPurchaseVat(filing.purchase_vat != null ? String(filing.purchase_vat) : "");
      setWhtTotal(filing.wht_total != null ? String(filing.wht_total) : "");
      setDueDate(filing.due_date);
    } else {
      setKind(vatRegistered ? "pp30" : "pnd1");
      setYear("2026");
      setMonth("6");
      setSalesVat("");
      setPurchaseVat("");
      setWhtTotal("");
      setDueDate("2026-07-07");
    }
  }, [open, key, lastKey, filing, vatRegistered]);

  const isPp30 = kind === "pp30";
  const isFiled = filing?.status === "filed";
  const netPayable = isPp30
    ? (Number(salesVat) || 0) - (Number(purchaseVat) || 0)
    : Number(whtTotal) || 0;

  function buildFiling(status: AccTaxFiling["status"]): AccTaxFiling {
    return {
      id: filing?.id ?? `tax-new-${Date.now()}`,
      org_id: "00000000-0000-0000-0000-000000000001",
      tax_kind: kind,
      period_year: Number(year),
      period_month: Number(month),
      status,
      sales_vat: isPp30 ? Number(salesVat) || 0 : null,
      purchase_vat: isPp30 ? Number(purchaseVat) || 0 : null,
      net_payable: netPayable,
      wht_total: isPp30 ? null : Number(whtTotal) || 0,
      due_date: dueDate || `${year}-07-07`,
      filed_at: status === "filed" ? new Date().toISOString() : (filing?.filed_at ?? null),
      created_at: filing?.created_at ?? new Date().toISOString(),
    };
  }

  function handleSave() {
    if (isEdit && filing) {
      updateTaxFiling(buildFiling(filing.status));
      toast.success("บันทึกแบบภาษีแล้ว");
    } else {
      addTaxFiling(buildFiling("draft"));
      toast.success(
        `เพิ่มแบบ ${TAX_KIND_LABEL[kind]} งวด ${fmtMonthYearTH(Number(year), Number(month))} แล้ว`,
      );
    }
    onOpenChange(false);
  }

  function handleRecompute() {
    if (!filing) return;
    recomputeTaxFiling(filing.id);
    toast.success("คำนวณยอดภาษีใหม่แล้ว — สถานะ: พร้อมยื่น");
    onOpenChange(false);
  }

  function handleMarkFiled() {
    if (!filing) return;
    markFiled(filing.id);
    toast.success(`บันทึกการยื่น ${TAX_KIND_LABEL[filing.tax_kind]} เรียบร้อย`);
    onOpenChange(false);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent size="lg">
        <DialogHeader>
          <DialogTitle>
            <span className="flex flex-wrap items-center gap-2">
              {isEdit
                ? `${TAX_KIND_LABEL[filing!.tax_kind]} · ${fmtMonthYearTH(filing!.period_year, filing!.period_month)}`
                : "เพิ่มแบบภาษี"}
              {filing && <TaxStatusBadge status={filing.status} />}
            </span>
          </DialogTitle>
        </DialogHeader>
        <DialogBody>
          <div className="space-y-4">
            <div>
              <Label>แบบภาษี *</Label>
              <CustomSelect
                className="mt-1"
                value={kind}
                onChange={(v) => setKind(v as AccTaxKind)}
                options={kindOptions}
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label htmlFor="tax-year">ปี (ค.ศ.) *</Label>
                <Input
                  id="tax-year"
                  type="number"
                  className="mt-1"
                  value={year}
                  onChange={(e) => setYear(e.target.value)}
                  disabled={isFiled}
                />
              </div>
              <div>
                <Label>เดือน *</Label>
                <CustomSelect
                  className="mt-1"
                  value={month}
                  onChange={setMonth}
                  options={MONTH_OPTIONS}
                />
              </div>
            </div>

            {isPp30 ? (
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div>
                  <Label htmlFor="tax-sales">ภาษีขาย (sales_vat)</Label>
                  <Input
                    id="tax-sales"
                    type="number"
                    className="mt-1"
                    placeholder="0.00"
                    value={salesVat}
                    onChange={(e) => setSalesVat(e.target.value)}
                    disabled={isFiled}
                  />
                </div>
                <div>
                  <Label htmlFor="tax-purchase">ภาษีซื้อ (purchase_vat)</Label>
                  <Input
                    id="tax-purchase"
                    type="number"
                    className="mt-1"
                    placeholder="0.00"
                    value={purchaseVat}
                    onChange={(e) => setPurchaseVat(e.target.value)}
                    disabled={isFiled}
                  />
                </div>
              </div>
            ) : (
              <div>
                <Label htmlFor="tax-wht">รวมภาษีหัก ณ ที่จ่าย (wht_total)</Label>
                <Input
                  id="tax-wht"
                  type="number"
                  className="mt-1"
                  placeholder="0.00"
                  value={whtTotal}
                  onChange={(e) => setWhtTotal(e.target.value)}
                  disabled={isFiled}
                />
              </div>
            )}

            <div className="rounded-lg border border-gray-200 bg-gray-50 px-4 py-3">
              <div className="flex items-center justify-between text-sm">
                <span className="text-gray-500">
                  {isPp30 ? "ยอดต้องชำระ / ขอคืน (net_payable)" : "ยอดต้องชำระ (net_payable)"}
                </span>
                <span className="font-semibold tabular-nums text-gray-900">
                  {fmtMoney(netPayable)}
                </span>
              </div>
            </div>

            <div>
              <Label>กำหนดยื่น (due_date) *</Label>
              <ThaiDatePicker value={dueDate} onChange={setDueDate} placeholder="เลือกกำหนดยื่น" />
            </div>

            {filing && (
              <Text className="text-xs text-gray-400">
                สร้างเมื่อ {fmtDateTH(filing.created_at.slice(0, 10))}
                {filing.filed_at && ` · ยื่นแล้ว ${fmtDateTH(filing.filed_at.slice(0, 10))}`}
              </Text>
            )}
          </div>
        </DialogBody>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            ปิด
          </Button>
          {isEdit && !isFiled && (
            <>
              <Button type="button" variant="secondary" onClick={handleRecompute}>
                <Calculator className="mr-1.5 h-4 w-4" /> คำนวณใหม่
              </Button>
              <Button type="button" onClick={handleMarkFiled}>
                <CheckCircle2 className="mr-1.5 h-4 w-4" /> บันทึกการยื่น
              </Button>
            </>
          )}
          {(!isEdit || (isEdit && !isFiled)) && (
            <Button type="button" variant={isEdit ? "outline" : "default"} onClick={handleSave}>
              บันทึก
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
