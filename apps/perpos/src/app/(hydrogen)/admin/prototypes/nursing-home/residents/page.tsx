"use client";

// ทะเบียนผู้พักอาศัย (residents list) — prototype interactive
// guard super_admin อยู่ที่ layout.tsx แล้ว → หน้านี้เป็น client interactive
// KPI จาก fixtures จริง · filter/search · admission dialog (workflow §11) · gate ตาม role matrix §4

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Users, UserPlus, BedDouble, Search, HeartPulse } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { CustomSelect } from "@/components/ui/custom-select";
import { ThaiDatePicker } from "@/components/ui/thai-date-picker";
import { StatCard } from "@/components/ui/stat-card";
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
} from "@/components/ui/table";
import { toast } from "@/lib/toast";

import { RESIDENTS, ROOMS, BEDS, RESIDENT_SUBSCRIPTIONS, SERVICE_PACKAGES } from "../_fixtures";
import type { Resident, CareLevel, Gender } from "../_fixtures/types";
import {
  NursingShell,
  useNursingRole,
  fmtMoney,
  calcAge,
  ResidentStatusBadge,
  CareLevelBadge,
} from "../_components";

const BASE = "/admin/prototypes/nursing-home";

const STATUS_OPTS = [
  { value: "", label: "ทุกสถานะ" },
  { value: "active", label: "พักอาศัย" },
  { value: "prospective", label: "รอรับเข้า" },
  { value: "on_leave", label: "ลากลับบ้าน" },
  { value: "discharged", label: "จำหน่ายแล้ว" },
  { value: "deceased", label: "เสียชีวิต" },
];
const CARE_OPTS = [
  { value: "", label: "ทุกระดับการดูแล" },
  { value: "independent", label: "ช่วยเหลือตัวเองได้" },
  { value: "assisted", label: "ต้องช่วยเหลือ" },
  { value: "full_care", label: "ดูแลเต็มรูปแบบ" },
  { value: "memory_care", label: "ดูแลความจำ" },
];
const GENDER_OPTS = [
  { value: "female", label: "หญิง" },
  { value: "male", label: "ชาย" },
  { value: "other", label: "อื่นๆ" },
];
const CARE_FORM_OPTS = CARE_OPTS.slice(1);

const genderLabel = (g: Gender) => (g === "male" ? "ชาย" : g === "female" ? "หญิง" : "อื่นๆ");

type AdmissionForm = {
  first_name: string;
  last_name: string;
  nickname: string;
  gender: Gender;
  birth_date: string;
  care_level: CareLevel;
  bed_id: string;
  package_id: string;
  family_name: string;
  family_phone: string;
};

const EMPTY_FORM: AdmissionForm = {
  first_name: "",
  last_name: "",
  nickname: "",
  gender: "female",
  birth_date: "",
  care_level: "assisted",
  bed_id: "",
  package_id: "",
  family_name: "",
  family_phone: "",
};

