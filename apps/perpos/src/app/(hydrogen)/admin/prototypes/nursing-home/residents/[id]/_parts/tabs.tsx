"use client";

// _parts/tabs.tsx — เนื้อหาแต่ละ tab ของโปรไฟล์ผู้พัก 360°
// แยกจาก page.tsx เพื่อไม่ให้ไฟล์เดียวยาวเกิน · ทุกตัวรับ residentId แล้ว filter fixtures เอง

import { useMemo } from "react";
import {
  Phone,
  Mail,
  MessageCircle,
  Star,
  Activity,
  ClipboardList,
  Pill,
  NotebookPen,
  FileText,
  HeartPulse,
  Stethoscope,
} from "lucide-react";

import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
} from "@/components/ui/table";
import { StatusBadge } from "@/components/ui/badge";
import { StatCard } from "@/components/ui/stat-card";

import {
  FAMILY_CONTACTS,
  MEDICAL_HISTORIES,
  VITAL_SIGNS,
  CARE_PLANS,
  MEDICATION_ORDERS,
  DAILY_CARE_LOGS,
  INVOICES,
} from "../../../_fixtures";
import {
  fmtMoney,
  fmtDateTH,
  fmtDateTimeTH,
  fmtTimeTH,
  fmtMonthTH,
  VitalFlagBadge,
  CarePlanStatusBadge,
  InvoiceStatusBadge,
} from "../../../_components";

const REL_LABEL: Record<string, string> = {
  child: "บุตร",
  spouse: "คู่สมรส",
  sibling: "พี่น้อง",
  relative: "ญาติ",
  guardian: "ผู้ปกครอง",
  other: "อื่นๆ",
};
const CAT_LABEL: Record<string, string> = {
  meal: "มื้ออาหาร",
  bathing: "อาบน้ำ",
  toileting: "ขับถ่าย",
  mobility: "เคลื่อนไหว",
  activity: "กิจกรรม",
  mood: "อารมณ์",
  sleep: "การนอน",
  other: "อื่นๆ",
};

function EmptyTab({ icon, text }: { icon: React.ReactNode; text: string }) {
  return (
    <div className="flex flex-col items-center justify-center py-12 text-center">
      <div className="mb-3 rounded-full bg-gray-100 p-4 text-gray-400">{icon}</div>
      <p className="text-sm text-gray-500">{text}</p>
    </div>
  );
}

// ─── ญาติ/ผู้ติดต่อ ───
export function ContactsTab({ residentId }: { residentId: string }) {
  const contacts = FAMILY_CONTACTS.filter((c) => c.resident_id === residentId);
  if (contacts.length === 0)
    return <EmptyTab icon={<Phone className="h-7 w-7" />} text="ยังไม่มีข้อมูลญาติ/ผู้ติดต่อ" />;
  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
      {contacts.map((c) => (
        <div key={c.id} className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <div className="flex items-center gap-1.5 font-medium text-gray-900">
                {c.name}
                {c.is_primary && <Star className="h-3.5 w-3.5 fill-amber-400 text-amber-400" />}
              </div>
              <div className="text-xs text-gray-500">
                {REL_LABEL[c.relationship] ?? c.relationship}
              </div>
            </div>
            {c.is_emergency && <StatusBadge tone="danger">ติดต่อฉุกเฉิน</StatusBadge>}
          </div>
          <div className="mt-3 space-y-1.5 text-sm text-gray-600">
            <div className="flex items-center gap-2">
              <Phone className="h-3.5 w-3.5 text-gray-400" />
              {c.phone}
            </div>
            {c.email && (
              <div className="flex items-center gap-2">
                <Mail className="h-3.5 w-3.5 text-gray-400" />
                {c.email}
              </div>
            )}
            {c.line_id && (
              <div className="flex items-center gap-2">
                <MessageCircle className="h-3.5 w-3.5 text-gray-400" />
                LINE: {c.line_id}
              </div>
            )}
          </div>
          {c.note && <p className="mt-2 text-xs text-gray-400">{c.note}</p>}
        </div>
      ))}
    </div>
  );
}

