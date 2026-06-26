"use client";

// entry-dialog.tsx — ฟอร์มเพิ่ม/แก้ไขรายรับ-รายจ่าย (A2 pattern dialog)
//
// U3 (binding): owner/staff lens เห็น 4 ช่องหลัก — รับ/จ่าย · จำนวนเงิน · วันที่ · หมวด+โน้ต
//   + AI แนะหมวด (ชิป suggestion, ไม่บังคับ)
//   WHT (wht_rate/wht_amount) = โซน "ขั้นสูง" collapse default — โผล่เฉพาะ accountant lens
// ปุ่มลบ = mr-auto (โหมดแก้ไข) · form ครอบ DialogBody+DialogFooter (DESIGN §13)

import { useEffect, useMemo, useState } from "react";
import { ArrowDownLeft, ArrowUpRight, ChevronDown, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { CustomSelect } from "@/components/ui/custom-select";
import { SegmentedControl } from "@/components/ui/segmented";
import { ThaiDatePicker } from "@/components/ui/thai-date-picker";
import {
  Dialog,
  DialogContent,
  DialogBody,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import cn from "@core/utils/class-names";
import { toast } from "@/lib/toast";
import { Text } from "@/components/ui/typography";
import { useAccountingData, type NewEntryInput } from "./data-context";
import { useAccountingRole } from "./role-context";
import { fmtMoney } from "./format";
import { computeWht } from "./money";
import { AiSuggestBox } from "./ai-suggest-box";
import type { AccEntry } from "../_fixtures/types";

/** หมวดมาตรฐาน (รวมจาก fixtures + หมวดบัญชีไทยที่พบบ่อย) */
const INCOME_CATEGORIES = ["รายได้จากการขาย/บริการ", "รายได้อื่น"];
const EXPENSE_CATEGORIES = [
  "ค่าเช่า",
  "ค่าสาธารณูปโภค",
  "ค่าวัสดุสิ้นเปลือง",
  "ค่าการตลาดและโฆษณา",
  "เงินเดือนและค่าจ้าง",
  "ต้นทุนขาย/บริการ (COGS)",
  "ค่าใช้จ่ายในการบริหาร",
  "ค่าใช้จ่ายอื่น",
];

const WHT_RATE_OPTIONS = [
  { value: "", label: "ไม่มี" },
  { value: "1", label: "1%" },
  { value: "2", label: "2%" },
  { value: "3", label: "3%" },
  { value: "5", label: "5%" },
  { value: "10", label: "10%" },
  { value: "15", label: "15%" },
];

export function EntryDialog({
  open,
  onOpenChange,
  /** entry ที่จะแก้ไข (null = เพิ่มใหม่) */
  entry,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  entry: AccEntry | null;
}) {
  const { contacts, addEntry, updateEntry, deleteEntry } = useAccountingData();
  const { role } = useAccountingRole();
  const isEdit = entry !== null;

  // WHT advanced zone — accountant lens เท่านั้น (U3)
  const showWhtZone = role === "accountant";

  const [kind, setKind] = useState<AccEntry["kind"]>("expense");
  const [amount, setAmount] = useState("");
  const [date, setDate] = useState("");
  const [category, setCategory] = useState("");
  const [description, setDescription] = useState("");
  const [contactId, setContactId] = useState("");
  const [whtRate, setWhtRate] = useState("");
  const [whtOpen, setWhtOpen] = useState(false);

  // reset เมื่อเปิดใหม่ / สลับ entry
  const key = `${open}-${entry?.id ?? "new"}`;
  const [lastKey, setLastKey] = useState("");
  useEffect(() => {
    if (!open || key === lastKey) return;
    setLastKey(key);
    if (entry) {
      setKind(entry.kind);
      setAmount(String(entry.amount));
      setDate(entry.entry_date);
      setCategory(entry.category ?? "");
      setDescription(entry.description ?? "");
      setContactId(entry.contact_id ?? "");
      setWhtRate(entry.wht_rate ? String(entry.wht_rate) : "");
      setWhtOpen(!!entry.wht_rate);
    } else {
      setKind("expense");
      setAmount("");
      setDate("2026-06-26");
      setCategory("");
      setDescription("");
      setContactId("");
      setWhtRate("");
      setWhtOpen(false);
    }
  }, [open, key, lastKey, entry]);

  const categoryOptions = useMemo(() => {
    const base = kind === "income" ? INCOME_CATEGORIES : EXPENSE_CATEGORIES;
    return [{ value: "", label: "— เลือกหมวด —" }, ...base.map((c) => ({ value: c, label: c }))];
  }, [kind]);

  const contactOptions = useMemo(
    () => [
      { value: "", label: "— ไม่ระบุ —" },
      ...contacts.map((c) => ({ value: c.id, label: c.name })),
    ],
    [contacts],
  );

  const amountNum = Number(amount);
  const whtRateNum = whtRate ? Number(whtRate) : null;
  const whtAmount = computeWht(Number.isFinite(amountNum) ? amountNum : 0, whtRateNum);

  function handleSubmit() {
    const amt = Number(amount);
    if (!Number.isFinite(amt) || amt <= 0) {
      toast.error("กรุณากรอกจำนวนเงินที่ถูกต้อง");
      return;
    }
    if (!date) {
      toast.error("กรุณาเลือกวันที่");
      return;
    }
    const payload: NewEntryInput = {
      kind,
      entry_date: date,
      amount: amt,
      category: category || null,
      description: description.trim() || null,
      contact_id: contactId || null,
      wht_rate: whtRateNum,
      wht_amount: whtRateNum ? whtAmount : null,
    };
    if (isEdit && entry) {
      updateEntry(entry.id, payload);
      toast.success(`แก้ไขรายการ ${fmtMoney(amt)} สำเร็จ`);
    } else {
      addEntry(payload);
      toast.success(
        `${kind === "income" ? "บันทึกรายรับ" : "บันทึกรายจ่าย"} ${fmtMoney(amt)} สำเร็จ`,
      );
    }
    onOpenChange(false);
  }

  function handleDelete() {
    if (!entry) return;
    deleteEntry(entry.id);
    toast.success("ลบรายการแล้ว");
    onOpenChange(false);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent size="lg">
        <DialogHeader>
          <DialogTitle>{isEdit ? "แก้ไขรายการ" : "เพิ่มรายรับ-รายจ่าย"}</DialogTitle>
        </DialogHeader>
        <form
          className="flex min-h-0 flex-1 flex-col"
          onSubmit={(e) => {
            e.preventDefault();
            handleSubmit();
          }}
        >
          <DialogBody>
            <div className="space-y-4">
              {/* 1. รับ/จ่าย — pill (SegmentedControl มาตรฐาน) */}
              <div>
                <Label>ประเภท</Label>
                <div className="mt-1">
                  <SegmentedControl
                    fullWidth
                    ariaLabel="ประเภทรายการ"
                    value={kind}
                    onChange={(v) => {
                      setKind(v);
                      setCategory("");
                    }}
                    options={[
                      {
                        value: "income",
                        label: "รายรับ (เงินเข้า)",
                        icon: <ArrowDownLeft className="h-4 w-4" />,
                        activeClassName: "bg-green-600",
                      },
                      {
                        value: "expense",
                        label: "รายจ่าย (เงินออก)",
                        icon: <ArrowUpRight className="h-4 w-4" />,
                        activeClassName: "bg-red-600",
                      },
                    ]}
                  />
                </div>
              </div>

              {/* 2 + 3. จำนวนเงิน + วันที่ */}
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div>
                  <Label htmlFor="ent-amount">จำนวนเงิน (฿) *</Label>
                  <Input
                    id="ent-amount"
                    type="number"
                    className="mt-1"
                    placeholder="0.00"
                    value={amount}
                    onChange={(e) => setAmount(e.target.value)}
                  />
                </div>
                <div>
                  <Label>วันที่ *</Label>
                  <ThaiDatePicker value={date} onChange={setDate} placeholder="เลือกวันที่" />
                </div>
              </div>

              {/* 4. หมวด + โน้ต */}
              <div>
                <Label htmlFor="ent-desc">คำอธิบายรายการ</Label>
                <Input
                  id="ent-desc"
                  className="mt-1"
                  placeholder="เช่น ค่าเช่าสำนักงาน เดือนมิถุนายน"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                />
              </div>

              {/* AI แนะหมวด (ชิป suggestion — ไม่บังคับ) */}
              <AiSuggestBox
                description={description}
                currentCategory={category}
                onApply={(c) => setCategory(c)}
              />

              <div>
                <Label htmlFor="ent-category">หมวด</Label>
                <CustomSelect
                  className="mt-1"
                  value={category}
                  onChange={setCategory}
                  options={categoryOptions}
                />
              </div>

              <div>
                <Label htmlFor="ent-contact">ผู้ติดต่อ (ลูกค้า/ผู้ขาย)</Label>
                <CustomSelect
                  className="mt-1"
                  value={contactId}
                  onChange={setContactId}
                  options={contactOptions}
                />
              </div>

              {/* ขั้นสูง: WHT — accountant lens เท่านั้น (U3) */}
              {showWhtZone && (
                <div className="rounded-lg border border-gray-200">
                  <Button
                    type="button"
                    variant="ghost"
                    onClick={() => setWhtOpen((v) => !v)}
                    className="h-auto w-full justify-between rounded-lg px-3 py-2.5 text-sm font-medium text-gray-700 hover:bg-gray-50"
                  >
                    <span>ขั้นสูง — ภาษีหัก ณ ที่จ่าย (WHT)</span>
                    <ChevronDown
                      className={cn(
                        "h-4 w-4 shrink-0 text-gray-400 transition-transform duration-200",
                        whtOpen && "rotate-180",
                      )}
                    />
                  </Button>
                  {whtOpen && (
                    <div className="space-y-3 border-t border-gray-100 px-3 py-3">
                      <div>
                        <Label htmlFor="ent-wht">อัตราหัก ณ ที่จ่าย</Label>
                        <CustomSelect
                          className="mt-1 w-40"
                          value={whtRate}
                          onChange={setWhtRate}
                          options={WHT_RATE_OPTIONS}
                        />
                      </div>
                      {whtRateNum && (
                        <Text className="text-xs text-gray-500">
                          ยอดหัก ณ ที่จ่าย ={" "}
                          <span className="font-medium tabular-nums text-gray-900">
                            {fmtMoney(whtAmount)}
                          </span>{" "}
                          (จากยอด {fmtMoney(Number.isFinite(amountNum) ? amountNum : 0)})
                        </Text>
                      )}
                    </div>
                  )}
                </div>
              )}
            </div>
          </DialogBody>
          <DialogFooter>
            {isEdit && (
              <Button
                type="button"
                variant="destructive"
                className="mr-auto"
                onClick={handleDelete}
              >
                <Trash2 className="mr-1.5 h-4 w-4" /> ลบ
              </Button>
            )}
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              ยกเลิก
            </Button>
            <Button type="submit">{isEdit ? "บันทึกการแก้ไข" : "บันทึก"}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
