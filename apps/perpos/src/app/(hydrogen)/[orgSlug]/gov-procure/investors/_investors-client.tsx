"use client";

// _investors-client.tsx — dashboard นักลงทุน
// ทั้ง 3 คนสิทธิ์เท่ากัน เห็นข้อมูลชุดเดียวกัน: ใครลงเท่าไร เงินค้างเท่าไร กำไรต่อคนเท่าไร
// เขียน (แก้สัดส่วน/เพิ่มคน) เฉพาะ owner/manager

import { useMemo, useState } from "react";
import { Users, Plus, Pencil, PiggyBank, HandCoins, Briefcase } from "lucide-react";
import { PageShell } from "@/components/ui/page-shell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Text } from "@/components/ui/typography";
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
import {
  FLOW_LABELS,
  type CapitalFlow,
  type CapitalSummary,
  type Investor,
} from "@/lib/gov-procure/capital";
import { fmtMoney, fmtDateTH } from "../_components/format";
import { govApi } from "../_components/api";

export function InvestorsClient({
  investors: initialInvestors,
  flows,
  summary,
  orgId,
  canManage,
}: {
  investors: Investor[];
  flows: CapitalFlow[];
  summary: CapitalSummary;
  orgId: string;
  canManage: boolean;
}) {
  const [investors, setInvestors] = useState(initialInvestors);
  const [editing, setEditing] = useState<Investor | null>(null);
  const [addOpen, setAddOpen] = useState(false);

  // ยอดต่อคนมาจาก summary ที่ SSR คำนวณ (สูตรเดียวกับหน้ากองทุน)
  const balances = summary.byInvestor;

  const flowsByInvestor = useMemo(() => {
    const map = new Map<string, CapitalFlow[]>();
    for (const f of flows) {
      if (!f.investor_id) continue;
      const list = map.get(f.investor_id) ?? [];
      list.push(f);
      map.set(f.investor_id, list);
    }
    return map;
  }, [flows]);

  function upsertInvestor(next: Investor) {
    setInvestors((prev) => {
      const exists = prev.some((i) => i.id === next.id);
      const merged = exists ? prev.map((i) => (i.id === next.id ? next : i)) : [...prev, next];
      return merged.sort((a, b) => b.share_pct - a.share_pct || a.name.localeCompare(b.name));
    });
  }

  return (
    <PageShell
      width="full"
      icon={<Users className="h-6 w-6" />}
      title="นักลงทุน"
      description="เงินลงขัน · เงินต้นค้างคืน · ส่วนแบ่งกำไรของแต่ละคน — ทุกคนเห็นข้อมูลชุดเดียวกัน"
      actions={
        canManage ? (
          <Button onClick={() => setAddOpen(true)}>
            <Plus className="mr-1.5 h-4 w-4" /> เพิ่มนักลงทุน
          </Button>
        ) : undefined
      }
    >
      <div className="space-y-6">
        {/* ── การ์ดสรุปต่อคน ── */}
        {balances.length === 0 ? (
          <div className="flex flex-col items-center justify-center rounded-xl border border-gray-200 bg-white py-16 text-center">
            <div className="mb-4 rounded-full bg-gray-100 p-4">
              <Users className="h-8 w-8 text-gray-400" />
            </div>
            <h3 className="text-sm font-medium text-gray-900">ยังไม่มีนักลงทุน</h3>
            <Text className="mt-1 text-sm text-gray-500">
              เพิ่มรายชื่อผู้ลงขันพร้อมสัดส่วนแบ่งกำไร แล้วจึงบันทึกเงินลงขันที่หน้ากองทุน
            </Text>
            {canManage && (
              <Button className="mt-4" size="sm" onClick={() => setAddOpen(true)}>
                <Plus className="mr-1.5 h-4 w-4" /> เพิ่มนักลงทุนคนแรก
              </Button>
            )}
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
            {balances.map((b) => (
              <div
                key={b.investor.id}
                className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm"
              >
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="text-base font-semibold text-gray-900">
                        {b.investor.name}
                      </span>
                      <StatusBadge tone="info">{b.investor.share_pct}%</StatusBadge>
                      {!b.investor.is_active && <StatusBadge tone="neutral">ปิดใช้งาน</StatusBadge>}
                    </div>
                    <Text className="mt-0.5 text-xs text-gray-500">
                      {b.investor.profile_id ? "ผูกบัญชีเข้าระบบแล้ว" : "ยังไม่ได้ผูกบัญชีเข้าระบบ"}
                    </Text>
                  </div>
                  {canManage && (
                    <Button
                      variant="ghost"
                      size="icon"
                      aria-label="แก้ไข"
                      onClick={() => setEditing(b.investor)}
                    >
                      <Pencil className="h-4 w-4" />
                    </Button>
                  )}
                </div>

                <div className="mt-4 space-y-2.5 text-sm">
                  <Row label="ลงขันสะสม" value={fmtMoney(b.contributed)} />
                  <Row label="ได้คืนเงินต้นแล้ว" value={fmtMoney(b.repaid)} />
                  <Row label="เงินต้นค้างคืน" value={fmtMoney(b.outstanding)} strong />
                  <div className="my-1 h-px bg-gray-200" />
                  <Row label="ปันผลรับแล้ว" value={fmtMoney(b.dividendReceived)} />
                  <Row
                    label="ส่วนแบ่งกำไรพร้อมรับ"
                    value={fmtMoney(b.dividendClaimable)}
                    strong
                    tone="positive"
                  />
                </div>

                <div className="mt-3 border-t border-gray-100 pt-2">
                  <Text className="text-xs text-gray-500">
                    รายการล่าสุด {flowsByInvestor.get(b.investor.id)?.length ?? 0} รายการ
                  </Text>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* ── KPI ภาพรวมกำไร ── */}
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <StatCard
            icon={<PiggyBank className="h-4 w-4" />}
            label="เงินต้นค้างคืนรวม"
            value={fmtMoney(summary.totalOutstandingPrincipal)}
            sub={`ลงขันรวม ${fmtMoney(summary.totalContributed)}`}
            tone="info"
          />
          <StatCard
            icon={<HandCoins className="h-4 w-4" />}
            label="กำไรพร้อมปันผล"
            value={fmtMoney(summary.totalDistributable)}
            sub={`ปันผลจ่ายแล้ว ${fmtMoney(summary.totalDividendPaid)}`}
            tone="positive"
            valueColored
          />
          <StatCard
            icon={<Briefcase className="h-4 w-4" />}
            label="มูลค่างานรวม"
            value={fmtMoney(summary.totalPipelineValue)}
            sub={`ทุนที่ลงขันแล้ว ${fmtMoney(summary.totalContributed)}`}
            tone="info"
          />
        </div>

        {/* ── ตารางเปรียบเทียบ ── */}
        <div>
          <div className="mb-2.5 flex items-center gap-1.5 px-1 text-sm font-semibold text-gray-900">
            <Users className="h-4 w-4 text-primary" />
            เปรียบเทียบรายคน
          </div>
          <Table className="shadow-sm">
            <TableHeader>
              <TableRow>
                <TableHead>นักลงทุน</TableHead>
                <TableHead align="right">สัดส่วน</TableHead>
                <TableHead align="right">ลงขันสะสม</TableHead>
                <TableHead align="right">เงินต้นค้างคืน</TableHead>
                <TableHead align="right">ปันผลรับแล้ว</TableHead>
                <TableHead align="right">พร้อมรับ</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {balances.length === 0 ? (
                <TableEmpty colSpan={6}>ยังไม่มีนักลงทุน</TableEmpty>
              ) : (
                balances.map((b) => (
                  <TableRow key={b.investor.id}>
                    <TableCell>{b.investor.name}</TableCell>
                    <TableCell align="right" className="tabular-nums">
                      {b.investor.share_pct}%
                    </TableCell>
                    <TableCell align="right" tabular>
                      {fmtMoney(b.contributed)}
                    </TableCell>
                    <TableCell align="right" tabular>
                      {fmtMoney(b.outstanding)}
                    </TableCell>
                    <TableCell align="right" tabular>
                      {fmtMoney(b.dividendReceived)}
                    </TableCell>
                    <TableCell align="right" tabular className="text-green-600">
                      {fmtMoney(b.dividendClaimable)}
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
            <TableFooter>
              <TableRow>
                <TableCell>รวม</TableCell>
                <TableCell align="right" className="tabular-nums">
                  {summary.sharePctTotal}%
                </TableCell>
                <TableCell align="right" tabular>
                  {fmtMoney(summary.totalContributed)}
                </TableCell>
                <TableCell align="right" tabular>
                  {fmtMoney(summary.totalOutstandingPrincipal)}
                </TableCell>
                <TableCell align="right" tabular>
                  {fmtMoney(summary.totalDividendPaid)}
                </TableCell>
                <TableCell align="right" tabular>
                  {fmtMoney(summary.totalDistributable)}
                </TableCell>
              </TableRow>
            </TableFooter>
          </Table>
        </div>

        {/* ── ไทม์ไลน์เงินเข้า-ออกของนักลงทุน (ทุกคนเห็นเหมือนกัน) ── */}
        <div>
          <div className="mb-2.5 px-1 text-sm font-semibold text-gray-900">
            เงินเข้า-ออกของนักลงทุน
          </div>
          <Table className="shadow-sm" maxHeight="50vh" stickyHeader>
            <TableHeader sticky>
              <TableRow>
                <TableHead>วันที่</TableHead>
                <TableHead>นักลงทุน</TableHead>
                <TableHead>รายการ</TableHead>
                <TableHead>บริษัทที่จ่าย</TableHead>
                <TableHead align="right">จำนวนเงิน</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {flows.filter((f) => f.investor_id).length === 0 ? (
                <TableEmpty colSpan={5}>ยังไม่มีรายการ</TableEmpty>
              ) : (
                flows
                  .filter((f) => f.investor_id)
                  .map((f) => (
                    <TableRow key={f.id}>
                      <TableCell className="tabular-nums">{fmtDateTH(f.flow_date)}</TableCell>
                      <TableCell>
                        {investors.find((i) => i.id === f.investor_id)?.name ?? "—"}
                      </TableCell>
                      <TableCell>{FLOW_LABELS[f.flow_type]}</TableCell>
                      <TableCell>{f.company ?? "—"}</TableCell>
                      <TableCell align="right" tabular>
                        {fmtMoney(f.amount)}
                      </TableCell>
                    </TableRow>
                  ))
              )}
            </TableBody>
          </Table>
        </div>
      </div>

      {canManage && (
        <InvestorDialog
          open={addOpen || editing !== null}
          investor={editing}
          orgId={orgId}
          onOpenChange={(v) => {
            if (!v) {
              setAddOpen(false);
              setEditing(null);
            }
          }}
          onSaved={upsertInvestor}
        />
      )}
    </PageShell>
  );
}

function Row({
  label,
  value,
  strong,
  muted,
  tone,
}: {
  label: string;
  value: string;
  strong?: boolean;
  muted?: boolean;
  tone?: "positive";
}) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <span className={muted ? "text-xs text-gray-400" : "text-gray-500"}>{label}</span>
      <span
        className={[
          "tabular-nums",
          strong ? "font-semibold" : "",
          tone === "positive"
            ? "text-green-600"
            : muted
              ? "text-xs text-gray-400"
              : "text-gray-900",
        ].join(" ")}
      >
        {value}
      </span>
    </div>
  );
}

// ── dialog เพิ่ม/แก้นักลงทุน ─────────────────────────────────────────────────

function InvestorDialog({
  open,
  investor,
  orgId,
  onOpenChange,
  onSaved,
}: {
  open: boolean;
  investor: Investor | null;
  orgId: string;
  onOpenChange: (v: boolean) => void;
  onSaved: (i: Investor) => void;
}) {
  const [name, setName] = useState("");
  const [sharePct, setSharePct] = useState("");
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);
  const [seededFor, setSeededFor] = useState<string | null>(null);

  // seed ฟอร์มเมื่อเปิด (ไม่ใช้ useEffect — sync จาก prop ตอน render ตาม React 19 pattern)
  const key = open ? (investor?.id ?? "new") : null;
  if (key !== seededFor) {
    setSeededFor(key);
    setName(investor?.name ?? "");
    setSharePct(investor ? String(investor.share_pct) : "");
    setNote(investor?.note ?? "");
  }

  async function handleSubmit() {
    if (!name.trim()) {
      toast.error("กรุณากรอกชื่อนักลงทุน");
      return;
    }
    const pct = Number(sharePct);
    if (!Number.isFinite(pct) || pct < 0 || pct > 100) {
      toast.error("สัดส่วนต้องอยู่ระหว่าง 0–100");
      return;
    }

    setSaving(true);
    try {
      const payload = { name: name.trim(), share_pct: pct, note: note.trim() || null };
      const res = investor
        ? await govApi<{ investor: Investor }>(
            `/api/gov-procure/investors?orgId=${orgId}&id=${investor.id}`,
            "PUT",
            payload,
          )
        : await govApi<{ investor: Investor }>(
            `/api/gov-procure/investors?orgId=${orgId}`,
            "POST",
            payload,
          );
      onSaved({ ...res.investor, share_pct: Number(res.investor.share_pct) });
      toast.success(investor ? "บันทึกการแก้ไขแล้ว" : "เพิ่มนักลงทุนแล้ว");
      onOpenChange(false);
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent size="md">
        <DialogHeader>
          <DialogTitle>{investor ? "แก้ไขนักลงทุน" : "เพิ่มนักลงทุน"}</DialogTitle>
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
                <Label htmlFor="inv-name">ชื่อ *</Label>
                <Input
                  id="inv-name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="เช่น Prite"
                />
              </div>
              <div>
                <Label htmlFor="inv-pct">สัดส่วนแบ่งกำไร (%) *</Label>
                <Input
                  id="inv-pct"
                  inputMode="decimal"
                  value={sharePct}
                  onChange={(e) => setSharePct(e.target.value)}
                  placeholder="30"
                />
                <Text className="mt-1 text-xs text-gray-500">
                  รวมทุกคนควรได้ 100% — ใช้คำนวณส่วนแบ่งกำไรที่พร้อมรับ
                </Text>
              </div>
              <div>
                <Label htmlFor="inv-note">หมายเหตุ</Label>
                <Input id="inv-note" value={note} onChange={(e) => setNote(e.target.value)} />
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
