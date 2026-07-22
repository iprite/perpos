"use client";

// _capital-client.tsx — กองทุน/เงินลงทุน
// เล่าเรื่องตามการไหลของเงิน: ลงขัน → กองกลาง → กระจายไปบริษัท → กำไร → พร้อมปันผล
// นักลงทุนทั้ง 3 คนเห็นชุดข้อมูลเดียวกันทุกอย่าง (ไม่มีการซ่อนระหว่างกัน) — เขียนได้เฉพาะ owner/manager

import { useMemo, useState } from "react";
import {
  Landmark,
  Wallet,
  TrendingUp,
  Coins,
  Plus,
  Trash2,
  ArrowDownLeft,
  ArrowUpRight,
  Building2,
  AlertTriangle,
} from "lucide-react";
import { PageShell } from "@/components/ui/page-shell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Text } from "@/components/ui/typography";
import { CustomSelect } from "@/components/ui/custom-select";
import { ThaiDatePicker } from "@/components/ui/thai-date-picker";
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
  TableFooter,
  TableRow,
  TableHead,
  TableCell,
  TableEmpty,
} from "@/components/ui/table";
import { toast } from "@/lib/toast";
import { COMPANIES, COMPANY_DOT_CLASS, type GovProcureOrder } from "@/lib/gov-procure/types";
import {
  CAPITAL_FLOW_TYPES,
  FLOW_LABELS,
  FLOW_TONE,
  computeCapital,
  type CapitalFlow,
  type CapitalFlowType,
  type CapitalSummary,
  type Investor,
} from "@/lib/gov-procure/capital";
import { fmtMoney, fmtDateTH } from "../_components/format";
import { govApi } from "../_components/api";

/** ฟิลด์ที่ต้องกรอกตามชนิดรายการ — mirror SHAPE ที่ API + CHECK ที่ DB */
const SHAPE: Record<CapitalFlowType, { investor: boolean; company: boolean }> = {
  contribution: { investor: true, company: false },
  allocation: { investor: false, company: true },
  return_to_pool: { investor: false, company: true },
  dividend: { investor: true, company: true },
  repayment: { investor: true, company: true },
};

const FLOW_OPTIONS = CAPITAL_FLOW_TYPES.map((t) => ({ value: t, label: FLOW_LABELS[t] }));

