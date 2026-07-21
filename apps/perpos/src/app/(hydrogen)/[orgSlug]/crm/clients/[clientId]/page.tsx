"use client";

import { useEffect, useState, useCallback, useMemo } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import { toast } from "@/lib/toast";
import { Button } from "@/components/ui/button";
import { PageShell } from "@/components/ui/page-shell";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { CustomSelect } from "@/components/ui/custom-select";
import { ThaiDatePicker } from "@/components/ui/thai-date-picker";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogBody,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { ConfirmDeleteDialog } from "@/components/ui/confirm-delete-dialog";
import {
  Plus,
  Building2,
  Phone,
  Mail,
  MapPin,
  Briefcase,
  Pencil,
  Trash2,
  Star,
  UserPlus,
  MessageSquare,
} from "lucide-react";

// ── Types ────────────────────────────────────────────────────────────────────

type Client = {
  id: string;
  name: string;
  contact_name: string | null;
  phone: string | null;
  email: string | null;
  address: string | null;
  industry: string | null;
  notes: string | null;
  status: string;
};

type Contact = {
  id: string;
  name: string;
  position: string | null;
  phone: string | null;
  email: string | null;
  line_id: string | null;
  is_primary: boolean;
};

type Solution = {
  id: string;
  title: string;
  status: string;
  priority: string;
  value: number | null;
  start_date: string | null;
  end_date: string | null;
  description: string | null;
  tags: string[];
};

// ── Config ───────────────────────────────────────────────────────────────────

const CLIENT_STATUS_OPTS = [
  { value: "active", label: "Active" },
  { value: "prospect", label: "Prospect" },
  { value: "inactive", label: "Inactive" },
];

const SOL_STATUS_OPTS = [
  { value: "lead", label: "Lead" },
  { value: "proposal", label: "Proposal" },
  { value: "in_progress", label: "In Progress" },
  { value: "on_hold", label: "On Hold" },
  { value: "completed", label: "Completed" },
  { value: "cancelled", label: "Cancelled" },
];

const PRIORITY_OPTS = [
  { value: "low", label: "Low" },
  { value: "medium", label: "Medium" },
  { value: "high", label: "High" },
  { value: "urgent", label: "Urgent" },
];

const STATUS_COLOR: Record<string, string> = {
  lead: "bg-slate-100 text-slate-600",
  proposal: "bg-blue-100 text-blue-700",
  in_progress: "bg-amber-100 text-amber-700",
  on_hold: "bg-orange-100 text-orange-700",
  completed: "bg-green-100 text-green-700",
  cancelled: "bg-red-100 text-red-600",
};

const PRIORITY_COLOR: Record<string, string> = {
  low: "#9CA3AF",
  medium: "#4FC1E9",
  high: "#FC6E51",
  urgent: "#D8334A",
};

const EMPTY_SOL = {
  title: "",
  description: "",
  status: "lead",
  priority: "medium",
  value: "",
  start_date: "",
  end_date: "",
  tags: "",
};
const EMPTY_CONTACT = {
  name: "",
  position: "",
  phone: "",
  email: "",
  line_id: "",
  is_primary: false,
};

// ── Page ─────────────────────────────────────────────────────────────────────

