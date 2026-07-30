"use client";

/**
 * _detail-client.tsx — เปลือกหน้ารายละเอียดโครงการ (แท็บ + ภาพรวม + กล่องแก้ไข)
 * ข้อมูลตั้งต้นมาจาก SSR · การเปลี่ยนแปลงยิงผ่าน `/api/just-me/*` แล้ว `router.refresh()`
 * ⛔ ไม่คำนวณเงินเอง — ค่าทุกช่องมาจาก `project-metrics.ts` (ผ่าน props `summary`)
 */

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  ClipboardList,
  FileStack,
  LayoutDashboard,
  MapPin,
  Pencil,
  ReceiptText,
  ShoppingCart,
  Warehouse,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { StatusBadge } from "@/components/ui/badge";
import { CustomSelect } from "@/components/ui/custom-select";
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { PageCard, PageShell } from "@/components/ui/page-shell";
import { SegmentedControl } from "@/components/ui/segmented";
import { StatCard } from "@/components/ui/stat-card";
import { ThaiDatePicker } from "@/components/ui/thai-date-picker";
import { Text, Title } from "@/components/ui/typography";
import { notify } from "@/lib/toast";
import { PROJECT_STATUS_LABEL, PROJECT_STATUS_TONE } from "@/lib/just-me/labels";
import type { JustMeProject, ProjectStatus } from "@/lib/just-me/types";
import { jmSend } from "../../_components/api-client";
import { money, percent, thaiDate } from "../../_components/format";
import { BoqTab } from "./_boq-tab";
import { FilesTab } from "./_files-tab";
import { PurchasingTab } from "./_purchasing-tab";
import type { ProjectDetailInitial } from "./_types";

type TabKey = "overview" | "files" | "boq" | "purchasing" | "billings" | "usage";

/** แท็บ "จัดซื้อ" มีต้นทุนจากผู้ขาย → viewer ไม่เห็นทั้งแท็บ (contract §5 ข้อ 2) */
const TABS: { value: TabKey; label: string; icon: React.ReactNode; costOnly?: boolean }[] = [
  { value: "overview", label: "ภาพรวม", icon: <LayoutDashboard className="h-4 w-4" /> },
  { value: "files", label: "แบบ/ไฟล์", icon: <FileStack className="h-4 w-4" /> },
  { value: "boq", label: "BOQ", icon: <ClipboardList className="h-4 w-4" /> },
  {
    value: "purchasing",
    label: "จัดซื้อ",
    icon: <ShoppingCart className="h-4 w-4" />,
    costOnly: true,
  },
  { value: "billings", label: "งวดงาน", icon: <ReceiptText className="h-4 w-4" /> },
  { value: "usage", label: "ใช้จริง", icon: <Warehouse className="h-4 w-4" /> },
];

const STATUS_OPTIONS = (Object.keys(PROJECT_STATUS_LABEL) as ProjectStatus[]).map((s) => ({
  value: s,
  label: PROJECT_STATUS_LABEL[s],
}));

