"use client";

// medications/page.tsx — eMAR (รอบยาวันนี้) + รายการสั่งยา — prototype interactive
import React, { useMemo, useState } from "react";
import { Pill, Plus, CheckCircle2, XCircle, Ban, PauseCircle, ListChecks } from "lucide-react";
import {
  NursingShell,
  useNursingRole,
  MedAdminStatusBadge,
  MedActiveBadge,
  fmtTimeTH,
  fmtDateTH,
  fullName,
} from "../_components";
import { MEDICATION_ADMINISTRATIONS, MEDICATION_ORDERS, RESIDENTS } from "../_fixtures";
import type { MedicationAdministration, MedAdminStatus, MedicationOrder } from "../_fixtures/types";
import { Button } from "@/components/ui/button";
import { CustomSelect } from "@/components/ui/custom-select";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { StatCard } from "@/components/ui/stat-card";
import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
  TableEmpty,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogBody,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { notify } from "@/lib/toast";

function residentName(id: string): string {
  const r = RESIDENTS.find((x) => x.id === id);
  return r ? fullName(r) : id;
}
function orderOf(id: string): MedicationOrder | undefined {
  return MEDICATION_ORDERS.find((o) => o.id === id);
}

type Tab = "emar" | "orders";

const blankOrder = {
  resident_id: "res-001",
  drug_name: "",
  dosage: "",
  route: "oral",
  frequency: "od",
  time: "08:00",
  instructions: "",
};

