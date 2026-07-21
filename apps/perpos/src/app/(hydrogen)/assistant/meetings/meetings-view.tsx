"use client";

import { useCallback, useEffect, useState } from "react";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import { StatCard } from "@/components/ui/stat-card";
import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
  TableEmpty,
} from "@/components/ui/table";
import { StatusBadge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogBody,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  CalendarClock,
  ClipboardPaste,
  FileAudio,
  FileText,
  FolderOpen,
  Loader2,
  SendHorizontal,
  Video,
  X,
} from "lucide-react";
import { toast } from "@/lib/toast";
import type { MeetingJob, MeetingCalEvent } from "@/lib/assistant/meetings";

type BadgeTone = "neutral" | "info" | "success" | "warning" | "danger";
type Job = MeetingJob;
type CalEvent = MeetingCalEvent;

function platformLabel(url: string | null): string {
  if (!url) return "ห้องประชุม";
  if (url.includes("meet.google")) return "Google Meet";
  if (url.includes("zoom")) return "Zoom";
  if (url.includes("teams.microsoft")) return "Microsoft Teams";
  return "ห้องประชุม";
}

function jobStatus(j: Job): { label: string; tone: BadgeTone } {
  if (j.status === "completed") return { label: "สรุปเสร็จ", tone: "success" };
  const s = j.bot_state ?? "";
  if (j.status === "failed" || ["fatal", "stuck", "create_failed", "failed_permanent"].includes(s))
    return { label: "ล้มเหลว", tone: "danger" };
  if (s === "cancelled") return { label: "ยกเลิก", tone: "neutral" };
  if (s === "awaiting_confirm") return { label: "รอยืนยัน", tone: "warning" };
  if (["creating", "scheduled"].includes(s)) return { label: "นัดไว้", tone: "info" };
  if (["joining", "in_waiting_room"].includes(s)) return { label: "กำลังเข้าห้อง", tone: "info" };
  if (s === "recording") return { label: "กำลังบันทึก", tone: "info" };
  if (["recording_ready", "leaving"].includes(s)) return { label: "กำลังสรุป", tone: "info" };
  return { label: "กำลังทำ", tone: "info" };
}

