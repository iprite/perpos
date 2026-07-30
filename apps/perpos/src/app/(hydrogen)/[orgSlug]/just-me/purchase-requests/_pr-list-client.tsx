"use client";

/**
 * _pr-list-client.tsx — ตัวกรอง + ตารางใบขอซื้อ + กล่องสร้างใบใหม่
 * ข้อมูลมาจาก server component (searchParams-driven) — ที่นี่แค่กดแล้วเปลี่ยน URL/ยิง mutation
 * ⛔ ยอดเงินคิดมาจาก `project-metrics.ts` แล้ว (หน้าไม่คำนวณเอง)
 */

import { useEffect, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Plus, ShoppingCart } from "lucide-react";
import { StatusBadge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
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
import { PR_STATUS_LABEL, PR_STATUS_TONE } from "@/lib/just-me/labels";
import type { PurchaseRequestStatus } from "@/lib/just-me/types";
import { jmSend } from "../_components/api-client";
import { money, thaiDate } from "../_components/format";

export interface PrListRow {
  id: string;
  pr_code: string;
  status: PurchaseRequestStatus;
  project_label: string;
  needed_date: string | null;
  vendor_label: string | null;
  total_estimated_cost: number | null;
  total_selected_cost: number | null;
}

interface Option {
  value: string;
  label: string;
}

const STATUS_OPTIONS: Option[] = [
  { value: "", label: "ทุกสถานะ" },
  ...(Object.keys(PR_STATUS_LABEL) as PurchaseRequestStatus[]).map((s) => ({
    value: s,
    label: PR_STATUS_LABEL[s],
  })),
];

export function PurchaseRequestsClient({
  orgId,
  orgSlug,
  canWrite,
  rows,
  total,
  page,
  pageSize,
  projectId,
  status,
  q,
  projectOptions,
  warehouseOptions,
}: {
  orgId: string;
  orgSlug: string;
  canWrite: boolean;
  rows: PrListRow[];
  total: number;
  page: number;
  pageSize: number;
  projectId: string;
  status: PurchaseRequestStatus | "";
  q: string;
  projectOptions: Option[];
  warehouseOptions: Option[];
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [term, setTerm] = useState(q);
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    project_id: projectId,
    warehouse_id: warehouseOptions[0]?.value ?? "",
    needed_date: "",
    note: "",
  });

  useEffect(() => setTerm(q), [q]);

  const hasFilter = Boolean(projectId || status || q);
  const pagerQuery = useMemo(() => ({ projectId, status, q }), [projectId, status, q]);

  function apply(next: { projectId?: string; status?: string; q?: string }) {
    const params = new URLSearchParams();
    const nextProject = next.projectId ?? projectId;
    const nextStatus = next.status ?? status;
    const nextQ = next.q ?? term;
    if (nextProject) params.set("projectId", nextProject);
    if (nextStatus) params.set("status", nextStatus);
    if (nextQ.trim()) params.set("q", nextQ.trim());
    const s = params.toString();
    startTransition(() => router.push(s ? `?${s}` : "?"));
  }

  async function createPr() {
    setSaving(true);
    try {
      const res = await jmSend<{ pr: { id: string; pr_code: string } }>(
        orgId,
        "purchase-requests",
        "POST",
        {
          project_id: form.project_id || null,
          warehouse_id: form.warehouse_id || null,
          needed_date: form.needed_date || null,
          note: form.note.trim() || null,
        },
      );
      notify.created(`สร้างใบขอซื้อ ${res.pr.pr_code} แล้ว`);
      setOpen(false);
      router.push(`/${orgSlug}/just-me/purchase-requests/${res.pr.id}`);
    } catch (e) {
      notify.error(e, "สร้างใบขอซื้อไม่สำเร็จ");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-3">
      <FilterBar>
        <FilterSearch
          value={term}
          onChange={setTerm}
          onEnter={() => apply({ q: term })}
          placeholder="ค้นหา เลขที่ใบ / หมายเหตุ (กด Enter)"
        />
        <CustomSelect
          value={projectId}
          onChange={(v) => apply({ projectId: v })}
          options={[{ value: "", label: "ทุกโครงการ" }, ...projectOptions]}
          className="w-56"
        />
        <CustomSelect
          value={status}
          onChange={(v) => apply({ status: v })}
          options={STATUS_OPTIONS}
          className="w-40"
        />
        <FilterClear
          onClick={() => {
            setTerm("");
            startTransition(() => router.push("?"));
          }}
          disabled={!hasFilter && !term}
        />
        {canWrite && (
          <Button onClick={() => setOpen(true)}>
            <Plus className="h-4 w-4" /> สร้างใบขอซื้อ
          </Button>
        )}
      </FilterBar>

      <Table stickyHeader fillViewport>
        <TableHeader sticky>
          <TableRow>
            <TableHead>เลขที่ใบ</TableHead>
            <TableHead>โครงการ</TableHead>
            <TableHead align="center">สถานะ</TableHead>
            <TableHead>ต้องการใช้</TableHead>
            <TableHead>ผู้ขายที่เลือก</TableHead>
            <TableHead align="right">ยอดประเมิน</TableHead>
            <TableHead align="right">ยอดที่เลือก</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.length === 0 ? (
            <TableEmpty colSpan={7}>
              <div className="flex flex-col items-center gap-2 py-6">
                <div className="rounded-full bg-gray-100 p-4">
                  <ShoppingCart className="h-8 w-8 text-gray-400" />
                </div>
                <Text className="text-sm font-medium text-gray-900">
                  {hasFilter ? "ไม่พบใบขอซื้อตามเงื่อนไขที่กรอง" : "ยังไม่มีใบขอซื้อ"}
                </Text>
                <Text className="text-sm text-gray-500">
                  {hasFilter
                    ? "ลองล้างตัวกรองหรือเปลี่ยนคำค้น"
                    : "เลือกรายการจาก BOQ ของโครงการ แล้วสร้างใบขอซื้อเพื่อเทียบราคาผู้ขาย"}
                </Text>
                {canWrite && !hasFilter && (
                  <Button size="sm" onClick={() => setOpen(true)}>
                    <Plus className="h-4 w-4" /> สร้างใบขอซื้อใบแรก
                  </Button>
                )}
              </div>
            </TableEmpty>
          ) : (
            rows.map((row) => (
              <TableRow
                key={row.id}
                clickable
                onClick={() => router.push(`/${orgSlug}/just-me/purchase-requests/${row.id}`)}
              >
                <TableCell className="font-mono text-xs text-gray-500">{row.pr_code}</TableCell>
                <TableCell className="font-medium text-gray-900">{row.project_label}</TableCell>
                <TableCell align="center">
                  <StatusBadge tone={PR_STATUS_TONE[row.status]}>
                    {PR_STATUS_LABEL[row.status]}
                  </StatusBadge>
                </TableCell>
                <TableCell>{thaiDate(row.needed_date)}</TableCell>
                <TableCell>{row.vendor_label || "—"}</TableCell>
                <TableCell align="right" tabular>
                  {money(row.total_estimated_cost)}
                </TableCell>
                <TableCell align="right" tabular>
                  {money(row.total_selected_cost)}
                </TableCell>
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
        unit="ใบ"
        className={pending ? "opacity-60" : undefined}
      />

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent size="lg">
          <DialogHeader>
            <DialogTitle>สร้างใบขอซื้อ</DialogTitle>
          </DialogHeader>
          <DialogBody>
            <div className="space-y-4">
              <div>
                <Label>โครงการ</Label>
                <div className="mt-1">
                  <CustomSelect
                    value={form.project_id}
                    onChange={(v) => setForm((f) => ({ ...f, project_id: v }))}
                    options={[
                      { value: "", label: "ซื้อเข้าคลังกลาง (ไม่ผูกโครงการ)" },
                      ...projectOptions,
                    ]}
                  />
                </div>
                <p className="mt-1 text-xs text-gray-500">
                  เลขที่ใบ (PR-25xx-001) ระบบออกให้อัตโนมัติ · เพิ่มรายการที่จะสั่งซื้อในหน้าถัดไป
                </p>
              </div>
              <div>
                <Label>คลังปลายทาง</Label>
                <div className="mt-1">
                  <CustomSelect
                    value={form.warehouse_id}
                    onChange={(v) => setForm((f) => ({ ...f, warehouse_id: v }))}
                    options={[{ value: "", label: "— เลือกคลัง —" }, ...warehouseOptions]}
                  />
                </div>
                <p className="mt-1 text-xs text-gray-500">คลังที่ของจะเข้าตอนรับของ</p>
              </div>
              <div>
                <Label>วันที่ต้องการใช้</Label>
                <div className="mt-1">
                  <ThaiDatePicker
                    value={form.needed_date}
                    onChange={(iso) => setForm((f) => ({ ...f, needed_date: iso }))}
                  />
                </div>
              </div>
              <div>
                <Label htmlFor="jm-pr-note">หมายเหตุ</Label>
                <Input
                  id="jm-pr-note"
                  className="mt-1"
                  value={form.note}
                  onChange={(e) => setForm((f) => ({ ...f, note: e.target.value }))}
                />
              </div>
            </div>
          </DialogBody>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)} disabled={saving}>
              ยกเลิก
            </Button>
            <Button onClick={createPr} disabled={saving}>
              {saving ? "กำลังสร้าง…" : "สร้างใบขอซื้อ"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