export function ProjectDetailClient({
  orgId,
  orgSlug,
  canWrite,
  canSeeCost,
  initial,
}: {
  orgId: string;
  orgSlug: string;
  canWrite: boolean;
  canSeeCost: boolean;
  initial: ProjectDetailInitial;
}) {
  const router = useRouter();
  const [tab, setTab] = useState<TabKey>("overview");
  const [project, setProject] = useState<JustMeProject>(initial.project);
  const [editOpen, setEditOpen] = useState(false);

  // SSR ส่งของใหม่มา (หลัง router.refresh) → sync เข้ากับ state ที่หน้าถืออยู่
  useEffect(() => setProject(initial.project), [initial.project]);

  const summary = initial.summary;

  return (
    <PageShell
      title={project.name}
      description={`${project.project_code}${project.customer_name ? ` · ${project.customer_name}` : ""}`}
      icon={<ClipboardList className="h-6 w-6" />}
      width="full"
      actions={
        <>
          <StatusBadge tone={PROJECT_STATUS_TONE[project.status]}>
            {PROJECT_STATUS_LABEL[project.status]}
          </StatusBadge>
          {canWrite && (
            <Button variant="outline" onClick={() => setEditOpen(true)}>
              <Pencil className="h-4 w-4" /> แก้ไขข้อมูล
            </Button>
          )}
        </>
      }
      tabs={
        <SegmentedControl
          value={tab}
          onChange={setTab}
          ariaLabel="ส่วนของโครงการ"
          options={TABS.filter((t) => !t.costOnly || canSeeCost).map((t) => ({
            value: t.value,
            label: t.label,
            icon: t.icon,
          }))}
        />
      }
    >
      {tab === "overview" && (
        <div className="space-y-4">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <StatCard
              label="มูลค่าสัญญา"
              value={money(project.contract_amount)}
              sub={project.contract_amount === null ? "ยังไม่มีสัญญา/ยังไม่อนุมัติ BOQ" : undefined}
              tone="primary"
            />
            {canSeeCost && summary ? (
              <>
                <StatCard
                  label="งบต้นทุน (BOQ อนุมัติ)"
                  value={money(summary.budget_cost)}
                  sub={summary.budget_cost === null ? "ยังไม่มี BOQ ที่อนุมัติ" : undefined}
                  tone="neutral"
                />
                <StatCard
                  label="ต้นทุนจริง / ผูกพัน"
                  value={money(summary.actual_cost)}
                  sub={`ผูกพันอีก ${money(summary.committed_cost)} · ${summary.actual_counted.toLocaleString("th-TH")} รายการ`}
                  tone={summary.over_budget ? "negative" : "neutral"}
                  valueColored={summary.over_budget}
                />
                <StatCard
                  label="กำไรคาดการณ์ ≈"
                  value={money(summary.forecast_profit)}
                  sub={
                    summary.forecast_profit === null
                      ? "ต้องมีทั้งมูลค่าสัญญาและงบต้นทุนก่อน"
                      : `อัตรากำไร ${percent(summary.forecast_margin_pct)} · คืบหน้า ${
                          summary.progress_pct === null
                            ? "ยังไม่ได้บันทึก"
                            : percent(summary.progress_pct)
                        }`
                  }
                  tone={
                    summary.forecast_profit !== null && summary.forecast_profit < 0
                      ? "negative"
                      : "positive"
                  }
                  valueColored
                />
              </>
            ) : (
              <StatCard
                label="ความคืบหน้า"
                value={summary?.progress_pct == null ? "—" : percent(summary.progress_pct)}
                sub="บันทึกความคืบหน้าจากหน้างาน"
                tone="info"
              />
            )}
          </div>

          {canSeeCost && summary && (
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              <StatCard
                label="ต้นทุนเทียบงบ"
                value={money(summary.cost_variance)}
                sub={
                  summary.cost_variance === null
                    ? "ยังไม่มีงบให้เทียบ"
                    : summary.over_budget
                      ? "ใช้เกินงบแล้ว"
                      : "ยังอยู่ในงบ"
                }
                tone={summary.over_budget ? "negative" : "positive"}
                valueColored
              />
              <StatCard label="วางบิลแล้ว" value={money(summary.billed_amount)} tone="neutral" />
              <StatCard
                label="ยังไม่ได้วางบิล"
                value={money(summary.unbilled_amount)}
                sub={summary.unbilled_amount === null ? "ยังไม่มีมูลค่าสัญญา" : undefined}
                tone="warning"
              />
            </div>
          )}

          <PageCard title="ข้อมูลโครงการ">
            <div className="grid grid-cols-1 gap-x-8 gap-y-3 sm:grid-cols-2">
              <Field label="ลูกค้า" value={project.customer_name || "—"} />
              <Field label="ที่ตั้งหน้างาน" value={project.site_address || "—"} />
              <Field label="วันที่เริ่มงาน" value={thaiDate(project.start_date)} />
              <Field label="กำหนดส่งมอบ" value={thaiDate(project.end_date)} />
              <Field
                label="เงินประกันผลงาน"
                value={`${(project.retention_pct ?? 0).toLocaleString("th-TH")}%`}
              />
              <Field label="หมายเหตุ" value={project.note || "—"} />
              {project.latitude !== null && project.longitude !== null && (
                <div className="sm:col-span-2">
                  <a
                    className="inline-flex items-center gap-1 text-sm text-blue-600 hover:underline"
                    href={`https://www.google.com/maps/search/?api=1&query=${project.latitude},${project.longitude}`}
                    target="_blank"
                    rel="noreferrer"
                  >
                    <MapPin className="h-4 w-4" /> เปิดพิกัดหน้างานในแผนที่
                  </a>
                </div>
              )}
            </div>
          </PageCard>
        </div>
      )}

      {tab === "files" && (
        <FilesTab
          orgId={orgId}
          projectId={project.id}
          canWrite={canWrite}
          files={initial.files}
          onChanged={() => router.refresh()}
        />
      )}

      {tab === "boq" && (
        <BoqTab
          orgId={orgId}
          projectId={project.id}
          canWrite={canWrite}
          canSeeCost={canSeeCost}
          boqs={initial.boqs}
          activeBoqId={initial.activeBoqId}
          activeItems={initial.activeItems}
          categories={initial.categories}
          priceOptions={initial.priceOptions}
          onChanged={() => router.refresh()}
        />
      )}

      {tab === "purchasing" && canSeeCost && (
        <PurchasingTab orgSlug={orgSlug} rows={initial.purchaseRequests} />
      )}

      {tab === "billings" && (
        <Placeholder
          title="งวดงานและการวางบิล"
          detail="ตั้งงวดงานตามสัญญาแล้วออกใบแจ้งหนี้เข้าระบบบัญชี — เปิดใช้ในเฟสถัดไป"
        />
      )}

      {tab === "usage" && (
        <Placeholder
          title="วัสดุที่เบิกใช้จริง"
          detail={
            canSeeCost
              ? "เบิกของเข้าโครงการจากหน้าคลัง แล้วมาดูต้นทุนจริงเทียบงบที่นี่ — เปิดใช้ในเฟสถัดไป"
              : "รายการเบิกใช้ของโครงการ — เปิดใช้ในเฟสถัดไป"
          }
        />
      )}

      <EditProjectDialog
        open={editOpen}
        onOpenChange={setEditOpen}
        orgId={orgId}
        orgSlug={orgSlug}
        canSeeCost={canSeeCost}
        project={project}
        onSaved={(next) => {
          setProject(next);
          router.refresh();
        }}
      />
    </PageShell>
  );
}

