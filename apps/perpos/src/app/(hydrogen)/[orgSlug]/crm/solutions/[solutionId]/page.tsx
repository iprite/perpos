'use client';

import { useEffect, useState, useCallback, useMemo, useRef } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { createSupabaseBrowserClient } from '@/lib/supabase/client';
import { Button } from '@/components/ui/button';
import { PageShell } from '@/components/ui/page-shell';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { CustomSelect } from '@/components/ui/custom-select';
import { ThaiDatePicker } from '@/components/ui/thai-date-picker';
import {
  Dialog, DialogContent, DialogHeader, DialogBody, DialogTitle, DialogFooter,
} from '@/components/ui/dialog';
import { ConfirmDeleteDialog } from '@/components/ui/confirm-delete-dialog';
import {
  Briefcase, MessageSquare, Calendar, Pencil, Trash2, Plus,
  Search, Clock, Banknote, Lock, Paperclip, X, Eye, Download,
  FileText, FileSpreadsheet, File, Code2,
} from 'lucide-react';

// ── Types ─────────────────────────────────────────────────────────────────────

type CrmMember = { id: string; email: string; display_name: string | null };

type Solution = {
  id: string; title: string; description: string | null; status: string;
  priority: string; value: number | null; start_date: string | null; end_date: string | null;
  client: { id: string; name: string } | null;
};

type Attachment = {
  id: string; file_name: string; mime_type: string;
  file_size: number; storage_path: string;
};

type Note = {
  id: string; content: string; note_type: string;
  content_format: 'plain' | 'markdown';
  duration_minutes: number | null; is_billable: boolean; is_internal: boolean;
  created_at: string;
  author: { id: string; email: string; display_name: string | null } | null;
  attachments: Attachment[];
};

// ── Constants ─────────────────────────────────────────────────────────────────

const NOTE_TYPES = [
  { value: 'note',        label: 'Note',        icon: '📝', border: 'border-l-slate-400',  dot: 'bg-slate-400',   badge: 'bg-slate-100 text-slate-600'   },
  { value: 'meeting',     label: 'Meeting',     icon: '🤝', border: 'border-l-blue-400',   dot: 'bg-blue-400',    badge: 'bg-blue-100 text-blue-700'     },
  { value: 'site_survey', label: 'Site Survey', icon: '🔧', border: 'border-l-orange-400', dot: 'bg-orange-400',  badge: 'bg-orange-100 text-orange-700' },
  { value: 'issue',       label: 'Issue',       icon: '🐛', border: 'border-l-red-400',    dot: 'bg-red-400',     badge: 'bg-red-100 text-red-700'       },
  { value: 'system_log',  label: 'System Log',  icon: '⚙️', border: 'border-l-purple-400', dot: 'bg-purple-400',  badge: 'bg-purple-100 text-purple-700' },
  { value: 'internal',    label: 'Internal',    icon: '🔒', border: 'border-l-gray-300',   dot: 'bg-gray-300',    badge: 'bg-gray-100 text-gray-500'     },
] as const;

type NoteTypeValue = typeof NOTE_TYPES[number]['value'];
const TYPE_MAP = Object.fromEntries(NOTE_TYPES.map(t => [t.value, t])) as Record<NoteTypeValue, typeof NOTE_TYPES[number]>;

const STATUS_OPTS = [
  { value: 'lead', label: 'Lead' }, { value: 'proposal', label: 'Proposal' },
  { value: 'in_progress', label: 'In Progress' }, { value: 'on_hold', label: 'On Hold' },
  { value: 'completed', label: 'Completed' }, { value: 'cancelled', label: 'Cancelled' },
];
const PRIORITY_OPTS = [
  { value: 'low', label: 'Low' }, { value: 'medium', label: 'Medium' },
  { value: 'high', label: 'High' }, { value: 'urgent', label: 'Urgent' },
];
const STATUS_COLOR: Record<string, string> = {
  lead: 'bg-slate-100 text-slate-600', proposal: 'bg-blue-100 text-blue-700',
  in_progress: 'bg-amber-100 text-amber-700', on_hold: 'bg-orange-100 text-orange-700',
  completed: 'bg-green-100 text-green-700', cancelled: 'bg-red-100 text-red-600',
};

const ACCEPT = 'image/*,.pdf,.xlsx,.xls,.docx,.doc,.txt,.csv';
const MAX_FILE_SIZE = 20 * 1024 * 1024; // 20 MB

// ── Helpers ───────────────────────────────────────────────────────────────────

function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString('th-TH', {
    day: 'numeric', month: 'short', year: '2-digit', hour: '2-digit', minute: '2-digit',
  });
}
function fmtDuration(min: number | null): string | null {
  if (!min || min <= 0) return null;
  const h = Math.floor(min / 60), m = min % 60;
  if (h === 0) return `${m}m`;
  if (m === 0) return `${h}h`;
  return `${h}h ${m}m`;
}
function fmtSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}
function isImage(mime: string) { return mime.startsWith('image/'); }
function fileIcon(mime: string) {
  if (mime.includes('pdf'))         return <FileText className="w-4 h-4 text-red-500" />;
  if (mime.includes('sheet') || mime.includes('excel') || mime.includes('csv'))
    return <FileSpreadsheet className="w-4 h-4 text-green-600" />;
  return <File className="w-4 h-4 text-slate-400" />;
}
function sanitizeName(name: string) {
  return name.replace(/[^a-zA-Z0-9._\-ก-๙]/g, '_');
}

