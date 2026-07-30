"use client";

/**
 * _projects-client.tsx — ตาราง/ตัวกรอง/กล่องเพิ่มโครงการ ของหน้า `projects`
 * ข้อมูลมาจาก server component (searchParams-driven) — ที่นี่แค่ "กด" แล้วเปลี่ยน URL/ยิง mutation
 * ⛔ ไม่คำนวณเงินเอง — ตัวเลขทุกช่องถูกคิดมาจาก `lib/just-me/project-metrics.ts` แล้ว
 */

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { FolderKanban, FolderPlus, Plus } from "lucide-react";
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
import { FilterBar, FilterClear, FilterSearch } from "@/components/ui/filter-bar";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { PageShell } from "@/components/ui/page-shell";
import {
  Table,
  TableBody,
  TableCell,
  TableEmpty,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { LinkTablePager } from "@/components/ui/table-pager";
import { ThaiDatePicker } from "@/components/ui/thai-date-picker";
import { Text } from "@/components/ui/typography";
import { notify } from "@/lib/toast";
import { PROJECT_STATUS_LABEL, PROJECT_STATUS_TONE } from "@/lib/just-me/labels";
import type { ProjectStatus } from "@/lib/just-me/types";
import { jmSend } from "../_components/api-client";
import { money, percent } from "../_components/format";

export interface ProjectListRow {
  id: string;
  project_code: string;
  name: string;
  customer_name: string | null;
  status: ProjectStatus;
  contract_amount: number | null;
  /** null เมื่อผู้ใช้ไม่มีสิทธิ์เห็นต้นทุน (server ไม่ส่งค่ามาเลย) */
  actual_cost: number | null;
  progress_pct: number | null;
  forecast_profit: number | null;
  over_budget: boolean;
}

const STATUS_OPTIONS = [
  { value: "", label: "ทุกสถานะ" },
  ...(Object.keys(PROJECT_STATUS_LABEL) as ProjectStatus[]).map((s) => ({
    value: s,
    label: PROJECT_STATUS_LABEL[s],
  })),
];

interface NewProjectForm {
  name: string;
  customer_name: string;
  site_address: string;
  start_date: string;
  note: string;
}

const EMPTY_FORM: NewProjectForm = {
  name: "",
  customer_name: "",
  site_address: "",
  start_date: "",
  note: "",
};

export function ProjectsClient({
  orgId,
  orgSlug,
  canWrite,
  canSeeCost,
  rows,
  total,
  page,
  pageSize,
  status,
  q,
  kpi,
}: {
  orgId: string;
  orgSlug: string;
  canWrite: boolean;
  canSeeCost: boolean;
  rows: ProjectListRow[];
  total: number;
  page: number;
  pageSize: number;
  status: ProjectStatus | "";
  q: string;
  /** การ์ดสรุปที่ server คิดมาแล้ว (วางเหนือแถบตัวกรอง) */
  kpi: React.ReactNode;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [term, setTerm] = useState(q);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<NewProjectForm>(EMPTY_FORM);
  const [saving, setSaving] = useState(false);

  const hasFilter = Boolean(status) || Boolean(q);
  const colSpan = canSeeCost ? 8 : 5;

  const pagerQuery = useMemo(() => ({ status, q }), [status, q]);

  function apply(next: { status?: string; q?: string }) {
    const params = new URLSearchParams();
    const nextStatus = next.status ?? status;
    const nextQ = next.q ?? term;
    if (nextStatus) params.set("status", nextStatus);
    if (nextQ.trim()) params.set("q", nextQ.trim());
    const s = params.toString();
    startTransition(() => router.push(s ? `?${s}` : "?"));
  }

  function reset() {
    setTerm("");
    startTransition(() => router.push("?"));
  }

  async function createProject() {
    if (!form.name.trim()) {
      notify.error("กรุณาระบุชื่อโครงการ");
      return;
    }
    setSaving(true);
    try {
      const res = await jmSend<{ project: { id: string; project_code: string } }>(
        orgId,
        "projects",
        "POST",
        {
          name: form.name.trim(),
          customer_name: form.customer_name.trim() || null,
          site_address: form.site_address.trim() || null,
          start_date: form.start_date || null,
          note: form.note.trim() || null,
        },
      );
      notify.created(`สร้างโครงการ ${res.project.project_code} แล้ว`);
      setOpen(false);
      setForm(EMPTY_FORM);
      router.push(`/${orgSlug}/just-me/projects/${res.project.id}`);
    } catch (e) {
      notify.error(e, "สร้างโครงการไม่สำเร็จ");
    } finally {
      setSaving(false);
    }
  }

  return (
    <PageShell
      title="โครงการ"
      description="ทะเบียนงานรับเหมา ตั้งแต่สำรวจหน้างานจนปิดโครงการ"
      icon={<FolderKanban className="h-6 w-6" />}
      width="full"
      actions={
        canWrite ? (
          <Button onClick={() => setOpen(true)}>
            <Plus className="h-4 w-4" /> เพิ่มโครงการ
          </Button>
        ) : undefined
      }
    >
      {kpi}
      <FilterBar>
        <FilterSearch
          value={term}
          onChange={setTerm}
          onEnter={() => apply({ q: term })}
          placeholder="ค้นหา ชื่อโครงการ / รหัส / ลูกค้า (กด Enter)"
        />
        <CustomSelect
          value={status}
          onChange={(v) => apply({ status: v })}
          options={STATUS_OPTIONS}
          className="w-44"
        />
        <FilterClear onClick={reset} disabled={!hasFilter && !term} />
      </FilterBar>

      <div className="space-y-3">
        <Table stickyHeader fillViewport>
          <TableHeader sticky>
            <TableRow>
              <TableHead>รหัส</TableHead>
              <TableHead>ชื่อโครงการ</TableHead>
              <TableHead>ลูกค้า</TableHead>
              <TableHead align="center">สถานะ</TableHead>
              <TableHead align="right">มูลค่าสัญญา</TableHead>
              {canSeeCost && (
                <>
                  <TableHead align="right">ต้นทุนจริง</TableHead>
                  <TableHead align="right">%คืบหน้า</TableHead>
                  <TableHead align="right">กำไรคาดการณ์ ≈</TableHead>
                </>
              )}
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.length === 0 ? (
              <TableEmpty colSpan={colSpan}>
                <div className="flex flex-col items-center gap-2 py-6">
                  <div className="rounded-full bg-gray-100 p-4">
                    <FolderPlus className="h-8 w-8 text-gray-400" />
                  </div>
                  <Text className="text-sm font-medium text-gray-900">
                    {hasFilter ? "ไม่พบโครงการตามเงื่อนไขที่กรอง" : "ยังไม่มีโครงการ"}
                  </Text>
                  <Text className="text-sm text-gray-500">
                    {hasFilter
                      ? "ลองล้างตัวกรองหรือเปลี่ยนคำค้น"
                      : "เริ่มจากสร้างโครงการที่ไปสำรวจหน้างานมา แล้วค่อยถอด BOQ"}
                  </Text>
                  {hasFilter ? (
                    <Button size="sm" variant="outline" onClick={reset}>
                      ล้างตัวกรอง
                    </Button>
                  ) : (
                    canWrite && (
                      <Button size="sm" onClick={() => setOpen(true)}>
                        <Plus className="h-4 w-4" /> เพิ่มโครงการแรก
                      </Button>
                    )
                  )}
                </div>
              </TableEmpty>
            ) : (
              rows.map((row) => (
                <TableRow
                  key={row.id}
                  clickable
                  onClick={() => router.push(`/${orgSlug}/just-me/projects/${row.id}`)}
                >
                  <TableCell className="font-mono text-xs text-gray-500">
                    {row.project_code}
                  </TableCell>
                  <TableCell className="font-medium text-gray-900">{row.name}</TableCell>
                  <TableCell>{row.customer_name || "—"}</TableCell>
                  <TableCell align="center">
                    <StatusBadge tone={PROJECT_STATUS_TONE[row.status]}>
                      {PROJECT_STATUS_LABEL[row.status]}
                    </StatusBadge>
                  </TableCell>
                  <TableCell align="right" tabular>
                    {money(row.contract_amount)}
                  </TableCell>
                  {canSeeCost && (
                    <>
                      <TableCell
                        align="right"
                        tabular
                        className={row.over_budget ? "text-red-600" : undefined}
                      >
                        {money(row.actual_cost)}
                      </TableCell>
                      <TableCell align="right" className="tabular-nums">
                        {row.progress_pct === null ? (
                          <span className="text-xs text-gray-400">ยังไม่บันทึก</span>
                        ) : (
                          percent(row.progress_pct)
                        )}
                      </TableCell>
                      <TableCell
                        align="right"
                        tabular
                        className={
                          row.forecast_profit !== null && row.forecast_profit < 0
                            ? "text-red-600"
                            : undefined
                        }
                      >
                        {money(row.forecast_profit)}
                      </TableCell>
                    </>
                  )}
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>

        <LinkTablePager
          page={page}
          pageSize={pageSize}
          total={total}
          query={pagerQuery}
          unit="โครงการ"
          className={pending ? "opacity-60" : undefined}
        />
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent size="lg">
          <DialogHeader>
            <DialogTitle>เพิ่มโครงการ</DialogTitle>
          </DialogHeader>
          <DialogBody>
            <div className="space-y-4">
              <div>
                <Label htmlFor="jm-project-name">ชื่อโครงการ *</Label>
                <Input
                  id="jm-project-name"
                  className="mt-1"
                  value={form.name}
                  onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                  placeholder="เช่น ติดตั้ง CCTV โรงงาน A"
                />
                <p className="mt-1 text-xs text-gray-500">
                  รหัสโครงการ (JM-25xx-001) ระบบออกให้อัตโนมัติ
                </p>
              </div>
              <div>
                <Label htmlFor="jm-project-customer">ลูกค้า</Label>
                <Input
                  id="jm-project-customer"
                  className="mt-1"
                  value={form.customer_name}
                  onChange={(e) => setForm((f) => ({ ...f, customer_name: e.target.value }))}
                  placeholder="ชื่อผู้ว่าจ้าง"
                />
              </div>
              <div>
                <Label htmlFor="jm-project-site">ที่ตั้งหน้างาน</Label>
                <Input
                  id="jm-project-site"
                  className="mt-1"
                  value={form.site_address}
                  onChange={(e) => setForm((f) => ({ ...f, site_address: e.target.value }))}
                  placeholder="ที่อยู่/สถานที่ติดตั้ง"
                />
              </div>
              <div>
                <Label htmlFor="jm-project-start">วันที่เริ่มงาน</Label>
                <div className="mt-1">
                  <ThaiDatePicker
                    value={form.start_date}
                    onChange={(iso) => setForm((f) => ({ ...f, start_date: iso }))}
                    placeholder="เลือกวันที่"
                  />
                </div>
              </div>
              <div>
                <Label htmlFor="jm-project-note">หมายเหตุ</Label>
                <Input
                  id="jm-project-note"
                  className="mt-1"
                  value={form.note}
                  onChange={(e) => setForm((f) => ({ ...f, note: e.target.value }))}
                  placeholder="รายละเอียดเพิ่มเติม"
                />
              </div>
            </div>
          </DialogBody>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)} disabled={saving}>
              ยกเลิก
            </Button>
            <Button onClick={createProject} disabled={saving}>
              {saving ? "กำลังบันทึก…" : "บันทึก"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </PageShell>
  );
}
