'use client';

import { useEffect, useState, useCallback, useMemo, useRef } from 'react';
import Link from 'next/link';
import { createSupabaseBrowserClient } from '@/lib/supabase/client';
import { Button } from '@/components/ui/button';
import { StatusBadge, type BadgeTone } from '@/components/ui/badge';
import {
  Table, TableHeader, TableBody, TableRow, TableHead, TableCell,
} from '@/components/ui/table';
import { Dialog, DialogContent, DialogHeader, DialogBody, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import {
  Mic, UploadCloud, FileAudio, Loader2, X,
  Copy, Check, Download, AlertCircle, Play, Sparkles,
  Clock, Eye, CheckCircle2, Hourglass, Timer, Bot,
} from 'lucide-react';
import { toast } from 'react-hot-toast';

// ── Types ──────────────────────────────────────────────────────────────────────
type KeyTopic = { topic: string; details: string };
type ActionItem = { task: string; assignee: string; deadline: string };
type TranscriptJson = {
  meeting_title?: string;
  executive_summary?: string;
  language: string;
  speakers: string[];
  key_topics?: KeyTopic[];
  decisions?: string[];
  action_items?: ActionItem[];
  recommendations?: string[];
};

type Job = {
  id: string;
  org_id: string;
  file_name: string;
  mime_type: string;
  file_size: number | null;
  model: string;
  status: 'pending' | 'processing' | 'completed' | 'failed';
  transcript_json: TranscriptJson | null;
  transcript_text: string | null;
  error_message: string | null;
  created_at: string;
  updated_at: string;
};

// ── Constants / helpers ─────────────────────────────────────────────────────────
const BKK = 'Asia/Bangkok';
const ACCEPT = 'audio/*,video/mp4,.ogg,.mp3,.m4a,.wav,.mp4';
const MAX_FILE_BYTES = 200 * 1024 * 1024; // 200MB — ต้องตรงกับ file_size_limit ของ bucket
const RETENTION_HOURS = 48; // ผลลัพธ์ (PDF/transcript) ถูกลบหลัง 48 ชม. (PDPA)

// บาง browser ไม่ใส่ file.type (เช่น .ogg) — เดา mime จากนามสกุล
const EXT_MIME: Record<string, string> = {
  ogg: 'audio/ogg', mp3: 'audio/mpeg', m4a: 'audio/mp4', wav: 'audio/wav',
  aac: 'audio/aac', flac: 'audio/flac', mp4: 'video/mp4', webm: 'video/webm',
};
function resolveMime(f: File): string {
  if (f.type) return f.type;
  const ext = f.name.split('.').pop()?.toLowerCase() ?? '';
  return EXT_MIME[ext] ?? 'application/octet-stream';
}

const STT_MODEL = 'gemini-2.5-flash';

const STATUS_TONE: Record<string, BadgeTone> = {
  pending: 'warning',
  processing: 'info',
  completed: 'success',
  failed: 'danger',
};
const STATUS_TEXT: Record<string, string> = {
  pending: 'รอดำเนินการ',
  processing: 'กำลังถอดเสียง',
  completed: 'เสร็จสมบูรณ์',
  failed: 'ล้มเหลว',
};

function fmtDateTime(iso: string) {
  return new Intl.DateTimeFormat('th-TH', {
    timeZone: BKK, day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', hour12: false,
  }).format(new Date(iso));
}

function fmtSize(bytes: number | null) {
  if (!bytes) return '';
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

/** เวลาคงเหลือก่อนผลลัพธ์ถูกลบ (created_at + 48 ชม.) */
function expiryInfo(createdIso: string): { label: string; expired: boolean; soon: boolean } {
  const end = new Date(createdIso).getTime() + RETENTION_HOURS * 3600_000;
  const ms = end - Date.now();
  if (ms <= 0) return { label: 'หมดอายุแล้ว', expired: true, soon: false };
  const h = Math.floor(ms / 3600_000);
  const m = Math.floor((ms % 3600_000) / 60_000);
  return { label: h >= 1 ? `อีก ${h} ชม.` : `อีก ${m} นาที`, expired: false, soon: h < 6 };
}

function safeFileName(name: string): string {
  const dot = name.lastIndexOf('.');
  const ext = dot >= 0 ? name.slice(dot).toLowerCase().replace(/[^a-z0-9.]/g, '') : '';
  const base = (dot >= 0 ? name.slice(0, dot) : name)
    .replace(/[^a-zA-Z0-9._-]+/g, '_').slice(0, 80) || 'audio';
  return `${base}${ext}`;
}

export default function AssistantTranscribePage() {
  const supabase = useMemo(() => createSupabaseBrowserClient(), []);

  const [profileId, setProfileId] = useState('');
  const [token, setToken] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [jobs, setJobs] = useState<Job[]>([]);

  // upload state
  const [file, setFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // result dialog
  const [activeJob, setActiveJob] = useState<Job | null>(null);
  const [copied, setCopied] = useState(false);
  const [pdfBusy, setPdfBusy] = useState(false);
  const [pdfBusyId, setPdfBusyId] = useState<string | null>(null);

  const [quota, setQuota] = useState<{ limit: number; used: number; remaining: number } | null>(null);
  const [botQuota, setBotQuota] = useState<{ limit: number; used: number; remaining: number } | null>(null);
  const [fileDuration, setFileDuration] = useState<number | null>(null);

  // ── Data (per-profile — ไม่ผูก org) ─────────────────────────────────────────────
  const fetchJobs = useCallback(async (tk: string) => {
    const res = await fetch(`/api/assistant/jobs`, {
      headers: { Authorization: `Bearer ${tk}` },
    });
    if (!res.ok) return;
    const json = await res.json();
    setJobs((json.data ?? []) as Job[]);
  }, []);

  const fetchQuota = useCallback(async (tk: string) => {
    const res = await fetch(`/api/assistant/quota`, {
      headers: { Authorization: `Bearer ${tk}` },
    });
    if (!res.ok) return;
    const d = (await res.json()).data;
    if (d) setQuota({ limit: d.limit_seconds, used: d.used_seconds, remaining: d.remaining_seconds });
    if (d?.bot) setBotQuota({ limit: d.bot.limit_seconds, used: d.bot.used_seconds, remaining: d.bot.remaining_seconds });
  }, []);

  const init = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const { data: sess } = await supabase.auth.getSession();
      const accessToken = sess.session?.access_token;
      const uid = sess.session?.user?.id;
      if (!accessToken || !uid) throw new Error('กรุณาเข้าสู่ระบบใหม่');

      setProfileId(uid);
      setToken(accessToken);
      await Promise.all([fetchJobs(accessToken), fetchQuota(accessToken)]);
    } catch (e: any) {
      setError(e?.message ?? 'โหลดข้อมูลไม่สำเร็จ');
    } finally {
      setLoading(false);
    }
  }, [supabase, fetchJobs, fetchQuota]);

  useEffect(() => { init(); }, [init]);

  // poll ขณะมีงานค้าง (อัปเดต jobs + โควต้า)
  useEffect(() => {
    const active = jobs.some((j) => j.status === 'pending' || j.status === 'processing');
    if (!active || !token) return;
    const t = setInterval(() => { fetchJobs(token); fetchQuota(token); }, 5000);
    return () => clearInterval(t);
  }, [jobs, token, fetchJobs, fetchQuota]);

  // ── Upload + start ─────────────────────────────────────────────────────────────
  const pickFile = (f: File | null) => {
    if (!f) return;
    const okType = f.type.startsWith('audio/') || f.type.startsWith('video/')
      || /\.(ogg|mp3|m4a|wav|mp4|aac|flac|webm)$/i.test(f.name);
    if (!okType) { toast.error('รองรับเฉพาะไฟล์เสียงหรือวิดีโอ (mp3, ogg, m4a, wav, mp4)'); return; }
    if (f.size > MAX_FILE_BYTES) {
      toast.error(`ไฟล์ใหญ่เกินไป (${fmtSize(f.size)}) — รองรับสูงสุด 200 MB`);
      return;
    }
    setFile(f);
    setFileDuration(null);
    const url = URL.createObjectURL(f);
    const audio = document.createElement('audio');
    audio.preload = 'metadata';
    audio.onloadedmetadata = () => {
      URL.revokeObjectURL(url);
      const d = audio.duration;
      if (Number.isFinite(d) && d > 0) {
        const sec = Math.ceil(d);
        setFileDuration(sec);
        if (quota && sec > quota.remaining) {
          toast.error(`ไฟล์นี้ยาว ~${Math.ceil(sec / 60)} นาที เกินโควต้าที่เหลือ ${Math.floor(quota.remaining / 60)} นาที`);
        }
      }
    };
    audio.onerror = () => URL.revokeObjectURL(url);
    audio.src = url;
  };

  const handleStart = async () => {
    if (!file || !profileId || !token) return;
    setUploading(true);
    try {
      const mimeType = resolveMime(file);
      const path = `${profileId}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}-${safeFileName(file.name)}`;
      const { error: upErr } = await supabase.storage
        .from('assistant_audio')
        .upload(path, file, { contentType: mimeType, upsert: false });
      if (upErr) throw new Error(`อัปโหลดล้มเหลว: ${upErr.message}`);

      const jobRes = await fetch('/api/assistant/jobs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          audioUrl: path, fileName: file.name,
          mimeType, model: STT_MODEL, fileSize: file.size,
        }),
      });
      if (!jobRes.ok) {
        const e = await jobRes.json().catch(() => null);
        throw new Error(e?.error?.message ?? 'สร้างงานล้มเหลว');
      }
      const created = await jobRes.json();
      const jobId = created?.data?.id;

      if (jobId) {
        const pr = await fetch('/api/assistant/jobs/process', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
          body: JSON.stringify({ jobId }),
        });
        if (pr.ok) {
          toast.success('อัปโหลดและเริ่มถอดเสียงแล้ว');
        } else {
          const e = await pr.json().catch(() => null);
          toast.error(e?.error?.message ?? 'อัปโหลดแล้วแต่เริ่มถอดเสียงไม่สำเร็จ — กดปุ่ม "ลองใหม่" ที่รายการได้');
        }
      }

      setFile(null);
      if (fileInputRef.current) fileInputRef.current.value = '';
      await fetchJobs(token);
    } catch (e: any) {
      toast.error(e?.message ?? 'เกิดข้อผิดพลาด');
    } finally {
      setUploading(false);
    }
  };

  const retry = async (jobId: string) => {
    if (!token) return;
    const res = await fetch('/api/assistant/jobs/process', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ jobId }),
    });
    if (res.ok) { toast.success('ส่งงานใหม่แล้ว'); await fetchJobs(token); }
    else toast.error('ส่งงานใหม่ไม่สำเร็จ');
  };

  // ── Result actions ──────────────────────────────────────────────────────────────
  const copyTranscript = async () => {
    if (!activeJob?.transcript_text) return;
    await navigator.clipboard.writeText(activeJob.transcript_text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const downloadTranscript = () => {
    if (!activeJob?.transcript_text) return;
    const blob = new Blob([activeJob.transcript_text], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${safeFileName(activeJob.file_name).replace(/\.[^.]+$/, '')}-transcript.txt`;
    a.click();
    URL.revokeObjectURL(url);
  };

  /** ดาวน์โหลด MoM PDF ของ job (ใช้ได้ทั้งจาก dialog และปุ่มในตาราง) */
  const downloadPdf = async (job: Job | null, opts?: { rowId?: string }) => {
    if (!job?.transcript_json) return;
    if (opts?.rowId) setPdfBusyId(opts.rowId); else setPdfBusy(true);
    try {
      const res = await fetch('/api/assistant/stt/mom-pdf', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ jobId: job.id }),
      });
      if (!res.ok) {
        const e = await res.json().catch(() => null);
        throw new Error(e?.error?.message ?? `สร้าง PDF ไม่สำเร็จ (${res.status})`);
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `MoM-${safeFileName(job.transcript_json.meeting_title || job.file_name).replace(/\.[^.]+$/, '')}.pdf`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'สร้าง PDF ไม่สำเร็จ ลองใหม่อีกครั้ง');
      console.error(e);
    } finally {
      if (opts?.rowId) setPdfBusyId(null); else setPdfBusy(false);
    }
  };

  // ── Derived stats (dashboard) ────────────────────────────────────────────────────
  const stats = useMemo(() => ({
    total: jobs.length,
    completed: jobs.filter((j) => j.status === 'completed').length,
    active: jobs.filter((j) => j.status === 'pending' || j.status === 'processing').length,
  }), [jobs]);

  const remainMin = quota ? Math.floor(quota.remaining / 60) : null;
  const limitMin = quota ? Math.floor(quota.limit / 60) : null;
  const usedPct = quota && quota.limit ? Math.min(100, (quota.used / quota.limit) * 100) : 0;
  const botRemainMin = botQuota ? Math.floor(botQuota.remaining / 60) : null;
  const botLimitMin = botQuota ? Math.floor(botQuota.limit / 60) : null;

  // ── Render ──────────────────────────────────────────────────────────────────────
  return (
    <>

      {/* KPI dashboard */}
      <div className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-5">
        <KpiCard
          icon={<Timer className="h-4 w-4" />}
          label="นาทีถอดเสียง"
          value={remainMin != null ? remainMin.toLocaleString('th-TH') : '—'}
          sub={limitMin != null ? `จาก ${limitMin.toLocaleString('th-TH')} นาที` : ''}
          tone={quota && quota.remaining <= 0 ? 'danger' : 'primary'}
        />
        <KpiCard
          icon={<Bot className="h-4 w-4" />}
          label="นาทีบอทประชุม"
          value={botRemainMin != null ? botRemainMin.toLocaleString('th-TH') : '—'}
          sub={botLimitMin != null ? `จาก ${botLimitMin.toLocaleString('th-TH')} นาที` : ''}
          tone={botQuota && botQuota.remaining <= 0 ? 'danger' : 'primary'}
        />
        <KpiCard icon={<FileAudio className="h-4 w-4" />} label="งานทั้งหมด" value={stats.total.toLocaleString('th-TH')} sub="ไฟล์" tone="neutral" />
        <KpiCard icon={<CheckCircle2 className="h-4 w-4" />} label="เสร็จสมบูรณ์" value={stats.completed.toLocaleString('th-TH')} sub="รายงาน" tone="success" />
        <KpiCard icon={<Hourglass className="h-4 w-4" />} label="กำลังดำเนินการ" value={stats.active.toLocaleString('th-TH')} sub="คิว" tone="warning" />
      </div>

      {/* Two-column workspace */}
      <div className="grid gap-6 lg:grid-cols-12">
        {/* Left — upload + quota */}
        <div className="min-w-0 lg:col-span-5 xl:col-span-4">
          <div className="space-y-4 lg:sticky lg:top-6">
            {/* Upload card */}
            <div className="rounded-2xl border border-gray-100 bg-white p-5 shadow-sm">
              <h2 className="mb-3 text-sm font-semibold text-gray-900">อัปโหลดไฟล์ใหม่</h2>
              <div
                onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
                onDragLeave={() => setDragOver(false)}
                onDrop={(e) => { e.preventDefault(); setDragOver(false); pickFile(e.dataTransfer.files?.[0] ?? null); }}
                onClick={() => fileInputRef.current?.click()}
                className={`flex cursor-pointer flex-col items-center justify-center rounded-xl border-2 border-dashed px-6 py-10 text-center transition-colors ${
                  dragOver ? 'border-indigo-400 bg-indigo-50' : 'border-gray-200 hover:border-indigo-300 hover:bg-gray-50'
                }`}
              >
                <input
                  ref={fileInputRef} type="file" accept={ACCEPT} className="hidden"
                  onChange={(e) => pickFile(e.target.files?.[0] ?? null)}
                />
                {file ? (
                  <div className="flex items-center gap-3">
                    <FileAudio className="h-8 w-8 shrink-0 text-indigo-600" />
                    <div className="min-w-0 text-left">
                      <div className="truncate font-medium text-gray-900">{file.name}</div>
                      <div className="text-xs text-gray-500">{fmtSize(file.size)}</div>
                    </div>
                    <Button
                      variant="ghost" size="icon"
                      onClick={(e) => { e.stopPropagation(); setFile(null); setFileDuration(null); if (fileInputRef.current) fileInputRef.current.value = ''; }}
                    >
                      <X className="h-4 w-4" />
                    </Button>
                  </div>
                ) : (
                  <>
                    <UploadCloud className="mb-3 h-10 w-10 text-gray-400" />
                    <p className="text-sm font-medium text-gray-700">ลากไฟล์มาวาง หรือคลิกเพื่อเลือก</p>
                    <p className="mt-1 text-xs text-gray-400">รองรับ mp3, ogg, m4a, wav, mp4 · สูงสุด 200 MB</p>
                  </>
                )}
              </div>

              {file && fileDuration ? (
                <p className="mt-3 text-xs text-gray-500">
                  ความยาว ~{Math.ceil(fileDuration / 60)} นาที
                  {quota && fileDuration > quota.remaining
                    ? <span className="ml-1 text-red-600">· เกินโควต้าที่เหลือ ({Math.floor(quota.remaining / 60)} นาที)</span>
                    : null}
                </p>
              ) : null}

              <Button
                className="mt-4 w-full"
                disabled={!file || uploading || !!(quota && fileDuration && fileDuration > quota.remaining)}
                onClick={handleStart}
              >
                {uploading
                  ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> กำลังอัปโหลด…</>
                  : <><Sparkles className="mr-2 h-4 w-4" /> เริ่มถอดเสียง</>}
              </Button>
            </div>

            {/* Quota card */}
            {quota ? (
              <div className="rounded-2xl border border-gray-100 bg-white p-5 shadow-sm">
                <div className="flex items-center justify-between text-sm">
                  <span className="font-medium text-gray-700">โควต้าถอดเสียง</span>
                  <span className={quota.remaining <= 0 ? 'font-semibold text-red-600' : 'font-semibold text-gray-900'}>
                    เหลือ {Math.floor(quota.remaining / 60)} / {Math.floor(quota.limit / 60)} นาที
                  </span>
                </div>
                <div className="mt-2 h-2 w-full overflow-hidden rounded-full bg-gray-100">
                  <div
                    className={`h-full rounded-full ${quota.remaining <= 0 ? 'bg-red-500' : 'bg-indigo-500'}`}
                    style={{ width: `${usedPct}%` }}
                  />
                </div>
                <Link href="/assistant/billing" className="mt-3 inline-flex items-center gap-1 text-xs font-medium text-indigo-600 hover:text-indigo-700">
                  <Sparkles className="h-3.5 w-3.5" /> ซื้อนาทีเพิ่ม
                </Link>
              </div>
            ) : null}
          </div>
        </div>

        {/* Right — jobs */}
        <div className="min-w-0 lg:col-span-7 xl:col-span-8">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-lg font-semibold text-gray-900">รายการงาน</h2>
            <span className="text-xs text-gray-400">ผลลัพธ์เก็บไว้ {RETENTION_HOURS} ชม. แล้วลบอัตโนมัติ</span>
          </div>

          {loading ? (
            <div className="animate-pulse space-y-3">
              {[...Array(4)].map((_, i) => <div key={i} className="h-16 rounded-xl bg-gray-100" />)}
            </div>
          ) : error ? (
            <div className="flex items-center gap-2 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
              <AlertCircle className="h-4 w-4" /> {error}
            </div>
          ) : jobs.length === 0 ? (
            <div className="flex flex-col items-center justify-center rounded-2xl border border-gray-100 bg-white py-16 text-center">
              <div className="mb-4 rounded-full bg-gray-100 p-4"><Mic className="h-8 w-8 text-gray-400" /></div>
              <h3 className="text-sm font-medium text-gray-900">ยังไม่มีงานถอดเสียง</h3>
              <p className="mt-1 text-sm text-gray-500">อัปโหลดไฟล์เสียงไฟล์แรกเพื่อเริ่มต้น</p>
              <Button className="mt-4" size="sm" onClick={() => fileInputRef.current?.click()}>
                <UploadCloud className="mr-2 h-4 w-4" /> อัปโหลดไฟล์เสียง
              </Button>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>ไฟล์</TableHead>
                  <TableHead align="center">สถานะ</TableHead>
                  <TableHead className="hidden md:table-cell">สร้างเมื่อ</TableHead>
                  <TableHead>หมดอายุ</TableHead>
                  <TableHead align="right">จัดการ</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {jobs.map((job) => {
                  const exp = job.status === 'completed' ? expiryInfo(job.created_at) : null;
                  const isDone = job.status === 'completed';
                  return (
                    <TableRow key={job.id} clickable={isDone} onClick={isDone ? () => { setActiveJob(job); setCopied(false); } : undefined}>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <FileAudio className="h-4 w-4 shrink-0 text-gray-400" />
                          <div className="min-w-0">
                            <div className="truncate font-medium text-gray-900">{job.transcript_json?.meeting_title || job.file_name}</div>
                            <div className="truncate text-xs text-gray-400">{job.file_name}{job.file_size ? ` · ${fmtSize(job.file_size)}` : ''}</div>
                          </div>
                        </div>
                      </TableCell>
                      <TableCell align="center">
                        <StatusBadge tone={STATUS_TONE[job.status]}>{STATUS_TEXT[job.status]}</StatusBadge>
                        {job.status === 'failed' && job.error_message ? (
                          <div className="mt-1 max-w-[200px] truncate text-xs text-red-600" title={job.error_message}>{job.error_message}</div>
                        ) : null}
                      </TableCell>
                      <TableCell className="hidden text-gray-500 md:table-cell">{fmtDateTime(job.created_at)}</TableCell>
                      <TableCell>
                        {exp ? (
                          <span className={`inline-flex items-center gap-1 text-xs ${exp.expired ? 'text-gray-400' : exp.soon ? 'text-amber-600' : 'text-gray-500'}`}>
                            <Clock className="h-3.5 w-3.5" /> {exp.label}
                          </span>
                        ) : <span className="text-xs text-gray-300">—</span>}
                      </TableCell>
                      <TableCell align="right" onClick={(e) => e.stopPropagation()}>
                        <div className="flex items-center justify-end gap-1.5">
                          {job.status === 'completed' ? (
                            <Button size="sm" disabled={pdfBusyId === job.id || exp?.expired}
                              onClick={() => downloadPdf(job, { rowId: job.id })}>
                              {pdfBusyId === job.id
                                ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                                : <><Download className="mr-1 h-3.5 w-3.5" /> ดาวน์โหลด</>}
                            </Button>
                          ) : job.status === 'failed' || job.status === 'pending' ? (
                            <Button variant="outline" size="sm" onClick={() => retry(job.id)}>
                              <Play className="mr-1 h-3.5 w-3.5" /> {job.status === 'pending' ? 'เริ่มถอดเสียง' : 'ลองใหม่'}
                            </Button>
                          ) : (
                            <Loader2 className="h-4 w-4 animate-spin text-gray-400" />
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </div>
      </div>

      {/* Result dialog */}
      <Dialog open={!!activeJob} onOpenChange={(o) => { if (!o) setActiveJob(null); }}>
        <DialogContent size="xl">
          <DialogHeader>
            <DialogTitle className="flex items-start gap-2">
              <FileAudio className="mt-0.5 h-5 w-5 shrink-0 text-indigo-600" />
              <span className="min-w-0">
                <span className="block truncate text-base">{activeJob?.transcript_json?.meeting_title || activeJob?.file_name}</span>
                {activeJob?.transcript_json?.meeting_title ? (
                  <span className="block truncate text-xs font-normal text-gray-400">{activeJob.file_name}</span>
                ) : null}
              </span>
            </DialogTitle>
          </DialogHeader>

          <DialogBody>
          {activeJob?.transcript_json ? (
            <div className="space-y-4">
              <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-gray-500">
                <span>ภาษา: {activeJob.transcript_json.language || 'th'}</span>
                <span>·</span>
                <span>ผู้เข้าร่วม {(activeJob.transcript_json.speakers ?? []).length} คน</span>
              </div>

              {activeJob.transcript_json.executive_summary ? (
                <section>
                  <h4 className="mb-1.5 text-sm font-semibold text-gray-900">สรุปภาพรวม</h4>
                  <p className="rounded-xl border border-indigo-100 bg-indigo-50/60 p-3 text-sm leading-relaxed text-gray-800">
                    {activeJob.transcript_json.executive_summary}
                  </p>
                </section>
              ) : null}

              {activeJob.transcript_json.key_topics && activeJob.transcript_json.key_topics.length > 0 ? (
                <section>
                  <h4 className="mb-1.5 text-sm font-semibold text-gray-900">ประเด็นสำคัญ</h4>
                  <div className="space-y-2">
                    {activeJob.transcript_json.key_topics.map((k, i) => (
                      <div key={i} className="rounded-xl border border-gray-100 bg-white p-3">
                        <span className="text-sm font-medium text-gray-900">{k.topic}</span>
                        {k.details ? <p className="mt-1 text-sm leading-relaxed text-gray-600">{k.details}</p> : null}
                      </div>
                    ))}
                  </div>
                </section>
              ) : null}

              {activeJob.transcript_json.decisions && activeJob.transcript_json.decisions.length > 0 ? (
                <section>
                  <h4 className="mb-1.5 text-sm font-semibold text-gray-900">มติ / ข้อสรุป</h4>
                  <ul className="space-y-1.5">
                    {activeJob.transcript_json.decisions.map((d, i) => (
                      <li key={i} className="flex items-start gap-2 rounded-lg border border-emerald-100 bg-emerald-50/60 p-2.5 text-sm text-gray-800">
                        <Check className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" />
                        <span>{d}</span>
                      </li>
                    ))}
                  </ul>
                </section>
              ) : null}

              {activeJob.transcript_json.action_items && activeJob.transcript_json.action_items.length > 0 ? (
                <section>
                  <h4 className="mb-1.5 text-sm font-semibold text-gray-900">สิ่งที่ต้องทำต่อ</h4>
                  <div className="space-y-1.5">
                    {activeJob.transcript_json.action_items.map((a, i) => (
                      <div key={i} className="flex items-start gap-2 rounded-lg border border-amber-100 bg-amber-50/60 p-2.5 text-sm">
                        <span className="mt-0.5 h-1.5 w-1.5 shrink-0 rounded-full bg-amber-500" />
                        <div>
                          <span className="text-gray-800">{a.task}</span>
                          {(a.assignee && a.assignee !== 'ไม่ระบุ') || a.deadline ? (
                            <span className="ml-1 text-xs text-gray-500">
                              {a.assignee && a.assignee !== 'ไม่ระบุ' ? `· ${a.assignee}` : ''}
                              {a.deadline ? ` · กำหนด ${a.deadline}` : ''}
                            </span>
                          ) : null}
                        </div>
                      </div>
                    ))}
                  </div>
                </section>
              ) : null}

              {activeJob.transcript_json.recommendations && activeJob.transcript_json.recommendations.length > 0 ? (
                <section>
                  <h4 className="mb-1.5 flex items-center gap-1.5 text-sm font-semibold text-gray-900">
                    <Sparkles className="h-4 w-4 text-sky-600" /> ข้อเสนอแนะจาก AI
                  </h4>
                  <ul className="space-y-1.5">
                    {activeJob.transcript_json.recommendations.map((r, i) => (
                      <li key={i} className="flex items-start gap-2 rounded-lg border border-sky-100 bg-sky-50/60 p-2.5 text-sm text-gray-800">
                        <Sparkles className="mt-0.5 h-3.5 w-3.5 shrink-0 text-sky-500" />
                        <span>{r}</span>
                      </li>
                    ))}
                  </ul>
                </section>
              ) : null}

              {(activeJob.transcript_json.speakers ?? []).length > 0 ? (
                <section>
                  <h4 className="mb-1.5 text-sm font-semibold text-gray-900">ผู้เข้าร่วม</h4>
                  <div className="flex flex-wrap gap-1.5">
                    {activeJob.transcript_json.speakers.map((s, i) => (
                      <span key={i} className="rounded-full bg-gray-100 px-2.5 py-0.5 text-xs text-gray-700">{s}</span>
                    ))}
                  </div>
                </section>
              ) : null}
            </div>
          ) : (
            <p className="py-8 text-center text-sm text-gray-500">ไม่มีข้อมูลสรุป</p>
          )}
          </DialogBody>

          <DialogFooter>
            <Button variant="outline" onClick={copyTranscript} className="sm:w-auto">
              {copied ? <><Check className="mr-2 h-4 w-4 text-green-600" /> คัดลอกแล้ว</> : <><Copy className="mr-2 h-4 w-4" /> คัดลอก</>}
            </Button>
            <Button variant="outline" onClick={downloadTranscript} className="sm:w-auto">
              <Download className="mr-2 h-4 w-4" /> .txt
            </Button>
            <Button onClick={() => downloadPdf(activeJob)} disabled={pdfBusy} className="sm:w-auto">
              {pdfBusy
                ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> กำลังสร้าง…</>
                : <><Download className="mr-2 h-4 w-4" /> ดาวน์โหลด MoM (PDF)</>}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

// ── KPI card ─────────────────────────────────────────────────────────────────────
function KpiCard({
  icon, label, value, sub, tone,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  sub?: string;
  tone: 'primary' | 'success' | 'warning' | 'danger' | 'neutral';
}) {
  const toneCls: Record<string, string> = {
    primary: 'bg-indigo-50 text-indigo-600',
    success: 'bg-green-50 text-green-600',
    warning: 'bg-amber-50 text-amber-600',
    danger:  'bg-red-50 text-red-600',
    neutral: 'bg-gray-100 text-gray-500',
  };
  return (
    <div className="rounded-2xl border border-gray-100 bg-white p-4 shadow-sm">
      <div className="flex items-center gap-2">
        <span className={`flex h-7 w-7 items-center justify-center rounded-lg ${toneCls[tone]}`}>{icon}</span>
        <span className="text-xs font-medium text-gray-500">{label}</span>
      </div>
      <div className="mt-2 text-2xl font-semibold tabular-nums text-gray-900">{value}</div>
      {sub ? <div className="text-xs text-gray-400">{sub}</div> : null}
    </div>
  );
}
