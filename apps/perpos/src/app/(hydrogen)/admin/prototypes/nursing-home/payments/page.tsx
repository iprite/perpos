"use client";

// payments/page.tsx — การรับชำระ + AR aging (interactive prototype)
// gate §4: payments = owner/admin_staff (W·A) · nurse/caregiver ไม่เห็น

import { useMemo, useState } from "react";
import { Wallet, Plus, ShieldX, Banknote, AlertTriangle, Clock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { CustomSelect } from "@/components/ui/custom-select";
import { StatCard } from "@/components/ui/stat-card";
import { StatusBadge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogBody,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
  TableEmpty,
  TableFooter,
} from "@/components/ui/table";
import { toast } from "@/lib/toast";
import { NursingShell, useNursingRole, fmtMoney, fmtDateTH, fullName } from "../_components";
import { INVOICES, PAYMENTS, RESIDENTS, computeArAging } from "../_fixtures";
import type { Invoice, Payment, PaymentMethod } from "../_fixtures/types";

const METHOD_LABEL: Record<PaymentMethod, string> = {
  cash: "เงินสด",
  transfer: "โอนเงิน",
  card: "บัตร",
  cheque: "เช็ค",
  other: "อื่นๆ",
};

const residentName = (id: string) => {
  const r = RESIDENTS.find((x) => x.id === id);
  return r
    ? fullName({ first_name: r.first_name, last_name: r.last_name, nickname: r.nickname })
    : id;
};

type PayForm = { invoice_id: string; amount: string; method: PaymentMethod };

export default function PaymentsPage() {
  const { can } = useNursingRole();
  const canView = can("view", "payments");
  const canWrite = can("write", "payments");

  const [invoices, setInvoices] = useState<Invoice[]>(INVOICES);
  const [payments, setPayments] = useState<Payment[]>(PAYMENTS);
  const [payOpen, setPayOpen] = useState(false);
  const [form, setForm] = useState<PayForm>({ invoice_id: "", amount: "", method: "transfer" });

  // บิลที่ยังค้างชำระ (เลือกได้ใน dialog)
  const openInvoices = invoices.filter(
    (i) => i.status !== "void" && i.status !== "paid" && i.total - i.paid_amount > 0,
  );

  const selectedInv = invoices.find((i) => i.id === form.invoice_id) ?? null;

  // ─── AR aging — สูตรเดียวทั้งโมดูล (issued/partially_paid/overdue ที่ยังเก็บไม่ครบ) ───
  const aging = useMemo(() => computeArAging(invoices), [invoices]);

  if (!canView) return <NoAccess />;

  const totalAR = aging.total;
  const overdueAR = aging.overdueTotal;
  const receivedTotal = payments.reduce((s, p) => s + p.amount, 0);

  const sortedPayments = [...payments].sort((a, b) => b.paid_at.localeCompare(a.paid_at));

  function openPay(invId?: string) {
    const inv = invId ? invoices.find((i) => i.id === invId) : openInvoices[0];
    setForm({
      invoice_id: inv?.id ?? "",
      amount: inv ? String(inv.total - inv.paid_amount) : "",
      method: "transfer",
    });
    setPayOpen(true);
  }

  function onPickInvoice(id: string) {
    const inv = invoices.find((i) => i.id === id);
    setForm((f) => ({
      ...f,
      invoice_id: id,
      amount: inv ? String(inv.total - inv.paid_amount) : "",
    }));
  }

  function handlePay() {
    const inv = selectedInv;
    const amount = Number(form.amount);
    if (!inv) {
      toast.error("กรุณาเลือกบิลที่ต้องการรับชำระ");
      return;
    }
    const remaining = inv.total - inv.paid_amount;
    if (!Number.isFinite(amount) || amount <= 0) {
      toast.error("กรุณากรอกยอดชำระ");
      return;
    }
    if (amount > remaining) {
      toast.error(`ยอดเกินคงเหลือ (${fmtMoney(remaining)})`);
      return;
    }
    const newPaid = inv.paid_amount + amount;
    const status = newPaid >= inv.total ? "paid" : "partially_paid";
    setInvoices((prev) =>
      prev.map((i) => (i.id === inv.id ? { ...i, paid_amount: newPaid, status } : i)),
    );
    setPayments((prev) => [
      {
        id: `pay-${Date.now()}`,
        invoice_id: inv.id,
        paid_at: new Date().toISOString(),
        amount,
        method: form.method,
        reference: null,
        received_by: "stf-006",
        note: null,
        created_at: new Date().toISOString(),
      },
      ...prev,
    ]);
    setPayOpen(false);
    toast.success(
      status === "paid"
        ? `รับชำระ ${fmtMoney(amount)} — บิล ${inv.invoice_no} ชำระครบ`
        : `รับชำระบางส่วน ${fmtMoney(amount)} — คงเหลือ ${fmtMoney(remaining - amount)}`,
    );
  }

  return (
    <NursingShell
      title="การรับชำระ"
      description="บันทึกการรับชำระและติดตามลูกหนี้ค้างชำระ (AR Aging)"
      icon={<Wallet className="h-6 w-6" />}
      actions={
        canWrite ? (
          <Button onClick={() => openPay()}>
            <Plus className="mr-1.5 h-4 w-4" /> รับชำระ
          </Button>
        ) : undefined
      }
    >
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <StatCard
          icon={<Banknote className="h-4 w-4" />}
          label="รับชำระสะสม"
          value={fmtMoney(receivedTotal)}
          sub={`${payments.length} รายการ`}
          tone="positive"
          valueColored
        />
        <StatCard
          icon={<Clock className="h-4 w-4" />}
          label="ลูกหนี้คงค้างรวม (AR)"
          value={fmtMoney(totalAR)}
          tone={totalAR > 0 ? "warning" : "neutral"}
          valueColored={totalAR > 0}
        />
        <StatCard
          icon={<AlertTriangle className="h-4 w-4" />}
          label="เกินกำหนดชำระ"
          value={fmtMoney(overdueAR)}
          tone={overdueAR > 0 ? "negative" : "neutral"}
          valueColored={overdueAR > 0}
          sub="ต้องเร่งติดตาม"
        />
      </div>

      {/* AR aging table */}
      <div className="rounded-xl border border-gray-200 bg-white p-4">
        <h3 className="mb-3 text-base font-medium text-gray-900">อายุหนี้คงค้าง (AR Aging)</h3>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <AgingCell label="ยังไม่ถึงกำหนด" value={aging.current} tone="text-gray-900" />
          <AgingCell label="1–30 วัน" value={aging.d1_30} tone="text-amber-600" />
          <AgingCell label="31–60 วัน" value={aging.d31_60} tone="text-orange-600" />
          <AgingCell label="60+ วัน" value={aging.d60plus} tone="text-red-600" />
        </div>
      </div>

      {/* Payments history */}
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>วันที่รับ</TableHead>
            <TableHead>เลขที่บิล</TableHead>
            <TableHead>ผู้พักอาศัย</TableHead>
            <TableHead align="center">วิธีชำระ</TableHead>
            <TableHead>อ้างอิง</TableHead>
            <TableHead align="right">ยอดรับ</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {sortedPayments.length === 0 ? (
            <TableEmpty colSpan={6}>ยังไม่มีการรับชำระ</TableEmpty>
          ) : (
            sortedPayments.map((p) => {
              const inv = invoices.find((i) => i.id === p.invoice_id);
              return (
                <TableRow key={p.id}>
                  <TableCell>{fmtDateTH(p.paid_at)}</TableCell>
                  <TableCell className="font-medium text-gray-900">
                    {inv?.invoice_no ?? "—"}
                  </TableCell>
                  <TableCell>{inv ? residentName(inv.resident_id) : "—"}</TableCell>
                  <TableCell align="center">
                    <StatusBadge tone="info">{METHOD_LABEL[p.method]}</StatusBadge>
                  </TableCell>
                  <TableCell className="text-gray-500">{p.reference ?? "—"}</TableCell>
                  <TableCell align="right" tabular className="text-green-600">
                    {fmtMoney(p.amount)}
                  </TableCell>
                </TableRow>
              );
            })
          )}
        </TableBody>
        <TableFooter>
          <TableRow>
            <TableCell colSpan={5} align="right">
              รวมรับชำระ
            </TableCell>
            <TableCell align="right" tabular>
              {fmtMoney(receivedTotal)}
            </TableCell>
          </TableRow>
        </TableFooter>
      </Table>

      {/* Dialog รับชำระ */}
      <Dialog open={payOpen} onOpenChange={setPayOpen}>
        <DialogContent size="lg">
          <DialogHeader>
            <DialogTitle>บันทึกการรับชำระ</DialogTitle>
          </DialogHeader>
          <DialogBody>
            {openInvoices.length === 0 ? (
              <div className="rounded-lg border border-green-200 bg-green-50 px-3 py-3 text-sm text-green-700">
                ไม่มีบิลค้างชำระ — เก็บเงินครบทุกใบแล้ว
              </div>
            ) : (
              <div className="space-y-4">
                <div>
                  <Label htmlFor="pay-inv">เลือกบิลค้างชำระ *</Label>
                  <CustomSelect
                    className="mt-1"
                    value={form.invoice_id}
                    onChange={onPickInvoice}
                    options={openInvoices.map((i) => ({
                      value: i.id,
                      label: `${i.invoice_no} · ${residentName(i.resident_id)} · คงเหลือ ${fmtMoney(
                        i.total - i.paid_amount,
                      )}`,
                    }))}
                  />
                </div>
                {selectedInv && (
                  <div className="rounded-lg bg-gray-50 px-3 py-2 text-sm text-gray-600">
                    ยอดบิล {fmtMoney(selectedInv.total)} · ชำระแล้ว{" "}
                    {fmtMoney(selectedInv.paid_amount)} · คงเหลือ{" "}
                    <span className="font-medium text-red-600">
                      {fmtMoney(selectedInv.total - selectedInv.paid_amount)}
                    </span>
                  </div>
                )}
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <div>
                    <Label htmlFor="pay-amount">ยอดรับชำระ (฿) *</Label>
                    <Input
                      id="pay-amount"
                      type="number"
                      className="mt-1"
                      value={form.amount}
                      onChange={(e) => setForm((f) => ({ ...f, amount: e.target.value }))}
                    />
                  </div>
                  <div>
                    <Label htmlFor="pay-method">วิธีชำระ</Label>
                    <CustomSelect
                      className="mt-1"
                      value={form.method}
                      onChange={(v) => setForm((f) => ({ ...f, method: v as PaymentMethod }))}
                      options={(Object.keys(METHOD_LABEL) as PaymentMethod[]).map((m) => ({
                        value: m,
                        label: METHOD_LABEL[m],
                      }))}
                    />
                  </div>
                </div>
              </div>
            )}
          </DialogBody>
          <DialogFooter>
            <Button variant="outline" onClick={() => setPayOpen(false)}>
              ยกเลิก
            </Button>
            <Button onClick={handlePay} disabled={openInvoices.length === 0}>
              บันทึกการรับชำระ
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </NursingShell>
  );
}

function AgingCell({ label, value, tone }: { label: string; value: number; tone: string }) {
  return (
    <div className="rounded-lg border border-gray-100 bg-gray-50 px-3 py-2.5">
      <div className="text-xs text-gray-400">{label}</div>
      <div className={`mt-1 font-mono text-lg font-semibold tabular-nums ${tone}`}>
        {fmtMoney(value)}
      </div>
    </div>
  );
}

function NoAccess() {
  return (
    <NursingShell title="การรับชำระ" icon={<Wallet className="h-6 w-6" />}>
      <div className="flex flex-col items-center justify-center rounded-xl border border-gray-200 bg-white py-16 text-center">
        <div className="mb-4 rounded-full bg-gray-100 p-4">
          <ShieldX className="h-8 w-8 text-gray-400" />
        </div>
        <h3 className="text-sm font-medium text-gray-900">ไม่มีสิทธิ์เข้าถึง</h3>
        <p className="mt-1 text-sm text-gray-500">
          เฉพาะเจ้าของ/ผู้จัดการ และฝ่ายธุรการ/การเงิน เท่านั้น
        </p>
      </div>
    </NursingShell>
  );
}
