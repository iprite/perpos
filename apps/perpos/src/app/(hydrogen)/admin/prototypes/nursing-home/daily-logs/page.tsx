"use client";

// daily-logs/page.tsx — timeline บันทึกประจำวัน + A2 voice mock (เร็วๆ นี้) — prototype interactive
import React, { useMemo, useState } from "react";
import {
  NotebookPen,
  Plus,
  Mic,
  Sparkles,
  Utensils,
  Bath,
  Toilet,
  Activity,
  Smile,
  Moon,
  MoreHorizontal,
  Footprints,
} from "lucide-react";
import { NursingShell, useNursingRole, fmtTimeTH, fullName } from "../_components";
import { DAILY_CARE_LOGS, RESIDENTS, STAFF, MOCK_VOICE_LOG_PLACEHOLDER } from "../_fixtures";
import type { DailyCareLog, DailyLogCategory } from "../_fixtures/types";
import { Button } from "@/components/ui/button";
import { CustomSelect } from "@/components/ui/custom-select";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { StatCard } from "@/components/ui/stat-card";
import {
  Dialog,
  DialogContent,
  DialogBody,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { notify } from "@/lib/toast";

const CAT_META: Record<DailyLogCategory, { label: string; icon: React.ReactNode }> = {
  meal: { label: "อาหาร", icon: <Utensils className="h-4 w-4" /> },
  bathing: { label: "อาบน้ำ", icon: <Bath className="h-4 w-4" /> },
  toileting: { label: "ขับถ่าย", icon: <Toilet className="h-4 w-4" /> },
  mobility: { label: "เคลื่อนไหว", icon: <Footprints className="h-4 w-4" /> },
  activity: { label: "กิจกรรม", icon: <Activity className="h-4 w-4" /> },
  mood: { label: "อารมณ์", icon: <Smile className="h-4 w-4" /> },
  sleep: { label: "การนอน", icon: <Moon className="h-4 w-4" /> },
  other: { label: "อื่นๆ", icon: <MoreHorizontal className="h-4 w-4" /> },
};

function residentName(id: string): string {
  const r = RESIDENTS.find((x) => x.id === id);
  return r ? fullName(r) : id;
}
function staffName(id?: string | null): string {
  if (!id) return "—";
  const s = STAFF.find((x) => x.id === id);
  return s ? `${s.first_name} ${s.last_name}` : id;
}

const blankForm = {
  resident_id: "res-001",
  category: "meal" as DailyLogCategory,
  detail: "",
  mood: "",
};

export default function DailyLogsPage() {
  const { can } = useNursingRole();
  const canWrite = can("write", "daily_care_logs");

  const [logs, setLogs] = useState<DailyCareLog[]>(DAILY_CARE_LOGS);
  const [fResident, setFResident] = useState("");
  const [fCat, setFCat] = useState("");
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState(blankForm);

  // A2 voice mock
  const [voiceOpen, setVoiceOpen] = useState(false);
  const [voiceLoading, setVoiceLoading] = useState(false);

  const filtered = useMemo(() => {
    return logs
      .filter((l) => (fResident ? l.resident_id === fResident : true))
      .filter((l) => (fCat ? l.category === fCat : true))
      .sort((a, b) => (a.logged_at < b.logged_at ? 1 : -1));
  }, [logs, fResident, fCat]);

  const todayCount = filtered.length;
  const aiCount = logs.filter((l) => l.ai_generated).length;

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
  const catOptions = [
    { value: "", label: "ทุกหมวด" },
    ...Object.entries(CAT_META).map(([k, v]) => ({ value: k, label: v.label })),
  ];

  function submit() {
    if (!form.detail.trim()) return notify.error("กรุณากรอกรายละเอียด");
    const now = new Date().toISOString();
    const next: DailyCareLog = {
      id: `dcl-${Date.now()}`,
      resident_id: form.resident_id,
      logged_at: now,
      category: form.category,
      recorded_by: "stf-003",
      detail: form.detail,
      mood: form.mood || null,
      ai_generated: false,
      created_at: now,
    };
    setLogs((p) => [next, ...p]);
    setOpen(false);
    setForm(blankForm);
    notify.created("บันทึกประจำวันแล้ว");
  }

  function runVoiceMock() {
    setVoiceLoading(true);
    setTimeout(() => {
      const now = new Date().toISOString();
      const next: DailyCareLog = {
        id: `dcl-${Date.now()}`,
        resident_id: "res-007",
        logged_at: now,
        category: "meal",
        recorded_by: "stf-005",
        detail:
          "ทานข้าวกลางวันได้ดี อาหารอ่อน 1 จาน ดื่มน้ำเปล่า 1 แก้ว ไม่มีอาการผิดปกติ (แปลงจากเสียง)",
        mood: "ดี",
        ai_generated: true,
        created_at: now,
      };
      setLogs((p) => [next, ...p]);
      setVoiceLoading(false);
      setVoiceOpen(false);
      notify.success("แปลงเสียงเป็นบันทึกแล้ว (ตัวอย่าง) — ติดป้าย AI");
    }, 1600);
  }

  return (
    <NursingShell
      title="บันทึกประจำวัน"
      description="ไทม์ไลน์การดูแลประจำวัน (อาหาร อาบน้ำ กิจกรรม อารมณ์ การนอน)"
      icon={<NotebookPen className="h-6 w-6" />}
      actions={
        canWrite ? (
          <>
            <Button variant="outline" onClick={() => setVoiceOpen(true)}>
              <Mic className="mr-1.5 h-4 w-4" /> บันทึกด้วยเสียง
              <span className="ml-1.5 rounded-full bg-amber-100 px-1.5 py-0.5 text-[10px] font-medium text-amber-700">
                เร็วๆ นี้
              </span>
            </Button>
            <Button onClick={() => setOpen(true)}>
              <Plus className="mr-1.5 h-4 w-4" /> เพิ่มบันทึก
            </Button>
          </>
        ) : undefined
      }
    >
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <StatCard
          icon={<NotebookPen className="h-4 w-4" />}
          label="บันทึก (ตามตัวกรอง)"
          value={todayCount}
          tone="info"
        />
        <StatCard
          icon={<Sparkles className="h-4 w-4" />}
          label="สร้างด้วย AI"
          value={aiCount}
          sub="จากเสียง/อัตโนมัติ"
          tone="primary"
        />
        <StatCard
          icon={<Activity className="h-4 w-4" />}
          label="ผู้พักที่มีบันทึกวันนี้"
          value={new Set(logs.map((l) => l.resident_id)).size}
          tone="positive"
          valueColored
        />
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <CustomSelect
          value={fResident}
          onChange={setFResident}
          options={residentOptions}
          className="w-56"
        />
        <CustomSelect value={fCat} onChange={setFCat} options={catOptions} className="w-40" />
      </div>

      {/* timeline */}
      {filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-xl border border-gray-200 bg-white py-16 text-center">
          <div className="mb-4 rounded-full bg-gray-100 p-4">
            <NotebookPen className="h-8 w-8 text-gray-400" />
          </div>
          <h3 className="text-sm font-medium text-gray-900">ยังไม่มีบันทึกประจำวัน</h3>
          <p className="mt-1 text-sm text-gray-500">เริ่มบันทึกการดูแลผู้พักในแต่ละวัน</p>
          {canWrite && (
            <Button className="mt-4" size="sm" onClick={() => setOpen(true)}>
              <Plus className="mr-1.5 h-4 w-4" /> เพิ่มบันทึกแรก
            </Button>
          )}
        </div>
      ) : (
        <div className="rounded-xl border border-gray-200 bg-white p-4">
          <ol className="space-y-1">
            {filtered.map((l, idx) => {
              const meta = CAT_META[l.category];
              return (
                <li key={l.id} className="flex gap-3">
                  <div className="flex flex-col items-center">
                    <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
                      {meta.icon}
                    </span>
                    {idx < filtered.length - 1 && (
                      <span className="my-0.5 w-px flex-1 bg-gray-200" />
                    )}
                  </div>
                  <div className="min-w-0 flex-1 pb-4">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-sm font-medium text-gray-900">
                        {residentName(l.resident_id)}
                      </span>
                      <span className="rounded-full bg-gray-100 px-2 py-0.5 text-xs text-gray-500">
                        {meta.label}
                      </span>
                      {l.ai_generated && (
                        <span className="inline-flex items-center gap-1 rounded-full bg-blue-50 px-2 py-0.5 text-xs font-medium text-blue-600">
                          <Sparkles className="h-3 w-3" /> AI
                        </span>
                      )}
                      <span className="text-xs tabular-nums text-gray-400">
                        {fmtTimeTH(l.logged_at)}
                      </span>
                    </div>
                    <p className="mt-1 text-sm text-gray-700">{l.detail}</p>
                    <p className="mt-0.5 text-xs text-gray-400">
                      โดย {staffName(l.recorded_by)}
                      {l.mood ? ` · อารมณ์: ${l.mood}` : ""}
                    </p>
                  </div>
                </li>
              );
            })}
          </ol>
        </div>
      )}

      {/* add dialog */}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent size="lg">
          <DialogHeader>
            <DialogTitle>เพิ่มบันทึกประจำวัน</DialogTitle>
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
                <Label>หมวด</Label>
                <CustomSelect
                  className="mt-1"
                  value={form.category}
                  onChange={(v) => setForm((f) => ({ ...f, category: v as DailyLogCategory }))}
                  options={Object.entries(CAT_META).map(([k, v]) => ({ value: k, label: v.label }))}
                />
              </div>
              <div>
                <Label htmlFor="dl-detail">รายละเอียด *</Label>
                <Input
                  id="dl-detail"
                  className="mt-1"
                  value={form.detail}
                  onChange={(e) => setForm((f) => ({ ...f, detail: e.target.value }))}
                  placeholder="เช่น ทานข้าวต้ม 1 ชาม ทานหมด 80%"
                />
              </div>
              <div>
                <Label htmlFor="dl-mood">อารมณ์ (ถ้ามี)</Label>
                <Input
                  id="dl-mood"
                  className="mt-1"
                  value={form.mood}
                  onChange={(e) => setForm((f) => ({ ...f, mood: e.target.value }))}
                  placeholder="เช่น ดี / เฉยๆ / สับสน"
                />
              </div>
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

      {/* A2 voice mock dialog */}
      <Dialog
        open={voiceOpen}
        onOpenChange={(o) => {
          if (!o && !voiceLoading) setVoiceOpen(false);
        }}
      >
        <DialogContent size="md">
          <DialogHeader>
            <DialogTitle>บันทึกด้วยเสียง (ตัวอย่าง)</DialogTitle>
          </DialogHeader>
          <DialogBody>
            <div className="space-y-4 text-center">
              <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-amber-50">
                <Mic className={`h-7 w-7 text-amber-600 ${voiceLoading ? "animate-pulse" : ""}`} />
              </div>
              <span className="inline-flex items-center rounded-full bg-amber-100 px-2.5 py-0.5 text-xs font-medium text-amber-700">
                {MOCK_VOICE_LOG_PLACEHOLDER.label}
              </span>
              <p className="text-sm text-gray-600">{MOCK_VOICE_LOG_PLACEHOLDER.message}</p>
              {voiceLoading && (
                <div className="animate-pulse space-y-2 text-left">
                  <div className="h-4 w-2/3 rounded bg-gray-100" />
                  <div className="h-4 w-full rounded bg-gray-100" />
                </div>
              )}
              <p className="text-xs text-gray-400">
                ในตัวอย่างนี้ ระบบจะจำลองการแปลงเสียงเป็นบันทึก (ติดป้าย AI)
              </p>
            </div>
          </DialogBody>
          <DialogFooter>
            <Button variant="outline" onClick={() => setVoiceOpen(false)} disabled={voiceLoading}>
              ปิด
            </Button>
            <Button onClick={runVoiceMock} disabled={voiceLoading}>
              {voiceLoading ? "กำลังแปลงเสียง…" : "จำลองแปลงเสียง → บันทึก"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </NursingShell>
  );
}
