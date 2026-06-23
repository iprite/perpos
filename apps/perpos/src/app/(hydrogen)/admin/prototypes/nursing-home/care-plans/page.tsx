"use client";

// care-plans/page.tsx — แผนการดูแล + รายการกิจกรรม (ติ๊กเสร็จ) — prototype interactive
import React, { useMemo, useState } from "react";
import { ClipboardList, Plus, Target, CheckCircle2, Circle, ChevronRight } from "lucide-react";
import {
  NursingShell,
  useNursingRole,
  CarePlanStatusBadge,
  fmtDateTH,
  fullName,
} from "../_components";
import { CARE_PLANS, CARE_PLAN_ITEMS, RESIDENTS } from "../_fixtures";
import type { CarePlan, CarePlanItem, CarePlanStatus } from "../_fixtures/types";
import { Button } from "@/components/ui/button";
import { CustomSelect } from "@/components/ui/custom-select";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { StatCard } from "@/components/ui/stat-card";
import { ThaiDatePicker } from "@/components/ui/thai-date-picker";
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

const STATUS_OPTIONS: { value: CarePlanStatus; label: string }[] = [
  { value: "draft", label: "ฉบับร่าง" },
  { value: "active", label: "ใช้งาน" },
  { value: "on_hold", label: "พักไว้" },
  { value: "completed", label: "เสร็จสิ้น" },
];

const blankForm = {
  resident_id: "res-001",
  title: "",
  goal: "",
  status: "active" as CarePlanStatus,
  start_date: "",
  review_date: "",
};

