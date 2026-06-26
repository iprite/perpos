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
import { StatusBadge, type BadgeTone } from "@/components/ui/badge";
import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
  TableEmpty,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogBody,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Building2,
  Plus,
  BookOpenText,
  Users,
  ArrowUpRight,
  Calculator,
  UserCog,
  ShieldCheck,
  ShieldOff,
  BookOpen,
} from "lucide-react";

// ── Types ──────────────────────────────────────────────────────────────────────
type ClientRow = {
  id: string;
  status: "active" | "inactive" | "ended";
  modules_managed: string[];
  note: string | null;
  started_at: string | null;
  created_at: string;
  client_org: { id: string; name: string; slug: string };
};

type OrgOption = { value: string; label: string };

type FirmMember = {
  userId: string;
  firmRole: string;
  displayName: string;
  email: string;
  avatarUrl: string | null;
  hasAccess: boolean;
  accessModules: string[];
};

type Engagement = {
  id: string;
  modulesManaged: string[];
  status: string;
};

// ── Constants ──────────────────────────────────────────────────────────────────
const STATUS_OPTIONS = [
  { value: "active", label: "Active" },
  { value: "inactive", label: "Inactive" },
  { value: "ended", label: "Ended" },
];

const STATUS_TONE: Record<string, BadgeTone> = {
  active: "success",
  inactive: "neutral",
  ended: "danger",
};

// module key ต้องตรงกับ ALL_MODULE_KEYS (lib/modules.ts) — payroll ถูกยุบเป็น hrm แล้ว
const MODULE_OPTIONS = [
  { value: "accounting", label: "Accounting" },
  { value: "hrm", label: "HR" },
];

const MODULE_ICON: Record<string, React.ReactNode> = {
  accounting: <BookOpenText className="h-3.5 w-3.5" />,
  hrm: <Users className="h-3.5 w-3.5" />,
};

const EMPTY_FORM = {
  clientOrgId: "",
  modulesManaged: ["accounting"] as string[],
  note: "",
  startedAt: "",
};

