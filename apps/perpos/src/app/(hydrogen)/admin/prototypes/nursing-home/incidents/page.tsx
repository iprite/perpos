"use client";

// incidents/page.tsx — รายงานเหตุการณ์ + AI A3 (ช่วยร่างรายงาน) — prototype interactive
import React, { useMemo, useState } from "react";
import { AlertTriangle, Plus, Sparkles, ShieldCheck, ShieldAlert, FileText } from "lucide-react";
import {
  NursingShell,
  useNursingRole,
  IncidentSeverityBadge,
  IncidentStatusBadge,
  fmtDateTimeTH,
  fullName,
} from "../_components";
import { INCIDENT_REPORTS, RESIDENTS, STAFF, MOCK_INCIDENT_DRAFT_A3 } from "../_fixtures";
import type {
  IncidentReport,
  IncidentType,
  IncidentSeverity,
  IncidentStatus,
} from "../_fixtures/types";
import { Button } from "@/components/ui/button";
import { CustomSelect } from "@/components/ui/custom-select";
import { Input } from "@/components/ui/input";
import { ThaiDatePicker } from "@/components/ui/thai-date-picker";
import { Textarea } from "@/components/ui/textarea";
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
  TableLoading,
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

const TYPE_LABEL: Record<IncidentType, string> = {
  fall: "ลื่นล้ม",
  medication_error: "ความผิดพลาดด้านยา",
  injury: "บาดเจ็บ",
  behavioral: "พฤติกรรม",
  medical_emergency: "ภาวะฉุกเฉินทางการแพทย์",
  elopement: "ผู้พักหนีออก",
  other: "อื่น ๆ",
};
const TYPE_OPTIONS = (Object.keys(TYPE_LABEL) as IncidentType[]).map((v) => ({
  value: v,
  label: TYPE_LABEL[v],
}));
const SEVERITY_OPTIONS: { value: IncidentSeverity; label: string }[] = [
  { value: "low", label: "เล็กน้อย" },
  { value: "moderate", label: "ปานกลาง" },
  { value: "high", label: "รุนแรง" },
  { value: "critical", label: "วิกฤต" },
];
const STATUS_FLOW: IncidentStatus[] = ["open", "investigating", "resolved", "closed"];
const STATUS_LABEL: Record<IncidentStatus, string> = {
  open: "เปิด",
  investigating: "กำลังสืบสวน",
  resolved: "แก้ไขแล้ว",
  closed: "ปิดเคส",
};

function residentName(id?: string | null): string {
  if (!id) return "— ไม่ผูกผู้พัก —";
  const r = RESIDENTS.find((x) => x.id === id);
  return r ? fullName(r) : id;
}
function staffName(id?: string | null): string {
  if (!id) return "—";
  const s = STAFF.find((x) => x.id === id);
  return s ? `${s.first_name} ${s.last_name}` : id;
}

const blankForm = {
  resident_id: "",
  incident_type: "fall" as IncidentType,
  severity: "moderate" as IncidentSeverity,
  location: "",
  occurred_at: "",
  raw: "",
  description: "",
  action_taken: "",
  follow_up: "",
};