export default function CarePlansPage() {
  const { can } = useNursingRole();
  const canWrite = can("write", "care_plans");
  const canApprove = can("approve", "care_plans");

  const [plans, setPlans] = useState<CarePlan[]>(CARE_PLANS);
  const [items, setItems] = useState<CarePlanItem[]>(CARE_PLAN_ITEMS);
  const [fResident, setFResident] = useState("");
  const [fStatus, setFStatus] = useState("");

  const [detail, setDetail] = useState<CarePlan | null>(null);
  const [editOpen, setEditOpen] = useState(false);
  const [editing, setEditing] = useState<CarePlan | null>(null);
  const [form, setForm] = useState(blankForm);

  const filtered = useMemo(() => {
    return plans
      .filter((p) => (fResident ? p.resident_id === fResident : true))
      .filter((p) => (fStatus ? p.status === fStatus : true))
      .sort((a, b) => (a.created_at! < b.created_at! ? 1 : -1));
  }, [plans, fResident, fStatus]);

  const activeCount = plans.filter((p) => p.status === "active").length;
  const itemsDone = items.filter((i) => i.is_done).length;

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

  function planItems(planId: string) {
    return items.filter((i) => i.care_plan_id === planId);
  }

  function toggleItem(itemId: string) {
    setItems((p) => p.map((i) => (i.id === itemId ? { ...i, is_done: !i.is_done } : i)));
  }

  function openCreate() {
    setEditing(null);
    setForm(blankForm);
    setEditOpen(true);
  }
  function openEdit(p: CarePlan) {
    setEditing(p);
    setForm({
      resident_id: p.resident_id,
      title: p.title,
      goal: p.goal,
      status: p.status,
      start_date: p.start_date,
      review_date: p.review_date ?? "",
    });
    setEditOpen(true);
  }

  function submit() {
    if (!form.title.trim() || !form.goal.trim()) return notify.error("กรอกชื่อแผนและเป้าหมาย");
    if (editing) {
      setPlans((p) =>
        p.map((x) =>
          x.id === editing.id ? { ...x, ...form, review_date: form.review_date || null } : x,
        ),
      );
      setDetail((d) =>
        d && d.id === editing.id ? { ...d, ...form, review_date: form.review_date || null } : d,
      );
      notify.updated("แก้ไขแผนการดูแลแล้ว");
    } else {
      const now = new Date().toISOString();
      const next: CarePlan = {
        id: `cp-${Date.now()}`,
        ...form,
        start_date: form.start_date || now.slice(0, 10),
        review_date: form.review_date || null,
        created_by: "stf-002",
        note: null,
        created_at: now,
      };
      setPlans((p) => [next, ...p]);
      notify.created("สร้างแผนการดูแลแล้ว");
    }
    setEditOpen(false);
  }

  function changeStatus(planId: string, status: CarePlanStatus) {
    setPlans((p) => p.map((x) => (x.id === planId ? { ...x, status } : x)));
    setDetail((d) => (d && d.id === planId ? { ...d, status } : d));
    notify.updated(`เปลี่ยนสถานะเป็น "${STATUS_OPTIONS.find((s) => s.value === status)?.label}"`);
  }

  const detailItems = detail ? planItems(detail.id) : [];

  return (
    <NursingShell
      title="แผนการดูแล"
      description="กำหนดเป้าหมายและกิจกรรมการดูแลรายบุคคล ติดตามความคืบหน้า"
      icon={<ClipboardList className="h-6 w-6" />}
      actions={
        canWrite ? (
          <Button onClick={openCreate}>
            <Plus className="mr-1.5 h-4 w-4" /> สร้างแผน
          </Button>
        ) : undefined
      }
    >
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <StatCard
          icon={<ClipboardList className="h-4 w-4" />}
          label="แผนทั้งหมด"
          value={plans.length}
          tone="info"
        />
        <StatCard
          icon={<Target className="h-4 w-4" />}
          label="กำลังใช้งาน"
          value={activeCount}
          tone="positive"
          valueColored
        />
        <StatCard
          icon={<CheckCircle2 className="h-4 w-4" />}
          label="กิจกรรมเสร็จแล้ว"
          value={`${itemsDone}/${items.length}`}
          tone="primary"
        />
      </div>

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
          options={[{ value: "", label: "ทุกสถานะ" }, ...STATUS_OPTIONS]}
          className="w-40"
        />
      </div>

      <Table stickyHeader maxHeight="60vh">
        <TableHeader sticky>
          <TableRow>
            <TableHead>ผู้พัก</TableHead>
            <TableHead>แผน / เป้าหมาย</TableHead>
            <TableHead align="center">กิจกรรม</TableHead>
            <TableHead align="center">สถานะ</TableHead>
            <TableHead>ทบทวนถัดไป</TableHead>
            <TableHead align="right"></TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {filtered.length === 0 ? (
            <TableEmpty colSpan={6}>ยังไม่มีแผนการดูแลตามเงื่อนไข</TableEmpty>
          ) : (
            filtered.map((p) => {
              const its = planItems(p.id);
              const done = its.filter((i) => i.is_done).length;
              return (
                <TableRow key={p.id} clickable onClick={() => setDetail(p)}>
                  <TableCell>{residentName(p.resident_id)}</TableCell>
                  <TableCell wrap>
                    <span className="font-medium text-gray-900">{p.title}</span>
                    <div className="text-xs text-gray-400">{p.goal}</div>
                  </TableCell>
                  <TableCell align="center" tabular>
                    {its.length ? `${done}/${its.length}` : "—"}
                  </TableCell>
                  <TableCell align="center">
                    <CarePlanStatusBadge status={p.status} />
                  </TableCell>
                  <TableCell>{fmtDateTH(p.review_date)}</TableCell>
                  <TableCell align="right">
                    <ChevronRight className="ml-auto h-4 w-4 text-gray-300" />
                  </TableCell>
                </TableRow>
              );
            })
          )}
        </TableBody>
      </Table>

      {/* detail dialog */}
      <Dialog open={!!detail} onOpenChange={(o) => !o && setDetail(null)}>
        <DialogContent size="xl">
          <DialogHeader>
            <DialogTitle>{detail?.title}</DialogTitle>
          </DialogHeader>
          <DialogBody>
            {detail && (
              <div className="space-y-4">
                <div className="flex flex-wrap items-center gap-2">
                  <CarePlanStatusBadge status={detail.status} />
                  <span className="text-sm text-gray-500">{residentName(detail.resident_id)}</span>
                </div>
                <div className="rounded-lg bg-gray-50 p-3">
                  <p className="text-xs font-medium text-gray-500">เป้าหมาย</p>
                  <p className="mt-0.5 text-sm text-gray-800">{detail.goal}</p>
                </div>
                <div className="grid grid-cols-2 gap-3 text-sm">
                  <div>
                    <span className="text-gray-400">เริ่ม: </span>
                    {fmtDateTH(detail.start_date)}
                  </div>
                  <div>
                    <span className="text-gray-400">ทบทวน: </span>
                    {fmtDateTH(detail.review_date) || "—"}
                  </div>
                </div>

                <div>
                  <p className="mb-2 text-sm font-medium text-gray-900">กิจกรรมในแผน</p>
                  {detailItems.length === 0 ? (
                    <p className="text-sm text-gray-400">ยังไม่มีกิจกรรม</p>
                  ) : (
                    <ul className="space-y-1.5">
                      {detailItems.map((it) => (
                        <li key={it.id}>
                          <Button
                            variant="ghost"
                            onClick={() => toggleItem(it.id)}
                            disabled={!canWrite}
                            className="h-auto w-full items-start justify-start gap-2.5 whitespace-normal rounded-lg border border-gray-200 p-2.5 text-left font-normal hover:bg-gray-50"
                          >
                            {it.is_done ? (
                              <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-green-600" />
                            ) : (
                              <Circle className="mt-0.5 h-4 w-4 shrink-0 text-gray-300" />
                            )}
                            <span className="min-w-0">
                              <span
                                className={`text-sm ${it.is_done ? "text-gray-400 line-through" : "text-gray-800"}`}
                              >
                                {it.description}
                              </span>
                              <span className="ml-2 text-xs text-gray-400">{it.frequency}</span>
                            </span>
                          </Button>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>

                {canApprove && (
                  <div>
                    <p className="mb-1.5 text-xs font-medium text-gray-500">เปลี่ยนสถานะแผน</p>
                    <div className="flex flex-wrap gap-1.5">
                      {STATUS_OPTIONS.map((s) => (
                        <Button
                          key={s.value}
                          size="sm"
                          variant={detail.status === s.value ? "secondary" : "outline"}
                          onClick={() => changeStatus(detail.id, s.value)}
                        >
                          {s.label}
                        </Button>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}
          </DialogBody>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDetail(null)}>
              ปิด
            </Button>
            {canWrite && detail && (
              <Button
                onClick={() => {
                  openEdit(detail);
                }}
              >
                แก้ไขแผน
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* create/edit dialog */}
      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent size="lg">
          <DialogHeader>
            <DialogTitle>{editing ? "แก้ไขแผนการดูแล" : "สร้างแผนการดูแล"}</DialogTitle>
          </DialogHeader>
          <DialogBody>
            <div className="space-y-4">
              <div>
                <Label>ผู้พัก *</Label>
                <CustomSelect
                  className="mt-1"
                  value={form.resident_id}
                  onChange={(v) => setForm((f) => ({ ...f, resident_id: v }))}
                  options={residentOptions.filter((o) => o.value)}
                />
              </div>
              <div>
                <Label htmlFor="cp-title">ชื่อแผน *</Label>
                <Input
                  id="cp-title"
                  className="mt-1"
                  value={form.title}
                  onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
                  placeholder="เช่น แผนดูแลความดันโลหิตสูง"
                />
              </div>
              <div>
                <Label htmlFor="cp-goal">เป้าหมาย *</Label>
                <Input
                  id="cp-goal"
                  className="mt-1"
                  value={form.goal}
                  onChange={(e) => setForm((f) => ({ ...f, goal: e.target.value }))}
                  placeholder="เช่น ควบคุม SBP < 150 mmHg"
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label>วันที่เริ่ม</Label>
                  <ThaiDatePicker
                    value={form.start_date}
                    onChange={(iso) => setForm((f) => ({ ...f, start_date: iso }))}
                    placeholder="เลือกวันที่"
                  />
                </div>
                <div>
                  <Label>วันทบทวน</Label>
                  <ThaiDatePicker
                    value={form.review_date}
                    onChange={(iso) => setForm((f) => ({ ...f, review_date: iso }))}
                    placeholder="เลือกวันที่"
                  />
                </div>
              </div>
              <div>
                <Label>สถานะ</Label>
                <CustomSelect
                  className="mt-1"
                  value={form.status}
                  onChange={(v) => setForm((f) => ({ ...f, status: v as CarePlanStatus }))}
                  options={STATUS_OPTIONS}
                />
              </div>
            </div>
          </DialogBody>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditOpen(false)}>
              ยกเลิก
            </Button>
            <Button onClick={submit}>{editing ? "บันทึกการแก้ไข" : "สร้างแผน"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </NursingShell>
  );
}
