"use client";

// ตัวเลขรายเดือน — เลือกงวด → กรอกตัวเลขรายบริษัท (dialog) หรือกด "ดึงจากระบบบัญชี"
// กฎ: ช่องว่าง = ยังไม่มีข้อมูล (บันทึกเป็น null) ไม่ใช่ 0 · ตัวเลขที่ดึงอัตโนมัติมีป้ายกำกับที่มา

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Download, Lock, ReceiptText } from "lucide-react";
import { PageShell } from "@/components/ui/page-shell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { StatusBadge } from "@/components/ui/badge";
import { SegmentedControl } from "@/components/ui/segmented";
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableEmpty,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { toast } from "@/lib/toast";
import type { P2pgCompany, P2pgFinancial } from "@/lib/p2p-group/types";
import { FINANCIAL_SOURCE_LABEL, formatMoney, formatThaiMonth } from "@/lib/p2p-group/labels";
import { grossProfit } from "@/lib/p2p-group/metrics";
import { MonthFilter } from "../_components/month-filter";
import { p2pgMutate, withOrg } from "../_components/api";

const NUM_FIELDS = [
  { key: "revenue", label: "รายได้", sensitive: false },
  { key: "cogs", label: "ต้นทุนขาย", sensitive: true },
  { key: "opex", label: "ค่าใช้จ่ายดำเนินงาน", sensitive: true },
  { key: "other_income", label: "รายได้อื่น", sensitive: true },
  { key: "net_profit", label: "กำไรสุทธิ", sensitive: true },
  { key: "cash_balance", label: "เงินสดคงเหลือ", sensitive: true },
  { key: "total_assets", label: "สินทรัพย์รวม", sensitive: true },
  { key: "total_liabilities", label: "หนี้สินรวม", sensitive: true },
  { key: "equity", label: "ส่วนของผู้ถือหุ้น", sensitive: true },
  { key: "ar", label: "ลูกหนี้การค้า", sensitive: true },
  { key: "ap", label: "เจ้าหนี้การค้า", sensitive: true },
] as const;

type NumKey = (typeof NUM_FIELDS)[number]["key"];
type FormState = Record<NumKey | "headcount", string> & { note: string; is_locked: boolean };

function emptyForm(): FormState {
  const base = Object.fromEntries(NUM_FIELDS.map((f) => [f.key, ""])) as Record<NumKey, string>;
  return { ...base, headcount: "", note: "", is_locked: false };
}

function toForm(f: P2pgFinancial): FormState {
  const out = emptyForm();
  for (const field of NUM_FIELDS) {
    const v = f[field.key];
    out[field.key] = v == null ? "" : String(v);
  }
  out.headcount = f.headcount == null ? "" : String(f.headcount);
  out.note = f.note ?? "";
  out.is_locked = f.is_locked;
  return out;
}

