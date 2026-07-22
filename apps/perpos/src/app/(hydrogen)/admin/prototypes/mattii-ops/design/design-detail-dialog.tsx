"use client";

// design-detail-dialog.tsx — รายละเอียดงานแบบลาย 1 งาน
//  · ไทม์ไลน์เวอร์ชัน v1..vN — เห็นชัดว่า "เวอร์ชันไหนคือที่ลูกค้ายืนยัน"
//  · ฟีดแบ็กลูกค้าต่อเวอร์ชัน + AI สรุปเป็นเช็กลิสต์ (§5.6, โชว์ต้นฉบับคู่เสมอ)
//  · ตรวจไฟล์ก่อนพิมพ์ 2 ชั้น (§5.2) + ยืนยัน is_print_ready โดยคน
//  · ปุ่มขั้นถัดไปของงานแบบ — ส่งขอ CF / บันทึกผล CF (ผ่าน guard order-flow)

import { useMemo, useState } from "react";
import { FileImage, Send, ThumbsUp, UploadCloud } from "lucide-react";
import { Button } from "@/components/ui/button";
import { StatusBadge } from "@/components/ui/badge";
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Text } from "@/components/ui/typography";
import cn from "@core/utils/class-names";
import {
  CfStatusBadge,
  DesignJobStatusBadge,
  DesignSourceBadge,
  Field,
  OrderStatusBadge,
  fmtDateTimeTH,
  fmtNum,
  useMattiiRole,
} from "../_components";
import type { MattiiDesignVersion } from "../_fixtures/types";
import { CfFeedbackSummary } from "./cf-feedback-summary";
import { FileCheckPanel } from "./file-check-panel";
import { RecordCfDialog, SendCfDialog, UploadVersionDialog } from "./design-dialogs";
import type { DesignJobView } from "./use-design-state";

function VersionRow({
  version,
  isApproved,
  selected,
  onSelect,
}: {
  version: MattiiDesignVersion;
  isApproved: boolean;
  selected: boolean;
  onSelect: () => void;
}) {
  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onSelect}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onSelect();
        }
      }}
      className={cn(
        "cursor-pointer rounded-xl border p-3 transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gray-300",
        selected ? "border-primary bg-gray-50" : "border-gray-200 bg-white hover:bg-gray-50",
      )}
    >
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-sm font-semibold tabular-nums text-gray-900">
          v{version.version_no}
        </span>
        {isApproved && <StatusBadge tone="success">เวอร์ชันที่ลูกค้ายืนยัน</StatusBadge>}
        <CfStatusBadge status={version.cf_status} />
        {version.is_print_ready && <StatusBadge tone="info">พร้อมพิมพ์</StatusBadge>}
      </div>
      <div className="mt-1 flex items-center gap-2">
        <FileImage className="h-4 w-4 shrink-0 text-gray-400" />
        <span className="truncate font-mono text-xs text-gray-600">{version.file_name}</span>
      </div>
      <div className="mt-1 flex flex-wrap gap-x-4 gap-y-0.5 text-xs text-gray-500">
        <span className="tabular-nums">{fmtNum(version.dpi ?? 0)} dpi</span>
        <span className="tabular-nums">{fmtNum(version.file_size_kb ?? 0)} KB</span>
        <span>อัปโดย {version.uploaded_by_role === "designer" ? "ทีมแบบ" : "ฝ่ายขาย"}</span>
        <span className="tabular-nums">{fmtDateTimeTH(version.created_at)}</span>
      </div>
      {version.note && <Text className="mt-1 text-xs text-gray-500">{version.note}</Text>}
    </div>
  );
}

