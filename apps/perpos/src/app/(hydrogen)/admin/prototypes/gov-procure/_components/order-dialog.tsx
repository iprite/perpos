"use client";

// order-dialog.tsx — สร้าง/แก้ order (shared: list + detail)
// spec §3 group A (พื้นฐาน) + group B (การเงิน) · ThaiDatePicker · CustomSelect company
//   department = Input + autocomplete (DEPARTMENT_SUGGESTIONS)
// finance field-lock (P2-d/Q4): staff → field การเงิน (FINANCE_LOCKED_FIELDS) disabled + banner
//   "ข้อมูลการเงิน — ดูอย่างเดียว (สิทธิ์ผู้จัดการ/เจ้าของ)" · viewer เปิดไม่ได้ (คุมที่ caller ด้วย)
// auto-suggest gross_profit จาก price_incl_vat − cost_price แต่แก้ทับได้ · toast ทุก mutation

import { useEffect, useMemo, useState } from "react";
import { FilePlus2, Lock } from "lucide-react";
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
import { useData } from "./data-context";
import { useRole } from "./role-context";
import { fmtMoney } from "./format";
import { DEPARTMENT_SUGGESTIONS, type GovProcureOrder, type Company } from "../_fixtures/types";

const COMPANY_OPTIONS = [
  { value: "", label: "— เลือกบริษัท —" },
  { value: "89 Global Work", label: "89 Global Work" },
  { value: "P2P Supply", label: "P2P Supply" },
];

interface FormState {
  customer_name: string;
  department: string;
  company: Company | "";
  qt_reference: string;
  product_description: string;
  start_date: string;
  price_incl_vat: string;
  cost_price: string;
  gross_profit: string;
  net_receivable: string;
  security_deposit: string;
  notes: string;
}

const EMPTY: FormState = {
  customer_name: "",
  department: "",
  company: "",
  qt_reference: "",
  product_description: "",
  start_date: "",
  price_incl_vat: "",
  cost_price: "",
  gross_profit: "",
  net_receivable: "",
  security_deposit: "",
  notes: "",
};

function numOrNull(s: string): number | null {
  if (s.trim() === "") return null;
  const n = Number(s.replace(/,/g, ""));
  return Number.isFinite(n) ? n : null;
}

function strOf(n: number | null | undefined): string {
  return n == null ? "" : String(n);
}

