"use client";

// settings/page.tsx — B6 ตั้งค่า (คุมระบบ)
//   Tab(overflow-x-auto): ข้อมูลองค์กร / ภาษี VAT(toggle) / เลขเอกสาร / ผู้ใช้&สิทธิ์(matrix read-only)
//   ตัด tab "เชื่อม HRM" (payroll-bridge mock) + "แจ้งเตือน LINE" (flex preview) ออก — ข้อมูลจาก API จริง
// gate §4: settings — owner(A, PUT) · accountant(V) · staff(–) · viewer(V)

import { useEffect, useMemo, useState } from "react";
import { Settings, Building2, Receipt, Hash, Users } from "lucide-react";
import cn from "@core/utils/class-names";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ImageUpload } from "@/components/ui/image-upload";
import { Text } from "@/components/ui/typography";
import { StatusBadge, type BadgeTone } from "@/components/ui/badge";
import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
} from "@/components/ui/table";
import { toast } from "@/lib/toast";
import {
  AccountingShell,
  useAccountingRole,
  useAccountingData,
  NoAccess,
  ROLE_LABEL,
} from "../_components";

type SettingsTab = "org" | "vat" | "docnum" | "users";

const TABS: { key: SettingsTab; label: string; icon: React.ReactNode }[] = [
  { key: "org", label: "ข้อมูลองค์กร", icon: <Building2 className="h-4 w-4" /> },
  { key: "vat", label: "ภาษี VAT", icon: <Receipt className="h-4 w-4" /> },
  { key: "docnum", label: "เลขเอกสาร", icon: <Hash className="h-4 w-4" /> },
  { key: "users", label: "ผู้ใช้ & สิทธิ์", icon: <Users className="h-4 w-4" /> },
];

// role matrix (read-only — ตรงกับ role-context §4)
const MATRIX_ROWS: { entity: string; label: string; access: Record<string, string> }[] = [
  {
    entity: "dashboard",
    label: "ภาพรวม",
    access: { owner: "ดู", accountant: "ดู", staff: "ดู", viewer: "ดู" },
  },
  {
    entity: "frontstage",
    label: "รายรับ-จ่าย / เอกสาร / ผู้ติดต่อ",
    access: { owner: "เขียน", accountant: "เขียน", staff: "เขียน", viewer: "ดู" },
  },
  {
    entity: "journal",
    label: "สมุดรายวัน",
    access: { owner: "ดู", accountant: "เขียน", staff: "—", viewer: "ดู" },
  },
  {
    entity: "accounts",
    label: "ผังบัญชี",
    access: { owner: "ดู", accountant: "เขียน", staff: "—", viewer: "ดู" },
  },
  {
    entity: "reports",
    label: "รายงานการเงิน",
    access: { owner: "ดู", accountant: "ดู", staff: "—", viewer: "ดู" },
  },
  {
    entity: "periods",
    label: "ปิดงวด",
    access: { owner: "ดู", accountant: "ปิดงวด", staff: "—", viewer: "ดู" },
  },
  {
    entity: "tax",
    label: "ภาษี",
    access: { owner: "ดู", accountant: "เขียน", staff: "—", viewer: "ดู" },
  },
  {
    entity: "assets",
    label: "สินทรัพย์",
    access: { owner: "ดู", accountant: "เขียน", staff: "—", viewer: "ดู" },
  },
  {
    entity: "settings",
    label: "ตั้งค่า",
    access: { owner: "จัดการ", accountant: "ดู", staff: "—", viewer: "ดู" },
  },
];

const ROLES = ["owner", "accountant", "staff", "viewer"] as const;

function Toggle({
  on,
  onClick,
  disabled,
}: {
  on: boolean;
  onClick: () => void;
  disabled?: boolean;
}) {
  return (
    <Button
      type="button"
      variant="ghost"
      size="sm"
      disabled={disabled}
      onClick={onClick}
      className={cn(
        "h-6 w-11 rounded-full p-0",
        on ? "bg-primary hover:bg-primary/90" : "bg-gray-200 hover:bg-gray-300",
      )}
      aria-pressed={on}
    >
      <span
        className={cn(
          "block h-5 w-5 rounded-full bg-white shadow transition-transform",
          on ? "translate-x-2.5" : "-translate-x-2.5",
        )}
      />
    </Button>
  );
}