export default function MedicationsPage() {
  const { can } = useNursingRole();
  const canAdminister = can("write", "medication_administrations");
  const canOrder = can("write", "medication_orders");

  const [tab, setTab] = useState<Tab>("emar");
  const [admins, setAdmins] = useState<MedicationAdministration[]>(MEDICATION_ADMINISTRATIONS);
  const [orders, setOrders] = useState<MedicationOrder[]>(MEDICATION_ORDERS);

  const [fResident, setFResident] = useState("");
  const [fStatus, setFStatus] = useState("");

  // dialog เปลี่ยนสถานะ (missed/refused/held ต้องเหตุผล)
  const [actTarget, setActTarget] = useState<{ id: string; status: MedAdminStatus } | null>(null);
  const [actReason, setActReason] = useState("");

  // dialog สั่งยาใหม่
  const [orderOpen, setOrderOpen] = useState(false);
  const [orderForm, setOrderForm] = useState(blankOrder);

  const filteredAdmins = useMemo(() => {
    return admins
      .filter((a) => (fResident ? a.resident_id === fResident : true))
      .filter((a) => (fStatus ? a.status === fStatus : true))
      .sort((a, b) => (a.scheduled_at < b.scheduled_at ? -1 : 1));
  }, [admins, fResident, fStatus]);

  // A5 rule-based stats
  const stats = useMemo(() => {
    const total = admins.length;
    const given = admins.filter((a) => a.status === "given").length;
    const missed = admins.filter((a) => a.status === "missed").length;
    const refused = admins.filter((a) => a.status === "refused").length;
    const held = admins.filter((a) => a.status === "held").length;
    const pending = admins.filter((a) => a.status === "pending").length;
    const completed = total - pending;
    const rate = completed > 0 ? Math.round((given / completed) * 100) : 0;
    return { total, given, missed, refused, held, pending, rate };
  }, [admins]);

  const residentOptions = useMemo(
    () => [
      { value: "", label: "ผู้พักทั้งหมด" },
      ...RESIDENTS.filter((r) => r.status === "active").map((r) => ({
        value: r.id,
        label: fullName(r),
      })),
    ],
    [],
  );

  function markGiven(id: string) {
    const now = new Date().toISOString();
    setAdmins((p) =>
      p.map((a) =>
        a.id === id
          ? { ...a, status: "given", administered_at: now, administered_by: "stf-003" }
          : a,
      ),
    );
    notify.success("บันทึกการให้ยาแล้ว");
  }

  function confirmAction() {
    if (!actTarget) return;
    if (!actReason.trim()) return notify.error("กรุณาระบุเหตุผล");
    setAdmins((p) =>
      p.map((a) =>
        a.id === actTarget.id
          ? { ...a, status: actTarget.status, administered_by: "stf-003", reason: actReason }
          : a,
      ),
    );
    const label =
      actTarget.status === "missed"
        ? "พลาดรอบ"
        : actTarget.status === "refused"
          ? "ปฏิเสธ"
          : "งดยา";
    notify.success(`บันทึกสถานะ "${label}" แล้ว`);
    setActTarget(null);
    setActReason("");
  }

  function submitOrder() {
    if (!orderForm.drug_name.trim() || !orderForm.dosage.trim())
      return notify.error("กรอกชื่อยาและขนาดยา");
    const now = new Date().toISOString();
    const next: MedicationOrder = {
      id: `mo-${Date.now()}`,
      resident_id: orderForm.resident_id,
      drug_name: orderForm.drug_name,
      dosage: orderForm.dosage,
      route: orderForm.route as MedicationOrder["route"],
      frequency: orderForm.frequency as MedicationOrder["frequency"],
      schedule_times: orderForm.time ? [orderForm.time] : [],
      start_date: now.slice(0, 10),
      end_date: null,
      is_active: true,
      prescribed_by: null,
      instructions: orderForm.instructions || null,
      created_at: now,
    };
    setOrders((p) => [next, ...p]);
    setOrderOpen(false);
    setOrderForm(blankOrder);
    notify.created("สั่งยาใหม่แล้ว");
  }

  return (
    <NursingShell
      title="ตารางให้ยา (eMAR)"
      description="บันทึกการให้ยาแต่ละรอบและจัดการรายการสั่งยาของผู้พักอาศัย"
      icon={<Pill className="h-6 w-6" />}
      actions={
        tab === "orders" && canOrder ? (
          <Button onClick={() => setOrderOpen(true)}>
            <Plus className="mr-1.5 h-4 w-4" /> สั่งยาใหม่
          </Button>
        ) : undefined
      }
    >
      {/* KPI — A5 rule-based (ไม่ใช่ AI) */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-4">
        <StatCard
          icon={<CheckCircle2 className="h-4 w-4" />}
          label="อัตราการให้ยาครบ"
          value={`${stats.rate}%`}
          sub={`ให้แล้ว ${stats.given} / รอ ${stats.pending} รอบ`}
          tone={stats.rate >= 90 ? "positive" : "warning"}
          valueColored
        />
        <StatCard
          icon={<XCircle className="h-4 w-4" />}
          label="พลาดรอบ"
          value={stats.missed}
          tone={stats.missed > 0 ? "negative" : "neutral"}
          valueColored
        />
        <StatCard
          icon={<Ban className="h-4 w-4" />}
          label="ปฏิเสธ"
          value={stats.refused}
          tone={stats.refused > 0 ? "warning" : "neutral"}
          valueColored
        />
        <StatCard
          icon={<PauseCircle className="h-4 w-4" />}
          label="งดยา (hold)"
          value={stats.held}
          tone={stats.held > 0 ? "warning" : "neutral"}
          valueColored
        />
      </div>
      <p className="-mt-2 text-xs text-gray-400">
        * ตัวเลขสรุปคำนวณตามกฎ (rule-based) จากข้อมูล eMAR วันนี้ — ไม่ใช่ AI
      </p>

      {/* tab */}
      <div className="flex gap-1 rounded-lg border border-gray-200 bg-gray-50 p-1">
        <Button
          variant={tab === "emar" ? "secondary" : "ghost"}
          size="sm"
          onClick={() => setTab("emar")}
          className={`flex-1 ${tab === "emar" ? "bg-white text-primary shadow-sm hover:bg-white" : "text-gray-500"}`}
        >
          <Pill className="mr-1.5 h-4 w-4" /> รอบยาวันนี้
        </Button>
        <Button
          variant={tab === "orders" ? "secondary" : "ghost"}
          size="sm"
          onClick={() => setTab("orders")}
          className={`flex-1 ${tab === "orders" ? "bg-white text-primary shadow-sm hover:bg-white" : "text-gray-500"}`}
        >
          <ListChecks className="mr-1.5 h-4 w-4" /> รายการสั่งยา
        </Button>
      </div>

      {tab === "emar" ? (
        <>
          <div className="flex flex-wrap items-center gap-2">
            <CustomSelect
              value={fResident}
              onChange={setFResident}
              options={residentOptions}
              className="w-56"
            />
            <CustomSelect
              value={fStatus}
              onChange={setFStatus}
              options={[
                { value: "", label: "ทุกสถานะ" },
                { value: "pending", label: "รอให้ยา" },
                { value: "given", label: "ให้ยาแล้ว" },
                { value: "missed", label: "พลาดรอบ" },
                { value: "refused", label: "ปฏิเสธ" },
                { value: "held", label: "งดยา" },
              ]}
              className="w-40"
            />
          </div>

          <Table stickyHeader maxHeight="60vh">
            <TableHeader sticky>
              <TableRow>
                <TableHead align="right">เวลา</TableHead>
                <TableHead>ผู้พัก</TableHead>
                <TableHead>ยา / ขนาด</TableHead>
                <TableHead align="center">สถานะ</TableHead>
                <TableHead>เหตุผล/หมายเหตุ</TableHead>
                <TableHead align="right">การทำเครื่องหมาย</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredAdmins.length === 0 ? (
                <TableEmpty colSpan={6}>ไม่มีรอบยาตามเงื่อนไข</TableEmpty>
              ) : (
                filteredAdmins.map((a) => {
                  const o = orderOf(a.medication_order_id);
                  return (
                    <TableRow key={a.id}>
                      <TableCell align="right" tabular>
                        {fmtTimeTH(a.scheduled_at)}
                      </TableCell>
                      <TableCell>{residentName(a.resident_id)}</TableCell>
                      <TableCell>
                        <span className="font-medium text-gray-900">{o?.drug_name ?? "—"}</span>
                        <span className="ml-1 text-gray-400">{o?.dosage}</span>
                      </TableCell>
                      <TableCell align="center">
                        <MedAdminStatusBadge status={a.status} />
                      </TableCell>
                      <TableCell wrap>
                        <span className="text-gray-500">{a.reason ?? "—"}</span>
                      </TableCell>
                      <TableCell align="right">
                        {a.status === "pending" && canAdminister ? (
                          <div className="flex justify-end gap-1.5">
                            <Button size="sm" onClick={() => markGiven(a.id)}>
                              ให้ยาแล้ว
                            </Button>
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => setActTarget({ id: a.id, status: "missed" })}
                            >
                              พลาด
                            </Button>
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => setActTarget({ id: a.id, status: "refused" })}
                            >
                              ปฏิเสธ
                            </Button>
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => setActTarget({ id: a.id, status: "held" })}
                            >
                              งด
                            </Button>
                          </div>
                        ) : (
                          <span className="text-xs text-gray-400">
                            {a.administered_at
                              ? fmtTimeTH(a.administered_at)
                              : a.status === "pending"
                                ? "เฉพาะเวรตน"
                                : "—"}
                          </span>
                        )}
                      </TableCell>
                    </TableRow>
                  );
                })
              )}
            </TableBody>
          </Table>
        </>
      ) : (
        <Table stickyHeader maxHeight="60vh">
          <TableHeader sticky>
            <TableRow>
              <TableHead>ผู้พัก</TableHead>
              <TableHead>ยา</TableHead>
              <TableHead>ขนาด / ทาง</TableHead>
              <TableHead>รอบ</TableHead>
              <TableHead>เวลา</TableHead>
              <TableHead align="center">สถานะ</TableHead>
              <TableHead>เริ่มใช้</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {orders.length === 0 ? (
              <TableEmpty colSpan={7}>ยังไม่มีรายการสั่งยา</TableEmpty>
            ) : (
              orders.map((o) => (
                <TableRow key={o.id}>
                  <TableCell>{residentName(o.resident_id)}</TableCell>
                  <TableCell>
                    <span className="font-medium text-gray-900">{o.drug_name}</span>
                  </TableCell>
                  <TableCell>
                    {o.dosage} · {o.route}
                  </TableCell>
                  <TableCell className="uppercase">{o.frequency}</TableCell>
                  <TableCell tabular>{o.schedule_times.join(", ") || "PRN"}</TableCell>
                  <TableCell align="center">
                    <MedActiveBadge active={o.is_active} />
                  </TableCell>
                  <TableCell>{fmtDateTH(o.start_date)}</TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      )}

      {/* dialog เปลี่ยนสถานะ + เหตุผล */}
      <Dialog
        open={!!actTarget}
        onOpenChange={(o) => {
          if (!o) {
            setActTarget(null);
            setActReason("");
          }
        }}
      >
        <DialogContent size="md">
          <DialogHeader>
            <DialogTitle>
              {actTarget?.status === "missed"
                ? "บันทึกการพลาดรอบยา"
                : actTarget?.status === "refused"
                  ? "บันทึกการปฏิเสธยา"
                  : "บันทึกการงดยา (hold)"}
            </DialogTitle>
          </DialogHeader>
          <DialogBody>
            <div className="space-y-3">
              <Label htmlFor="act-reason">เหตุผล *</Label>
              <Input
                id="act-reason"
                value={actReason}
                onChange={(e) => setActReason(e.target.value)}
                placeholder={
                  actTarget?.status === "held"
                    ? "เช่น HR ต่ำ — ตามคำสั่งแพทย์"
                    : "เช่น ผู้พักนอนหลับ / ปฏิเสธ"
                }
              />
              <p className="text-xs text-gray-400">เหตุผลจะถูกบันทึกใน eMAR และแจ้งพยาบาลวิชาชีพ</p>
            </div>
          </DialogBody>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setActTarget(null);
                setActReason("");
              }}
            >
              ยกเลิก
            </Button>
            <Button onClick={confirmAction}>บันทึก</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* dialog สั่งยาใหม่ */}
      <Dialog open={orderOpen} onOpenChange={setOrderOpen}>
        <DialogContent size="lg">
          <DialogHeader>
            <DialogTitle>สั่งยาใหม่</DialogTitle>
          </DialogHeader>
          <DialogBody>
            <div className="space-y-4">
              <div>
                <Label>ผู้พัก *</Label>
                <CustomSelect
                  className="mt-1"
                  value={orderForm.resident_id}
                  onChange={(v) => setOrderForm((f) => ({ ...f, resident_id: v }))}
                  options={residentOptions.filter((o) => o.value)}
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="o-drug">ชื่อยา *</Label>
                  <Input
                    id="o-drug"
                    className="mt-1"
                    value={orderForm.drug_name}
                    onChange={(e) => setOrderForm((f) => ({ ...f, drug_name: e.target.value }))}
                    placeholder="เช่น Amlodipine"
                  />
                </div>
                <div>
                  <Label htmlFor="o-dose">ขนาดยา *</Label>
                  <Input
                    id="o-dose"
                    className="mt-1"
                    value={orderForm.dosage}
                    onChange={(e) => setOrderForm((f) => ({ ...f, dosage: e.target.value }))}
                    placeholder="เช่น 5 mg"
                  />
                </div>
                <div>
                  <Label>ทางให้ยา</Label>
                  <CustomSelect
                    className="mt-1"
                    value={orderForm.route}
                    onChange={(v) => setOrderForm((f) => ({ ...f, route: v }))}
                    options={[
                      { value: "oral", label: "รับประทาน" },
                      { value: "injection", label: "ฉีด" },
                      { value: "topical", label: "ทา" },
                      { value: "inhalation", label: "พ่น/สูด" },
                      { value: "other", label: "อื่นๆ" },
                    ]}
                  />
                </div>
                <div>
                  <Label>ความถี่</Label>
                  <CustomSelect
                    className="mt-1"
                    value={orderForm.frequency}
                    onChange={(v) => setOrderForm((f) => ({ ...f, frequency: v }))}
                    options={[
                      { value: "od", label: "วันละครั้ง (OD)" },
                      { value: "bid", label: "วันละ 2 ครั้ง (BID)" },
                      { value: "tid", label: "วันละ 3 ครั้ง (TID)" },
                      { value: "qid", label: "วันละ 4 ครั้ง (QID)" },
                      { value: "prn", label: "เมื่อจำเป็น (PRN)" },
                    ]}
                  />
                </div>
                <div>
                  <Label htmlFor="o-time">เวลาให้ยา</Label>
                  <Input
                    id="o-time"
                    type="time"
                    className="mt-1"
                    value={orderForm.time}
                    onChange={(e) => setOrderForm((f) => ({ ...f, time: e.target.value }))}
                  />
                </div>
              </div>
              <div>
                <Label htmlFor="o-inst">คำแนะนำ</Label>
                <Input
                  id="o-inst"
                  className="mt-1"
                  value={orderForm.instructions}
                  onChange={(e) => setOrderForm((f) => ({ ...f, instructions: e.target.value }))}
                  placeholder="เช่น ทานพร้อมอาหาร"
                />
              </div>
            </div>
          </DialogBody>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOrderOpen(false)}>
              ยกเลิก
            </Button>
            <Button onClick={submitOrder}>บันทึกคำสั่งยา</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </NursingShell>
  );
}