function Field({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="min-w-0">
      <Text className="text-xs text-gray-500">{label}</Text>
      <Text className="text-sm text-gray-900">{value}</Text>
    </div>
  );
}

function Placeholder({ title, detail }: { title: string; detail: string }) {
  return (
    <PageCard>
      <div className="flex flex-col items-center justify-center gap-2 py-14 text-center">
        <div className="rounded-full bg-gray-100 p-4">
          <ReceiptText className="h-8 w-8 text-gray-400" />
        </div>
        <Title as="h3" className="text-sm font-medium text-gray-900">
          {title}
        </Title>
        <Text className="max-w-md text-sm text-gray-500">{detail}</Text>
      </div>
    </PageCard>
  );
}

interface EditForm {
  name: string;
  customer_name: string;
  site_address: string;
  latitude: string;
  longitude: string;
  start_date: string;
  end_date: string;
  contract_amount: string;
  retention_pct: string;
  margin_pct: string;
  status: ProjectStatus;
  note: string;
}

function toForm(p: JustMeProject): EditForm {
  return {
    name: p.name,
    customer_name: p.customer_name ?? "",
    site_address: p.site_address ?? "",
    latitude: p.latitude === null ? "" : String(p.latitude),
    longitude: p.longitude === null ? "" : String(p.longitude),
    start_date: p.start_date ?? "",
    end_date: p.end_date ?? "",
    contract_amount: p.contract_amount === null ? "" : String(p.contract_amount),
    retention_pct: p.retention_pct === null ? "" : String(p.retention_pct),
    margin_pct: p.margin_pct === null ? "" : String(p.margin_pct),
    status: p.status,
    note: p.note ?? "",
  };
}

