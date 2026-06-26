"use client";

// B6 settings/page.tsx — ตั้งค่า (คุมระบบ)
// Tab(overflow-x-auto): ข้อมูลองค์กร / ภาษี VAT(toggle) / เลขเอกสาร / ผู้ใช้&สิทธิ์(matrix)
//   / เชื่อม HRM(ปุ่มจำลองเงินเดือน) / แจ้งเตือน LINE (hub: toggle event + flex-preview 5 ตัว)
//
// gate §4: settings — owner(A, PUT) · accountant(V) · staff(–) · viewer(V)

import { useMemo, useState } from "react";
import {
  Settings,
  Building2,
  Receipt,
  Hash,
  Users,
  Wallet,
  Bell,
  CheckCircle2,
} from "lucide-react";
import cn from "@core/utils/class-names";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ImageUpload } from "@/components/ui/image-upload";
import { Text } from "@/components/ui/typography";
import { StatusBadge } from "@/components/ui/badge";
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
} from "@/components/ui/table";
import { toast } from "@/lib/toast";
import {
  AccountingShell,
  useAccountingRole,
  useAccountingData,
  fmtMoney,
  fmtDateTH,
  NoAccess,
  ROLE_LABEL,
} from "../_components";
import { FlexPreview } from "../_components/flex-preview";
import { lineFlexPreviews } from "../_fixtures";
import type { PayrollBridgeRunResult } from "../_components/data-context";

type SettingsTab = "org" | "vat" | "docnum" | "users" | "hrm" | "line";

const TABS: { key: SettingsTab; label: string; icon: React.ReactNode }[] = [
  { key: "org", label: "ข้อมูลองค์กร", icon: <Building2 className="h-4 w-4" /> },
  { key: "vat", label: "ภาษี VAT", icon: <Receipt className="h-4 w-4" /> },
  { key: "docnum", label: "เลขเอกสาร", icon: <Hash className="h-4 w-4" /> },
  { key: "users", label: "ผู้ใช้ & สิทธิ์", icon: <Users className="h-4 w-4" /> },
  { key: "hrm", label: "เชื่อม HRM", icon: <Wallet className="h-4 w-4" /> },
  { key: "line", label: "แจ้งเตือน LINE", icon: <Bell className="h-4 w-4" /> },
];

// role matrix (สำหรับ tab ผู้ใช้&สิทธิ์) — ต้องตรงกับ role-context §4
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

