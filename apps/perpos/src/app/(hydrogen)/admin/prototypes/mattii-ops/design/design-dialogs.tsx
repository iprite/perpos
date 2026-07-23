"use client";

// design-dialogs.tsx — dialog ของหน้างานแบบลาย: อัปโหลดเวอร์ชัน · ส่งขอ CF · บันทึกผล CF
// CF = **Sale บันทึกผลแทนลูกค้า** (ไม่มี LIFF ให้ลูกค้ากดเอง) ตาม contract v3
// ทุก dialog: DialogBody + size ตามมาตรฐาน DESIGN §13

import { useState } from "react";
import { Send, ThumbsUp, Undo2, UploadCloud } from "lucide-react";
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
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { SegmentedControl } from "@/components/ui/segmented";
import { Textarea } from "@/components/ui/textarea";
import { Text } from "@/components/ui/typography";
import { notify } from "@/lib/toast";
import { CfFeedbackSummary } from "./cf-feedback-summary";
import type { DesignJobView } from "./use-design-state";

const versionOptions = (view: DesignJobView) =>
  view.versions.map((v) => ({ value: v.id, label: `เวอร์ชัน v${v.version_no} — ${v.file_name}` }));

/** อัปโหลดไฟล์ลายเวอร์ชันใหม่ (mock — ไม่มีการอัปไฟล์จริง) */
export function UploadVersionDialog({
  view,
  open,
  onOpenChange,
  onSubmit,
}: {
  view: DesignJobView;
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onSubmit: (fileName: string, note: string | null) => void;
}) {
  const nextNo = (view.latest?.version_no ?? 0) + 1;
  const [fileName, setFileName] = useState(
    `mattii-${view.job.job_no.toLowerCase()}-v${nextNo}.png`,
  );
  const [note, setNote] = useState("");
  const invalid = fileName.trim().length < 5;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent size="lg">
        <DialogHeader>
          <DialogTitle>อัปโหลดไฟล์ลายเวอร์ชัน v{nextNo}</DialogTitle>
        </DialogHeader>
        <DialogBody>
          <div className="space-y-4">
            <Text className="rounded-lg bg-gray-50 p-3 text-xs text-gray-500">
              ตัวอย่างระบบ — ยังไม่มีการอัปโหลดไฟล์จริง
              ระบบจะบันทึกเป็นเวอร์ชันใหม่พร้อมชื่อไฟล์ที่ระบุ
            </Text>
            <div>
              <Label htmlFor="dsn-file">ชื่อไฟล์ *</Label>
              <Input
                id="dsn-file"
                className="mt-1"
                value={fileName}
                onChange={(e) => setFileName(e.target.value)}
                placeholder="เช่น mattii-cat-orange-v2.png"
              />
              {invalid && (
                <Text className="mt-1 text-xs text-red-600">ระบุชื่อไฟล์อย่างน้อย 5 ตัวอักษร</Text>
              )}
            </div>
            <div>
              <Label htmlFor="dsn-note">โน้ตถึงทีม (ไม่บังคับ)</Label>
              <Textarea
                id="dsn-note"
                className="mt-1"
                rows={3}
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder="เช่น แก้สีพื้นให้อ่อนลงตามที่ลูกค้าขอ"
              />
            </div>
          </div>
        </DialogBody>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            ยกเลิก
          </Button>
          <Button
            disabled={invalid}
            onClick={() => {
              onSubmit(fileName.trim(), note.trim() || null);
              onOpenChange(false);
              notify.success(`บันทึกไฟล์ลายเวอร์ชัน v${nextNo} แล้ว`);
            }}
          >
            <UploadCloud className="mr-1.5 h-4 w-4" /> บันทึกเวอร์ชันใหม่
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/** ส่งไฟล์ลายให้ลูกค้ายืนยัน — โชว์ข้อความที่จะส่งให้ตรวจก่อน */
export function SendCfDialog({
  view,
  open,
  onOpenChange,
  onSubmit,
}: {
  view: DesignJobView;
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onSubmit: (versionId: string) => void;
}) {
  const [versionId, setVersionId] = useState(view.latest?.id ?? "");
  const version = view.versions.find((v) => v.id === versionId);
  const customerName = view.customer?.display_name ?? "ลูกค้า";
  const message = `สวัสดีค่ะคุณ${customerName} 🙏\nร้าน Mattii ส่งลายพรมของออเดอร์ ${view.order?.order_no ?? ""} มาให้ดูค่ะ\nไฟล์: ${version?.file_name ?? "-"} (เวอร์ชัน v${version?.version_no ?? "-"})\nถ้าโอเคแล้วแจ้งกลับได้เลยนะคะ เดี๋ยวทางร้านเข้าคิวพิมพ์ให้ทันทีค่ะ`;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent size="xl">
        <DialogHeader>
          <DialogTitle>ส่งลายให้ลูกค้ายืนยัน</DialogTitle>
        </DialogHeader>
        <DialogBody>
          <div className="space-y-4">
            <div>
              <Label>เวอร์ชันที่จะส่ง</Label>
              <CustomSelect
                value={versionId}
                onChange={setVersionId}
                options={versionOptions(view)}
                className="mt-1"
              />
            </div>
            <div>
              <div className="text-xs font-medium text-gray-500">ข้อความที่จะส่งให้ลูกค้า</div>
              <div className="mt-1 whitespace-pre-line rounded-xl border border-gray-200 bg-gray-50 p-3 text-sm text-gray-900">
                {message}
              </div>
            </div>
            <Text className="text-xs text-gray-500">
              ลูกค้าไม่ต้องกดปุ่มใด ๆ — ตอบกลับทางแชทตามปกติ แล้วฝ่ายขายมาบันทึกผลในระบบให้
            </Text>
          </div>
        </DialogBody>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            ยกเลิก
          </Button>
          <Button
            disabled={!versionId}
            onClick={() => {
              onSubmit(versionId);
              onOpenChange(false);
              notify.success(`ส่งลาย v${version?.version_no ?? ""} ให้ลูกค้ายืนยันแล้ว`);
            }}
          >
            <Send className="mr-1.5 h-4 w-4" /> ส่งให้ลูกค้ายืนยัน
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/** Sale บันทึกผลที่ลูกค้าตอบกลับมา — ยืนยันแล้ว / ขอแก้ */
export function RecordCfDialog({
  view,
  open,
  onOpenChange,
  onApprove,
  onReject,
}: {
  view: DesignJobView;
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onApprove: (versionId: string, feedback: string) => void;
  onReject: (versionId: string, feedback: string) => void;
}) {
  const [result, setResult] = useState<"approved" | "rejected">("approved");
  const [versionId, setVersionId] = useState(view.latest?.id ?? "");
  const [feedback, setFeedback] = useState("");
  const version = view.versions.find((v) => v.id === versionId);
  const needFeedback = result === "rejected" && feedback.trim().length < 5;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent size="xl">
        <DialogHeader>
          <DialogTitle>บันทึกผลการยืนยันลายจากลูกค้า</DialogTitle>
        </DialogHeader>
        <DialogBody>
          <div className="space-y-4">
            <SegmentedControl
              value={result}
              onChange={setResult}
              fullWidth
              ariaLabel="ผลการยืนยันลาย"
              options={[
                {
                  value: "approved",
                  label: "ลูกค้ายืนยันแล้ว",
                  icon: <ThumbsUp className="h-4 w-4" />,
                  activeClassName: "bg-green-600",
                },
                {
                  value: "rejected",
                  label: "ลูกค้าขอแก้",
                  icon: <Undo2 className="h-4 w-4" />,
                  activeClassName: "bg-amber-600",
                },
              ]}
            />

            <div>
              <Label>
                {result === "approved"
                  ? "เวอร์ชันที่ลูกค้ายืนยัน *"
                  : "เวอร์ชันที่ลูกค้าให้ความเห็น *"}
              </Label>
              <CustomSelect
                value={versionId}
                onChange={setVersionId}
                options={versionOptions(view)}
                className="mt-1"
              />
            </div>

            <div>
              <Label htmlFor="dsn-feedback">
                {result === "approved" ? "ข้อความลูกค้า (ไม่บังคับ)" : "ลูกค้าขอแก้อะไร *"}
              </Label>
              <Textarea
                id="dsn-feedback"
                className="mt-1"
                rows={3}
                value={feedback}
                onChange={(e) => setFeedback(e.target.value)}
                placeholder={
                  result === "approved"
                    ? "เช่น สวยมากค่ะ ใช้อันนี้เลย"
                    : "เช่น อยากให้พื้นครีมอ่อนกว่านี้อีกหน่อยค่ะ"
                }
              />
              {needFeedback && (
                <Text className="mt-1 text-xs text-red-600">
                  ระบุสิ่งที่ลูกค้าขอแก้อย่างน้อย 5 ตัวอักษร เพื่อให้ทีมแบบทำงานต่อได้
                </Text>
              )}
            </div>

            {result === "rejected" && feedback.trim().length >= 5 && (
              <CfFeedbackSummary designJobId={view.job.id} feedback={feedback} />
            )}

            {result === "approved" && (
              <Text className="rounded-lg bg-green-50 p-3 text-xs text-green-700">
                บันทึกแล้วออเดอร์จะขยับเป็น “ลูกค้ายืนยันแล้ว รอพิมพ์”
                และทีมผลิตจะเห็นงานนี้ในคิวพิมพ์ พร้อมเลขเวอร์ชัน v{version?.version_no ?? "-"}
              </Text>
            )}
          </div>
        </DialogBody>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            ยกเลิก
          </Button>
          <Button
            disabled={!versionId || needFeedback}
            onClick={() => {
              if (result === "approved") {
                onApprove(versionId, feedback.trim());
                notify.success(`บันทึกแล้ว: ลูกค้ายืนยันลาย v${version?.version_no ?? ""}`);
              } else {
                onReject(versionId, feedback.trim());
                notify.success("บันทึกแล้ว: ลูกค้าขอแก้ลาย — ส่งงานกลับให้ทีมแบบ");
              }
              onOpenChange(false);
            }}
          >
            บันทึกผล
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
