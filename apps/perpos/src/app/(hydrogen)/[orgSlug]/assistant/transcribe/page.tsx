'use client';

import { useEffect, useState, useCallback, useMemo, useRef } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { createSupabaseBrowserClient } from '@/lib/supabase/client';
import { Button } from '@/components/ui/button';
import { CustomSelect } from '@/components/ui/custom-select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import {
  Mic, UploadCloud, RefreshCw, FileAudio, Loader2, X, ArrowLeft,
  Copy, Check, Download, AlertCircle, Play, Sparkles,
} from 'lucide-react';
import { toast } from 'react-hot-toast';

// ── Types ──────────────────────────────────────────────────────────────────────
type Segment = { speaker: string; start: number; end: number; text: string };
type TranscriptJson = { language: string; speakers: string[]; segments: Segment[] };

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

const MODEL_OPTIONS = [
  { value: 'gemini-2.5-flash', label: 'เร็ว — Gemini 2.5 Flash' },
  { value: 'gemini-2.5-pro', label: 'แม่นยำ — Gemini 2.5 Pro' },
];

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

// สีต่อผู้พูด (≤ 3 สีหลักตาม DESIGN.md)
const SPEAKER_COLORS = ['text-indigo-700', 'text-emerald-700', 'text-amber-700', 'text-rose-700'];

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

function fmtTs(seconds: number) {
  const total = Math.max(0, Math.floor(seconds));
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
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
  const [model, setModel] = useState('gemini-2.5-flash');
  const [uploading, setUploading] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // result dialog
  const [activeJob, setActiveJob] = useState<Job | null>(null);
  const [copied, setCopied] = useState(false);

  // ── Data ──────────────────────────────────────────────────────────────────────
  const fetchJobs = useCallback(async (oid: string, tk: string) => {
    const res = await fetch(`/api/assistant/transcribe/jobs?orgId=${oid}`, {
      headers: { Authorization: `Bearer ${tk}` },
    });
    if (!res.ok) return;
    const json = await res.json();
    setJobs((json.data ?? []) as Job[]);
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
      await fetchJobs(org.id, accessToken);
    } catch (e: any) {
      setError(e?.message ?? 'โหลดข้อมูลไม่สำเร็จ');
    } finally {
      setLoading(false);
    }
  }, [supabase, orgSlug, fetchJobs]);

  useEffect(() => { init(); }, [init]);

  // poll ขณะมีงานค้าง
  useEffect(() => {
    const active = jobs.some((j) => j.status === 'pending' || j.status === 'processing');
    if (!active || !orgId || !token) return;
    const t = setInterval(() => { fetchJobs(orgId, token); }, 5000);
    return () => clearInterval(t);
  }, [jobs, orgId, token, fetchJobs]);

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
          mimeType, model, fileSize: file.size,
        }),
      });
      if (!jobRes.ok) {
        const e = await jobRes.json().catch(() => null);
        throw new Error(e?.error?.message ?? 'สร้างงานล้มเหลว');
      }
      const created = await jobRes.json();
      const jobId = created?.data?.id;

      if (jobId) {
        await fetch('/api/assistant/transcribe/jobs/process', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
          body: JSON.stringify({ jobId, orgId }),
        });
      }

      toast.success('อัปโหลดและเริ่มแกะเสียงแล้ว');
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

  const speakerColor = (job: Job, speaker: string) => {
    const list = job.transcript_json?.speakers ?? [];
    const idx = list.indexOf(speaker);
    return SPEAKER_COLORS[(idx >= 0 ? idx : 0) % SPEAKER_COLORS.length];
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
        <Button variant="outline" size="sm" disabled={!orgId} onClick={() => fetchJobs(orgId, token)}>
          <RefreshCw className="mr-2 h-4 w-4" /> รีเฟรช
        </Button>
      </div>

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
          <div className="flex items-center gap-2">
            <span className="text-sm text-gray-500">โมเดล:</span>
            <CustomSelect value={model} onChange={setModel} options={MODEL_OPTIONS} className="w-56" />
          </div>
          <Button disabled={!file || uploading} onClick={handleStart}>
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
                    ) : job.status === 'failed' ? (
                      <Button variant="outline" size="sm" onClick={() => retry(job.id)}>
                        <Play className="mr-1 h-3.5 w-3.5" /> ลองใหม่
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
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <FileAudio className="h-5 w-5 text-indigo-600" />
              <span className="truncate">{activeJob?.file_name}</span>
            </DialogTitle>
          </DialogHeader>

          {activeJob?.transcript_json ? (
            <div className="space-y-3">
              <div className="flex flex-wrap items-center gap-2 text-xs text-gray-500">
                <span>ภาษา: {activeJob.transcript_json.language}</span>
                <span>·</span>
                <span>ผู้พูด {activeJob.transcript_json.speakers.length} คน</span>
                <span>·</span>
                <span>{activeJob.transcript_json.segments.length} ช่วง</span>
              </div>
              <div className="space-y-2.5 rounded-xl border border-gray-100 bg-gray-50 p-4">
                {activeJob.transcript_json.segments.map((seg, i) => (
                  <div key={i} className="text-sm leading-relaxed">
                    <span className="mr-2 font-mono text-xs text-gray-400">[{fmtTs(seg.start)}]</span>
                    <span className={`font-semibold ${speakerColor(activeJob, seg.speaker)}`}>{seg.speaker}:</span>{' '}
                    <span className="text-gray-800">{seg.text}</span>
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <p className="py-8 text-center text-sm text-gray-500">ไม่มีข้อมูล transcript</p>
          )}

          <DialogFooter className="gap-2 sm:gap-2">
            <Button variant="outline" onClick={copyTranscript}>
              {copied ? <><Check className="mr-2 h-4 w-4 text-green-600" /> คัดลอกแล้ว</> : <><Copy className="mr-2 h-4 w-4" /> คัดลอก</>}
            </Button>
            <Button variant="outline" onClick={downloadTranscript}>
              <Download className="mr-2 h-4 w-4" /> ดาวน์โหลด .txt
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