// ─── ประวัติ/โรค ───
export function MedicalTab({ residentId }: { residentId: string }) {
  const items = MEDICAL_HISTORIES.filter((m) => m.resident_id === residentId);
  if (items.length === 0)
    return (
      <EmptyTab icon={<Stethoscope className="h-7 w-7" />} text="ยังไม่มีประวัติ/โรคประจำตัว" />
    );
  return (
    <div className="rounded-xl border border-gray-200 bg-white shadow-sm">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>โรค/ภาวะ</TableHead>
            <TableHead align="center">ระดับ</TableHead>
            <TableHead align="center">เรื้อรัง</TableHead>
            <TableHead align="center">วินิจฉัยเมื่อ</TableHead>
            <TableHead>หมายเหตุ</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {items.map((m) => (
            <TableRow key={m.id}>
              <TableCell className="font-medium text-gray-900">{m.condition}</TableCell>
              <TableCell align="center">{m.severity ?? "—"}</TableCell>
              <TableCell align="center">
                {m.is_chronic ? (
                  <StatusBadge tone="warning">เรื้อรัง</StatusBadge>
                ) : (
                  <StatusBadge tone="neutral">เฉียบพลัน</StatusBadge>
                )}
              </TableCell>
              <TableCell align="center">{fmtDateTH(m.diagnosed_at)}</TableCell>
              <TableCell wrap className="text-gray-500">
                {m.note ?? "—"}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}

// ─── สัญญาณชีพล่าสุด ───
export function VitalsTab({ residentId }: { residentId: string }) {
  const rows = useMemo(
    () =>
      VITAL_SIGNS.filter((v) => v.resident_id === residentId)
        .slice()
        .sort((a, b) => (a.measured_at < b.measured_at ? 1 : -1)),
    [residentId],
  );
  if (rows.length === 0)
    return <EmptyTab icon={<HeartPulse className="h-7 w-7" />} text="ยังไม่มีบันทึกสัญญาณชีพ" />;
  const latest = rows[0]!;
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatCard
          icon={<Activity className="h-4 w-4" />}
          label="ความดัน (mmHg)"
          value={`${latest.systolic ?? "—"}/${latest.diastolic ?? "—"}`}
          tone={
            latest.flag === "abnormal"
              ? "negative"
              : latest.flag === "watch"
                ? "warning"
                : "positive"
          }
        />
        <StatCard
          icon={<HeartPulse className="h-4 w-4" />}
          label="ชีพจร (bpm)"
          value={String(latest.pulse ?? "—")}
          tone="info"
        />
        <StatCard
          icon={<Activity className="h-4 w-4" />}
          label="SpO₂ (%)"
          value={String(latest.spo2 ?? "—")}
          tone={(latest.spo2 ?? 100) < 95 ? "warning" : "positive"}
        />
        <StatCard
          icon={<Activity className="h-4 w-4" />}
          label="อุณหภูมิ (°C)"
          value={latest.temperature != null ? latest.temperature.toFixed(1) : "—"}
          tone={(latest.temperature ?? 0) >= 37.5 ? "warning" : "positive"}
        />
      </div>
      <div className="rounded-xl border border-gray-200 bg-white shadow-sm">
        <Table stickyHeader maxHeight="40vh">
          <TableHeader sticky>
            <TableRow>
              <TableHead>เวลาที่วัด</TableHead>
              <TableHead align="right">ความดัน</TableHead>
              <TableHead align="right">ชีพจร</TableHead>
              <TableHead align="right">SpO₂</TableHead>
              <TableHead align="right">อุณหภูมิ</TableHead>
              <TableHead align="right">น้ำตาล</TableHead>
              <TableHead align="center">สถานะ</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((v) => (
              <TableRow key={v.id}>
                <TableCell>{fmtDateTimeTH(v.measured_at)}</TableCell>
                <TableCell align="right" tabular>
                  {v.systolic}/{v.diastolic}
                </TableCell>
                <TableCell align="right" tabular>
                  {v.pulse ?? "—"}
                </TableCell>
                <TableCell align="right" tabular>
                  {v.spo2 ?? "—"}
                </TableCell>
                <TableCell align="right" tabular>
                  {v.temperature?.toFixed(1) ?? "—"}
                </TableCell>
                <TableCell align="right" tabular>
                  {v.blood_glucose ?? "—"}
                </TableCell>
                <TableCell align="center">
                  <VitalFlagBadge flag={v.flag} />
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}

// ─── แผนการดูแล ───
export function CarePlansTab({ residentId }: { residentId: string }) {
  const plans = CARE_PLANS.filter((p) => p.resident_id === residentId);
  if (plans.length === 0)
    return <EmptyTab icon={<ClipboardList className="h-7 w-7" />} text="ยังไม่มีแผนการดูแล" />;
  return (
    <div className="space-y-3">
      {plans.map((p) => (
        <div key={p.id} className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <div className="font-medium text-gray-900">{p.title}</div>
              <p className="mt-0.5 text-sm text-gray-600">เป้าหมาย: {p.goal}</p>
            </div>
            <CarePlanStatusBadge status={p.status} />
          </div>
          <div className="mt-3 flex flex-wrap gap-x-6 gap-y-1 text-xs text-gray-400">
            <span>เริ่ม: {fmtDateTH(p.start_date)}</span>
            {p.review_date && <span>ทบทวน: {fmtDateTH(p.review_date)}</span>}
          </div>
          {p.note && <p className="mt-2 text-xs text-gray-500">{p.note}</p>}
        </div>
      ))}
    </div>
  );
}

// ─── ยา (medication orders) ───
export function MedsTab({ residentId }: { residentId: string }) {
  const meds = MEDICATION_ORDERS.filter((m) => m.resident_id === residentId);
  if (meds.length === 0)
    return <EmptyTab icon={<Pill className="h-7 w-7" />} text="ยังไม่มีรายการสั่งยา" />;
  return (
    <div className="rounded-xl border border-gray-200 bg-white shadow-sm">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>ชื่อยา</TableHead>
            <TableHead>ขนาด</TableHead>
            <TableHead>เวลาให้</TableHead>
            <TableHead align="center">สถานะ</TableHead>
            <TableHead>คำสั่งแพทย์</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {meds.map((m) => (
            <TableRow key={m.id}>
              <TableCell className="font-medium text-gray-900">{m.drug_name}</TableCell>
              <TableCell>{m.dosage}</TableCell>
              <TableCell>
                {m.schedule_times.length ? m.schedule_times.join(", ") : "เมื่อจำเป็น"}
              </TableCell>
              <TableCell align="center">
                {m.is_active ? (
                  <StatusBadge tone="success">กำลังใช้</StatusBadge>
                ) : (
                  <StatusBadge tone="neutral">หยุดแล้ว</StatusBadge>
                )}
              </TableCell>
              <TableCell wrap className="text-gray-500">
                {m.instructions ?? "—"}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}

// ─── บันทึกประจำวัน (timeline) ───
export function DailyLogsTab({ residentId }: { residentId: string }) {
  const logs = useMemo(
    () =>
      DAILY_CARE_LOGS.filter((l) => l.resident_id === residentId)
        .slice()
        .sort((a, b) => (a.logged_at < b.logged_at ? 1 : -1)),
    [residentId],
  );
  if (logs.length === 0)
    return <EmptyTab icon={<NotebookPen className="h-7 w-7" />} text="ยังไม่มีบันทึกประจำวัน" />;
  return (
    <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
      <ol className="relative space-y-5 border-l border-gray-200 pl-5">
        {logs.map((l) => (
          <li key={l.id} className="relative">
            <span className="absolute -left-[1.4rem] top-1 h-2.5 w-2.5 rounded-full border-2 border-white bg-primary" />
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-xs font-medium text-gray-900">{fmtTimeTH(l.logged_at)}</span>
              <StatusBadge tone="info">{CAT_LABEL[l.category] ?? l.category}</StatusBadge>
              {l.ai_generated && <StatusBadge tone="success">AI ช่วยบันทึก</StatusBadge>}
              {l.mood && <span className="text-xs text-gray-400">อารมณ์: {l.mood}</span>}
            </div>
            <p className="mt-1 text-sm text-gray-600">{l.detail}</p>
          </li>
        ))}
      </ol>
    </div>
  );
}

// ─── การเงิน/บิล ───
export function FinanceTab({ residentId }: { residentId: string }) {
  const invoices = useMemo(
    () =>
      INVOICES.filter((i) => i.resident_id === residentId)
        .slice()
        .sort((a, b) => (a.issue_date < b.issue_date ? 1 : -1)),
    [residentId],
  );
  const outstanding = invoices
    .filter((i) => i.status !== "void")
    .reduce((s, i) => s + (i.total - i.paid_amount), 0);

  if (invoices.length === 0)
    return <EmptyTab icon={<FileText className="h-7 w-7" />} text="ยังไม่มีใบแจ้งหนี้" />;
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <StatCard
          icon={<FileText className="h-4 w-4" />}
          label="ใบแจ้งหนี้ทั้งหมด"
          value={String(invoices.length)}
          tone="neutral"
        />
        <StatCard
          icon={<FileText className="h-4 w-4" />}
          label="ยอดค้างชำระ"
          value={fmtMoney(outstanding)}
          tone={outstanding > 0 ? "negative" : "positive"}
          valueColored
        />
        <StatCard
          icon={<FileText className="h-4 w-4" />}
          label="เกินกำหนด"
          value={String(invoices.filter((i) => i.status === "overdue").length)}
          tone={invoices.some((i) => i.status === "overdue") ? "warning" : "neutral"}
        />
      </div>
      <div className="rounded-xl border border-gray-200 bg-white shadow-sm">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>เลขที่บิล</TableHead>
              <TableHead align="center">งวด</TableHead>
              <TableHead align="center">ครบกำหนด</TableHead>
              <TableHead align="center">สถานะ</TableHead>
              <TableHead align="right">ยอดรวม</TableHead>
              <TableHead align="right">ชำระแล้ว</TableHead>
              <TableHead align="right">คงค้าง</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {invoices.map((i) => (
              <TableRow key={i.id}>
                <TableCell className="font-mono text-xs text-gray-600">{i.invoice_no}</TableCell>
                <TableCell align="center">{fmtMonthTH(i.period_month)}</TableCell>
                <TableCell align="center">{fmtDateTH(i.due_date)}</TableCell>
                <TableCell align="center">
                  <InvoiceStatusBadge status={i.status} />
                </TableCell>
                <TableCell align="right" tabular>
                  {fmtMoney(i.total)}
                </TableCell>
                <TableCell align="right" tabular>
                  {fmtMoney(i.paid_amount)}
                </TableCell>
                <TableCell align="right" tabular>
                  <span className={i.total - i.paid_amount > 0 ? "text-red-600" : "text-gray-400"}>
                    {fmtMoney(i.total - i.paid_amount)}
                  </span>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
