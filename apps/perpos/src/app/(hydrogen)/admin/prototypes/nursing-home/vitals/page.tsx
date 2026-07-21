"use client";

// vitals/page.tsx — บันทึก/ดูสัญญาณชีพ + AI A1 (วิเคราะห์แนวโน้ม) — prototype interactive
import React, { useMemo, useState } from "react";
import { HeartPulse, Plus, Activity, Sparkles, ShieldCheck, TrendingUp } from "lucide-react";
import {
  NursingShell,
  useNursingRole,
  VitalFlagBadge,
  fmtDateTimeTH,
  fullName,
} from "../_components";
import { VITAL_SIGNS, RESIDENTS, STAFF, MOCK_VITAL_INSIGHT_A1 } from "../_fixtures";
import type { VitalSign, VitalFlag } from "../_fixtures/types";
import { Button } from "@/components/ui/button";
import { CustomSelect } from "@/components/ui/custom-select";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { StatCard } from "@/components/ui/stat-card";
import { Sparkline } from "@/components/ui/sparkline";
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

const TODAY = "2026-06-22";

function residentName(id: string): string {
  const r = RESIDENTS.find((x) => x.id === id);
  return r ? fullName(r) : id;
}
function staffName(id?: string | null): string {
  if (!id) return "—";
  const s = STAFF.find((x) => x.id === id);
  return s ? `${s.first_name} ${s.last_name}` : id;
}

/** rule-based flag จากค่าที่กรอก (จำลอง logic ก่อนเข้า AI) */
function computeFlag(v: {
  systolic?: number | null;
  diastolic?: number | null;
  pulse?: number | null;
  temperature?: number | null;
  spo2?: number | null;
}): VitalFlag {
  const sbp = v.systolic ?? 0;
  const spo2 = v.spo2 ?? 100;
  const temp = v.temperature ?? 36.5;
  const pulse = v.pulse ?? 70;
  if (sbp >= 180 || sbp <= 90 || spo2 < 94 || temp >= 38 || pulse > 120 || pulse < 50)
    return "abnormal";
  if (sbp >= 160 || spo2 < 96 || temp >= 37.5 || pulse > 100) return "watch";
  return "normal";
}

const blankForm = {
  resident_id: "res-001",
  systolic: "",
  diastolic: "",
  pulse: "",
  temperature: "",
  spo2: "",
  respiratory_rate: "",
  blood_glucose: "",
  weight: "",
  note: "",
};