export function OrderDialog({
  order,
  open,
  onOpenChange,
}: {
  /** null = สร้างใหม่ · order = แก้ไข */
  order: GovProcureOrder | null;
  open: boolean;
  onOpenChange: (v: boolean) => void;
}) {
  const { addOrder, updateOrder } = useData();
  const { canEditFinance } = useRole();
  const isEdit = order !== null;

  const [form, setForm] = useState<FormState>(EMPTY);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  // seed form ทุกครั้งที่เปิด (สร้าง=EMPTY · แก้=จาก order)
  useEffect(() => {
    if (!open) return;
    if (order) {
      setForm({
        customer_name: order.customer_name ?? "",
        department: order.department ?? "",
        company: order.company ?? "",
        qt_reference: order.qt_reference ?? "",
        product_description: order.product_description ?? "",
        start_date: order.start_date ?? "",
        price_incl_vat: strOf(order.price_incl_vat),
        cost_price: strOf(order.cost_price),
        gross_profit: strOf(order.gross_profit),
        net_receivable: strOf(order.net_receivable),
        security_deposit: strOf(order.security_deposit),
        notes: order.notes ?? "",
      });
    } else {
      setForm(EMPTY);
    }
    setErr(null);
    setSaving(false);
  }, [open, order]);

  // auto-suggest gross_profit = price − cost (แต่ไม่ override ถ้าผู้ใช้พิมพ์เอง)
  const suggestedGross = useMemo(() => {
    const p = numOrNull(form.price_incl_vat);
    const c = numOrNull(form.cost_price);
    if (p == null || c == null) return null;
    return p - c;
  }, [form.price_incl_vat, form.cost_price]);

  function set<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  function useSuggestedGross() {
    if (suggestedGross != null) set("gross_profit", String(suggestedGross));
  }

  function handleSubmit() {
    if (!form.customer_name.trim()) {
      setErr("กรุณากรอกชื่อหน่วยงาน");
      return;
    }
    setSaving(true);
    const financePatch: Partial<GovProcureOrder> = canEditFinance
      ? {
          price_incl_vat: numOrNull(form.price_incl_vat),
          cost_price: numOrNull(form.cost_price),
          gross_profit: numOrNull(form.gross_profit),
          net_receivable: numOrNull(form.net_receivable),
          security_deposit: numOrNull(form.security_deposit),
        }
      : {};

    if (isEdit && order) {
      updateOrder(order.id, {
        customer_name: form.customer_name.trim(),
        department: form.department.trim() || null,
        company: form.company || null,
        qt_reference: form.qt_reference.trim() || null,
        product_description: form.product_description.trim() || null,
        start_date: form.start_date || null,
        notes: form.notes.trim() || null,
        ...financePatch,
      });
      toast.success(`บันทึกการแก้ไข ${form.qt_reference || form.customer_name} แล้ว`);
    } else {
      addOrder({
        customer_name: form.customer_name.trim(),
        department: form.department.trim() || null,
        company: form.company || null,
        qt_reference: form.qt_reference.trim() || null,
        product_description: form.product_description.trim() || null,
        start_date: form.start_date || null,
        price_incl_vat: canEditFinance ? numOrNull(form.price_incl_vat) : null,
        cost_price: canEditFinance ? numOrNull(form.cost_price) : null,
        notes: form.notes.trim() || null,
      });
      toast.success("สร้างงานใหม่แล้ว (สถานะ: เสนอราคา)");
    }
    onOpenChange(false);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent size="xl">
        <DialogHeader>
          <DialogTitle>
            <span className="flex items-center gap-2">
              <FilePlus2 className="h-5 w-5 text-primary" />
              {isEdit ? "แก้ไขงานจัดซื้อ" : "สร้างงานจัดซื้อใหม่"}
            </span>
          </DialogTitle>
        </DialogHeader>
        <form
          className="flex min-h-0 flex-1 flex-col"
          onSubmit={(e) => {
            e.preventDefault();
            handleSubmit();
          }}
        >
          <DialogBody>
            <div className="space-y-5">
              {/* ── กลุ่ม A: ข้อมูลพื้นฐาน ── */}
              <section>
                <Text className="mb-2.5 text-xs font-semibold uppercase tracking-wide text-gray-500">
                  ข้อมูลพื้นฐาน
                </Text>
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <div className="sm:col-span-2">
                    <Label htmlFor="od-customer">หน่วยงานภาครัฐ (เทศบาล/อบต.) *</Label>
                    <Input
                      id="od-customer"
                      value={form.customer_name}
                      onChange={(e) => set("customer_name", e.target.value)}
                      placeholder="เช่น เทศบาลเมืองบางแก้ว"
                    />
                  </div>
                  <div>
                    <Label htmlFor="od-department">กอง/หน่วยงาน</Label>
                    <Input
                      id="od-department"
                      list="gp-dept-suggest"
                      value={form.department}
                      onChange={(e) => set("department", e.target.value)}
                      placeholder="เลือกหรือพิมพ์ เช่น กองคลัง"
                    />
                    <datalist id="gp-dept-suggest">
                      {DEPARTMENT_SUGGESTIONS.map((d) => (
                        <option key={d} value={d} />
                      ))}
                    </datalist>
                  </div>
                  <div>
                    <Label htmlFor="od-company">บริษัทตัวกลาง</Label>
                    <CustomSelect
                      value={form.company}
                      onChange={(v) => set("company", v as Company | "")}
                      options={COMPANY_OPTIONS}
                    />
                  </div>
                  <div>
                    <Label htmlFor="od-qt">เลขที่ QT</Label>
                    <Input
                      id="od-qt"
                      value={form.qt_reference}
                      onChange={(e) => set("qt_reference", e.target.value)}
                      placeholder="เช่น QT2026070001"
                    />
                  </div>
                  <div>
                    <Label htmlFor="od-start">วันที่เริ่มงาน / วัน QT</Label>
                    <ThaiDatePicker
                      value={form.start_date}
                      onChange={(iso) => set("start_date", iso)}
                      placeholder="เลือกวันที่"
                    />
                  </div>
                  <div className="sm:col-span-2">
                    <Label htmlFor="od-product">รายการครุภัณฑ์/พัสดุ</Label>
                    <Input
                      id="od-product"
                      value={form.product_description}
                      onChange={(e) => set("product_description", e.target.value)}
                      placeholder="เช่น เครื่องคอมพิวเตอร์ตั้งโต๊ะ 10 เครื่อง"
                    />
                  </div>
                </div>
              </section>

              {/* ── กลุ่ม B: การเงิน (finance-lock lens) ── */}
              <section>
                <div className="mb-2.5 flex items-center gap-2">
                  <Text className="text-xs font-semibold uppercase tracking-wide text-gray-500">
                    การเงิน
                  </Text>
                  {!canEditFinance && (
                    <span className="inline-flex items-center gap-1 rounded-full border border-gray-300 bg-gray-50 px-2 py-0.5 text-[11px] font-medium text-gray-500">
                      <Lock className="h-3 w-3" /> ดูอย่างเดียว
                    </span>
                  )}
                </div>

                {!canEditFinance && (
                  <div className="mb-3 flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2.5">
                    <Lock className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />
                    <Text className="text-xs text-amber-800">
                      ข้อมูลการเงิน — ดูอย่างเดียว (สิทธิ์ผู้จัดการ/เจ้าของ)
                    </Text>
                  </div>
                )}

                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <div>
                    <Label htmlFor="od-price">ยอดเสนอราคา (รวม VAT) ฿</Label>
                    <Input
                      id="od-price"
                      type="number"
                      inputMode="decimal"
                      disabled={!canEditFinance}
                      value={form.price_incl_vat}
                      onChange={(e) => set("price_incl_vat", e.target.value)}
                      placeholder="0.00"
                    />
                  </div>
                  <div>
                    <Label htmlFor="od-cost">ราคาทุน (ต้นทุนซื้อของ) ฿</Label>
                    <Input
                      id="od-cost"
                      type="number"
                      inputMode="decimal"
                      disabled={!canEditFinance}
                      value={form.cost_price}
                      onChange={(e) => set("cost_price", e.target.value)}
                      placeholder="0.00"
                    />
                  </div>
                  <div>
                    <Label htmlFor="od-gross">กำไรขั้นต้น ฿</Label>
                    <Input
                      id="od-gross"
                      type="number"
                      inputMode="decimal"
                      disabled={!canEditFinance}
                      value={form.gross_profit}
                      onChange={(e) => set("gross_profit", e.target.value)}
                      placeholder="0.00"
                    />
                    {canEditFinance &&
                      suggestedGross != null &&
                      String(suggestedGross) !== form.gross_profit && (
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          className="mt-1 h-auto px-1 py-0.5 text-xs font-medium text-primary hover:underline"
                          onClick={useSuggestedGross}
                        >
                          ใช้ค่าคำนวณ {fmtMoney(suggestedGross)} (เสนอ − ทุน)
                        </Button>
                      )}
                  </div>
                  <div>
                    <Label htmlFor="od-net">ยอดสุทธิรับจากภาครัฐ ฿</Label>
                    <Input
                      id="od-net"
                      type="number"
                      inputMode="decimal"
                      disabled={!canEditFinance}
                      value={form.net_receivable}
                      onChange={(e) => set("net_receivable", e.target.value)}
                      placeholder="0.00"
                    />
                  </div>
                  <div>
                    <Label htmlFor="od-deposit">เงินประกันสัญญา ฿</Label>
                    <Input
                      id="od-deposit"
                      type="number"
                      inputMode="decimal"
                      disabled={!canEditFinance}
                      value={form.security_deposit}
                      onChange={(e) => set("security_deposit", e.target.value)}
                      placeholder="0.00"
                    />
                  </div>
                </div>
              </section>

              {/* ── หมายเหตุ ── */}
              <div>
                <Label htmlFor="od-notes">หมายเหตุ</Label>
                <Input
                  id="od-notes"
                  value={form.notes}
                  onChange={(e) => set("notes", e.target.value)}
                  placeholder="บันทึกเพิ่มเติม (ถ้ามี)"
                />
              </div>

              {err && (
                <Text className="text-xs font-medium text-red-600">{err}</Text>
              )}
            </div>
          </DialogBody>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              ยกเลิก
            </Button>
            <Button type="submit" disabled={saving}>
              {saving ? "กำลังบันทึก…" : isEdit ? "บันทึกการแก้ไข" : "สร้างงาน"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
