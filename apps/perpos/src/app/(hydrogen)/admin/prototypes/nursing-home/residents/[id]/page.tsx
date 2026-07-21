"use client";

// โปรไฟล์ผู้พักอาศัย 360° — หน้าสำคัญที่สุดของกลุ่ม residents
// header + tabs (ภาพรวม/ญาติ/ประวัติ/สัญญาณชีพ/แผน/ยา/บันทึก/การเงิน) + AI A4 "สรุปสถานะให้ญาติ"
// client interactive · guard อยู่ที่ layout.tsx แล้ว

import { useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import {
  ArrowLeft,
  Users,
  BedDouble,
  Droplet,
  ShieldAlert,
  Utensils,
  Pencil,
  Sparkles,
  Copy,
  Send,
  ClipboardList,
  Pill,
  HeartPulse,
  NotebookPen,
  FileText,
  Phone,
  Stethoscope,
  LayoutGrid,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Avatar } from "@/components/ui/avatar";
import {
  Dialog,
  DialogContent,
  DialogBody,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { toast } from "@/lib/toast";
import cn from "@core/utils/class-names";

import { RESIDENTS, ROOMS, BEDS, MOCK_FAMILY_SUMMARY_A4 } from "../../_fixtures";
import {
  NursingShell,
  useNursingRole,
  fmtDateTH,
  calcAge,
  fullName,
  ResidentStatusBadge,
  CareLevelBadge,
} from "../../_components";
import {
  ContactsTab,
  MedicalTab,
  VitalsTab,
  CarePlansTab,
  MedsTab,
  DailyLogsTab,
  FinanceTab,
} from "./_parts/tabs";

const BASE = "/admin/prototypes/nursing-home";

type TabKey =
  | "overview"
  | "contacts"
  | "medical"
  | "vitals"
  | "care_plans"
  | "meds"
  | "daily_logs"
  | "finance";

const TABS: { key: TabKey; label: string; icon: React.ReactNode }[] = [
  { key: "overview", label: "ภาพรวม", icon: <LayoutGrid className="h-4 w-4" /> },
  { key: "contacts", label: "ญาติ/ผู้ติดต่อ", icon: <Phone className="h-4 w-4" /> },
  { key: "medical", label: "ประวัติ/โรค", icon: <Stethoscope className="h-4 w-4" /> },
  { key: "vitals", label: "สัญญาณชีพ", icon: <HeartPulse className="h-4 w-4" /> },
  { key: "care_plans", label: "แผนการดูแล", icon: <ClipboardList className="h-4 w-4" /> },
  { key: "meds", label: "ยา", icon: <Pill className="h-4 w-4" /> },
  { key: "daily_logs", label: "บันทึกประจำวัน", icon: <NotebookPen className="h-4 w-4" /> },
  { key: "finance", label: "การเงิน/บิล", icon: <FileText className="h-4 w-4" /> },
];

const genderLabel = (g: string) => (g === "male" ? "ชาย" : g === "female" ? "หญิง" : "อื่นๆ");

export default function ResidentProfilePage() {
  const params = useParams();
  const router = useRouter();
  const id = String(params?.id ?? "");
  const { can } = useNursingRole();
  const canWrite = can("write", "residents");

  const resident = useMemo(() => RESIDENTS.find((r) => r.id === id), [id]);
  const bed = useMemo(() => BEDS.find((b) => b.id === resident?.bed_id), [resident]);
  const room = useMemo(() => ROOMS.find((r) => r.id === bed?.room_id), [bed]);

  const [tab, setTab] = useState<TabKey>("overview");

  // จำลอง loading skeleton ครั้งแรก (โชว์ loading state)
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    const t = setTimeout(() => setLoading(false), 600);
    return () => clearTimeout(t);
  }, []);

  // AI A4
  const [openAi, setOpenAi] = useState(false);
  const [aiLoading, setAiLoading] = useState(false);
  const [aiReady, setAiReady] = useState(false);

  function runAi() {
    setOpenAi(true);
    setAiReady(false);
    setAiLoading(true);
    setTimeout(() => {
      setAiLoading(false);
      setAiReady(true);
    }, 1400);
  }
  function copySummary() {
    navigator.clipboard?.writeText(MOCK_FAMILY_SUMMARY_A4.summary_text).then(
      () => toast.success("คัดลอกข้อความสรุปแล้ว"),
      () => toast.error("คัดลอกไม่สำเร็จ"),
    );
  }
  function sendLine() {
    toast.success("ส่งสรุปให้ญาติทาง LINE แล้ว (ตัวอย่าง)");
    setOpenAi(false);
  }

  // ── not found ──
  if (!resident) {
    return (
      <NursingShell title="ไม่พบผู้พักอาศัย" icon={<Users className="h-6 w-6" />}>
        <div className="flex flex-col items-center justify-center rounded-xl border border-gray-200 bg-white py-16 text-center shadow-sm">
          <div className="mb-3 rounded-full bg-gray-100 p-4">
            <Users className="h-8 w-8 text-gray-400" />
          </div>
          <p className="text-sm font-medium text-gray-700">ไม่พบข้อมูลผู้พักรหัส {id}</p>
          <p className="mt-1 text-sm text-gray-500">ผู้พักอาจถูกลบหรือลิงก์ไม่ถูกต้อง</p>
          <Button className="mt-4" onClick={() => router.push(`${BASE}/residents`)}>
            <ArrowLeft className="mr-1.5 h-4 w-4" />
            กลับทะเบียนผู้พัก
          </Button>
        </div>
      </NursingShell>
    );
  }

  const age = calcAge(resident.birth_date);

  return (
    <NursingShell
      title={fullName(resident)}
      description={`รหัส ${resident.code} · โปรไฟล์ 360° — สุขภาพ การดูแล และค่าบริการ`}
      icon={<Users className="h-6 w-6" />}
      actions={
        <div className="flex items-center gap-2">
          <Button onClick={runAi}>
            <Sparkles className="mr-1.5 h-4 w-4" />
            สรุปสถานะให้ญาติ
          </Button>
          {canWrite && (
            <Button
              variant="secondary"
              onClick={() => toast.success("เปิดฟอร์มแก้ไขข้อมูลผู้พัก (ตัวอย่าง)")}
            >
              <Pencil className="mr-1.5 h-4 w-4" />
              แก้ข้อมูล
            </Button>
          )}
        </div>
      }
    >
      {loading ? (
        <div className="animate-pulse space-y-4">
          <div className="h-32 rounded-xl bg-gray-100" />
          <div className="h-10 rounded-lg bg-gray-100" />
          <div className="h-64 rounded-xl bg-gray-100" />
        </div>
      ) : (
        <>
          {/* Header card */}
          <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-start">
              <Avatar
                src={resident.photo_url}
                name={`${resident.first_name} ${resident.last_name}`}
                className="h-16 w-16 text-lg"
              />
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <h2 className="text-lg font-semibold text-gray-900">
                    {resident.first_name} {resident.last_name}
                  </h2>
                  {resident.nickname && (
                    <span className="text-sm text-gray-400">({resident.nickname})</span>
                  )}
                  <ResidentStatusBadge status={resident.status} />
                  <CareLevelBadge level={resident.care_level} />
                </div>
                <div className="mt-2 flex flex-wrap gap-x-6 gap-y-1 text-sm text-gray-600">
                  <span>
                    {genderLabel(resident.gender)} · อายุ {age ?? "—"} ปี
                  </span>
                  <span>เกิด {fmtDateTH(resident.birth_date)}</span>
                  <span className="flex items-center gap-1">
                    <BedDouble className="h-3.5 w-3.5 text-gray-400" />
                    {room ? `${room.name} · ${bed?.name}` : "ยังไม่จัดเตียง"}
                  </span>
                  {resident.blood_type && (
                    <span className="flex items-center gap-1">
                      <Droplet className="h-3.5 w-3.5 text-gray-400" />
                      กรุ๊ปเลือด {resident.blood_type}
                    </span>
                  )}
                  <span>รับเข้า {fmtDateTH(resident.admission_date)}</span>
                </div>

                {/* คำเตือนสำคัญ — เน้น */}
                {(resident.allergies || resident.dietary_notes || resident.emergency_note) && (
                  <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2">
                    {resident.allergies && (
                      <div className="flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
                        <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0" />
                        <span>
                          <b>แพ้ยา/สารก่อภูมิ:</b> {resident.allergies}
                        </span>
                      </div>
                    )}
                    {resident.dietary_notes && (
                      <div className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-700">
                        <Utensils className="mt-0.5 h-4 w-4 shrink-0" />
                        <span>
                          <b>โภชนาการ:</b> {resident.dietary_notes}
                        </span>
                      </div>
                    )}
                    {resident.emergency_note && (
                      <div className="flex items-start gap-2 rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-sm text-gray-600 sm:col-span-2">
                        <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0 text-gray-400" />
                        <span>
                          <b>หมายเหตุดูแล:</b> {resident.emergency_note}
                        </span>
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Tab nav */}
          <div className="flex gap-1 overflow-x-auto rounded-xl border border-gray-200 bg-white p-1.5 shadow-sm">
            {TABS.map((t) => (
              <Button
                key={t.key}
                variant="ghost"
                size="sm"
                onClick={() => setTab(t.key)}
                className={cn(
                  "shrink-0 gap-1.5",
                  tab === t.key
                    ? "bg-primary/10 font-medium text-primary hover:bg-primary/10"
                    : "text-gray-600 hover:bg-gray-50 hover:text-gray-900",
                )}
              >
                {t.icon}
                {t.label}
              </Button>
            ))}
          </div>

          {/* Tab content */}
          <div>
            {tab === "overview" && <OverviewTab resident={resident} setTab={setTab} onAi={runAi} />}
            {tab === "contacts" && <ContactsTab residentId={resident.id} />}
            {tab === "medical" && <MedicalTab residentId={resident.id} />}
            {tab === "vitals" && <VitalsTab residentId={resident.id} />}
            {tab === "care_plans" && <CarePlansTab residentId={resident.id} />}
            {tab === "meds" && <MedsTab residentId={resident.id} />}
            {tab === "daily_logs" && <DailyLogsTab residentId={resident.id} />}
            {tab === "finance" && <FinanceTab residentId={resident.id} />}
          </div>
        </>
      )}

      {/* AI A4 — สรุปสถานะให้ญาติ */}
      <Dialog open={openAi} onOpenChange={setOpenAi}>
        <DialogContent size="xl">
          <DialogHeader>
            <DialogTitle>
              <span className="flex items-center gap-2">
                <Sparkles className="h-5 w-5 text-primary" />
                สรุปสถานะให้ญาติ (AI ช่วยร่าง)
              </span>
            </DialogTitle>
          </DialogHeader>
          <DialogBody>
            {aiLoading ? (
              <div className="space-y-3 py-2">
                <p className="text-sm text-gray-500">กำลังสรุปสถานะจากบันทึกสุขภาพล่าสุด…</p>
                <div className="animate-pulse space-y-2">
                  <div className="h-4 w-3/4 rounded bg-gray-100" />
                  <div className="h-4 w-full rounded bg-gray-100" />
                  <div className="h-4 w-5/6 rounded bg-gray-100" />
                  <div className="h-4 w-2/3 rounded bg-gray-100" />
                </div>
              </div>
            ) : aiReady ? (
              <div className="space-y-4">
                <div className="flex flex-wrap items-center gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-700">
                  <ShieldAlert className="h-4 w-4" />
                  ฉบับร่าง AI — โปรดตรวจทานก่อนส่งให้ญาติ
                  <span className="ml-auto rounded bg-amber-100 px-1.5 py-0.5 font-medium">
                    ต้องยืนยันก่อนส่ง
                  </span>
                </div>

                <div className="text-xs text-gray-400">
                  ส่งให้: {MOCK_FAMILY_SUMMARY_A4.generated_for} · ช่วง{" "}
                  {MOCK_FAMILY_SUMMARY_A4.period}
                </div>

                <div className="whitespace-pre-line rounded-lg border border-gray-200 bg-gray-50 p-4 text-sm leading-relaxed text-gray-700">
                  {MOCK_FAMILY_SUMMARY_A4.summary_text}
                </div>

                <div>
                  <div className="mb-2 text-sm font-semibold text-gray-900">
                    ประเด็นสำคัญสัปดาห์นี้
                  </div>
                  <ul className="space-y-1.5">
                    {MOCK_FAMILY_SUMMARY_A4.highlights.map((h, i) => (
                      <li key={i} className="flex items-start gap-2 text-sm text-gray-600">
                        <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-primary" />
                        {h}
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
            ) : null}
          </DialogBody>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpenAi(false)}>
              ปิด
            </Button>
            <Button variant="secondary" disabled={!aiReady} onClick={copySummary}>
              <Copy className="mr-1.5 h-4 w-4" />
              คัดลอก
            </Button>
            <Button disabled={!aiReady} onClick={sendLine}>
              <Send className="mr-1.5 h-4 w-4" />
              ส่ง LINE ญาติ
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </NursingShell>
  );
}

// ─── ภาพรวม (overview) — quick links + ข้อมูลสรุป ───
function OverviewTab({
  resident,
  setTab,
  onAi,
}: {
  resident: (typeof RESIDENTS)[number];
  setTab: (t: TabKey) => void;
  onAi: () => void;
}) {
  const quick: { key: TabKey; label: string; icon: React.ReactNode; desc: string }[] = [
    {
      key: "vitals",
      label: "สัญญาณชีพ",
      icon: <HeartPulse className="h-5 w-5" />,
      desc: "ความดัน ชีพจร SpO₂ ล่าสุด",
    },
    { key: "meds", label: "ยา", icon: <Pill className="h-5 w-5" />, desc: "รายการยาที่กำลังใช้" },
    {
      key: "care_plans",
      label: "แผนการดูแล",
      icon: <ClipboardList className="h-5 w-5" />,
      desc: "เป้าหมายและกิจกรรม",
    },
    {
      key: "daily_logs",
      label: "บันทึกประจำวัน",
      icon: <NotebookPen className="h-5 w-5" />,
      desc: "ไทม์ไลน์การดูแล",
    },
    {
      key: "finance",
      label: "การเงิน/บิล",
      icon: <FileText className="h-5 w-5" />,
      desc: "ใบแจ้งหนี้และยอดค้าง",
    },
    {
      key: "contacts",
      label: "ญาติ/ผู้ติดต่อ",
      icon: <Phone className="h-5 w-5" />,
      desc: "ผู้ติดต่อฉุกเฉิน",
    },
  ];
  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-primary/20 bg-primary/5 p-4">
        <div className="flex items-start gap-3">
          <div className="rounded-lg bg-primary/10 p-2 text-primary">
            <Sparkles className="h-5 w-5" />
          </div>
          <div className="min-w-0 flex-1">
            <div className="text-sm font-semibold text-gray-900">อัปเดตญาติได้ในคลิกเดียว</div>
            <p className="mt-0.5 text-sm text-gray-600">
              ให้ AI ร่างสรุปสถานะสุขภาพประจำสัปดาห์จากบันทึกจริง แล้วส่งให้ญาติทาง LINE —
              ลดเวลาพยาบาล/ธุรการ และสร้างความอุ่นใจให้ครอบครัว
            </p>
          </div>
          <Button size="sm" className="shrink-0" onClick={onAi}>
            <Sparkles className="mr-1.5 h-4 w-4" />
            สรุปให้ญาติ
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {quick.map((q) => (
          <Button
            key={q.key}
            variant="outline"
            onClick={() => setTab(q.key)}
            className="h-auto items-start justify-start gap-3 whitespace-normal rounded-xl border-gray-200 bg-white p-4 text-left font-normal shadow-sm hover:border-primary/40 hover:bg-gray-50"
          >
            <span className="rounded-lg bg-gray-100 p-2 text-gray-500">{q.icon}</span>
            <span className="min-w-0">
              <span className="block font-medium text-gray-900">{q.label}</span>
              <span className="block text-xs text-gray-500">{q.desc}</span>
            </span>
          </Button>
        ))}
      </div>
    </div>
  );
}
