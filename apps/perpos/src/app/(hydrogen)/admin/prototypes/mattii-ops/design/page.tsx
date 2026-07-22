"use client";

// design/page.tsx — งานแบบลาย & CF (Contract v3 หน้า 4)
//  · คิวงานแบบ + สถานะการยืนยันลายจากลูกค้า (CF)
//  · CF = ฝ่ายขายบันทึกผลแทนลูกค้า (ไม่มีปุ่มให้ลูกค้ากดเอง)
//  · AI mock: §5.2 ตรวจไฟล์ลาย 2 ชั้น (ในรายละเอียดงาน) · §5.6 สรุปฟีดแบ็ก CF เป็นเช็กลิสต์

import { useEffect, useMemo, useState } from "react";
import { Palette, Search, Timer } from "lucide-react";
import { CustomSelect } from "@/components/ui/custom-select";
import { Input } from "@/components/ui/input";
import { StatCard } from "@/components/ui/stat-card";
import { SkeletonTable } from "@/components/ui/skeleton";
import { notify } from "@/lib/toast";
import { DESIGN_JOB_STATUS_LABEL, DESIGN_SOURCE_LABEL } from "../_fixtures/labels";
import { avgCfWaitDays, staleAwaitingCfCount } from "../_fixtures/metrics";
import type { DesignJobStatus, DesignSource } from "../_fixtures/types";
import {
  FilterBar,
  MattiiShell,
  NoAccess,
  fmtNum,
  useMattiiData,
  useMattiiRole,
} from "../_components";
import { DesignTable } from "./design-table";
import { DesignDetailDialog } from "./design-detail-dialog";
import { useDesignState, type DesignJobView } from "./use-design-state";

const STATUS_OPTIONS = [
  { value: "", label: "ทุกสถานะงานแบบ" },
  ...(Object.keys(DESIGN_JOB_STATUS_LABEL) as DesignJobStatus[]).map((k) => ({
    value: k,
    label: DESIGN_JOB_STATUS_LABEL[k],
  })),
];

const SOURCE_OPTIONS = [
  { value: "", label: "ที่มาของลายทั้งหมด" },
  ...(Object.keys(DESIGN_SOURCE_LABEL) as DesignSource[]).map((k) => ({
    value: k,
    label: DESIGN_SOURCE_LABEL[k],
  })),
];

