'use client';

import { useEffect, useState, useCallback, useMemo } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { createSupabaseBrowserClient } from '@/lib/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { CustomSelect } from '@/components/ui/custom-select';
import { ThaiDatePicker } from '@/components/ui/thai-date-picker';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import {
  Calculator, RefreshCw, AlertTriangle, FileText, CheckCircle2,
  Trash2, Plus, ArrowLeft, Loader2, Play, BookOpen, AlertCircle
} from 'lucide-react';
import { toast } from 'react-hot-toast';

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
const STATUS_BADGE: Record<string, string> = {
  pending: 'bg-blue-50 text-blue-700 border-blue-100',
  processing: 'bg-amber-50 text-amber-700 border-amber-100 animate-pulse',
  completed: 'bg-green-50 text-green-700 border-green-100',
  failed: 'bg-red-50 text-red-700 border-red-100',
};

const STATUS_TEXT: Record<string, string> = {
  pending: 'รอดำเนินการ',
  processing: 'กำลังวิเคราะห์',
  completed: 'เสร็จสมบูรณ์',
  failed: 'ล้มเหลว',
};

export default function AccFirmOcrPage() {
  const { orgSlug } = useParams<{ orgSlug: string }>();
  const router = useRouter();
  const supabase = useMemo(() => createSupabaseBrowserClient(), []);

  // Workspace Auth/Context States
  const [orgId, setOrgId] = useState('');
  const [token, setToken] = useState('');
  
  // Data States
  const [jobs, setJobs] = useState<OcrJob[]>([]);
  const [clients, setClients] = useState<ClientOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [processingJobId, setProcessingJobId] = useState<string | null>(null);

  // Filters
  const [filterClient, setFilterClient] = useState('');
  const [filterStatus, setFilterStatus] = useState('');

  // Dialog & Review Workspace States
  const [activeJob, setActiveJob] = useState<OcrJob | null>(null);
  const [signedUrl, setSignedUrl] = useState<string | null>(null);
  const [loadingWorkspace, setLoadingWorkspace] = useState(false);
  const [clientContext, setClientContext] = useState<ClientContext | null>(null);
  
  // Review Form States
  const [entryDate, setEntryDate] = useState('');
  const [referenceNumber, setReferenceNumber] = useState('');
  const [memo, setMemo] = useState('');
  const [lines, setLines] = useState<JournalLine[]>([]);
  const [savingDraft, setSavingDraft] = useState(false);
  const [postingLedger, setPostingLedger] = useState(false);

  // ── 2. Fetch OCR Queue Jobs ─────────────────────────────────────────────────
  const fetchJobs = useCallback(async (firmId: string, accessToken: string) => {
    setLoading(true);
    try {
      const res = await fetch(`/api/acc-firm/ocr/jobs?orgId=${firmId}`, {
        headers: { Authorization: `Bearer ${accessToken}` },
      });

      if (res.ok) {
        const jobsList: OcrJob[] = await res.json();
        
        // Fetch client names to display nicely in the table
        const { data: clientOrgs } = await supabase
          .from('organizations')
          .select('id, name');
          
        const clientMap = new Map(clientOrgs?.map(c => [c.id, c.name]) ?? []);
        
        const enriched = jobsList.map(job => ({
          ...job,
          client_name: clientMap.get(job.client_org_id) || 'ไม่ทราบชื่อลูกค้า',
        }));
        
        setJobs(enriched);
      }
    } catch (err) {
      toast.error('ไม่สามารถโหลดข้อมูลคิวงาน OCR ได้');
    } finally {
      setLoading(false);
    }
  }, [supabase]);

  // ── 1. Initialize & Fetch Firm Metadata ─────────────────────────────────────
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

    // Fetch clients
    const clientsRes = await fetch(`/api/acc-firm/clients?orgId=${org.id}`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });

    if (clientsRes.ok) {
      const json = await clientsRes.json();
      const clientList = (json.clients ?? []).map((c: any) => ({
        value: c.client_org.id,
        label: c.client_org.name,
      }));
      setClients(clientList);
    }

    await fetchJobs(org.id, accessToken);
  }, [supabase, orgSlug, fetchJobs]);

  useEffect(() => {
    init();
  }, [init]);

  // ── 3. Queue Polling when Pending/Processing Jobs Exist ─────────────────────
  useEffect(() => {
    const hasActiveJobs = jobs.some(j => j.status === 'pending' || j.status === 'processing');
    if (!hasActiveJobs || !orgId || !token) return;

    const interval = setInterval(() => {
      fetchJobs(orgId, token);
    }, 10000);

    return () => clearInterval(interval);
  }, [jobs, orgId, token, fetchJobs]);

  // ── 4. Trigger / Retry AI Pipeline ──────────────────────────────────────────
  const handleProcess = async (jobId: string) => {
    setProcessingJobId(jobId);
    try {
      const res = await fetch('/api/acc-firm/ocr/jobs/process', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({ jobId, firmOrgId: orgId }),
      });

      if (res.ok) {
        toast.success('วิเคราะห์เอกสารและตั้งค่าคู่บัญชีเรียบร้อยแล้ว');
        fetchJobs(orgId, token);
      } else {
        const err = await res.json();
        toast.error(err.error?.message || 'การวิเคราะห์เอกสารล้มเหลว');
        fetchJobs(orgId, token);
      }
    } catch (e) {
      toast.error('เกิดข้อผิดพลาดในการเรียกใช้ระบบวิเคราะห์');
    } finally {
      setProcessingJobId(null);
    }
  };

  // ── 5. Open Review Workspace & Pre-populate Data ────────────────────────────
  const openReviewWorkspace = async (job: OcrJob) => {
    setActiveJob(job);
    setLoadingWorkspace(true);
    setSignedUrl(null);
    setClientContext(null);

    try {
      // 1. Get signed URL for the document from Supabase storage
      let storagePath = job.document_url;
      if (job.document_url.includes('/client_documents/')) {
        storagePath = job.document_url.split('/client_documents/')[1].split('?')[0];
      }

      const { data: signData } = await supabase
        .storage
        .from('client_documents')
        .createSignedUrl(storagePath, 3600);
        
      setSignedUrl(signData?.signedUrl || null);

      // 2. Fetch Client COA and Contacts Context
      const contextRes = await fetch(
        `/api/acc-firm/ocr/client-context?firmOrgId=${orgId}&clientOrgId=${job.client_org_id}`,
        { headers: { Authorization: `Bearer ${token}` } }
      );

      if (!contextRes.ok) throw new Error('โหลดผังบัญชีลูกค้าล้มเหลว');
      const context: ClientContext = await contextRes.json();
      setClientContext(context);

      // 3. Load Draft Journal Entry or Initialize from AI classified suggestions
      if (job.draft_journal_id) {
        // Query journal entry and items
        const { data: je } = await supabase
          .from('journal_entries')
          .select('entry_date, reference_number, memo')
          .eq('id', job.draft_journal_id)
          .single();

        const { data: items } = await supabase
          .from('journal_items')
          .select('account_id, contact_id, debit, credit, description')
          .eq('journal_entry_id', job.draft_journal_id)
          .order('line_no');

        setEntryDate(je?.entry_date || '');
        setReferenceNumber(je?.reference_number || '');
        setMemo(je?.memo || '');
        
        if (items && items.length > 0) {
          setLines(
            items.map(item => ({
              accountId: String(item.account_id),
              contactId: item.contact_id ? String(item.contact_id) : '',
              debit: Number(item.debit) === 0 ? '' : String(item.debit),
              credit: Number(item.credit) === 0 ? '' : String(item.credit),
              description: item.description || '',
            }))
          );
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
      setLines([{ accountId: '', contactId: '', debit: '', credit: '', description: '' }]);
      return;
    }

    setEntryDate(aiJournal.posting_date || '');
    setReferenceNumber(aiJournal.document_ref || '');
    setMemo(aiJournal.description || '');

    // Map AI recommended account codes to actual account UUIDs
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

    setLines(mappedLines);
  };

  // ── 6. Save or Post Double-Entry Journal ────────────────────────────────────
  const saveOrPostJournal = async (post: boolean) => {
    if (!activeJob || !clientContext) return;
    
    // Validations
    if (!entryDate) { toast.error('กรุณาระบุวันที่บันทึกบัญชี'); return; }
    if (lines.length < 2) { toast.error('ต้องมีรายการเดบิต/เครดิตอย่างน้อย 2 แถว'); return; }

    const invalidLine = lines.some(l => !l.accountId || (!l.debit && !l.credit));
    if (invalidLine) {
      toast.error('กรุณาเลือกผังบัญชีและใส่จำนวนเงินในทุกแถวรายการ');
      return;
    }

    if (post) setPostingLedger(true);
    else setSavingDraft(true);

    try {
      const res = await fetch('/api/acc-firm/ocr/jobs/approve', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
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
            description: l.description || null
          })),
          postToLedger: post
        }),
      });

      const json = await res.json();
      if (res.ok) {
        toast.success(post ? 'อนุมัติลงสมุดรายวันแยกประเภทเสร็จสิ้น' : 'บันทึกสมุดรายวันร่างเรียบร้อย');
        setActiveJob(null);
        fetchJobs(orgId, token);
      } else {
        toast.error(json.error?.message || 'การบันทึกรายการบัญชีล้มเหลว');
      }
    } catch (e) {
      toast.error('เกิดข้อผิดพลาดทางเทคนิคในการส่งข้อมูลบันทึกบัญชี');
    } finally {
      setSavingDraft(false);
      setPostingLedger(false);
    }
  };

  // ── 7. Review Table Calculations ────────────────────────────────────────────
  const totals = useMemo(() => {
    return lines.reduce(
      (acc, l) => ({
        debit: acc.debit + Number(l.debit || 0),
        credit: acc.credit + Number(l.credit || 0),
      }),
      { debit: 0, credit: 0 }
    );
  }, [lines]);

  const diff = Math.abs(totals.debit - totals.credit);
  const isBalanced = diff < 0.01 && totals.debit > 0;

  // ── 8. Form Row Actions ─────────────────────────────────────────────────────
  const addLine = () => {
    setLines([...lines, { accountId: '', contactId: '', debit: '', credit: '', description: '' }]);
  };

  const removeLine = (index: number) => {
    setLines(lines.filter((_, idx) => idx !== index));
  };

  const handleLineChange = (index: number, field: keyof JournalLine, value: string) => {
    const nextLines = [...lines];
    
    if (field === 'debit' && value) {
      nextLines[index].credit = ''; // Mutually exclusive
    } else if (field === 'credit' && value) {
      nextLines[index].debit = ''; // Mutually exclusive
    }

    nextLines[index][field] = value;
    setLines(nextLines);
  };

  // ── 9. Filter Options ────────────────────────────────────────────────────────
  const filteredJobs = useMemo(() => {
    return jobs.filter(job => {
      const matchClient = filterClient ? job.client_org_id === filterClient : true;
      const matchStatus = filterStatus ? job.status === filterStatus : true;
      return matchClient && matchStatus;
    });
  }, [jobs, filterClient, filterStatus]);

  // Document Type Detector
  const isPdf = signedUrl?.split('?')[0].toLowerCase().endsWith('.pdf') || activeJob?.document_url.split('?')[0].toLowerCase().endsWith('.pdf');

  return (
    <div className="p-4 md:p-6 space-y-6">
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

        <Button onClick={() => fetchJobs(orgId, token)} disabled={loading} variant="outline" className="gap-2 shrink-0">
          <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          {loading ? 'กำลังรีเฟรช…' : 'รีเฟรชข้อมูล'}
        </Button>
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
            <p className="font-medium">ไม่พบคิวงานประมวลผล OCR ที่ตรงกับเงื่อนไข</p>
            <p className="text-xs text-slate-400">อัปโหลดเอกสารบิลหรือ PDF จากหน้าประมวลผลระบบลูกค้า</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 border-b text-xs text-slate-500">
                <tr>
                  <th className="text-left px-5 py-3 font-medium">บริษัทลูกค้า</th>
                  <th className="text-left px-5 py-3 font-medium">ชื่อไฟล์เอกสาร</th>
                  <th className="text-left px-5 py-3 font-medium">วิเคราะห์โดย AI</th>
                  <th className="text-left px-5 py-3 font-medium">สถานะ</th>
                  <th className="text-left px-5 py-3 font-medium">วันที่อัปโหลด</th>
                  <th className="px-5 py-3 text-right" />
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredJobs.map(job => {
                  const fileName = job.document_url.split('/').pop()?.split('?')[0] || 'document';
                  const isProcessing = processingJobId === job.id || job.status === 'processing';
                  const amount = job.extracted_json?.amounts?.grand_total;
                  
                  return (
                    <tr key={job.id} className="hover:bg-slate-50/80 transition-colors">
                      <td className="px-5 py-4">
                        <p className="font-semibold text-slate-800">{job.client_name}</p>
                      </td>
                      <td className="px-5 py-4 max-w-[200px] truncate">
                        <span className="text-slate-600 font-medium">{fileName}</span>
                      </td>
                      <td className="px-5 py-4">
                        {amount !== undefined && amount !== null ? (
                          <span className="font-bold text-slate-800">฿{Number(amount).toLocaleString('th-TH', { minimumFractionDigits: 2 })}</span>
                        ) : job.status === 'failed' ? (
                          <span className="text-red-500 text-xs flex items-center gap-1">
                            <AlertCircle className="w-3.5 h-3.5" /> เกิดข้อผิดพลาด
                          </span>
                        ) : (
                          <span className="text-slate-400 italic text-xs">รอการประมวลผล</span>
                        )}
                      </td>
                      <td className="px-5 py-4">
                        <span className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold border ${STATUS_BADGE[job.status]}`}>
                          {job.status === 'processing' && <Loader2 className="w-3 h-3 animate-spin" />}
                          {STATUS_TEXT[job.status]}
                        </span>
                      </td>
                      <td className="px-5 py-4 text-xs text-slate-400">
                        {new Date(job.created_at).toLocaleString('th-TH')}
                      </td>
                      <td className="px-5 py-4 text-right">
                        <div className="flex justify-end gap-2">
                          {(job.status === 'pending' || job.status === 'failed') && (
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => handleProcess(job.id)}
                              disabled={isProcessing}
                              className="gap-1.5 text-xs text-teal-700 hover:bg-teal-50 border-teal-200"
                            >
                              {isProcessing ? (
                                <Loader2 className="w-3 h-3 animate-spin" />
                              ) : (
                                <Play className="w-3 h-3 fill-current" />
                              )}
                              เริ่มวิเคราะห์ AI
                            </Button>
                          )}
                          
                          {job.status === 'completed' && (
                            <Button
                              size="sm"
                              onClick={() => openReviewWorkspace(job)}
                              className="gap-1.5 text-xs"
                            >
                              <BookOpen className="w-3 h-3" />
                              ตรวจทาน & บันทึก
                            </Button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* ── Side-by-Side Review Dialog Workspace ───────────────────────────────── */}
      <Dialog open={!!activeJob} onOpenChange={v => { if (!v && !savingDraft && !postingLedger) setActiveJob(null); }}>
        <DialogContent className="max-w-[95vw] w-[95vw] h-[92vh] max-h-[92vh] flex flex-col p-0 overflow-hidden bg-slate-900 border-none rounded-xl">
          {/* Header Workspace */}
          <div className="bg-slate-800 border-b border-slate-700 px-6 py-4 flex items-center justify-between shrink-0">
            <div>
              <DialogTitle className="text-white text-md font-bold flex items-center gap-2">
                <Calculator className="w-5 h-5 text-teal-400" />
                Review Workspace : {activeJob?.client_name}
              </DialogTitle>
              <p className="text-xs text-slate-400 mt-1">
                ตรวจทานภาพต้นฉบับกับสมุดรายวันร่างที่ AI แนะนำ และอนุมัติการผ่านบัญชีไปยัง Ledger
              </p>
            </div>
            
            {activeJob?.extracted_json?.amounts?.grand_total && (
              <div className="bg-slate-900 border border-slate-700 rounded-lg px-4 py-1.5 text-right shrink-0">
                <span className="text-[10px] text-slate-500 block uppercase font-medium">ยอดเงินเอกสาร</span>
                <span className="text-teal-400 font-bold text-sm">
                  ฿{Number(activeJob.extracted_json.amounts.grand_total).toLocaleString('th-TH', { minimumFractionDigits: 2 })}
                </span>
              </div>
            )}
          </div>

          {/* Body Split view Workspace */}
          {loadingWorkspace ? (
            <div className="flex-1 flex flex-col items-center justify-center text-slate-400">
              <Loader2 className="w-10 h-10 animate-spin text-teal-400 mb-4" />
              <p className="text-sm">กำลังโหลดข้อมูลผังบัญชีลูกค้าและแบบฟอร์มตรวจทาน...</p>
            </div>
          ) : (
            <div className="flex-1 flex flex-col lg:flex-row min-h-0 divide-y lg:divide-y-0 lg:divide-x divide-slate-700">
              
              {/* LEFT SIDE: Original Document Viewer */}
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
                        <img src={signedUrl} alt="Receipt doc" className="max-w-full max-h-full object-contain" />
                      </div>
                    )
                  ) : (
                    <span className="text-slate-500 text-xs italic">ไม่สามารถเปิดดูไฟล์เอกสารได้</span>
                  )}
                </div>
              </div>

              {/* RIGHT SIDE: Balancer Form Workspace */}
              <div className="w-full lg:w-1/2 flex flex-col bg-white min-h-0">
                {/* Scrollable Form Panel */}
                <div className="flex-1 overflow-y-auto p-6 space-y-5">
                  
                  {/* AI Warnings / Mathematical Checks */}
                  {activeJob?.extracted_json?.warnings && activeJob.extracted_json.warnings.length > 0 && (
                    <div className="bg-amber-50 border border-amber-200 rounded-xl p-3.5 space-y-1.5">
                      <span className="text-xs text-amber-800 font-bold flex items-center gap-1.5 shrink-0">
                        <AlertTriangle className="w-4 h-4" /> ข้อควรพิจารณาจากระบบวิเคราะห์:
                      </span>
                      <ul className="list-disc pl-5 text-xs text-amber-700 space-y-0.5 font-medium">
                        {activeJob.extracted_json.warnings.map((w: string, idx: number) => (
                          <li key={idx}>{w}</li>
                        ))}
                      </ul>
                    </div>
                  )}

                  {/* General Journal Details */}
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4 border-b pb-4">
                    <div className="space-y-1">
                      <Label className="text-xs text-slate-500">วันที่บันทึกบัญชี *</Label>
                      <ThaiDatePicker value={entryDate} onChange={setEntryDate} placeholder="เลือกวันที่" />
                    </div>
                    
                    <div className="space-y-1">
                      <Label className="text-xs text-slate-500">เลขที่อ้างอิงเอกสาร</Label>
                      <Input
                        value={referenceNumber}
                        onChange={e => setReferenceNumber(e.target.value)}
                        placeholder="เช่น INV-2026-001"
                        className="h-9"
                      />
                    </div>
                    
                    <div className="space-y-1 md:col-span-3">
                      <Label className="text-xs text-slate-500">คำอธิบายรายการสมุดบัญชี (Memo)</Label>
                      <Input
                        value={memo}
                        onChange={e => setMemo(e.target.value)}
                        placeholder="เช่น จ่ายค่าวัสดุและอุปกรณ์สิ้นเปลือง"
                        className="h-9"
                      />
                    </div>
                  </div>

                  {/* Balancer Lines Table */}
                  <div className="space-y-3">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-bold text-slate-700 flex items-center gap-1.5">
                        <BookOpen className="w-4 h-4 text-slate-400" /> บรรทัดรายการบัญชีคู่
                      </span>
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        onClick={addLine}
                        className="gap-1 h-7 text-xs text-teal-700 border-teal-200 hover:bg-teal-50"
                      >
                        <Plus className="w-3.5 h-3.5" />
                        เพิ่มแถวรายการ
                      </Button>
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
                                      ...(clientContext?.chart_of_accounts.map(acc => ({
                                        value: acc.id,
                                        label: `${acc.code} · ${acc.name}`,
                                      })) || []),
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
                                      ...(clientContext?.contacts.map(c => ({
                                        value: c.id,
                                        label: c.name,
                                      })) || []),
                                    ]}
                                    className="w-full h-8"
                                  />
                                </td>
                                <td className="p-2">
                                  <Input
                                    type="number"
                                    value={line.debit}
                                    onChange={e => handleLineChange(idx, 'debit', e.target.value)}
                                    placeholder="0.00"
                                    className="text-right font-medium h-8 p-1.5 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                                  />
                                </td>
                                <td className="p-2">
                                  <Input
                                    type="number"
                                    value={line.credit}
                                    onChange={e => handleLineChange(idx, 'credit', e.target.value)}
                                    placeholder="0.00"
                                    className="text-right font-medium h-8 p-1.5 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                                  />
                                </td>
                                <td className="p-2">
                                  <Input
                                    value={line.description}
                                    onChange={e => handleLineChange(idx, 'description', e.target.value)}
                                    placeholder="ใส่คำอธิบายย่อย..."
                                    className="h-8"
                                  />
                                </td>
                                <td className="p-2 text-center">
                                  {lines.length > 2 && (
                                    <Button
                                      type="button"
                                      size="icon"
                                      variant="ghost"
                                      onClick={() => removeLine(idx)}
                                      className="h-7 w-7 text-red-500 hover:text-red-700 hover:bg-red-50"
                                    >
                                      <Trash2 className="w-3.5 h-3.5" />
                                    </Button>
                                  )}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>

                      {/* Summary calculations Row */}
                      <div className="bg-slate-100 border-t p-3 text-xs flex flex-wrap gap-4 justify-between items-center shrink-0">
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
                            <span className="text-green-700 font-semibold bg-green-50 px-2 py-0.5 rounded border border-green-100 flex items-center gap-1 text-[10px] shrink-0">
                              <CheckCircle2 className="w-3.5 h-3.5" /> บัญชีสมดุลแล้ว
                            </span>
                          )}

                          {isBalanced && activeJob?.extracted_json?.amounts?.grand_total !== undefined && activeJob.extracted_json.amounts.grand_total !== null && (
                            (() => {
                              const grandTotal = Number(activeJob.extracted_json.amounts.grand_total || 0);
                              const match = Math.abs(totals.debit - grandTotal) < 0.01;
                              if (!match) {
                                return (
                                  <span className="text-amber-600 font-semibold bg-amber-50 px-2 py-0.5 rounded border border-amber-100 flex items-center gap-1 text-[10px]">
                                    <AlertTriangle className="w-3.5 h-3.5" /> ยอดเดบิต/เครดิตไม่ตรงกับยอดเงินสุทธิในเอกสาร (ยอดในเอกสาร: ฿{grandTotal.toLocaleString('th-TH', { minimumFractionDigits: 2 })})
                                  </span>
                                );
                              }
                              return null;
                            })()
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Footer Controls */}
                <div className="bg-slate-50 border-t p-4 flex gap-3 shrink-0 items-center justify-between">
                  <Button
                    variant="outline"
                    onClick={() => setActiveJob(null)}
                    disabled={savingDraft || postingLedger}
                  >
                    ปิดการตรวจทาน
                  </Button>

                  <div className="flex gap-2.5">
                    <Button
                      variant="secondary"
                      onClick={() => saveOrPostJournal(false)}
                      disabled={savingDraft || postingLedger}
                      className="gap-1.5"
                    >
                      {savingDraft ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : null}
                      บันทึกร่าง
                    </Button>

                    <Button
                      onClick={() => saveOrPostJournal(true)}
                      disabled={savingDraft || postingLedger || !isBalanced}
                      className="gap-1.5 bg-gradient-to-r from-teal-500 to-emerald-600 hover:from-teal-600 hover:to-emerald-700 border-none text-white font-semibold shadow-sm"
                    >
                      {postingLedger ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : null}
                      อนุมัติ & ผ่านบัญชี
                    </Button>
                  </div>
                </div>

              </div>

            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