export default function IncidentsPage() {
  const { can } = useNursingRole();
  const canWrite = can("write", "incident_reports");
  const canApprove = can("approve", "incident_reports");

  const [rows, setRows] = useState<IncidentReport[]>(INCIDENT_REPORTS);
  const [loading] = useState(false);
  const [fSeverity, setFSeverity] = useState("");
  const [fStatus, setFStatus] = useState("");

  const [open, setOpen] = useState(false);
  const [form, setForm] = useState(blankForm);
  const [aiUsed, setAiUsed] = useState(false);
  const [aiLoading, setAiLoading] = useState(false);

  const filtered = useMemo(
    () =>
      rows
        .filter((r) => (fSeverity ? r.severity === fSeverity : true))
        .filter((r) => (fStatus ? r.status === fStatus : true))
        .sort((a, b) => (a.occurred_at < b.occurred_at ? 1 : -1)),
    [rows, fSeverity, fStatus],
  );

  const openCount = useMemo(() => rows.filter((r) => r.status === "open").length, [rows]);
  const criticalCount = useMemo(
    () =>
      rows.filter(
        (r) => (r.severity === "critical" || r.severity === "high") && r.status !== "closed",
      ).length,
    [rows],
  );

  const residentOptions = useMemo(
    () => [
      { value: "", label: "— ไม่ผูกผู้พัก —" },
      ...RESIDENTS.filter((r) => r.status === "active").map((r) => ({
        value: r.id,
        label: fullName(r),
      })),
    ],
    [],
  );

  const formSeverityHigh = form.severity === "critical" || form.severity === "high";

  function resetAndClose() {
    setOpen(false);
    setForm(blankForm);
    setAiUsed(false);
    setAiLoading(false);
  }

  function runAi() {
    if (!form.raw.trim()) return notify.error("กรุณาพิมพ์สรุปเหตุการณ์สั้น ๆ ก่อนให้ AI ช่วยร่าง");
    setAiLoading(true);
    setTimeout(() => {
      const d = MOCK_INCIDENT_DRAFT_A3;
      setForm((f) => ({
        ...f,
        incident_type: d.incident_type as IncidentType,
        severity: d.severity_suggestion,
        description: d.description,
        action_taken: d.action_taken,
        follow_up: d.follow_up,
      }));
      setAiUsed(true);
      setAiLoading(false);
      notify.info(
        `AI ร่างรายงานเสร็จ (ความเชื่อมั่น ${Math.round(d.confidence * 100)}%) — โปรดตรวจทานก่อนบันทึก`,
      );
    }, 1400);
  }

  function submit() {
    if (!form.description.trim()) return notify.error("กรุณากรอกคำอธิบายเหตุการณ์");
    const now = new Date().toISOString();
    const next: IncidentReport = {
      id: `inc-${Date.now()}`,
      resident_id: form.resident_id || null,
      incident_type: form.incident_type,
      severity: form.severity,
      status: "open",
      occurred_at: form.occurred_at ? `${form.occurred_at}T00:00:00Z` : now,
      location: form.location || null,
      reported_by: "stf-004",
      description: form.description,
      action_taken: form.action_taken || null,
      follow_up: form.follow_up || null,
      resolved_at: null,
      created_at: now,
    };
    setRows((p) => [next, ...p]);
    resetAndClose();
    notify.created('แจ้งเหตุการณ์แล้ว — สถานะ "เปิด"');
    if (next.severity === "critical" || next.severity === "high") {
      notify.error("เหตุการณ์ระดับรุนแรง — ระบบแจ้งเตือนหัวหน้าเวรทันที");
    }
  }

  function changeStatus(id: string, status: IncidentStatus) {
    setRows((p) =>
      p.map((r) =>
        r.id === id
          ? {
              ...r,
              status,
              resolved_at:
                status === "resolved" || status === "closed"
                  ? new Date().toISOString()
                  : r.resolved_at,
            }
          : r,
      ),
    );
    notify.success(`เปลี่ยนสถานะเป็น "${STATUS_LABEL[status]}" แล้ว`);
  }

  return (
    <NursingShell
      title="รายงานเหตุการณ์"
      description="บันทึก ติดตาม และปิดเคสเหตุการณ์ไม่พึงประสงค์ พร้อมผู้ช่วย AI ช่วยร่างรายงาน"
      icon={<AlertTriangle className="h-6 w-6" />}
      actions={
        canWrite ? (
          <Button onClick={() => setOpen(true)}>
            <Plus className="mr-1.5 h-4 w-4" /> แจ้งเหตุการณ์ใหม่
          </Button>
        ) : undefined
      }
    >
      {/* KPI */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <StatCard
          icon={<FileText className="h-4 w-4" />}
          label="ทั้งหมด"
          value={rows.length}
          sub="รายการ"
          tone="info"
        />
        <StatCard
          icon={<AlertTriangle className="h-4 w-4" />}
          label="เปิดอยู่ (รอจัดการ)"
          value={openCount}
          sub="ยังไม่เริ่มสืบสวน"
          tone={openCount > 0 ? "warning" : "positive"}
          valueColored
        />
        <StatCard
          icon={<ShieldAlert className="h-4 w-4" />}
          label="รุนแรง/วิกฤต ที่ยังไม่ปิด"
          value={criticalCount}
          sub="ต้องติดตามใกล้ชิด"
          tone={criticalCount > 0 ? "negative" : "positive"}
          valueColored
        />
      </div>

      {/* banner เตือนเคสรุนแรงค้าง */}
      {criticalCount > 0 && (
        <div className="flex items-start gap-3 rounded-xl border border-red-200 bg-red-50 p-4">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-red-100 text-red-600">
            <ShieldAlert className="h-5 w-5" />
          </span>
          <div>
            <p className="text-sm font-semibold text-red-700">
              มีเหตุการณ์ระดับรุนแรง/วิกฤตที่ยังไม่ปิดเคส {criticalCount} รายการ
            </p>
            <p className="mt-0.5 text-xs text-red-600">
              โปรดแจ้งหัวหน้าเวรทันที และติดตามจนกว่าจะปิดเคส
            </p>
          </div>
        </div>
      )}

      {/* filter */}
      <div className="flex flex-wrap items-center gap-2">
        <CustomSelect
          value={fSeverity}
          onChange={setFSeverity}
          options={[{ value: "", label: "ทุกระดับความรุนแรง" }, ...SEVERITY_OPTIONS]}
          className="w-52"
        />
        <CustomSelect
          value={fStatus}
          onChange={setFStatus}
          options={[
            { value: "", label: "ทุกสถานะ" },
            ...STATUS_FLOW.map((s) => ({ value: s, label: STATUS_LABEL[s] })),
          ]}
          className="w-44"
        />
      </div>

      {/* table */}
      <Table stickyHeader maxHeight="60vh">
        <TableHeader sticky>
          <TableRow>
            <TableHead>เวลาเกิดเหตุ</TableHead>
            <TableHead>ผู้พัก</TableHead>
            <TableHead>ประเภท</TableHead>
            <TableHead align="center">ความรุนแรง</TableHead>
            <TableHead align="center">สถานะ</TableHead>
            <TableHead>ผู้รายงาน</TableHead>
            {canWrite && <TableHead align="right">เปลี่ยนสถานะ</TableHead>}
          </TableRow>
        </TableHeader>
        <TableBody>
          {loading ? (
            <TableLoading colSpan={canWrite ? 7 : 6} />
          ) : filtered.length === 0 ? (
            <TableEmpty colSpan={canWrite ? 7 : 6}>ยังไม่มีรายงานเหตุการณ์ตามเงื่อนไข</TableEmpty>
          ) : (
            filtered.map((r) => (
              <TableRow key={r.id}>
                <TableCell>{fmtDateTimeTH(r.occurred_at)}</TableCell>
                <TableCell>{residentName(r.resident_id)}</TableCell>
                <TableCell>{TYPE_LABEL[r.incident_type]}</TableCell>
                <TableCell align="center">
                  <IncidentSeverityBadge severity={r.severity} />
                </TableCell>
                <TableCell align="center">
                  <IncidentStatusBadge status={r.status} />
                </TableCell>
                <TableCell>{staffName(r.reported_by)}</TableCell>
                {canWrite && (
                  <TableCell align="right">
                    <CustomSelect
                      value={r.status}
                      onChange={(v) => changeStatus(r.id, v as IncidentStatus)}
                      options={STATUS_FLOW.filter(
                        (s) => canApprove || (s !== "resolved" && s !== "closed") || s === r.status,
                      ).map((s) => ({ value: s, label: STATUS_LABEL[s] }))}
                      className="w-36"
                    />
                  </TableCell>
                )}
              </TableRow>
            ))
          )}
        </TableBody>
      </Table>

      {/* dialog แจ้งเหตุการณ์ใหม่ */}
      <Dialog open={open} onOpenChange={(o) => (o ? setOpen(true) : resetAndClose())}>
        <DialogContent size="xl">
          <DialogHeader>
            <DialogTitle>แจ้งเหตุการณ์ใหม่</DialogTitle>
          </DialogHeader>
          <DialogBody>
            <div className="space-y-4">
              {/* AI A3 — ช่วยร่าง */}
              <div className="rounded-xl border border-amber-200 bg-amber-50/60 p-3">
                <div className="flex items-center gap-2">
                  <Sparkles className="h-4 w-4 text-amber-600" />
                  <p className="text-sm font-semibold text-gray-900">ผู้ช่วย AI — ช่วยร่างรายงาน</p>
                </div>
                <p className="mt-1 text-xs text-gray-600">
                  พิมพ์สรุปสั้น ๆ ด้วยภาษาพูด แล้วให้ AI เรียบเรียงเป็นรายงาน
                  (คำอธิบาย/การจัดการ/ติดตามผล) + แนะนำระดับความรุนแรง
                </p>
                <Textarea
                  className="mt-2"
                  rows={2}
                  value={form.raw}
                  onChange={(e) => setForm((f) => ({ ...f, raw: e.target.value }))}
                  placeholder="เช่น ลุงศักดิ์ล้มในห้องน้ำตีห้าครึ่ง สะโพกเจ็บ เดินได้"
                />
                <div className="mt-2 flex justify-end">
                  <Button variant="outline" size="sm" onClick={runAi} disabled={aiLoading}>
                    {aiLoading ? (
                      "กำลังร่าง…"
                    ) : (
                      <>
                        <Sparkles className="mr-1.5 h-4 w-4" /> ให้ AI ช่วยร่าง
                      </>
                    )}
                  </Button>
                </div>
                {aiUsed && !aiLoading && (
                  <div className="mt-2 flex flex-wrap items-center gap-2 rounded-lg bg-white px-2.5 py-1.5">
                    <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-700">
                      <ShieldCheck className="h-3.5 w-3.5" /> ฉบับร่าง AI — ตรวจก่อนบันทึก
                    </span>
                    <span className="text-xs text-gray-400">แก้ไขข้อความด้านล่างได้ตามจริง</span>
                  </div>
                )}
              </div>

              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div>
                  <Label htmlFor="i-res">ผู้พัก</Label>
                  <CustomSelect
                    value={form.resident_id}
                    onChange={(v) => setForm((f) => ({ ...f, resident_id: v }))}
                    options={residentOptions}
                    className="mt-1"
                  />
                </div>
                <div>
                  <Label htmlFor="i-type">ประเภทเหตุการณ์ *</Label>
                  <CustomSelect
                    value={form.incident_type}
                    onChange={(v) => setForm((f) => ({ ...f, incident_type: v as IncidentType }))}
                    options={TYPE_OPTIONS}
                    className="mt-1"
                  />
                </div>
                <div>
                  <Label htmlFor="i-sev">ความรุนแรง *</Label>
                  <CustomSelect
                    value={form.severity}
                    onChange={(v) => setForm((f) => ({ ...f, severity: v as IncidentSeverity }))}
                    options={SEVERITY_OPTIONS}
                    className="mt-1"
                  />
                </div>
                <div>
                  <Label htmlFor="i-loc">สถานที่</Label>
                  <Input
                    id="i-loc"
                    className="mt-1"
                    value={form.location}
                    onChange={(e) => setForm((f) => ({ ...f, location: e.target.value }))}
                    placeholder="เช่น ห้องน้ำ ห้อง 104"
                  />
                </div>
                <div>
                  <Label htmlFor="i-when">วันที่เกิดเหตุ</Label>
                  <ThaiDatePicker
                    className="mt-1"
                    value={form.occurred_at}
                    onChange={(iso) => setForm((f) => ({ ...f, occurred_at: iso }))}
                    placeholder="เลือกวันที่"
                  />
                </div>
              </div>

              {formSeverityHigh && (
                <div className="flex items-center gap-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2">
                  <ShieldAlert className="h-4 w-4 shrink-0 text-red-600" />
                  <p className="text-xs font-medium text-red-700">
                    ระดับรุนแรง/วิกฤต — ต้องแจ้งหัวหน้าเวรทันทีหลังบันทึก
                  </p>
                </div>
              )}

              <div>
                <Label htmlFor="i-desc">คำอธิบายเหตุการณ์ *</Label>
                <Textarea
                  id="i-desc"
                  className="mt-1"
                  rows={3}
                  value={form.description}
                  onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
                  placeholder="รายละเอียดสิ่งที่เกิดขึ้น"
                />
              </div>
              <div>
                <Label htmlFor="i-act">การจัดการเบื้องต้น</Label>
                <Textarea
                  id="i-act"
                  className="mt-1"
                  rows={2}
                  value={form.action_taken}
                  onChange={(e) => setForm((f) => ({ ...f, action_taken: e.target.value }))}
                  placeholder="สิ่งที่ดำเนินการแล้ว"
                />
              </div>
              <div>
                <Label htmlFor="i-follow">แผนติดตามผล</Label>
                <Textarea
                  id="i-follow"
                  className="mt-1"
                  rows={2}
                  value={form.follow_up}
                  onChange={(e) => setForm((f) => ({ ...f, follow_up: e.target.value }))}
                  placeholder="ขั้นตอนถัดไป / การติดตาม"
                />
              </div>
            </div>
          </DialogBody>
          <DialogFooter>
            <Button variant="outline" onClick={resetAndClose}>
              ยกเลิก
            </Button>
            <Button onClick={submit}>บันทึกรายงาน</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </NursingShell>
  );
}
