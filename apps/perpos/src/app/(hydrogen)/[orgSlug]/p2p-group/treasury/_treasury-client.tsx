"use client";

// เงินสด & ธนาคาร — บัญชีทั้งกลุ่ม + ยอดล่าสุด + บันทึกยอด ณ วันที่
// ยอดรวมกลุ่ม = ผลรวมของ "ยอดล่าสุดของแต่ละบัญชี" → ต้องบอกเสมอว่ามาจากกี่บัญชีและข้อมูลลงวันไหน

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Landmark, Plus, Wallet } from "lucide-react";
import { PageShell } from "@/components/ui/page-shell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { CustomSelect } from "@/components/ui/custom-select";
import { ThaiDatePicker } from "@/components/ui/thai-date-picker";
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
import type { P2pgBankAccount, P2pgBankBalance, P2pgCompany } from "@/lib/p2p-group/types";
import {
  BANK_ACCOUNT_TYPE_LABEL,
  formatMoney,
  formatThaiDate,
  toOptions,
} from "@/lib/p2p-group/labels";
import { latestBalanceByAccount } from "@/lib/p2p-group/queries";
import { p2pgMutate, withOrg } from "../_components/api";

export function TreasuryClient({
  companies,
  accounts,
  balances,
  orgId,
  canWrite,
}: {
  companies: P2pgCompany[];
  accounts: P2pgBankAccount[];
  balances: P2pgBankBalance[];
  orgId: string;
  canWrite: boolean;
}) {
  const pager = usePagination(accounts);
  const router = useRouter();
  const [accountDialog, setAccountDialog] = useState(false);
  const [balanceDialog, setBalanceDialog] = useState(false);
  const [editingAccount, setEditingAccount] = useState<P2pgBankAccount | null>(null);
  const [balanceTarget, setBalanceTarget] = useState<P2pgBankAccount | null>(null);
  const [form, setForm] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);

  const companyName = useMemo(() => new Map(companies.map((c) => [c.id, c.name])), [companies]);
  const companyOptions = useMemo(
    () => companies.map((c) => ({ value: c.id, label: c.name })),
    [companies],
  );
  const latest = useMemo(() => latestBalanceByAccount(balances), [balances]);

  const activeAccounts = accounts.filter((a) => a.is_active);
  const withBalance = activeAccounts.filter((a) => latest.has(a.id));
  const groupCash = withBalance.reduce((a, acc) => a + Number(latest.get(acc.id)?.balance ?? 0), 0);
  const oldestAsOf = withBalance
    .map((a) => latest.get(a.id)?.as_of_date ?? "")
    .filter(Boolean)
    .sort()[0];

  const set = (k: string, v: string) => setForm((p) => ({ ...p, [k]: v }));

  function openCreateAccount() {
    setEditingAccount(null);
    setForm({ company_id: companyOptions[0]?.value ?? "", account_type: "current" });
    setAccountDialog(true);
  }

  function openEditAccount(a: P2pgBankAccount) {
    setEditingAccount(a);
    setForm({
      company_id: a.company_id,
      bank_name: a.bank_name,
      account_name: a.account_name ?? "",
      account_no: a.account_no ?? "",
      account_type: a.account_type,
      is_active: a.is_active ? "1" : "",
      note: a.note ?? "",
    });
    setAccountDialog(true);
  }

  function openBalance(a: P2pgBankAccount) {
    setBalanceTarget(a);
    const cur = latest.get(a.id);
    setForm({
      as_of_date: cur?.as_of_date ?? "",
      balance: cur ? String(cur.balance) : "",
      note: "",
    });
    setBalanceDialog(true);
  }

  async function saveAccount() {
    if (!form.bank_name?.trim()) {
      toast.error("กรุณากรอกชื่อธนาคาร");
      return;
    }
    setSaving(true);
    try {
      const payload = {
        company_id: form.company_id,
        bank_name: form.bank_name.trim(),
        account_name: form.account_name?.trim() || null,
        account_no: form.account_no?.trim() || null,
        account_type: form.account_type || "current",
        is_active: form.is_active !== "",
        note: form.note?.trim() || null,
      };
      if (editingAccount) {
        await p2pgMutate(
          withOrg(`/api/p2p-group/bank-accounts/${editingAccount.id}`, orgId),
          "PATCH",
          payload,
        );
      } else {
        await p2pgMutate(withOrg("/api/p2p-group/bank-accounts", orgId), "POST", payload);
      }
      toast.success("บันทึกบัญชีธนาคารแล้ว");
      setAccountDialog(false);
      router.refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "บันทึกไม่สำเร็จ");
    } finally {
      setSaving(false);
    }
  }

  async function deleteAccount() {
    if (!editingAccount) return;
    setSaving(true);
    try {
      await p2pgMutate(
        withOrg(`/api/p2p-group/bank-accounts/${editingAccount.id}`, orgId),
        "DELETE",
      );
      toast.success("ลบบัญชีแล้ว");
      setAccountDialog(false);
      router.refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "ลบไม่สำเร็จ");
    } finally {
      setSaving(false);
    }
  }

  async function saveBalance() {
    if (!balanceTarget) return;
    if (!form.as_of_date || form.balance?.trim() === "" || form.balance == null) {
      toast.error("กรุณาระบุวันที่และยอดคงเหลือ");
      return;
    }
    setSaving(true);
    try {
      await p2pgMutate(withOrg("/api/p2p-group/bank-balances", orgId), "POST", {
        bank_account_id: balanceTarget.id,
        as_of_date: form.as_of_date,
        balance: Number(form.balance),
        source: "manual",
        note: form.note?.trim() || null,
      });
      toast.success("บันทึกยอดคงเหลือแล้ว");
      setBalanceDialog(false);
      router.refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "บันทึกไม่สำเร็จ");
    } finally {
      setSaving(false);
    }
  }

  return (
    <PageShell
      title="เงินสด & ธนาคาร"
      description="บัญชีธนาคารของทุกบริษัทในกลุ่ม และยอดคงเหลือล่าสุด"
      icon={<Wallet className="h-6 w-6" />}
      width="wide"
      actions={
        canWrite ? (
          <Button onClick={openCreateAccount}>
            <Plus className="me-1 h-4 w-4" />
            เพิ่มบัญชีธนาคาร
          </Button>
        ) : undefined
      }
    >
      <div className="space-y-5">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <StatCard
            icon={<Landmark className="h-4 w-4" />}
            label="เงินสดรวมทั้งกลุ่ม"
            value={formatMoney(withBalance.length ? groupCash : null)}
            sub={`จาก ${withBalance.length}/${activeAccounts.length} บัญชีที่มียอดบันทึกไว้`}
            tone="positive"
            valueColored
          />
          <StatCard
            label="บัญชีที่ใช้งาน"
            value={`${activeAccounts.length}`}
            sub={`ทั้งหมด ${accounts.length} บัญชี`}
            tone="neutral"
          />
          <StatCard
            label="ข้อมูลเก่าสุดที่ใช้คำนวณ"
            value={oldestAsOf ? formatThaiDate(oldestAsOf) : "—"}
            sub={
              withBalance.length < activeAccounts.length
                ? "บางบัญชียังไม่มีการบันทึกยอด"
                : "ทุกบัญชีมียอดบันทึกแล้ว"
            }
            tone={withBalance.length < activeAccounts.length ? "warning" : "neutral"}
          />
        </div>

        {withBalance.length < activeAccounts.length && activeAccounts.length > 0 && (
          <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-700">
            ยอดเงินสดรวมด้านบนยังไม่ครบ — มี {activeAccounts.length - withBalance.length}{" "}
            บัญชีที่ยังไม่เคยบันทึกยอดคงเหลือ
          </div>
        )}

        <Table className="shadow-sm" stickyHeader fillViewport>
          <TableHeader sticky>
            <TableRow>
              <TableHead>ธนาคาร / บัญชี</TableHead>
              <TableHead>บริษัท</TableHead>
              <TableHead>ประเภท</TableHead>
              <TableHead align="right">ยอดล่าสุด</TableHead>
              <TableHead align="center">ณ วันที่</TableHead>
              <TableHead align="center">สถานะ</TableHead>
              <TableHead align="center">บันทึกยอด</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {accounts.length === 0 ? (
              <TableEmpty colSpan={7}>
                ยังไม่มีบัญชีธนาคาร — เพิ่มบัญชีของแต่ละบริษัทเพื่อดูเงินสดรวมทั้งกลุ่ม
              </TableEmpty>
            ) : (
              pager.rows.map((a) => {
                const bal = latest.get(a.id);
                return (
                  <TableRow
                    key={a.id}
                    clickable={canWrite}
                    onClick={canWrite ? () => openEditAccount(a) : undefined}
                  >
                    <TableCell>
                      <div className="font-medium text-gray-900">{a.bank_name}</div>
                      <div className="text-xs text-gray-500">
                        {a.account_name ?? "—"} {a.account_no ? `· ${a.account_no}` : ""}
                      </div>
                    </TableCell>
                    <TableCell>{companyName.get(a.company_id) ?? "—"}</TableCell>
                    <TableCell>{BANK_ACCOUNT_TYPE_LABEL[a.account_type]}</TableCell>
                    <TableCell align="right" tabular>
                      {formatMoney(bal?.balance ?? null)}
                    </TableCell>
                    <TableCell align="center" className="tabular-nums">
                      {formatThaiDate(bal?.as_of_date ?? null)}
                    </TableCell>
                    <TableCell align="center">
                      <StatusBadge tone={a.is_active ? "success" : "neutral"}>
                        {a.is_active ? "ใช้งาน" : "ปิดใช้งาน"}
                      </StatusBadge>
                    </TableCell>
                    <TableCell align="center">
                      {canWrite ? (
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={(e) => {
                            e.stopPropagation(); // คลิกปุ่มนี้ต้องไม่เปิด dialog แก้บัญชีของแถว
                            openBalance(a);
                          }}
                        >
                          บันทึกยอด
                        </Button>
                      ) : (
                        "—"
                      )}
                    </TableCell>
                  </TableRow>
                );
              })
            )}
          </TableBody>
        </Table>
        <TablePager pager={pager} unit="บัญชี" />
      </div>

      <Dialog open={accountDialog} onOpenChange={setAccountDialog}>
        <DialogContent size="lg">
          <DialogHeader>
            <DialogTitle>{editingAccount ? "แก้ไขบัญชีธนาคาร" : "เพิ่มบัญชีธนาคาร"}</DialogTitle>
          </DialogHeader>
          <DialogBody>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div className="sm:col-span-2">
                <Label htmlFor="b-company">บริษัทเจ้าของบัญชี *</Label>
                <CustomSelect
                  value={form.company_id ?? ""}
                  onChange={(v) => set("company_id", v)}
                  options={companyOptions}
                  className="mt-1"
                />
              </div>
              <div>
                <Label htmlFor="b-bank">ธนาคาร *</Label>
                <Input
                  id="b-bank"
                  className="mt-1"
                  value={form.bank_name ?? ""}
                  onChange={(e) => set("bank_name", e.target.value)}
                  placeholder="เช่น กสิกรไทย"
                />
              </div>
              <div>
                <Label htmlFor="b-type">ประเภทบัญชี</Label>
                <CustomSelect
                  value={form.account_type ?? "current"}
                  onChange={(v) => set("account_type", v)}
                  options={toOptions(BANK_ACCOUNT_TYPE_LABEL)}
                  className="mt-1"
                />
              </div>
              <div>
                <Label htmlFor="b-name">ชื่อบัญชี</Label>
                <Input
                  id="b-name"
                  className="mt-1"
                  value={form.account_name ?? ""}
                  onChange={(e) => set("account_name", e.target.value)}
                />
              </div>
              <div>
                <Label htmlFor="b-no">เลขที่บัญชี</Label>
                <Input
                  id="b-no"
                  className="mt-1"
                  value={form.account_no ?? ""}
                  onChange={(e) => set("account_no", e.target.value)}
                />
              </div>
              <div className="sm:col-span-2">
                <Label htmlFor="b-note">หมายเหตุ</Label>
                <Input
                  id="b-note"
                  className="mt-1"
                  value={form.note ?? ""}
                  onChange={(e) => set("note", e.target.value)}
                />
              </div>
            </div>
          </DialogBody>
          <DialogFooter>
            {editingAccount && (
              <Button
                variant="destructive"
                className="mr-auto"
                disabled={saving}
                onClick={deleteAccount}
              >
                ลบ
              </Button>
            )}
            <Button variant="outline" onClick={() => setAccountDialog(false)} disabled={saving}>
              ยกเลิก
            </Button>
            <Button onClick={saveAccount} disabled={saving}>
              {saving ? "กำลังบันทึก…" : "บันทึก"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={balanceDialog} onOpenChange={setBalanceDialog}>
        <DialogContent size="md">
          <DialogHeader>
            <DialogTitle>บันทึกยอดคงเหลือ — {balanceTarget?.bank_name}</DialogTitle>
          </DialogHeader>
          <DialogBody>
            <div className="space-y-4">
              <div>
                <Label htmlFor="bb-date">ณ วันที่ *</Label>
                <div className="mt-1">
                  <ThaiDatePicker
                    value={form.as_of_date ?? ""}
                    onChange={(iso) => set("as_of_date", iso)}
                  />
                </div>
              </div>
              <div>
                <Label htmlFor="bb-balance">ยอดคงเหลือ (฿) *</Label>
                <Input
                  id="bb-balance"
                  type="number"
                  step="0.01"
                  className="mt-1"
                  value={form.balance ?? ""}
                  onChange={(e) => set("balance", e.target.value)}
                />
              </div>
              <div>
                <Label htmlFor="bb-note">หมายเหตุ</Label>
                <Input
                  id="bb-note"
                  className="mt-1"
                  value={form.note ?? ""}
                  onChange={(e) => set("note", e.target.value)}
                />
              </div>
              <p className="text-xs text-gray-500">
                บันทึกซ้ำวันเดิมจะทับยอดเดิมของวันนั้น — ยอดรวมกลุ่มใช้ยอดล่าสุดของแต่ละบัญชี
              </p>
            </div>
          </DialogBody>
          <DialogFooter>
            <Button variant="outline" onClick={() => setBalanceDialog(false)} disabled={saving}>
              ยกเลิก
            </Button>
            <Button onClick={saveBalance} disabled={saving}>
              {saving ? "กำลังบันทึก…" : "บันทึก"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </PageShell>
  );
}
