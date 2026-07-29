"use client";

// รายการระหว่างกัน — 3 แท็บ: ธุรกรรม · สัญญาเงินกู้ · กระทบยอด (รายการที่คู่สัญญายังไม่ยืนยัน)
// ยอดคงเหลือเงินกู้คำนวณจาก metrics.loanOutstanding แหล่งเดียว

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeftRight, CheckCircle2, Plus } from "lucide-react";
import { PageShell } from "@/components/ui/page-shell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { CustomSelect } from "@/components/ui/custom-select";
import { ThaiDatePicker } from "@/components/ui/thai-date-picker";
import { SegmentedControl } from "@/components/ui/segmented";
import { StatCard } from "@/components/ui/stat-card";
import { StatusBadge } from "@/components/ui/badge";
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
import { TablePager, usePagination } from "@/components/ui/table-pager";
import { toast } from "@/lib/toast";
import type { P2pgCompany, P2pgIntercompany, P2pgLoan } from "@/lib/p2p-group/types";
import {
  IC_STATUS_LABEL,
  IC_TYPE_LABEL,
  LOAN_STATUS_LABEL,
  formatMoney,
  formatThaiDate,
  toOptions,
} from "@/lib/p2p-group/labels";
import { loanOutstanding } from "@/lib/p2p-group/metrics";
import { p2pgMutate, withOrg } from "../_components/api";

type Tab = "transactions" | "loans" | "reconcile";