// LINE notification events (toggle hub)
const DEFAULT_LINE_EVENTS = [
  { id: "L1", label: "บันทึกรายจ่ายผ่าน LINE", enabled: true, recipient: "ผู้บันทึก" },
  { id: "L2", label: "เตือนภาษีใกล้ครบกำหนด", enabled: true, recipient: "เจ้าของ + นักบัญชี" },
  { id: "L3", label: "สรุปรายรับ-รายจ่ายรายสัปดาห์", enabled: true, recipient: "เจ้าของ" },
  { id: "L4", label: "ส่งใบแจ้งหนี้ให้ลูกค้า", enabled: false, recipient: "ลูกค้า (forward)" },
  { id: "L5", label: "เตือนหนี้เกินกำหนด", enabled: true, recipient: "เจ้าของ" },
];

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

  const { orgSettings, setVatRegistered, updateOrgSettings, runPayrollBridge } =
    useAccountingData();

  const [tab, setTab] = useState<SettingsTab>("org");
  const [lineEvents, setLineEvents] = useState(DEFAULT_LINE_EVENTS);
  const [previewId, setPreviewId] = useState("L2");
  const [bridgeResult, setBridgeResult] = useState<PayrollBridgeRunResult | null>(null);

  const previewFlex = useMemo(
    () => lineFlexPreviews.find((p) => p.id === previewId) ?? lineFlexPreviews[0],
    [previewId],
  );

  function toggleVat() {
    if (!canManage) {
      toast.error("เฉพาะเจ้าของเท่านั้นที่ปรับการจด VAT ได้");
      return;
    }
    const next = !orgSettings.is_vat_registered;
    setVatRegistered(next);
    toast.success(
      next ? "เปิดใช้งาน VAT — ปลดล็อก ภ.พ.30 และช่อง VAT" : "ปิด VAT (Non-VAT) — ซ่อนช่อง VAT",
    );
  }

  function toggleLineEvent(id: string) {
    setLineEvents((prev) => prev.map((e) => (e.id === id ? { ...e, enabled: !e.enabled } : e)));
    const ev = lineEvents.find((e) => e.id === id);
    toast.success(`${ev?.enabled ? "ปิด" : "เปิด"}การแจ้งเตือน: ${ev?.label}`);
  }

  function handlePayrollBridge() {
    const result = runPayrollBridge();
    setBridgeResult(result);
    if (result.skipped) {
      toast.success(`งวด ${result.run_number} บันทึกแล้ว — ข้าม (ป้องกันยอดซ้ำ)`);
    } else {
      toast.success(
        `จำลองเงินเดือน ${result.run_number} → สร้าง ${result.journal_entry_number} + ภ.ง.ด.1 ร่าง`,
      );
    }
  }

  if (!canView)
    return (
      <NoAccess title="ตั้งค่า" icon={<Settings className="h-6 w-6" />}>
        ไม่มีสิทธิ์เข้าถึงหน้าตั้งค่า — ลองสลับเป็นเจ้าของ/นักบัญชี
      </NoAccess>
    );

  const tabs = (
    <div className="flex gap-1.5 overflow-x-auto rounded-xl border border-gray-200 bg-white p-1.5 shadow-sm [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
      {TABS.map((t) => (
        <Button
          key={t.key}
          size="sm"
          variant={tab === t.key ? "secondary" : "ghost"}
          className={cn("shrink-0 whitespace-nowrap", tab === t.key && "bg-gray-100 text-gray-900")}
          onClick={() => setTab(t.key)}
        >
          <span className="mr-1.5">{t.icon}</span>
          {t.label}
        </Button>
      ))}
    </div>
  );

  return (
    <AccountingShell
      title="ตั้งค่า"
      description="ข้อมูลองค์กร ภาษี เลขเอกสาร สิทธิ์ผู้ใช้ การเชื่อมระบบเงินเดือน และแจ้งเตือน LINE"
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
                value={orgSettings.org_name ?? ""}
                onChange={(e) => updateOrgSettings({ org_name: e.target.value })}
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
                defaultValue={orgSettings.tax_id ?? "0105566001234"}
                disabled={!canManage}
              />
            </div>
            <div>
              <Label htmlFor="org-fiscal">เดือนเริ่มรอบบัญชี</Label>
              <Input
                id="org-fiscal"
                type="number"
                className="mt-1"
                defaultValue={orgSettings.fiscal_start_month}
                disabled={!canManage}
              />
            </div>
            <div className="sm:col-span-2">
              <Label htmlFor="org-addr">ที่อยู่</Label>
              <Input
                id="org-addr"
                className="mt-1"
                defaultValue={orgSettings.address ?? "อาคารจำลอง ชั้น 5 กรุงเทพฯ 10110"}
                disabled={!canManage}
              />
            </div>
          </div>

          {/* โลโก้ + ลายเซน (PNG) — เก็บ data URL ลง orgSettings */}
          <div className="mt-6 grid grid-cols-1 gap-6 border-t border-gray-100 pt-6 sm:grid-cols-2">
            <div className="space-y-2">
              <Label>โลโก้บริษัท</Label>
              <ImageUpload
                value={orgSettings.logo_data_url}
                onChange={(v) => {
                  updateOrgSettings({ logo_data_url: v });
                  toast.success(v ? "อัปโหลดโลโก้แล้ว" : "ลบโลโก้แล้ว");
                }}
                label="อัปโหลดโลโก้ (PNG)"
                previewClassName="h-16 w-16"
              />
            </div>
            <div className="space-y-2">
              <Label>ลายเซนผู้มีอำนาจลงนาม</Label>
              <ImageUpload
                value={orgSettings.signature_data_url}
                onChange={(v) => {
                  updateOrgSettings({ signature_data_url: v });
                  toast.success(v ? "อัปโหลดลายเซนแล้ว" : "ลบลายเซนแล้ว");
                }}
                label="อัปโหลดลายเซน (PNG)"
                previewClassName="h-16 w-32"
              />
              <Text className="text-xs text-gray-400">ใช้แสดงในช่องเซ็นเอกสาร</Text>
            </div>
          </div>

          <div className="mt-6 flex justify-end">
            <Button disabled={!canManage} onClick={() => toast.success("บันทึกข้อมูลองค์กรแล้ว")}>
              บันทึก
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
            <Toggle on={orgSettings.is_vat_registered} onClick={toggleVat} disabled={!canManage} />
          </div>
          <div className="mt-4">
            <StatusBadge tone={orgSettings.is_vat_registered ? "success" : "neutral"}>
              {orgSettings.is_vat_registered
                ? `จด VAT แล้ว (${orgSettings.vat_rate}%)`
                : "ยังไม่จด VAT (Non-VAT)"}
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
            {[
              { label: "ใบเสนอราคา", def: "QT-2026-" },
              { label: "ใบแจ้งหนี้", def: "INV-2026-" },
              { label: "ใบเสร็จรับเงิน", def: "RC-2026-" },
            ].map((d) => (
              <div key={d.label}>
                <Label>{d.label}</Label>
                <Input className="mt-1" defaultValue={d.def} disabled={!canManage} />
              </div>
            ))}
          </div>
          <div className="mt-5 flex justify-end">
            <Button
              disabled={!canManage}
              onClick={() => toast.success("บันทึกรูปแบบเลขเอกสารแล้ว")}
            >
              บันทึก
            </Button>
          </div>
        </div>
      )}

      {/* ผู้ใช้ & สิทธิ์ (matrix) */}
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
                    const tone =
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
            สลับบทบาทที่มุมขวาบน (แถบ PROTOTYPE) เพื่อดูเลนส์สิทธิ์ของแต่ละบทบาท
          </Text>
        </div>
      )}

      {/* เชื่อม HRM */}
      {tab === "hrm" && (
        <div className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
          <div className="flex items-start justify-between gap-4">
            <div>
              <div className="text-sm font-semibold text-gray-900">เชื่อมระบบเงินเดือน (HRM)</div>
              <Text className="mt-1 text-sm text-gray-500">
                เมื่อ HRM จ่ายเงินเดือน (mark-paid) → สร้างรายจ่าย + สมุดรายวัน 8 บรรทัด + ภ.ง.ด.1
                ร่าง อัตโนมัติ
              </Text>
            </div>
            <StatusBadge tone="success">เชื่อมต่อแล้ว</StatusBadge>
          </div>
          <div className="mt-4 rounded-lg border border-gray-200 bg-gray-50 p-4">
            <Text className="text-sm text-gray-600">
              ทดสอบสะพาน hrm → accounting: กดเพื่อจำลองว่า HRM จ่ายเงินเดือนงวดถัดไป
            </Text>
            <div className="mt-3">
              <Button variant="outline" onClick={handlePayrollBridge}>
                <Wallet className="mr-1.5 h-4 w-4" /> จำลอง: เงินเดือนจ่ายแล้ว
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* แจ้งเตือน LINE (hub) */}
      {tab === "line" && (
        <div className="grid grid-cols-1 gap-5 lg:grid-cols-5">
          {/* toggle events */}
          <div className="lg:col-span-3">
            <div className="mb-2.5 px-1 text-sm font-semibold text-gray-900">
              เปิด/ปิดการแจ้งเตือน
            </div>
            <div className="space-y-2">
              {lineEvents.map((ev) => (
                <div
                  key={ev.id}
                  role="button"
                  tabIndex={0}
                  onClick={() => setPreviewId(ev.id)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      setPreviewId(ev.id);
                    }
                  }}
                  className={cn(
                    "flex w-full cursor-pointer items-center justify-between gap-3 rounded-xl border bg-white px-4 py-3 text-left shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30",
                    previewId === ev.id
                      ? "border-primary/40 ring-1 ring-primary/20"
                      : "border-gray-200 hover:bg-gray-50",
                  )}
                >
                  <div className="min-w-0">
                    <div className="truncate text-sm font-medium text-gray-900">{ev.label}</div>
                    <div className="text-xs text-gray-400">ผู้รับ: {ev.recipient}</div>
                  </div>
                  <Toggle on={ev.enabled} onClick={() => toggleLineEvent(ev.id)} />
                </div>
              ))}
            </div>
            <Text className="mt-2 px-1 text-xs text-gray-400">
              แตะการ์ดเพื่อดูตัวอย่างการ์ด Flex ที่จะส่งทาง LINE
            </Text>
          </div>

          {/* flex preview */}
          <div className="lg:col-span-2">
            <div className="mb-2.5 px-1 text-sm font-semibold text-gray-900">
              ตัวอย่างการ์ด — {previewFlex.label}
            </div>
            <div className="rounded-xl border border-gray-200 bg-gray-50 p-4 shadow-sm">
              <FlexPreview
                flex={previewFlex.flex as React.ComponentProps<typeof FlexPreview>["flex"]}
              />
              <Text className="mt-3 text-center text-xs text-gray-400">
                จำลองการ์ด LINE Flex — ไม่ได้ส่งจริง
              </Text>
            </div>
          </div>
        </div>
      )}

      {/* สรุปผลสะพานเงินเดือน (จาก tab HRM) */}
      <Dialog open={bridgeResult !== null} onOpenChange={(v) => !v && setBridgeResult(null)}>
        <DialogContent size="lg">
          <DialogHeader>
            <DialogTitle>ผลการจำลองเงินเดือน → บัญชี</DialogTitle>
          </DialogHeader>
          <DialogBody>
            {bridgeResult && bridgeResult.skipped ? (
              <div className="rounded-lg border border-gray-200 bg-gray-50 px-4 py-3 text-sm text-gray-600">
                งวด {bridgeResult.run_number} บันทึกเข้าบัญชีแล้ว — ข้ามเพื่อป้องกันยอดซ้ำ
                (idempotent)
              </div>
            ) : bridgeResult ? (
              <div className="space-y-2 text-sm">
                <div className="flex items-center gap-2 rounded-lg border border-green-200 bg-green-50 px-3 py-2 text-green-700">
                  <CheckCircle2 className="h-4 w-4" /> สร้าง {bridgeResult.journal_entry_number} (8
                  บรรทัด, สมดุล) + ภ.ง.ด.1 ร่าง
                </div>
                <div className="flex items-center justify-between rounded-lg border border-gray-200 px-3 py-2">
                  <span className="text-gray-600">เดบิต = เครดิต</span>
                  <span className="font-medium tabular-nums text-gray-900">
                    {fmtMoney(bridgeResult.total_debit)}
                  </span>
                </div>
                <div className="flex items-center justify-between rounded-lg border border-gray-200 px-3 py-2">
                  <span className="text-gray-600">
                    ภ.ง.ด.1 (ร่าง) ครบกำหนด {fmtDateTH(bridgeResult.pnd1_due_date)}
                  </span>
                  <span className="font-medium tabular-nums text-gray-900">
                    WHT {fmtMoney(bridgeResult.pnd1_wht_total)}
                  </span>
                </div>
                <Text className="text-xs text-gray-400">
                  ไปดูที่หน้า “สมุดรายวัน” และ “ภาษี & ปิดงวด” เพื่อตรวจสอบ
                </Text>
              </div>
            ) : null}
          </DialogBody>
          <DialogFooter>
            <Button onClick={() => setBridgeResult(null)}>เข้าใจแล้ว</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </AccountingShell>
  );
}
