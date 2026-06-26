"use client";

// journal-dialog.tsx (production) — ฟอร์มลงบัญชี double-entry (B1) Dr/Cr 2 คอลัมน์แยก (DESIGN §7)
//   + balance indicator สด + ปุ่ม post disabled เมื่อ Σdebit≠Σcredit หรืองวด closed
//   posted journal = อ่านอย่างเดียว (void + สร้างใหม่) · form ครอบ DialogBody+Footer (§13)
//   ต่างจาก prototype: ตัด AI suggest ออก · mutator = API จริง (async) → toast ตามผล

import { useEffect, useMemo, useState } from "react";
import { Plus, Trash2, Scale } from "lucide-react";
import cn from "@core/utils/class-names";
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
import { useAccountingData, type JournalInput } from "./data-provider";
import { useAccountingRole } from "./role-context";
import { JournalStatusBadge } from "./badges";
import { fmtMoney, fmtDateTH } from "./format";
import type { AccJournalEntry } from "@/lib/accounting/types";

interface LineDraft {
  key: string;
  account_id: string;
  debit: string;
  credit: string;
  line_note: string;
}

let lk = 1;
const lineKey = () => `ln-${Date.now()}-${lk++}`;
const round2 = (n: number) => Math.round(n * 100) / 100;
const todayISO = () => new Date().toISOString().slice(0, 10);