export function IntercompanyClient({
  companies,
  transactions,
  loans,
  orgId,
  canWrite,
}: {
  companies: P2pgCompany[];
  transactions: P2pgIntercompany[];
  loans: P2pgLoan[];
  orgId: string;
  canWrite: boolean;
}) {
  const loanPager = usePagination(loans);
  const router = useRouter();
  const [tab, setTab] = useState<Tab>("transactions");
  const [open, setOpen] = useState(false);
  const [dialogKind, setDialogKind] = useState<"txn" | "loan">("txn");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);

  const companyName = useMemo(() => new Map(companies.map((c) => [c.id, c.name])), [companies]);
  const companyOptions = useMemo(
    () => companies.map((c) => ({ value: c.id, label: c.name })),
    [companies],
  );
  const loanOptions = useMemo(
    () => [
      { value: "", label: "— ไม่ผูกสัญญา —" },
      ...loans.map((l) => ({
        value: l.id,
        label: `${l.contract_no || "สัญญา"} · ${companyName.get(l.lender_company_id) ?? "?"} → ${
          companyName.get(l.borrower_company_id) ?? "?"
        }`,
      })),
    ],
    [loans, companyName],
  );

  const unconfirmed = transactions.filter(
    (t) => !t.counterparty_confirmed && t.status !== "cancelled",
  );
  const txnRows = tab === "reconcile" ? unconfirmed : transactions;
  const txPager = usePagination(txnRows, { resetKey: tab });
  const openBalance = transactions
    .filter((t) => t.status === "open")
    .reduce((a, t) => a + Number(t.amount ?? 0), 0);
  const activeLoanTotal = loans
    .filter((l) => l.status === "active")
    .reduce(
      (a, l) =>
        a +
        loanOutstanding(
          Number(l.principal),
          transactions.filter((t) => t.loan_id === l.id),
        ),
      0,
    );

  const set = (k: string, v: string) => setForm((p) => ({ ...p, [k]: v }));

  function openCreate() {
    const kind: "txn" | "loan" = tab === "loans" ? "loan" : "txn";
    setDialogKind(kind);
    setEditingId(null);
    setForm(
      kind === "loan"
        ? {
            lender_company_id: companyOptions[0]?.value ?? "",
            borrower_company_id: companyOptions[1]?.value ?? "",
            status: "active",
          }
        : {
            from_company_id: companyOptions[0]?.value ?? "",
            to_company_id: companyOptions[1]?.value ?? "",
            ic_type: "management_fee",
            status: "open",
          },
    );
    setOpen(true);
  }

  function openEditTxn(t: P2pgIntercompany) {
    setDialogKind("txn");
    setEditingId(t.id);
    setForm({
      txn_date: t.txn_date,
      from_company_id: t.from_company_id,
      to_company_id: t.to_company_id,
      ic_type: t.ic_type,
      amount: String(t.amount),
      loan_id: t.loan_id ?? "",
      description: t.description ?? "",
      doc_ref: t.doc_ref ?? "",
      status: t.status,
      settled_date: t.settled_date ?? "",
      note: t.note ?? "",
    });
    setOpen(true);
  }

  function openEditLoan(l: P2pgLoan) {
    setDialogKind("loan");
    setEditingId(l.id);
    setForm({
      lender_company_id: l.lender_company_id,
      borrower_company_id: l.borrower_company_id,
      contract_no: l.contract_no ?? "",
      principal: String(l.principal),
      interest_rate: l.interest_rate == null ? "" : String(l.interest_rate),
      start_date: l.start_date,
      due_date: l.due_date ?? "",
      status: l.status,
      note: l.note ?? "",
    });
    setOpen(true);
  }

  async function save() {
    const num = (v?: string) => (v == null || v.trim() === "" ? null : Number(v));
    const base = dialogKind === "loan" ? "/api/p2p-group/loans" : "/api/p2p-group/intercompany";
    const payload =
      dialogKind === "loan"
        ? {
            lender_company_id: form.lender_company_id,
            borrower_company_id: form.borrower_company_id,
            contract_no: form.contract_no?.trim() || null,
            principal: num(form.principal),
            interest_rate: num(form.interest_rate),
            start_date: form.start_date || null,
            due_date: form.due_date || null,
            status: form.status || "active",
            note: form.note?.trim() || null,
          }
        : {
            txn_date: form.txn_date || null,
            from_company_id: form.from_company_id,
            to_company_id: form.to_company_id,
            ic_type: form.ic_type,
            amount: num(form.amount),
            loan_id: form.loan_id || null,
            description: form.description?.trim() || null,
            doc_ref: form.doc_ref?.trim() || null,
            status: form.status || "open",
            settled_date: form.settled_date || null,
            note: form.note?.trim() || null,
          };

    setSaving(true);
    try {
      if (editingId) await p2pgMutate(withOrg(`${base}/${editingId}`, orgId), "PATCH", payload);
      else await p2pgMutate(withOrg(base, orgId), "POST", payload);
      toast.success("บันทึกแล้ว");
      setOpen(false);
      router.refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "บันทึกไม่สำเร็จ");
    } finally {
      setSaving(false);
    }
  }

  async function remove() {
    if (!editingId) return;
    const base = dialogKind === "loan" ? "/api/p2p-group/loans" : "/api/p2p-group/intercompany";
    setSaving(true);
    try {
      await p2pgMutate(withOrg(`${base}/${editingId}`, orgId), "DELETE");
      toast.success("ลบแล้ว");
      setOpen(false);
      router.refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "ลบไม่สำเร็จ");
    } finally {
      setSaving(false);
    }
  }

  async function confirmTxn(id: string) {
    try {
      await p2pgMutate(withOrg(`/api/p2p-group/intercompany/${id}`, orgId), "PATCH", {
        action: "confirm",
      });
      toast.success("ยืนยันยอดแล้ว");
      router.refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "ยืนยันไม่สำเร็จ");
    }
  }

  return (
    <PageShell
      title="รายการระหว่างกัน"
      description="ธุรกรรมระหว่างบริษัทในเครือ สัญญาเงินกู้ยืม และการกระทบยอดสองฝั่ง"
      icon={<ArrowLeftRight className="h-6 w-6" />}
      width="wide"
      actions={
        canWrite && tab !== "reconcile" ? (
          <Button onClick={openCreate}>
            <Plus className="me-1 h-4 w-4" />
            {tab === "loans" ? "เพิ่มสัญญาเงินกู้" : "เพิ่มรายการ"}
          </Button>
        ) : undefined
      }
    >
      <div className="space-y-5">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <StatCard
            label="ยอดค้างระหว่างกัน"
            value={formatMoney(openBalance)}
            sub={`${transactions.filter((t) => t.status === "open").length} รายการที่ยังไม่ชำระ`}
            tone="warning"
            valueColored
          />
          <StatCard
            label="เงินกู้คงค้าง"
            value={formatMoney(activeLoanTotal)}
            sub={`${loans.filter((l) => l.status === "active").length} สัญญาที่ยังไม่ปิด`}
            tone="info"
            valueColored
          />
          <StatCard
            label="รอคู่สัญญายืนยัน"
            value={`${unconfirmed.length}`}
            sub={unconfirmed.length ? "ยอดสองฝั่งยังไม่ตรงกัน" : "ยืนยันครบทุกรายการ"}
            tone={unconfirmed.length ? "negative" : "positive"}
            valueColored
          />
        </div>

        <SegmentedControl
          value={tab}
          onChange={(v) => setTab(v as Tab)}
          options={[
            { value: "transactions", label: "ธุรกรรม" },
            { value: "loans", label: "สัญญาเงินกู้" },
            { value: "reconcile", label: `กระทบยอด (${unconfirmed.length})` },
          ]}
        />

        {tab === "loans" ? (
          <div className="space-y-3">
            <Table className="shadow-sm" stickyHeader fillViewport>
              <TableHeader sticky>
                <TableRow>
                  <TableHead>เลขที่สัญญา</TableHead>
                  <TableHead>ผู้ให้กู้</TableHead>
                  <TableHead>ผู้กู้</TableHead>
                  <TableHead align="right">เงินต้น</TableHead>
                  <TableHead align="right">คงเหลือ</TableHead>
                  <TableHead align="right">ดอกเบี้ย</TableHead>
                  <TableHead align="center">ครบกำหนด</TableHead>
                  <TableHead align="center">สถานะ</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loans.length === 0 ? (
                  <TableEmpty colSpan={8}>
                    ยังไม่มีสัญญาเงินกู้ระหว่างบริษัท — เพิ่มเพื่อติดตามยอดคงค้างและดอกเบี้ย
                  </TableEmpty>
                ) : (
                  loanPager.rows.map((l) => (
                    <TableRow
                      key={l.id}
                      clickable={canWrite}
                      onClick={canWrite ? () => openEditLoan(l) : undefined}
                    >
                      <TableCell>{l.contract_no || "—"}</TableCell>
                      <TableCell>{companyName.get(l.lender_company_id) ?? "—"}</TableCell>
                      <TableCell>{companyName.get(l.borrower_company_id) ?? "—"}</TableCell>
                      <TableCell align="right" tabular>
                        {formatMoney(l.principal)}
                      </TableCell>
                      <TableCell align="right" tabular>
                        {formatMoney(
                          loanOutstanding(
                            Number(l.principal),
                            transactions.filter((t) => t.loan_id === l.id),
                          ),
                        )}
                      </TableCell>
                      <TableCell align="right" className="tabular-nums">
                        {l.interest_rate == null ? "—" : `${l.interest_rate}%`}
                      </TableCell>
                      <TableCell align="center" className="tabular-nums">
                        {formatThaiDate(l.due_date)}
                      </TableCell>
                      <TableCell align="center">
                        <StatusBadge
                          tone={
                            l.status === "repaid"
                              ? "success"
                              : l.status === "written_off"
                                ? "danger"
                                : "info"
                          }
                        >
                          {LOAN_STATUS_LABEL[l.status]}
                        </StatusBadge>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
            <TablePager pager={loanPager} unit="สัญญา" />
          </div>
        ) : (
          <div className="space-y-3">
            <Table className="shadow-sm">
              <TableHeader>
                <TableRow>
                  <TableHead align="center">วันที่</TableHead>
                  <TableHead>จาก</TableHead>
                  <TableHead>ถึง</TableHead>
                  <TableHead>ประเภท</TableHead>
                  <TableHead align="right">จำนวนเงิน</TableHead>
                  <TableHead align="center">สถานะ</TableHead>
                  <TableHead align="center">คู่สัญญายืนยัน</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {txnRows.length === 0 ? (
                  <TableEmpty colSpan={7}>
                    {tab === "reconcile"
                      ? "ไม่มีรายการที่รอการยืนยัน — ยอดสองฝั่งตรงกันครบแล้ว"
                      : "ยังไม่มีรายการระหว่างบริษัท"}
                  </TableEmpty>
                ) : (
                  txPager.rows.map((t) => (
                    <TableRow
                      key={t.id}
                      clickable={canWrite && tab === "transactions"}
                      onClick={
                        canWrite && tab === "transactions" ? () => openEditTxn(t) : undefined
                      }
                    >
                      <TableCell align="center" className="tabular-nums">
                        {formatThaiDate(t.txn_date)}
                      </TableCell>
                      <TableCell>{companyName.get(t.from_company_id) ?? "—"}</TableCell>
                      <TableCell>{companyName.get(t.to_company_id) ?? "—"}</TableCell>
                      <TableCell>{IC_TYPE_LABEL[t.ic_type]}</TableCell>
                      <TableCell align="right" tabular>
                        {formatMoney(t.amount)}
                      </TableCell>
                      <TableCell align="center">
                        <StatusBadge
                          tone={
                            t.status === "settled"
                              ? "success"
                              : t.status === "cancelled"
                                ? "neutral"
                                : "warning"
                          }
                        >
                          {IC_STATUS_LABEL[t.status]}
                        </StatusBadge>
                      </TableCell>
                      <TableCell align="center">
                        {t.counterparty_confirmed ? (
                          <StatusBadge tone="success">ยืนยันแล้ว</StatusBadge>
                        ) : canWrite ? (
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={(e) => {
                              e.stopPropagation(); // อย่าให้คลิกปุ่มไปเปิด dialog แก้ไขของแถว
                              confirmTxn(t.id);
                            }}
                          >
                            <CheckCircle2 className="me-1 h-4 w-4" />
                            ยืนยันยอด
                          </Button>
                        ) : (
                          <StatusBadge tone="warning">รอยืนยัน</StatusBadge>
                        )}
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
            <TablePager pager={txPager} unit="รายการ" />
          </div>
        )}

        {tab === "transactions" && canWrite && transactions.length > 0 && (
          <p className="px-1 text-xs text-gray-500">
            คลิกที่แถวเพื่อแก้ไขรายการ · ปุ่ม &quot;ยืนยันยอด&quot;
            ใช้เมื่ออีกฝั่งตรวจสอบยอดตรงกันแล้ว
          </p>
        )}
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent size="lg">
          <DialogHeader>
            <DialogTitle>
              {dialogKind === "loan"
                ? editingId
                  ? "แก้ไขสัญญาเงินกู้"
                  : "เพิ่มสัญญาเงินกู้"
                : editingId
                  ? "แก้ไขรายการระหว่างกัน"
                  : "เพิ่มรายการระหว่างกัน"}
            </DialogTitle>
          </DialogHeader>
          <DialogBody>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              {dialogKind === "loan" ? (
                <>
                  <div>
                    <Label htmlFor="l-lender">ผู้ให้กู้ *</Label>
                    <CustomSelect
                      value={form.lender_company_id ?? ""}
                      onChange={(v) => set("lender_company_id", v)}
                      options={companyOptions}
                      className="mt-1"
                    />
                  </div>
                  <div>
                    <Label htmlFor="l-borrower">ผู้กู้ *</Label>
                    <CustomSelect
                      value={form.borrower_company_id ?? ""}
                      onChange={(v) => set("borrower_company_id", v)}
                      options={companyOptions}
                      className="mt-1"
                    />
                  </div>
                  <div>
                    <Label htmlFor="l-no">เลขที่สัญญา</Label>
                    <Input
                      id="l-no"
                      className="mt-1"
                      value={form.contract_no ?? ""}
                      onChange={(e) => set("contract_no", e.target.value)}
                    />
                  </div>
                  <div>
                    <Label htmlFor="l-principal">เงินต้น (฿) *</Label>
                    <Input
                      id="l-principal"
                      type="number"
                      min={0}
                      step="0.01"
                      className="mt-1"
                      value={form.principal ?? ""}
                      onChange={(e) => set("principal", e.target.value)}
                    />
                  </div>
                  <div>
                    <Label htmlFor="l-rate">อัตราดอกเบี้ย (% ต่อปี)</Label>
                    <Input
                      id="l-rate"
                      type="number"
                      min={0}
                      step="0.001"
                      className="mt-1"
                      value={form.interest_rate ?? ""}
                      onChange={(e) => set("interest_rate", e.target.value)}
                    />
                  </div>
                  <div>
                    <Label htmlFor="l-start">วันเริ่มสัญญา *</Label>
                    <div className="mt-1">
                      <ThaiDatePicker
                        value={form.start_date ?? ""}
                        onChange={(iso) => set("start_date", iso)}
                      />
                    </div>
                  </div>
                  <div>
                    <Label htmlFor="l-due">วันครบกำหนด</Label>
                    <div className="mt-1">
                      <ThaiDatePicker
                        value={form.due_date ?? ""}
                        onChange={(iso) => set("due_date", iso)}
                      />
                    </div>
                  </div>
                  <div>
                    <Label htmlFor="l-status">สถานะ</Label>
                    <CustomSelect
                      value={form.status ?? "active"}
                      onChange={(v) => set("status", v)}
                      options={toOptions(LOAN_STATUS_LABEL)}
                      className="mt-1"
                    />
                  </div>
                </>
              ) : (
                <>
                  <div>
                    <Label htmlFor="t-date">วันที่ *</Label>
                    <div className="mt-1">
                      <ThaiDatePicker
                        value={form.txn_date ?? ""}
                        onChange={(iso) => set("txn_date", iso)}
                      />
                    </div>
                  </div>
                  <div>
                    <Label htmlFor="t-type">ประเภทรายการ *</Label>
                    <CustomSelect
                      value={form.ic_type ?? "management_fee"}
                      onChange={(v) => set("ic_type", v)}
                      options={toOptions(IC_TYPE_LABEL)}
                      className="mt-1"
                    />
                  </div>
                  <div>
                    <Label htmlFor="t-from">บริษัทต้นทาง (ผู้จ่าย/ผู้ให้กู้) *</Label>
                    <CustomSelect
                      value={form.from_company_id ?? ""}
                      onChange={(v) => set("from_company_id", v)}
                      options={companyOptions}
                      className="mt-1"
                    />
                  </div>
                  <div>
                    <Label htmlFor="t-to">บริษัทปลายทาง (ผู้รับ) *</Label>
                    <CustomSelect
                      value={form.to_company_id ?? ""}
                      onChange={(v) => set("to_company_id", v)}
                      options={companyOptions}
                      className="mt-1"
                    />
                  </div>
                  <div>
                    <Label htmlFor="t-amount">จำนวนเงิน (฿) *</Label>
                    <Input
                      id="t-amount"
                      type="number"
                      min={0}
                      step="0.01"
                      className="mt-1"
                      value={form.amount ?? ""}
                      onChange={(e) => set("amount", e.target.value)}
                    />
                  </div>
                  <div>
                    <Label htmlFor="t-loan">ผูกกับสัญญาเงินกู้</Label>
                    <CustomSelect
                      value={form.loan_id ?? ""}
                      onChange={(v) => set("loan_id", v)}
                      options={loanOptions}
                      className="mt-1"
                    />
                  </div>
                  <div>
                    <Label htmlFor="t-status">สถานะ</Label>
                    <CustomSelect
                      value={form.status ?? "open"}
                      onChange={(v) => set("status", v)}
                      options={toOptions(IC_STATUS_LABEL)}
                      className="mt-1"
                    />
                  </div>
                  <div>
                    <Label htmlFor="t-settled">วันที่ชำระ</Label>
                    <div className="mt-1">
                      <ThaiDatePicker
                        value={form.settled_date ?? ""}
                        onChange={(iso) => set("settled_date", iso)}
                      />
                    </div>
                  </div>
                  <div className="sm:col-span-2">
                    <Label htmlFor="t-desc">รายละเอียด</Label>
                    <Input
                      id="t-desc"
                      className="mt-1"
                      value={form.description ?? ""}
                      onChange={(e) => set("description", e.target.value)}
                      placeholder="เช่น ค่าบริหารจัดการประจำเดือน"
                    />
                  </div>
                  <div className="sm:col-span-2">
                    <Label htmlFor="t-ref">เลขที่เอกสารอ้างอิง</Label>
                    <Input
                      id="t-ref"
                      className="mt-1"
                      value={form.doc_ref ?? ""}
                      onChange={(e) => set("doc_ref", e.target.value)}
                    />
                  </div>
                </>
              )}
              <div className="sm:col-span-2">
                <Label htmlFor="ic-note">หมายเหตุ</Label>
                <Input
                  id="ic-note"
                  className="mt-1"
                  value={form.note ?? ""}
                  onChange={(e) => set("note", e.target.value)}
                />
              </div>
            </div>
          </DialogBody>
          <DialogFooter>
            {editingId && (
              <Button variant="destructive" className="mr-auto" disabled={saving} onClick={remove}>
                ลบ
              </Button>
            )}
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
