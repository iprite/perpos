"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { CustomSelect } from "@/components/ui/custom-select";
import { StatusBadge, type BadgeTone } from "@/components/ui/badge";
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
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogBody,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { FileAudio, AlertTriangle } from "lucide-react";
import { toast } from "@/lib/toast";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import { AdminPage } from "../_components/admin-page";

type Job = {
  id: string;
  profile_id: string | null;
  display_name: string;
  file_name: string;
  file_size: number | null;
  duration_seconds: number | null;
  model: string;
  status: "pending" | "processing" | "completed" | "failed";
  source: "web" | "line";
  error_message: string | null;
  created_at: string;
  updated_at: string;
};

type Counts = Record<"pending" | "processing" | "completed" | "failed", number>;

async function authToken(): Promise<string> {
  const supabase = createSupabaseBrowserClient();
  const { data } = await supabase.auth.getSession();
  return data.session?.access_token ?? "";
}

const STATUS_TONE: Record<Job["status"], BadgeTone> = {
  pending: "warning",
  processing: "info",
  completed: "success",
  failed: "danger",
};
const STATUS_LABEL: Record<Job["status"], string> = {
  pending: "รอคิว",
  processing: "กำลังประมวลผล",
  completed: "สำเร็จ",
  failed: "ล้มเหลว",
};

const fmtDur = (s: number | null) =>
  s == null ? "—" : `${Math.floor(s / 60)}:${String(Math.round(s % 60)).padStart(2, "0")}`;
const fmtSize = (b: number | null) =>
  b == null ? "—" : b >= 1e6 ? `${(b / 1e6).toFixed(1)} MB` : `${Math.round(b / 1e3)} KB`;
