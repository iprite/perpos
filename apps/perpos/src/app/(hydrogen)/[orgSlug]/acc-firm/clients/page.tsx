"use client";

/**
 * ทะเบียนลูกค้าของสำนักงานบัญชี — **หน้าเดียวของลูกค้าทั้งหมด**
 *
 * รวมจากเดิม 2 เมนู (บริษัทลูกค้า = engagement ที่มี org ในระบบ · ลูกค้าบริการ = ทะเบียน+ค่าบริการ)
 * ทะเบียน (`acc_firm_service_clients`) = แหล่งเดียวของ "ลูกค้า" · การเชื่อมระบบ
 * (`acc_firm_clients`) เป็นคุณสมบัติของลูกค้าในทะเบียน จัดการในกล่องแก้ไขของลูกค้ารายนั้น
 */

import React, { useCallback, useEffect, useMemo, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import { toast } from "@/lib/toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { CustomSelect } from "@/components/ui/custom-select";
import { FilterBar, FilterSearch, FilterClear } from "@/components/ui/filter-bar";
import { SegmentedControl } from "@/components/ui/segmented";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogBody,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { StatusBadge } from "@/components/ui/badge";
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
import { TablePager, usePagination } from "@/components/ui/table-pager";
import {
  Plus,
  Check,
  Users,
  Wallet,
  TrendingUp,
  AlertCircle,
  Link2,
  Unlink,
  Trash2,
  Filter,
  LayoutDashboard,
  BookOpenText,
  ArrowUpRight,
  UserCog,
  ShieldCheck,
  ShieldOff,
  BookOpen,
  Building2,
  Phone,
  Landmark,
  FolderLock,
} from "lucide-react";
import { RadioGroup } from "@/components/ui/radio-group";
import { ThaiDatePicker } from "@/components/ui/thai-date-picker";
import { PageShell } from "@/components/ui/page-shell";
import { StatCard as UiStatCard } from "@/components/ui/stat-card";
import type { ServiceClient } from "@/app/api/acc-firm/service-clients/route";
import { summarizeServiceFees } from "@/lib/acc-firm/billing";
import { ClientLineGroupSection } from "./_line-group-section";

/** เงินเต็ม "1,234.56 ฿" — ยอดลบ U+2212 */
function fmtMoney(v: number): string {
  const sign = v < 0 ? "−" : "";
  return `${sign}${Math.abs(v).toLocaleString("th-TH", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })} ฿`;
}

/** ตัวย่อเป็นคำที่สำนักงานใช้จริง — เก็บไว้ แต่ต้องมีคำไทยกำกับเสมอ (title/คำอธิบาย) */
const SERVICE_FLAGS: { key: keyof ServiceClient; label: string; title: string }[] = [
  { key: "svc_invoice", label: "Inv.", title: "ออกใบแจ้งหนี้/ใบกำกับภาษีให้ลูกค้า" },
  { key: "svc_billing", label: "Billing", title: "วางบิล–ติดตามเก็บเงิน" },
  { key: "svc_expense", label: "Expense", title: "บันทึกค่าใช้จ่าย" },
  { key: "svc_sso", label: "SSO", title: "ประกันสังคม (ขึ้นทะเบียน/นำส่งเงินสมทบ)" },
  { key: "svc_pp30", label: "PP.30", title: "ยื่นภาษีมูลค่าเพิ่ม (ภ.พ.30)" },
  { key: "svc_pnd", label: "PND1,3,53", title: "ยื่นภาษีหัก ณ ที่จ่าย (ภ.ง.ด.1, 3, 53)" },
  { key: "svc_pnd51", label: "PND.51", title: "ยื่นภาษีเงินได้นิติบุคคลครึ่งปี (ภ.ง.ด.51)" },
  { key: "svc_pnd50", label: "PND.50", title: "ยื่นภาษีเงินได้นิติบุคคลประจำปี (ภ.ง.ด.50)" },
  { key: "svc_close_f", label: "Close F.", title: "ปิดงบการเงินประจำปี" },
];

// module key ต้องตรงกับ ALL_MODULE_KEYS (lib/modules.ts) — payroll ถูกยุบเป็น hrm แล้ว
const MODULE_OPTIONS = [
  { value: "accounting", label: "Accounting" },
  { value: "hrm", label: "HR" },
];

const MODULE_ICON: Record<string, React.ReactNode> = {
  accounting: <BookOpenText className="h-3.5 w-3.5" />,
  hrm: <Users className="h-3.5 w-3.5" />,
};

const ENGAGEMENT_STATUS = [
  { value: "active", label: "กำลังดูแล" },
  { value: "inactive", label: "พักไว้" },
  { value: "ended", label: "จบงานแล้ว" },
];

/** ประเภทนิติบุคคล — ต้องตรงกับ CHECK ของ acc_firm_service_clients.entity_type */
const ENTITY_TYPE_OPTIONS = [
  { value: "", label: "— ไม่ระบุ —" },
  { value: "company", label: "บริษัทจำกัด" },
  { value: "partnership", label: "ห้างหุ้นส่วน" },
  { value: "juristic_partnership", label: "ห้างหุ้นส่วนนิติบุคคล" },
  { value: "individual", label: "บุคคลธรรมดา" },
  { value: "foundation", label: "มูลนิธิ/สมาคม" },
  { value: "other", label: "อื่น ๆ" },
];

const MONTH_OPTIONS = [
  "มกราคม",
  "กุมภาพันธ์",
  "มีนาคม",
  "เมษายน",
  "พฤษภาคม",
  "มิถุนายน",
  "กรกฎาคม",
  "สิงหาคม",
  "กันยายน",
  "ตุลาคม",
  "พฤศจิกายน",
  "ธันวาคม",
].map((label, i) => ({ value: String(i + 1), label }));

/** กลุ่มข้อมูลในกล่องแก้ไขลูกค้า — แบ่งตามงานที่ทีมทำจริง ไม่ใช่ตามโครงตาราง */
const CLIENT_TABS = [
  { key: "main", label: "ข้อมูลหลัก", icon: <Building2 className="h-4 w-4" /> },
  { key: "contact", label: "ติดต่อ", icon: <Phone className="h-4 w-4" /> },
  { key: "tax", label: "ภาษี/ประกันสังคม", icon: <Landmark className="h-4 w-4" /> },
  { key: "service", label: "บริการ/ค่าบริการ", icon: <Wallet className="h-4 w-4" /> },
  { key: "docs", label: "เอกสาร", icon: <FolderLock className="h-4 w-4" /> },
  { key: "link", label: "เชื่อมระบบ/LINE", icon: <Link2 className="h-4 w-4" />, editOnly: true },
] as { key: ClientTab; label: string; icon: React.ReactNode; editOnly?: boolean }[];

type ClientTab = "main" | "contact" | "tax" | "service" | "docs" | "link";

/** ช่องทางที่ลูกค้าส่งเอกสารมาให้สำนักงาน */
const DOC_CHANNEL_OPTIONS = [
  { value: "", label: "— ไม่ระบุ —" },
  { value: "line", label: "ส่งทาง LINE" },
  { value: "pickup", label: "สำนักงานไปรับเอง" },
  { value: "onsite", label: "ลูกค้านำมาส่งที่สำนักงาน" },
  { value: "post", label: "ไปรษณีย์/ขนส่ง" },
  { value: "other", label: "อื่น ๆ" },
];

const EMPTY_FORM = {
  client_code: "",
  company_name: "",
  tax_id: "",
  entity_type: "",
  vat_registered: false,
  fiscal_year_end_month: "12",
  fiscal_year_end_day: "31",
  storage_location: "",
  dbd_relocation_notified: false,
  contact_name: "",
  contact_phone: "",
  contact_email: "",
  address: "",
  branch_code: "00000",
  vat_registered_date: "",
  sso_registered: false,
  sso_employer_no: "",
  efiling_enabled: false,
  accountant_name: "",
  accountant_license: "",
  auditor_name: "",
  auditor_license: "",
  doc_due_day: "",
  doc_channel: "",
  fee_2023: "",
  fee_2024: "",
  fee_2025: "",
  fee_2026: "",
  fee_yearly: "",
  billing_note: "",
  svc_invoice: false,
  svc_billing: false,
  svc_expense: false,
  svc_sso: false,
  svc_pp30: false,
  svc_pnd: false,
  svc_pnd51: false,
  svc_pnd50: false,
  svc_close_f: false,
  note: "",
  is_active: true,
};

type FormState = typeof EMPTY_FORM;

type FirmMember = {
  userId: string;
  firmRole: string;
  displayName: string;
  email: string;
  avatarUrl: string | null;
  hasAccess: boolean;
  accessModules: string[];
};

/** วัน-เวลาไทยแบบสั้น "29 ก.ค. 2569 17:05" */
function fmtDateTime(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  const TH = [
    "ม.ค.",
    "ก.พ.",
    "มี.ค.",
    "เม.ย.",
    "พ.ค.",
    "มิ.ย.",
    "ก.ค.",
    "ส.ค.",
    "ก.ย.",
    "ต.ค.",
    "พ.ย.",
    "ธ.ค.",
  ];
  const hh = String(d.getHours()).padStart(2, "0");
  const mm = String(d.getMinutes()).padStart(2, "0");
  return `${d.getDate()} ${TH[d.getMonth()]} ${d.getFullYear() + 543} ${hh}:${mm}`;
}

/** ค่าบริการ: "12,000 ฿" หรือ null/0 → "—" */
function fmtFeeMonthly(v: number | null) {
  if (v == null || v === 0) return "—";
  return `${v.toLocaleString("th-TH", { minimumFractionDigits: 0 })} ฿`;
}

/**
 * ค่าบริการ/ปี ของลูกค้า:
 * - ถ้าตั้งค่ารายปีไว้ (fee_yearly) → ใช้ค่านั้น (ลูกค้าที่ชำระเป็นรายปี)
 * - ไม่งั้น ถ้าจ่ายรายเดือน (fee ปีนี้ > 0) → รายเดือน × 12
 */
function annualFee(monthly: number, feeYearly: number | null): number | null {
  if (feeYearly && feeYearly > 0) return feeYearly;
  if (monthly > 0) return monthly * 12;
  return null;
}

export default function AccFirmClientsPage() {
  const { orgSlug } = useParams<{ orgSlug: string }>();
  const supabase = useMemo(() => createSupabaseBrowserClient(), []);

  const [orgId, setOrgId] = useState("");
  const [token, setToken] = useState("");
  const [isAdmin, setIsAdmin] = useState(false);
  /** สิทธิ์แก้ทะเบียน — viewer แก้ไม่ได้ (ตรงกับด่านใน POST/PATCH) */
  const [canWrite, setCanWrite] = useState(true);
  const [clients, setClients] = useState<ServiceClient[]>([]);
  /** id ของลูกค้าที่ผูกกลุ่ม LINE แล้ว */
  const [lineGroups, setLineGroups] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState("");
  const [showInactive, setShowInactive] = useState(false);
  const [showSummary, setShowSummary] = useState(true);
  const [showFilters, setShowFilters] = useState(false);

  const [dialogOpen, setDialogOpen] = useState(false);
  const [tab, setTab] = useState<ClientTab>("main");
  const [editing, setEditing] = useState<ServiceClient | null>(null);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [saving, setSaving] = useState(false);

  // การเชื่อมระบบ (engagement) ในกล่องแก้ไข
  const [availableOrgs, setAvailableOrgs] = useState<{ value: string; label: string }[]>([]);
  const [linkOrgId, setLinkOrgId] = useState("");
  const [linkModules, setLinkModules] = useState<string[]>(["accounting"]);
  const [linkSaving, setLinkSaving] = useState(false);
  const [confirmUnlink, setConfirmUnlink] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);

  // จัดการสิทธิ์ทีม (provision) ของลูกค้าที่เชื่อมระบบแล้ว
  const [provClient, setProvClient] = useState<ServiceClient | null>(null);
  const [firmMembers, setFirmMembers] = useState<FirmMember[]>([]);
  const [provLoading, setProvLoading] = useState(false);
  const [provSaving, setProvSaving] = useState<string | null>(null);

  // Init: resolve org + role
  useEffect(() => {
    (async () => {
      const [{ data: org }, { data: sess }] = await Promise.all([
        supabase.from("organizations").select("id").eq("slug", orgSlug).single(),
        supabase.auth.getSession(),
      ]);
      if (org) setOrgId(org.id);
      if (sess?.session) {
        setToken(sess.session.access_token);
        const { data: profile } = await supabase
          .from("profiles")
          .select("role")
          .eq("id", sess.session.user.id)
          .maybeSingle();
        setIsAdmin(profile?.role === "super_admin");
      }
    })();
  }, [supabase, orgSlug]);

  const load = useCallback(async () => {
    if (!orgId || !token) return;
    setLoading(true);
    const [res, groupRes] = await Promise.all([
      fetch(`/api/acc-firm/service-clients?orgId=${orgId}`, {
        headers: { Authorization: `Bearer ${token}` },
      }),
      fetch(`/api/acc-firm/client-line-group?orgId=${orgId}`, {
        headers: { Authorization: `Bearer ${token}` },
      }),
    ]);
    if (res.ok) {
      const json = (await res.json()) as { clients: ServiceClient[]; canWrite: boolean };
      setClients(json.clients ?? []);
      setCanWrite(json.canWrite);
    }
    if (groupRes.ok) {
      const j = (await groupRes.json()) as {
        rows: { service_client_id: string; status: string }[];
      };
      setLineGroups(
        new Set(
          (j.rows ?? []).filter((r) => r.status === "linked").map((r) => r.service_client_id),
        ),
      );
    }
    setLoading(false);
  }, [orgId, token]);

  useEffect(() => {
    load();
  }, [load]);

  // รายชื่อ org ที่เชื่อมได้ — SEC-1: enumerate org ได้เฉพาะ super_admin
  useEffect(() => {
    if (!orgId || !token || !isAdmin) return;
    (async () => {
      const res = await fetch(`/api/acc-firm/eligible-clients?orgId=${orgId}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) return;
      const j = (await res.json()) as { orgs?: { id: string; name: string }[] };
      setAvailableOrgs((j.orgs ?? []).map((o) => ({ value: o.id, label: o.name })));
    })();
  }, [orgId, token, isAdmin]);

  const linkedOrgIds = useMemo(
    () => new Set(clients.map((c) => c.client_org_id).filter(Boolean) as string[]),
    [clients],
  );

  function openAdd() {
    setTab("main");
    setEditing(null);
    setForm(EMPTY_FORM);
    setLinkOrgId("");
    setLinkModules(["accounting"]);
    setDialogOpen(true);
  }

  function openEdit(c: ServiceClient) {
    setTab("main");
    setEditing(c);
    setConfirmUnlink(false);
    setConfirmDelete(false);
    setForm({
      client_code: c.client_code,
      company_name: c.company_name,
      tax_id: c.tax_id ?? "",
      entity_type: c.entity_type ?? "",
      vat_registered: c.vat_registered,
      fiscal_year_end_month: String(c.fiscal_year_end_month ?? 12),
      fiscal_year_end_day: String(c.fiscal_year_end_day ?? 31),
      storage_location: c.storage_location ?? "",
      dbd_relocation_notified: c.dbd_relocation_notified,
      contact_name: c.contact_name ?? "",
      contact_phone: c.contact_phone ?? "",
      contact_email: c.contact_email ?? "",
      address: c.address ?? "",
      branch_code: c.branch_code ?? "00000",
      vat_registered_date: c.vat_registered_date ?? "",
      sso_registered: c.sso_registered ?? false,
      sso_employer_no: c.sso_employer_no ?? "",
      efiling_enabled: c.efiling_enabled ?? false,
      accountant_name: c.accountant_name ?? "",
      accountant_license: c.accountant_license ?? "",
      auditor_name: c.auditor_name ?? "",
      auditor_license: c.auditor_license ?? "",
      doc_due_day: c.doc_due_day != null ? String(c.doc_due_day) : "",
      doc_channel: c.doc_channel ?? "",
      fee_2023: c.fee_2023 != null ? String(c.fee_2023) : "",
      fee_2024: c.fee_2024 != null ? String(c.fee_2024) : "",
      fee_2025: c.fee_2025 != null ? String(c.fee_2025) : "",
      fee_2026: c.fee_2026 != null ? String(c.fee_2026) : "",
      fee_yearly: c.fee_yearly != null ? String(c.fee_yearly) : "",
      billing_note: c.billing_note ?? "",
      svc_invoice: c.svc_invoice,
      svc_billing: c.svc_billing,
      svc_expense: c.svc_expense,
      svc_sso: c.svc_sso,
      svc_pp30: c.svc_pp30,
      svc_pnd: c.svc_pnd,
      svc_pnd51: c.svc_pnd51,
      svc_pnd50: c.svc_pnd50,
      svc_close_f: c.svc_close_f,
      note: c.note ?? "",
      is_active: c.is_active,
    });
    setLinkOrgId("");
    setLinkModules(c.engagement?.modules_managed ?? ["accounting"]);
    setDialogOpen(true);
  }

  async function save() {
    if (!orgId || !form.client_code || !form.company_name) return;
    setSaving(true);

    const body = editing ? { orgId, id: editing.id, ...form } : { orgId, ...form };

    const res = await fetch("/api/acc-firm/service-clients", {
      method: editing ? "PATCH" : "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify(body),
    });
    setSaving(false);
    if (res.ok) {
      setDialogOpen(false);
      load();
      toast.success("บันทึกแล้ว");
    } else {
      const e = await res.json().catch(() => ({}));
      toast.error(e.error ?? "บันทึกไม่สำเร็จ");
    }
  }

  function toggleFlag(key: keyof FormState) {
    setForm((f) => ({ ...f, [key]: !f[key as keyof typeof f] }));
  }

  const toggleLinkModule = (mod: string) =>
    setLinkModules((ms) => (ms.includes(mod) ? ms.filter((m) => m !== mod) : [...ms, mod]));

  // ── เชื่อมลูกค้าเข้ากับ org ในระบบ (super_admin) ─────────────────────────────
  async function linkOrg() {
    if (!editing || !linkOrgId || linkModules.length === 0) return;
    setLinkSaving(true);
    const res = await fetch("/api/acc-firm/clients", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({
        firmOrgId: orgId,
        clientOrgId: linkOrgId,
        serviceClientId: editing.id,
        modulesManaged: linkModules,
        note: form.note || null,
      }),
    });
    setLinkSaving(false);
    if (!res.ok) {
      const e = await res.json().catch(() => ({}));
      toast.error(e.error ?? "เชื่อมระบบไม่สำเร็จ");
      return;
    }
    toast.success("เชื่อมระบบแล้ว");
    setDialogOpen(false);
    load();
  }

  // ── เลิกเชื่อม org (super_admin) — ถอนสิทธิ์ทีมออกจาก org ลูกค้าให้ด้วย ────────
  async function unlinkOrg() {
    const eng = editing?.engagement;
    if (!eng) return;
    setLinkSaving(true);
    const res = await fetch("/api/acc-firm/clients", {
      method: "DELETE",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ id: eng.id, firmOrgId: orgId }),
    });
    setLinkSaving(false);
    setConfirmUnlink(false);
    if (!res.ok) {
      const e = await res.json().catch(() => ({}));
      toast.error(e.error ?? "เลิกเชื่อมไม่สำเร็จ");
      return;
    }
    toast.success("เลิกเชื่อมแล้ว — ถอนสิทธิ์ทีมออกจากบัญชีลูกค้าเรียบร้อย");
    setDialogOpen(false);
    load();
  }

  // ── ลบลูกค้าออกจากทะเบียน (เฉพาะรายที่ยังไม่มีข้อมูลผูก) ────────────────────
  async function removeClient() {
    if (!editing) return;
    setDeleting(true);
    const res = await fetch("/api/acc-firm/service-clients", {
      method: "DELETE",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ orgId, id: editing.id }),
    });
    setDeleting(false);
    setConfirmDelete(false);
    if (!res.ok) {
      const e = await res.json().catch(() => ({}));
      toast.error(e.error ?? "ลบไม่สำเร็จ");
      return;
    }
    toast.success("ลบลูกค้าออกจากทะเบียนแล้ว");
    setDialogOpen(false);
    load();
  }

  // ── แก้ engagement (modules / สถานะ) — super_admin ──────────────────────────
  async function saveEngagement(status?: string) {
    const eng = editing?.engagement;
    if (!eng) return;
    setLinkSaving(true);
    const res = await fetch("/api/acc-firm/clients", {
      method: "PATCH",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({
        id: eng.id,
        firmOrgId: orgId,
        modulesManaged: linkModules,
        status: status ?? eng.status,
      }),
    });
    setLinkSaving(false);
    if (!res.ok) {
      const e = await res.json().catch(() => ({}));
      toast.error(e.error ?? "บันทึกการเชื่อมระบบไม่สำเร็จ");
      return;
    }
    toast.success("บันทึกการเชื่อมระบบแล้ว");
    load();
  }

  // ── จัดการสิทธิ์ทีมของสำนักงานต่อ org ลูกค้า ────────────────────────────────
  const openProvision = useCallback(
    async (client: ServiceClient) => {
      if (!client.client_org_id) return;
      setProvClient(client);
      setFirmMembers([]);
      setProvLoading(true);
      const res = await fetch(
        `/api/acc-firm/provision?firmOrgId=${orgId}&clientOrgId=${client.client_org_id}`,
        { headers: { Authorization: `Bearer ${token}` } },
      );
      if (res.ok) {
        const json = await res.json();
        setFirmMembers(json.members ?? []);
      }
      setProvLoading(false);
    },
    [orgId, token],
  );

  const toggleAccess = useCallback(
    async (member: FirmMember) => {
      if (!provClient?.client_org_id) return;
      setProvSaving(member.userId);
      const payload = {
        firmOrgId: orgId,
        clientOrgId: provClient.client_org_id,
        userId: member.userId,
        modules: provClient.engagement?.modules_managed ?? ["accounting"],
      };
      const res = await fetch("/api/acc-firm/provision", {
        method: member.hasAccess ? "DELETE" : "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify(payload),
      });
      await openProvision(provClient);
      setProvSaving(null);
      if (!res.ok) {
        toast.error("ปรับสิทธิ์เข้าถึงไม่สำเร็จ");
        return;
      }
      toast.success(member.hasAccess ? "ยกเลิกสิทธิ์เข้าถึงแล้ว" : "ให้สิทธิ์เข้าถึงแล้ว");
    },
    [provClient, orgId, token, openProvision],
  );

  const filtered = clients.filter((c) => {
    if (!showInactive && !c.is_active) return false;
    if (search) {
      const q = search.toLowerCase();
      return c.company_name.toLowerCase().includes(q) || c.client_code.toLowerCase().includes(q);
    }
    return true;
  });
  const pager = usePagination(filtered);
  const hasFilter = !!search || showInactive;

  // Current CE year → map to fee column
  const year = new Date().getFullYear();
  const feeKey = `fee_${year}` as keyof ServiceClient;
  const totalRevenue = filtered.reduce((s, c) => s + Number(c[feeKey] ?? 0), 0);
  // เกณฑ์เดียวกับคอลัมน์ "เชื่อม LINE PERPOS" ในตาราง — ผูก org แล้ว = เชื่อมแล้ว
  const linkedCount = filtered.filter((c) => !!c.client_org_id).length;

  // F2: สรุปรายได้ค่าบริการของ firm (จาก client ทั้งหมดที่โหลดมา)
  const feeSummary = useMemo(() => summarizeServiceFees(clients, year), [clients, year]);
  const yoyDirection: "up" | "down" | "flat" =
    feeSummary.yoyPct == null
      ? "flat"
      : feeSummary.yoyPct > 0
        ? "up"
        : feeSummary.yoyPct < 0
          ? "down"
          : "flat";

  return (
    <PageShell
      width="wide"
      icon={<Users className="h-6 w-6" />}
      title="ลูกค้า"
      description="ทะเบียนลูกค้าของสำนักงาน — ค่าบริการ งานที่รับ และการเชื่อมระบบ"
      actions={
        <>
          <Button
            variant={showSummary ? "secondary" : "outline"}
            size="icon"
            title={showSummary ? "ซ่อนการ์ดสรุป" : "แสดงการ์ดสรุป"}
            aria-expanded={showSummary}
            onClick={() => setShowSummary((v) => !v)}
          >
            <LayoutDashboard className="h-4 w-4" />
          </Button>
          <Button
            variant={showFilters || hasFilter ? "secondary" : "outline"}
            size="icon"
            title="ตัวกรอง"
            className="relative"
            onClick={() => setShowFilters((v) => !v)}
          >
            <Filter className="h-4 w-4" />
            {hasFilter && (
              <span className="absolute -right-0.5 -top-0.5 h-2 w-2 rounded-full bg-amber-500" />
            )}
          </Button>
          {canWrite && (
            <Button onClick={openAdd}>
              <Plus className="mr-1 h-4 w-4" /> เพิ่มลูกค้า
            </Button>
          )}
        </>
      }
    >
      {/* F2: สรุปรายได้ค่าบริการของสำนักงานบัญชี */}
      <div className={showSummary ? "grid grid-cols-1 gap-3 sm:grid-cols-3" : "hidden"}>
        <UiStatCard
          icon={<Wallet className="h-4 w-4" />}
          label={`รายได้ค่าบริการปี ${feeSummary.feeYear + 543}`}
          value={fmtMoney(feeSummary.totalThisYear)}
          sub={`เทียบปีก่อน ${fmtMoney(feeSummary.totalLastYear)}`}
          tone="positive"
          valueColored
        />
        <UiStatCard
          icon={<TrendingUp className="h-4 w-4" />}
          label="เทียบปีก่อน (YoY)"
          value={
            feeSummary.yoyPct == null
              ? "—"
              : `${feeSummary.yoyPct >= 0 ? "+" : "−"}${Math.abs(feeSummary.yoyPct).toLocaleString(
                  "th-TH",
                  { minimumFractionDigits: 1, maximumFractionDigits: 1 },
                )}%`
          }
          sub={feeSummary.yoyPct == null ? "ยังไม่มีฐานปีก่อน" : "การเปลี่ยนแปลงรายได้รวม"}
          tone={
            feeSummary.yoyPct == null ? "neutral" : feeSummary.yoyPct >= 0 ? "positive" : "negative"
          }
          valueColored={feeSummary.yoyPct != null}
          delta={
            feeSummary.yoyPct == null
              ? undefined
              : {
                  label: `${Math.abs(feeSummary.yoyPct).toFixed(1)}%`,
                  direction: yoyDirection,
                }
          }
        />
        <UiStatCard
          icon={<AlertCircle className="h-4 w-4" />}
          label="ยังไม่ตั้งค่าบริการปีนี้"
          value={`${feeSummary.unbilledClients.length} ราย`}
          sub={
            feeSummary.unbilledClients.length > 0
              ? "ลูกค้าที่ยังไม่ระบุค่าบริการ (รายได้รั่ว)"
              : "ตั้งค่าบริการครบทุกราย"
          }
          tone={feeSummary.unbilledClients.length > 0 ? "warning" : "neutral"}
        />
      </div>
      {feeSummary.yearWarning && (
        <p className="-mt-1 text-xs text-amber-600">{feeSummary.yearWarning}</p>
      )}

      {/* Stats */}
      <div className={showSummary ? "grid grid-cols-2 gap-3 sm:grid-cols-3" : "hidden"}>
        <StatCard label="ลูกค้าทั้งหมด" value={filtered.length} unit="ราย" />
        <StatCard
          label={`ค่าบริการปี ${year + 543}`}
          value={totalRevenue}
          unit="บาท/เดือน"
          isMoney
        />
        <StatCard label="เชื่อม LINE PERPOS แล้ว" value={linkedCount} unit="ราย" />
      </div>

      {showFilters && (
        <FilterBar>
          <FilterSearch value={search} onChange={setSearch} placeholder="ค้นหาชื่อบริษัท / รหัส" />
          <SegmentedControl
            value={showInactive ? "all" : "active"}
            onChange={(v) => setShowInactive(v === "all")}
            ariaLabel="สถานะลูกค้า"
            options={[
              { value: "active", label: "ใช้งาน" },
              { value: "all", label: "รวมที่ยกเลิก" },
            ]}
          />
          <FilterClear
            disabled={!hasFilter}
            onClick={() => {
              setSearch("");
              setShowInactive(false);
            }}
          />
        </FilterBar>
      )}

      {/* Table */}
      <Table stickyHeader fillViewport>
        <TableHeader sticky>
          <TableRow>
            <TableHead>ลูกค้า</TableHead>
            <TableHead align="right">ค่าบริการ/เดือน</TableHead>
            <TableHead align="right">ค่าบริการ/ปี</TableHead>
            <TableHead>บริการ</TableHead>
            <TableHead align="center">เชื่อม LINE PERPOS</TableHead>
            <TableHead align="center">กลุ่ม LINE</TableHead>
            <TableHead align="center">สถานะ</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {loading ? (
            <TableLoading colSpan={7} />
          ) : filtered.length === 0 ? (
            <TableEmpty colSpan={7}>ไม่พบรายการ</TableEmpty>
          ) : (
            pager.rows.map((c) => (
              <TableRow
                key={c.id}
                clickable
                onClick={() => openEdit(c)}
                className={!c.is_active ? "opacity-60" : ""}
              >
                <TableCell className="max-w-[320px]">
                  <div className="flex items-center gap-2.5">
                    <span className="shrink-0 rounded bg-gray-100 px-1.5 py-0.5 font-mono text-xs text-gray-600">
                      {c.client_code}
                    </span>
                    <div className="min-w-0">
                      <div className="truncate font-medium text-gray-800" title={c.company_name}>
                        {c.company_name}
                      </div>
                      {c.billing_note && (
                        <div className="truncate text-xs text-gray-400">{c.billing_note}</div>
                      )}
                    </div>
                  </div>
                </TableCell>
                <TableCell align="right" className="font-medium tabular-nums text-gray-800">
                  {Number(c[feeKey] ?? 0) > 0 ? (
                    fmtFeeMonthly(Number(c[feeKey]))
                  ) : (
                    <span className="text-xs font-normal text-gray-300">—</span>
                  )}
                </TableCell>
                <TableCell align="right" className="tabular-nums text-gray-500">
                  {(() => {
                    const yearly = annualFee(Number(c[feeKey] ?? 0), c.fee_yearly);
                    return yearly ? (
                      fmtFeeMonthly(yearly)
                    ) : (
                      <span className="text-xs text-gray-300">—</span>
                    );
                  })()}
                </TableCell>
                <TableCell>
                  <ServiceFlags client={c} />
                </TableCell>
                <TableCell align="center">
                  <StatusBadge tone={c.client_org_id ? "success" : "neutral"}>
                    {c.client_org_id ? "เชื่อมแล้ว" : "ยังไม่เชื่อม"}
                  </StatusBadge>
                </TableCell>
                <TableCell align="center">
                  <StatusBadge tone={lineGroups.has(c.id) ? "success" : "neutral"}>
                    {lineGroups.has(c.id) ? "เชื่อมแล้ว" : "ยังไม่เชื่อม"}
                  </StatusBadge>
                </TableCell>
                <TableCell align="center">
                  <StatusBadge tone={c.is_active ? "success" : "neutral"}>
                    {c.is_active ? "ใช้งาน" : "ยกเลิก"}
                  </StatusBadge>
                </TableCell>
              </TableRow>
            ))
          )}
        </TableBody>
      </Table>
      <TablePager pager={pager} unit="ราย" />

      {/* Add/Edit Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent size="xl">
          <DialogHeader>
            <DialogTitle>{editing ? "แก้ไขลูกค้า" : "เพิ่มลูกค้า"}</DialogTitle>
          </DialogHeader>

          <DialogBody>
            <div className="space-y-4">
              {/* แถบกลุ่มข้อมูล — ฟอร์มยาวเกินกว่าจะไล่ทีเดียว แบ่งเป็นกลุ่มตามงานที่ทำจริง */}
              <SegmentedControl
                value={tab}
                onChange={(v) => setTab(v as ClientTab)}
                ariaLabel="กลุ่มข้อมูลลูกค้า"
                options={CLIENT_TABS.filter((t) => !t.editOnly || !!editing).map((t) => ({
                  value: t.key,
                  label: t.label,
                  icon: t.icon,
                }))}
              />

              {/* ── ข้อมูลหลัก ───────────────────────────────────────────── */}
              {tab === "main" && (
                <div className="space-y-4">
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <Label>รหัสลูกค้า *</Label>
                      <Input
                        value={form.client_code}
                        onChange={(e) => setForm((f) => ({ ...f, client_code: e.target.value }))}
                        placeholder="เช่น IN01, C01"
                      />
                    </div>
                    <div>
                      <Label>ประเภทนิติบุคคล</Label>
                      <CustomSelect
                        value={form.entity_type}
                        onChange={(v) => setForm((f) => ({ ...f, entity_type: v }))}
                        options={ENTITY_TYPE_OPTIONS}
                      />
                    </div>
                    <div className="col-span-2">
                      <Label>ชื่อบริษัท *</Label>
                      <Input
                        value={form.company_name}
                        onChange={(e) => setForm((f) => ({ ...f, company_name: e.target.value }))}
                        placeholder="บริษัท ... จำกัด"
                      />
                    </div>
                    <div>
                      <Label>เลขประจำตัวผู้เสียภาษี (13 หลัก)</Label>
                      <Input
                        value={form.tax_id}
                        onChange={(e) =>
                          setForm((f) => ({ ...f, tax_id: e.target.value.replace(/\D/g, "") }))
                        }
                        inputMode="numeric"
                        maxLength={13}
                        placeholder="0105xxxxxxxxx"
                      />
                    </div>
                    <div>
                      <Label>สาขา (ตามใบกำกับภาษี)</Label>
                      <Input
                        value={form.branch_code}
                        onChange={(e) =>
                          setForm((f) => ({
                            ...f,
                            branch_code: e.target.value.replace(/\D/g, "").slice(0, 5),
                          }))
                        }
                        inputMode="numeric"
                        maxLength={5}
                        placeholder="00000"
                      />
                      <p className="mt-1 text-xs text-gray-400">
                        00000 = สำนักงานใหญ่ · 00001 = สาขาที่ 1 (ต้องระบุในใบกำกับภาษี ม.86/4)
                      </p>
                    </div>
                  </div>

                  {editing && (
                    <div>
                      <Label>สถานะลูกค้า</Label>
                      <div className="mt-1">
                        <RadioGroup
                          name="client-active"
                          value={form.is_active ? "active" : "inactive"}
                          onChange={(v) => setForm((f) => ({ ...f, is_active: v === "active" }))}
                          ariaLabel="สถานะลูกค้า"
                          options={[
                            { value: "active", label: "ใช้งาน", hint: "ยังรับทำบัญชีให้อยู่" },
                            { value: "inactive", label: "ยกเลิก", hint: "เลิกจ้าง/หยุดให้บริการ" },
                          ]}
                        />
                      </div>
                    </div>
                  )}

                  <div>
                    <Label>หมายเหตุ</Label>
                    <Input
                      value={form.note}
                      onChange={(e) => setForm((f) => ({ ...f, note: e.target.value }))}
                      placeholder="หมายเหตุเพิ่มเติม"
                    />
                  </div>
                </div>
              )}

              {/* ── ข้อมูลติดต่อ ─────────────────────────────────────────── */}
              {tab === "contact" && (
                <div className="space-y-4">
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <Label>ชื่อผู้ติดต่อ</Label>
                      <Input
                        value={form.contact_name}
                        onChange={(e) => setForm((f) => ({ ...f, contact_name: e.target.value }))}
                        placeholder="เช่น คุณสมชาย (ฝ่ายบัญชี)"
                      />
                    </div>
                    <div>
                      <Label>เบอร์โทร</Label>
                      <Input
                        value={form.contact_phone}
                        onChange={(e) => setForm((f) => ({ ...f, contact_phone: e.target.value }))}
                        inputMode="tel"
                        placeholder="08x-xxx-xxxx"
                      />
                    </div>
                    <div className="col-span-2">
                      <Label>อีเมล</Label>
                      <Input
                        value={form.contact_email}
                        onChange={(e) => setForm((f) => ({ ...f, contact_email: e.target.value }))}
                        type="email"
                        placeholder="name@company.co.th"
                      />
                    </div>
                    <div className="col-span-2">
                      <Label>ที่อยู่จดทะเบียน</Label>
                      <Input
                        value={form.address}
                        onChange={(e) => setForm((f) => ({ ...f, address: e.target.value }))}
                        placeholder="เลขที่ ... ถนน ... แขวง/ตำบล ... เขต/อำเภอ ... จังหวัด ... รหัสไปรษณีย์"
                      />
                      <p className="mt-1 text-xs text-gray-400">
                        ใช้เป็นที่อยู่บนใบกำกับภาษี/แบบยื่นภาษีของลูกค้า
                      </p>
                    </div>
                  </div>
                </div>
              )}

              {/* ── ภาษี / ประกันสังคม / รอบบัญชี ───────────────────────── */}
              {tab === "tax" && (
                <div className="space-y-4">
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <Label>จดทะเบียนภาษีมูลค่าเพิ่ม (VAT)</Label>
                      <div className="mt-1">
                        <RadioGroup
                          name="vat-registered"
                          value={form.vat_registered ? "yes" : "no"}
                          onChange={(v) => setForm((f) => ({ ...f, vat_registered: v === "yes" }))}
                          ariaLabel="จดทะเบียน VAT"
                          options={[
                            { value: "yes", label: "จดทะเบียน", hint: "ต้องยื่น ภ.พ.30 ทุกเดือน" },
                            { value: "no", label: "ไม่ได้จด" },
                          ]}
                        />
                      </div>
                    </div>
                    <div>
                      <Label>วันที่จดทะเบียน VAT</Label>
                      <ThaiDatePicker
                        value={form.vat_registered_date}
                        onChange={(iso) => setForm((f) => ({ ...f, vat_registered_date: iso }))}
                        placeholder={form.vat_registered ? "เลือกวันที่" : "— ไม่ได้จด VAT —"}
                      />
                    </div>
                  </div>

                  <div>
                    <Label>วันสิ้นรอบบัญชี</Label>
                    <div className="mt-1 flex gap-2">
                      <CustomSelect
                        value={form.fiscal_year_end_day}
                        onChange={(v) => setForm((f) => ({ ...f, fiscal_year_end_day: v }))}
                        options={Array.from({ length: 31 }, (_, i) => ({
                          value: String(i + 1),
                          label: String(i + 1),
                        }))}
                        className="w-20"
                      />
                      <CustomSelect
                        value={form.fiscal_year_end_month}
                        onChange={(v) => setForm((f) => ({ ...f, fiscal_year_end_month: v }))}
                        options={MONTH_OPTIONS}
                        className="w-40"
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <Label>ประกันสังคม</Label>
                      <div className="mt-1">
                        <RadioGroup
                          name="sso-registered"
                          value={form.sso_registered ? "yes" : "no"}
                          onChange={(v) => setForm((f) => ({ ...f, sso_registered: v === "yes" }))}
                          ariaLabel="ขึ้นทะเบียนประกันสังคม"
                          options={[
                            {
                              value: "yes",
                              label: "ขึ้นทะเบียนแล้ว",
                              hint: "นำส่งเงินสมทบทุกเดือน",
                            },
                            { value: "no", label: "ยังไม่ขึ้นทะเบียน" },
                          ]}
                        />
                      </div>
                    </div>
                    <div>
                      <Label>เลขที่บัญชีนายจ้าง (สปส.)</Label>
                      <Input
                        value={form.sso_employer_no}
                        onChange={(e) =>
                          setForm((f) => ({ ...f, sso_employer_no: e.target.value }))
                        }
                        placeholder="เช่น 1000xxxxxxx"
                      />
                    </div>
                  </div>

                  <div>
                    <Label>ช่องทางยื่นแบบ</Label>
                    <div className="mt-1">
                      <RadioGroup
                        name="efiling"
                        value={form.efiling_enabled ? "efiling" : "paper"}
                        onChange={(v) =>
                          setForm((f) => ({ ...f, efiling_enabled: v === "efiling" }))
                        }
                        ariaLabel="ช่องทางยื่นแบบ"
                        options={[
                          { value: "efiling", label: "e-Filing (สรรพากรออนไลน์)" },
                          { value: "paper", label: "ยื่นกระดาษที่สรรพากรพื้นที่" },
                        ]}
                      />
                    </div>
                    <p className="mt-1 text-xs text-gray-400">
                      บันทึกแค่ช่องทาง — ห้ามเก็บรหัสผ่าน e-Filing ของลูกค้าไว้ในระบบ
                    </p>
                  </div>
                </div>
              )}

              {/* ── บริการและค่าบริการ ──────────────────────────────────── */}
              {tab === "service" && (
                <div className="space-y-4">
                  <div>
                    <p className="mb-2 text-sm font-medium text-gray-700">บริการที่ให้</p>
                    <div className="flex flex-wrap gap-2">
                      {SERVICE_FLAGS.map(({ key, label, title }) => {
                        const on = form[key as keyof FormState] as boolean;
                        return (
                          <button
                            key={key}
                            type="button"
                            title={title}
                            onClick={() => toggleFlag(key as keyof FormState)}
                            className={`flex flex-col items-start rounded-lg border px-3 py-1.5 transition-colors ${
                              on
                                ? "border-blue-600 bg-blue-600 text-white"
                                : "border-gray-200 bg-white text-gray-600 hover:border-blue-300"
                            }`}
                          >
                            <span className="text-sm font-medium">{label}</span>
                            <span
                              className={`text-[11px] ${on ? "text-white/80" : "text-gray-400"}`}
                            >
                              {title}
                            </span>
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  <div>
                    <p className="mb-2 text-sm font-medium text-gray-700">
                      ค่าบริการรายเดือน (บาท)
                    </p>
                    <div className="grid grid-cols-4 gap-3">
                      {([2023, 2024, 2025, 2026] as const).map((y) => (
                        <div key={y}>
                          <Label className="text-xs">ปี {y + 543}</Label>
                          <Input
                            type="number"
                            value={(form as Record<string, unknown>)[`fee_${y}`] as string}
                            onChange={(e) =>
                              setForm((f) => ({ ...f, [`fee_${y}`]: e.target.value }))
                            }
                            placeholder="0"
                          />
                        </div>
                      ))}
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <Label>ค่าบริการรายปี (บาท)</Label>
                      <Input
                        type="number"
                        value={form.fee_yearly}
                        onChange={(e) => setForm((f) => ({ ...f, fee_yearly: e.target.value }))}
                        placeholder="0"
                      />
                      <p className="mt-1 text-xs text-gray-400">
                        สำหรับลูกค้าที่ชำระเป็นรายปี — ปล่อยว่างถ้าคิดรายเดือน
                      </p>
                    </div>
                    <div>
                      <Label>หมายเหตุค่าบริการ</Label>
                      <Input
                        value={form.billing_note}
                        onChange={(e) => setForm((f) => ({ ...f, billing_note: e.target.value }))}
                        placeholder="เช่น ชำระล่วงหน้าทั้งปี"
                      />
                    </div>
                  </div>
                </div>
              )}

              {/* ── เอกสาร / ผู้รับผิดชอบวิชาชีพ ────────────────────────── */}
              {tab === "docs" && (
                <div className="space-y-4">
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <Label>วันที่ลูกค้าส่งเอกสารประจำเดือน</Label>
                      <CustomSelect
                        value={form.doc_due_day}
                        onChange={(v) => setForm((f) => ({ ...f, doc_due_day: v }))}
                        options={[
                          { value: "", label: "— ไม่กำหนด —" },
                          ...Array.from({ length: 31 }, (_, i) => ({
                            value: String(i + 1),
                            label: `วันที่ ${i + 1} ของเดือนถัดไป`,
                          })),
                        ]}
                      />
                    </div>
                    <div>
                      <Label>ช่องทางรับเอกสาร</Label>
                      <CustomSelect
                        value={form.doc_channel}
                        onChange={(v) => setForm((f) => ({ ...f, doc_channel: v }))}
                        options={DOC_CHANNEL_OPTIONS}
                      />
                    </div>
                  </div>

                  <div>
                    <Label>สถานที่เก็บเอกสาร</Label>
                    <Input
                      value={form.storage_location}
                      onChange={(e) => setForm((f) => ({ ...f, storage_location: e.target.value }))}
                      placeholder="เช่น สำนักงานบัญชี ชั้น 3 ห้องเก็บเอกสาร"
                    />
                    {form.storage_location.trim() !== "" && (
                      <label className="mt-2 flex cursor-pointer items-center gap-2">
                        <input
                          type="checkbox"
                          checked={form.dbd_relocation_notified}
                          onChange={(e) =>
                            setForm((f) => ({ ...f, dbd_relocation_notified: e.target.checked }))
                          }
                          className="rounded"
                        />
                        <span className="text-sm text-gray-700">
                          แจ้งย้ายสถานที่เก็บบัญชีต่อกรมพัฒนาธุรกิจการค้าแล้ว
                        </span>
                      </label>
                    )}
                  </div>

                  <div className="space-y-3 rounded-xl border border-gray-200 p-3">
                    <p className="text-sm font-medium text-gray-700">ผู้ทำบัญชี / ผู้สอบบัญชี</p>
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <Label>ผู้ทำบัญชี (CPD)</Label>
                        <Input
                          value={form.accountant_name}
                          onChange={(e) =>
                            setForm((f) => ({ ...f, accountant_name: e.target.value }))
                          }
                          placeholder="ชื่อ-นามสกุล"
                        />
                      </div>
                      <div>
                        <Label>เลขทะเบียนผู้ทำบัญชี</Label>
                        <Input
                          value={form.accountant_license}
                          onChange={(e) =>
                            setForm((f) => ({ ...f, accountant_license: e.target.value }))
                          }
                          placeholder="เช่น 12345678901234"
                        />
                      </div>
                      <div>
                        <Label>ผู้สอบบัญชี (CPA/TA)</Label>
                        <Input
                          value={form.auditor_name}
                          onChange={(e) => setForm((f) => ({ ...f, auditor_name: e.target.value }))}
                          placeholder="ชื่อ-นามสกุล"
                        />
                      </div>
                      <div>
                        <Label>เลขทะเบียนผู้สอบบัญชี</Label>
                        <Input
                          value={form.auditor_license}
                          onChange={(e) =>
                            setForm((f) => ({ ...f, auditor_license: e.target.value }))
                          }
                          placeholder="เช่น 1234"
                        />
                      </div>
                    </div>
                    <p className="text-xs text-gray-400">
                      พ.ร.บ.การบัญชี
                      บังคับให้ทุกนิติบุคคลมีผู้ทำบัญชีและแจ้งชื่อต่อกรมพัฒนาธุรกิจการค้า
                    </p>
                  </div>
                </div>
              )}

              {/* ── การเชื่อมระบบ PERPOS + กลุ่ม LINE ─────────────────────────── */}
              {tab === "link" && editing && (
                <div className="space-y-3 border-t pt-4">
                  <div className="flex items-center gap-2">
                    <Link2 className="h-4 w-4 text-gray-500" />
                    <p className="text-sm font-medium text-gray-700">การเชื่อมระบบ PERPOS</p>
                  </div>

                  {editing.engagement ? (
                    <>
                      <div className="rounded-xl border bg-gray-50 p-3">
                        <p className="text-sm font-medium text-gray-800">
                          {editing.engagement.client_org.name}
                        </p>
                        <p className="text-xs text-gray-400">
                          {editing.engagement.client_org.slug}
                          {editing.engagement.started_at
                            ? ` · เริ่มดูแล ${editing.engagement.started_at}`
                            : ""}
                        </p>
                      </div>

                      <div className="space-y-1.5">
                        <Label>Modules ที่ดูแล</Label>
                        <div className="flex flex-wrap gap-2">
                          {MODULE_OPTIONS.map((m) => (
                            <button
                              key={m.value}
                              type="button"
                              disabled={!isAdmin}
                              onClick={() => toggleLinkModule(m.value)}
                              className={`flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-sm transition-colors disabled:cursor-default disabled:opacity-70 ${
                                linkModules.includes(m.value)
                                  ? "border-teal-300 bg-teal-50 text-teal-700"
                                  : "border-gray-200 text-gray-500 hover:border-gray-300"
                              }`}
                            >
                              {MODULE_ICON[m.value]} {m.label}
                            </button>
                          ))}
                        </div>
                      </div>

                      {isAdmin && (
                        <div className="space-y-1.5">
                          <Label>สถานะการดูแล</Label>
                          <CustomSelect
                            value={editing.engagement.status}
                            onChange={(v) => saveEngagement(v)}
                            options={ENGAGEMENT_STATUS}
                            className="w-40"
                          />
                        </div>
                      )}

                      <div className="flex flex-wrap gap-2">
                        {editing.engagement.modules_managed.includes("accounting") && (
                          <Link
                            href={`/${editing.engagement.client_org.slug}/accounting`}
                            target="_blank"
                          >
                            <Button size="sm" variant="outline" className="gap-1.5 text-xs">
                              <BookOpenText className="h-3.5 w-3.5" /> เปิดสมุดบัญชี
                              <ArrowUpRight className="h-3 w-3" />
                            </Button>
                          </Link>
                        )}
                        <Button
                          size="sm"
                          variant="outline"
                          className="gap-1.5 text-xs"
                          onClick={() => {
                            const c = editing;
                            setDialogOpen(false);
                            openProvision(c);
                          }}
                        >
                          <UserCog className="h-3.5 w-3.5" /> จัดการผู้ดูแล
                        </Button>
                        {isAdmin && (
                          <Button
                            size="sm"
                            variant="secondary"
                            className="gap-1.5 text-xs"
                            disabled={linkSaving || linkModules.length === 0}
                            onClick={() => saveEngagement()}
                          >
                            {linkSaving ? "กำลังบันทึก…" : "บันทึก modules"}
                          </Button>
                        )}
                        {isAdmin && (
                          <Button
                            size="sm"
                            variant={confirmUnlink ? "destructive" : "outline"}
                            className="ms-auto gap-1.5 text-xs"
                            disabled={linkSaving}
                            onClick={() => (confirmUnlink ? unlinkOrg() : setConfirmUnlink(true))}
                          >
                            <Unlink className="h-3.5 w-3.5" />
                            {linkSaving
                              ? "กำลังเลิกเชื่อม…"
                              : confirmUnlink
                                ? "กดอีกครั้งเพื่อยืนยัน"
                                : "เลิกเชื่อม"}
                          </Button>
                        )}
                      </div>
                      {confirmUnlink && (
                        <p className="text-xs text-red-600">
                          เลิกเชื่อมแล้ว ทีมของสำนักงานจะ
                          <b>ถูกถอนสิทธิ์ออกจากบัญชีของลูกค้ารายนี้ทั้งหมด</b>{" "}
                          และข้อมูลค่าบริการ/เอกสารในทะเบียนยังอยู่ครบ
                        </p>
                      )}
                    </>
                  ) : isAdmin ? (
                    <>
                      <p className="text-xs text-gray-400">
                        เชื่อมกับ org ของลูกค้าในระบบ เพื่อให้ทีมเข้าไปทำบัญชี / ใช้ OCR /
                        ตรวจปิดงวดให้ได้
                      </p>
                      <div className="space-y-1.5">
                        <Label>องค์กรลูกค้าในระบบ</Label>
                        <CustomSelect
                          value={linkOrgId}
                          onChange={setLinkOrgId}
                          options={[
                            { value: "", label: "— เลือกองค์กร —" },
                            ...availableOrgs.filter((o) => !linkedOrgIds.has(o.value)),
                          ]}
                        />
                      </div>
                      <div className="space-y-1.5">
                        <Label>Modules ที่จะดูแล</Label>
                        <div className="flex flex-wrap gap-2">
                          {MODULE_OPTIONS.map((m) => (
                            <button
                              key={m.value}
                              type="button"
                              onClick={() => toggleLinkModule(m.value)}
                              className={`flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-sm transition-colors ${
                                linkModules.includes(m.value)
                                  ? "border-teal-300 bg-teal-50 text-teal-700"
                                  : "border-gray-200 text-gray-500 hover:border-gray-300"
                              }`}
                            >
                              {MODULE_ICON[m.value]} {m.label}
                            </button>
                          ))}
                        </div>
                      </div>
                      <Button
                        size="sm"
                        variant="outline"
                        className="gap-1.5"
                        disabled={linkSaving || !linkOrgId || linkModules.length === 0}
                        onClick={linkOrg}
                      >
                        <Link2 className="h-3.5 w-3.5" />
                        {linkSaving ? "กำลังเชื่อม…" : "เชื่อมระบบ"}
                      </Button>
                    </>
                  ) : (
                    <p className="text-xs text-gray-400">
                      ลูกค้ารายนี้ยังไม่ได้เชื่อมกับ org ในระบบ — ติดต่อผู้ดูแลระบบเพื่อเปิดให้
                    </p>
                  )}
                </div>
              )}

              {/* กลุ่ม LINE ของลูกค้า — เชื่อมด้วยรหัส + ตั้งค่าอัปเดตที่จะส่ง */}
              {tab === "link" && editing && orgId && token && (
                <ClientLineGroupSection
                  orgId={orgId}
                  token={token}
                  clientId={editing.id}
                  canWrite={canWrite}
                  onChanged={load}
                />
              )}
            </div>
          </DialogBody>

          {editing && (
            <p className="border-t px-6 pt-3 text-xs text-gray-400">
              แก้ไขล่าสุด {fmtDateTime(editing.updated_at)}
              {editing.updated_by_name ? ` โดย ${editing.updated_by_name}` : ""}
            </p>
          )}

          <DialogFooter>
            {editing && canWrite && !editing.client_org_id && (
              <Button
                variant={confirmDelete ? "destructive" : "outline"}
                className="mr-auto gap-1.5"
                disabled={deleting}
                onClick={() => (confirmDelete ? removeClient() : setConfirmDelete(true))}
              >
                <Trash2 className="h-4 w-4" />
                {deleting ? "กำลังลบ…" : confirmDelete ? "กดอีกครั้งเพื่อลบถาวร" : "ลบลูกค้า"}
              </Button>
            )}
            {!canWrite && (
              <span className="mr-auto self-center text-xs text-gray-400">
                บัญชีของคุณเป็นสิทธิ์อ่านอย่างเดียว จึงแก้ไขไม่ได้
              </span>
            )}
            <Button variant="outline" onClick={() => setDialogOpen(false)}>
              {canWrite ? "ยกเลิก" : "ปิด"}
            </Button>
            {canWrite && (
              <Button onClick={save} disabled={saving || !form.client_code || !form.company_name}>
                {saving ? "กำลังบันทึก…" : "บันทึก"}
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* จัดการผู้ดูแล (provision) */}
      <Dialog
        open={!!provClient}
        onOpenChange={(v) => {
          if (!v) setProvClient(null);
        }}
      >
        <DialogContent size="lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <UserCog className="h-5 w-5 text-gray-500" />
              จัดการผู้ดูแล — {provClient?.company_name}
            </DialogTitle>
          </DialogHeader>
          <DialogBody>
            {provClient?.engagement && (
              <div className="mb-2 flex flex-wrap gap-1.5">
                {provClient.engagement.modules_managed.map((m) => (
                  <span
                    key={m}
                    className="flex items-center gap-1 rounded-full border border-teal-200 bg-teal-50 px-2 py-0.5 text-xs text-teal-700"
                  >
                    {MODULE_ICON[m]} {m}
                  </span>
                ))}
                <span className="ml-1 self-center text-xs text-gray-400">
                  modules ที่จะให้สิทธิ์
                </span>
              </div>
            )}

            <div className="max-h-[380px] space-y-2 overflow-y-auto py-1">
              {provLoading ? (
                <div className="p-6 text-center text-sm text-gray-400">กำลังโหลด…</div>
              ) : firmMembers.length === 0 ? (
                <div className="p-6 text-center text-sm text-gray-300">
                  ไม่พบสมาชิกในสำนักงานบัญชี
                </div>
              ) : (
                firmMembers.map((m) => {
                  const isSaving = provSaving === m.userId;
                  return (
                    <div
                      key={m.userId}
                      className={`flex items-center gap-3 rounded-xl border px-3 py-2.5 transition-colors ${
                        m.hasAccess ? "border-teal-200 bg-teal-50" : "border-gray-100 bg-white"
                      }`}
                    >
                      <MemberAvatar name={m.displayName} url={m.avatarUrl} />
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium text-gray-800">
                          {m.displayName}
                        </p>
                        <p className="truncate text-xs text-gray-400">{m.email}</p>
                      </div>

                      <div className="flex shrink-0 items-center gap-2">
                        {m.hasAccess ? (
                          <div className="flex gap-1">
                            {m.accessModules.map((mod) => (
                              <span
                                key={mod}
                                className="flex items-center gap-0.5 rounded bg-teal-100 px-1.5 py-0.5 text-xs text-teal-700"
                              >
                                {mod === "accounting" ? (
                                  <BookOpen className="h-3 w-3" />
                                ) : (
                                  <Users className="h-3 w-3" />
                                )}
                              </span>
                            ))}
                          </div>
                        ) : null}

                        <Button
                          size="sm"
                          variant={m.hasAccess ? "destructive" : "outline"}
                          className="gap-1.5 text-xs"
                          disabled={isSaving}
                          onClick={() => toggleAccess(m)}
                        >
                          {isSaving ? (
                            "…"
                          ) : m.hasAccess ? (
                            <>
                              <ShieldOff className="h-3.5 w-3.5" /> ถอดสิทธิ์
                            </>
                          ) : (
                            <>
                              <ShieldCheck className="h-3.5 w-3.5" /> ให้สิทธิ์
                            </>
                          )}
                        </Button>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </DialogBody>

          <DialogFooter>
            <Button variant="outline" onClick={() => setProvClient(null)}>
              ปิด
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </PageShell>
  );
}

const MAX_FLAGS_SHOWN = 3;

function ServiceFlags({ client }: { client: ServiceClient }) {
  const active = SERVICE_FLAGS.filter(({ key }) => client[key] as boolean);
  if (active.length === 0) return <span className="text-xs text-gray-300">—</span>;
  const shown = active.slice(0, MAX_FLAGS_SHOWN);
  const rest = active.length - shown.length;
  return (
    <div
      className="flex items-center gap-1 whitespace-nowrap"
      title={active.map((f) => `${f.label} — ${f.title}`).join("\n")}
    >
      {shown.map(({ key, label, title }) => (
        <span
          key={key}
          title={title}
          className="inline-flex items-center gap-0.5 whitespace-nowrap rounded-md bg-green-50 px-1.5 py-0.5 text-xs font-medium text-green-700"
        >
          <Check className="h-2.5 w-2.5" /> {label}
        </span>
      ))}
      {rest > 0 && (
        <span className="inline-flex items-center whitespace-nowrap rounded-md bg-gray-100 px-1.5 py-0.5 text-xs font-medium text-gray-500">
          +{rest}
        </span>
      )}
    </div>
  );
}

function MemberAvatar({ name, url }: { name: string; url: string | null }) {
  const initials = name
    .split(" ")
    .map((w) => w[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
  if (url) return <img src={url} alt={name} className="h-8 w-8 rounded-full object-cover" />;
  return (
    <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-teal-100 text-xs font-bold text-teal-700">
      {initials}
    </div>
  );
}

function StatCard({
  label,
  value,
  unit,
  isMoney,
}: {
  label: string;
  value: number;
  unit: string;
  isMoney?: boolean;
}) {
  return (
    <div className="rounded-xl border bg-white p-4">
      <p className="mb-1 text-xs text-gray-500">{label}</p>
      <p className="text-xl font-bold text-gray-900">
        {isMoney ? value.toLocaleString("th-TH") : value}
        <span className="ml-1 text-sm font-normal text-gray-500">{unit}</span>
      </p>
    </div>
  );
}