// ── Markdown renderer ─────────────────────────────────────────────────────────

function MarkdownContent({ content }: { content: string }) {
  return (
    <div className="md-prose text-sm text-slate-800 leading-relaxed [&_h1]:text-base [&_h1]:font-bold [&_h1]:mb-2 [&_h2]:text-sm [&_h2]:font-semibold [&_h2]:mb-1.5 [&_h3]:text-sm [&_h3]:font-medium [&_h3]:mb-1 [&_p]:mb-2 [&_p:last-child]:mb-0 [&_ul]:list-disc [&_ul]:pl-4 [&_ul]:mb-2 [&_ol]:list-decimal [&_ol]:pl-4 [&_ol]:mb-2 [&_li]:mb-0.5 [&_strong]:font-semibold [&_em]:italic [&_code]:bg-slate-100 [&_code]:text-slate-800 [&_code]:px-1 [&_code]:py-0.5 [&_code]:rounded [&_code]:text-xs [&_code]:font-mono [&_pre]:bg-slate-900 [&_pre]:text-slate-100 [&_pre]:rounded-lg [&_pre]:p-3 [&_pre]:overflow-x-auto [&_pre]:mb-2 [&_pre_code]:bg-transparent [&_pre_code]:p-0 [&_pre_code]:text-slate-100 [&_blockquote]:border-l-2 [&_blockquote]:border-slate-300 [&_blockquote]:pl-3 [&_blockquote]:text-slate-600 [&_blockquote]:italic [&_blockquote]:mb-2 [&_table]:w-full [&_table]:text-xs [&_table]:border-collapse [&_table]:mb-2 [&_th]:bg-slate-100 [&_th]:px-2 [&_th]:py-1 [&_th]:border [&_th]:border-slate-200 [&_th]:text-left [&_th]:font-medium [&_td]:px-2 [&_td]:py-1 [&_td]:border [&_td]:border-slate-200 [&_a]:text-blue-600 [&_a]:underline [&_hr]:border-slate-200 [&_hr]:my-2">
      <ReactMarkdown remarkPlugins={[remarkGfm]}>{content}</ReactMarkdown>
    </div>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function SolutionDetailPage() {
  const { orgSlug, solutionId } = useParams<{ orgSlug: string; solutionId: string }>();
  const supabase = useMemo(() => createSupabaseBrowserClient(), []);

  const [orgId, setOrgId] = useState('');
  const [token, setToken] = useState('');
  const [sol,   setSol]   = useState<Solution | null>(null);
  const [notes, setNotes] = useState<Note[]>([]);
  const [loading, setLoading] = useState(true);

  // Edit solution
  const [editOpen, setEditOpen] = useState(false);
  const [editForm, setEditForm] = useState({ title: '', description: '', status: '', priority: '', value: '', start_date: '', end_date: '' });
  const [saving,   setSaving]   = useState(false);

  // Add note form
  const [noteType,       setNoteType]       = useState<NoteTypeValue>('note');
  const [noteContent,    setNoteContent]    = useState('');
  const [mdMode,         setMdMode]         = useState(false);
  const [mdPreview,      setMdPreview]      = useState(false);
  const [durationH,      setDurationH]      = useState('');
  const [durationM,      setDurationM]      = useState('');
  const [billable,       setBillable]       = useState(false);
  const [internal,       setInternal]       = useState(false);
  const [selectedFiles,  setSelectedFiles]  = useState<File[]>([]);
  const [addingNote,     setAddingNote]     = useState(false);
  const [uploadStatus,   setUploadStatus]   = useState('');
  const [noteError,      setNoteError]      = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Filter
  const [filterType, setFilterType] = useState<NoteTypeValue | ''>('');
  const [searchQ,    setSearchQ]    = useState('');

  // Members for @mention
  const [members,          setMembers]          = useState<CrmMember[]>([]);
  const [mentionQuery,     setMentionQuery]     = useState('');
  const [showMentions,     setShowMentions]     = useState(false);
  const [pendingMentions,  setPendingMentions]  = useState<Set<string>>(new Set());
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Signed URLs for attachments (storage_path → signed URL)
  const [signedUrls, setSignedUrls] = useState<Record<string, string>>({});

  // Image preview
  const [preview, setPreview] = useState<{ url: string; name: string } | null>(null);

  // Confirm delete
  const [deleteNoteConfirm, setDeleteNoteConfirm] = useState<{ open: boolean; noteId: string }>({ open: false, noteId: '' });

  // ── Auth & load ──────────────────────────────────────────────────────────────

  const initAuth = useCallback(async () => {
    const { data: orgs } = await supabase.from('organizations').select('id').eq('slug', orgSlug).single();
    const { data: sess } = await supabase.auth.getSession();
    if (orgs && sess.session) { setOrgId(orgs.id); setToken(sess.session.access_token); }
  }, [supabase, orgSlug]);

  const generateSignedUrls = useCallback(async (notesList: Note[]) => {
    const paths = notesList.flatMap(n => (n.attachments ?? []).map(a => a.storage_path));
    if (paths.length === 0) return;
    const urlMap: Record<string, string> = {};
    await Promise.all(paths.map(async path => {
      const { data } = await supabase.storage.from('crm-attachments').createSignedUrl(path, 3600);
      if (data?.signedUrl) urlMap[path] = data.signedUrl;
    }));
    setSignedUrls(prev => ({ ...prev, ...urlMap }));
  }, [supabase]);

  const loadSol = useCallback(async (oid: string, tok: string) => {
    const res = await fetch(`/api/crm/solutions/${solutionId}?orgId=${oid}`, { headers: { Authorization: `Bearer ${tok}` } });
    if (res.ok) {
      const d = await res.json();
      setSol(d);
      setEditForm({ title: d.title, description: d.description ?? '', status: d.status, priority: d.priority, value: String(d.value ?? ''), start_date: d.start_date ?? '', end_date: d.end_date ?? '' });
    }
  }, [solutionId]);

  const loadNotes = useCallback(async (oid: string, tok: string) => {
    const res = await fetch(`/api/crm/solutions/${solutionId}/notes?orgId=${oid}`, { headers: { Authorization: `Bearer ${tok}` } });
    if (res.ok) {
      const data: Note[] = await res.json();
      setNotes(data);
      void generateSignedUrls(data);
    }
  }, [solutionId, generateSignedUrls]);

  const load = useCallback(async (oid: string, tok: string) => {
    setLoading(true);
    await Promise.all([loadSol(oid, tok), loadNotes(oid, tok)]);
    setLoading(false);
  }, [loadSol, loadNotes]);

  useEffect(() => { initAuth(); }, [initAuth]);
  useEffect(() => {
    if (!orgId || !token) return;
    load(orgId, token);
    fetch(`/api/crm/members?orgId=${orgId}`, { headers: { Authorization: `Bearer ${token}` } })
      .then(r => r.ok ? r.json() : [])
      .then((data: CrmMember[]) => setMembers(data))
      .catch(() => {});
  }, [load, orgId, token]);

  // ── Actions ──────────────────────────────────────────────────────────────────

  const saveSol = async () => {
    setSaving(true);
    const res = await fetch(`/api/crm/solutions/${solutionId}?orgId=${orgId}`, {
      method: 'PUT',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...editForm, value: editForm.value ? Number(editForm.value) : null, start_date: editForm.start_date || null, end_date: editForm.end_date || null }),
    });
    if (!res.ok) { alert(`บันทึกไม่สำเร็จ`); setSaving(false); return; }
    setSaving(false);
    setEditOpen(false);
    loadSol(orgId, token);
  };

  const addNote = async () => {
    if (!noteContent.trim()) return;
    setAddingNote(true);
    setNoteError('');
    setUploadStatus('');

    const durationMinutes = (Number(durationH || 0) * 60) + Number(durationM || 0) || null;

    // 1. Create note
    const noteRes = await fetch(`/api/crm/solutions/${solutionId}/notes?orgId=${orgId}`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ content: noteContent, note_type: noteType, content_format: mdMode ? 'markdown' : 'plain', duration_minutes: durationMinutes, is_billable: billable, is_internal: internal, mentioned_user_ids: Array.from(pendingMentions) }),
    });
    if (!noteRes.ok) {
      const err = await noteRes.json().catch(() => ({}));
      setNoteError((err as { error?: string }).error ?? 'เพิ่มไม่สำเร็จ');
      setAddingNote(false);
      return;
    }
    const newNote = await noteRes.json() as { id: string };

    // 2. Upload files
    if (selectedFiles.length > 0) {
      for (let i = 0; i < selectedFiles.length; i++) {
        const file = selectedFiles[i];
        setUploadStatus(`อัปโหลด ${i + 1}/${selectedFiles.length}: ${file.name}`);
        const safeName = `${Date.now()}-${sanitizeName(file.name)}`;
        const storagePath = `${orgId}/${solutionId}/${newNote.id}/${safeName}`;

        const { error: upErr } = await supabase.storage.from('crm-attachments').upload(storagePath, file, { contentType: file.type });
        if (upErr) { console.error('upload error:', upErr.message); continue; }

        await fetch(`/api/crm/solutions/${solutionId}/attachments?orgId=${orgId}`, {
          method: 'POST',
          headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ noteId: newNote.id, fileName: file.name, mimeType: file.type || 'application/octet-stream', fileSize: file.size, storagePath }),
        });
      }
      setUploadStatus('');
    }

    // 3. Reset
    setNoteContent('');
    setMdMode(false);
    setMdPreview(false);
    setPendingMentions(new Set());
    setShowMentions(false);
    setDurationH('');
    setDurationM('');
    setBillable(false);
    setInternal(false);
    setSelectedFiles([]);
    setAddingNote(false);
    loadNotes(orgId, token);
  };

  const doDeleteNote = async () => {
    const n = notes.find(n => n.id === deleteNoteConfirm.noteId);
    // Delete storage files for this note
    if (n?.attachments?.length) {
      const paths = n.attachments.map(a => a.storage_path);
      await supabase.storage.from('crm-attachments').remove(paths);
    }
    await fetch(`/api/crm/solutions/${solutionId}/notes?orgId=${orgId}&noteId=${deleteNoteConfirm.noteId}`, {
      method: 'DELETE', headers: { Authorization: `Bearer ${token}` },
    });
    setNotes(prev => prev.filter(n => n.id !== deleteNoteConfirm.noteId));
    setDeleteNoteConfirm({ open: false, noteId: '' });
  };

  const deleteAttachment = async (noteId: string, attachmentId: string, storagePath: string) => {
    await fetch(`/api/crm/solutions/${solutionId}/attachments?orgId=${orgId}&attachmentId=${attachmentId}`, {
      method: 'DELETE', headers: { Authorization: `Bearer ${token}` },
    });
    setNotes(prev => prev.map(n => n.id === noteId
      ? { ...n, attachments: n.attachments.filter(a => a.id !== attachmentId) }
      : n,
    ));
    setSignedUrls(prev => { const next = { ...prev }; delete next[storagePath]; return next; });
  };

  const filteredMembers = useMemo(() =>
    mentionQuery
      ? members.filter(m => (m.display_name ?? m.email).toLowerCase().includes(mentionQuery.toLowerCase()))
      : members.slice(0, 8),
  [members, mentionQuery]);

  const handleContentChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const val = e.target.value;
    setNoteContent(val);
    const cursor = e.target.selectionStart ?? val.length;
    const textBefore = val.slice(0, cursor);
    const atMatch = textBefore.match(/@([\w฀-๿]*)$/);
    if (atMatch) {
      setMentionQuery(atMatch[1]);
      setShowMentions(true);
    } else {
      setShowMentions(false);
      setMentionQuery('');
    }
  };

  const insertMention = (member: CrmMember) => {
    const el = textareaRef.current;
    const cursor = el?.selectionStart ?? noteContent.length;
    const textBefore = noteContent.slice(0, cursor);
    const textAfter  = noteContent.slice(cursor);
    const atIdx = textBefore.search(/@([\w฀-๿]*)$/);
    const prefix = atIdx >= 0 ? textBefore.slice(0, atIdx) : textBefore;
    const name = member.display_name || member.email;
    setNoteContent(prefix + `@${name} ` + textAfter);
    setPendingMentions(prev => { const n = new Set(Array.from(prev)); n.add(member.id); return n; });
    setShowMentions(false);
    setMentionQuery('');
    setTimeout(() => {
      if (el) {
        const newPos = (prefix + `@${name} `).length;
        el.focus();
        el.setSelectionRange(newPos, newPos);
      }
    }, 0);
  };

  const onFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? []);
    const valid = files.filter(f => f.size <= MAX_FILE_SIZE);
    const oversized = files.filter(f => f.size > MAX_FILE_SIZE);
    if (oversized.length) setNoteError(`ไฟล์ ${oversized.map(f => f.name).join(', ')} เกิน 20MB`);
    setSelectedFiles(prev => [...prev, ...valid]);
    e.target.value = '';
  };

  // ── Filtered notes ───────────────────────────────────────────────────────────

  const filtered = useMemo(() => notes.filter(n => {
    if (filterType && n.note_type !== filterType) return false;
    if (searchQ && !n.content.toLowerCase().includes(searchQ.toLowerCase())) return false;
    return true;
  }), [notes, filterType, searchQ]);

  // ── Render ───────────────────────────────────────────────────────────────────

  if (loading) return <div className="p-6 text-slate-400 text-sm text-center">กำลังโหลด…</div>;
  if (!sol)    return <div className="p-6 text-red-500 text-sm">ไม่พบ solution</div>;

  const sc = STATUS_COLOR[sol.status] ?? 'bg-slate-100 text-slate-600';

  return (
    <PageShell width="narrow">

      {/* Breadcrumb */}
      <div className="flex items-center gap-2 text-sm text-slate-500 flex-wrap">
        <Link href={`/${orgSlug}/crm/solutions`} className="hover:text-indigo-600">Solutions</Link>
        {sol.client && (
          <><span>/</span>
          <Link href={`/${orgSlug}/crm/clients/${sol.client.id}`} className="hover:text-indigo-600">{sol.client.name}</Link></>
        )}
        <span>/</span>
        <span className="text-slate-800 font-medium truncate">{sol.title}</span>
      </div>

      {/* Solution header */}
      <div className="bg-white rounded-xl border p-5">
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div className="flex items-start gap-3">
            <div className="w-10 h-10 rounded-lg bg-blue-100 flex items-center justify-center shrink-0">
              <Briefcase className="w-5 h-5 text-blue-500" />
            </div>
            <div>
              <h1 className="text-lg font-bold text-slate-900">{sol.title}</h1>
              {sol.description && <p className="text-sm text-slate-500 mt-0.5">{sol.description}</p>}
              {sol.client && (
                <Link href={`/${orgSlug}/crm/clients/${sol.client.id}`} className="text-xs text-indigo-500 hover:underline mt-1 inline-block">
                  {sol.client.name}
                </Link>
              )}
            </div>
          </div>
          <Button variant="outline" size="sm" onClick={() => setEditOpen(true)}>
            <Pencil className="w-3.5 h-3.5 mr-1" /> แก้ไข
          </Button>
        </div>
        <div className="mt-4 grid grid-cols-2 sm:grid-cols-4 gap-3 text-sm">
          <div>
            <p className="text-xs text-slate-400 mb-1">Status</p>
            <span className={`text-xs px-2 py-1 rounded-full font-medium ${sc}`}>
              {STATUS_OPTS.find(s => s.value === sol.status)?.label ?? sol.status}
            </span>
          </div>
          <div>
            <p className="text-xs text-slate-400 mb-1">Priority</p>
            <span className="text-xs font-medium text-slate-700">{sol.priority}</span>
          </div>
          {sol.value != null && (
            <div>
              <p className="text-xs text-slate-400 mb-1">มูลค่า</p>
              <span className="text-sm font-bold text-slate-800">฿{sol.value.toLocaleString('th-TH')}</span>
            </div>
          )}
          {(sol.start_date || sol.end_date) && (
            <div>
              <p className="text-xs text-slate-400 mb-1">ระยะเวลา</p>
              <span className="text-xs text-slate-600 flex items-center gap-1">
                <Calendar className="w-3 h-3" />
                {sol.start_date ?? '—'} → {sol.end_date ?? '—'}
              </span>
            </div>
          )}
        </div>
      </div>

      {/* Notes & Activity */}
      <div className="bg-white rounded-xl border">

        {/* Header */}
        <div className="px-4 py-3 border-b flex items-center gap-2">
          <MessageSquare className="w-4 h-4 text-slate-400" />
          <h2 className="text-sm font-semibold text-slate-700">Notes & Activity</h2>
          <span className="ml-auto text-xs text-slate-400">{notes.length} รายการ</span>
        </div>

        {/* ── Add note form ── */}
        <div className="p-4 border-b bg-slate-50 space-y-3">

          {/* Type chips */}
          <div className="flex flex-wrap gap-2">
            {NOTE_TYPES.map(t => (
              <button key={t.value} type="button" onClick={() => setNoteType(t.value)}
                className={`px-3 py-1.5 rounded-full text-xs font-medium border transition-all ${
                  noteType === t.value
                    ? `${t.badge} border-current shadow-sm ring-2 ring-offset-1 ring-current/30`
                    : 'bg-white text-slate-500 border-slate-200 hover:border-slate-300'
                }`}>
                {t.icon} {t.label}
              </button>
            ))}
          </div>

          {/* Content area */}
          <div className="rounded-lg border border-slate-200 bg-white overflow-hidden focus-within:ring-2 focus-within:ring-blue-500">
            {/* Toolbar: Write / Preview tabs + MD toggle */}
            <div className="flex items-center gap-0 border-b border-slate-100 bg-slate-50 px-2 py-1">
              {mdMode ? (
                <>
                  <button type="button" onClick={() => setMdPreview(false)}
                    className={`px-3 py-1 text-xs font-medium rounded transition-all ${!mdPreview ? 'bg-white text-slate-800 shadow-sm border border-slate-200' : 'text-slate-500 hover:text-slate-700'}`}>
                    Write
                  </button>
                  <button type="button" onClick={() => setMdPreview(true)}
                    className={`px-3 py-1 text-xs font-medium rounded transition-all ${mdPreview ? 'bg-white text-slate-800 shadow-sm border border-slate-200' : 'text-slate-500 hover:text-slate-700'}`}>
                    <Eye className="w-3 h-3 inline mr-1" />Preview
                  </button>
                </>
              ) : (
                <span className="px-2 py-1 text-xs text-slate-400">Plain text</span>
              )}
              <div className="flex-1" />
              <button type="button" onClick={() => { setMdMode(m => !m); setMdPreview(false); }}
                className={`flex items-center gap-1 px-2.5 py-1 rounded text-xs font-medium border transition-all ${
                  mdMode ? 'bg-indigo-100 text-indigo-700 border-indigo-300' : 'bg-white text-slate-500 border-slate-200 hover:border-slate-300'
                }`}
                title="สลับ Markdown mode">
                <Code2 className="w-3 h-3" /> MD
              </button>
            </div>

            {/* Editor / Preview */}
            {mdMode && mdPreview ? (
              <div className="min-h-[80px] px-3 py-2">
                {noteContent.trim()
                  ? <MarkdownContent content={noteContent} />
                  : <span className="text-sm text-slate-400 italic">ยังไม่มีเนื้อหา…</span>}
              </div>
            ) : (
              <div className="relative">
                <textarea ref={textareaRef} rows={3} value={noteContent}
                  onChange={handleContentChange}
                  onKeyDown={e => {
                    if (e.key === 'Escape') { setShowMentions(false); return; }
                    if (showMentions && (e.key === 'ArrowDown' || e.key === 'ArrowUp')) { e.preventDefault(); return; }
                    if (e.key === 'Enter' && e.ctrlKey) addNote();
                  }}
                  onBlur={() => setTimeout(() => setShowMentions(false), 150)}
                  placeholder={
                    mdMode
                      ? '# หัวข้อ\n\nรองรับ **Markdown** — ตาราง, รายการ, `code block`…'
                      : noteType === 'site_survey' ? 'บันทึกข้อมูลเทคนิค, Configuration, หรือสิ่งที่พบจากหน้างาน…' :
                        noteType === 'meeting'     ? 'สรุปผลการประชุม / โทรศัพท์ / Zoom — ใคร, ตัดสินใจอะไร, Next step…' :
                        noteType === 'issue'       ? 'อธิบายปัญหาที่พบ, ขั้นตอน reproduce, และ impact…' :
                        noteType === 'system_log'  ? 'บันทึก event ระบบ…' :
                        noteType === 'internal'    ? 'โน้ตภายในทีม — ไม่แสดงต่อลูกค้า…' :
                        'เพิ่ม note… พิมพ์ @ เพื่อ mention สมาชิก'
                  }
                  className={`w-full px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none resize-none bg-white ${mdMode ? 'font-mono' : ''}`}
                />
                {/* @mention dropdown */}
                {showMentions && filteredMembers.length > 0 && (
                  <div className="absolute left-2 top-full z-50 mt-1 w-56 rounded-lg border border-slate-200 bg-white shadow-lg overflow-hidden">
                    <div className="px-3 py-1.5 text-xs text-slate-400 border-b border-slate-100">สมาชิก</div>
                    {filteredMembers.map(m => (
                      <button key={m.id} type="button"
                        onMouseDown={e => { e.preventDefault(); insertMention(m); }}
                        className="w-full text-left px-3 py-2 text-sm hover:bg-indigo-50 flex items-center gap-2">
                        <span className="w-6 h-6 rounded-full bg-indigo-100 text-indigo-700 flex items-center justify-center text-xs font-bold shrink-0">
                          {(m.display_name || m.email).charAt(0).toUpperCase()}
                        </span>
                        <div className="min-w-0">
                          <p className="font-medium text-slate-800 truncate">{m.display_name || m.email}</p>
                          {m.display_name && <p className="text-xs text-slate-400 truncate">{m.email}</p>}
                        </div>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Pending mention chips */}
          {pendingMentions.size > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {Array.from(pendingMentions).map(uid => {
                const m = members.find(x => x.id === uid);
                if (!m) return null;
                return (
                  <span key={uid} className="inline-flex items-center gap-1 px-2 py-1 rounded-full bg-indigo-100 text-indigo-700 text-xs font-medium">
                    @{m.display_name || m.email}
                    <button type="button" onClick={() => setPendingMentions(prev => { const n = new Set(prev); n.delete(uid); return n; })}
                      className="text-indigo-400 hover:text-indigo-700">
                      <X className="w-3 h-3" />
                    </button>
                  </span>
                );
              })}
            </div>
          )}

          {/* Selected files preview */}
          {selectedFiles.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {selectedFiles.map((f, i) => (
                <div key={i} className="flex items-center gap-1.5 px-2.5 py-1.5 bg-white rounded-lg border border-slate-200 text-xs text-slate-700">
                  {isImage(f.type)
                    ? <img src={URL.createObjectURL(f)} alt={f.name} className="w-5 h-5 rounded object-cover" />
                    : fileIcon(f.type)}
                  <span className="max-w-[120px] truncate">{f.name}</span>
                  <span className="text-slate-400">({fmtSize(f.size)})</span>
                  <button type="button" onClick={() => setSelectedFiles(prev => prev.filter((_, j) => j !== i))}
                    className="text-slate-300 hover:text-red-400 ml-0.5">
                    <X className="w-3 h-3" />
                  </button>
                </div>
              ))}
            </div>
          )}

          {/* Options row */}
          <div className="flex items-center gap-3 flex-wrap">
            {/* Duration */}
            <div className="flex items-center gap-1.5 text-sm text-slate-600">
              <Clock className="w-3.5 h-3.5 text-slate-400 shrink-0" />
              <Input type="number" min="0" max="99" value={durationH} onChange={e => setDurationH(e.target.value)}
                placeholder="0" className="w-14 h-8 text-center text-sm px-1" />
              <span className="text-slate-400 text-xs">h</span>
              <Input type="number" min="0" max="59" value={durationM} onChange={e => setDurationM(e.target.value)}
                placeholder="0" className="w-14 h-8 text-center text-sm px-1" />
              <span className="text-slate-400 text-xs">m</span>
            </div>

            <div className="w-px h-5 bg-slate-200 hidden sm:block" />

            {/* Billable */}
            <button type="button" onClick={() => setBillable(b => !b)}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium border transition-all ${
                billable ? 'bg-emerald-100 text-emerald-700 border-emerald-300' : 'bg-white text-slate-500 border-slate-200 hover:border-slate-300'
              }`}>
              <Banknote className="w-3.5 h-3.5" /> Billable
            </button>

            {/* Internal */}
            <button type="button" onClick={() => setInternal(i => !i)}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium border transition-all ${
                internal ? 'bg-gray-200 text-gray-700 border-gray-400' : 'bg-white text-slate-500 border-slate-200 hover:border-slate-300'
              }`}>
              <Lock className="w-3.5 h-3.5" /> Internal
            </button>

            {/* Attach file */}
            <button type="button" onClick={() => fileInputRef.current?.click()}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium border bg-white text-slate-500 border-slate-200 hover:border-slate-300 transition-all">
              <Paperclip className="w-3.5 h-3.5" />
              {selectedFiles.length > 0 ? `${selectedFiles.length} ไฟล์` : 'แนบไฟล์'}
            </button>
            <input ref={fileInputRef} type="file" multiple accept={ACCEPT} onChange={onFileChange} className="hidden" />

            <div className="flex-1" />
            <span className="text-xs text-slate-400 hidden sm:block">Ctrl+Enter เพื่อบันทึก</span>

            <Button size="sm" onClick={addNote} disabled={addingNote || !noteContent.trim()}>
              {addingNote
                ? (uploadStatus || 'กำลังบันทึก…')
                : <><Plus className="w-4 h-4 mr-1" />เพิ่ม</>}
            </Button>
          </div>

          {noteError && <p className="text-xs text-red-600">{noteError}</p>}
        </div>

        {/* ── Filter bar ── */}
        <div className="px-4 py-2.5 border-b bg-white flex items-center gap-2 flex-wrap">
          <div className="relative flex-1 min-w-[160px] max-w-xs">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400" />
            <Input value={searchQ} onChange={e => setSearchQ(e.target.value)}
              placeholder="ค้นหาใน notes…" className="pl-8 h-8 text-sm" />
          </div>
          <div className="flex items-center gap-1.5 flex-wrap">
            <button type="button" onClick={() => setFilterType('')}
              className={`px-2.5 py-1 rounded-full text-xs font-medium border transition-all ${
                filterType === '' ? 'bg-primary text-primary-foreground border-primary' : 'bg-white text-slate-500 border-slate-200 hover:border-slate-300'
              }`}>
              ทั้งหมด {filterType === '' && notes.length > 0 ? `(${notes.length})` : ''}
            </button>
            {NOTE_TYPES.map(t => {
              const count = notes.filter(n => n.note_type === t.value).length;
              if (count === 0) return null;
              return (
                <button key={t.value} type="button" onClick={() => setFilterType(filterType === t.value ? '' : t.value)}
                  className={`px-2.5 py-1 rounded-full text-xs font-medium border transition-all ${
                    filterType === t.value ? `${t.badge} border-current` : 'bg-white text-slate-500 border-slate-200 hover:border-slate-300'
                  }`}>
                  {t.icon} {t.label} ({count})
                </button>
              );
            })}
          </div>
        </div>

        {/* ── Timeline ── */}
        <div className="divide-y">
          {filtered.length === 0 ? (
            <div className="p-10 text-center text-slate-400 text-sm">
              {searchQ || filterType ? 'ไม่พบ notes ที่ตรงกัน' : 'ยังไม่มี notes — เพิ่มรายการแรกด้านบน'}
            </div>
          ) : filtered.map(n => {
            const t = TYPE_MAP[n.note_type as NoteTypeValue] ?? TYPE_MAP['note'];
            const dur = fmtDuration(n.duration_minutes);
            return (
              <div key={n.id} className={`flex group ${n.is_internal ? 'bg-gray-50/70' : 'hover:bg-slate-50/60'}`}>
                {/* Colored left strip */}
                <div className={`w-1 shrink-0 ${t.dot}`} />

                {/* Content */}
                <div className="flex-1 px-4 py-3 min-w-0">
                  {/* Badges */}
                  <div className="flex items-center gap-1.5 flex-wrap mb-2">
                    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${t.badge}`}>
                      {t.icon} {t.label}
                    </span>
                    {n.is_internal && (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-gray-200 text-gray-600">
                        <Lock className="w-2.5 h-2.5" /> Internal
                      </span>
                    )}
                    {dur && (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-blue-50 text-blue-600">
                        <Clock className="w-2.5 h-2.5" /> {dur}
                      </span>
                    )}
                    {n.is_billable && (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-emerald-50 text-emerald-700">
                        <Banknote className="w-2.5 h-2.5" /> Billable
                      </span>
                    )}
                  </div>

                  {/* Text */}
                  {n.content_format === 'markdown'
                    ? <MarkdownContent content={n.content} />
                    : <p className="text-sm text-slate-800 leading-relaxed whitespace-pre-wrap">{n.content}</p>}

                  {/* Attachments */}
                  {n.attachments?.length > 0 && (
                    <div className="mt-2.5 flex flex-wrap gap-2">
                      {n.attachments.map(a => {
                        const url = signedUrls[a.storage_path];
                        if (isImage(a.mime_type)) {
                          return (
                            <div key={a.id} className="relative group/att">
                              <button type="button" onClick={() => url && setPreview({ url, name: a.file_name })}
                                className="w-20 h-20 rounded-lg overflow-hidden border border-slate-200 hover:border-blue-400 transition-all block">
                                {url
                                  ? <img src={url} alt={a.file_name} className="w-full h-full object-cover" />
                                  : <div className="w-full h-full bg-slate-100 animate-pulse" />}
                              </button>
                              <button type="button"
                                onClick={() => deleteAttachment(n.id, a.id, a.storage_path)}
                                className="absolute -top-1.5 -right-1.5 w-4 h-4 rounded-full bg-red-500 text-white items-center justify-center hidden group-hover/att:flex">
                                <X className="w-2.5 h-2.5" />
                              </button>
                            </div>
                          );
                        }
                        return (
                          <div key={a.id} className="relative group/att">
                            <a href={url ?? '#'} download={a.file_name} target="_blank" rel="noopener noreferrer"
                              className="flex items-center gap-2 px-3 py-2 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 transition-all text-xs text-slate-700 max-w-[200px]">
                              {fileIcon(a.mime_type)}
                              <div className="min-w-0">
                                <p className="font-medium truncate">{a.file_name}</p>
                                <p className="text-slate-400">{fmtSize(a.file_size)}</p>
                              </div>
                              <Download className="w-3 h-3 text-slate-400 shrink-0" />
                            </a>
                            <button type="button"
                              onClick={() => deleteAttachment(n.id, a.id, a.storage_path)}
                              className="absolute -top-1.5 -right-1.5 w-4 h-4 rounded-full bg-red-500 text-white items-center justify-center hidden group-hover/att:flex">
                              <X className="w-2.5 h-2.5" />
                            </button>
                          </div>
                        );
                      })}
                    </div>
                  )}

                  {/* Footer */}
                  <div className="flex items-center gap-2 mt-2 text-xs text-slate-400">
                    <span>{n.author?.display_name || n.author?.email || 'Unknown'}</span>
                    <span>·</span>
                    <span>{fmtDate(n.created_at)}</span>
                    {n.attachments?.length > 0 && (
                      <><span>·</span>
                      <span className="flex items-center gap-1"><Paperclip className="w-3 h-3" />{n.attachments.length}</span></>
                    )}
                  </div>
                </div>

                {/* Delete note */}
                <div className="pr-3 py-3 flex items-start">
                  <button onClick={() => setDeleteNoteConfirm({ open: true, noteId: n.id })}
                    className="opacity-0 group-hover:opacity-100 text-slate-300 hover:text-red-400 transition-all mt-0.5">
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            );
          })}
        </div>

        {/* Man-hours summary footer */}
        {notes.length > 0 && (() => {
          const totalMin = notes.reduce((s, n) => s + (n.duration_minutes ?? 0), 0);
          const billMin  = notes.filter(n => n.is_billable).reduce((s, n) => s + (n.duration_minutes ?? 0), 0);
          if (!totalMin) return null;
          return (
            <div className="px-4 py-2.5 border-t bg-slate-50 flex items-center gap-4 text-xs text-slate-500 flex-wrap">
              <span><Clock className="w-3 h-3 inline mr-1" />รวม <strong className="text-slate-700">{fmtDuration(totalMin)}</strong></span>
              {billMin > 0 && <span><Banknote className="w-3 h-3 inline mr-1" />Billable <strong className="text-emerald-700">{fmtDuration(billMin)}</strong></span>}
            </div>
          );
        })()}
      </div>

      {/* ── Image preview Dialog ── */}
      {preview && (
        <Dialog open onOpenChange={() => setPreview(null)}>
          <DialogContent size="2xl">
            <DialogBody className="p-0">
            <div className="relative">
              <img src={preview.url} alt={preview.name} className="w-full h-auto max-h-[80vh] object-contain" />
              <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/50 to-transparent px-4 py-3 flex items-center justify-between">
                <span className="text-white text-sm font-medium truncate">{preview.name}</span>
                <a href={preview.url} download={preview.name} target="_blank" rel="noopener noreferrer"
                  className="flex items-center gap-1.5 text-white/80 hover:text-white text-xs">
                  <Download className="w-4 h-4" /> ดาวน์โหลด
                </a>
              </div>
            </div>
            </DialogBody>
          </DialogContent>
        </Dialog>
      )}

      {/* ── Edit Solution Dialog ── */}
      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent size="lg">
          <DialogHeader><DialogTitle>แก้ไข Solution</DialogTitle></DialogHeader>
          <DialogBody>
          <div className="space-y-3">
            <div>
              <Label htmlFor="e-title">ชื่อ *</Label>
              <Input id="e-title" value={editForm.title} onChange={e => setEditForm(f => ({ ...f, title: e.target.value }))} />
            </div>
            <div>
              <Label htmlFor="e-desc">รายละเอียด</Label>
              <Input id="e-desc" value={editForm.description} onChange={e => setEditForm(f => ({ ...f, description: e.target.value }))} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div><Label>Status</Label><CustomSelect value={editForm.status} onChange={v => setEditForm(f => ({ ...f, status: v }))} options={STATUS_OPTS} /></div>
              <div><Label>Priority</Label><CustomSelect value={editForm.priority} onChange={v => setEditForm(f => ({ ...f, priority: v }))} options={PRIORITY_OPTS} /></div>
            </div>
            <div>
              <Label htmlFor="e-value">มูลค่า (บาท)</Label>
              <Input id="e-value" type="number" value={editForm.value} onChange={e => setEditForm(f => ({ ...f, value: e.target.value }))} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div><Label>วันเริ่ม</Label><ThaiDatePicker value={editForm.start_date} onChange={v => setEditForm(f => ({ ...f, start_date: v }))} /></div>
              <div><Label>วันสิ้นสุด</Label><ThaiDatePicker value={editForm.end_date} onChange={v => setEditForm(f => ({ ...f, end_date: v }))} /></div>
            </div>
          </div>
          </DialogBody>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditOpen(false)}>ยกเลิก</Button>
            <Button onClick={saveSol} disabled={saving || !editForm.title.trim()}>{saving ? 'กำลังบันทึก…' : 'บันทึก'}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <ConfirmDeleteDialog
        open={deleteNoteConfirm.open}
        onOpenChange={(o) => setDeleteNoteConfirm((s) => ({ ...s, open: o }))}
        title="ลบ Note"
        description={notes.find(n => n.id === deleteNoteConfirm.noteId)?.attachments?.length
          ? 'ไฟล์แนบทั้งหมดจะถูกลบด้วย การกระทำนี้ไม่สามารถย้อนกลับได้'
          : 'การกระทำนี้ไม่สามารถย้อนกลับได้'}
        onConfirm={doDeleteNote}
      />
    </PageShell>
  );
}