// ── Avatar placeholder ─────────────────────────────────────────────────────────
function Avatar({ name, url }: { name: string; url: string | null }) {
  const initials = name
    .split(" ")
    .map((w) => w[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
  if (url) return <img src={url} alt={name} className="h-8 w-8 rounded-full object-cover" />;
  return (
    <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-teal-100 text-xs font-bold text-teal-700">
      {initials}
    </div>
  );
}

// ── Main page ──────────────────────────────────────────────────────────────────
export default function AccFirmClientsPage() {
  const { orgSlug } = useParams<{ orgSlug: string }>();
  const supabase = useMemo(() => createSupabaseBrowserClient(), []);

  const [orgId, setOrgId] = useState("");
  const [token, setToken] = useState("");
  const [clients, setClients] = useState<ClientRow[]>([]);
  const [allOrgs, setAllOrgs] = useState<OrgOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [showAdd, setShowAdd] = useState(false);
  const [editRow, setEditRow] = useState<ClientRow | null>(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [filterStatus, setFilterStatus] = useState("");

  // Provision dialog state
  const [provClient, setProvClient] = useState<ClientRow | null>(null);
  const [firmMembers, setFirmMembers] = useState<FirmMember[]>([]);
  const [engagement, setEngagement] = useState<Engagement | null>(null);
  const [provLoading, setProvLoading] = useState(false);
  const [provSaving, setProvSaving] = useState<string | null>(null); // userId being toggled

  // ── Load clients ──────────────────────────────────────────────────────────
  const load = useCallback(async () => {
    setLoading(true);
    const [{ data: org }, { data: sess }] = await Promise.all([
      supabase.from("organizations").select("id").eq("slug", orgSlug).single(),
      supabase.auth.getSession(),
    ]);
    if (!org || !sess.session) {
      setLoading(false);
      return;
    }
    const tok = sess.session.access_token;
    setOrgId(org.id);
    setToken(tok);

    const [clientsRes, orgsRes] = await Promise.all([
      fetch(`/api/acc-firm/clients?orgId=${org.id}`, {
        headers: { Authorization: `Bearer ${tok}` },
      }),
      supabase.from("organizations").select("id, name").order("name"),
    ]);

    if (clientsRes.ok) {
      const json = await clientsRes.json();
      setClients(json.clients ?? []);
    }
    if (orgsRes.data) {
      setAllOrgs(orgsRes.data.map((o) => ({ value: o.id, label: o.name })));
    }
    setLoading(false);
  }, [supabase, orgSlug]);

  useEffect(() => {
    load();
  }, [load]);

  // ── Load provision data when dialog opens ─────────────────────────────────
  const openProvision = useCallback(
    async (client: ClientRow) => {
      setProvClient(client);
      setFirmMembers([]);
      setEngagement(null);
      setProvLoading(true);
      const res = await fetch(
        `/api/acc-firm/provision?firmOrgId=${orgId}&clientOrgId=${client.client_org.id}`,
        { headers: { Authorization: `Bearer ${token}` } },
      );
      if (res.ok) {
        const json = await res.json();
        setFirmMembers(json.members ?? []);
        setEngagement(json.engagement ?? null);
      }
      setProvLoading(false);
    },
    [orgId, token],
  );

  // ── Toggle access for a firm member ──────────────────────────────────────
  const toggleAccess = useCallback(
    async (member: FirmMember) => {
      if (!provClient) return;
      setProvSaving(member.userId);

      const res = member.hasAccess
        ? await fetch("/api/acc-firm/provision", {
            method: "DELETE",
            headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
            body: JSON.stringify({
              firmOrgId: orgId,
              clientOrgId: provClient.client_org.id,
              userId: member.userId,
            }),
          })
        : await fetch("/api/acc-firm/provision", {
            method: "POST",
            headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
            body: JSON.stringify({
              firmOrgId: orgId,
              clientOrgId: provClient.client_org.id,
              userId: member.userId,
              modules: engagement?.modulesManaged ?? provClient.modules_managed,
            }),
          });

      // Refresh members list
      await openProvision(provClient);
      setProvSaving(null);
      if (!res.ok) {
        toast.error("ปรับสิทธิ์เข้าถึงไม่สำเร็จ");
        return;
      }
      toast.success(member.hasAccess ? "ยกเลิกสิทธิ์เข้าถึงแล้ว" : "ให้สิทธิ์เข้าถึงแล้ว");
    },
    [provClient, orgId, token, engagement, openProvision],
  );

  // ── Available orgs (exclude already-added + self) ─────────────────────────
  const usedOrgIds = useMemo(
    () => new Set([orgId, ...clients.map((c) => c.client_org.id)]),
    [orgId, clients],
  );
  const availableOrgs = useMemo(
    () => allOrgs.filter((o) => !usedOrgIds.has(o.value)),
    [allOrgs, usedOrgIds],
  );

  // ── Toggle module in add/edit form ────────────────────────────────────────
  const toggleModule = (mod: string) => {
    setForm((f) => ({
      ...f,
      modulesManaged: f.modulesManaged.includes(mod)
        ? f.modulesManaged.filter((m) => m !== mod)
        : [...f.modulesManaged, mod],
    }));
  };

  // ── Save add ──────────────────────────────────────────────────────────────
  const handleAdd = async () => {
    if (!form.clientOrgId) return;
    setSaving(true);
    const res = await fetch("/api/acc-firm/clients", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({
        firmOrgId: orgId,
        clientOrgId: form.clientOrgId,
        modulesManaged: form.modulesManaged,
        note: form.note || null,
        startedAt: form.startedAt || null,
      }),
    });
    setSaving(false);
    if (res.ok) {
      setShowAdd(false);
      load();
      toast.success("เพิ่มลูกค้าแล้ว");
    } else {
      const e = await res.json();
      toast.error(e.error ?? "เพิ่มลูกค้าไม่สำเร็จ");
    }
  };

  // ── Save edit ─────────────────────────────────────────────────────────────
  const handleEdit = async () => {
    if (!editRow) return;
    setSaving(true);
    const res = await fetch("/api/acc-firm/clients", {
      method: "PATCH",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({
        id: editRow.id,
        firmOrgId: orgId,
        status: editRow.status,
        modulesManaged: form.modulesManaged,
        note: form.note || null,
      }),
    });
    setSaving(false);
    if (res.ok) {
      setEditRow(null);
      load();
      toast.success("บันทึกการแก้ไขแล้ว");
    } else {
      const e = await res.json();
      toast.error(e.error ?? "บันทึกไม่สำเร็จ");
    }
  };

  const openEdit = (row: ClientRow) => {
    setEditRow(row);
    setForm({
      clientOrgId: row.client_org.id,
      modulesManaged: row.modules_managed,
      note: row.note ?? "",
      startedAt: row.started_at ?? "",
    });
  };

  // ── Filter ────────────────────────────────────────────────────────────────
  const filtered = filterStatus ? clients.filter((c) => c.status === filterStatus) : clients;

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <PageShell
      width="wide"
      icon={<Calculator className="h-6 w-6" />}
      title="Client Orgs"
      description="องค์กรที่อยู่ในการกำกับดูแลของสำนักงานบัญชี"
      actions={
        <Button
          onClick={() => {
            setForm(EMPTY_FORM);
            setShowAdd(true);
          }}
          className="gap-1.5"
        >
          <Plus className="h-4 w-4" /> เพิ่ม Client Org
        </Button>
      }
    >
      {/* Filter */}
      <div className="flex items-center gap-2">
        <Label className="shrink-0 text-xs text-slate-500">กรอง:</Label>
        <CustomSelect
          value={filterStatus}
          onChange={setFilterStatus}
          options={[{ value: "", label: "ทั้งหมด" }, ...STATUS_OPTIONS]}
          className="w-36"
        />
      </div>

      {/* Table */}
      {!loading && filtered.length === 0 ? (
        <div className="space-y-2 rounded-xl border bg-white p-8 text-center text-sm text-slate-300">
          <Building2 className="mx-auto h-8 w-8 text-slate-200" />
          <p>{filterStatus ? "ไม่มี client ในสถานะนี้" : "ยังไม่มี client org"}</p>
        </div>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>องค์กร</TableHead>
              <TableHead>Modules</TableHead>
              <TableHead>เริ่มดูแล</TableHead>
              <TableHead>สถานะ</TableHead>
              <TableHead>หมายเหตุ</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              <TableEmpty colSpan={5}>กำลังโหลด…</TableEmpty>
            ) : (
              filtered.map((c) => (
                <TableRow key={c.id} clickable onClick={() => openEdit(c)}>
                  <TableCell>
                    <p className="font-semibold text-slate-800">{c.client_org.name}</p>
                    <p className="text-xs text-slate-400">{c.client_org.slug}</p>
                  </TableCell>
                  <TableCell>
                    <div className="flex gap-1">
                      {c.modules_managed.map((m) => (
                        <span
                          key={m}
                          className="flex items-center gap-1 whitespace-nowrap rounded bg-slate-100 px-1.5 py-0.5 text-xs text-slate-600"
                        >
                          {MODULE_ICON[m]} {m}
                        </span>
                      ))}
                    </div>
                  </TableCell>
                  <TableCell className="text-xs text-slate-500">{c.started_at ?? "—"}</TableCell>
                  <TableCell>
                    <StatusBadge tone={STATUS_TONE[c.status] ?? "neutral"}>
                      {STATUS_OPTIONS.find((s) => s.value === c.status)?.label ?? c.status}
                    </StatusBadge>
                  </TableCell>
                  <TableCell className="max-w-[160px] truncate text-xs text-slate-400">
                    {c.note ?? "—"}
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      )}

      {/* ── Add Dialog ──────────────────────────────────────────────────────── */}
      <Dialog open={showAdd} onOpenChange={setShowAdd}>
        <DialogContent size="md">
          <DialogHeader>
            <DialogTitle>เพิ่ม Client Org</DialogTitle>
          </DialogHeader>
          <DialogBody>
            <div className="space-y-4">
              <div className="space-y-1.5">
                <Label>องค์กรลูกค้า *</Label>
                <CustomSelect
                  value={form.clientOrgId}
                  onChange={(v) => setForm((f) => ({ ...f, clientOrgId: v }))}
                  options={[{ value: "", label: "— เลือกองค์กร —" }, ...availableOrgs]}
                />
              </div>
              <div className="space-y-1.5">
                <Label>Modules ที่จะดูแล *</Label>
                <div className="flex flex-wrap gap-2">
                  {MODULE_OPTIONS.map((m) => (
                    <button
                      key={m.value}
                      type="button"
                      onClick={() => toggleModule(m.value)}
                      className={`flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-sm transition-colors ${
                        form.modulesManaged.includes(m.value)
                          ? "border-teal-300 bg-teal-50 text-teal-700"
                          : "border-slate-200 text-slate-500 hover:border-slate-300"
                      }`}
                    >
                      {MODULE_ICON[m.value]} {m.label}
                    </button>
                  ))}
                </div>
              </div>
              <div className="space-y-1.5">
                <Label>วันที่เริ่มดูแล</Label>
                <ThaiDatePicker
                  value={form.startedAt}
                  onChange={(v) => setForm((f) => ({ ...f, startedAt: v }))}
                  placeholder="เลือกวันที่"
                />
              </div>
              <div className="space-y-1.5">
                <Label>หมายเหตุ</Label>
                <Input
                  value={form.note}
                  onChange={(e) => setForm((f) => ({ ...f, note: e.target.value }))}
                  placeholder="เช่น รับดูแลบัญชีรายเดือน"
                />
              </div>
            </div>
          </DialogBody>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowAdd(false)} disabled={saving}>
              ยกเลิก
            </Button>
            <Button
              onClick={handleAdd}
              disabled={saving || !form.clientOrgId || form.modulesManaged.length === 0}
            >
              {saving ? "กำลังบันทึก…" : "เพิ่ม"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Edit Dialog ─────────────────────────────────────────────────────── */}
      <Dialog
        open={!!editRow}
        onOpenChange={(v) => {
          if (!v) setEditRow(null);
        }}
      >
        <DialogContent size="md">
          <DialogHeader>
            <DialogTitle>แก้ไข — {editRow?.client_org.name}</DialogTitle>
          </DialogHeader>
          <DialogBody>
            <div className="space-y-4">
              <div className="space-y-1.5">
                <Label>Modules ที่ดูแล *</Label>
                <div className="flex flex-wrap gap-2">
                  {MODULE_OPTIONS.map((m) => (
                    <button
                      key={m.value}
                      type="button"
                      onClick={() => toggleModule(m.value)}
                      className={`flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-sm transition-colors ${
                        form.modulesManaged.includes(m.value)
                          ? "border-teal-300 bg-teal-50 text-teal-700"
                          : "border-slate-200 text-slate-500 hover:border-slate-300"
                      }`}
                    >
                      {MODULE_ICON[m.value]} {m.label}
                    </button>
                  ))}
                </div>
              </div>
              <div className="space-y-1.5">
                <Label>สถานะ</Label>
                <CustomSelect
                  value={editRow?.status ?? "active"}
                  onChange={(v) =>
                    setEditRow((r) => (r ? { ...r, status: v as ClientRow["status"] } : r))
                  }
                  options={STATUS_OPTIONS}
                />
              </div>
              <div className="space-y-1.5">
                <Label>หมายเหตุ</Label>
                <Input
                  value={form.note}
                  onChange={(e) => setForm((f) => ({ ...f, note: e.target.value }))}
                  placeholder="หมายเหตุ"
                />
              </div>
              {/* Quick actions */}
              {editRow?.status === "active" && (
                <div className="flex flex-wrap gap-2 border-t pt-3">
                  {editRow.modules_managed.includes("accounting") && (
                    <Link href={`/${editRow.client_org.slug}/accounting`} target="_blank">
                      <Button size="sm" variant="outline" className="gap-1.5 text-xs">
                        <BookOpenText className="h-3.5 w-3.5" /> เปิด Accounting{" "}
                        <ArrowUpRight className="h-3 w-3" />
                      </Button>
                    </Link>
                  )}
                  <Button
                    size="sm"
                    variant="outline"
                    className="gap-1.5 border-teal-200 text-xs text-teal-700 hover:bg-teal-50"
                    onClick={() => {
                      const c = editRow;
                      setEditRow(null);
                      openProvision(c);
                    }}
                  >
                    <UserCog className="h-3.5 w-3.5" /> จัดการ Accountants
                  </Button>
                </div>
              )}
            </div>
          </DialogBody>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditRow(null)} disabled={saving}>
              ยกเลิก
            </Button>
            <Button onClick={handleEdit} disabled={saving || form.modulesManaged.length === 0}>
              {saving ? "กำลังบันทึก…" : "บันทึก"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Provision Dialog ─────────────────────────────────────────────────── */}
      <Dialog
        open={!!provClient}
        onOpenChange={(v) => {
          if (!v) setProvClient(null);
        }}
      >
        <DialogContent size="lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <UserCog className="h-5 w-5 text-teal-500" />
              จัดการ Accountants — {provClient?.client_org.name}
            </DialogTitle>
          </DialogHeader>
          <DialogBody>
            {/* Engagement modules info */}
            {engagement && (
              <div className="flex flex-wrap gap-1.5">
                {engagement.modulesManaged.map((m) => (
                  <span
                    key={m}
                    className="flex items-center gap-1 rounded-full border border-teal-200 bg-teal-50 px-2 py-0.5 text-xs text-teal-700"
                  >
                    {MODULE_ICON[m]} {m}
                  </span>
                ))}
                <span className="ml-1 self-center text-xs text-slate-400">modules ที่จะ grant</span>
              </div>
            )}

            <div className="max-h-[380px] space-y-2 overflow-y-auto py-1">
              {provLoading ? (
                <div className="p-6 text-center text-sm text-slate-400">กำลังโหลด…</div>
              ) : firmMembers.length === 0 ? (
                <div className="p-6 text-center text-sm text-slate-300">ไม่พบสมาชิกใน firm org</div>
              ) : (
                firmMembers.map((m) => {
                  const isSaving = provSaving === m.userId;
                  return (
                    <div
                      key={m.userId}
                      className={`flex items-center gap-3 rounded-xl border px-3 py-2.5 transition-colors ${
                        m.hasAccess ? "border-teal-200 bg-teal-50" : "border-slate-100 bg-white"
                      }`}
                    >
                      <Avatar name={m.displayName} url={m.avatarUrl} />
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium text-slate-800">
                          {m.displayName}
                        </p>
                        <p className="truncate text-xs text-slate-400">{m.email}</p>
                      </div>

                      {/* Access status */}
                      <div className="flex shrink-0 items-center gap-2">
                        {m.hasAccess ? (
                          <div className="flex gap-1">
                            {m.accessModules.map((mod) => (
                              <span
                                key={mod}
                                className="flex items-center gap-0.5 rounded bg-teal-100 px-1.5 py-0.5 text-xs text-teal-700"
                              >
                                {mod === "accounting" ? (
                                  <BookOpen className="h-3 w-3" />
                                ) : (
                                  <Users className="h-3 w-3" />
                                )}
                              </span>
                            ))}
                          </div>
                        ) : null}

                        <button
                          type="button"
                          disabled={isSaving}
                          onClick={() => toggleAccess(m)}
                          className={`flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs font-medium transition-colors disabled:opacity-50 ${
                            m.hasAccess
                              ? "border-red-200 text-red-600 hover:bg-red-50"
                              : "border-teal-300 text-teal-700 hover:bg-teal-50"
                          }`}
                        >
                          {isSaving ? (
                            <span className="animate-pulse">…</span>
                          ) : m.hasAccess ? (
                            <>
                              <ShieldOff className="h-3.5 w-3.5" /> ถอดสิทธิ์
                            </>
                          ) : (
                            <>
                              <ShieldCheck className="h-3.5 w-3.5" /> Grant
                            </>
                          )}
                        </button>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </DialogBody>

          <DialogFooter>
            <Button variant="outline" onClick={() => setProvClient(null)}>
              ปิด
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </PageShell>
  );
}
