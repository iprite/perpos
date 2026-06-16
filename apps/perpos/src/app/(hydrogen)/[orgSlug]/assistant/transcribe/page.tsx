'use client';

import { useEffect, useState, useCallback, useMemo, useRef } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { createSupabaseBrowserClient } from '@/lib/supabase/client';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import {
  Mic, UploadCloud, RefreshCw, FileAudio, Loader2, X, ArrowLeft,
  Copy, Check, Download, AlertCircle, Play, Sparkles, BarChart3,
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

// บาง browser ไม่ใส่ file.type (เช่น .ogg) — เดา mime จากนามสกุลเพื่อให้ bucket
// allowed_mime_types ไม่ปฏิเสธ และ Gemini อ่านไฟล์ได้ถูกชนิด
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

const STATUS_BADGE: Record<string, string> = {
  pending: 'bg-amber-50 text-amber-700 border-amber-200',
  processing: 'bg-blue-50 text-blue-700 border-blue-200 animate-pulse',
  completed: 'bg-green-50 text-green-700 border-green-200',
  failed: 'bg-red-50 text-red-700 border-red-200',
};
const STATUS_TEXT: Record<string, string> = {
  pending: 'รอดำเนินการ',
  processing: 'กำลังแกะเสียง',
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


function modelLabel(model: string) {
  return model === 'gemini-2.5-pro' ? 'แม่นยำ' : 'เร็ว';
}

function safeFileName(name: string): string {
  const dot = name.lastIndexOf('.');
  const ext = dot >= 0 ? name.slice(dot).toLowerCase().replace(/[^a-z0-9.]/g, '') : '';
  const base = (dot >= 0 ? name.slice(0, dot) : name)
    .replace(/[^a-zA-Z0-9._-]+/g, '_').slice(0, 80) || 'audio';
  return `${base}${ext}`;
}

export default function AssistantTranscribePage() {
  const { orgSlug } = useParams<{ orgSlug: string }>();
  const supabase = useMemo(() => createSupabaseBrowserClient(), []);

  const [orgId, setOrgId] = useState('');
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

  const [quota, setQuota] = useState<{ limit: number; used: number; remaining: number } | null>(null);
  const [fileDuration, setFileDuration] = useState<number | null>(null);

  // ── Data ──────────────────────────────────────────────────────────────────────
  const fetchJobs = useCallback(async (oid: string, tk: string) => {
    const res = await fetch(`/api/assistant/transcribe/jobs?orgId=${oid}`, {
      headers: { Authorization: `Bearer ${tk}` },
    });
    if (!res.ok) return;
    const json = await res.json();
    setJobs((json.data ?? []) as Job[]);
  }, []);

  const fetchQuota = useCallback(async (oid: string, tk: string) => {
    const res = await fetch(`/api/assistant/transcribe/quota?orgId=${oid}`, {
      headers: { Authorization: `Bearer ${tk}` },
    });
    if (!res.ok) return;
    const d = (await res.json()).data;
    if (d) setQuota({ limit: d.limit_seconds, used: d.used_seconds, remaining: d.remaining_seconds });
  }, []);

  const init = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const { data: org, error: orgErr } = await supabase
        .from('organizations').select('id').eq('slug', orgSlug).single();
      if (orgErr || !org) throw new Error('ไม่พบข้อมูลองค์กร');

      const { data: sess } = await supabase.auth.getSession();
      const accessToken = sess.session?.access_token;
      if (!accessToken) throw new Error('กรุณาเข้าสู่ระบบใหม่');

      setOrgId(org.id);
      setToken(accessToken);
      await Promise.all([fetchJobs(org.id, accessToken), fetchQuota(org.id, accessToken)]);
    } catch (e: any) {
      setError(e?.message ?? 'โหลดข้อมูลไม่สำเร็จ');
    } finally {
      setLoading(false);
    }
  }, [supabase, orgSlug, fetchJobs, fetchQuota]);

  useEffect(() => { init(); }, [init]);

  // poll ขณะมีงานค้าง (อัปเดต jobs + โควต้า)
  useEffect(() => {
    const active = jobs.some((j) => j.status === 'pending' || j.status === 'processing');
    if (!active || !orgId || !token) return;
    const t = setInterval(() => { fetchJobs(orgId, token); fetchQuota(orgId, token); }, 5000);
    return () => clearInterval(t);
  }, [jobs, orgId, token, fetchJobs, fetchQuota]);

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
    // วัดความยาวฝั่ง client (advisory) เพื่อเตือนก่อนอัป — enforcement จริงที่ worker
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
    if (!file || !orgId || !token) return;
    setUploading(true);
    try {
      const mimeType = resolveMime(file);
      const path = `${orgId}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}-${safeFileName(file.name)}`;
      const { error: upErr } = await supabase.storage
        .from('assistant_audio')
        .upload(path, file, { contentType: mimeType, upsert: false });
      if (upErr) throw new Error(`อัปโหลดล้มเหลว: ${upErr.message}`);

      const jobRes = await fetch('/api/assistant/transcribe/jobs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          orgId, audioUrl: path, fileName: file.name,
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
        const pr = await fetch('/api/assistant/transcribe/jobs/process', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
          body: JSON.stringify({ jobId, orgId }),
        });
        if (pr.ok) {
          toast.success('อัปโหลดและเริ่มแกะเสียงแล้ว');
        } else {
          const e = await pr.json().catch(() => null);
          toast.error(e?.error?.message ?? 'อัปโหลดแล้วแต่เริ่มแกะเสียงไม่สำเร็จ — กดปุ่ม "ลองใหม่" ที่รายการได้');
        }
      }

      setFile(null);
      if (fileInputRef.current) fileInputRef.current.value = '';
      await fetchJobs(orgId, token);
    } catch (e: any) {
      toast.error(e?.message ?? 'เกิดข้อผิดพลาด');
    } finally {
      setUploading(false);
    }
  };

  const retry = async (jobId: string) => {
    if (!orgId || !token) return;
    const res = await fetch('/api/assistant/transcribe/jobs/process', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ jobId, orgId }),
    });
    if (res.ok) { toast.success('ส่งงานใหม่แล้ว'); await fetchJobs(orgId, token); }
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

  const downloadMomPdf = async () => {
    if (!activeJob?.transcript_json) return;
    setPdfBusy(true);
    try {
      // render ผ่าน pdf-renderer (Chromium) ฝั่ง server — ภาษาไทย shaping ถูกต้อง
      const res = await fetch('/api/assistant/transcribe/mom-pdf', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ orgId, jobId: activeJob.id }),
      });
      if (!res.ok) {
        const e = await res.json().catch(() => null);
        throw new Error(e?.error?.message ?? `สร้าง PDF ไม่สำเร็จ (${res.status})`);
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `MoM-${safeFileName(activeJob.transcript_json.meeting_title || activeJob.file_name).replace(/\.[^.]+$/, '')}.pdf`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'สร้าง PDF ไม่สำเร็จ ลองใหม่อีกครั้ง');
      console.error(e);
    } finally {
      setPdfBusy(false);
    }
  };

  // ── Render ──────────────────────────────────────────────────────────────────────
  return (
    <div className="mx-auto max-w-4xl px-4 py-6 sm:px-6">
      {/* Header */}
      <div className="mb-6 flex items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <Link href={`/${orgSlug}/assistant`}>
            <Button variant="ghost" size="icon" aria-label="ย้อนกลับ"><ArrowLeft className="h-5 w-5" /></Button>
          </Link>
          <div>
            <h1 className="flex items-center gap-2 text-2xl font-semibold text-gray-900">
              <Mic className="h-6 w-6 text-indigo-600" /> แกะเสียงเป็นข้อความ
            </h1>
            <p className="text-sm text-gray-500">อัปโหลดไฟล์เสียง/วิดีโอ แล้วระบบจะถอดเป็นข้อความพร้อมแยกผู้พูด</p>
          </div>
        </div>
        <div className="flex gap-2">
          <Link href={`/${orgSlug}/assistant/transcribe/stats`}>
            <Button variant="outline" size="sm"><BarChart3 className="mr-2 h-4 w-4" /> สถิติ</Button>
          </Link>
          <Button variant="outline" size="sm" disabled={!orgId} onClick={() => fetchJobs(orgId, token)}>
            <RefreshCw className="mr-2 h-4 w-4" /> รีเฟรช
          </Button>
        </div>
      </div>

      {/* Quota banner */}
      {quota ? (
        <div className="mb-4 rounded-xl border border-gray-100 bg-white p-4 shadow-sm">
          <div className="flex items-center justify-between text-sm">
            <span className="font-medium text-gray-700">โควต้าแกะเสียง (นาทีการประชุม)</span>
            <span className={quota.remaining <= 0 ? 'font-semibold text-red-600' : 'font-semibold text-gray-900'}>
              เหลือ {Math.floor(quota.remaining / 60)} / {Math.floor(quota.limit / 60)} นาที
            </span>
          </div>
          <div className="mt-2 h-2 w-full overflow-hidden rounded-full bg-gray-100">
            <div
              className={`h-full rounded-full ${quota.remaining <= 0 ? 'bg-red-500' : 'bg-indigo-500'}`}
              style={{ width: `${Math.min(100, quota.limit ? (quota.used / quota.limit) * 100 : 0)}%` }}
            />
          </div>
        </div>
      ) : null}

      {/* Upload card */}
      <div className="mb-8 rounded-2xl border border-gray-100 bg-white p-6 shadow-sm">
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
              <FileAudio className="h-8 w-8 text-indigo-600" />
              <div className="text-left">
                <div className="font-medium text-gray-900">{file.name}</div>
                <div className="text-xs text-gray-500">{fmtSize(file.size)}</div>
              </div>
              <Button
                variant="ghost" size="icon"
                onClick={(e) => { e.stopPropagation(); setFile(null); if (fileInputRef.current) fileInputRef.current.value = ''; }}
              >
                <X className="h-4 w-4" />
              </Button>
            </div>
          ) : (
            <>
              <UploadCloud className="mb-3 h-10 w-10 text-gray-400" />
              <p className="text-sm font-medium text-gray-700">ลากไฟล์มาวาง หรือคลิกเพื่อเลือก</p>
              <p className="mt-1 text-xs text-gray-400">รองรับ mp3, ogg, m4a, wav, mp4</p>
            </>
          )}
        </div>

        <div className="mt-4 flex flex-col items-stretch gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="text-xs text-gray-500">
            {file && fileDuration ? `ความยาว ~${Math.ceil(fileDuration / 60)} นาที` : null}
            {file && fileDuration && quota && fileDuration > quota.remaining
              ? <span className="ml-1 text-red-600">· เกินโควต้าที่เหลือ ({Math.floor(quota.remaining / 60)} นาที)</span>
              : null}
          </div>
          <Button
            disabled={!file || uploading || !!(quota && fileDuration && fileDuration > quota.remaining)}
            onClick={handleStart}
          >
            {uploading
              ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> กำลังอัปโหลด…</>
              : <><Sparkles className="mr-2 h-4 w-4" /> เริ่มแกะเสียง</>}
          </Button>
        </div>
      </div>

      {/* Jobs list */}
      <h2 className="mb-3 text-lg font-semibold text-gray-900">งานล่าสุด</h2>

      {loading ? (
        <div className="animate-pulse space-y-3">
          {[...Array(3)].map((_, i) => <div key={i} className="h-16 rounded-xl bg-gray-100" />)}
        </div>
      ) : error ? (
        <div className="flex items-center gap-2 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          <AlertCircle className="h-4 w-4" /> {error}
        </div>
      ) : jobs.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-2xl border border-gray-100 bg-white py-16 text-center">
          <div className="mb-4 rounded-full bg-gray-100 p-4"><Mic className="h-8 w-8 text-gray-400" /></div>
          <h3 className="text-sm font-medium text-gray-900">ยังไม่มีงานแกะเสียง</h3>
          <p className="mt-1 text-sm text-gray-500">อัปโหลดไฟล์เสียงไฟล์แรกเพื่อเริ่มต้น</p>
          <Button className="mt-4" size="sm" onClick={() => fileInputRef.current?.click()}>
            <UploadCloud className="mr-2 h-4 w-4" /> อัปโหลดไฟล์เสียง
          </Button>
        </div>
      ) : (
        <div className="overflow-hidden rounded-2xl border border-gray-100 bg-white shadow-sm">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-100 bg-gray-50">
                <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wide text-gray-500">ไฟล์</th>
                <th className="px-4 py-3 text-center text-xs font-medium uppercase tracking-wide text-gray-500">โมเดล</th>
                <th className="px-4 py-3 text-center text-xs font-medium uppercase tracking-wide text-gray-500">สถานะ</th>
                <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wide text-gray-500">เวลา</th>
                <th className="px-4 py-3 text-right text-xs font-medium uppercase tracking-wide text-gray-500">จัดการ</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {jobs.map((job) => (
                <tr key={job.id} className="transition-colors duration-150 hover:bg-gray-50">
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <FileAudio className="h-4 w-4 shrink-0 text-gray-400" />
                      <div className="min-w-0">
                        <div className="truncate font-medium text-gray-900">{job.file_name}</div>
                        {job.file_size ? <div className="text-xs text-gray-400">{fmtSize(job.file_size)}</div> : null}
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-3 text-center text-xs text-gray-500">{modelLabel(job.model)}</td>
                  <td className="px-4 py-3 text-center">
                    <span className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium ${STATUS_BADGE[job.status]}`}>
                      {STATUS_TEXT[job.status]}
                    </span>
                    {job.status === 'failed' && job.error_message ? (
                      <div className="mt-1 text-xs text-red-600">{job.error_message}</div>
                    ) : null}
                  </td>
                  <td className="px-4 py-3 text-gray-500">{fmtDateTime(job.created_at)}</td>
                  <td className="px-4 py-3 text-right">
                    {job.status === 'completed' ? (
                      <Button variant="outline" size="sm" onClick={() => { setActiveJob(job); setCopied(false); }}>
                        ดู transcript
                      </Button>
                    ) : job.status === 'failed' || job.status === 'pending' ? (
                      // pending ที่ค้าง (เริ่มงานไม่สำเร็จ) ก็กดเริ่มใหม่ได้
                      <Button variant="outline" size="sm" onClick={() => retry(job.id)}>
                        <Play className="mr-1 h-3.5 w-3.5" /> {job.status === 'pending' ? 'เริ่มแกะเสียง' : 'ลองใหม่'}
                      </Button>
                    ) : (
                      <Loader2 className="ml-auto h-4 w-4 animate-spin text-gray-400" />
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Result dialog */}
      <Dialog open={!!activeJob} onOpenChange={(o) => { if (!o) setActiveJob(null); }}>
        <DialogContent className="flex max-h-[85vh] w-[calc(100vw-1.5rem)] max-w-2xl flex-col gap-0 overflow-hidden p-0 sm:w-full">
          <DialogHeader className="shrink-0 border-b border-gray-100 px-4 pb-3 pr-10 pt-4 sm:px-6 sm:pr-12">
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

          <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4 sm:px-6">
          {activeJob?.transcript_json ? (
            <div className="space-y-4">
              <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-gray-500">
                <span>ภาษา: {activeJob.transcript_json.language || 'th'}</span>
                <span>·</span>
                <span>ผู้เข้าร่วม {(activeJob.transcript_json.speakers ?? []).length} คน</span>
              </div>

              {/* สรุปภาพรวม */}
              {activeJob.transcript_json.executive_summary ? (
                <section>
                  <h4 className="mb-1.5 text-sm font-semibold text-gray-900">สรุปภาพรวม</h4>
                  <p className="rounded-xl border border-indigo-100 bg-indigo-50/60 p-3 text-sm leading-relaxed text-gray-800">
                    {activeJob.transcript_json.executive_summary}
                  </p>
                </section>
              ) : null}

              {/* ประเด็นสำคัญ */}
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

              {/* มติ / ข้อสรุป */}
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

              {/* สิ่งที่ต้องทำต่อ */}
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

              {/* ข้อเสนอแนะจาก AI */}
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

              {/* ผู้เข้าร่วม */}
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
          </div>

          <DialogFooter className="shrink-0 gap-2 border-t border-gray-100 px-4 py-3 sm:gap-2 sm:px-6">
            <Button variant="outline" onClick={copyTranscript} className="sm:w-auto">
              {copied ? <><Check className="mr-2 h-4 w-4 text-green-600" /> คัดลอกแล้ว</> : <><Copy className="mr-2 h-4 w-4" /> คัดลอก</>}
            </Button>
            <Button variant="outline" onClick={downloadTranscript} className="sm:w-auto">
              <Download className="mr-2 h-4 w-4" /> .txt
            </Button>
            <Button onClick={downloadMomPdf} disabled={pdfBusy} className="sm:w-auto">
              {pdfBusy
                ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> กำลังสร้าง…</>
                : <><Download className="mr-2 h-4 w-4" /> ดาวน์โหลด MoM (PDF)</>}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