export default function ResidentsPage() {
  const router = useRouter();
  const { can } = useNursingRole();
  const canWrite = can("write", "residents");

  const [residents, setResidents] = useState<Resident[]>(RESIDENTS);
  const [subs, setSubs] = useState(RESIDENT_SUBSCRIPTIONS);

  const [q, setQ] = useState("");
  const [status, setStatus] = useState("");
  const [care, setCare] = useState("");

  const [openAdmit, setOpenAdmit] = useState(false);
  const [form, setForm] = useState<AdmissionForm>(EMPTY_FORM);
  const [saving, setSaving] = useState(false);

  // ── lookup maps ──
  const bedById = useMemo(() => new Map(BEDS.map((b) => [b.id, b])), []);
  const roomById = useMemo(() => new Map(ROOMS.map((r) => [r.id, r])), []);
  const subByResident = useMemo(() => {
    const m = new Map<string, (typeof subs)[number]>();
    subs.filter((s) => s.is_active).forEach((s) => m.set(s.resident_id, s));
    return m;
  }, [subs]);
  const pkgById = useMemo(() => new Map(SERVICE_PACKAGES.map((p) => [p.id, p])), []);

  const bedLabel = (bedId?: string | null) => {
    if (!bedId) return "—";
    const bed = bedById.get(bedId);
    if (!bed) return "—";
    const room = roomById.get(bed.room_id);
    return `${room?.name ?? ""} · ${bed.name}`;
  };

  // เตียงว่างสำหรับฟอร์มรับเข้า
  const availableBeds = useMemo(() => BEDS.filter((b) => b.status === "available"), []);

  // ── KPI ──
  const kpi = useMemo(() => {
    const active = residents.filter((r) => r.status === "active");
    const byCare = (lvl: CareLevel) => active.filter((r) => r.care_level === lvl).length;
    const freeBeds = BEDS.filter((b) => b.status === "available").length;
    return {
      activeCount: active.length,
      fullCare: byCare("full_care") + byCare("memory_care"),
      freeBeds,
    };
  }, [residents]);

  // ── filter ──
  const rows = useMemo(() => {
    const term = q.trim().toLowerCase();
    return residents.filter((r) => {
      if (status && r.status !== status) return false;
      if (care && r.care_level !== care) return false;
      if (term) {
        const hay = `${r.first_name} ${r.last_name} ${r.nickname ?? ""} ${r.code}`.toLowerCase();
        if (!hay.includes(term)) return false;
      }
      return true;
    });
  }, [residents, q, status, care]);

  // ── admission submit (workflow §11) ──
  function submitAdmission(e: React.FormEvent) {
    e.preventDefault();
    if (!form.first_name.trim() || !form.last_name.trim() || !form.birth_date) {
      toast.error("กรุณากรอกชื่อ-นามสกุล และวันเกิด");
      return;
    }
    if (!form.package_id) {
      toast.error("กรุณาเลือกแพ็กเกจค่าบริการ");
      return;
    }
    setSaving(true);
    setTimeout(() => {
      const seq = residents.length + 1;
      const id = `res-new-${seq}`;
      const code = `R-${String(seq).padStart(4, "0")}`;
      const pkg = pkgById.get(form.package_id);
      const bedAssigned = !!form.bed_id;

      const newResident: Resident = {
        id,
        code,
        first_name: form.first_name.trim(),
        last_name: form.last_name.trim(),
        nickname: form.nickname.trim() || null,
        gender: form.gender,
        birth_date: form.birth_date,
        care_level: form.care_level,
        status: bedAssigned ? "active" : "prospective",
        bed_id: form.bed_id || null,
        admission_date: new Date().toISOString().slice(0, 10),
        blood_type: null,
        allergies: null,
        dietary_notes: null,
        emergency_note: form.family_name
          ? `ผู้ติดต่อ: ${form.family_name} ${form.family_phone}`.trim()
          : null,
        created_at: new Date().toISOString(),
      };
      setResidents((prev) => [newResident, ...prev]);
      if (pkg) {
        setSubs((prev) => [
          {
            id: `rsub-new-${seq}`,
            resident_id: id,
            package_id: pkg.id,
            monthly_price: pkg.price,
            start_date: newResident.admission_date!,
            end_date: null,
            is_active: true,
            created_at: new Date().toISOString(),
          },
          ...prev,
        ]);
      }
      setSaving(false);
      setOpenAdmit(false);
      setForm(EMPTY_FORM);
      toast.success(
        bedAssigned
          ? `รับเข้าผู้พัก ${newResident.first_name} (${code}) เรียบร้อย`
          : `บันทึกผู้พักรอรับเข้า ${newResident.first_name} (${code}) — ยังไม่ได้จัดเตียง`,
      );
    }, 700);
  }

  return (
    <NursingShell
      title="ผู้พักอาศัย"
      description="ทะเบียนผู้สูงอายุที่อยู่ในความดูแล — โปรไฟล์ สุขภาพ และค่าบริการ"
      icon={<Users className="h-6 w-6" />}
      actions={
        canWrite ? (
          <Button onClick={() => setOpenAdmit(true)}>
            <UserPlus className="mr-1.5 h-4 w-4" />
            รับเข้าใหม่
          </Button>
        ) : null
      }
    >
      {/* KPI */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <StatCard
          icon={<Users className="h-4 w-4" />}
          label="ผู้พักอาศัย (active)"
          value={String(kpi.activeCount)}
          sub="คนที่อยู่ในความดูแลขณะนี้"
          tone="info"
        />
        <StatCard
          icon={<HeartPulse className="h-4 w-4" />}
          label="ดูแลใกล้ชิด / ความจำ"
          value={String(kpi.fullCare)}
          sub="ต้องการพยาบาล/ผู้ดูแลเฉพาะ"
          tone="warning"
        />
        <StatCard
          icon={<BedDouble className="h-4 w-4" />}
          label="เตียงว่าง"
          value={String(kpi.freeBeds)}
          sub={`จากทั้งหมด ${BEDS.length} เตียง`}
          tone={kpi.freeBeds > 0 ? "positive" : "neutral"}
        />
      </div>

      {/* Filter bar */}
      <div className="flex flex-col gap-2 rounded-xl border border-gray-200 bg-white p-3 shadow-sm sm:flex-row sm:items-center">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
          <Input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="ค้นหาชื่อ ฉายา หรือรหัสผู้พัก…"
            className="pl-9"
          />
        </div>
        <CustomSelect
          value={status}
          onChange={setStatus}
          options={STATUS_OPTS}
          className="sm:w-44"
        />
        <CustomSelect value={care} onChange={setCare} options={CARE_OPTS} className="sm:w-52" />
      </div>

      {/* Table */}
      <div className="rounded-xl border border-gray-200 bg-white shadow-sm">
        <Table stickyHeader maxHeight="62vh">
          <TableHeader sticky>
            <TableRow>
              <TableHead>รหัส</TableHead>
              <TableHead>ชื่อ-นามสกุล</TableHead>
              <TableHead align="center">เพศ</TableHead>
              <TableHead align="center">อายุ</TableHead>
              <TableHead align="center">ระดับการดูแล</TableHead>
              <TableHead>ห้อง / เตียง</TableHead>
              <TableHead align="center">สถานะ</TableHead>
              <TableHead align="right">ค่าบริการ/เดือน</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.length === 0 ? (
              <TableEmpty colSpan={8}>
                <div className="flex flex-col items-center justify-center py-10 text-center">
                  <div className="mb-3 rounded-full bg-gray-100 p-4">
                    <Users className="h-7 w-7 text-gray-400" />
                  </div>
                  <p className="text-sm font-medium text-gray-700">ไม่พบผู้พักอาศัยตามเงื่อนไข</p>
                  <p className="mt-1 text-sm text-gray-500">
                    ลองปรับตัวกรอง หรือรับผู้พักรายใหม่เข้าระบบ
                  </p>
                  {canWrite && (
                    <Button size="sm" className="mt-4" onClick={() => setOpenAdmit(true)}>
                      <UserPlus className="mr-1.5 h-4 w-4" />
                      รับเข้าใหม่
                    </Button>
                  )}
                </div>
              </TableEmpty>
            ) : (
              rows.map((r) => {
                const sub = subByResident.get(r.id);
                const age = calcAge(r.birth_date);
                return (
                  <TableRow
                    key={r.id}
                    clickable
                    onClick={() => router.push(`${BASE}/residents/${r.id}`)}
                  >
                    <TableCell className="font-mono text-xs text-gray-500">{r.code}</TableCell>
                    <TableCell>
                      <div className="font-medium text-gray-900">
                        {r.first_name} {r.last_name}
                      </div>
                      {r.nickname && <div className="text-xs text-gray-400">({r.nickname})</div>}
                    </TableCell>
                    <TableCell align="center">{genderLabel(r.gender)}</TableCell>
                    <TableCell align="center" tabular>
                      {age ?? "—"}
                    </TableCell>
                    <TableCell align="center">
                      <CareLevelBadge level={r.care_level} />
                    </TableCell>
                    <TableCell>{bedLabel(r.bed_id)}</TableCell>
                    <TableCell align="center">
                      <ResidentStatusBadge status={r.status} />
                    </TableCell>
                    <TableCell align="right" tabular>
                      {sub ? fmtMoney(sub.monthly_price) : "—"}
                    </TableCell>
                  </TableRow>
                );
              })
            )}
          </TableBody>
        </Table>
      </div>

      <p className="text-xs text-gray-400">
        แสดง {rows.length} จาก {residents.length} ราย · คลิกแถวเพื่อดูโปรไฟล์ 360°
      </p>

      {/* Admission dialog */}
      <Dialog open={openAdmit} onOpenChange={setOpenAdmit}>
        <DialogContent size="xl">
          <DialogHeader>
            <DialogTitle>รับผู้พักอาศัยเข้าใหม่</DialogTitle>
          </DialogHeader>
          <form className="flex min-h-0 flex-1 flex-col" onSubmit={submitAdmission}>
            <DialogBody>
              <div className="space-y-5">
                <div>
                  <div className="mb-2 text-sm font-semibold text-gray-900">ข้อมูลผู้พัก</div>
                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                    <div>
                      <Label htmlFor="fn">ชื่อ *</Label>
                      <Input
                        id="fn"
                        className="mt-1"
                        value={form.first_name}
                        onChange={(e) => setForm((f) => ({ ...f, first_name: e.target.value }))}
                        placeholder="เช่น สมศรี"
                      />
                    </div>
                    <div>
                      <Label htmlFor="ln">นามสกุล *</Label>
                      <Input
                        id="ln"
                        className="mt-1"
                        value={form.last_name}
                        onChange={(e) => setForm((f) => ({ ...f, last_name: e.target.value }))}
                        placeholder="เช่น ใจงาม"
                      />
                    </div>
                    <div>
                      <Label htmlFor="nick">ชื่อเล่น/ฉายา</Label>
                      <Input
                        id="nick"
                        className="mt-1"
                        value={form.nickname}
                        onChange={(e) => setForm((f) => ({ ...f, nickname: e.target.value }))}
                        placeholder="เช่น ยายศรี"
                      />
                    </div>
                    <div>
                      <Label htmlFor="gender">เพศ</Label>
                      <CustomSelect
                        value={form.gender}
                        onChange={(v) => setForm((f) => ({ ...f, gender: v as Gender }))}
                        options={GENDER_OPTS}
                        className="mt-1 w-full"
                      />
                    </div>
                    <div>
                      <Label htmlFor="bd">วันเกิด *</Label>
                      <div className="mt-1">
                        <ThaiDatePicker
                          value={form.birth_date}
                          onChange={(iso) => setForm((f) => ({ ...f, birth_date: iso }))}
                          placeholder="เลือกวันเกิด"
                        />
                      </div>
                    </div>
                    <div>
                      <Label htmlFor="cl">ระดับการดูแล</Label>
                      <CustomSelect
                        value={form.care_level}
                        onChange={(v) => setForm((f) => ({ ...f, care_level: v as CareLevel }))}
                        options={CARE_FORM_OPTS}
                        className="mt-1 w-full"
                      />
                    </div>
                  </div>
                </div>

                <div>
                  <div className="mb-2 text-sm font-semibold text-gray-900">
                    จัดเตียง & ค่าบริการ
                  </div>
                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                    <div>
                      <Label htmlFor="bed">เตียง (เลือกจากเตียงว่าง)</Label>
                      <CustomSelect
                        value={form.bed_id}
                        onChange={(v) => setForm((f) => ({ ...f, bed_id: v }))}
                        options={[
                          { value: "", label: "ยังไม่จัด (รอรับเข้า)" },
                          ...availableBeds.map((b) => {
                            const room = roomById.get(b.room_id);
                            return { value: b.id, label: `${room?.name ?? ""} · ${b.name}` };
                          }),
                        ]}
                        className="mt-1 w-full"
                      />
                      <p className="mt-1 text-xs text-gray-400">
                        ไม่จัดเตียง = สถานะ &quot;รอรับเข้า&quot; · จัดเตียง = &quot;พักอาศัย&quot;
                        ทันที
                      </p>
                    </div>
                    <div>
                      <Label htmlFor="pkg">แพ็กเกจค่าบริการ *</Label>
                      <CustomSelect
                        value={form.package_id}
                        onChange={(v) => setForm((f) => ({ ...f, package_id: v }))}
                        options={[
                          { value: "", label: "— เลือกแพ็กเกจ —" },
                          ...SERVICE_PACKAGES.filter((p) => p.is_active).map((p) => ({
                            value: p.id,
                            label: `${p.name} · ${fmtMoney(p.price)}/เดือน`,
                          })),
                        ]}
                        className="mt-1 w-full"
                      />
                    </div>
                  </div>
                </div>

                <div>
                  <div className="mb-2 text-sm font-semibold text-gray-900">
                    ผู้ติดต่อหลัก (ญาติ)
                  </div>
                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                    <div>
                      <Label htmlFor="famn">ชื่อญาติ</Label>
                      <Input
                        id="famn"
                        className="mt-1"
                        value={form.family_name}
                        onChange={(e) => setForm((f) => ({ ...f, family_name: e.target.value }))}
                        placeholder="เช่น นายสมชาย ใจงาม"
                      />
                    </div>
                    <div>
                      <Label htmlFor="famp">เบอร์โทร</Label>
                      <Input
                        id="famp"
                        className="mt-1"
                        value={form.family_phone}
                        onChange={(e) => setForm((f) => ({ ...f, family_phone: e.target.value }))}
                        placeholder="08x-xxx-xxxx"
                      />
                    </div>
                  </div>
                </div>
              </div>
            </DialogBody>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setOpenAdmit(false)}>
                ยกเลิก
              </Button>
              <Button type="submit" disabled={saving}>
                {saving ? "กำลังบันทึก…" : "รับเข้าระบบ"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </NursingShell>
  );
}