function EditProjectDialog({
  open,
  onOpenChange,
  orgId,
  orgSlug,
  canSeeCost,
  project,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  orgId: string;
  orgSlug: string;
  canSeeCost: boolean;
  project: JustMeProject;
  onSaved: (p: JustMeProject) => void;
}) {
  const router = useRouter();
  const [form, setForm] = useState<EditForm>(() => toForm(project));
  const [saving, setSaving] = useState(false);
  const [cancelling, setCancelling] = useState(false);

  useEffect(() => {
    if (open) setForm(toForm(project));
  }, [open, project]);

  const set = (patch: Partial<EditForm>) => setForm((f) => ({ ...f, ...patch }));

  async function save() {
    if (!form.name.trim()) {
      notify.error("กรุณาระบุชื่อโครงการ");
      return;
    }
    setSaving(true);
    try {
      const body: Record<string, unknown> = {
        name: form.name.trim(),
        customer_name: form.customer_name.trim() || null,
        site_address: form.site_address.trim() || null,
        latitude: form.latitude.trim() || null,
        longitude: form.longitude.trim() || null,
        start_date: form.start_date || null,
        end_date: form.end_date || null,
        contract_amount: form.contract_amount.trim() || null,
        retention_pct: form.retention_pct.trim() || null,
        status: form.status,
        note: form.note.trim() || null,
      };
      if (canSeeCost) body.margin_pct = form.margin_pct.trim() || null;

      const res = await jmSend<{ project: JustMeProject }>(
        orgId,
        `projects/${project.id}`,
        "PATCH",
        body,
      );
      notify.updated("บันทึกข้อมูลโครงการแล้ว");
      onSaved(res.project);
      onOpenChange(false);
    } catch (e) {
      notify.error(e, "บันทึกไม่สำเร็จ");
    } finally {
      setSaving(false);
    }
  }

  async function cancelProject() {
    setCancelling(true);
    try {
      await jmSend(orgId, `projects/${project.id}`, "DELETE");
      notify.success("ยกเลิกโครงการแล้ว");
      onOpenChange(false);
      router.push(`/${orgSlug}/just-me/projects`);
    } catch (e) {
      notify.error(e, "ยกเลิกโครงการไม่สำเร็จ");
    } finally {
      setCancelling(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent size="xl">
        <DialogHeader>
          <DialogTitle>แก้ไขข้อมูลโครงการ</DialogTitle>
        </DialogHeader>
        <DialogBody>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="sm:col-span-2">
              <Label htmlFor="jm-edit-name">ชื่อโครงการ *</Label>
              <Input
                id="jm-edit-name"
                className="mt-1"
                value={form.name}
                onChange={(e) => set({ name: e.target.value })}
              />
            </div>
            <div>
              <Label htmlFor="jm-edit-customer">ลูกค้า</Label>
              <Input
                id="jm-edit-customer"
                className="mt-1"
                value={form.customer_name}
                onChange={(e) => set({ customer_name: e.target.value })}
              />
            </div>
            <div>
              <Label htmlFor="jm-edit-status">สถานะโครงการ</Label>
              <div className="mt-1">
                <CustomSelect
                  value={form.status}
                  onChange={(v) => set({ status: v as ProjectStatus })}
                  options={STATUS_OPTIONS}
                />
              </div>
            </div>
            <div className="sm:col-span-2">
              <Label htmlFor="jm-edit-site">ที่ตั้งหน้างาน</Label>
              <Input
                id="jm-edit-site"
                className="mt-1"
                value={form.site_address}
                onChange={(e) => set({ site_address: e.target.value })}
              />
            </div>
            <div>
              <Label htmlFor="jm-edit-lat">ละติจูด</Label>
              <Input
                id="jm-edit-lat"
                className="mt-1"
                inputMode="decimal"
                value={form.latitude}
                onChange={(e) => set({ latitude: e.target.value })}
                placeholder="13.7563"
              />
            </div>
            <div>
              <Label htmlFor="jm-edit-lng">ลองจิจูด</Label>
              <Input
                id="jm-edit-lng"
                className="mt-1"
                inputMode="decimal"
                value={form.longitude}
                onChange={(e) => set({ longitude: e.target.value })}
                placeholder="100.5018"
              />
            </div>
            <div>
              <Label>วันที่เริ่มงาน</Label>
              <div className="mt-1">
                <ThaiDatePicker
                  value={form.start_date}
                  onChange={(iso) => set({ start_date: iso })}
                />
              </div>
            </div>
            <div>
              <Label>กำหนดส่งมอบ</Label>
              <div className="mt-1">
                <ThaiDatePicker value={form.end_date} onChange={(iso) => set({ end_date: iso })} />
              </div>
            </div>
            <div>
              <Label htmlFor="jm-edit-contract">มูลค่าสัญญา (฿)</Label>
              <Input
                id="jm-edit-contract"
                className="mt-1"
                inputMode="decimal"
                value={form.contract_amount}
                onChange={(e) => set({ contract_amount: e.target.value })}
              />
              <p className="mt-1 text-xs text-gray-500">
                เว้นว่าง = ยังไม่มีสัญญา (ระบบเติมให้ตอนอนุมัติ BOQ ครั้งแรก)
              </p>
            </div>
            <div>
              <Label htmlFor="jm-edit-retention">เงินประกันผลงาน (%)</Label>
              <Input
                id="jm-edit-retention"
                className="mt-1"
                inputMode="decimal"
                value={form.retention_pct}
                onChange={(e) => set({ retention_pct: e.target.value })}
              />
            </div>
            {canSeeCost && (
              <div>
                <Label htmlFor="jm-edit-margin">%กำไรของโครงการนี้</Label>
                <Input
                  id="jm-edit-margin"
                  className="mt-1"
                  inputMode="decimal"
                  value={form.margin_pct}
                  onChange={(e) => set({ margin_pct: e.target.value })}
                  placeholder="เว้นว่าง = ใช้ค่าเริ่มต้นบริษัท"
                />
              </div>
            )}
            <div className="sm:col-span-2">
              <Label htmlFor="jm-edit-note">หมายเหตุ</Label>
              <Input
                id="jm-edit-note"
                className="mt-1"
                value={form.note}
                onChange={(e) => set({ note: e.target.value })}
              />
            </div>
          </div>
        </DialogBody>
        <DialogFooter>
          <Button
            variant="destructive"
            className="mr-auto"
            onClick={cancelProject}
            disabled={cancelling || saving || project.status === "cancelled"}
          >
            {cancelling ? "กำลังยกเลิก…" : "ยกเลิกโครงการ"}
          </Button>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
            ปิด
          </Button>
          <Button onClick={save} disabled={saving}>
            {saving ? "กำลังบันทึก…" : "บันทึก"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
