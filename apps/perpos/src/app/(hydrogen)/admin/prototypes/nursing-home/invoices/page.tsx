"use client";

// invoices/page.tsx — ใบแจ้งหนี้ + workflow สร้างบิลรอบเดือน (§11 billing cycle)
// gate §4: invoices = owner/admin_staff (W·A) · nurse/caregiver ไม่เห็น

import { useMemo, useState } from "react";
import { FileText, Plus, ShieldX, TrendingUp, Wallet, Send, CircleDollarSign } from "lucide-react";
import { Button } from "@/components/ui/button";
import { CustomSelect } from "@/components/ui/custom-select";
import { Label } from "@/components/ui/label";
import { NativeSelect } from "@/components/ui/native-select";
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
import {
  NursingShell,
  useNursingRole,
  fmtMoney,
  fmtDateTH,
  fmtMonthTH,
  fullName,
  InvoiceStatusBadge,
} from "../_components";
import {
  INVOICES,
  INVOICE_ITEMS,
  RESIDENTS,
  RESIDENT_SUBSCRIPTIONS,
  SERVICE_PACKAGES,
  MEDICATION_ORDERS,
} from "../_fixtures";
import type { Invoice, InvoiceItem, InvoiceItemKind } from "../_fixtures/types";

const KIND_LABEL: Record<InvoiceItemKind, string> = {
  package: "แพ็กเกจ",
  medication: "ค่ายา",
  procedure: "หัตถการ",
  extra: "ค่าใช้จ่ายอื่น",
  adjustment: "ปรับปรุง/ส่วนลด",
};

const residentName = (id: string) => {
  const r = RESIDENTS.find((x) => x.id === id);
  return r
    ? fullName({ first_name: r.first_name, last_name: r.last_name, nickname: r.nickname })
    : id;
};

type GenLine = { resident_id: string; kind: InvoiceItemKind; description: string; amount: number };