const fmtTime = (iso: string) =>
  new Date(iso).toLocaleString("th-TH", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
const isStuck = (j: Job) =>
  (j.status === "pending" || j.status === "processing") &&
  Date.now() - new Date(j.created_at).getTime() > 10 * 60 * 1000;

export default function SttJobsPage() {
  const [items, setItems] = useState<Job[]>([]);
  const [counts, setCounts] = useState<Counts>({
    pending: 0,
    processing: 0,
    completed: 0,
    failed: 0,
  });
  const [loading, setLoading] = useState(true);
  const [status, setStatus] = useState("");
  const [detailJob, setDetailJob] = useState<Job | null>(null);
  const [acting, setActing] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const qs = status ? `?status=${status}` : "";
      const res = await fetch(`/api/admin/stt-jobs${qs}`, {
        headers: { Authorization: `Bearer ${await authToken()}` },
      });
      if (!res.ok) throw new Error("โหลดไม่สำเร็จ");
      const d = (await res.json()).data;
      setItems((d?.items ?? []) as Job[]);
      setCounts((d?.counts ?? { pending: 0, processing: 0, completed: 0, failed: 0 }) as Counts);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "โหลดไม่สำเร็จ");
    } finally {
      setLoading(false);
    }
  }, [status]);

  useEffect(() => {
    load();
  }, [load]);

  const failJob = async () => {
    if (!detailJob) return;
    setActing(true);
    try {
      const res = await fetch("/api/admin/stt-jobs", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${await authToken()}`,
        },
        body: JSON.stringify({ jobId: detailJob.id, action: "fail" }),
      });
      const d = await res.json();
      if (!res.ok) throw new Error(d?.error?.message ?? "ดำเนินการไม่สำเร็จ");
      const refMin = Math.floor((d.data?.refunded_seconds ?? 0) / 60);
      toast.success(refMin > 0 ? `ปิดงานแล้ว — คืนโควต้า ${refMin} นาที` : "ปิดงานแล้ว");
      setDetailJob(null);
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "ดำเนินการไม่สำเร็จ");
    } finally {
      setActing(false);
    }
  };

  return (
    <AdminPage
      width="wide"
      title="งานแกะเสียง (Job Monitor)"
      icon={<FileAudio className="h-6 w-6" />}
      actions={
        <>
          <Link href="/admin/stt-stats">
            <Button variant="outline" size="sm">
              📊 สถิติ
            </Button>
          </Link>
        </>
      }
    >
      {/* summary counts */}
      <div className="mb-5 grid grid-cols-2 gap-3 sm:grid-cols-4">
        {(["pending", "processing", "completed", "failed"] as const).map((k) => (
          <button
            key={k}
            onClick={() => setStatus(status === k ? "" : k)}
            className={`rounded-xl border p-4 text-left transition-colors ${status === k ? "border-primary bg-gray-100" : "border-gray-100 bg-white hover:bg-gray-50"}`}
          >
            <div className="text-2xl font-bold tabular-nums text-gray-900">{counts[k]}</div>
            <div className="text-xs text-gray-500">{STATUS_LABEL[k]}</div>
          </button>
        ))}
      </div>

      <div className="mb-3 flex items-center gap-2">
        <CustomSelect
          value={status}
          onChange={setStatus}
          options={[
            { value: "", label: "ทุกสถานะ" },
            { value: "pending", label: "รอคิว" },
            { value: "processing", label: "กำลังประมวลผล" },
            { value: "completed", label: "สำเร็จ" },
            { value: "failed", label: "ล้มเหลว" },
          ]}
          className="w-44"
        />
      </div>

      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>ไฟล์ / ผู้ใช้</TableHead>
            <TableHead align="center">ที่มา</TableHead>
            <TableHead align="right">ความยาว</TableHead>
            <TableHead align="center">สถานะ</TableHead>
            <TableHead>สร้างเมื่อ</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {loading ? (
            <TableLoading colSpan={5} />
          ) : items.length === 0 ? (
            <TableEmpty colSpan={5}>ไม่มีงานในสถานะนี้</TableEmpty>
          ) : (
            items.map((j) => {
              const stuck = isStuck(j);
              return (
                <TableRow key={j.id} clickable onClick={() => setDetailJob(j)}>
                  <TableCell>
                    <div className="flex items-center gap-1.5 font-medium text-gray-900">
                      {stuck && <AlertTriangle className="h-3.5 w-3.5 shrink-0 text-amber-500" />}
                      <span>{j.file_name}</span>
                    </div>
                    <div className="text-xs text-gray-400">
                      {j.display_name} · {fmtSize(j.file_size)}
                    </div>
                  </TableCell>
                  <TableCell align="center">
                    <StatusBadge tone="neutral">
                      {j.source === "line" ? "LINE" : "เว็บ"}
                    </StatusBadge>
                  </TableCell>
                  <TableCell align="right" tabular className="text-gray-600">
                    {fmtDur(j.duration_seconds)}
                  </TableCell>
                  <TableCell align="center">
                    <StatusBadge tone={STATUS_TONE[j.status]}>{STATUS_LABEL[j.status]}</StatusBadge>
                    {stuck && (
                      <div className="mt-0.5 text-[10px] text-amber-600">ค้างเกิน 10 นาที</div>
                    )}
                  </TableCell>
                  <TableCell className="text-xs text-gray-500">{fmtTime(j.created_at)}</TableCell>
                </TableRow>
              );
            })
          )}
        </TableBody>
      </Table>

      <Dialog
        open={!!detailJob}
        onOpenChange={(o) => {
          if (!o) setDetailJob(null);
        }}
      >
        <DialogContent size="md">
          <DialogHeader>
            <DialogTitle>รายละเอียดงานแกะเสียง</DialogTitle>
          </DialogHeader>
          <DialogBody>
            {detailJob && (
              <div className="space-y-3 text-sm">
                <div className="grid grid-cols-2 gap-3">
                  {[
                    ["ไฟล์", detailJob.file_name],
                    ["ผู้ใช้", detailJob.display_name],
                    ["ที่มา", detailJob.source === "line" ? "LINE" : "เว็บ"],
                    ["ขนาด", fmtSize(detailJob.file_size)],
                    ["ความยาว", fmtDur(detailJob.duration_seconds)],
                    ["โมเดล", detailJob.model],
                    ["สร้างเมื่อ", fmtTime(detailJob.created_at)],
                  ].map(([k, v]) => (
                    <div key={k} className="space-y-0.5">
                      <p className="text-xs font-medium text-gray-500">{k}</p>
                      <p className="break-words text-sm text-gray-800">{v}</p>
                    </div>
                  ))}
                  <div className="space-y-0.5">
                    <p className="text-xs font-medium text-gray-500">สถานะ</p>
                    <StatusBadge tone={STATUS_TONE[detailJob.status]}>
                      {STATUS_LABEL[detailJob.status]}
                    </StatusBadge>
                  </div>
                </div>
                {detailJob.error_message && (
                  <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
                    {detailJob.error_message}
                  </div>
                )}
                {(detailJob.status === "pending" || detailJob.status === "processing") && (
                  <p className="text-xs text-amber-600">
                    ใช้กับงานที่ค้างเพราะ worker ไม่ตอบกลับ — ปิดงานเป็น &ldquo;ล้มเหลว&rdquo;
                    และคืนโควต้าที่หักไปแล้ว · ย้อนกลับไม่ได้
                  </p>
                )}
              </div>
            )}
          </DialogBody>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDetailJob(null)}>
              ปิด
            </Button>
            {detailJob && (detailJob.status === "pending" || detailJob.status === "processing") && (
              <Button variant="destructive" onClick={failJob} disabled={acting}>
                {acting ? "กำลังดำเนินการ…" : "ปิดงาน + คืนโควต้า"}
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </AdminPage>
  );
}
