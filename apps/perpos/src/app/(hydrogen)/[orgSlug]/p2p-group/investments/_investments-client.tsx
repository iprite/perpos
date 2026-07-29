"use client";

// เงินลงทุน & ปันผล — 2 แท็บ (SegmentedControl ตาม DESIGN §4)
// ROI ต่อบริษัท = ปันผลรับสะสม / เงินลงทุนสะสม (สูตรจาก metrics.ts แหล่งเดียว)

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Coins, HandCoins, Landmark, Plus } from "lucide-react";
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
import type { P2pgCompany, P2pgDividend, P2pgInvestment } from "@/lib/p2p-group/types";
import {
  DIVIDEND_STATUS_LABEL,
  INVESTMENT_METHOD_LABEL,
  formatMoney,
  formatPct,
  formatThaiDate,
  toOptions,
} from "@/lib/p2p-group/labels";
import { investmentRoi } from "@/lib/p2p-group/metrics";
import { p2pgMutate, withOrg } from "../_components/api";

type Tab = "investments" | "dividends";

export function InvestmentsClient({
  companies,
  investments,
  dividends,
  orgId,
  canWrite,
}: {
  companies: P2pgCompany[];
  investments: P2pgInvestment[];
  dividends: P2pgDividend[];
  orgId: string;
  canWrite: boolean;
}) {
  const divPager = usePagination(dividends);
  const invPager = usePagination(investments);
  const router = useRouter();
  const [tab, setTab] = useState<Tab>("investments");
  const [open, setOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState<Record<string, string>>({});

  const companyName = useMemo(() => new Map(companies.map((c) => [c.id, c.name])), [companies]);
  const companyOptions = useMemo(
    () =>
      companies
        .filter((c) => c.company_type !== "holding")
        .map((c) => ({ value: c.id, label: c.name })),
    [companies],
  );

  const totalCost = investments.reduce((a, i) => a + Number(i.cost_amount ?? 0), 0);
  const totalReceived = dividends
    .filter((d) => d.status === "paid")
    .reduce((a, d) => a + Number(d.amount_received ?? d.amount_declared ?? 0), 0);
  const roi = investmentRoi(totalCost, totalReceived);

  const set = (k: string, v: string) => setForm((p) => ({ ...p, [k]: v }));

  function openCreate() {
    setEditingId(null);
    setForm(
      tab === "investments"
        ? { company_id: companyOptions[0]?.value ?? "", method: "cost", invest_date: "" }
        : { company_id: companyOptions[0]?.value ?? "", status: "declared", declared_date: "" },
    );
    setOpen(true);
  }

  function openEditInvestment(i: P2pgInvestment) {
    setEditingId(i.id);
    setForm({
      company_id: i.company_id,
      invest_date: i.invest_date,
      shares: i.shares == null ? "" : String(i.shares),
      cost_amount: String(i.cost_amount),
      ownership_pct_after: i.ownership_pct_after == null ? "" : String(i.ownership_pct_after),
      method: i.method,
      note: i.note ?? "",
    });
    setOpen(true);
  }

  function openEditDividend(d: P2pgDividend) {
    setEditingId(d.id);
    setForm({
      company_id: d.company_id,
      declared_date: d.declared_date,
      paid_date: d.paid_date ?? "",
      amount_declared: String(d.amount_declared),
      amount_received: d.amount_received == null ? "" : String(d.amount_received),
      wht_amount: d.wht_amount == null ? "" : String(d.wht_amount),
      status: d.status,
      note: d.note ?? "",
    });
    setOpen(true);
  }

  async function save() {
    const num = (v?: string) => (v == null || v.trim() === "" ? null : Number(v));
    const base = tab === "investments" ? "/api/p2p-group/investments" : "/api/p2p-group/dividends";
    const payload =
      tab === "investments"
        ? {
            company_id: form.company_id,
            invest_date: form.invest_date || null,
            shares: num(form.shares),
            cost_amount: num(form.cost_amount),
            ownership_pct_after: num(form.ownership_pct_after),
            method: form.method || "cost",
            note: form.note?.trim() || null,
          }
        : {
            company_id: form.company_id,
            declared_date: form.declared_date || null,
            paid_date: form.paid_date || null,
            amount_declared: num(form.amount_declared),
            amount_received: num(form.amount_received),
            wht_amount: num(form.wht_amount),
            status: form.status || "declared",
            note: form.note?.trim() || null,
          };

    setSaving(true);
    try {
      if (editingId) {
        await p2pgMutate(withOrg(`${base}/${editingId}`, orgId), "PATCH", payload);
      } else {
        await p2pgMutate(withOrg(base, orgId), "POST", payload);
      }
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
    const base = tab === "investments" ? "/api/p2p-group/investments" : "/api/p2p-group/dividends";
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

  return (
    <PageShell
      title="เงินลงทุน & ปันผล"
      description="เงินลงทุนของบริษัทแม่ในบริษัทลูก และเงินปันผลที่ประกาศ/รับจริง"
      icon={<Landmark className="h-6 w-6" />}
      width="wide"
      actions={
        canWrite ? (
          <Button onClick={openCreate}>
            <Plus className="me-1 h-4 w-4" />
            {tab === "investments" ? "บันทึกเงินลงทุน" : "บันทึกปันผล"}
          </Button>
        ) : undefined
      }
    >
      <div className="space-y-5">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <StatCard
            icon={<Coins className="h-4 w-4" />}
            label="เงินลงทุนสะสม"
            value={formatMoney(totalCost)}
            sub={`${investments.length} รายการ`}
            tone="info"
            valueColored
          />
          <StatCard
            icon={<HandCoins className="h-4 w-4" />}
            label="ปันผลรับสะสม"
            value={formatMoney(totalReceived)}
            sub={`นับเฉพาะที่รับเงินแล้ว (${dividends.filter((d) => d.status === "paid").length} รายการ)`}
            tone="positive"
            valueColored
          />
          <StatCard
            label="ผลตอบแทนสะสม"
            value={formatPct(roi)}
            sub={roi == null ? "ยังไม่มีเงินลงทุน" : "ปันผลรับ ÷ เงินลงทุน"}
            tone="neutral"
          />
        </div>

        <SegmentedControl
          value={tab}
          onChange={(v) => setTab(v as Tab)}
          options={[
            { value: "investments", label: "เงินลงทุน" },
            { value: "dividends", label: "เงินปันผล" },
          ]}
        />

        {tab === "investments" ? (
          <div className="space-y-3">
            <Table className="shadow-sm" stickyHeader fillViewport>
              <TableHeader sticky>
                <TableRow>
                  <TableHead align="center">วันที่ลงทุน</TableHead>
                  <TableHead>บริษัท</TableHead>
                  <TableHead align="right">จำนวนหุ้น</TableHead>
                  <TableHead align="right">เงินลงทุน</TableHead>
                  <TableHead align="right">ถือหุ้นหลังลงทุน</TableHead>
                  <TableHead>วิธีบันทึก</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {investments.length === 0 ? (
                  <TableEmpty colSpan={6}>
                    ยังไม่มีรายการเงินลงทุน — บันทึกเงินที่บริษัทแม่ลงในบริษัทลูกเพื่อคำนวณผลตอบแทน
                  </TableEmpty>
                ) : (
                  invPager.rows.map((i) => (
                    <TableRow
                      key={i.id}
                      clickable={canWrite}
                      onClick={
                        canWrite
                          ? () => {
                              setTab("investments");
                              openEditInvestment(i);
                            }
                          : undefined
                      }
                    >
                      <TableCell align="center" className="tabular-nums">
                        {formatThaiDate(i.invest_date)}
                      </TableCell>
                      <TableCell>{companyName.get(i.company_id) ?? "—"}</TableCell>
                      <TableCell align="right" tabular>
                        {i.shares == null ? "—" : i.shares.toLocaleString("th-TH")}
                      </TableCell>
                      <TableCell align="right" tabular>
                        {formatMoney(i.cost_amount)}
                      </TableCell>
                      <TableCell align="right" className="tabular-nums">
                        {i.ownership_pct_after == null ? "—" : `${i.ownership_pct_after}%`}
                      </TableCell>
                      <TableCell>{INVESTMENT_METHOD_LABEL[i.method]}</TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
            <TablePager pager={invPager} unit="รายการ" />
          </div>
        ) : (
          <div className="space-y-3">
            <Table className="shadow-sm" stickyHeader fillViewport>
              <TableHeader sticky>
                <TableRow>
                  <TableHead align="center">วันประกาศ</TableHead>
                  <TableHead>บริษัท</TableHead>
                  <TableHead align="right">ประกาศจ่าย</TableHead>
                  <TableHead align="right">รับจริง</TableHead>
                  <TableHead align="right">ภาษีหัก ณ ที่จ่าย</TableHead>
                  <TableHead align="center">วันที่รับ</TableHead>
                  <TableHead align="center">สถานะ</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {dividends.length === 0 ? (
                  <TableEmpty colSpan={7}>ยังไม่มีรายการเงินปันผล</TableEmpty>
                ) : (
                  divPager.rows.map((d) => (
                    <TableRow
                      key={d.id}
                      clickable={canWrite}
                      onClick={
                        canWrite
                          ? () => {
                              setTab("dividends");
                              openEditDividend(d);
                            }
                          : undefined
                      }
                    >
                      <TableCell align="center" className="tabular-nums">
                        {formatThaiDate(d.declared_date)}
                      </TableCell>
                      <TableCell>{companyName.get(d.company_id) ?? "—"}</TableCell>
                      <TableCell align="right" tabular>
                        {formatMoney(d.amount_declared)}
                      </TableCell>
                      <TableCell align="right" tabular>
                        {formatMoney(d.amount_received)}
                      </TableCell>
                      <TableCell align="right" tabular>
                        {formatMoney(d.wht_amount)}
                      </TableCell>
                      <TableCell align="center" className="tabular-nums">
                        {formatThaiDate(d.paid_date)}
                      </TableCell>
                      <TableCell align="center">
                        <StatusBadge
                          tone={
                            d.status === "paid"
                              ? "success"
                              : d.status === "cancelled"
                                ? "neutral"
                                : "warning"
                          }
                        >
                          {DIVIDEND_STATUS_LABEL[d.status]}
                        </StatusBadge>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
            <TablePager pager={divPager} unit="รายการ" />
          </div>
        )}
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent size="lg">
          <DialogHeader>
            <DialogTitle>
              {tab === "investments"
                ? editingId
                  ? "แก้ไขเงินลงทุน"
                  : "บันทึกเงินลงทุน"
                : editingId
                  ? "แก้ไขเงินปันผล"
                  : "บันทึกเงินปันผล"}
            </DialogTitle>
          </DialogHeader>
          <DialogBody>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div className="sm:col-span-2">
                <Label htmlFor="i-company">บริษัท *</Label>
                <CustomSelect
                  value={form.company_id ?? ""}
                  onChange={(v) => set("company_id", v)}
                  options={companyOptions}
                  className="mt-1"
                />
              </div>

              {tab === "investments" ? (
                <>
                  <div>
                    <Label htmlFor="i-date">วันที่ลงทุน *</Label>
                    <div className="mt-1">
                      <ThaiDatePicker
                        value={form.invest_date ?? ""}
                        onChange={(iso) => set("invest_date", iso)}
                      />
                    </div>
                  </div>
                  <div>
                    <Label htmlFor="i-cost">เงินลงทุน (฿) *</Label>
                    <Input
                      id="i-cost"
                      type="number"
                      min={0}
                      step="0.01"
                      className="mt-1"
                      value={form.cost_amount ?? ""}
                      onChange={(e) => set("cost_amount", e.target.value)}
                    />
                  </div>
                  <div>
                    <Label htmlFor="i-shares">จำนวนหุ้น</Label>
                    <Input
                      id="i-shares"
                      type="number"
                      min={0}
                      className="mt-1"
                      value={form.shares ?? ""}
                      onChange={(e) => set("shares", e.target.value)}
                    />
                  </div>
                  <div>
                    <Label htmlFor="i-pct">สัดส่วนหลังลงทุน (%)</Label>
                    <Input
                      id="i-pct"
                      type="number"
                      min={0}
                      max={100}
                      step="0.01"
                      className="mt-1"
                      value={form.ownership_pct_after ?? ""}
                      onChange={(e) => set("ownership_pct_after", e.target.value)}
                    />
                  </div>
                  <div className="sm:col-span-2">
                    <Label htmlFor="i-method">วิธีบันทึกบัญชี</Label>
                    <CustomSelect
                      value={form.method ?? "cost"}
                      onChange={(v) => set("method", v)}
                      options={toOptions(INVESTMENT_METHOD_LABEL)}
                      className="mt-1"
                    />
                  </div>
                </>
              ) : (
                <>
                  <div>
                    <Label htmlFor="d-declared">วันที่ประกาศจ่าย *</Label>
                    <div className="mt-1">
                      <ThaiDatePicker
                        value={form.declared_date ?? ""}
                        onChange={(iso) => set("declared_date", iso)}
                      />
                    </div>
                  </div>
                  <div>
                    <Label htmlFor="d-amount">จำนวนที่ประกาศ (฿) *</Label>
                    <Input
                      id="d-amount"
                      type="number"
                      min={0}
                      step="0.01"
                      className="mt-1"
                      value={form.amount_declared ?? ""}
                      onChange={(e) => set("amount_declared", e.target.value)}
                    />
                  </div>
                  <div>
                    <Label htmlFor="d-received">รับจริง (฿)</Label>
                    <Input
                      id="d-received"
                      type="number"
                      min={0}
                      step="0.01"
                      className="mt-1"
                      value={form.amount_received ?? ""}
                      onChange={(e) => set("amount_received", e.target.value)}
                    />
                  </div>
                  <div>
                    <Label htmlFor="d-wht">ภาษีหัก ณ ที่จ่าย (฿)</Label>
                    <Input
                      id="d-wht"
                      type="number"
                      min={0}
                      step="0.01"
                      className="mt-1"
                      value={form.wht_amount ?? ""}
                      onChange={(e) => set("wht_amount", e.target.value)}
                    />
                  </div>
                  <div>
                    <Label htmlFor="d-paid">วันที่รับเงิน</Label>
                    <div className="mt-1">
                      <ThaiDatePicker
                        value={form.paid_date ?? ""}
                        onChange={(iso) => set("paid_date", iso)}
                      />
                    </div>
                  </div>
                  <div className="sm:col-span-2">
                    <Label htmlFor="d-status">สถานะ</Label>
                    <CustomSelect
                      value={form.status ?? "declared"}
                      onChange={(v) => set("status", v)}
                      options={toOptions(DIVIDEND_STATUS_LABEL)}
                      className="mt-1"
                    />
                  </div>
                </>
              )}

              <div className="sm:col-span-2">
                <Label htmlFor="x-note">หมายเหตุ</Label>
                <Input
                  id="x-note"
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