export function FinancialsClient({
  companies,
  financials,
  periodMonth,
  orgId,
  canWrite,
  canSeeMoney,
}: {
  companies: P2pgCompany[];
  financials: P2pgFinancial[];
  periodMonth: string;
  orgId: string;
  canWrite: boolean;
  canSeeMoney: boolean;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [target, setTarget] = useState<P2pgCompany | null>(null);
  const [existing, setExisting] = useState<P2pgFinancial | null>(null);
  const [form, setForm] = useState<FormState>(emptyForm());
  const [saving, setSaving] = useState(false);
  const [syncing, setSyncing] = useState(false);

  const byCompany = new Map(financials.map((f) => [f.company_id, f]));

  function openEdit(c: P2pgCompany) {
    const f = byCompany.get(c.id) ?? null;
    setTarget(c);
    setExisting(f);
    setForm(f ? toForm(f) : emptyForm());
    setOpen(true);
  }

  async function save() {
    if (!target) return;
    setSaving(true);
    try {
      const num = (v: string) => (v.trim() === "" ? null : Number(v));
      const payload: Record<string, unknown> = {
        company_id: target.id,
        period_month: periodMonth,
        source: "manual",
        headcount: num(form.headcount),
        note: form.note.trim() || null,
        is_locked: form.is_locked,
      };
      for (const field of NUM_FIELDS) {
        if (field.sensitive && !canSeeMoney) continue; // viewer เขียนไม่ได้อยู่แล้ว แต่กันไว้อีกชั้น
        payload[field.key] = num(form[field.key]);
      }
      await p2pgMutate(withOrg("/api/p2p-group/financials", orgId), "POST", payload);
      toast.success("บันทึกตัวเลขแล้ว");
      setOpen(false);
      router.refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "บันทึกไม่สำเร็จ");
    } finally {
      setSaving(false);
    }
  }

  async function syncFromAccounting() {
    setSyncing(true);
    try {
      const res = await p2pgMutate<{
        pulled: { companyName: string }[];
        skipped: { companyName: string; reasonLabel: string }[];
      }>(withOrg("/api/p2p-group/financials/sync", orgId), "POST", { period: periodMonth });

      if (res.pulled.length === 0) {
        toast.error(
          `ไม่ได้ตัวเลขจากระบบบัญชีเลย — ${res.skipped
            .map((s) => `${s.companyName}: ${s.reasonLabel}`)
            .join(" · ")}`,
        );
      } else {
        const skipMsg = res.skipped.length
          ? ` · ข้าม ${res.skipped.length} บริษัท (${res.skipped
              .map((s) => `${s.companyName}: ${s.reasonLabel}`)
              .join(", ")})`
          : "";
        toast.success(`ดึงข้อมูลได้ ${res.pulled.length} บริษัท${skipMsg}`);
      }
      router.refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "ดึงข้อมูลไม่สำเร็จ");
    } finally {
      setSyncing(false);
    }
  }

  const setField = (k: keyof FormState, v: string | boolean) =>
    setForm((prev) => ({ ...prev, [k]: v }) as FormState);

  return (
    <PageShell
      title="ตัวเลขรายเดือน"
      description={`ผลประกอบการรายบริษัท — งวด ${formatThaiMonth(periodMonth)}`}
      icon={<ReceiptText className="h-6 w-6" />}
      width="wide"
      actions={
        <div className="flex flex-wrap items-center gap-2">
          <MonthFilter value={periodMonth} />
          {canWrite && (
            <Button variant="outline" onClick={syncFromAccounting} disabled={syncing}>
              <Download className="me-1 h-4 w-4" />
              {syncing ? "กำลังดึง…" : "ดึงจากระบบบัญชี"}
            </Button>
          )}
        </div>
      }
    >
      <div className="space-y-4">
        <p className="text-sm text-gray-500">
          ปุ่ม &quot;ดึงจากระบบบัญชี&quot; จะดึงรายได้/ต้นทุนของบริษัทที่เชื่อมกับองค์กรในระบบแล้วเท่านั้น
          และ<strong>จะไม่ทับตัวเลขที่กรอกเองหรืองวดที่ปิดแล้ว</strong> — ตัวเลขที่เหลือกรอกได้จากตารางนี้
        </p>

        <Table className="shadow-sm">
          <TableHeader>
            <TableRow>
              <TableHead>บริษัท</TableHead>
              <TableHead align="right">รายได้</TableHead>
              {canSeeMoney && <TableHead align="right">ต้นทุนขาย</TableHead>}
              {canSeeMoney && <TableHead align="right">กำไรขั้นต้น</TableHead>}
              {canSeeMoney && <TableHead align="right">กำไรสุทธิ</TableHead>}
              {canSeeMoney && <TableHead align="right">เงินสด</TableHead>}
              <TableHead align="right">พนักงาน</TableHead>
              <TableHead align="center">ที่มา</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {companies.length === 0 ? (
              <TableEmpty colSpan={canSeeMoney ? 8 : 4}>
                ยังไม่มีบริษัทในทะเบียน — เพิ่มที่เมนู &quot;บริษัทในเครือ&quot;
              </TableEmpty>
            ) : (
              companies.map((c) => {
                const f = byCompany.get(c.id);
                return (
                  <TableRow
                    key={c.id}
                    clickable={canWrite}
                    onClick={canWrite ? () => openEdit(c) : undefined}
                  >
                    <TableCell>
                      <div className="font-medium text-gray-900">{c.name}</div>
                    </TableCell>
                    <TableCell align="right" tabular>
                      {formatMoney(f?.revenue ?? null)}
                    </TableCell>
                    {canSeeMoney && (
                      <TableCell align="right" tabular>
                        {formatMoney(f?.cogs ?? null)}
                      </TableCell>
                    )}
                    {canSeeMoney && (
                      <TableCell align="right" tabular>
                        {formatMoney(f ? grossProfit(f) : null)}
                      </TableCell>
                    )}
                    {canSeeMoney && (
                      <TableCell align="right" tabular>
                        {formatMoney(f?.net_profit ?? null)}
                      </TableCell>
                    )}
                    {canSeeMoney && (
                      <TableCell align="right" tabular>
                        {formatMoney(f?.cash_balance ?? null)}
                      </TableCell>
                    )}
                    <TableCell align="right" className="tabular-nums">
                      {f?.headcount == null ? "—" : `${f.headcount} คน`}
                    </TableCell>
                    <TableCell align="center">
                      {f ? (
                        <span className="inline-flex items-center gap-1">
                          <StatusBadge tone={f.source === "accounting" ? "success" : "neutral"}>
                            {FINANCIAL_SOURCE_LABEL[f.source]}
                          </StatusBadge>
                          {f.is_locked && <Lock className="h-3.5 w-3.5 text-gray-400" />}
                        </span>
                      ) : (
                        <StatusBadge tone="warning">ยังไม่มีข้อมูล</StatusBadge>
                      )}
                    </TableCell>
                  </TableRow>
                );
              })
            )}
          </TableBody>
        </Table>
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent size="xl">
          <DialogHeader>
            <DialogTitle>
              {target?.name} — {formatThaiMonth(periodMonth)}
            </DialogTitle>
          </DialogHeader>
          <DialogBody>
            {existing?.source === "accounting" && (
              <div className="mb-4 rounded-lg border border-blue-200 bg-blue-50 px-3 py-2 text-sm text-blue-700">
                ตัวเลขงวดนี้ดึงมาจากระบบบัญชี — ถ้าแก้แล้วบันทึก จะกลายเป็น &quot;กรอกเอง&quot;
                และการดึงอัตโนมัติครั้งถัดไปจะไม่ทับให้
              </div>
            )}
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              {NUM_FIELDS.filter((f) => canSeeMoney || !f.sensitive).map((field) => (
                <div key={field.key}>
                  <Label htmlFor={`f-${field.key}`}>{field.label} (฿)</Label>
                  <Input
                    id={`f-${field.key}`}
                    type="number"
                    step="0.01"
                    className="mt-1"
                    placeholder="เว้นว่าง = ยังไม่มีข้อมูล"
                    value={form[field.key]}
                    onChange={(e) => setField(field.key, e.target.value)}
                  />
                </div>
              ))}
              <div>
                <Label htmlFor="f-headcount">จำนวนพนักงาน (คน)</Label>
                <Input
                  id="f-headcount"
                  type="number"
                  min={0}
                  className="mt-1"
                  value={form.headcount}
                  onChange={(e) => setField("headcount", e.target.value)}
                />
              </div>
              <div className="sm:col-span-2">
                <Label htmlFor="f-note">หมายเหตุ</Label>
                <Input
                  id="f-note"
                  className="mt-1"
                  value={form.note}
                  onChange={(e) => setField("note", e.target.value)}
                />
              </div>
              <div className="sm:col-span-2">
                <Label htmlFor="f-lock">ปิดงวด</Label>
                <div className="mt-1">
                  <SegmentedControl
                    size="md"
                    value={form.is_locked ? "locked" : "open"}
                    onChange={(v) => setField("is_locked", v === "locked")}
                    options={[
                      { value: "open", label: "ยังแก้ไขได้" },
                      { value: "locked", label: "ปิดงวดแล้ว" },
                    ]}
                  />
                </div>
                <p className="mt-1 text-xs text-gray-500">
                  งวดที่ปิดแล้วจะไม่ถูกทับด้วยการดึงจากระบบบัญชี
                </p>
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
    </PageShell>
  );
}