export function DesignDetailDialog({
  view,
  onOpenChange,
  onUpload,
  onSendCf,
  onApproveCf,
  onRejectCf,
  onSetPrintReady,
}: {
  view: DesignJobView | null;
  onOpenChange: (open: boolean) => void;
  onUpload: (view: DesignJobView, fileName: string, note: string | null) => void;
  onSendCf: (view: DesignJobView, versionId: string) => void;
  onApproveCf: (view: DesignJobView, versionId: string, feedback: string) => void;
  onRejectCf: (view: DesignJobView, versionId: string, feedback: string) => void;
  onSetPrintReady: (view: DesignJobView, versionId: string, value: boolean) => void;
}) {
  const { role } = useMattiiRole();
  const [selectedVersionId, setSelectedVersionId] = useState<string | null>(null);
  const [uploadOpen, setUploadOpen] = useState(false);
  const [sendOpen, setSendOpen] = useState(false);
  const [recordOpen, setRecordOpen] = useState(false);

  const selected = useMemo(() => {
    if (!view) return undefined;
    return view.versions.find((v) => v.id === selectedVersionId) ?? view.approved ?? view.latest;
  }, [view, selectedVersionId]);

  if (!view) return null;

  const canDesign = role === "designer" || role === "owner";
  const canRecordCf = role === "sale" || role === "owner";
  const rejectedWithFeedback = view.versions.filter(
    (v) => v.cf_status === "rejected" && v.customer_feedback,
  );

  return (
    <>
      <Dialog open onOpenChange={onOpenChange}>
        <DialogContent size="3xl">
          <DialogHeader>
            <DialogTitle>
              งานแบบ {view.job.job_no} · ออเดอร์ {view.order?.order_no ?? "—"}
            </DialogTitle>
          </DialogHeader>
          <DialogBody>
            <div className="space-y-4">
              <div className="flex flex-wrap items-center gap-1.5">
                <DesignJobStatusBadge status={view.job.status} />
                <CfStatusBadge status={view.job.cf_status} />
                <DesignSourceBadge source={view.job.design_source} />
                {view.order && <OrderStatusBadge status={view.order.status} />}
                {view.job.revision_count > 0 && (
                  <StatusBadge tone="warning">แก้มาแล้ว {view.job.revision_count} รอบ</StatusBadge>
                )}
              </div>

              <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                <Field label="ลูกค้า">{view.customer?.display_name ?? "—"}</Field>
                <Field label="ผู้รับผิดชอบ">{view.designer?.display_name ?? "ยังไม่มอบหมาย"}</Field>
                <Field label="กำหนดส่งงานแบบ">
                  <span className="tabular-nums">{fmtDateTimeTH(view.job.due_at)}</span>
                </Field>
                <Field label="จำนวนเวอร์ชัน">
                  <span className="tabular-nums">{fmtNum(view.versions.length)}</span>
                </Field>
              </div>

              {view.job.brief && (
                <div className="rounded-xl border border-gray-200 bg-white p-3">
                  <div className="text-xs font-medium text-gray-500">โจทย์งานแบบ</div>
                  <Text className="mt-0.5 text-sm text-gray-900">{view.job.brief}</Text>
                </div>
              )}

              <div>
                <div className="mb-2 px-1 text-sm font-semibold text-gray-900">
                  ไทม์ไลน์เวอร์ชันไฟล์ลาย
                </div>
                {view.versions.length === 0 ? (
                  <div className="flex flex-col items-center rounded-xl border border-gray-200 bg-white py-10 text-center">
                    <div className="mb-3 rounded-full bg-gray-100 p-4">
                      <FileImage className="h-7 w-7 text-gray-400" />
                    </div>
                    <Text className="text-sm font-medium text-gray-900">
                      ยังไม่มีไฟล์ลายในงานนี้
                    </Text>
                    <Text className="mt-1 text-sm text-gray-500">
                      อัปโหลดเวอร์ชันแรกเพื่อเริ่มขอให้ลูกค้ายืนยันลาย
                    </Text>
                    <Button
                      size="sm"
                      className="mt-3"
                      disabled={!canDesign}
                      onClick={() => setUploadOpen(true)}
                    >
                      <UploadCloud className="mr-1.5 h-4 w-4" /> อัปโหลดเวอร์ชันแรก
                    </Button>
                  </div>
                ) : (
                  <div className="space-y-2">
                    {view.versions.map((v) => (
                      <VersionRow
                        key={v.id}
                        version={v}
                        isApproved={view.job.approved_version_id === v.id}
                        selected={selected?.id === v.id}
                        onSelect={() => setSelectedVersionId(v.id)}
                      />
                    ))}
                  </div>
                )}
              </div>

              {selected && (
                <FileCheckPanel
                  key={selected.id}
                  version={selected}
                  approvedVersionId={view.job.approved_version_id}
                  canConfirm={canDesign}
                  onSetPrintReady={(value) => onSetPrintReady(view, selected.id, value)}
                />
              )}

              {rejectedWithFeedback.length > 0 && (
                <div>
                  <div className="mb-2 px-1 text-sm font-semibold text-gray-900">
                    ความเห็นลูกค้าที่ขอแก้
                  </div>
                  <div className="space-y-2">
                    {rejectedWithFeedback.map((v) => (
                      <div key={v.id}>
                        <div className="mb-1 px-1 text-xs text-gray-500">
                          ต่อเวอร์ชัน v{v.version_no}
                        </div>
                        <CfFeedbackSummary
                          designJobId={view.job.id}
                          feedback={v.customer_feedback ?? ""}
                        />
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </DialogBody>
          <DialogFooter>
            <Button
              variant="outline"
              className="mr-auto"
              disabled={!canDesign}
              title={canDesign ? undefined : "เฉพาะทีมแบบ/เจ้าของอัปโหลดเวอร์ชันได้"}
              onClick={() => setUploadOpen(true)}
            >
              <UploadCloud className="mr-1.5 h-4 w-4" /> อัปโหลดเวอร์ชันใหม่
            </Button>
            <Button
              variant="outline"
              disabled={!canDesign || view.versions.length === 0}
              onClick={() => setSendOpen(true)}
            >
              <Send className="mr-1.5 h-4 w-4" /> ส่งให้ลูกค้ายืนยัน
            </Button>
            <Button
              disabled={!canRecordCf || view.versions.length === 0}
              title={canRecordCf ? undefined : "เฉพาะฝ่ายขาย/เจ้าของบันทึกผลจากลูกค้าได้"}
              onClick={() => setRecordOpen(true)}
            >
              <ThumbsUp className="mr-1.5 h-4 w-4" /> บันทึกผลจากลูกค้า
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {uploadOpen && (
        <UploadVersionDialog
          view={view}
          open={uploadOpen}
          onOpenChange={setUploadOpen}
          onSubmit={(fileName, note) => onUpload(view, fileName, note)}
        />
      )}
      {sendOpen && (
        <SendCfDialog
          view={view}
          open={sendOpen}
          onOpenChange={setSendOpen}
          onSubmit={(versionId) => onSendCf(view, versionId)}
        />
      )}
      {recordOpen && (
        <RecordCfDialog
          view={view}
          open={recordOpen}
          onOpenChange={setRecordOpen}
          onApprove={(versionId, feedback) => onApproveCf(view, versionId, feedback)}
          onReject={(versionId, feedback) => onRejectCf(view, versionId, feedback)}
        />
      )}
    </>
  );
}
