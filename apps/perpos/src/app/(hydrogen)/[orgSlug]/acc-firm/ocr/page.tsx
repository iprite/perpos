'use client';

import { useEffect, useState, useCallback, useMemo, useRef } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { createSupabaseBrowserClient } from '@/lib/supabase/client';
import { Button } from '@/components/ui/button';
import { PageShell } from '@/components/ui/page-shell';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { CustomSelect } from '@/components/ui/custom-select';
import { ThaiDatePicker } from '@/components/ui/thai-date-picker';
import { Dialog, DialogContent, DialogHeader, DialogBody, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { StatusBadge, type BadgeTone } from '@/components/ui/badge';
import {
  Table, TableHeader, TableBody, TableRow, TableHead, TableCell, TableEmpty,
} from '@/components/ui/table';
import {
  Calculator, AlertTriangle, FileText, CheckCircle2,
  Trash2, Plus, ArrowLeft, Loader2, BookOpen, AlertCircle,
  UploadCloud, Sparkles, X, FileUp, Lock,
} from 'lucide-react';
import { toast } from '@/lib/toast';

// ── Types ──────────────────────────────────────────────────────────────────────
type OcrJob = {
  id: string;
  firm_org_id: string;
  client_org_id: string;
  document_url: string;
  status: 'pending' | 'processing' | 'completed' | 'failed';
  extracted_json: any;
  classified_json: any;
  draft_journal_id: string | null;
  error_message: string | null;
  created_at: string;
  updated_at: string;
  // Join fields
  client_name?: string;
  journal_status?: string | null;
};

type ClientOption = { value: string; label: string };

type JournalLine = {
  accountId: string;
  contactId: string;
  debit: string;
  credit: string;
  description: string;
};

type ClientContext = {
  chart_of_accounts: Array<{ id: string; code: string; name: string; type: string }>;
  contacts: Array<{ id: string; name: string; contact_type: string }>;
};

// ── UI Helpers ─────────────────────────────────────────────────────────────────
const STATUS_TONE: Record<string, BadgeTone> = {
  pending: 'info',
  processing: 'warning',
  completed: 'success',
  failed: 'danger',
};

const STATUS_TEXT: Record<string, string> = {
  pending: 'รอดำเนินการ',
  processing: 'กำลังวิเคราะห์',
  completed: 'เสร็จสมบูรณ์',
  failed: 'ล้มเหลว',
};

const ACCEPT_TYPES = 'image/png,image/jpeg,image/jpg,image/webp,application/pdf';

function confidenceChip(score: number | undefined | null) {
  if (typeof score !== 'number') return null;
  const pct = Math.round(score * 100);
  const cls =
    score >= 0.9 ? 'bg-green-50 text-green-700 border-green-100'
    : score >= 0.8 ? 'bg-teal-50 text-teal-700 border-teal-100'
    : score >= 0.6 ? 'bg-amber-50 text-amber-700 border-amber-100'
    : 'bg-red-50 text-red-700 border-red-100';
  return { pct, cls };
}

function safeFileName(name: string): string {
  const dot = name.lastIndexOf('.');
  const ext = dot >= 0 ? name.slice(dot).toLowerCase().replace(/[^a-z0-9.]/g, '') : '';
  const base = (dot >= 0 ? name.slice(0, dot) : name)
    .replace(/[^a-zA-Z0-9._-]+/g, '_')
    .slice(0, 80) || 'document';
  return `${base}${ext}`;
}

export default function AccFirmOcrPage() {
  const { orgSlug } = useParams<{ orgSlug: string }>();
  const supabase = useMemo(() => createSupabaseBrowserClient(), []);

  // Workspace Auth/Context States
  const [orgId, setOrgId] = useState('');
  const [token, setToken] = useState('');

  // Data States
  const [jobs, setJobs] = useState<OcrJob[]>([]);
  const [clients, setClients] = useState<ClientOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [processingJobId, setProcessingJobId] = useState<string | null>(null);
  const [batchRunning, setBatchRunning] = useState(false);

  // Filters
  const [filterClient, setFilterClient] = useState('');
  const [filterStatus, setFilterStatus] = useState('');

  // Upload Dialog States
  const [uploadOpen, setUploadOpen] = useState(false);
  const [uploadClient, setUploadClient] = useState('');
  const [uploadFiles, setUploadFiles] = useState<File[]>([]);
  const [uploading, setUploading] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Review Workspace States
  const [activeJob, setActiveJob] = useState<OcrJob | null>(null);
  const [signedUrl, setSignedUrl] = useState<string | null>(null);
  const [loadingWorkspace, setLoadingWorkspace] = useState(false);
  const [clientContext, setClientContext] = useState<ClientContext | null>(null);
  const [reviewLocked, setReviewLocked] = useState(false);

  // Review Form States
  const [entryDate, setEntryDate] = useState('');
  const [referenceNumber, setReferenceNumber] = useState('');
  const [memo, setMemo] = useState('');
  const [lines, setLines] = useState<JournalLine[]>([]);
  const [savingDraft, setSavingDraft] = useState(false);
  const [postingLedger, setPostingLedger] = useState(false);

  // ── Fetch OCR Queue Jobs ─────────────────────────────────────────────────────
  const fetchJobs = useCallback(async (firmId: string, accessToken: string) => {
    setLoading(true);
    try {
      const res = await fetch(`/api/acc-firm/ocr/jobs?orgId=${firmId}`, {
        headers: { Authorization: `Bearer ${accessToken}` },
      });

      if (res.ok) {
        const payload = await res.json();
        const jobsList: OcrJob[] = payload?.data ?? payload ?? [];

        // Client names
        const { data: clientOrgs } = await supabase.from('organizations').select('id, name');
        const clientMap = new Map(clientOrgs?.map(c => [c.id, c.name]) ?? []);

        // Journal posting status for completed jobs (distinguish draft vs posted)
        const draftIds = jobsList.map(j => j.draft_journal_id).filter(Boolean) as string[];
        const journalMap = new Map<string, string>();
        if (draftIds.length > 0) {
          const { data: jes } = await supabase
            .from('journal_entries')
            .select('id, status')
            .in('id', draftIds);
          jes?.forEach(je => journalMap.set(je.id, je.status));
        }

        setJobs(jobsList.map(job => ({
          ...job,
          client_name: clientMap.get(job.client_org_id) || 'ไม่ทราบชื่อลูกค้า',
          journal_status: job.draft_journal_id ? journalMap.get(job.draft_journal_id) ?? null : null,
        })));
      }
    } catch {
      toast.error('ไม่สามารถโหลดข้อมูลคิวงาน OCR ได้');
    } finally {
      setLoading(false);
    }
  }, [supabase]);

  // ── Initialize ──────────────────────────────────────────────────────────────
  const init = useCallback(async () => {
    setLoading(true);
    const [{ data: org }, { data: sess }] = await Promise.all([
      supabase.from('organizations').select('id').eq('slug', orgSlug).single(),
      supabase.auth.getSession(),
    ]);

    if (!org || !sess.session) {
      setLoading(false);
      return;
    }

    const accessToken = sess.session.access_token;
    setOrgId(org.id);
    setToken(accessToken);

    const clientsRes = await fetch(`/api/acc-firm/clients?orgId=${org.id}`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    if (clientsRes.ok) {
      const json = await clientsRes.json();
      const clientList = (json.clients ?? json.data?.clients ?? []).map((c: any) => ({
        value: c.client_org.id,
        label: c.client_org.name,
      }));
      setClients(clientList);
    }

    await fetchJobs(org.id, accessToken);
  }, [supabase, orgSlug, fetchJobs]);

  useEffect(() => { init(); }, [init]);

  // ── Poll while jobs are active ────────────────────────────────────────────────
  useEffect(() => {
    const hasActiveJobs = jobs.some(j => j.status === 'pending' || j.status === 'processing');
    if (!hasActiveJobs || !orgId || !token) return;
    const interval = setInterval(() => { fetchJobs(orgId, token); }, 8000);
    return () => clearInterval(interval);
  }, [jobs, orgId, token, fetchJobs]);

  // ── Trigger / Retry AI Pipeline ───────────────────────────────────────────────
  const triggerProcess = useCallback(async (jobId: string): Promise<boolean> => {
    const res = await fetch('/api/acc-firm/ocr/jobs/process', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ jobId, firmOrgId: orgId }),
    });
    if (res.ok) return true;
    const err = await res.json().catch(() => null);
    toast.error(err?.error?.message || 'การส่งงานวิเคราะห์ล้มเหลว');
    return false;
  }, [token, orgId]);

  const handleProcess = async (jobId: string) => {
    setProcessingJobId(jobId);
    try {
      const okRes = await triggerProcess(jobId);
      if (okRes) toast.success('ส่งงานเข้าระบบวิเคราะห์แล้ว');
      await fetchJobs(orgId, token);
    } catch {
      toast.error('เกิดข้อผิดพลาดในการเรียกใช้ระบบวิเคราะห์');
    } finally {
      setProcessingJobId(null);
    }
  };

  const handleBatchProcess = async () => {
    const targets = jobs.filter(j => j.status === 'pending' || j.status === 'failed');
    if (targets.length === 0) return;
    setBatchRunning(true);
    try {
      for (const j of targets) {
        // eslint-disable-next-line no-await-in-loop
        await triggerProcess(j.id);
      }
      toast.success(`ส่งงานวิเคราะห์ ${targets.length} รายการเข้าระบบแล้ว`);
      await fetchJobs(orgId, token);
    } finally {
      setBatchRunning(false);
    }
  };

  // ── Upload flow ───────────────────────────────────────────────────────────────
  const addFiles = (incoming: FileList | File[]) => {
    const arr = Array.from(incoming).filter(f =>
      f.type.startsWith('image/') || f.type === 'application/pdf',
    );
    if (arr.length === 0) {
      toast.error('รองรับเฉพาะไฟล์รูปภาพหรือ PDF เท่านั้น');
      return;
    }
    setUploadFiles(prev => [...prev, ...arr]);
  };

  const handleUpload = async () => {
    if (!uploadClient) { toast.error('กรุณาเลือกบริษัทลูกค้า'); return; }
    if (uploadFiles.length === 0) { toast.error('กรุณาเลือกไฟล์เอกสาร'); return; }

    setUploading(true);
    let success = 0;
    try {
      for (const file of uploadFiles) {
        const path = `${uploadClient}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}-${safeFileName(file.name)}`;

        // eslint-disable-next-line no-await-in-loop
        const { error: upErr } = await supabase.storage
          .from('client_documents')
          .upload(path, file, { contentType: file.type, upsert: false });
        if (upErr) { toast.error(`อัปโหลด ${file.name} ล้มเหลว: ${upErr.message}`); continue; }

        // eslint-disable-next-line no-await-in-loop
        const jobRes = await fetch('/api/acc-firm/ocr/jobs', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
          body: JSON.stringify({ firmOrgId: orgId, clientOrgId: uploadClient, documentUrl: path }),
        });
        if (!jobRes.ok) {
          const e = await jobRes.json().catch(() => null);
          toast.error(`สร้างงานสำหรับ ${file.name} ล้มเหลว: ${e?.error?.message ?? ''}`);
          continue;
        }
        const created = await jobRes.json();
        const jobId = created?.data?.id ?? created?.id;

        // Auto-start the AI pipeline
        if (jobId) await triggerProcess(jobId); // eslint-disable-line no-await-in-loop
        success += 1;
      }

      if (success > 0) {
        toast.success(`อัปโหลดและเริ่มวิเคราะห์ ${success} เอกสารแล้ว`);
        setUploadOpen(false);
        setUploadFiles([]);
        setUploadClient('');
        await fetchJobs(orgId, token);
      }
    } finally {
      setUploading(false);
    }
  };

  // ── Open Review Workspace ─────────────────────────────────────────────────────
  const openReviewWorkspace = async (job: OcrJob) => {
    setActiveJob(job);
    setLoadingWorkspace(true);
    setSignedUrl(null);
    setClientContext(null);
    setReviewLocked(false);

    try {
      let storagePath = job.document_url;
      if (job.document_url.includes('/client_documents/')) {
        storagePath = job.document_url.split('/client_documents/')[1].split('?')[0];
      }
      const { data: signData } = await supabase.storage
        .from('client_documents')
        .createSignedUrl(storagePath, 3600);
      setSignedUrl(signData?.signedUrl || null);

      const contextRes = await fetch(
        `/api/acc-firm/ocr/client-context?firmOrgId=${orgId}&clientOrgId=${job.client_org_id}`,
        { headers: { Authorization: `Bearer ${token}` } },
      );
      if (!contextRes.ok) throw new Error('โหลดผังบัญชีลูกค้าล้มเหลว');
      const ctxPayload = await contextRes.json();
      const context: ClientContext = ctxPayload?.data ?? ctxPayload;
      setClientContext(context);

      if (job.draft_journal_id) {
        const { data: je } = await supabase
          .from('journal_entries')
          .select('entry_date, reference_number, memo, status')
          .eq('id', job.draft_journal_id)
          .single();

        // Posted / void entries are read-only — never allow re-edit.
        if (je && (je.status === 'posted' || je.status === 'void')) {
          setReviewLocked(true);
        }

        const { data: items } = await supabase
          .from('journal_items')
          .select('account_id, contact_id, debit, credit, description')
          .eq('journal_entry_id', job.draft_journal_id)
          .order('line_no');

        setEntryDate(je?.entry_date || '');
        setReferenceNumber(je?.reference_number || '');
        setMemo(je?.memo || '');

        if (items && items.length > 0) {
          setLines(items.map(item => ({
            accountId: String(item.account_id),
            contactId: item.contact_id ? String(item.contact_id) : '',
            debit: Number(item.debit) === 0 ? '' : String(item.debit),
            credit: Number(item.credit) === 0 ? '' : String(item.credit),
            description: item.description || '',
          })));
        } else {
          initializeFromAi(job, context);
        }
      } else {
        initializeFromAi(job, context);
      }
    } catch (e: any) {
      toast.error(e.message || 'ไม่สามารถโหลดข้อมูลตรวจทานได้');
      setActiveJob(null);
    } finally {
      setLoadingWorkspace(false);
    }
  };

  const initializeFromAi = (job: OcrJob, context: ClientContext) => {
    const aiJournal = job.classified_json?.journal;
    if (!aiJournal) {
      toast.error('ไม่พบข้อมูลสมุดรายวันจากระบบ AI แนะนำ');
      setLines([
        { accountId: '', contactId: '', debit: '', credit: '', description: '' },
        { accountId: '', contactId: '', debit: '', credit: '', description: '' },
      ]);
      return;
    }

    setEntryDate(aiJournal.posting_date || '');
    setReferenceNumber(aiJournal.document_ref || '');
    setMemo(aiJournal.description || '');

    const mappedLines: JournalLine[] = (aiJournal.entries || []).map((entry: any) => {
      const matchedAccount = context.chart_of_accounts.find(acc => acc.code === entry.account_code);
      return {
        accountId: matchedAccount?.id || '',
        contactId: '',
        debit: entry.debit === 0 ? '' : String(entry.debit),
        credit: entry.credit === 0 ? '' : String(entry.credit),
        description: entry.memo || '',
      };
    });
    setLines(mappedLines.length >= 2 ? mappedLines : [
      ...mappedLines,
      { accountId: '', contactId: '', debit: '', credit: '', description: '' },
    ]);
  };

  // ── Save or Post Journal ──────────────────────────────────────────────────────
  const saveOrPostJournal = async (post: boolean) => {
    if (!activeJob || !clientContext) return;
    if (!entryDate) { toast.error('กรุณาระบุวันที่บันทึกบัญชี'); return; }
    if (lines.length < 2) { toast.error('ต้องมีรายการเดบิต/เครดิตอย่างน้อย 2 แถว'); return; }

    const invalidLine = lines.some(l => !l.accountId || (!l.debit && !l.credit));
    if (invalidLine) {
      toast.error('กรุณาเลือกผังบัญชีและใส่จำนวนเงินในทุกแถวรายการ');
      return;
    }

    if (post) setPostingLedger(true); else setSavingDraft(true);
    try {
      const res = await fetch('/api/acc-firm/ocr/jobs/approve', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          jobId: activeJob.id,
          firmOrgId: orgId,
          entryDate,
          referenceNumber: referenceNumber || null,
          memo: memo || null,
          lines: lines.map(l => ({
            accountId: l.accountId,
            contactId: l.contactId || null,
            debit: Number(l.debit || 0),
            credit: Number(l.credit || 0),
            description: l.description || null,
          })),
          postToLedger: post,
        }),
      });

      const json = await res.json();
      if (res.ok) {
        toast.success(post ? 'อนุมัติลงสมุดรายวันแยกประเภทเสร็จสิ้น' : 'บันทึกสมุดรายวันร่างเรียบร้อย');
        setActiveJob(null);
        await fetchJobs(orgId, token);
      } else {
        toast.error(json.error?.message || 'การบันทึกรายการบัญชีล้มเหลว');
      }
    } catch {
      toast.error('เกิดข้อผิดพลาดทางเทคนิคในการส่งข้อมูลบันทึกบัญชี');
    } finally {
      setSavingDraft(false);
      setPostingLedger(false);
    }
  };

  // ── Derived ───────────────────────────────────────────────────────────────────
  const totals = useMemo(() => lines.reduce(
    (acc, l) => ({ debit: acc.debit + Number(l.debit || 0), credit: acc.credit + Number(l.credit || 0) }),
    { debit: 0, credit: 0 },
  ), [lines]);

  const diff = Math.abs(totals.debit - totals.credit);
  const isBalanced = diff < 0.01 && totals.debit > 0;
  const busy = savingDraft || postingLedger;

  const addLine = () => setLines([...lines, { accountId: '', contactId: '', debit: '', credit: '', description: '' }]);
  const removeLine = (index: number) => setLines(lines.filter((_, idx) => idx !== index));

  const handleLineChange = (index: number, field: keyof JournalLine, value: string) => {
    const nextLines = [...lines];
    if (field === 'debit' && value) nextLines[index].credit = '';
    else if (field === 'credit' && value) nextLines[index].debit = '';
    nextLines[index][field] = value;
    setLines(nextLines);
  };

  const filteredJobs = useMemo(() => jobs.filter(job => {
    const matchClient = filterClient ? job.client_org_id === filterClient : true;
    const matchStatus = filterStatus ? job.status === filterStatus : true;
    return matchClient && matchStatus;
  }), [jobs, filterClient, filterStatus]);

  const pendingCount = useMemo(
    () => jobs.filter(j => j.status === 'pending' || j.status === 'failed').length,
    [jobs],
  );

  const isPdf = signedUrl?.split('?')[0].toLowerCase().endsWith('.pdf')
    || activeJob?.document_url.split('?')[0].toLowerCase().endsWith('.pdf');

  return (
    <PageShell width="full">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-3">
          <Link href={`/${orgSlug}/acc-firm`}>
            <Button variant="ghost" size="icon" className="rounded-full">
              <ArrowLeft className="w-5 h-5 text-slate-600" />
            </Button>
          </Link>
          <div>
            <h1 className="text-xl font-bold text-slate-900 flex items-center gap-2">
              <Calculator className="w-5 h-5 text-teal-500" /> AI Bookkeeping Review
            </h1>
            <p className="text-sm text-slate-500">ตรวจรับเอกสารและตรวจสอบคู่บัญชีที่จัดสรรโดย AI OCR</p>
          </div>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          {pendingCount > 0 && (
            <Button onClick={handleBatchProcess} disabled={batchRunning} variant="outline" className="gap-2">
              {batchRunning ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4 text-teal-600" />}
              วิเคราะห์ทั้งหมด ({pendingCount})
            </Button>
          )}
          <Button onClick={() => setUploadOpen(true)} className="gap-2">
            <UploadCloud className="w-4 h-4" /> อัปโหลดเอกสาร
          </Button>
        </div>
      </div>

      {/* Filters Bar */}
      <div className="bg-slate-50 border rounded-xl p-4 flex flex-wrap gap-4 items-center">
        <div className="w-full sm:w-64 space-y-1">
          <Label className="text-xs text-slate-500">เลือกบริษัทลูกค้า</Label>
          <CustomSelect
            value={filterClient}
            onChange={setFilterClient}
            options={[{ value: '', label: 'ทุกบริษัทลูกค้า' }, ...clients]}
          />
        </div>
        <div className="w-full sm:w-48 space-y-1">
          <Label className="text-xs text-slate-500">สถานะคิวงาน</Label>
          <CustomSelect
            value={filterStatus}
            onChange={setFilterStatus}
            options={[
              { value: '', label: 'ทุกสถานะ' },
              { value: 'pending', label: 'รอดำเนินการ' },
              { value: 'processing', label: 'กำลังวิเคราะห์' },
              { value: 'completed', label: 'เสร็จสมบูรณ์' },
              { value: 'failed', label: 'ล้มเหลว' },
            ]}
          />
        </div>
      </div>

      {/* OCR Jobs Queue Table */}
      <div className="bg-white rounded-xl border">
        {loading && jobs.length === 0 ? (
          <div className="p-12 text-center text-slate-400 text-sm">
            <Loader2 className="w-8 h-8 animate-spin mx-auto text-slate-300 mb-3" />
            กำลังโหลดข้อมูลคิวงาน AI...
          </div>
        ) : filteredJobs.length === 0 ? (
          <div className="p-12 text-center text-slate-300 text-sm space-y-3">
            <FileText className="w-12 h-12 mx-auto text-slate-200" />
            <p className="font-medium text-slate-500">ยังไม่มีคิวงานประมวลผล OCR</p>
            <p className="text-xs text-slate-400">กดปุ่ม “อัปโหลดเอกสาร” ด้านบนเพื่อเริ่มวิเคราะห์บิล/ใบเสร็จด้วย AI</p>
            <Button onClick={() => setUploadOpen(true)} variant="outline" className="gap-2 mt-2">
              <UploadCloud className="w-4 h-4" /> อัปโหลดเอกสาร
            </Button>
          </div>
        ) : (
          <Table wrapperClassName="rounded-none border-0">
            <TableHeader>
              <TableRow>
                <TableHead>บริษัทลูกค้า</TableHead>
                <TableHead>ชื่อไฟล์เอกสาร</TableHead>
                <TableHead>วิเคราะห์โดย AI</TableHead>
                <TableHead>สถานะ</TableHead>
                <TableHead>วันที่อัปโหลด</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredJobs.map(job => {
                const fileName = job.document_url.split('/').pop()?.split('?')[0] || 'document';
                const isProcessing = processingJobId === job.id || job.status === 'processing';
                const amount = job.extracted_json?.amounts?.grand_total;
                const conf = confidenceChip(job.extracted_json?.confidence?.overall);
                const isPosted = job.journal_status === 'posted';
                const onRow = () => {
                  if (job.status === 'completed') openReviewWorkspace(job);
                  else if ((job.status === 'pending' || job.status === 'failed') && !isProcessing) handleProcess(job.id);
                };

                return (
                  <TableRow key={job.id} clickable onClick={onRow}>
                    <TableCell className="font-semibold text-slate-800">{job.client_name}</TableCell>
                    <TableCell className="max-w-[200px] truncate font-medium text-slate-600" title={fileName}>{fileName}</TableCell>
                    <TableCell>
                      {amount !== undefined && amount !== null ? (
                        <div className="flex items-center gap-2">
                          <span className="font-bold text-slate-800">฿{Number(amount).toLocaleString('th-TH', { minimumFractionDigits: 2 })}</span>
                          {conf && (
                            <span className={`whitespace-nowrap rounded-full border px-1.5 py-0.5 text-[10px] font-semibold ${conf.cls}`}>{conf.pct}%</span>
                          )}
                        </div>
                      ) : job.status === 'failed' ? (
                        <span className="flex items-center gap-1 text-xs text-red-500" title={job.error_message || undefined}>
                          <AlertCircle className="h-3.5 w-3.5 shrink-0" />
                          <span className="max-w-[180px] truncate">{job.error_message || 'เกิดข้อผิดพลาด'}</span>
                        </span>
                      ) : isProcessing ? (
                        <span className="flex items-center gap-1 text-xs italic text-slate-400"><Loader2 className="h-3 w-3 animate-spin" /> กำลังวิเคราะห์…</span>
                      ) : (
                        <span className="text-xs italic text-slate-400">คลิกเพื่อเริ่มวิเคราะห์ AI</span>
                      )}
                    </TableCell>
                    <TableCell>
                      {isPosted ? (
                        <StatusBadge tone="success"><Lock className="mr-1 h-3 w-3" /> ผ่านบัญชีแล้ว</StatusBadge>
                      ) : (
                        <StatusBadge tone={STATUS_TONE[job.status]}>
                          {job.status === 'processing' && <Loader2 className="mr-1 h-3 w-3 animate-spin" />}
                          {STATUS_TEXT[job.status]}
                        </StatusBadge>
                      )}
                    </TableCell>
                    <TableCell className="text-xs text-slate-400">{new Date(job.created_at).toLocaleString('th-TH')}</TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        )}
      </div>

      {/* ── Upload Dialog ─────────────────────────────────────────────────────── */}
      <Dialog open={uploadOpen} onOpenChange={v => { if (!uploading) { setUploadOpen(v); if (!v) { setUploadFiles([]); } } }}>
        <DialogContent size="lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <UploadCloud className="w-5 h-5 text-teal-500" /> อัปโหลดเอกสารเข้าระบบ AI
            </DialogTitle>
          </DialogHeader>

          <DialogBody>
          <div className="space-y-4">
            <div className="space-y-1">
              <Label className="text-xs text-slate-500">บริษัทลูกค้า *</Label>
              <CustomSelect
                value={uploadClient}
                onChange={setUploadClient}
                options={[{ value: '', label: '— เลือกบริษัทลูกค้า —' }, ...clients]}
              />
            </div>

            <div
              onDragOver={e => { e.preventDefault(); setDragOver(true); }}
              onDragLeave={() => setDragOver(false)}
              onDrop={e => { e.preventDefault(); setDragOver(false); addFiles(e.dataTransfer.files); }}
              onClick={() => fileInputRef.current?.click()}
              className={`border-2 border-dashed rounded-xl p-6 text-center cursor-pointer transition-colors ${dragOver ? 'border-teal-400 bg-teal-50' : 'border-slate-200 hover:border-teal-300 hover:bg-slate-50'}`}
            >
              <FileUp className="w-8 h-8 mx-auto text-slate-300 mb-2" />
              <p className="text-sm text-slate-600 font-medium">ลากไฟล์มาวาง หรือคลิกเพื่อเลือก</p>
              <p className="text-xs text-slate-400 mt-1">รองรับรูปภาพ (JPG/PNG/WebP) และ PDF · เลือกได้หลายไฟล์</p>
              <input
                ref={fileInputRef}
                type="file"
                accept={ACCEPT_TYPES}
                multiple
                className="hidden"
                onChange={e => { if (e.target.files) addFiles(e.target.files); e.target.value = ''; }}
              />
            </div>

            {uploadFiles.length > 0 && (
              <div className="space-y-1.5 max-h-44 overflow-y-auto">
                {uploadFiles.map((f, idx) => (
                  <div key={idx} className="flex items-center justify-between gap-2 bg-slate-50 border rounded-lg px-3 py-2 text-xs">
                    <span className="flex items-center gap-2 min-w-0">
                      <FileText className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                      <span className="truncate text-slate-700">{f.name}</span>
                    </span>
                    <button
                      type="button"
                      onClick={() => setUploadFiles(prev => prev.filter((_, i) => i !== idx))}
                      className="text-slate-400 hover:text-red-500 shrink-0"
                      aria-label="ลบไฟล์"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
          </DialogBody>

          <DialogFooter>
            <Button variant="outline" onClick={() => setUploadOpen(false)} disabled={uploading}>ยกเลิก</Button>
            <Button onClick={handleUpload} disabled={uploading || !uploadClient || uploadFiles.length === 0} className="gap-2">
              {uploading ? <Loader2 className="w-4 h-4 animate-spin" /> : <UploadCloud className="w-4 h-4" />}
              {uploading ? 'กำลังอัปโหลด…' : `อัปโหลด & วิเคราะห์${uploadFiles.length ? ` (${uploadFiles.length})` : ''}`}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Side-by-Side Review Dialog Workspace ───────────────────────────────── */}
      <Dialog open={!!activeJob} onOpenChange={v => { if (!v && !busy) setActiveJob(null); }}>
        <DialogContent size="full" className="h-[92vh] max-h-[92vh] bg-slate-900 border-slate-700">
          {/* Header */}
          <div className="bg-slate-800 border-b border-slate-700 px-6 py-4 flex items-center justify-between shrink-0">
            <div className="min-w-0">
              <DialogTitle className="text-white text-md font-bold flex items-center gap-2">
                <Calculator className="w-5 h-5 text-teal-400 shrink-0" />
                <span className="truncate">Review : {activeJob?.client_name}</span>
                {reviewLocked && (
                  <span className="text-[10px] bg-emerald-900/60 text-emerald-300 px-2 py-0.5 rounded border border-emerald-700 flex items-center gap-1">
                    <Lock className="w-3 h-3" /> ผ่านบัญชีแล้ว
                  </span>
                )}
              </DialogTitle>
              <p className="text-xs text-slate-400 mt-1 truncate">
                {activeJob?.document_url.split('/').pop()?.split('?')[0]}
              </p>
            </div>

            {activeJob?.extracted_json?.amounts?.grand_total != null && (
              <div className="bg-slate-900 border border-slate-700 rounded-lg px-4 py-1.5 text-right shrink-0">
                <span className="text-[10px] text-slate-500 block uppercase font-medium">ยอดเงินเอกสาร</span>
                <span className="text-teal-400 font-bold text-sm">
                  ฿{Number(activeJob.extracted_json.amounts.grand_total).toLocaleString('th-TH', { minimumFractionDigits: 2 })}
                </span>
              </div>
            )}
          </div>

          {loadingWorkspace ? (
            <div className="flex-1 flex flex-col items-center justify-center text-slate-400">
              <Loader2 className="w-10 h-10 animate-spin text-teal-400 mb-4" />
              <p className="text-sm">กำลังโหลดข้อมูลผังบัญชีลูกค้าและแบบฟอร์มตรวจทาน...</p>
            </div>
          ) : (
            <div className="flex-1 flex flex-col lg:flex-row min-h-0 divide-y lg:divide-y-0 lg:divide-x divide-slate-700">
              {/* LEFT: Document */}
              <div className="w-full lg:w-1/2 flex flex-col p-4 bg-slate-950 min-h-0">
                <div className="mb-2 shrink-0 flex items-center justify-between">
                  <span className="text-xs text-slate-400 font-bold flex items-center gap-1.5">
                    <FileText className="w-3.5 h-3.5" /> เอกสารต้นฉบับ
                  </span>
                  {activeJob?.extracted_json?.document_type && (
                    <span className="text-[10px] bg-slate-800 text-slate-300 px-2 py-0.5 rounded border border-slate-700 font-semibold uppercase">
                      AI Detected: {activeJob.extracted_json.document_type}
                    </span>
                  )}
                </div>
                <div className="flex-1 min-h-0 flex items-center justify-center bg-slate-900 border border-slate-800 rounded-xl overflow-hidden relative">
                  {signedUrl ? (
                    isPdf ? (
                      <iframe src={signedUrl} className="w-full h-full border-none" />
                    ) : (
                      <div className="w-full h-full overflow-auto flex items-center justify-center p-2">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={signedUrl} alt="Receipt doc" className="max-w-full max-h-full object-contain" />
                      </div>
                    )
                  ) : (
                    <span className="text-slate-500 text-xs italic">ไม่สามารถเปิดดูไฟล์เอกสารได้</span>
                  )}
                </div>
              </div>

              {/* RIGHT: Balancer */}
              <div className="w-full lg:w-1/2 flex flex-col bg-white min-h-0">
                <div className="flex-1 overflow-y-auto p-6 space-y-5">
                  {reviewLocked && (
                    <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-3.5 flex items-center gap-2 text-xs text-emerald-800 font-medium">
                      <Lock className="w-4 h-4 shrink-0" />
                      รายการนี้ผ่านบัญชีไปยังสมุดแยกประเภทแล้ว แสดงผลแบบอ่านอย่างเดียว
                    </div>
                  )}

                  {/* AI confidence */}
                  {(() => {
                    const conf = confidenceChip(activeJob?.extracted_json?.confidence?.overall);
                    if (!conf) return null;
                    return (
                      <div className="flex items-center gap-2 text-xs">
                        <Sparkles className="w-4 h-4 text-teal-500" />
                        <span className="text-slate-500">ความมั่นใจของ AI ในการอ่านเอกสาร:</span>
                        <span className={`px-2 py-0.5 rounded-full border font-semibold ${conf.cls}`}>{conf.pct}%</span>
                      </div>
                    );
                  })()}

                  {/* Warnings */}
                  {(activeJob?.extracted_json?.warnings?.length ?? 0) > 0 && (
                    <div className="bg-amber-50 border border-amber-200 rounded-xl p-3.5 space-y-1.5">
                      <span className="text-xs text-amber-800 font-bold flex items-center gap-1.5">
                        <AlertTriangle className="w-4 h-4" /> ข้อควรพิจารณาจากระบบวิเคราะห์:
                      </span>
                      <ul className="list-disc pl-5 text-xs text-amber-700 space-y-0.5 font-medium">
                        {activeJob?.extracted_json?.warnings?.map((w: string, idx: number) => <li key={idx}>{w}</li>)}
                      </ul>
                    </div>
                  )}

                  {/* Header fields */}
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4 border-b pb-4">
                    <div className="space-y-1">
                      <Label className="text-xs text-slate-500">วันที่บันทึกบัญชี *</Label>
                      <ThaiDatePicker value={entryDate} onChange={setEntryDate} placeholder="เลือกวันที่" />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs text-slate-500">เลขที่อ้างอิงเอกสาร</Label>
                      <Input value={referenceNumber} onChange={e => setReferenceNumber(e.target.value)} placeholder="เช่น INV-2026-001" className="h-9" disabled={reviewLocked} />
                    </div>
                    <div className="space-y-1 md:col-span-3">
                      <Label className="text-xs text-slate-500">คำอธิบายรายการสมุดบัญชี (Memo)</Label>
                      <Input value={memo} onChange={e => setMemo(e.target.value)} placeholder="เช่น จ่ายค่าวัสดุและอุปกรณ์สิ้นเปลือง" className="h-9" disabled={reviewLocked} />
                    </div>
                  </div>

                  {/* Lines */}
                  <div className="space-y-3">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-bold text-slate-700 flex items-center gap-1.5">
                        <BookOpen className="w-4 h-4 text-slate-400" /> บรรทัดรายการบัญชีคู่
                      </span>
                      {!reviewLocked && (
                        <Button type="button" size="sm" variant="outline" onClick={addLine} className="gap-1 h-7 text-xs text-teal-700 border-teal-200 hover:bg-teal-50">
                          <Plus className="w-3.5 h-3.5" /> เพิ่มแถวรายการ
                        </Button>
                      )}
                    </div>

                    <div className="border rounded-xl overflow-hidden bg-slate-50">
                      <div className="overflow-x-auto">
                        <table className="w-full text-xs">
                          <thead className="bg-slate-100 border-b text-[10px] text-slate-500 uppercase tracking-wider font-semibold">
                            <tr>
                              <th className="text-left px-3 py-2 w-1/3">ผังบัญชี *</th>
                              <th className="text-left px-3 py-2 w-1/4">ผู้ติดต่อ</th>
                              <th className="text-right px-3 py-2 w-20">เดบิต (Dr)</th>
                              <th className="text-right px-3 py-2 w-20">เครดิต (Cr)</th>
                              <th className="text-left px-3 py-2">คำอธิบาย</th>
                              <th className="w-8" />
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-slate-100 bg-white">
                            {lines.map((line, idx) => (
                              <tr key={idx} className="hover:bg-slate-50/50">
                                <td className="p-2">
                                  <CustomSelect
                                    value={line.accountId}
                                    onChange={v => handleLineChange(idx, 'accountId', v)}
                                    options={[
                                      { value: '', label: '— เลือกบัญชี —' },
                                      ...(clientContext?.chart_of_accounts.map(acc => ({ value: acc.id, label: `${acc.code} · ${acc.name}` })) || []),
                                    ]}
                                    className="w-full h-8"
                                  />
                                </td>
                                <td className="p-2">
                                  <CustomSelect
                                    value={line.contactId}
                                    onChange={v => handleLineChange(idx, 'contactId', v)}
                                    options={[
                                      { value: '', label: '— ไม่มี —' },
                                      ...(clientContext?.contacts.map(c => ({ value: c.id, label: c.name })) || []),
                                    ]}
                                    className="w-full h-8"
                                  />
                                </td>
                                <td className="p-2">
                                  <Input
                                    type="number" value={line.debit}
                                    onChange={e => handleLineChange(idx, 'debit', e.target.value)}
                                    placeholder="0.00" disabled={reviewLocked}
                                    className="text-right font-medium h-8 p-1.5 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                                  />
                                </td>
                                <td className="p-2">
                                  <Input
                                    type="number" value={line.credit}
                                    onChange={e => handleLineChange(idx, 'credit', e.target.value)}
                                    placeholder="0.00" disabled={reviewLocked}
                                    className="text-right font-medium h-8 p-1.5 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                                  />
                                </td>
                                <td className="p-2">
                                  <Input value={line.description} onChange={e => handleLineChange(idx, 'description', e.target.value)} placeholder="ใส่คำอธิบายย่อย..." className="h-8" disabled={reviewLocked} />
                                </td>
                                <td className="p-2 text-center">
                                  {!reviewLocked && lines.length > 2 && (
                                    <Button type="button" size="icon" variant="ghost" onClick={() => removeLine(idx)} className="h-7 w-7 text-red-500 hover:text-red-700 hover:bg-red-50">
                                      <Trash2 className="w-3.5 h-3.5" />
                                    </Button>
                                  )}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>

                      {/* Summary */}
                      <div className="bg-slate-100 border-t p-3 text-xs flex flex-wrap gap-4 justify-between items-center">
                        <div className="flex gap-4">
                          <div>
                            <span className="text-slate-500 block text-[9px] uppercase font-medium">เดบิตรวม</span>
                            <span className="font-bold text-slate-800">฿{totals.debit.toLocaleString('th-TH', { minimumFractionDigits: 2 })}</span>
                          </div>
                          <div>
                            <span className="text-slate-500 block text-[9px] uppercase font-medium">เครดิตรวม</span>
                            <span className="font-bold text-slate-800">฿{totals.credit.toLocaleString('th-TH', { minimumFractionDigits: 2 })}</span>
                          </div>
                        </div>
                        <div className="flex items-center gap-2 flex-wrap">
                          {!isBalanced && totals.debit > 0 && (
                            <span className="text-red-500 font-semibold bg-red-50 px-2 py-0.5 rounded border border-red-100 flex items-center gap-1 text-[10px]">
                              <AlertTriangle className="w-3.5 h-3.5" /> ไม่สมดุล (ต่างกัน ฿{diff.toFixed(2)})
                            </span>
                          )}
                          {isBalanced && (
                            <span className="text-green-700 font-semibold bg-green-50 px-2 py-0.5 rounded border border-green-100 flex items-center gap-1 text-[10px]">
                              <CheckCircle2 className="w-3.5 h-3.5" /> บัญชีสมดุลแล้ว
                            </span>
                          )}
                          {isBalanced && activeJob?.extracted_json?.amounts?.grand_total != null && (() => {
                            const grandTotal = Number(activeJob?.extracted_json?.amounts?.grand_total || 0);
                            if (Math.abs(totals.debit - grandTotal) < 0.01) return null;
                            return (
                              <span className="text-amber-600 font-semibold bg-amber-50 px-2 py-0.5 rounded border border-amber-100 flex items-center gap-1 text-[10px]">
                                <AlertTriangle className="w-3.5 h-3.5" /> ยอดไม่ตรงกับเอกสาร (฿{grandTotal.toLocaleString('th-TH', { minimumFractionDigits: 2 })})
                              </span>
                            );
                          })()}
                        </div>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Footer */}
                <div className="bg-slate-50 border-t p-4 flex gap-3 shrink-0 items-center justify-between">
                  <Button variant="outline" onClick={() => setActiveJob(null)} disabled={busy}>
                    {reviewLocked ? 'ปิด' : 'ปิดการตรวจทาน'}
                  </Button>
                  {!reviewLocked && (
                    <div className="flex gap-2.5">
                      <Button variant="secondary" onClick={() => saveOrPostJournal(false)} disabled={busy} className="gap-1.5">
                        {savingDraft ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : null}
                        บันทึกร่าง
                      </Button>
                      <Button
                        onClick={() => saveOrPostJournal(true)}
                        disabled={busy || !isBalanced}
                        className="gap-1.5 bg-gradient-to-r from-teal-500 to-emerald-600 hover:from-teal-600 hover:to-emerald-700 border-none text-white font-semibold shadow-sm"
                      >
                        {postingLedger ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : null}
                        อนุมัติ & ผ่านบัญชี
                      </Button>
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </PageShell>
  );
}
