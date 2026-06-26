"use client";

// journal-dialog.tsx — ฟอร์มลงบัญชี double-entry (B1) Dr/Cr 2 คอลัมน์แยก (DESIGN §7)
// + balance indicator สด + ปุ่ม post disabled เมื่อ Σdebit≠Σcredit หรืองวด closed
// + AI-2 suggest-journal (ปุ่ม "AI ช่วยลง" → เสนอ Dr/Cr ที่กดยืนยันได้)
// posted journal = อ่านอย่างเดียว (void + สร้างใหม่) · form ครอบ DialogBody+Footer (§13)

import { useEffect, useMemo, useState } from "react";
import { Plus, Trash2, Scale, Sparkles, Loader2, Check, ShieldCheck } from "lucide-react";
import cn from "@core/utils/class-names";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { CustomSelect } from "@/components/ui/custom-select";
import { ThaiDatePicker } from "@/components/ui/thai-date-picker";
import { Text } from "@/components/ui/typography";
import { StatusBadge } from "@/components/ui/badge";
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
import { useAccountingRole } from "./role-context";
import { JournalStatusBadge } from "./badges";
import { fmtMoney, fmtDateTH } from "./format";
import { journalSuggestMocks } from "../_fixtures";
import type { AccJournalEntry, AccJournalLine } from "../_fixtures/types";
import type { JournalSuggestMockResult } from "../_fixtures/ai-mocks";

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