export default function SettingsPage() {
  const { role, can } = useAccountingRole();
  const canView = can("view", "settings");
  const canManage = can("approve", "settings"); // owner เท่านั้น

  const { orgSettings, updateOrgSettings } = useAccountingData();

  const [tab, setTab] = useState<SettingsTab>("org");

  // org form (local state synced จาก orgSettings)
  const [orgName, setOrgName] = useState("");
  const [taxId, setTaxId] = useState("");
  const [fiscal, setFiscal] = useState("1");
  const [address, setAddress] = useState("");
  const [logo, setLogo] = useState<string | null>(null);
  const [signature, setSignature] = useState<string | null>(null);
  const [savingOrg, setSavingOrg] = useState(false);

  // docnum prefix
  const [qtPrefix, setQtPrefix] = useState("QT-2026-");
  const [invPrefix, setInvPrefix] = useState("INV-2026-");
  const [rcPrefix, setRcPrefix] = useState("RC-2026-");
  const [savingDoc, setSavingDoc] = useState(false);
  const [savingVat, setSavingVat] = useState(false);

  // sync จาก orgSettings เมื่อโหลดเสร็จ/เปลี่ยน
  useEffect(() => {
    if (!orgSettings) return;
    setOrgName(orgSettings.org_name ?? "");
    setTaxId(orgSettings.tax_id ?? "");
    setFiscal(String(orgSettings.fiscal_start_month ?? 1));
    setAddress(orgSettings.address ?? "");
    setLogo(orgSettings.logo_data_url ?? null);
    setSignature(orgSettings.signature_data_url ?? null);
    const px = orgSettings.doc_number_prefix ?? {};
    setQtPrefix(px.quotation ?? "QT-2026-");
    setInvPrefix(px.invoice ?? "INV-2026-");
    setRcPrefix(px.receipt ?? "RC-2026-");
  }, [orgSettings]);

  const vatRegistered = orgSettings?.is_vat_registered ?? false;
  const vatRate = orgSettings?.vat_rate ?? 7;

  async function handleSaveOrg() {
    const fm = Number(fiscal);
    if (fm < 1 || fm > 12) {
      toast.error("เดือนเริ่มรอบบัญชีต้องเป็น 1–12");
      return;
    }
    setSavingOrg(true);
    const r = await updateOrgSettings({
      org_name: orgName.trim() || null,
      tax_id: taxId.trim() || null,
      fiscal_start_month: fm,
      address: address.trim() || null,
      logo_data_url: logo,
      signature_data_url: signature,
    });
    setSavingOrg(false);
    if (!r.ok) {
      toast.error(r.error ?? "บันทึกไม่สำเร็จ");
      return;
    }
    toast.success("บันทึกข้อมูลองค์กรแล้ว");
  }

  async function toggleVat() {
    if (!canManage) {
      toast.error("เฉพาะเจ้าของเท่านั้นที่ปรับการจด VAT ได้");
      return;
    }
    setSavingVat(true);
    const next = !vatRegistered;
    const r = await updateOrgSettings({ is_vat_registered: next });
    setSavingVat(false);
    if (!r.ok) {
      toast.error(r.error ?? "บันทึกไม่สำเร็จ");
      return;
    }
    toast.success(
      next ? "เปิดใช้งาน VAT — ปลดล็อก ภ.พ.30 และช่อง VAT" : "ปิด VAT (Non-VAT) — ซ่อนช่อง VAT",
    );
  }

  async function handleSaveDocnum() {
    setSavingDoc(true);
    const r = await updateOrgSettings({
      doc_number_prefix: {
        quotation: qtPrefix.trim(),
        invoice: invPrefix.trim(),
        receipt: rcPrefix.trim(),
      },
    });
    setSavingDoc(false);
    if (!r.ok) {
      toast.error(r.error ?? "บันทึกไม่สำเร็จ");
      return;
    }
    toast.success("บันทึกรูปแบบเลขเอกสารแล้ว");
  }

  const tabs = useMemo(
    () => (
      <div className="flex gap-1.5 overflow-x-auto rounded-xl border border-gray-200 bg-white p-1.5 shadow-sm [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {TABS.map((t) => (
          <Button
            key={t.key}
            size="sm"
            variant={tab === t.key ? "secondary" : "ghost"}
            className={cn(
              "shrink-0 whitespace-nowrap",
              tab === t.key && "bg-gray-100 text-gray-900",
            )}
            onClick={() => setTab(t.key)}
          >
            <span className="mr-1.5">{t.icon}</span>
            {t.label}
          </Button>
        ))}
      </div>
    ),
    [tab],
  );

  if (!canView)
    return (
      <NoAccess title="ตั้งค่า" icon={<Settings className="h-6 w-6" />}>
        บทบาทของคุณไม่มีสิทธิ์เข้าถึงหน้าตั้งค่า
      </NoAccess>
    );

  return (
    <AccountingShell
      title="ตั้งค่า"
      description="ข้อมูลองค์กร ภาษี เลขเอกสาร และสิทธิ์ผู้ใช้"
      icon={<Settings className="h-6 w-6" />}
      tabs={tabs}
    >
      {/* ข้อมูลองค์กร */}
      {tab === "org" && (
        <div className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="sm:col-span-2">
              <Label htmlFor="org-name">ชื่อบริษัท</Label>
              <Input
                id="org-name"
                className="mt-1"
                placeholder="บริษัท ... จำกัด"
                value={orgName}
                onChange={(e) => setOrgName(e.target.value)}
                disabled={!canManage}
              />
              <Text className="mt-1 text-xs text-gray-400">
                ชื่อที่แสดงบนหัวเอกสาร (ใบเสนอราคา/ใบแจ้งหนี้/ใบเสร็จ)
              </Text>
            </div>
            <div>
              <Label htmlFor="org-taxid">เลขประจำตัวผู้เสียภาษี</Label>
              <Input
                id="org-taxid"
                className="mt-1"
                placeholder="0105566001234"
                value={taxId}
                onChange={(e) => setTaxId(e.target.value)}
                disabled={!canManage}
              />
            </div>
            <div>
              <Label htmlFor="org-fiscal">เดือนเริ่มรอบบัญชี (1–12)</Label>
              <Input
                id="org-fiscal"
                type="number"
                className="mt-1"
                value={fiscal}
                onChange={(e) => setFiscal(e.target.value)}
                disabled={!canManage}
              />
            </div>
            <div className="sm:col-span-2">
              <Label htmlFor="org-addr">ที่อยู่</Label>
              <Input
                id="org-addr"
                className="mt-1"
                placeholder="อาคาร ... ชั้น ... กรุงเทพฯ"
                value={address}
                onChange={(e) => setAddress(e.target.value)}
                disabled={!canManage}
              />
            </div>
          </div>

          {/* โลโก้ + ลายเซน (PNG) — เก็บ data URL ลง orgSettings */}
          <div className="mt-6 grid grid-cols-1 gap-6 border-t border-gray-100 pt-6 sm:grid-cols-2">
            <div className="space-y-2">
              <Label>โลโก้บริษัท</Label>
              <ImageUpload
                value={logo}
                onChange={(v) => setLogo(v)}
                label="อัปโหลดโลโก้ (PNG)"
                previewClassName="h-16 w-16"
              />
            </div>
            <div className="space-y-2">
              <Label>ลายเซนผู้มีอำนาจลงนาม</Label>
              <ImageUpload
                value={signature}
                onChange={(v) => setSignature(v)}
                label="อัปโหลดลายเซน (PNG)"
                previewClassName="h-16 w-32"
              />
              <Text className="text-xs text-gray-400">ใช้แสดงในช่องเซ็นเอกสาร</Text>
            </div>
          </div>

          <div className="mt-6 flex justify-end">
            <Button disabled={!canManage || savingOrg} onClick={() => void handleSaveOrg()}>
              {savingOrg ? "กำลังบันทึก…" : "บันทึก"}
            </Button>
          </div>
          {!canManage && (
            <Text className="mt-3 text-xs text-gray-400">
              เฉพาะเจ้าของแก้ไขข้อมูลองค์กรได้ (บทบาทปัจจุบัน: {ROLE_LABEL[role]})
            </Text>
          )}
        </div>
      )}

      {/* ภาษี VAT */}
      {tab === "vat" && (
        <div className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
          <div className="flex items-start justify-between gap-4">
            <div>
              <div className="text-sm font-semibold text-gray-900">
                จดทะเบียนภาษีมูลค่าเพิ่ม (VAT)
              </div>
              <Text className="mt-1 text-sm text-gray-500">
                เปิดเมื่อยอดขายเกิน 1.8 ล้านบาท/ปี — ปลดล็อกช่อง VAT ในเอกสาร + แบบ ภ.พ.30
              </Text>
            </div>
            <Toggle
              on={vatRegistered}
              onClick={() => void toggleVat()}
              disabled={!canManage || savingVat}
            />
          </div>
          <div className="mt-4">
            <StatusBadge tone={vatRegistered ? "success" : "neutral"}>
              {vatRegistered ? `จด VAT แล้ว (${vatRate}%)` : "ยังไม่จด VAT (Non-VAT)"}
            </StatusBadge>
          </div>
          {!canManage && (
            <Text className="mt-3 text-xs text-gray-400">
              เฉพาะเจ้าของปรับการจด VAT ได้ (VAT toggle = แกนระบบ)
            </Text>
          )}
        </div>
      )}

      {/* เลขเอกสาร */}
      {tab === "docnum" && (
        <div className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
          <div className="text-sm font-semibold text-gray-900">รูปแบบเลขเอกสาร</div>
          <Text className="mt-1 text-sm text-gray-500">กำหนด prefix เลขรันต่อชนิดเอกสาร</Text>
          <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-3">
            <div>
              <Label htmlFor="px-qt">ใบเสนอราคา</Label>
              <Input
                id="px-qt"
                className="mt-1"
                value={qtPrefix}
                onChange={(e) => setQtPrefix(e.target.value)}
                disabled={!canManage}
              />
            </div>
            <div>
              <Label htmlFor="px-inv">ใบแจ้งหนี้</Label>
              <Input
                id="px-inv"
                className="mt-1"
                value={invPrefix}
                onChange={(e) => setInvPrefix(e.target.value)}
                disabled={!canManage}
              />
            </div>
            <div>
              <Label htmlFor="px-rc">ใบเสร็จรับเงิน</Label>
              <Input
                id="px-rc"
                className="mt-1"
                value={rcPrefix}
                onChange={(e) => setRcPrefix(e.target.value)}
                disabled={!canManage}
              />
            </div>
          </div>
          <div className="mt-5 flex justify-end">
            <Button disabled={!canManage || savingDoc} onClick={() => void handleSaveDocnum()}>
              {savingDoc ? "กำลังบันทึก…" : "บันทึก"}
            </Button>
          </div>
        </div>
      )}

      {/* ผู้ใช้ & สิทธิ์ (matrix read-only) */}
      {tab === "users" && (
        <div>
          <div className="mb-2.5 px-1 text-sm font-semibold text-gray-900">
            ตารางสิทธิ์ตามบทบาท (role matrix)
          </div>
          <Table className="shadow-sm">
            <TableHeader>
              <TableRow>
                <TableHead>หน้า / สิทธิ์</TableHead>
                {ROLES.map((r) => (
                  <TableHead key={r} align="center">
                    {ROLE_LABEL[r]}
                  </TableHead>
                ))}
              </TableRow>
            </TableHeader>
            <TableBody>
              {MATRIX_ROWS.map((row) => (
                <TableRow key={row.entity}>
                  <TableCell className="text-gray-700">{row.label}</TableCell>
                  {ROLES.map((r) => {
                    const v = row.access[r];
                    const tone: BadgeTone =
                      v === "—"
                        ? "neutral"
                        : v === "ดู"
                          ? "info"
                          : v === "จัดการ" || v === "ปิดงวด"
                            ? "warning"
                            : "success";
                    return (
                      <TableCell key={r} align="center">
                        {v === "—" ? (
                          <span className="text-gray-300">—</span>
                        ) : (
                          <StatusBadge tone={tone}>{v}</StatusBadge>
                        )}
                      </TableCell>
                    );
                  })}
                </TableRow>
              ))}
            </TableBody>
          </Table>
          <Text className="mt-2 px-1 text-xs text-gray-400">
            บทบาทผูกกับการเป็นสมาชิกองค์กรในโมดูล — ผู้ดูแลระบบกำหนดให้แต่ละผู้ใช้
          </Text>
        </div>
      )}
    </AccountingShell>
  );
}