export default function VitalsPage() {
  const { can } = useNursingRole();
  const canWrite = can("write", "vital_signs");

  const [rows, setRows] = useState<VitalSign[]>(VITAL_SIGNS);
  const [loading] = useState(false);
  const [fResident, setFResident] = useState("");
  const [fFlag, setFFlag] = useState("");
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState(blankForm);

  // AI A1 state
  const [aiLoading, setAiLoading] = useState(false);
  const [aiResult, setAiResult] = useState<typeof MOCK_VITAL_INSIGHT_A1 | null>(null);

  const filtered = useMemo(() => {
    return rows
      .filter((r) => (fResident ? r.resident_id === fResident : true))
      .filter((r) => (fFlag ? r.flag === fFlag : true))
      .sort((a, b) => (a.measured_at < b.measured_at ? 1 : -1));
  }, [rows, fResident, fFlag]);

  const todayAbnormal = useMemo(
    () => rows.filter((r) => r.measured_at.startsWith(TODAY) && r.flag !== "normal").length,
    [rows],
  );
  const todayCount = useMemo(
    () => rows.filter((r) => r.measured_at.startsWith(TODAY)).length,
    [rows],
  );

  // sparkline ความดัน res-001 (เก่า→ใหม่)
  const bpTrend = useMemo(
    () =>
      rows
        .filter((r) => r.resident_id === "res-001" && r.systolic != null)
        .sort((a, b) => (a.measured_at < b.measured_at ? -1 : 1))
        .map((r) => r.systolic as number),
    [rows],
  );

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

  function submit() {
    const num = (s: string) => (s.trim() === "" ? null : Number(s));
    if (!form.resident_id) return notify.error("กรุณาเลือกผู้พัก");
    const flag = computeFlag({
      systolic: num(form.systolic),
      diastolic: num(form.diastolic),
      pulse: num(form.pulse),
      temperature: num(form.temperature),
      spo2: num(form.spo2),
    });
    const now = new Date().toISOString();
    const next: VitalSign = {
      id: `vs-${Date.now()}`,
      resident_id: form.resident_id,
      measured_at: now,
      recorded_by: "stf-003",
      systolic: num(form.systolic),
      diastolic: num(form.diastolic),
      pulse: num(form.pulse),
      temperature: num(form.temperature),
      spo2: num(form.spo2),
      respiratory_rate: num(form.respiratory_rate),
      blood_glucose: num(form.blood_glucose),
      weight: num(form.weight),
      flag,
      note: form.note || null,
      created_at: now,
    };
    setRows((p) => [next, ...p]);
    setOpen(false);
    setForm(blankForm);
    notify.created(
      flag === "normal"
        ? "บันทึกสัญญาณชีพแล้ว (ปกติ)"
        : `บันทึกแล้ว — ระบบตั้งสถานะ "${flag === "watch" ? "เฝ้าระวัง" : "ผิดปกติ"}"`,
    );
  }

  function runAi() {
    setAiLoading(true);
    setAiResult(null);
    setTimeout(() => {
      setAiResult(MOCK_VITAL_INSIGHT_A1);
      setAiLoading(false);
      notify.info("AI วิเคราะห์แนวโน้มเสร็จแล้ว — โปรดให้พยาบาลตรวจทาน");
    }, 1400);
  }

  return (
    <NursingShell
      title="สัญญาณชีพ"
      description="บันทึกและติดตามสัญญาณชีพผู้พักอาศัย พร้อมการเตือนความเสี่ยงด้วย AI"
      icon={<HeartPulse className="h-6 w-6" />}
      actions={
        canWrite ? (
          <Button onClick={() => setOpen(true)}>
            <Plus className="mr-1.5 h-4 w-4" /> เพิ่มสัญญาณชีพ
          </Button>
        ) : undefined
      }
    >
      {/* KPI */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <StatCard
          icon={<Activity className="h-4 w-4" />}
          label="วัดวันนี้"
          value={todayCount}
          sub="รายการ"
          tone="info"
        />
        <StatCard
          icon={<HeartPulse className="h-4 w-4" />}
          label="ผิดปกติ/เฝ้าระวังวันนี้"
          value={todayAbnormal}
          sub="ต้องติดตามใกล้ชิด"
          tone={todayAbnormal > 0 ? "warning" : "positive"}
          valueColored
        />
        <StatCard
          icon={<TrendingUp className="h-4 w-4" />}
          label={`ความดัน ${residentName("res-001")} (3 วัน)`}
          value={bpTrend.length ? `${bpTrend[bpTrend.length - 1]} mmHg` : "—"}
          sub="แนวโน้มไต่ขึ้น — ดู AI ด้านล่าง"
          tone="negative"
          spark={bpTrend}
        />
      </div>

      {/* AI A1 card — โชว์เมื่อมี res-001 abnormal/watch */}
      <div className="rounded-xl border border-amber-200 bg-amber-50/60 p-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div className="flex items-start gap-3">
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-amber-100 text-amber-600">
              <Sparkles className="h-5 w-5" />
            </span>
            <div className="min-w-0">
              <p className="text-sm font-semibold text-gray-900">
                ผู้ช่วย AI — วิเคราะห์แนวโน้มสัญญาณชีพ
              </p>
              <p className="mt-0.5 text-xs text-gray-600">
                คุณสมจิตร พันธุ์ดี มีความดันไต่ขึ้นต่อเนื่อง 3 วัน (สถานะผิดปกติ) — ให้ AI
                ช่วยประเมินความเสี่ยง
              </p>
            </div>
          </div>
          <Button variant="outline" onClick={runAi} disabled={aiLoading} className="shrink-0">
            {aiLoading ? (
              "กำลังวิเคราะห์…"
            ) : (
              <>
                <Sparkles className="mr-1.5 h-4 w-4" /> วิเคราะห์แนวโน้ม (AI)
              </>
            )}
          </Button>
        </div>

        {aiLoading && (
          <div className="mt-3 animate-pulse space-y-2">
            <div className="h-4 w-3/4 rounded bg-amber-100" />
            <div className="h-4 w-full rounded bg-amber-100" />
            <div className="h-4 w-2/3 rounded bg-amber-100" />
          </div>
        )}

        {aiResult && !aiLoading && (
          <div className="mt-3 space-y-3 rounded-lg border border-amber-200 bg-white p-4">
            <div className="flex flex-wrap items-center gap-2">
              <VitalFlagBadge flag={aiResult.flag} />
              <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2.5 py-0.5 text-xs font-medium text-amber-700">
                <ShieldCheck className="h-3.5 w-3.5" /> ต้องให้พยาบาลยืนยัน
              </span>
              <span className="text-xs text-gray-400">
                ความเชื่อมั่น {Math.round(aiResult.confidence * 100)}%
              </span>
            </div>
            <div>
              <p className="text-xs font-medium text-gray-500">สาเหตุ/การประเมิน</p>
              <p className="mt-0.5 text-sm text-gray-700">{aiResult.reason}</p>
            </div>
            <div>
              <p className="text-xs font-medium text-gray-500">ข้อเสนอแนะ</p>
              <p className="mt-0.5 text-sm text-gray-700">{aiResult.suggestion}</p>
            </div>
            <div className="rounded-lg bg-red-50 p-2.5">
              <p className="text-xs font-medium text-red-700">แนวโน้ม</p>
              <p className="mt-0.5 text-sm text-red-700">{aiResult.trend_note}</p>
            </div>
            <div className="flex justify-end gap-2 pt-1">
              <Button variant="outline" size="sm" onClick={() => setAiResult(null)}>
                ปิด
              </Button>
              <Button
                size="sm"
                onClick={() => {
                  notify.success("ยืนยันโดยพยาบาล — แจ้งแพทย์แล้ว");
                  setAiResult(null);
                }}
              >
                ยืนยัน + แจ้งแพทย์
              </Button>
            </div>
          </div>
        )}
      </div>

      {/* filter */}
      <div className="flex flex-wrap items-center gap-2">
        <CustomSelect
          value={fResident}
          onChange={setFResident}
          options={residentOptions}
          className="w-56"
        />
        <CustomSelect
          value={fFlag}
          onChange={setFFlag}
          options={[
            { value: "", label: "ทุกสถานะ" },
            { value: "normal", label: "ปกติ" },
            { value: "watch", label: "เฝ้าระวัง" },
            { value: "abnormal", label: "ผิดปกติ" },
          ]}
          className="w-40"
        />
      </div>

      {/* table */}
      <Table stickyHeader maxHeight="60vh">
        <TableHeader sticky>
          <TableRow>
            <TableHead>ผู้พัก</TableHead>
            <TableHead>เวลาวัด</TableHead>
            <TableHead align="right">BP (mmHg)</TableHead>
            <TableHead align="right">ชีพจร</TableHead>
            <TableHead align="right">อุณหภูมิ</TableHead>
            <TableHead align="right">SpO₂</TableHead>
            <TableHead align="right">น้ำตาล</TableHead>
            <TableHead align="center">สถานะ</TableHead>
            <TableHead>ผู้บันทึก</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {loading ? (
            <TableLoading colSpan={9} />
          ) : filtered.length === 0 ? (
            <TableEmpty colSpan={9}>ยังไม่มีการบันทึกสัญญาณชีพตามเงื่อนไข</TableEmpty>
          ) : (
            filtered.map((r) => (
              <TableRow key={r.id}>
                <TableCell>{residentName(r.resident_id)}</TableCell>
                <TableCell>{fmtDateTimeTH(r.measured_at)}</TableCell>
                <TableCell align="right" tabular>
                  {r.systolic != null ? `${r.systolic}/${r.diastolic}` : "—"}
                </TableCell>
                <TableCell align="right" tabular>
                  {r.pulse ?? "—"}
                </TableCell>
                <TableCell align="right" tabular>
                  {r.temperature != null ? `${r.temperature}°` : "—"}
                </TableCell>
                <TableCell align="right" tabular>
                  {r.spo2 != null ? `${r.spo2}%` : "—"}
                </TableCell>
                <TableCell align="right" tabular>
                  {r.blood_glucose ?? "—"}
                </TableCell>
                <TableCell align="center">
                  <VitalFlagBadge flag={r.flag} />
                </TableCell>
                <TableCell>{staffName(r.recorded_by)}</TableCell>
              </TableRow>
            ))
          )}
        </TableBody>
      </Table>

      {/* dialog เพิ่ม vital */}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent size="xl">
          <DialogHeader>
            <DialogTitle>บันทึกสัญญาณชีพ</DialogTitle>
          </DialogHeader>
          <DialogBody>
            <div className="space-y-4">
              <div>
                <Label htmlFor="v-res">ผู้พัก *</Label>
                <CustomSelect
                  value={form.resident_id}
                  onChange={(v) => setForm((f) => ({ ...f, resident_id: v }))}
                  options={residentOptions.filter((o) => o.value)}
                  className="mt-1"
                />
              </div>
              <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
                <div>
                  <Label htmlFor="v-sbp">ความดันบน (SBP)</Label>
                  <Input
                    id="v-sbp"
                    type="number"
                    className="mt-1"
                    value={form.systolic}
                    onChange={(e) => setForm((f) => ({ ...f, systolic: e.target.value }))}
                    placeholder="120"
                  />
                </div>
                <div>
                  <Label htmlFor="v-dbp">ความดันล่าง (DBP)</Label>
                  <Input
                    id="v-dbp"
                    type="number"
                    className="mt-1"
                    value={form.diastolic}
                    onChange={(e) => setForm((f) => ({ ...f, diastolic: e.target.value }))}
                    placeholder="80"
                  />
                </div>
                <div>
                  <Label htmlFor="v-pulse">ชีพจร (bpm)</Label>
                  <Input
                    id="v-pulse"
                    type="number"
                    className="mt-1"
                    value={form.pulse}
                    onChange={(e) => setForm((f) => ({ ...f, pulse: e.target.value }))}
                    placeholder="72"
                  />
                </div>
                <div>
                  <Label htmlFor="v-temp">อุณหภูมิ (°C)</Label>
                  <Input
                    id="v-temp"
                    type="number"
                    className="mt-1"
                    value={form.temperature}
                    onChange={(e) => setForm((f) => ({ ...f, temperature: e.target.value }))}
                    placeholder="36.8"
                  />
                </div>
                <div>
                  <Label htmlFor="v-spo2">SpO₂ (%)</Label>
                  <Input
                    id="v-spo2"
                    type="number"
                    className="mt-1"
                    value={form.spo2}
                    onChange={(e) => setForm((f) => ({ ...f, spo2: e.target.value }))}
                    placeholder="97"
                  />
                </div>
                <div>
                  <Label htmlFor="v-glu">น้ำตาล (mg/dL)</Label>
                  <Input
                    id="v-glu"
                    type="number"
                    className="mt-1"
                    value={form.blood_glucose}
                    onChange={(e) => setForm((f) => ({ ...f, blood_glucose: e.target.value }))}
                    placeholder="—"
                  />
                </div>
              </div>
              <div>
                <Label htmlFor="v-note">บันทึกเพิ่มเติม</Label>
                <Input
                  id="v-note"
                  className="mt-1"
                  value={form.note}
                  onChange={(e) => setForm((f) => ({ ...f, note: e.target.value }))}
                  placeholder="เช่น เพิ่งทานข้าว / ให้ O2"
                />
              </div>
              <p className="text-xs text-gray-400">
                ระบบจะตั้งสถานะ (ปกติ/เฝ้าระวัง/ผิดปกติ) ให้อัตโนมัติจากค่าที่กรอก
              </p>
              {bpTrend.length >= 2 && form.resident_id === "res-001" && (
                <div className="rounded-lg border border-gray-200 p-3">
                  <p className="text-xs font-medium text-gray-500">แนวโน้มความดัน (ล่าสุด)</p>
                  <Sparkline data={bpTrend} tone="negative" height={40} />
                </div>
              )}
            </div>
          </DialogBody>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>
              ยกเลิก
            </Button>
            <Button onClick={submit}>บันทึก</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </NursingShell>
  );
}