export default function InvoicesPage() {
  const { can } = useNursingRole();
  const canView = can("view", "invoices");
  const canWrite = can("write", "invoices");
  const canApprove = can("approve", "invoices");

  const [invoices, setInvoices] = useState<Invoice[]>(INVOICES);
  const [items, setItems] = useState<InvoiceItem[]>(INVOICE_ITEMS);
  const [fStatus, setFStatus] = useState("");
  const [fMonth, setFMonth] = useState("2026-06");

  const [detail, setDetail] = useState<Invoice | null>(null);
  const [genOpen, setGenOpen] = useState(false);
  const [genMonth, setGenMonth] = useState("2026-07");

  const months = Array.from(new Set(invoices.map((i) => i.period_month)))
    .sort()
    .reverse();

  const filtered = invoices.filter(
    (i) => (!fStatus || i.status === fStatus) && (!fMonth || i.period_month === fMonth),
  );

  // KPI — เดือนที่เลือก
  const monthInv = invoices.filter((i) => i.period_month === fMonth && i.status !== "void");
  const revenue = monthInv.reduce((s, i) => s + i.paid_amount, 0);
  const outstanding = monthInv.reduce((s, i) => s + (i.total - i.paid_amount), 0);
  const overdueCount = monthInv.filter((i) => i.status === "overdue").length;

  const detailItems = detail ? items.filter((it) => it.invoice_id === detail.id) : [];

  // ─── สร้างบิลรอบเดือน — จำลอง generate จาก subscriptions + ค่ายา/หัตถการ extra ───
  const genLines: GenLine[] = useMemo(() => {
    if (!genOpen) return [];
    const existing = new Set(
      invoices.filter((i) => i.period_month === genMonth).map((i) => i.resident_id),
    );
    const lines: GenLine[] = [];
    for (const sub of RESIDENT_SUBSCRIPTIONS) {
      if (!sub.is_active || existing.has(sub.resident_id)) continue;
      const pkg = SERVICE_PACKAGES.find((p) => p.id === sub.package_id);
      lines.push({
        resident_id: sub.resident_id,
        kind: "package",
        description: `${pkg?.name ?? "แพ็กเกจ"} — ${fmtMonthTH(genMonth)}`,
        amount: sub.monthly_price,
      });
      // ค่ายานอกแพ็กเกจ (จำลอง: ผู้พักที่มี medication order active + injection → คิดเพิ่ม)
      const extraMed = MEDICATION_ORDERS.find(
        (m) => m.resident_id === sub.resident_id && m.is_active && m.route === "injection",
      );
      if (extraMed) {
        lines.push({
          resident_id: sub.resident_id,
          kind: "medication",
          description: `${extraMed.drug_name} (นอกแพ็กเกจ)`,
          amount: 800,
        });
      }
    }
    return lines;
  }, [genOpen, genMonth, invoices]);

  // จัดกลุ่มต่อผู้พักเพื่อ preview
  const genByResident = useMemo(() => {
    const m = new Map<string, GenLine[]>();
    for (const l of genLines) {
      const arr = m.get(l.resident_id) ?? [];
      arr.push(l);
      m.set(l.resident_id, arr);
    }
    return Array.from(m.entries());
  }, [genLines]);

  if (!canView) return <NoAccess />;

  const genTotal = genLines.reduce((s, l) => s + l.amount, 0);

  function handleGenerate() {
    if (genByResident.length === 0) {
      toast.error("ไม่มีผู้พักที่ต้องสร้างบิลในเดือนนี้");
      return;
    }
    const seq0 = invoices.length + 100;
    const newInv: Invoice[] = [];
    const newItems: InvoiceItem[] = [];
    genByResident.forEach(([resId, lines], idx) => {
      const id = `inv-gen-${Date.now()}-${idx}`;
      const subtotal = lines.reduce((s, l) => s + l.amount, 0);
      newInv.push({
        id,
        invoice_no: `INV-2026-${String(seq0 + idx)}`,
        resident_id: resId,
        period_month: genMonth,
        issue_date: `${genMonth}-01`,
        due_date: `${genMonth}-15`,
        status: "draft",
        subtotal,
        discount: 0,
        total: subtotal,
        paid_amount: 0,
        note: "สร้างจากรอบบิลอัตโนมัติ",
        created_at: new Date().toISOString(),
      });
      lines.forEach((l, li) => {
        newItems.push({
          id: `iigen-${Date.now()}-${idx}-${li}`,
          invoice_id: id,
          kind: l.kind,
          description: l.description,
          quantity: 1,
          unit_price: l.amount,
          amount: l.amount,
          ref_id: null,
          created_at: new Date().toISOString(),
        });
      });
    });
    setInvoices((prev) => [...newInv, ...prev]);
    setItems((prev) => [...prev, ...newItems]);
    setGenOpen(false);
    setFMonth(genMonth);
    toast.success(`สร้างบิลร่าง ${newInv.length} ใบ สำหรับ ${fmtMonthTH(genMonth)} แล้ว`);
  }

  function issueInvoice(inv: Invoice) {
    setInvoices((prev) => prev.map((i) => (i.id === inv.id ? { ...i, status: "issued" } : i)));
    setDetail((d) => (d && d.id === inv.id ? { ...d, status: "issued" } : d));
    toast.success(`ออกบิล ${inv.invoice_no} แล้ว`);
  }

  function recordPayment(inv: Invoice) {
    // จำลองรับชำระเต็มจำนวนคงเหลือ
    const remaining = inv.total - inv.paid_amount;
    setInvoices((prev) =>
      prev.map((i) => (i.id === inv.id ? { ...i, paid_amount: i.total, status: "paid" } : i)),
    );
    setDetail((d) => (d && d.id === inv.id ? { ...d, paid_amount: d.total, status: "paid" } : d));
    toast.success(`รับชำระ ${fmtMoney(remaining)} — บิล ${inv.invoice_no} ชำระครบ`);
  }

  return (
    <NursingShell
      title="ใบแจ้งหนี้"
      description="ออกบิลรอบเดือนจากแพ็กเกจ + ค่ายา/หัตถการ และติดตามการชำระ"
      icon={<FileText className="h-6 w-6" />}
      actions={
        canWrite ? (
          <Button onClick={() => setGenOpen(true)}>
            <Plus className="mr-1.5 h-4 w-4" /> สร้างบิลรอบเดือน
          </Button>
        ) : undefined
      }
    >
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <StatCard
          icon={<TrendingUp className="h-4 w-4" />}
          label={`รายได้ที่รับแล้ว — ${fmtMonthTH(fMonth)}`}
          value={fmtMoney(revenue)}
          tone="positive"
          valueColored
        />
        <StatCard
          icon={<Wallet className="h-4 w-4" />}
          label="ยอดค้างชำระ"
          value={fmtMoney(outstanding)}
          tone={outstanding > 0 ? "warning" : "neutral"}
          valueColored={outstanding > 0}
        />
        <StatCard
          icon={<CircleDollarSign className="h-4 w-4" />}
          label="บิลเกินกำหนด"
          value={`${overdueCount} ใบ`}
          tone={overdueCount > 0 ? "negative" : "neutral"}
          sub="ต้องติดตามชำระ"
        />
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <CustomSelect
          className="w-44"
          value={fMonth}
          onChange={setFMonth}
          options={[
            { value: "", label: "ทุกเดือน" },
            ...months.map((m) => ({ value: m, label: fmtMonthTH(m) })),
          ]}
        />
        <CustomSelect
          className="w-44"
          value={fStatus}
          onChange={setFStatus}
          options={[
            { value: "", label: "ทุกสถานะ" },
            { value: "draft", label: "ฉบับร่าง" },
            { value: "issued", label: "ออกบิลแล้ว" },
            { value: "partially_paid", label: "ชำระบางส่วน" },
            { value: "paid", label: "ชำระครบ" },
            { value: "overdue", label: "เกินกำหนด" },
            { value: "void", label: "ยกเลิก" },
          ]}
        />
        <span className="text-sm text-gray-400">{filtered.length} รายการ</span>
      </div>

      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>เลขที่บิล</TableHead>
            <TableHead>ผู้พักอาศัย</TableHead>
            <TableHead align="center">รอบเดือน</TableHead>
            <TableHead align="center">ครบกำหนด</TableHead>
            <TableHead align="right">ยอดรวม</TableHead>
            <TableHead align="right">ชำระแล้ว</TableHead>
            <TableHead align="center">สถานะ</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {filtered.length === 0 ? (
            <TableEmpty colSpan={7}>ไม่พบใบแจ้งหนี้ตามเงื่อนไข</TableEmpty>
          ) : (
            filtered.map((inv) => (
              <TableRow key={inv.id} clickable onClick={() => setDetail(inv)}>
                <TableCell className="font-medium text-gray-900">{inv.invoice_no}</TableCell>
                <TableCell>{residentName(inv.resident_id)}</TableCell>
                <TableCell align="center">{fmtMonthTH(inv.period_month)}</TableCell>
                <TableCell align="center">{fmtDateTH(inv.due_date)}</TableCell>
                <TableCell align="right" tabular>
                  {fmtMoney(inv.total)}
                </TableCell>
                <TableCell align="right" tabular>
                  {fmtMoney(inv.paid_amount)}
                </TableCell>
                <TableCell align="center">
                  <InvoiceStatusBadge status={inv.status} />
                </TableCell>
              </TableRow>
            ))
          )}
        </TableBody>
      </Table>

      {/* ─── Dialog รายละเอียดบิล ─── */}
      <Dialog open={!!detail} onOpenChange={(o) => !o && setDetail(null)}>
        <DialogContent size="2xl">
          <DialogHeader>
            <DialogTitle>
              {detail?.invoice_no} · {detail && residentName(detail.resident_id)}
            </DialogTitle>
          </DialogHeader>
          <DialogBody>
            {detail && (
              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
                  <Field label="รอบเดือน" value={fmtMonthTH(detail.period_month)} />
                  <Field label="ออกบิล" value={fmtDateTH(detail.issue_date)} />
                  <Field label="ครบกำหนด" value={fmtDateTH(detail.due_date)} />
                  <div>
                    <div className="text-xs text-gray-400">สถานะ</div>
                    <div className="mt-1">
                      <InvoiceStatusBadge status={detail.status} />
                    </div>
                  </div>
                </div>

                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>รายการ</TableHead>
                      <TableHead align="center">ประเภท</TableHead>
                      <TableHead align="right">จำนวน</TableHead>
                      <TableHead align="right">ราคา/หน่วย</TableHead>
                      <TableHead align="right">รวม</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {detailItems.map((it) => (
                      <TableRow key={it.id}>
                        <TableCell wrap>{it.description}</TableCell>
                        <TableCell align="center">
                          <StatusBadge tone={it.kind === "adjustment" ? "warning" : "neutral"}>
                            {KIND_LABEL[it.kind]}
                          </StatusBadge>
                        </TableCell>
                        <TableCell align="right" tabular>
                          {it.quantity}
                        </TableCell>
                        <TableCell align="right" tabular>
                          {fmtMoney(it.unit_price)}
                        </TableCell>
                        <TableCell align="right" tabular>
                          {fmtMoney(it.amount)}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                  <TableFooter>
                    <TableRow>
                      <TableCell colSpan={4} align="right">
                        ยอดก่อนส่วนลด
                      </TableCell>
                      <TableCell align="right" tabular>
                        {fmtMoney(detail.subtotal)}
                      </TableCell>
                    </TableRow>
                    {detail.discount > 0 && (
                      <TableRow>
                        <TableCell colSpan={4} align="right">
                          ส่วนลด
                        </TableCell>
                        <TableCell align="right" tabular>
                          {fmtMoney(-detail.discount)}
                        </TableCell>
                      </TableRow>
                    )}
                    <TableRow>
                      <TableCell colSpan={4} align="right">
                        ยอดสุทธิ
                      </TableCell>
                      <TableCell align="right" tabular>
                        {fmtMoney(detail.total)}
                      </TableCell>
                    </TableRow>
                    <TableRow>
                      <TableCell colSpan={4} align="right" className="text-gray-500">
                        คงเหลือต้องชำระ
                      </TableCell>
                      <TableCell align="right" tabular className="text-red-600">
                        {fmtMoney(detail.total - detail.paid_amount)}
                      </TableCell>
                    </TableRow>
                  </TableFooter>
                </Table>

                {detail.note && (
                  <p className="rounded-lg bg-gray-50 px-3 py-2 text-xs text-gray-500">
                    หมายเหตุ: {detail.note}
                  </p>
                )}
              </div>
            )}
          </DialogBody>
          <DialogFooter>
            {detail?.status === "draft" && canApprove && (
              <Button className="mr-auto" onClick={() => issueInvoice(detail)}>
                <Send className="mr-1.5 h-4 w-4" /> ออกบิล
              </Button>
            )}
            {detail &&
              canApprove &&
              ["issued", "partially_paid", "overdue"].includes(detail.status) && (
                <Button className="mr-auto" onClick={() => recordPayment(detail)}>
                  <Wallet className="mr-1.5 h-4 w-4" /> รับชำระเต็มจำนวน
                </Button>
              )}
            <Button variant="outline" onClick={() => setDetail(null)}>
              ปิด
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ─── Dialog สร้างบิลรอบเดือน ─── */}
      <Dialog open={genOpen} onOpenChange={setGenOpen}>
        <DialogContent size="2xl">
          <DialogHeader>
            <DialogTitle>สร้างบิลรอบเดือน</DialogTitle>
          </DialogHeader>
          <DialogBody>
            <div className="space-y-4">
              <div className="max-w-xs">
                <Label htmlFor="gen-month">เลือกเดือนที่ต้องการออกบิล</Label>
                <NativeSelect
                  id="gen-month"
                  className="mt-1"
                  value={genMonth}
                  onChange={(e) => setGenMonth(e.target.value)}
                >
                  {["2026-07", "2026-08", "2026-09"].map((m) => (
                    <option key={m} value={m}>
                      {fmtMonthTH(m)}
                    </option>
                  ))}
                </NativeSelect>
                <p className="mt-1 text-xs text-gray-400">
                  ระบบจะสร้างบิลร่างจากแพ็กเกจที่ผู้พักสมัครไว้ + ค่ายานอกแพ็กเกจอัตโนมัติ
                </p>
              </div>

              {genByResident.length === 0 ? (
                <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-3 text-sm text-amber-700">
                  ผู้พักทุกคนมีบิลของเดือนนี้แล้ว — ไม่มีรายการให้สร้าง
                </div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>ผู้พักอาศัย</TableHead>
                      <TableHead>รายการที่จะออกบิล</TableHead>
                      <TableHead align="right">ยอดบิล</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {genByResident.map(([resId, lines]) => (
                      <TableRow key={resId}>
                        <TableCell className="font-medium text-gray-900">
                          {residentName(resId)}
                        </TableCell>
                        <TableCell wrap>
                          <ul className="space-y-0.5 text-xs text-gray-500">
                            {lines.map((l, i) => (
                              <li key={i}>• {l.description}</li>
                            ))}
                          </ul>
                        </TableCell>
                        <TableCell align="right" tabular>
                          {fmtMoney(lines.reduce((s, l) => s + l.amount, 0))}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                  <TableFooter>
                    <TableRow>
                      <TableCell colSpan={2} align="right">
                        รวม {genByResident.length} ใบ
                      </TableCell>
                      <TableCell align="right" tabular>
                        {fmtMoney(genTotal)}
                      </TableCell>
                    </TableRow>
                  </TableFooter>
                </Table>
              )}
            </div>
          </DialogBody>
          <DialogFooter>
            <Button variant="outline" onClick={() => setGenOpen(false)}>
              ยกเลิก
            </Button>
            <Button onClick={handleGenerate} disabled={genByResident.length === 0}>
              ยืนยันสร้างบิลร่าง ({genByResident.length})
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </NursingShell>
  );
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-xs text-gray-400">{label}</div>
      <div className="mt-1 text-gray-900">{value}</div>
    </div>
  );
}

function NoAccess() {
  return (
    <NursingShell title="ใบแจ้งหนี้" icon={<FileText className="h-6 w-6" />}>
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