export function JournalDialog({
  open,
  onOpenChange,
  entry,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  /** journal ที่จะดู/แก้ (null = เพิ่มใหม่) */
  entry: AccJournalEntry | null;
}) {
  const { accounts, periods, addJournal, updateJournal, voidJournal } = useAccountingData();
  const { can } = useAccountingRole();
  const canWrite = can("write", "journal");

  const isEdit = entry !== null;
  const isPosted = entry?.status === "posted";
  const isVoid = entry?.status === "void";
  const readOnly = isPosted || isVoid || !canWrite;

  const [entryDate, setEntryDate] = useState("");
  const [description, setDescription] = useState("");
  const [lines, setLines] = useState<LineDraft[]>([]);
  const [aiState, setAiState] = useState<"idle" | "loading" | "done">("idle");
  const [aiResult, setAiResult] = useState<JournalSuggestMockResult | null>(null);

  // option บัญชี (leaf ที่ active) — แสดง code + name
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
    setAiState("idle");
    setAiResult(null);
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
      setEntryDate("2026-06-26");
      setDescription("");
      setLines([
        { key: lineKey(), account_id: "", debit: "", credit: "", line_note: "" },
        { key: lineKey(), account_id: "", debit: "", credit: "", line_note: "" },
      ]);
    }
  }, [open, key, lastKey, entry]);

  // จำลอง AI latency (mock)
  useEffect(() => {
    if (aiState !== "loading") return;
    const t = window.setTimeout(() => {
      const k = Object.keys(journalSuggestMocks).find(
        (kk) => description.includes(kk) || kk.includes(description.slice(0, 4)),
      );
      setAiResult(journalSuggestMocks[k ?? "default"]);
      setAiState("done");
    }, 1000);
    return () => window.clearTimeout(t);
  }, [aiState, description]);

  const totalDebit = round2(lines.reduce((s, l) => s + (Number(l.debit) || 0), 0));
  const totalCredit = round2(lines.reduce((s, l) => s + (Number(l.credit) || 0), 0));
  const diff = round2(totalDebit - totalCredit);
  const balanced = Math.abs(diff) < 0.001 && totalDebit > 0;

  // งวดของ entry_date เปิดอยู่ไหม
  const periodStatus = useMemo(() => {
    if (!entryDate) return "none" as const;
    const d = new Date(entryDate);
    const p = periods.find((x) => x.year === d.getFullYear() && x.month === d.getMonth() + 1);
    return p ? p.status : ("none" as const);
  }, [entryDate, periods]);
  const periodClosed = periodStatus === "closed";

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

  function applyAiSuggestion() {
    if (!aiResult) return;
    setLines(
      aiResult.lines.map((sl) => {
        const acc = accounts.find((a) => a.code === sl.account_code);
        return {
          key: lineKey(),
          account_id: acc?.id ?? "",
          debit: sl.debit ? String(sl.debit) : "",
          credit: sl.credit ? String(sl.credit) : "",
          line_note: "",
        };
      }),
    );
    toast.success("เติมรายการบัญชีที่ AI แนะนำแล้ว — กรุณากรอกจำนวนเงินและตรวจสอบก่อน post");
  }

  function buildEntry(status: "draft" | "posted"): AccJournalEntry {
    const id = entry?.id ?? `jv-new-${Date.now()}`;
    const builtLines: AccJournalLine[] = lines
      .filter((l) => l.account_id && ((Number(l.debit) || 0) > 0 || (Number(l.credit) || 0) > 0))
      .map((l, i) => {
        const acc = accounts.find((a) => a.id === l.account_id);
        return {
          id: `${id}-l${i + 1}`,
          org_id: entry?.org_id ?? "00000000-0000-0000-0000-000000000001",
          journal_entry_id: id,
          account_id: l.account_id,
          debit: round2(Number(l.debit) || 0),
          credit: round2(Number(l.credit) || 0),
          line_note: l.line_note.trim() || null,
          sort_order: i + 1,
          account_code: acc?.code,
          account_name: acc?.name,
        };
      });
    return {
      id,
      org_id: entry?.org_id ?? "00000000-0000-0000-0000-000000000001",
      entry_number: entry?.entry_number ?? `JV-2026-DRAFT`,
      entry_date: entryDate,
      description: description.trim() || null,
      status,
      period_id: entry?.period_id ?? null,
      source: entry?.source ?? "manual",
      source_ref_id: entry?.source_ref_id ?? null,
      period_year: entry?.period_year ?? null,
      period_month: entry?.period_month ?? null,
      total_debit: totalDebit,
      total_credit: totalCredit,
      created_by: null,
      created_at: entry?.created_at ?? new Date().toISOString(),
      lines: builtLines,
    };
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

  function handleSaveDraft() {
    if (!validate()) return;
    const built = buildEntry("draft");
    if (isEdit) updateJournal(built);
    else addJournal(built);
    toast.success("บันทึกฉบับร่างสมุดรายวันแล้ว");
    onOpenChange(false);
  }

  function handlePost() {
    if (!validate()) return;
    if (!balanced) {
      toast.error("ยอดเดบิตและเครดิตไม่สมดุล — โพสต์ไม่ได้");
      return;
    }
    if (periodClosed) {
      toast.error("งวดบัญชีปิดแล้ว — โพสต์เข้างวดนี้ไม่ได้");
      return;
    }
    if (isEdit && entry) {
      updateJournal(buildEntry("posted"));
    } else {
      addJournal(buildEntry("posted"));
    }
    toast.success("ลงบัญชี (post) เรียบร้อย — ยอดสมดุล");
    onOpenChange(false);
  }

  function handleVoid() {
    if (!entry) return;
    voidJournal(entry.id);
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
            {/* หัวรายการ */}
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

            {/* AI-2 ช่วยลงบัญชี — เฉพาะตอนเพิ่มใหม่ + เขียนได้ */}
            {!readOnly && !isEdit && (
              <div className="rounded-lg border border-primary/20 bg-primary/[0.03] px-3 py-2.5">
                {aiState === "idle" && (
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2 text-xs text-gray-600">
                      <span className="flex h-6 w-6 items-center justify-center rounded-md bg-primary/10 text-primary">
                        <Sparkles className="h-3.5 w-3.5" />
                      </span>
                      ให้ AI ช่วยเสนอ Dr/Cr จากคำอธิบายรายการ
                    </div>
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={description.trim().length < 2}
                      onClick={() => setAiState("loading")}
                    >
                      <Sparkles className="mr-1.5 h-3.5 w-3.5" /> AI ช่วยลง
                    </Button>
                  </div>
                )}
                {aiState === "loading" && (
                  <div className="flex items-center gap-2 text-xs text-primary">
                    <Loader2 className="h-3.5 w-3.5 animate-spin" /> AI กำลังวิเคราะห์การลงบัญชี…
                  </div>
                )}
                {aiState === "done" && aiResult && (
                  <div className="space-y-2">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="flex items-center gap-1.5 text-xs font-medium text-primary">
                        <Sparkles className="h-3.5 w-3.5" /> AI เสนอการลงบัญชี
                      </span>
                      <StatusBadge
                        tone={
                          aiResult.confidence >= 0.9
                            ? "success"
                            : aiResult.confidence >= 0.8
                              ? "info"
                              : "warning"
                        }
                      >
                        ความเชื่อมั่น {Math.round(aiResult.confidence * 100)}%
                      </StatusBadge>
                      {aiResult.requires_confirmation && (
                        <StatusBadge tone="warning">
                          <ShieldCheck className="mr-1 h-3 w-3" /> ตรวจสอบก่อน post
                        </StatusBadge>
                      )}
                    </div>
                    <Text className="text-[11px] text-gray-500">{aiResult.explanation}</Text>
                    <div className="flex flex-wrap items-center gap-1.5">
                      {aiResult.lines.map((sl) => (
                        <span
                          key={sl.account_code}
                          className="rounded-md border border-gray-200 bg-white px-2 py-0.5 text-[11px] text-gray-600"
                        >
                          {sl.account_code} · {sl.account_name}
                        </span>
                      ))}
                    </div>
                    <Button size="sm" variant="outline" onClick={applyAiSuggestion}>
                      <Check className="mr-1.5 h-3.5 w-3.5" /> ใช้รายการบัญชีนี้
                    </Button>
                  </div>
                )}
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
                {entry?.created_at && ` (${fmtDateTH(entry.entry_date)})`}
              </Text>
            )}
          </div>
        </DialogBody>
        <DialogFooter>
          {/* posted → void ชิดซ้าย */}
          {isPosted && canWrite && (
            <Button type="button" variant="destructive" className="mr-auto" onClick={handleVoid}>
              <Trash2 className="mr-1.5 h-4 w-4" /> ยกเลิก (void)
            </Button>
          )}
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            {readOnly ? "ปิด" : "ยกเลิก"}
          </Button>
          {!readOnly && (
            <>
              <Button type="button" variant="secondary" onClick={handleSaveDraft}>
                บันทึกร่าง
              </Button>
              <Button type="button" disabled={!balanced || periodClosed} onClick={handlePost}>
                ลงบัญชี (post)
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