export function CapitalClient({
  orders,
  investors,
  flows: initialFlows,
  summary: initialSummary,
  orgId,
  canManage,
}: {
  orders: GovProcureOrder[];
  investors: Investor[];
  flows: CapitalFlow[];
  summary: CapitalSummary;
  orgId: string;
  canManage: boolean;
}) {
  const [flows, setFlows] = useState(initialFlows);
  const [addOpen, setAddOpen] = useState(false);

  // คำนวณใหม่ฝั่ง client หลัง mutation (สูตรเดียวกับ SSR)
  const summary = useMemo(
    () => (flows === initialFlows ? initialSummary : computeCapital(orders, investors, flows)),
    [flows, initialFlows, initialSummary, orders, investors],
  );

  const investorName = useMemo(() => new Map(investors.map((i) => [i.id, i.name])), [investors]);

  async function handleDelete(flow: CapitalFlow) {
    if (!confirm(`ลบรายการ "${FLOW_LABELS[flow.flow_type]}" ${fmtMoney(flow.amount)} ?`)) return;
    try {
      await govApi(`/api/gov-procure/capital/${flow.id}?orgId=${orgId}`, "DELETE");
      setFlows((prev) => prev.filter((f) => f.id !== flow.id));
      toast.success("ลบรายการแล้ว");
    } catch (e) {
      toast.error((e as Error).message);
    }
  }

  return (
    <PageShell
      width="full"
      icon={<Landmark className="h-6 w-6" />}
      title="กองทุน"
      description="เงินลงขันของนักลงทุน · การกระจายทุนไปแต่ละบริษัท · กำไรที่พร้อมปันผล"
      actions={
        canManage ? (
          <Button onClick={() => setAddOpen(true)}>
            <Plus className="mr-1.5 h-4 w-4" /> บันทึกรายการเงิน
          </Button>
        ) : undefined
      }
    >
      <div className="space-y-6">
        {summary.sharePctTotal !== 100 && (
          <div className="flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 p-3">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />
            <Text className="text-xs text-amber-800">
              สัดส่วนนักลงทุนรวมได้ {summary.sharePctTotal}% (ไม่เท่ากับ 100%) —
              ตัวเลขส่วนแบ่งกำไรจะคลาดเคลื่อน แก้สัดส่วนได้ที่หน้า “นักลงทุน”
            </Text>
          </div>
        )}

        {/* ── KPI กองกลาง ── */}
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <StatCard
            icon={<Coins className="h-4 w-4" />}
            label="เงินลงขันรวม"
            value={fmtMoney(summary.totalContributed)}
            sub={`ค้างคืนนักลงทุน ${fmtMoney(summary.totalOutstandingPrincipal)}`}
            tone="info"
          />
          <StatCard
            icon={<Wallet className="h-4 w-4" />}
            label="คงเหลือในกองกลาง"
            value={fmtMoney(summary.poolBalance)}
            sub={`กระจายไปบริษัทแล้ว ${fmtMoney(summary.totalDeployed)}`}
            tone={summary.poolBalance >= 0 ? "primary" : "negative"}
            valueColored
          />
          <StatCard
            icon={<TrendingUp className="h-4 w-4" />}
            label="กำไรสะสม (รับเช็คแล้ว)"
            value={fmtMoney(summary.totalProfitRealized)}
            sub={`มูลค่างานรวม ${fmtMoney(summary.totalPipelineValue)}`}
            tone="positive"
            valueColored
          />
          <StatCard
            icon={<ArrowUpRight className="h-4 w-4" />}
            label="พร้อมปันผล"
            value={fmtMoney(summary.totalDistributable)}
            sub={`ปันผลจ่ายแล้ว ${fmtMoney(summary.totalDividendPaid)}`}
            tone="positive"
            valueColored
          />
        </div>

        {/* ── เงินอยู่ที่บริษัทไหนเท่าไร ── */}
        <div>
          <div className="mb-2.5 flex items-center gap-1.5 px-1 text-sm font-semibold text-gray-900">
            <Building2 className="h-4 w-4 text-primary" />
            เงินอยู่ที่บริษัทไหนบ้าง
          </div>
          <Table className="shadow-sm">
            <TableHeader>
              <TableRow>
                <TableHead>บริษัท</TableHead>
                <TableHead align="right">งาน</TableHead>
                <TableHead align="right">มูลค่างาน</TableHead>
                <TableHead align="right">ทุนที่ถืออยู่</TableHead>
                <TableHead align="right">กำไรสะสม</TableHead>
                <TableHead align="right">ปันผลจ่ายแล้ว</TableHead>
                <TableHead align="right">พร้อมปันผล</TableHead>
                <TableHead align="right">เงินสดโดยประมาณ</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {summary.byCompany.map((c) => (
                <TableRow key={c.company}>
                  <TableCell>
                    <span className="inline-flex items-center gap-2">
                      <span
                        className={`h-2 w-2 rounded-full ${COMPANY_DOT_CLASS[c.company]}`}
                        aria-hidden
                      />
                      {c.company}
                    </span>
                  </TableCell>
                  <TableCell align="right" className="tabular-nums">
                    {c.orderCount} งาน
                  </TableCell>
                  <TableCell align="right" tabular>
                    {fmtMoney(c.pipelineValue)}
                  </TableCell>
                  <TableCell align="right" tabular>
                    {fmtMoney(c.capitalHeld)}
                  </TableCell>
                  <TableCell align="right" tabular className="text-green-600">
                    {fmtMoney(c.profitRealized)}
                  </TableCell>
                  <TableCell align="right" tabular>
                    {fmtMoney(c.dividendPaid)}
                  </TableCell>
                  <TableCell align="right" tabular>
                    {c.distributable > 0 ? (
                      <StatusBadge tone="success">{fmtMoney(c.distributable)}</StatusBadge>
                    ) : (
                      <span className="text-gray-400">—</span>
                    )}
                  </TableCell>
                  <TableCell align="right" tabular>
                    {fmtMoney(c.cashOnHand)}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
            <TableFooter>
              <TableRow>
                <TableCell>รวม</TableCell>
                <TableCell align="right" className="tabular-nums">
                  {orders.length} งาน
                </TableCell>
                <TableCell align="right" tabular>
                  {fmtMoney(summary.totalPipelineValue)}
                </TableCell>
                <TableCell align="right" tabular>
                  {fmtMoney(summary.totalDeployed)}
                </TableCell>
                <TableCell align="right" tabular>
                  {fmtMoney(summary.totalProfitRealized)}
                </TableCell>
                <TableCell align="right" tabular>
                  {fmtMoney(summary.totalDividendPaid)}
                </TableCell>
                <TableCell align="right" tabular>
                  {fmtMoney(summary.totalDistributable)}
                </TableCell>
                <TableCell align="right" tabular>
                  {fmtMoney(summary.byCompany.reduce((s, c) => s + c.cashOnHand, 0))}
                </TableCell>
              </TableRow>
            </TableFooter>
          </Table>
          <Text className="mt-1.5 px-1 text-xs text-gray-500">
            กำไรสะสม = กำไรของงานที่ “รับเช็คแล้ว/ปิดงาน” (ระบบดึงจากรายการงานอัตโนมัติ
            ไม่ต้องคีย์ซ้ำ) · พร้อมปันผล = กำไรสะสม − ปันผลที่จ่ายไปแล้ว
          </Text>
        </div>

        {/* ── ledger ── */}
        <div>
          <div className="mb-2.5 flex items-center gap-1.5 px-1 text-sm font-semibold text-gray-900">
            <Coins className="h-4 w-4 text-primary" />
            รายการเคลื่อนไหวเงินทุน
          </div>
          <Table className="shadow-sm" maxHeight="60vh" stickyHeader>
            <TableHeader sticky>
              <TableRow>
                <TableHead>วันที่</TableHead>
                <TableHead>รายการ</TableHead>
                <TableHead>นักลงทุน</TableHead>
                <TableHead>บริษัท</TableHead>
                <TableHead align="right">จำนวนเงิน</TableHead>
                <TableHead>หมายเหตุ</TableHead>
                {canManage && <TableHead align="center">ลบ</TableHead>}
              </TableRow>
            </TableHeader>
            <TableBody>
              {flows.length === 0 ? (
                <TableEmpty colSpan={canManage ? 7 : 6}>
                  <div className="flex flex-col items-center gap-2 py-6">
                    <Coins className="h-8 w-8 text-gray-300" />
                    <span>ยังไม่มีรายการเงินทุน</span>
                    <Text className="text-xs text-gray-500">
                      เริ่มจากบันทึก “ลงขันเข้ากองกลาง” ของนักลงทุนแต่ละคน
                    </Text>
                    {canManage && (
                      <Button size="sm" className="mt-1" onClick={() => setAddOpen(true)}>
                        <Plus className="mr-1.5 h-4 w-4" /> บันทึกรายการแรก
                      </Button>
                    )}
                  </div>
                </TableEmpty>
              ) : (
                flows.map((f) => {
                  const tone = FLOW_TONE[f.flow_type];
                  return (
                    <TableRow key={f.id}>
                      <TableCell className="tabular-nums">{fmtDateTH(f.flow_date)}</TableCell>
                      <TableCell>
                        <span className="inline-flex items-center gap-1.5">
                          {tone === "positive" ? (
                            <ArrowDownLeft className="h-3.5 w-3.5 text-green-600" />
                          ) : tone === "negative" ? (
                            <ArrowUpRight className="h-3.5 w-3.5 text-red-600" />
                          ) : (
                            <ArrowUpRight className="h-3.5 w-3.5 text-gray-400" />
                          )}
                          {FLOW_LABELS[f.flow_type]}
                        </span>
                      </TableCell>
                      <TableCell>
                        {f.investor_id ? (investorName.get(f.investor_id) ?? "—") : "—"}
                      </TableCell>
                      <TableCell>{f.company ?? "—"}</TableCell>
                      <TableCell align="right" tabular>
                        {fmtMoney(f.amount)}
                      </TableCell>
                      <TableCell wrap className="max-w-[280px] text-gray-500">
                        {f.note ?? "—"}
                      </TableCell>
                      {canManage && (
                        <TableCell align="center">
                          <Button
                            variant="ghost"
                            size="icon"
                            aria-label="ลบรายการ"
                            onClick={() => handleDelete(f)}
                          >
                            <Trash2 className="h-4 w-4 text-red-600" />
                          </Button>
                        </TableCell>
                      )}
                    </TableRow>
                  );
                })
              )}
            </TableBody>
          </Table>
        </div>
      </div>

      {canManage && (
        <AddFlowDialog
          open={addOpen}
          onOpenChange={setAddOpen}
          orgId={orgId}
          investors={investors}
          onCreated={(flow) => setFlows((prev) => [flow, ...prev])}
        />
      )}
    </PageShell>
  );
}

// ── dialog บันทึกรายการ ──────────────────────────────────────────────────────

function AddFlowDialog({
  open,
  onOpenChange,
  orgId,
  investors,
  onCreated,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  orgId: string;
  investors: Investor[];
  onCreated: (flow: CapitalFlow) => void;
}) {
  const [flowType, setFlowType] = useState<CapitalFlowType>("contribution");
  const [amount, setAmount] = useState("");
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [investorId, setInvestorId] = useState("");
  const [company, setCompany] = useState("");
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);

  const shape = SHAPE[flowType];

  const investorOptions = [
    { value: "", label: "— เลือกนักลงทุน —" },
    ...investors.map((i) => ({ value: i.id, label: `${i.name} (${i.share_pct}%)` })),
  ];
  const companyOptions = [
    { value: "", label: "— เลือกบริษัท —" },
    ...COMPANIES.map((c) => ({ value: c, label: c })),
  ];

  function reset() {
    setFlowType("contribution");
    setAmount("");
    setDate(new Date().toISOString().slice(0, 10));
    setInvestorId("");
    setCompany("");
    setNote("");
  }

  async function handleSubmit() {
    const value = Number(amount.replace(/,/g, ""));
    if (!Number.isFinite(value) || value <= 0) {
      toast.error("จำนวนเงินต้องมากกว่า 0");
      return;
    }
    if (shape.investor && !investorId) {
      toast.error("กรุณาเลือกนักลงทุน");
      return;
    }
    if (shape.company && !company) {
      toast.error("กรุณาเลือกบริษัท");
      return;
    }

    setSaving(true);
    try {
      const { flow } = await govApi<{ flow: CapitalFlow }>(
        `/api/gov-procure/capital?orgId=${orgId}`,
        "POST",
        {
          flow_type: flowType,
          amount: value,
          flow_date: date,
          investor_id: shape.investor ? investorId : null,
          company: shape.company ? company : null,
          note,
        },
      );
      onCreated({ ...flow, amount: Number(flow.amount) });
      toast.success(`บันทึก${FLOW_LABELS[flowType]}แล้ว`);
      reset();
      onOpenChange(false);
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent size="lg">
        <DialogHeader>
          <DialogTitle>
            <span className="flex items-center gap-2">
              <Coins className="h-5 w-5 text-primary" />
              บันทึกรายการเงินทุน
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
            <div className="space-y-4">
              <div>
                <Label htmlFor="cf-type">ชนิดรายการ *</Label>
                <CustomSelect
                  value={flowType}
                  onChange={(v) => setFlowType(v as CapitalFlowType)}
                  options={FLOW_OPTIONS}
                />
                <Text className="mt-1 text-xs text-gray-500">{FLOW_HINTS[flowType]}</Text>
              </div>

              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div>
                  <Label htmlFor="cf-amount">จำนวนเงิน (฿) *</Label>
                  <Input
                    id="cf-amount"
                    inputMode="decimal"
                    value={amount}
                    onChange={(e) => setAmount(e.target.value)}
                    placeholder="0.00"
                  />
                </div>
                <div>
                  <Label htmlFor="cf-date">วันที่ *</Label>
                  <ThaiDatePicker value={date} onChange={(iso) => setDate(iso)} />
                </div>
              </div>

              {shape.investor && (
                <div>
                  <Label htmlFor="cf-investor">นักลงทุน *</Label>
                  <CustomSelect
                    value={investorId}
                    onChange={setInvestorId}
                    options={investorOptions}
                  />
                </div>
              )}

              {shape.company && (
                <div>
                  <Label htmlFor="cf-company">บริษัท *</Label>
                  <CustomSelect value={company} onChange={setCompany} options={companyOptions} />
                </div>
              )}

              <div>
                <Label htmlFor="cf-note">หมายเหตุ</Label>
                <Input
                  id="cf-note"
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  placeholder="เช่น โอนผ่านบัญชีกสิกร"
                />
              </div>
            </div>
          </DialogBody>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              ยกเลิก
            </Button>
            <Button type="submit" disabled={saving}>
              {saving ? "กำลังบันทึก…" : "บันทึก"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

const FLOW_HINTS: Record<CapitalFlowType, string> = {
  contribution: "นักลงทุนโอนเงินเข้ากองกลาง (เพิ่มเงินต้นที่ค้างคืน)",
  allocation: "ย้ายเงินจากกองกลางไปให้บริษัทใช้รับงาน",
  return_to_pool: "บริษัทคืนทุนกลับเข้ากองกลาง (ไม่ใช่การปันผล)",
  dividend: "จ่ายกำไรจากบริษัทให้นักลงทุน — หักออกจาก “พร้อมปันผล”",
  repayment: "คืนเงินต้นให้นักลงทุน — ลดยอดค้างคืน ไม่ใช่กำไร",
};