export function JournalDialog({
  open,
  onOpenChange,
  entry,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  /** journal ที่จะดู/แก้ (null = เพิ่มใหม่) — ต้องมี lines (มาจาก getJournalEntry) */
  entry: AccJournalEntry | null;
}) {
  const { accounts, periods, addJournal, updateJournal, postJournal, voidJournal } =
    useAccountingData();
  const { can } = useAccountingRole();
  const canWrite = can("write", "journal");

  const isEdit = entry !== null;
  const isPosted = entry?.status === "posted";
  const isVoid = entry?.status === "void";
  const readOnly = isPosted || isVoid || !canWrite;

  const [entryDate, setEntryDate] = useState("");
  const [description, setDescription] = useState("");
  const [lines, setLines] = useState<LineDraft[]>([]);
  const [saving, setSaving] = useState(false);

  const accountOptions = useMemo(
    () => [
      { value: "", label: "— เลือกบัญชี —" },
      ...accounts
        .filter((a) => a.is_active)
        .sort((a, b) => a.code.localeCompare(b.code))
        .map((a) => ({ value: a.id, label: `${a.code} · ${a.name}` })),
    ],
    [accounts],
  );

  const key = `${open}-${entry?.id ?? "new"}`;
  const [lastKey, setLastKey] = useState("");
  useEffect(() => {
    if (!open || key === lastKey) return;
    setLastKey(key);
    setSaving(false);
    if (entry) {
      setEntryDate(entry.entry_date);
      setDescription(entry.description ?? "");
      setLines(
        (entry.lines ?? []).map((l) => ({
          key: lineKey(),
          account_id: l.account_id,
          debit: l.debit ? String(l.debit) : "",
          credit: l.credit ? String(l.credit) : "",
          line_note: l.line_note ?? "",
        })),
      );
    } else {
      setEntryDate(todayISO());
      setDescription("");
      setLines([
        { key: lineKey(), account_id: "", debit: "", credit: "", line_note: "" },
        { key: lineKey(), account_id: "", debit: "", credit: "", line_note: "" },
      ]);
    }
  }, [open, key, lastKey, entry]);

  const totalDebit = round2(lines.reduce((s, l) => s + (Number(l.debit) || 0), 0));
  const totalCredit = round2(lines.reduce((s, l) => s + (Number(l.credit) || 0), 0));
  const diff = round2(totalDebit - totalCredit);
  const balanced = Math.abs(diff) < 0.001 && totalDebit > 0;

  // งวดของ entry_date ปิดอยู่ไหม (เตือนล่วงหน้า — API บังคับซ้ำตอน post)
  const periodClosed = useMemo(() => {
    if (!entryDate) return false;
    const d = new Date(entryDate);
    const p = periods.find((x) => x.year === d.getFullYear() && x.month === d.getMonth() + 1);
    return p?.status === "closed";
  }, [entryDate, periods]);

  function setLine(k: string, patch: Partial<LineDraft>) {
    setLines((prev) => prev.map((l) => (l.key === k ? { ...l, ...patch } : l)));
  }
  function addLine() {
    setLines((prev) => [
      ...prev,
      { key: lineKey(), account_id: "", debit: "", credit: "", line_note: "" },
    ]);
  }
  function removeLine(k: string) {
    setLines((prev) => (prev.length <= 2 ? prev : prev.filter((l) => l.key !== k)));
  }

  function validate(): boolean {
    if (!entryDate) {
      toast.error("กรุณาเลือกวันที่");
      return false;
    }
    const filled = lines.filter(
      (l) => l.account_id && ((Number(l.debit) || 0) > 0 || (Number(l.credit) || 0) > 0),
    );
    if (filled.length < 2) {
      toast.error("ต้องมีอย่างน้อย 2 บรรทัด (Dr และ Cr)");
      return false;
    }
    return true;
  }

  function buildInput(): JournalInput {
    return {
      entry_date: entryDate,
      description: description.trim() || null,
      lines: lines
        .filter((l) => l.account_id && ((Number(l.debit) || 0) > 0 || (Number(l.credit) || 0) > 0))
        .map((l) => ({
          account_id: l.account_id,
          debit: round2(Number(l.debit) || 0),
          credit: round2(Number(l.credit) || 0),
          line_note: l.line_note.trim() || null,
        })),
    };
  }

  async function handleSaveDraft() {
    if (!validate()) return;
    setSaving(true);
    const input = buildInput();
    const r = isEdit && entry ? await updateJournal(entry.id, input) : await addJournal(input);
    setSaving(false);
    if (!r.ok) {
      toast.error(r.error ?? "บันทึกไม่สำเร็จ");
      return;
    }
    toast.success("บันทึกฉบับร่างสมุดรายวันแล้ว");
    onOpenChange(false);
  }

  async function handlePost() {
    if (!validate()) return;
    if (!balanced) {
      toast.error("ยอดเดบิตและเครดิตไม่สมดุล — โพสต์ไม่ได้");
      return;
    }
    setSaving(true);
    const input = buildInput();
    let targetId = entry?.id ?? null;
    if (isEdit && entry) {
      const r = await updateJournal(entry.id, input);
      if (!r.ok) {
        setSaving(false);
        toast.error(r.error ?? "บันทึกไม่สำเร็จ");
        return;
      }
    } else {
      const r = await addJournal(input);
      if (!r.ok || !r.id) {
        setSaving(false);
        toast.error(r.error ?? "บันทึกไม่สำเร็จ");
        return;
      }
      targetId = r.id;
    }
    if (!targetId) {
      setSaving(false);
      return;
    }
    const pr = await postJournal(targetId);
    setSaving(false);
    if (!pr.ok) {
      toast.error(pr.error ?? "ลงบัญชีไม่สำเร็จ");
      return;
    }
    toast.success("ลงบัญชี (post) เรียบร้อย — ยอดสมดุล");
    onOpenChange(false);
  }

  async function handleVoid() {
    if (!entry) return;
    setSaving(true);
    const r = await voidJournal(entry.id);
    setSaving(false);
    if (!r.ok) {
      toast.error(r.error ?? "ยกเลิกไม่สำเร็จ");
      return;
    }
    toast.success(`ยกเลิก (void) ${entry.entry_number} แล้ว`);
    onOpenChange(false);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent size="2xl">
        <DialogHeader>
          <DialogTitle>
            <span className="flex flex-wrap items-center gap-2">
              {isEdit ? entry!.entry_number : "เพิ่มรายการสมุดรายวัน"}
              {entry && <JournalStatusBadge status={entry.status} />}
            </span>
          </DialogTitle>
        </DialogHeader>
        <DialogBody>
          <div className="space-y-4">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div>
                <Label>วันที่ *</Label>
                <ThaiDatePicker
                  value={entryDate}
                  onChange={setEntryDate}
                  placeholder="เลือกวันที่"
                />
              </div>
              <div>
                <Label htmlFor="jv-desc">คำอธิบาย</Label>
                <Input
                  id="jv-desc"
                  className="mt-1"
                  placeholder="เช่น จ่ายค่าเช่าสำนักงาน มิถุนายน"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  disabled={readOnly}
                />
              </div>
            </div>

            {periodClosed && (
              <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs font-medium text-amber-700">
                งวดบัญชีของวันที่นี้ปิดแล้ว — ไม่สามารถ post เข้างวดนี้ได้ (เปิดงวดที่หน้า “ภาษี &
                ปิดงวด” ก่อน)
              </div>
            )}

            {/* ตาราง Dr/Cr — 2 คอลัมน์แยก (DESIGN §7) */}
            <div>
              <div className="mb-2 flex items-center justify-between">
                <Label className="mb-0">รายการบัญชี (Dr / Cr)</Label>
                {!readOnly && (
                  <Button type="button" size="sm" variant="outline" onClick={addLine}>
                    <Plus className="mr-1 h-3.5 w-3.5" /> เพิ่มบรรทัด
                  </Button>
                )}
              </div>
              <div className="space-y-2">
                {lines.map((l) => (
                  <div
                    key={l.key}
                    className="grid grid-cols-1 gap-2 rounded-lg border border-gray-200 bg-gray-50/60 p-2.5 sm:grid-cols-[1fr_auto_auto_auto]"
                  >
                    <CustomSelect
                      value={l.account_id}
                      onChange={(v) => setLine(l.key, { account_id: v })}
                      options={accountOptions}
                      className="w-full"
                      disabled={readOnly}
                    />
                    <Input
                      type="number"
                      placeholder="เดบิต"
                      className="w-full sm:w-32"
                      value={l.debit}
                      disabled={readOnly}
                      onChange={(e) => setLine(l.key, { debit: e.target.value, credit: "" })}
                    />
                    <Input
                      type="number"
                      placeholder="เครดิต"
                      className="w-full sm:w-32"
                      value={l.credit}
                      disabled={readOnly}
                      onChange={(e) => setLine(l.key, { credit: e.target.value, debit: "" })}
                    />
                    {!readOnly ? (
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        onClick={() => removeLine(l.key)}
                        disabled={lines.length <= 2}
                        className="text-gray-400 hover:text-red-600"
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    ) : (
                      <span className="hidden w-9 sm:block" />
                    )}
                  </div>
                ))}
              </div>
            </div>

            {/* balance indicator สด (DESIGN §7) */}
            <div
              className={cn(
                "flex flex-wrap items-center justify-between gap-3 rounded-lg border px-4 py-3",
                balanced ? "border-green-200 bg-green-50" : "border-amber-200 bg-amber-50",
              )}
            >
              <div className="flex items-center gap-2 text-sm font-medium">
                <Scale className={cn("h-4 w-4", balanced ? "text-green-600" : "text-amber-600")} />
                <span className={balanced ? "text-green-700" : "text-amber-700"}>
                  {balanced ? "ยอดสมดุล (Dr = Cr)" : "ยอดไม่สมดุล"}
                </span>
              </div>
              <div className="flex items-center gap-4 text-sm">
                <span className="text-gray-500">
                  รวมเดบิต{" "}
                  <span className="font-medium tabular-nums text-gray-900">
                    {fmtMoney(totalDebit)}
                  </span>
                </span>
                <span className="text-gray-500">
                  รวมเครดิต{" "}
                  <span className="font-medium tabular-nums text-gray-900">
                    {fmtMoney(totalCredit)}
                  </span>
                </span>
                {!balanced && (
                  <span className="font-medium tabular-nums text-amber-700">
                    ต่าง {fmtMoney(Math.abs(diff))}
                  </span>
                )}
              </div>
            </div>

            {isPosted && (
              <Text className="text-xs text-gray-400">
                รายการที่ลงบัญชีแล้ว (posted) แก้ไขไม่ได้ — ถ้าผิดให้ “ยกเลิก (void)” แล้วสร้างใหม่
                {entry?.source === "payroll" && " · รายการนี้สร้างอัตโนมัติจากระบบเงินเดือน"}
                {entry?.source === "depreciation" &&
                  " · รายการนี้สร้างอัตโนมัติจากการตั้งค่าเสื่อม"}
                {entry?.entry_date && ` (${fmtDateTH(entry.entry_date)})`}
              </Text>
            )}
          </div>
        </DialogBody>
        <DialogFooter>
          {isPosted && canWrite && (
            <Button
              type="button"
              variant="destructive"
              className="mr-auto"
              disabled={saving}
              onClick={() => void handleVoid()}
            >
              <Trash2 className="mr-1.5 h-4 w-4" /> ยกเลิก (void)
            </Button>
          )}
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            {readOnly ? "ปิด" : "ยกเลิก"}
          </Button>
          {!readOnly && (
            <>
              <Button
                type="button"
                variant="secondary"
                disabled={saving}
                onClick={() => void handleSaveDraft()}
              >
                บันทึกร่าง
              </Button>
              <Button
                type="button"
                disabled={!balanced || periodClosed || saving}
                onClick={() => void handlePost()}
              >
                {saving ? "กำลังบันทึก…" : "ลงบัญชี (post)"}
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