export default function ClientDetailPage() {
  const { orgSlug, clientId } = useParams<{ orgSlug: string; clientId: string }>();
  const supabase = useMemo(() => createSupabaseBrowserClient(), []);
  const [orgId, setOrgId] = useState("");
  const [token, setToken] = useState("");
  const [client, setClient] = useState<Client | null>(null);
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [solutions, setSolutions] = useState<Solution[]>([]);
  const [loading, setLoading] = useState(true);

  // Client edit dialog
  const [editClientOpen, setEditClientOpen] = useState(false);
  const [clientForm, setClientForm] = useState({
    name: "",
    contact_name: "",
    phone: "",
    email: "",
    address: "",
    industry: "",
    notes: "",
    status: "active",
  });
  const [savingClient, setSavingClient] = useState(false);

  // Solution dialog
  const [solOpen, setSolOpen] = useState(false);
  const [solForm, setSolForm] = useState(EMPTY_SOL);
  const [savingSol, setSavingSol] = useState(false);
  const [editSolId, setEditSolId] = useState<string | null>(null);

  // Contact dialog
  const [contactOpen, setContactOpen] = useState(false);
  const [contactForm, setContactForm] = useState(EMPTY_CONTACT);
  const [savingContact, setSavingContact] = useState(false);
  const [editContactId, setEditContactId] = useState<string | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState<{
    open: boolean;
    type: "solution" | "contact" | null;
    id: string;
  }>({ open: false, type: null, id: "" });

  // ── Auth & load ────────────────────────────────────────────────────────────

  const initAuth = useCallback(async () => {
    const { data: orgs } = await supabase
      .from("organizations")
      .select("id")
      .eq("slug", orgSlug)
      .single();
    const { data: sess } = await supabase.auth.getSession();
    if (orgs && sess.session) {
      setOrgId(orgs.id);
      setToken(sess.session.access_token);
    }
  }, [supabase, orgSlug]);

  const loadAll = useCallback(
    async (oid: string, tok: string) => {
      setLoading(true);
      const [clientRes, contactsRes, solutionsRes] = await Promise.all([
        fetch(`/api/crm/clients/${clientId}?orgId=${oid}`, {
          headers: { Authorization: `Bearer ${tok}` },
        }),
        fetch(`/api/crm/clients/${clientId}/contacts?orgId=${oid}`, {
          headers: { Authorization: `Bearer ${tok}` },
        }),
        fetch(`/api/crm/solutions?orgId=${oid}&clientId=${clientId}`, {
          headers: { Authorization: `Bearer ${tok}` },
        }),
      ]);
      if (clientRes.ok) {
        const d = await clientRes.json();
        setClient(d);
        setClientForm({
          name: d.name,
          contact_name: d.contact_name ?? "",
          phone: d.phone ?? "",
          email: d.email ?? "",
          address: d.address ?? "",
          industry: d.industry ?? "",
          notes: d.notes ?? "",
          status: d.status,
        });
      }
      if (contactsRes.ok) setContacts(await contactsRes.json());
      if (solutionsRes.ok) setSolutions(await solutionsRes.json());
      setLoading(false);
    },
    [clientId],
  );

  useEffect(() => {
    initAuth();
  }, [initAuth]);
  useEffect(() => {
    if (orgId && token) loadAll(orgId, token);
  }, [loadAll, orgId, token]);

  // ── Client edit ────────────────────────────────────────────────────────────

  const saveClient = async () => {
    setSavingClient(true);
    const res = await fetch(`/api/crm/clients/${clientId}?orgId=${orgId}`, {
      method: "PUT",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify(clientForm),
    });
    setSavingClient(false);
    if (!res.ok) {
      toast.error("บันทึกไม่สำเร็จ");
      return;
    }
    setEditClientOpen(false);
    toast.success("บันทึกข้อมูลลูกค้าแล้ว");
    loadAll(orgId, token);
  };

  // ── Solution CRUD ──────────────────────────────────────────────────────────

  const openAddSol = () => {
    setEditSolId(null);
    setSolForm(EMPTY_SOL);
    setSolOpen(true);
  };
  const openEditSol = (s: Solution) => {
    setEditSolId(s.id);
    setSolForm({
      title: s.title,
      description: s.description ?? "",
      status: s.status,
      priority: s.priority,
      value: String(s.value ?? ""),
      start_date: s.start_date ?? "",
      end_date: s.end_date ?? "",
      tags: (s.tags ?? []).join(", "),
    });
    setSolOpen(true);
  };

  const saveSol = async () => {
    setSavingSol(true);
    const tagsArr = solForm.tags
      .split(",")
      .map((t) => t.trim())
      .filter(Boolean);
    const body = {
      ...solForm,
      client_id: clientId,
      value: solForm.value ? Number(solForm.value) : null,
      start_date: solForm.start_date || null,
      end_date: solForm.end_date || null,
      tags: tagsArr,
    };
    const url = editSolId
      ? `/api/crm/solutions/${editSolId}?orgId=${orgId}`
      : `/api/crm/solutions?orgId=${orgId}`;
    const method = editSolId ? "PUT" : "POST";
    const res = await fetch(url, {
      method,
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      toast.error(`บันทึกไม่สำเร็จ: ${err.error ?? res.status}`);
      setSavingSol(false);
      return;
    }
    setSavingSol(false);
    setSolOpen(false);
    toast.success(editSolId ? "แก้ไขโซลูชันแล้ว" : "เพิ่มโซลูชันแล้ว");
    await loadAll(orgId, token);
  };

  const doDelete = async () => {
    const { type, id } = deleteConfirm;
    let ok = false;
    if (type === "solution") {
      const res = await fetch(`/api/crm/solutions/${id}?orgId=${orgId}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token}` },
      });
      ok = res.ok;
      if (ok) setSolutions((prev) => prev.filter((s) => s.id !== id));
    } else if (type === "contact") {
      const res = await fetch(
        `/api/crm/clients/${clientId}/contacts?orgId=${orgId}&contactId=${id}`,
        { method: "DELETE", headers: { Authorization: `Bearer ${token}` } },
      );
      ok = res.ok;
      if (ok) setContacts((prev) => prev.filter((c) => c.id !== id));
    }
    setDeleteConfirm({ open: false, type: null, id: "" });
    if (ok) toast.success(type === "solution" ? "ลบโซลูชันแล้ว" : "ลบผู้ติดต่อแล้ว");
    else toast.error("ลบไม่สำเร็จ");
  };

  // ── Contact CRUD ───────────────────────────────────────────────────────────

  const openAddContact = () => {
    setEditContactId(null);
    setContactForm(EMPTY_CONTACT);
    setContactOpen(true);
  };
  const openEditContact = (c: Contact) => {
    setEditContactId(c.id);
    setContactForm({
      name: c.name,
      position: c.position ?? "",
      phone: c.phone ?? "",
      email: c.email ?? "",
      line_id: c.line_id ?? "",
      is_primary: c.is_primary,
    });
    setContactOpen(true);
  };

  const saveContact = async () => {
    setSavingContact(true);
    const url = editContactId
      ? `/api/crm/clients/${clientId}/contacts?orgId=${orgId}&contactId=${editContactId}`
      : `/api/crm/clients/${clientId}/contacts?orgId=${orgId}`;
    const method = editContactId ? "PUT" : "POST";
    const saveRes = await fetch(url, {
      method,
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify(contactForm),
    });
    setSavingContact(false);
    if (!saveRes.ok) {
      toast.error("บันทึกผู้ติดต่อไม่สำเร็จ");
      return;
    }
    setContactOpen(false);
    toast.success(editContactId ? "แก้ไขผู้ติดต่อแล้ว" : "เพิ่มผู้ติดต่อแล้ว");
    const res = await fetch(`/api/crm/clients/${clientId}/contacts?orgId=${orgId}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (res.ok) setContacts(await res.json());
  };

  // ── Render ─────────────────────────────────────────────────────────────────

  if (loading) return <div className="p-6 text-center text-sm text-slate-400">กำลังโหลด…</div>;
  if (!client) return <div className="p-6 text-sm text-red-500">ไม่พบลูกค้า</div>;

  return (
    <PageShell width="wide">
      {/* ── Client info card ── */}
      <div className="rounded-xl border bg-white p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="flex items-start gap-4">
            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-indigo-100">
              <Building2 className="h-6 w-6 text-indigo-500" />
            </div>
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <h1 className="text-lg font-bold text-slate-900">{client.name}</h1>
                <span
                  className={`rounded-full px-2 py-0.5 text-xs font-medium ${client.status === "active" ? "bg-green-100 text-green-700" : client.status === "prospect" ? "bg-blue-100 text-blue-700" : "bg-slate-100 text-slate-500"}`}
                >
                  {client.status}
                </span>
              </div>
              <div className="mt-1.5 flex flex-wrap gap-x-4 gap-y-1 text-sm text-slate-500">
                {client.contact_name && <span>{client.contact_name}</span>}
                {client.phone && (
                  <span className="flex items-center gap-1">
                    <Phone className="h-3.5 w-3.5" />
                    {client.phone}
                  </span>
                )}
                {client.email && (
                  <span className="flex items-center gap-1">
                    <Mail className="h-3.5 w-3.5" />
                    {client.email}
                  </span>
                )}
                {client.industry && (
                  <span className="flex items-center gap-1">
                    <Briefcase className="h-3.5 w-3.5" />
                    {client.industry}
                  </span>
                )}
                {client.address && (
                  <span className="flex items-center gap-1">
                    <MapPin className="h-3.5 w-3.5" />
                    {client.address}
                  </span>
                )}
              </div>
              {client.notes && <p className="mt-2 text-sm text-slate-400">{client.notes}</p>}
            </div>
          </div>
          <Button variant="outline" size="sm" onClick={() => setEditClientOpen(true)}>
            <Pencil className="mr-1 h-3.5 w-3.5" /> แก้ไขข้อมูล
          </Button>
        </div>
      </div>

      {/* ── Contacts ── */}
      <div>
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-base font-semibold text-slate-800">ผู้ติดต่อ ({contacts.length})</h2>
          <Button size="sm" variant="outline" onClick={openAddContact}>
            <UserPlus className="mr-1 h-4 w-4" /> เพิ่มผู้ติดต่อ
          </Button>
        </div>
        {contacts.length === 0 ? (
          <div className="rounded-xl border bg-white p-6 text-center text-sm text-slate-400">
            ยังไม่มีผู้ติดต่อ
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {contacts.map((c) => (
              <div
                key={c.id}
                className="group flex items-start gap-3 rounded-xl border bg-white p-4 transition-shadow hover:shadow-sm"
              >
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-slate-100 text-sm font-bold text-slate-500">
                  {c.name.charAt(0).toUpperCase()}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-sm font-semibold text-slate-800">{c.name}</span>
                    {c.is_primary && (
                      <span className="flex items-center gap-0.5 rounded-full bg-amber-50 px-1.5 py-0.5 text-xs text-amber-600">
                        <Star className="h-3 w-3" /> หลัก
                      </span>
                    )}
                  </div>
                  {c.position && <p className="mt-0.5 text-xs text-slate-500">{c.position}</p>}
                  <div className="mt-1 flex flex-wrap gap-x-3 gap-y-0.5">
                    {c.phone && (
                      <span className="flex items-center gap-1 text-xs text-slate-400">
                        <Phone className="h-3 w-3" />
                        {c.phone}
                      </span>
                    )}
                    {c.email && (
                      <span className="flex items-center gap-1 text-xs text-slate-400">
                        <Mail className="h-3 w-3" />
                        {c.email}
                      </span>
                    )}
                    {c.line_id && <span className="text-xs text-slate-400">LINE: {c.line_id}</span>}
                  </div>
                </div>
                <div className="flex shrink-0 gap-1 opacity-0 transition-opacity group-hover:opacity-100">
                  <button
                    onClick={() => openEditContact(c)}
                    className="p-1 text-slate-300 hover:text-indigo-400"
                  >
                    <Pencil className="h-3.5 w-3.5" />
                  </button>
                  <button
                    onClick={() => setDeleteConfirm({ open: true, type: "contact", id: c.id })}
                    className="p-1 text-slate-300 hover:text-red-400"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* ── Solutions ── */}
      <div>
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-base font-semibold text-slate-800">Solutions ({solutions.length})</h2>
          <Button size="sm" onClick={openAddSol}>
            <Plus className="mr-1 h-4 w-4" /> เพิ่ม Solution
          </Button>
        </div>
        {solutions.length === 0 ? (
          <div className="rounded-xl border bg-white p-8 text-center text-sm text-slate-400">
            ยังไม่มี solution
          </div>
        ) : (
          <div className="space-y-2">
            {solutions.map((s) => {
              const sc = STATUS_COLOR[s.status] ?? "bg-slate-100 text-slate-600";
              return (
                <div
                  key={s.id}
                  className="group flex items-start gap-3 rounded-xl border bg-white p-4 transition-shadow hover:shadow-sm"
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <Link
                        href={`/${orgSlug}/crm/solutions/${s.id}`}
                        className="text-sm font-semibold text-slate-800 hover:text-indigo-600"
                      >
                        {s.title}
                      </Link>
                      <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${sc}`}>
                        {SOL_STATUS_OPTS.find((x) => x.value === s.status)?.label ?? s.status}
                      </span>
                      <span
                        className="text-xs font-medium"
                        style={{ color: PRIORITY_COLOR[s.priority] ?? "#9CA3AF" }}
                      >
                        {s.priority}
                      </span>
                    </div>
                    {s.description && (
                      <p className="mt-1 text-xs text-slate-400">{s.description}</p>
                    )}
                    <div className="mt-1.5 flex flex-wrap items-center gap-3">
                      {s.value != null && (
                        <span className="text-xs font-medium text-slate-500">
                          ฿{s.value.toLocaleString("th-TH")}
                        </span>
                      )}
                      {s.start_date && (
                        <span className="text-xs text-slate-400">เริ่ม {s.start_date}</span>
                      )}
                      {s.end_date && (
                        <span className="text-xs text-slate-400">สิ้นสุด {s.end_date}</span>
                      )}
                      {s.tags?.map((tag) => (
                        <span
                          key={tag}
                          className="rounded bg-indigo-50 px-1.5 py-0.5 text-xs text-indigo-600"
                        >
                          {tag}
                        </span>
                      ))}
                    </div>
                  </div>
                  <div className="flex shrink-0 gap-1 opacity-0 transition-opacity group-hover:opacity-100">
                    <Link href={`/${orgSlug}/crm/solutions/${s.id}`}>
                      <Button variant="ghost" size="icon" className="h-7 w-7">
                        <MessageSquare className="h-3.5 w-3.5" />
                      </Button>
                    </Link>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-7 px-2 text-xs"
                      onClick={() => openEditSol(s)}
                    >
                      แก้ไข
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7 text-red-400 hover:bg-red-50 hover:text-red-500"
                      onClick={() => setDeleteConfirm({ open: true, type: "solution", id: s.id })}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* ── Client Edit Dialog ── */}
      <Dialog open={editClientOpen} onOpenChange={setEditClientOpen}>
        <DialogContent size="lg">
          <DialogHeader>
            <DialogTitle>แก้ไขข้อมูลลูกค้า</DialogTitle>
          </DialogHeader>
          <DialogBody>
            <div className="space-y-3">
              <div>
                <Label htmlFor="ce-name">ชื่อบริษัท *</Label>
                <Input
                  id="ce-name"
                  value={clientForm.name}
                  onChange={(e) => setClientForm((f) => ({ ...f, name: e.target.value }))}
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label htmlFor="ce-contact">ผู้ติดต่อหลัก</Label>
                  <Input
                    id="ce-contact"
                    value={clientForm.contact_name}
                    onChange={(e) => setClientForm((f) => ({ ...f, contact_name: e.target.value }))}
                  />
                </div>
                <div>
                  <Label htmlFor="ce-phone">โทรศัพท์</Label>
                  <Input
                    id="ce-phone"
                    value={clientForm.phone}
                    onChange={(e) => setClientForm((f) => ({ ...f, phone: e.target.value }))}
                  />
                </div>
              </div>
              <div>
                <Label htmlFor="ce-email">Email</Label>
                <Input
                  id="ce-email"
                  type="email"
                  value={clientForm.email}
                  onChange={(e) => setClientForm((f) => ({ ...f, email: e.target.value }))}
                />
              </div>
              <div>
                <Label htmlFor="ce-industry">อุตสาหกรรม</Label>
                <Input
                  id="ce-industry"
                  value={clientForm.industry}
                  onChange={(e) => setClientForm((f) => ({ ...f, industry: e.target.value }))}
                />
              </div>
              <div>
                <Label htmlFor="ce-address">ที่อยู่</Label>
                <Input
                  id="ce-address"
                  value={clientForm.address}
                  onChange={(e) => setClientForm((f) => ({ ...f, address: e.target.value }))}
                />
              </div>
              <div>
                <Label htmlFor="ce-notes">หมายเหตุ</Label>
                <Input
                  id="ce-notes"
                  value={clientForm.notes}
                  onChange={(e) => setClientForm((f) => ({ ...f, notes: e.target.value }))}
                />
              </div>
              <div>
                <Label>สถานะ</Label>
                <CustomSelect
                  value={clientForm.status}
                  onChange={(v) => setClientForm((f) => ({ ...f, status: v }))}
                  options={CLIENT_STATUS_OPTS}
                />
              </div>
            </div>
          </DialogBody>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditClientOpen(false)}>
              ยกเลิก
            </Button>
            <Button onClick={saveClient} disabled={savingClient || !clientForm.name.trim()}>
              {savingClient ? "กำลังบันทึก…" : "บันทึก"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Contact Dialog ── */}
      <Dialog open={contactOpen} onOpenChange={setContactOpen}>
        <DialogContent size="md">
          <DialogHeader>
            <DialogTitle>{editContactId ? "แก้ไขผู้ติดต่อ" : "เพิ่มผู้ติดต่อ"}</DialogTitle>
          </DialogHeader>
          <DialogBody>
            <div className="space-y-3">
              <div>
                <Label htmlFor="ct-name">ชื่อ *</Label>
                <Input
                  id="ct-name"
                  value={contactForm.name}
                  onChange={(e) => setContactForm((f) => ({ ...f, name: e.target.value }))}
                />
              </div>
              <div>
                <Label htmlFor="ct-pos">ตำแหน่ง</Label>
                <Input
                  id="ct-pos"
                  value={contactForm.position}
                  onChange={(e) => setContactForm((f) => ({ ...f, position: e.target.value }))}
                  placeholder="CEO, IT Manager…"
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label htmlFor="ct-phone">โทรศัพท์</Label>
                  <Input
                    id="ct-phone"
                    value={contactForm.phone}
                    onChange={(e) => setContactForm((f) => ({ ...f, phone: e.target.value }))}
                  />
                </div>
                <div>
                  <Label htmlFor="ct-line">LINE ID</Label>
                  <Input
                    id="ct-line"
                    value={contactForm.line_id}
                    onChange={(e) => setContactForm((f) => ({ ...f, line_id: e.target.value }))}
                  />
                </div>
              </div>
              <div>
                <Label htmlFor="ct-email">Email</Label>
                <Input
                  id="ct-email"
                  type="email"
                  value={contactForm.email}
                  onChange={(e) => setContactForm((f) => ({ ...f, email: e.target.value }))}
                />
              </div>
              <label className="flex cursor-pointer select-none items-center gap-2 text-sm text-slate-700">
                <input
                  type="checkbox"
                  checked={contactForm.is_primary}
                  onChange={(e) => setContactForm((f) => ({ ...f, is_primary: e.target.checked }))}
                  className="rounded"
                />
                ตั้งเป็นผู้ติดต่อหลัก
              </label>
            </div>
          </DialogBody>
          <DialogFooter>
            <Button variant="outline" onClick={() => setContactOpen(false)}>
              ยกเลิก
            </Button>
            <Button onClick={saveContact} disabled={savingContact || !contactForm.name.trim()}>
              {savingContact ? "กำลังบันทึก…" : "บันทึก"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Solution Dialog ── */}
      <Dialog open={solOpen} onOpenChange={setSolOpen}>
        <DialogContent size="lg">
          <DialogHeader>
            <DialogTitle>{editSolId ? "แก้ไข Solution" : "เพิ่ม Solution"}</DialogTitle>
          </DialogHeader>
          <DialogBody>
            <div className="space-y-3">
              <div>
                <Label htmlFor="sol-title">ชื่อ *</Label>
                <Input
                  id="sol-title"
                  value={solForm.title}
                  onChange={(e) => setSolForm((f) => ({ ...f, title: e.target.value }))}
                  placeholder="ระบบ ERP, Website…"
                />
              </div>
              <div>
                <Label htmlFor="sol-desc">รายละเอียด</Label>
                <Input
                  id="sol-desc"
                  value={solForm.description}
                  onChange={(e) => setSolForm((f) => ({ ...f, description: e.target.value }))}
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label>Status</Label>
                  <CustomSelect
                    value={solForm.status}
                    onChange={(v) => setSolForm((f) => ({ ...f, status: v }))}
                    options={SOL_STATUS_OPTS}
                  />
                </div>
                <div>
                  <Label>Priority</Label>
                  <CustomSelect
                    value={solForm.priority}
                    onChange={(v) => setSolForm((f) => ({ ...f, priority: v }))}
                    options={PRIORITY_OPTS}
                  />
                </div>
              </div>
              <div>
                <Label htmlFor="sol-value">มูลค่า (บาท)</Label>
                <Input
                  id="sol-value"
                  type="number"
                  value={solForm.value}
                  onChange={(e) => setSolForm((f) => ({ ...f, value: e.target.value }))}
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label>วันเริ่ม</Label>
                  <ThaiDatePicker
                    value={solForm.start_date}
                    onChange={(v) => setSolForm((f) => ({ ...f, start_date: v }))}
                  />
                </div>
                <div>
                  <Label>วันสิ้นสุด</Label>
                  <ThaiDatePicker
                    value={solForm.end_date}
                    onChange={(v) => setSolForm((f) => ({ ...f, end_date: v }))}
                  />
                </div>
              </div>
              <div>
                <Label htmlFor="sol-tags">Tags (คั่นด้วยจุลภาค)</Label>
                <Input
                  id="sol-tags"
                  value={solForm.tags}
                  onChange={(e) => setSolForm((f) => ({ ...f, tags: e.target.value }))}
                  placeholder="ERP, Cloud, Network…"
                />
              </div>
            </div>
          </DialogBody>
          <DialogFooter>
            <Button variant="outline" onClick={() => setSolOpen(false)}>
              ยกเลิก
            </Button>
            <Button onClick={saveSol} disabled={savingSol || !solForm.title.trim()}>
              {savingSol ? "กำลังบันทึก…" : "บันทึก"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <ConfirmDeleteDialog
        open={deleteConfirm.open}
        onOpenChange={(o) => setDeleteConfirm((s) => ({ ...s, open: o }))}
        title={deleteConfirm.type === "contact" ? "ลบผู้ติดต่อ" : "ลบ Solution"}
        description="การกระทำนี้ไม่สามารถย้อนกลับได้"
        onConfirm={doDelete}
      />
    </PageShell>
  );
}