const fmtDateTime = (iso: string) =>
  new Intl.DateTimeFormat("th-TH", {
    timeZone: "Asia/Bangkok",
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(iso));
function relTime(d: Date): string {
  const s = Math.max(0, Math.floor((Date.now() - d.getTime()) / 1000));
  if (s < 10) return "เมื่อสักครู่";
  if (s < 60) return `${s} วินาทีที่แล้ว`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m} นาทีที่แล้ว`;
  return `${Math.floor(m / 60)} ชม.ที่แล้ว`;
}
const jobTitle = (j: Job) =>
  j.transcript_json?.meeting_title || j.file_name || `${platformLabel(j.meeting_url)} recording`;
// เวลาบอท = ความยาวที่บันทึกจริง (duration_seconds) เท่านั้น · hold_seconds = ค่าจอง/เพดาน ไม่ใช่เวลาจริง
const jobMinutes = (j: Job) => {
  const s = j.duration_seconds ?? 0;
  return s > 0 ? `${Math.round(s / 60)} นาที` : "—";
};
// บอทที่ยัง active → ยกเลิกได้ (นัดไว้/กำลังเข้าห้อง/กำลังบันทึก) · จบ/ล้มเหลว/สรุปแล้ว = ยกเลิกไม่ได้
const CANCELLABLE_BOT_STATES = [
  "awaiting_confirm",
  "creating",
  "scheduled",
  "joining",
  "in_waiting_room",
  "recording",
];
const canCancelBot = (j: Job) =>
  j.source === "recall" &&
  j.status !== "completed" &&
  j.status !== "failed" &&
  CANCELLABLE_BOT_STATES.includes(j.bot_state ?? "");

export default function MeetingsView({
  initialBotSeconds,
  initialJobs,
  initialUpcoming,
}: {
  initialBotSeconds: number;
  initialJobs: Job[];
  initialUpcoming: CalEvent[];
}) {
  const supabase = createSupabaseBrowserClient();
  const [token, setToken] = useState("");
  const [bot, setBot] = useState<{ limit: number; used: number }>({
    limit: initialBotSeconds,
    used: 0,
  });
  const [jobs, setJobs] = useState<Job[]>(initialJobs);
  const [upcoming, setUpcoming] = useState<CalEvent[]>(initialUpcoming);
  const [selected, setSelected] = useState<Job | null>(null);
  const [downloading, setDownloading] = useState("");
  const [meetingUrl, setMeetingUrl] = useState("");
  const [sending, setSending] = useState(false);
  const [cancelling, setCancelling] = useState(""); // id ที่กำลังยกเลิก (job หรือ event)
  const [confirmCancel, setConfirmCancel] = useState(""); // eventId ที่รอยืนยันยกเลิกนัด (two-step)
  const [lastSync, setLastSync] = useState<Date | null>(null);
  const [, setTick] = useState(0); // เดินนาฬิกาให้ป้าย "ซิงค์ล่าสุด" อัปเดตเอง

  // refresh สด (silent) — initial มาจาก SSR แล้ว
  const load = useCallback(async () => {
    const { data: sess } = await supabase.auth.getSession();
    const accessToken = sess.session?.access_token ?? "";
    setToken(accessToken);

    const [quotaRes, jobsRes, upRes] = await Promise.all([
      accessToken
        ? fetch("/api/assistant/quota", { headers: { Authorization: `Bearer ${accessToken}` } })
        : Promise.resolve(null),
      supabase
        .from("assistant_jobs")
        .select(
          "id, created_at, meeting_url, file_name, bot_state, status, hold_seconds, duration_seconds, mom_drive_url, source, transcript_json",
        )
        .eq("source", "recall")
        .order("created_at", { ascending: false })
        .limit(30),
      supabase
        .from("recall_calendar_events")
        .select("id, title, meeting_url, starts_at, confirm_state")
        .eq("is_deleted", false)
        .in("confirm_state", ["pending", "reminded"])
        .gte("starts_at", new Date().toISOString())
        .order("starts_at", { ascending: true })
        .limit(10),
    ]);
    if (quotaRes?.ok) {
      const d = (await quotaRes.json()).data;
      if (d?.remaining) setBot({ limit: d.remaining.bot_seconds, used: 0 });
    }
    if (jobsRes.data) setJobs(jobsRes.data as Job[]);
    if (upRes.data) setUpcoming(upRes.data as CalEvent[]);
    setLastSync(new Date());
  }, [supabase]);

  // ดึง token ทันที (สำหรับ mutation) + poll สถานะสดทุก 60 วิ (ข้ามรอบเมื่อแท็บถูกซ่อน —
  // ลด Fluid Active CPU: ไม่ยิง API เปล่าเมื่อไม่มีคนดู) + ดึงใหม่เมื่อกลับมาที่แท็บ (กันเห็นข้อมูลค้าง)
  useEffect(() => {
    load();
    const t = setInterval(() => {
      if (document.visibilityState === "hidden") return;
      load();
    }, 60_000);
    const onFocus = () => load();
    window.addEventListener("focus", onFocus);
    return () => {
      clearInterval(t);
      window.removeEventListener("focus", onFocus);
    };
  }, [load]);

  // อัปเดตป้าย "ซิงค์ล่าสุด" ทุก 10 วิ
  useEffect(() => {
    const t = setInterval(() => setTick((n) => n + 1), 10_000);
    return () => clearInterval(t);
  }, []);

  const downloadMom = async (jobId: string) => {
    if (!token) return;
    setDownloading("mom");
    try {
      const res = await fetch("/api/assistant/stt/mom-pdf", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ jobId }),
      });
      if (!res.ok) {
        toast.error("ดาวน์โหลด MoM ไม่สำเร็จ");
        return;
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `MoM-${jobId}.pdf`;
      a.click();
      URL.revokeObjectURL(url);
    } finally {
      setDownloading("");
    }
  };

  const downloadAudio = async (jobId: string) => {
    if (!token) return;
    setDownloading("audio");
    try {
      const res = await fetch(`/api/assistant/stt/audio-url?jobId=${jobId}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const d = await res.json().catch(() => ({}));
      if (!res.ok || !d.data?.url) {
        toast.error("ไฟล์เสียงไม่พร้อม (อาจหมดอายุแล้ว)");
        return;
      }
      window.open(d.data.url as string, "_blank");
    } finally {
      setDownloading("");
    }
  };

  const pasteFromClipboard = async () => {
    try {
      const text = await navigator.clipboard.readText();
      if (!text) {
        toast("คลิปบอร์ดว่าง — วางลิงก์เองในช่องได้เลย");
        return;
      }
      setMeetingUrl(text.trim());
    } catch {
      toast("อ่านคลิปบอร์ดไม่ได้ — วางลิงก์เองในช่องด้านล่างได้เลย");
    }
  };

  const sendBot = async () => {
    if (!token || !meetingUrl.trim()) return;
    setSending(true);
    try {
      const res = await fetch("/api/assistant/recall/trigger", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ meetingUrl: meetingUrl.trim() }),
      });
      const d = await res.json().catch(() => ({}));
      if (d.ok && d.scheduled) {
        // มีวัน-เวลานัด → ลงปฏิทิน + scheduler เตือน/ส่งบอทตามเวลา
        toast.success(
          d.exists
            ? `📅 มีนัดนี้ในปฏิทินอยู่แล้ว (${d.joinAtText ?? ""})`
            : `📅 ลงนัดในปฏิทินแล้ว — บอทจะเข้าห้องตามเวลานัด (${d.joinAtText ?? ""})`,
        );
        setMeetingUrl("");
        load();
      } else if (d.ok) {
        toast.success("ส่งบอทเข้าห้องประชุมแล้ว");
        setMeetingUrl("");
        load();
      } else if (d.reason === "invalid_url")
        toast.error("ไม่พบลิงก์ประชุม (รองรับ Google Meet / Zoom / Teams)");
      else if (d.reason === "calendar_not_connected")
        toast.error("ต้องเชื่อม Google Calendar ก่อนจึงจะลงนัดล่วงหน้าได้ — ไปที่แท็บ “เชื่อมต่อ Google”");
      else if (d.reason === "low_quota")
        toast.error(`โควต้าบอทไม่พอ (เหลือ ${d.remainMin ?? 0} นาที) — เติมที่หน้าการชำระเงิน`);
      else if (d.reason === "already_active") toast("บอทเข้าห้องประชุมนี้อยู่แล้ว");
      else if (d.reason === "busy") toast("ระบบกำลังหนาแน่น ลองใหม่ใน 1–2 นาที");
      else toast.error("ส่งบอทไม่สำเร็จ ลองใหม่อีกครั้ง");
    } finally {
      setSending(false);
    }
  };

  // ยกเลิกบอทที่กำลังทำงาน/นัดไว้ (จาก dialog รายละเอียด)
  const cancelBot = async (jobId: string) => {
    if (!token) return;
    setCancelling(jobId);
    try {
      const res = await fetch("/api/assistant/recall/cancel", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ jobId }),
      });
      const d = await res.json().catch(() => ({}));
      if (d.ok) {
        toast.success(
          d.outcome === "recording_left"
            ? "นำบอทออกจากห้องแล้ว — จะสรุปเท่าที่บันทึกได้"
            : d.outcome === "settling"
              ? "บอทออกจากห้องแล้ว กำลังสรุปรายงานให้"
              : d.outcome === "already_done"
                ? "งานนี้จบหรือถูกยกเลิกไปแล้ว"
                : "ยกเลิกบอทแล้ว คืนโควต้าให้เรียบร้อย",
        );
        setSelected(null);
        load();
      } else toast.error("ยกเลิกบอทไม่สำเร็จ ลองใหม่อีกครั้ง");
    } finally {
      setCancelling("");
    }
  };

  // ยกเลิกนัดประชุม (recall_calendar_events) — หยุดเตือน/ส่งบอทตามนัด
  const cancelMeeting = async (eventId: string) => {
    if (!token) return;
    setCancelling(eventId);
    try {
      const res = await fetch("/api/assistant/recall/calendar-cancel", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ eventId }),
      });
      const d = await res.json().catch(() => ({}));
      if (d.ok) {
        toast.success("ยกเลิกนัดประชุมแล้ว");
        setConfirmCancel("");
        load();
      } else toast.error("ยกเลิกนัดไม่สำเร็จ ลองใหม่อีกครั้ง");
    } finally {
      setCancelling("");
    }
  };

  const completedCount = jobs.filter((j) => j.status === "completed").length;
  const botRemainMin = Math.max(0, Math.floor((bot.limit - bot.used) / 60));
  const botLimitMin = Math.floor(bot.limit / 60);

  return (
    <div className="space-y-6">
      {/* ส่งบอทเข้าประชุม */}
      <div className="rounded-xl border border-gray-200 bg-white p-5">
        <h2 className="mb-1 flex items-center gap-2 text-base font-medium text-gray-900">
          <SendHorizontal className="h-4 w-4" /> ส่งบอทเข้าประชุม
        </h2>
        <p className="mb-3 text-sm text-gray-500">
          วางลิงก์ห้องประชุม (Google Meet / Zoom / Teams) แล้วบอทจะเข้าห้องบันทึกให้ทันที ·
          ถ้าใส่วัน-เวลานัดมาด้วย ระบบจะลงนัดใน Google Calendar แล้วส่งบอทให้ตามเวลา
        </p>
        <div className="flex flex-col gap-2 sm:flex-row">
          <Input
            value={meetingUrl}
            onChange={(e) => setMeetingUrl(e.target.value)}
            placeholder="วางลิงก์ประชุม (ใส่วัน-เวลาด้วยเพื่อลงนัดล่วงหน้า)…"
            className="flex-1"
            onKeyDown={(e) => {
              if (e.key === "Enter") sendBot();
            }}
          />
          <div className="flex gap-2">
            <Button variant="outline" onClick={pasteFromClipboard} type="button">
              <ClipboardPaste className="mr-1.5 h-4 w-4" /> คลิปบอร์ด
            </Button>
            <Button onClick={sendBot} disabled={sending || !meetingUrl.trim()}>
              {sending ? (
                <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
              ) : (
                <SendHorizontal className="mr-1.5 h-4 w-4" />
              )}{" "}
              ส่งบอท
            </Button>
          </div>
        </div>
        <p className="mt-2 text-xs text-gray-400">
          🔒 บอทจะปรากฏในห้องชื่อ “PERPOS Assistant (AI Note-taker)” ·
          ผู้ส่งรับผิดชอบการขอความยินยอมจากผู้เข้าร่วมตาม PDPA · รายงาน (MoM) ส่งกลับทาง LINE
          และดูได้ที่นี่
        </p>
      </div>

      {/* Summary */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <StatCard
          icon={<Video className="h-4 w-4" />}
          label="โควต้าบอทคงเหลือ"
          value={`${botRemainMin} / ${botLimitMin} นาที`}
          tone="info"
          valueColored
        />
        <StatCard
          icon={<FileText className="h-4 w-4" />}
          label="ประชุมที่บันทึกสำเร็จ"
          value={String(completedCount)}
          sub={`จาก ${jobs.length} รายการล่าสุด`}
          tone="primary"
        />
      </div>

      {/* Upcoming */}
      <div>
        <div className="mb-2 flex items-center justify-between gap-2">
          <h2 className="flex items-center gap-2 text-sm font-semibold text-gray-700">
            <CalendarClock className="h-4 w-4" /> ประชุมที่นัดไว้
          </h2>
          {lastSync && (
            <span className="text-xs text-gray-400">ซิงค์ล่าสุด {relTime(lastSync)}</span>
          )}
        </div>
        {upcoming.length === 0 ? (
          <div className="rounded-xl border border-dashed border-gray-200 px-4 py-6 text-center text-sm text-gray-400">
            ยังไม่มีนัดประชุม — วางลิงก์ประชุมที่มีวัน-เวลา (ในหน้านี้หรือ LINE) หรือเชื่อม Google
            Calendar เพื่อให้ระบบดึงนัดมาเตือน/ส่งบอทอัตโนมัติ
          </div>
        ) : (
          <div className="space-y-2">
            {upcoming.map((e) => (
              <div
                key={e.id}
                className="flex items-center justify-between gap-3 rounded-xl border border-gray-200 bg-white px-4 py-3"
              >
                <div className="min-w-0">
                  <div className="truncate text-sm font-medium text-gray-900">
                    {e.title || `ประชุม (${platformLabel(e.meeting_url)})`}
                  </div>
                  <div className="text-xs text-gray-500">
                    {fmtDateTime(e.starts_at)} · {platformLabel(e.meeting_url)}
                  </div>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  <StatusBadge tone={e.confirm_state === "reminded" ? "info" : "neutral"}>
                    {e.confirm_state === "reminded" ? "เตือนแล้ว" : "รอเตือน"}
                  </StatusBadge>
                  {/* ยกเลิกนัด — two-step: คลิกแรกยืนยัน, คลิกสองลบจริง */}
                  {confirmCancel === e.id ? (
                    <Button
                      variant="destructive"
                      size="sm"
                      disabled={cancelling === e.id}
                      onClick={() => cancelMeeting(e.id)}
                    >
                      {cancelling === e.id ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        "ยืนยันยกเลิก"
                      )}
                    </Button>
                  ) : (
                    <Button
                      variant="ghost"
                      size="sm"
                      className="text-gray-400 hover:text-red-600"
                      onClick={() => setConfirmCancel(e.id)}
                    >
                      <X className="h-4 w-4" />
                    </Button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* History */}
      <div>
        <h2 className="mb-2 flex items-center gap-2 text-sm font-semibold text-gray-700">
          <Video className="h-4 w-4" /> ประวัติบอทประชุม
        </h2>
        <Table stickyHeader maxHeight="60vh">
          <TableHeader sticky>
            <TableRow>
              <TableHead>วันที่</TableHead>
              <TableHead>ประชุม</TableHead>
              <TableHead align="center">สถานะ</TableHead>
              <TableHead align="right">เวลาบอท</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {jobs.length === 0 ? (
              <TableEmpty colSpan={4}>
                ยังไม่มีประวัติบอทประชุม — วางลิงก์ประชุมใน LINE เพื่อเริ่ม
              </TableEmpty>
            ) : (
              jobs.map((j) => {
                const st = jobStatus(j);
                return (
                  <TableRow key={j.id} clickable onClick={() => setSelected(j)}>
                    <TableCell>{fmtDateTime(j.created_at)}</TableCell>
                    <TableCell>
                      <div className="font-medium text-gray-900">{jobTitle(j)}</div>
                      <div className="text-xs text-gray-400">{platformLabel(j.meeting_url)}</div>
                    </TableCell>
                    <TableCell align="center">
                      <StatusBadge tone={st.tone}>{st.label}</StatusBadge>
                    </TableCell>
                    <TableCell align="right" tabular>
                      {jobMinutes(j)}
                    </TableCell>
                  </TableRow>
                );
              })
            )}
          </TableBody>
        </Table>
      </div>

      {/* Detail dialog */}
      <Dialog open={!!selected} onOpenChange={(o) => !o && setSelected(null)}>
        <DialogContent size="md">
          <DialogHeader>
            <DialogTitle>{selected ? jobTitle(selected) : ""}</DialogTitle>
          </DialogHeader>
          {selected && (
            <DialogBody>
              <dl className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <dt className="text-gray-500">แพลตฟอร์ม</dt>
                  <dd className="text-gray-900">{platformLabel(selected.meeting_url)}</dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-gray-500">วันที่</dt>
                  <dd className="text-gray-900">{fmtDateTime(selected.created_at)}</dd>
                </div>
                <div className="flex items-center justify-between">
                  <dt className="text-gray-500">สถานะ</dt>
                  <dd>
                    <StatusBadge tone={jobStatus(selected).tone}>
                      {jobStatus(selected).label}
                    </StatusBadge>
                  </dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-gray-500">เวลาบอท</dt>
                  <dd className="tabular-nums text-gray-900">{jobMinutes(selected)}</dd>
                </div>
              </dl>
            </DialogBody>
          )}
          <DialogFooter>
            {selected && canCancelBot(selected) && (
              <Button
                variant="destructive"
                className="mr-auto"
                disabled={cancelling === selected.id}
                onClick={() => cancelBot(selected.id)}
              >
                {cancelling === selected.id ? (
                  <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
                ) : (
                  <X className="mr-1.5 h-4 w-4" />
                )}{" "}
                ยกเลิกบอท
              </Button>
            )}
            {selected?.mom_drive_url && (
              <Button
                variant="outline"
                onClick={() => window.open(selected.mom_drive_url as string, "_blank")}
              >
                <FolderOpen className="mr-1.5 h-4 w-4" /> เปิดใน Drive
              </Button>
            )}
            {selected?.source === "recall" && (
              <Button
                variant="outline"
                disabled={downloading === "audio"}
                onClick={() => downloadAudio(selected.id)}
              >
                {downloading === "audio" ? (
                  <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
                ) : (
                  <FileAudio className="mr-1.5 h-4 w-4" />
                )}{" "}
                ไฟล์เสียง
              </Button>
            )}
            {selected?.status === "completed" && (
              <Button disabled={downloading === "mom"} onClick={() => downloadMom(selected.id)}>
                {downloading === "mom" ? (
                  <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
                ) : (
                  <FileText className="mr-1.5 h-4 w-4" />
                )}{" "}
                ดาวน์โหลด MoM
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
