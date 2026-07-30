"use client";

/**
 * _billings-tab.tsx — งวดงาน + การวางบิล
 *
 * กติกาที่ห้ามพลาด:
 *  - ยอด "ยังวางบิลได้" มาจาก `billingPlanTotals()` ฝั่ง server — **ห้ามบวกเอง**
 *  - งวดที่วางบิลแล้วแก้ยอดไม่ได้ (trigger DB กัน + API ตอบข้อความไทย) → UI ล็อกช่องให้ตรงกัน
 *  - ใบแจ้งหนี้/ใบกำกับเกิดที่ระบบบัญชี → ที่นี่แสดงเลขที่ + ลิงก์ไปเปิดต่อเท่านั้น
 */

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { ExternalLink, Plus, ReceiptText } from "lucide-react";
import { StatusBadge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
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
import { SegmentedControl } from "@/components/ui/segmented";
import { StatCard } from "@/components/ui/stat-card";
import {
  Table,
  TableBody,
  TableCell,
  TableEmpty,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { TablePager, usePagination } from "@/components/ui/table-pager";
import { ThaiDatePicker } from "@/components/ui/thai-date-picker";
import { Text } from "@/components/ui/typography";
import { notify } from "@/lib/toast";
import { BILLING_STATUS_LABEL, BILLING_STATUS_TONE } from "@/lib/just-me/labels";
import type { JustMeProject, JustMeProjectBilling } from "@/lib/just-me/types";
import { jmSend } from "../../_components/api-client";
import { money, pctValue, thaiDate } from "../../_components/format";
import { AccountingWarning } from "./_boq-tab";
import type { AccountingLink, ProjectAccountingInfo } from "./_types";

interface BillingForm {
  mode: "percent" | "amount";
  title: string;
  percent_of_contract: string;
  amount: string;
  retention_amount: string;
  due_date: string;
  note: string;
  status: "planned" | "ready";
}

const EMPTY: BillingForm = {
  mode: "percent",
  title: "",
  percent_of_contract: "",
  amount: "",
  retention_amount: "",
  due_date: "",
  note: "",
  status: "planned",
};

export function BillingsTab({
  orgId,
  orgSlug,
  canWrite,
  canSeeCost,
  project,
  billings,
  planned,
  remaining,
  billedAmount,
  documents,
  accounting,
  onChanged,
}: {
  orgId: string;
  orgSlug: string;
  canWrite: boolean;
  canSeeCost: boolean;
  project: JustMeProject;
  billings: JustMeProjectBilling[];
  planned: number;
  remaining: number | null;
  /** จาก `summarizeProject()` — null เมื่อผู้ใช้ไม่มีสิทธิ์เห็นตัวเลขสรุป */
  billedAmount: number | null;
  documents: Record<string, AccountingLink>;
  accounting: ProjectAccountingInfo;
  onChanged: () => void;
}) {
  const [rows, setRows] = useState(billings);
  const [editing, setEditing] = useState<JustMeProjectBilling | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [form, setForm] = useState<BillingForm>(EMPTY);
  const [invoiceFor, setInvoiceFor] = useState<JustMeProjectBilling | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => setRows(billings), [billings]);

  const pager = usePagination(rows, { pageSize: 15 });
  const nextSeq = useMemo(() => Math.max(0, ...rows.map((b) => b.seq)) + 1, [rows]);

  function openNew() {
    setEditing(null);
    setForm({ ...EMPTY, mode: project.contract_amount === null ? "amount" : "percent" });
    setFormOpen(true);
  }

  function openEdit(row: JustMeProjectBilling) {
    setEditing(row);
    setForm({
      mode: row.percent_of_contract === null ? "amount" : "percent",
      title: row.title ?? "",
      percent_of_contract: row.percent_of_contract === null ? "" : String(row.percent_of_contract),
      amount: String(row.amount),
      retention_amount: String(row.retention_amount ?? 0),
      due_date: row.due_date ?? "",
      note: row.note ?? "",
      status: row.status === "ready" ? "ready" : "planned",
    });
    setFormOpen(true);
  }

  async function save() {
    const body: Record<string, unknown> = {
      title: form.title.trim() || null,
      due_date: form.due_date || null,
      note: form.note.trim() || null,
      retention_amount: form.retention_amount.trim() === "" ? undefined : form.retention_amount,
    };
    if (form.mode === "percent") body.percent_of_contract = form.percent_of_contract;
    else body.amount = form.amount;

    const locked = editing ? editing.status === "invoiced" || editing.status === "paid" : false;
    if (locked) {
      delete body.amount;
      delete body.percent_of_contract;
      delete body.retention_amount;
    }

    setBusy(true);
    try {
      if (editing) {
        if (!locked) body.status = form.status;
        await jmSend(orgId, `projects/${project.id}/billings`, "PATCH", {
          ...body,
          id: editing.id,
        });
        notify.updated("บันทึกงวดงานแล้ว");
      } else {
        await jmSend(orgId, `projects/${project.id}/billings`, "POST", body);
        notify.created("เพิ่มงวดงานแล้ว");
      }
      setFormOpen(false);
      onChanged();
    } catch (e) {
      notify.error(e, "บันทึกงวดงานไม่สำเร็จ");
    } finally {
      setBusy(false);
    }
  }

  async function runAction(row: JustMeProjectBilling, action: "cancel" | "mark-paid") {
    setBusy(true);
    try {
      await jmSend(orgId, `projects/${project.id}/billings`, "PATCH", { id: row.id, action });
      notify.success(action === "cancel" ? "ยกเลิกงวดนี้แล้ว" : "บันทึกรับเงินแล้ว");
      setFormOpen(false);
      onChanged();
    } catch (e) {
      notify.error(e, "ทำรายการไม่สำเร็จ");
    } finally {
      setBusy(false);
    }
  }

  const editingLocked = editing?.status === "invoiced" || editing?.status === "paid";

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <StatCard
          label="มูลค่าสัญญา"
          value={money(project.contract_amount)}
          sub={project.contract_amount === null ? "ยังไม่มีสัญญา" : undefined}
          tone="primary"
        />
        <StatCard
          label="ตั้งงวดไว้แล้ว"
          value={money(planned)}
          sub={`${rows.filter((b) => b.status !== "cancelled").length.toLocaleString("th-TH")} งวด`}
          tone="neutral"
        />
        <StatCard
          label="ยังตั้งงวดได้อีก"
          value={money(remaining)}
          sub={
            remaining === null
              ? "ต้องมีมูลค่าสัญญาก่อน"
              : canSeeCost && billedAmount !== null
                ? `วางบิลไปแล้ว ${money(billedAmount)}`
                : undefined
          }
          tone={remaining !== null && remaining < 0 ? "negative" : "warning"}
        />
      </div>

      <div className="flex items-center justify-between">
        <Text className="px-1 text-sm font-semibold text-gray-900">งวดงานตามสัญญา</Text>
        {canWrite && (
          <Button size="sm" onClick={openNew}>
            <Plus className="h-4 w-4" /> เพิ่มงวด
          </Button>
        )}
      </div>

      <div className="space-y-3">
        <Table className="shadow-sm">
          <TableHeader>
            <TableRow>
              <TableHead align="center">งวด</TableHead>
              <TableHead>รายละเอียด</TableHead>
              <TableHead align="right">% สัญญา</TableHead>
              <TableHead align="right">ยอดงวด</TableHead>
              <TableHead align="right">เงินประกัน</TableHead>
              <TableHead>กำหนดชำระ</TableHead>
              <TableHead align="center">สถานะ</TableHead>
              <TableHead>เอกสาร</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {pager.rows.length === 0 ? (
              <TableEmpty colSpan={8}>
                ยังไม่ได้ตั้งงวดงาน — เพิ่มงวดตามสัญญาแล้วออกใบแจ้งหนี้ได้จากที่นี่
              </TableEmpty>
            ) : (
              pager.rows.map((row) => {
                const doc = row.invoice_document_id
                  ? documents[row.invoice_document_id]
                  : undefined;
                return (
                  <TableRow key={row.id} clickable onClick={() => openEdit(row)}>
                    <TableCell align="center" tabular>
                      {row.seq}
                    </TableCell>
                    <TableCell>{row.title || `งวดที่ ${row.seq}`}</TableCell>
                    <TableCell align="right" className="tabular-nums">
                      {pctValue(row.percent_of_contract, 2)}
                    </TableCell>
                    <TableCell align="right" tabular>
                      {money(row.amount)}
                    </TableCell>
                    <TableCell align="right" tabular>
                      {money(row.retention_amount ?? 0)}
                    </TableCell>
                    <TableCell>{thaiDate(row.due_date)}</TableCell>
                    <TableCell align="center">
                      <StatusBadge tone={BILLING_STATUS_TONE[row.status]}>
                        {BILLING_STATUS_LABEL[row.status]}
                      </StatusBadge>
                    </TableCell>
                    <TableCell>
                      {doc ? (
                        <Link
                          className="inline-flex items-center gap-1 font-mono text-xs text-blue-600 hover:underline"
                          href={`/${orgSlug}/accounting/documents`}
                          onClick={(e) => e.stopPropagation()}
                        >
                          {doc.doc_number} <ExternalLink className="h-3 w-3" />
                        </Link>
                      ) : canWrite && row.status !== "cancelled" ? (
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={(e) => {
                            e.stopPropagation();
                            setInvoiceFor(row);
                          }}
                        >
                          <ReceiptText className="h-4 w-4" /> ออกใบแจ้งหนี้
                        </Button>
                      ) : (
                        <span className="text-xs text-gray-400">—</span>
                      )}
                    </TableCell>
                  </TableRow>
                );
              })
            )}
          </TableBody>
        </Table>
        <TablePager pager={pager} unit="งวด" />
      </div>

      {/* ── กล่องเพิ่ม/แก้งวด ── */}
      <Dialog open={formOpen} onOpenChange={setFormOpen}>
        <DialogContent size="lg">
          <DialogHeader>
            <DialogTitle>
              {editing ? `งวดที่ ${editing.seq}` : `เพิ่มงวดที่ ${nextSeq}`}
            </DialogTitle>
          </DialogHeader>
          <DialogBody>
            <div className="space-y-4">
              {editingLocked && (
                <div className="rounded-xl border border-amber-200 bg-amber-50 p-3">
                  <Text className="text-sm text-amber-800">
                    งวดนี้วางบิลไปแล้ว จึงแก้ยอด/เงินประกันไม่ได้ (เอกสารภาษีออกไปแล้ว) —
                    ถ้ายอดผิดต้องออกใบลดหนี้/เพิ่มหนี้ที่ระบบบัญชี
                  </Text>
                </div>
              )}
              <div>
                <Label htmlFor="jm-bill-title">ชื่องวด</Label>
                <Input
                  id="jm-bill-title"
                  className="mt-1"
                  value={form.title}
                  onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
                  placeholder={`งวดที่ ${editing?.seq ?? nextSeq} — เช่น เดินท่อร้อยสายเสร็จ`}
                />
              </div>

              <div>
                <Label>วิธีคิดยอดงวด</Label>
                <div className="mt-1">
                  <SegmentedControl
                    value={form.mode}
                    onChange={(v) => setForm((f) => ({ ...f, mode: v as "percent" | "amount" }))}
                    size="md"
                    options={[
                      { value: "percent", label: "% ของสัญญา" },
                      { value: "amount", label: "กรอกยอดเอง" },
                    ]}
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                {form.mode === "percent" ? (
                  <div>
                    <Label htmlFor="jm-bill-pct">% ของมูลค่าสัญญา</Label>
                    <Input
                      id="jm-bill-pct"
                      className="mt-1"
                      inputMode="decimal"
                      disabled={editingLocked}
                      value={form.percent_of_contract}
                      onChange={(e) =>
                        setForm((f) => ({ ...f, percent_of_contract: e.target.value }))
                      }
                      placeholder="30"
                    />
                    <p className="mt-1 text-xs text-gray-500">
                      มูลค่าสัญญา {money(project.contract_amount)} — ระบบคิดยอดงวดให้เอง
                    </p>
                  </div>
                ) : (
                  <div>
                    <Label htmlFor="jm-bill-amount">ยอดงวด (฿)</Label>
                    <Input
                      id="jm-bill-amount"
                      className="mt-1"
                      inputMode="decimal"
                      disabled={editingLocked}
                      value={form.amount}
                      onChange={(e) => setForm((f) => ({ ...f, amount: e.target.value }))}
                    />
                  </div>
                )}
                <div>
                  <Label htmlFor="jm-bill-retention">เงินประกันผลงาน (฿)</Label>
                  <Input
                    id="jm-bill-retention"
                    className="mt-1"
                    inputMode="decimal"
                    disabled={editingLocked}
                    value={form.retention_amount}
                    onChange={(e) => setForm((f) => ({ ...f, retention_amount: e.target.value }))}
                    placeholder={`เว้นว่าง = ${pctValue(project.retention_pct ?? 0)} ของยอดงวด`}
                  />
                </div>
                <div>
                  <Label>กำหนดชำระ</Label>
                  <div className="mt-1">
                    <ThaiDatePicker
                      value={form.due_date}
                      onChange={(iso) => setForm((f) => ({ ...f, due_date: iso }))}
                    />
                  </div>
                </div>
                {editing && !editingLocked && (
                  <div>
                    <Label>สถานะ</Label>
                    <div className="mt-1">
                      <SegmentedControl
                        value={form.status}
                        onChange={(v) =>
                          setForm((f) => ({ ...f, status: v as "planned" | "ready" }))
                        }
                        size="md"
                        options={[
                          { value: "planned", label: "วางแผนไว้" },
                          { value: "ready", label: "พร้อมวางบิล" },
                        ]}
                      />
                    </div>
                  </div>
                )}
              </div>

              <div>
                <Label htmlFor="jm-bill-note">หมายเหตุ</Label>
                <Input
                  id="jm-bill-note"
                  className="mt-1"
                  value={form.note}
                  onChange={(e) => setForm((f) => ({ ...f, note: e.target.value }))}
                />
              </div>
              <Text className="text-xs text-gray-500">
                ยอดงวดรวมทุกงวดต้องไม่เกินมูลค่าสัญญา — ตอนนี้ตั้งไว้แล้ว {money(planned)} · เหลือ{" "}
                {money(remaining)}
              </Text>
            </div>
          </DialogBody>
          <DialogFooter>
            {editing && editing.status !== "cancelled" && canWrite && (
              <Button
                variant="destructive"
                className="mr-auto"
                disabled={busy || editingLocked}
                onClick={() => runAction(editing, "cancel")}
              >
                ยกเลิกงวดนี้
              </Button>
            )}
            {editing?.status === "invoiced" && canWrite && (
              <Button
                variant="outline"
                disabled={busy}
                onClick={() => runAction(editing, "mark-paid")}
              >
                บันทึกรับเงินแล้ว
              </Button>
            )}
            <Button variant="outline" onClick={() => setFormOpen(false)} disabled={busy}>
              ปิด
            </Button>
            {canWrite && !editingLocked && (
              <Button onClick={save} disabled={busy}>
                {busy ? "กำลังบันทึก…" : "บันทึก"}
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <InvoiceDialog
        orgId={orgId}
        projectId={project.id}
        billing={invoiceFor}
        accounting={accounting}
        onClose={() => setInvoiceFor(null)}
        onDone={() => {
          setInvoiceFor(null);
          onChanged();
        }}
      />
    </div>
  );
}

/** ออกใบแจ้งหนี้/ใบกำกับของงวด — เอกสารไปเกิดที่ระบบบัญชี */
function InvoiceDialog({
  orgId,
  projectId,
  billing,
  accounting,
  onClose,
  onDone,
}: {
  orgId: string;
  projectId: string;
  billing: JustMeProjectBilling | null;
  accounting: ProjectAccountingInfo;
  onClose: () => void;
  onDone: () => void;
}) {
  const [docType, setDocType] = useState<"invoice" | "tax_invoice">("invoice");
  const [issueDate, setIssueDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [dueDate, setDueDate] = useState("");
  const [retentionMode, setRetentionMode] = useState<"note" | "discount">("note");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (billing) {
      setDocType("invoice");
      setIssueDate(new Date().toISOString().slice(0, 10));
      setDueDate(billing.due_date ?? "");
      setRetentionMode("note");
    }
  }, [billing]);

  async function submit() {
    if (!billing) return;
    setBusy(true);
    try {
      const res = await jmSend<{ doc_number: string; journal_warning?: string | null }>(
        orgId,
        `projects/${projectId}/billings`,
        "PATCH",
        {
          id: billing.id,
          action: "invoice",
          doc_type: docType,
          issue_date: issueDate,
          due_date: dueDate || null,
          retention_mode: retentionMode,
        },
      );
      notify.success(`ออกเอกสารเลขที่ ${res.doc_number} ในระบบบัญชีแล้ว`);
      if (res.journal_warning) notify.error(res.journal_warning);
      onDone();
    } catch (e) {
      notify.error(e, "ออกใบแจ้งหนี้ไม่สำเร็จ");
    } finally {
      setBusy(false);
    }
  }

  const retention = billing?.retention_amount ?? 0;

  return (
    <Dialog open={billing !== null} onOpenChange={(v) => !v && onClose()}>
      <DialogContent size="lg">
        <DialogHeader>
          <DialogTitle>
            ออกใบแจ้งหนี้ของงวดที่ {billing?.seq} — {money(billing?.amount ?? null)}
          </DialogTitle>
        </DialogHeader>
        <DialogBody>
          <div className="space-y-4">
            <AccountingWarning accounting={accounting} />
            <div>
              <Label>ชนิดเอกสาร</Label>
              <div className="mt-1">
                <SegmentedControl
                  value={docType}
                  onChange={(v) => setDocType(v as "invoice" | "tax_invoice")}
                  size="md"
                  options={[
                    { value: "invoice", label: "ใบแจ้งหนี้" },
                    { value: "tax_invoice", label: "ใบกำกับภาษี" },
                  ]}
                />
              </div>
              <p className="mt-1 text-xs text-gray-500">
                ใบกำกับภาษีจะถูกบันทึกเป็นรายได้/ภาษีขายทันที และแก้ย้อนหลังไม่ได้ —
                ถ้ายังไม่ถึงจุดรับรู้รายได้ ให้ออกใบแจ้งหนี้ก่อน
              </p>
            </div>
            {retention > 0 && (
              <div>
                <Label>เงินประกันผลงาน {money(retention)}</Label>
                <div className="mt-1">
                  <SegmentedControl
                    value={retentionMode}
                    onChange={(v) => setRetentionMode(v as "note" | "discount")}
                    size="md"
                    options={[
                      { value: "note", label: "ไม่หัก (ระบุในหมายเหตุ)" },
                      { value: "discount", label: "หักออกจากยอดในเอกสาร" },
                    ]}
                  />
                </div>
                <p className="mt-1 text-xs text-gray-500">
                  เลือก &quot;หักออกจากยอด&quot; = ฐานภาษีของเอกสารลดลงตามยอดที่หัก
                </p>
              </div>
            )}
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div>
                <Label>วันที่เอกสาร</Label>
                <div className="mt-1">
                  <ThaiDatePicker value={issueDate} onChange={setIssueDate} />
                </div>
              </div>
              <div>
                <Label>กำหนดชำระ</Label>
                <div className="mt-1">
                  <ThaiDatePicker value={dueDate} onChange={setDueDate} />
                </div>
              </div>
            </div>
          </div>
        </DialogBody>
        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={busy}>
            ยกเลิก
          </Button>
          <Button onClick={submit} disabled={busy}>
            {busy ? "กำลังออกเอกสาร…" : "ออกเอกสาร"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