export default function DesignPage() {
  const { can } = useMattiiRole();
  const { orders, staff } = useMattiiData();
  const { views, uploadVersion, sendForCf, recordCfApproved, recordCfRejected, setPrintReady } =
    useDesignState();

  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState<DesignJobStatus | "">("");
  const [source, setSource] = useState<DesignSource | "">("");
  const [designerId, setDesignerId] = useState("");
  const [selectedJobId, setSelectedJobId] = useState<string | null>(null);

  // จำลองการโหลดข้อมูลครั้งแรก → โชว์ skeleton (DESIGN §9)
  useEffect(() => {
    const t = window.setTimeout(() => setLoading(false), 450);
    return () => window.clearTimeout(t);
  }, []);

  const designerOptions = useMemo(
    () => [
      { value: "", label: "ผู้รับผิดชอบทุกคน" },
      ...staff
        .filter((s) => s.role === "designer")
        .map((s) => ({ value: s.id, label: s.display_name })),
    ],
    [staff],
  );

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return views.filter((v) => {
      if (status && v.job.status !== status) return false;
      if (source && v.job.design_source !== source) return false;
      if (designerId && v.job.assigned_designer_id !== designerId) return false;
      if (!q) return true;
      return (
        v.job.job_no.toLowerCase().includes(q) ||
        (v.order?.order_no.toLowerCase().includes(q) ?? false) ||
        (v.customer?.display_name.toLowerCase().includes(q) ?? false) ||
        (v.job.brief?.toLowerCase().includes(q) ?? false)
      );
    });
  }, [views, search, status, source, designerId]);

  const kpi = useMemo(() => {
    const waitingCf = views.filter((v) => v.job.cf_status === "sent").length;
    const inProgress = views.filter(
      (v) => v.job.status === "in_progress" || v.job.status === "revising",
    ).length;
    return {
      waitingCf,
      inProgress,
      stale: staleAwaitingCfCount(2, orders),
      avgWait: avgCfWaitDays(orders),
    };
  }, [views, orders]);

  const selected = selectedJobId
    ? (filtered.find((v) => v.job.id === selectedJobId) ??
      views.find((v) => v.job.id === selectedJobId) ??
      null)
    : null;

  const hasFilter = !!(search || status || source || designerId);
  function clearFilters() {
    setSearch("");
    setStatus("");
    setSource("");
    setDesignerId("");
  }

  if (!can("view", "design")) {
    return (
      <NoAccess title="งานแบบลาย & CF" icon={<Palette className="h-6 w-6" />}>
        บทบาทนี้ไม่มีสิทธิ์ดูคิวงานแบบ — ลองสลับเป็นทีมแบบ/กราฟิก ฝ่ายขาย หรือเจ้าของ
      </NoAccess>
    );
  }

  function handleUpload(view: DesignJobView, fileName: string, note: string | null) {
    uploadVersion(view, fileName, note);
  }
  function handleSendCf(view: DesignJobView, versionId: string) {
    sendForCf(view, versionId);
  }
  function handleApprove(view: DesignJobView, versionId: string, feedback: string) {
    recordCfApproved(view, versionId, feedback);
  }
  function handleReject(view: DesignJobView, versionId: string, feedback: string) {
    recordCfRejected(view, versionId, feedback);
  }
  function handlePrintReady(view: DesignJobView, versionId: string, value: boolean) {
    setPrintReady(view, versionId, value);
    if (!value) notify.info("ต้องยืนยันไฟล์อีกครั้งก่อนส่งเข้าคิวพิมพ์");
  }

  return (
    <MattiiShell
      title="งานแบบลาย & CF"
      description="คิวงานกราฟิก เวอร์ชันไฟล์ลาย และการยืนยันลายจากลูกค้า (ฝ่ายขายบันทึกผลให้)"
      icon={<Palette className="h-6 w-6" />}
    >
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          icon={<Palette className="h-4 w-4" />}
          label="กำลังออกแบบ / กำลังแก้"
          value={fmtNum(kpi.inProgress)}
          sub="งานที่ทีมแบบถืออยู่ตอนนี้"
          tone="info"
        />
        <StatCard
          icon={<Timer className="h-4 w-4" />}
          label="รอลูกค้ายืนยันลาย"
          value={fmtNum(kpi.waitingCf)}
          sub="ส่งลายไปแล้ว รอคำตอบ"
          tone="warning"
          valueColored
        />
        <StatCard
          icon={<Timer className="h-4 w-4" />}
          label="ค้างรอยืนยัน ≥ 2 วัน"
          value={fmtNum(kpi.stale)}
          sub="ตามให้ไว ลดเวลารอทั้งสายงาน"
          tone="negative"
          valueColored
        />
        <StatCard
          icon={<Timer className="h-4 w-4" />}
          label="เวลารอยืนยันเฉลี่ย"
          value={`${fmtNum(kpi.avgWait, 1)} วัน`}
          sub="นับจากยืนยันออเดอร์ถึงลูกค้าเคาะลาย"
          tone="neutral"
        />
      </div>

      <div>
        <FilterBar
          onClear={hasFilter ? clearFilters : undefined}
          resultText={`แสดง ${fmtNum(filtered.length)} จาก ${fmtNum(views.length)} งานแบบ`}
        >
          <div className="relative w-full sm:w-72">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="ค้นหาเลขงานแบบ / ออเดอร์ / ลูกค้า"
              className="pl-9"
            />
          </div>
          <CustomSelect
            value={status}
            onChange={(v) => setStatus(v as DesignJobStatus | "")}
            options={STATUS_OPTIONS}
            className="w-48"
          />
          <CustomSelect
            value={source}
            onChange={(v) => setSource(v as DesignSource | "")}
            options={SOURCE_OPTIONS}
            className="w-48"
          />
          <CustomSelect
            value={designerId}
            onChange={setDesignerId}
            options={designerOptions}
            className="w-48"
          />
        </FilterBar>

        {loading ? (
          <SkeletonTable rows={6} cols={8} />
        ) : (
          <DesignTable
            rows={filtered}
            filtered={hasFilter}
            onSelect={(v) => setSelectedJobId(v.job.id)}
            onClearFilters={clearFilters}
          />
        )}
      </div>

      <DesignDetailDialog
        view={selected}
        onOpenChange={(open) => !open && setSelectedJobId(null)}
        onUpload={handleUpload}
        onSendCf={handleSendCf}
        onApproveCf={handleApprove}
        onRejectCf={handleReject}
        onSetPrintReady={handlePrintReady}
      />
    </MattiiShell>
  );
}
