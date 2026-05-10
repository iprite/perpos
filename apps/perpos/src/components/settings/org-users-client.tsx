"use client";

import React, { useState } from "react";
import cn from "@core/utils/class-names";
import { MoreVertical, Plus, Mail, UserMinus } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { CustomSelect } from "@/components/ui/custom-select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

import {
  updateMemberRoleAction,
  removeMemberAction,
  cancelInviteAction,
  type OrgMemberRow,
  type OrgInviteRow,
} from "@/lib/settings/user-actions";

const ROLE_LABELS: Record<string, string> = {
  owner:  "เจ้าของ",
  admin:  "ผู้ดูแลระบบ",
  member: "สมาชิก",
};

const ROLE_COLORS: Record<string, string> = {
  owner:  "bg-violet-50 text-violet-700",
  admin:  "bg-blue-50 text-blue-700",
  member: "bg-slate-100 text-slate-600",
};

const ROLE_OPTIONS = [
  { value: "owner",  label: "เจ้าของ" },
  { value: "admin",  label: "ผู้ดูแลระบบ" },
  { value: "member", label: "สมาชิก" },
];

function Avatar({ name, avatarUrl }: { name: string; avatarUrl: string | null }) {
  const initials = (name || "?").trim().charAt(0).toUpperCase();
  const colors = ["bg-teal-500", "bg-blue-500", "bg-violet-500", "bg-amber-500", "bg-rose-500"];
  const color = colors[initials.charCodeAt(0) % colors.length];

  if (avatarUrl) {
    return (
      <img
        src={avatarUrl}
        alt={name}
        className="h-9 w-9 rounded-full object-cover ring-1 ring-slate-200"
      />
    );
  }
  return (
    <div className={cn("h-9 w-9 rounded-full flex items-center justify-center text-sm font-semibold text-white", color)}>
      {initials}
    </div>
  );
}

function MemberMenu({
  member,
  organizationId,
  onUpdated,
}: {
  member: OrgMemberRow;
  organizationId: string;
  onUpdated: (updated: OrgMemberRow) => void;
}) {
  const [open, setOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [role, setRole] = useState(member.role);
  const [saving, setSaving] = useState(false);
  const [removing, setRemoving] = useState(false);

  async function handleRoleChange() {
    setSaving(true);
    const res = await updateMemberRoleAction({ organizationId, memberId: member.id, role });
    setSaving(false);
    if (res.ok) {
      onUpdated({ ...member, role });
      setEditOpen(false);
    }
  }

  async function handleRemove() {
    if (!confirm(`ต้องการลบ ${member.display_name ?? member.email} ออกจากองค์กรหรือไม่?`)) return;
    setRemoving(true);
    await removeMemberAction({ organizationId, memberId: member.id });
    setRemoving(false);
    onUpdated({ ...member, role: "member" }); // signal removal via parent
  }

  return (
    <>
      <div className="relative inline-block">
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          className="rounded p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
        >
          <MoreVertical className="h-4 w-4" />
        </button>
        {open && (
          <>
            <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} />
            <div className="absolute right-0 z-20 mt-1 w-36 overflow-hidden rounded-md border border-slate-200 bg-white shadow-md">
              <button
                type="button"
                onClick={() => { setOpen(false); setEditOpen(true); }}
                className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-slate-700 hover:bg-slate-50"
              >
                เปลี่ยนสิทธิ์
              </button>
              <button
                type="button"
                onClick={() => { setOpen(false); handleRemove(); }}
                disabled={removing}
                className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-red-600 hover:bg-red-50"
              >
                <UserMinus className="h-3.5 w-3.5" />
                นำออก
              </button>
            </div>
          </>
        )}
      </div>

      <Dialog open={editOpen} onOpenChange={(v) => { if (!v) setEditOpen(false); }}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>เปลี่ยนสิทธิ์ผู้ใช้งาน</DialogTitle>
          </DialogHeader>
          <div className="py-2 space-y-3">
            <p className="text-sm text-slate-600">{member.display_name ?? member.email}</p>
            <div className="space-y-1.5">
              <Label>สิทธิ์การใช้งาน</Label>
              <CustomSelect
                value={role}
                onChange={(v) => setRole(v as OrgMemberRow["role"])}
                options={ROLE_OPTIONS}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditOpen(false)} disabled={saving}>ยกเลิก</Button>
            <Button onClick={handleRoleChange} disabled={saving}>{saving ? "กำลังบันทึก..." : "บันทึก"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

export function OrgUsersClient({
  organizationId,
  initialMembers,
  initialInvites,
  currentUserId,
}: {
  organizationId: string;
  initialMembers: OrgMemberRow[];
  initialInvites: OrgInviteRow[];
  currentUserId: string;
}) {
  const [tab, setTab] = useState<"members" | "invites">("members");
  const [members, setMembers] = useState<OrgMemberRow[]>(initialMembers);
  const [invites, setInvites] = useState<OrgInviteRow[]>(initialInvites);

  const [inviteOpen, setInviteOpen] = useState(false);
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRole, setInviteRole] = useState("member");
  const [inviting, setInviting] = useState(false);
  const [inviteErr, setInviteErr] = useState<string | null>(null);
  const [inviteSuccess, setInviteSuccess] = useState<string | null>(null);

  async function handleInvite() {
    const email = inviteEmail.trim();
    if (!email) { setInviteErr("กรุณากรอกอีเมล"); return; }
    setInviting(true);
    setInviteErr(null);
    setInviteSuccess(null);

    const redirectTo = `${window.location.origin}/signin`;
    const token = (await fetch("/api/auth/token").then(r => r.json()).catch(() => null))?.token
      ?? null;

    const headers: Record<string, string> = { "Content-Type": "application/json" };

    // Get current session token via Supabase client
    const { createSupabaseBrowserClient } = await import("@/lib/supabase/client");
    const sb = createSupabaseBrowserClient();
    const { data: sess } = await sb.auth.getSession();
    if (sess?.session?.access_token) {
      headers["Authorization"] = `Bearer ${sess.session.access_token}`;
    }

    const res = await fetch("/api/org/invite", {
      method: "POST",
      headers,
      body: JSON.stringify({ email, orgRole: inviteRole, organizationId, redirectTo }),
    });
    const json = await res.json().catch(() => ({}));
    setInviting(false);

    if (!res.ok) {
      setInviteErr(json?.error ?? "ส่งคำเชิญไม่สำเร็จ");
      return;
    }

    setInviteSuccess(`ส่งคำเชิญไปที่ ${email} เรียบร้อยแล้ว`);
    setInviteEmail("");
    setInviteRole("member");

    // Optimistically add to invites tab
    setInvites((prev) => [
      {
        id:         String(Date.now()),
        email,
        org_role:   inviteRole as OrgInviteRow["org_role"],
        status:     "pending",
        created_at: new Date().toISOString(),
        expires_at: new Date(Date.now() + 7 * 86400 * 1000).toISOString(),
      },
      ...prev,
    ]);
  }

  function handleMemberUpdated(updated: OrgMemberRow) {
    setMembers((prev) => {
      const idx = prev.findIndex((m) => m.id === updated.id);
      if (idx < 0) return prev.filter((m) => m.id !== updated.id);
      const copy = [...prev];
      copy[idx] = updated;
      return copy;
    });
  }

  async function handleCancelInvite(invite: OrgInviteRow) {
    await cancelInviteAction({ organizationId, inviteId: invite.id });
    setInvites((prev) => prev.filter((i) => i.id !== invite.id));
  }

  const formatDate = (s: string) =>
    new Date(s).toLocaleDateString("th-TH", { day: "numeric", month: "short", year: "numeric" });

  return (
    <div>
      {/* Header */}
      <div className="mb-6 flex items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <h1 className="text-xl font-semibold text-slate-900">ตั้งค่าผู้ใช้งาน</h1>
          <span className="rounded-full bg-slate-100 px-3 py-0.5 text-sm text-slate-600">
            ผู้ใช้งานปัจจุบัน {members.length} คน
          </span>
        </div>
        <Button onClick={() => { setInviteOpen(true); setInviteErr(null); setInviteSuccess(null); }} size="sm">
          <Plus className="mr-1 h-4 w-4" /> เพิ่มผู้ใช้งานใหม่
        </Button>
      </div>

      {/* Tabs */}
      <div className="mb-4 flex gap-0 border-b border-slate-200">
        {(["members", "invites"] as const).map((t) => (
          <button
            key={t}
            type="button"
            onClick={() => setTab(t)}
            className={cn(
              "px-4 pb-3 text-sm font-medium transition-colors",
              tab === t
                ? "border-b-2 border-slate-900 text-slate-900"
                : "text-slate-500 hover:text-slate-700",
            )}
          >
            {t === "members" ? "ผู้ใช้งานในระบบ" : `คำเชิญรอตอบรับ${invites.length > 0 ? ` (${invites.length})` : ""}`}
          </button>
        ))}
      </div>

      {/* Members table */}
      {tab === "members" && (
        <div className="rounded-lg border border-slate-200 bg-white overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow className="bg-slate-50">
                <TableHead className="w-8">#</TableHead>
                <TableHead>ชื่อผู้ใช้งาน</TableHead>
                <TableHead>อีเมล</TableHead>
                <TableHead className="w-36">สิทธิ์การใช้งาน</TableHead>
                <TableHead className="w-28 text-slate-400 text-xs">เพิ่มเมื่อ</TableHead>
                <TableHead className="w-12" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {members.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={6} className="py-10 text-center text-sm text-slate-400">
                    ยังไม่มีผู้ใช้งาน
                  </TableCell>
                </TableRow>
              ) : (
                members.map((m, i) => (
                  <TableRow key={m.id} className="hover:bg-slate-50">
                    <TableCell className="text-sm text-slate-400">{i + 1}</TableCell>
                    <TableCell>
                      <div className="flex items-center gap-3">
                        <Avatar name={m.display_name ?? m.email ?? "?"} avatarUrl={m.avatar_url} />
                        <span className="text-sm font-medium text-slate-900">
                          {m.display_name ?? "—"}
                          {m.user_id === currentUserId && (
                            <span className="ml-2 text-xs text-slate-400">(คุณ)</span>
                          )}
                        </span>
                      </div>
                    </TableCell>
                    <TableCell className="text-sm text-slate-500">{m.email ?? "—"}</TableCell>
                    <TableCell>
                      <span className={cn("rounded-full px-2.5 py-0.5 text-xs font-medium", ROLE_COLORS[m.role] ?? "bg-slate-100 text-slate-600")}>
                        {ROLE_LABELS[m.role] ?? m.role}
                      </span>
                    </TableCell>
                    <TableCell className="text-xs text-slate-400">{formatDate(m.created_at)}</TableCell>
                    <TableCell>
                      {m.user_id !== currentUserId && (
                        <MemberMenu
                          member={m}
                          organizationId={organizationId}
                          onUpdated={(updated) => {
                            // If role hasn't changed but we need to handle removal:
                            setMembers((prev) => {
                              const copy = prev.filter((x) => x.id !== m.id);
                              // check if updated is valid:
                              if (prev.find(x => x.id === updated.id)) {
                                const idx = prev.findIndex(x => x.id === updated.id);
                                const c = [...prev]; c[idx] = updated; return c;
                              }
                              return copy;
                            });
                          }}
                        />
                      )}
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>
      )}

      {/* Invites table */}
      {tab === "invites" && (
        <div className="rounded-lg border border-slate-200 bg-white overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow className="bg-slate-50">
                <TableHead>อีเมล</TableHead>
                <TableHead className="w-36">สิทธิ์</TableHead>
                <TableHead className="w-32">วันที่ส่ง</TableHead>
                <TableHead className="w-32">หมดอายุ</TableHead>
                <TableHead className="w-24" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {invites.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={5} className="py-10 text-center text-sm text-slate-400">
                    ไม่มีคำเชิญที่รอตอบรับ
                  </TableCell>
                </TableRow>
              ) : (
                invites.map((inv) => (
                  <TableRow key={inv.id} className="hover:bg-slate-50">
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <Mail className="h-4 w-4 text-slate-400" />
                        <span className="text-sm text-slate-700">{inv.email}</span>
                      </div>
                    </TableCell>
                    <TableCell>
                      <span className={cn("rounded-full px-2.5 py-0.5 text-xs font-medium", ROLE_COLORS[inv.org_role] ?? "bg-slate-100 text-slate-600")}>
                        {ROLE_LABELS[inv.org_role] ?? inv.org_role}
                      </span>
                    </TableCell>
                    <TableCell className="text-sm text-slate-500">{formatDate(inv.created_at)}</TableCell>
                    <TableCell className="text-sm text-slate-500">{formatDate(inv.expires_at)}</TableCell>
                    <TableCell className="text-right">
                      <Button
                        size="sm"
                        variant="outline"
                        className="text-red-600 hover:text-red-700 border-red-200 hover:border-red-300"
                        onClick={() => handleCancelInvite(inv)}
                      >
                        ยกเลิก
                      </Button>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>
      )}

      {/* Invite Dialog */}
      <Dialog open={inviteOpen} onOpenChange={(v) => { if (!v) setInviteOpen(false); }}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>เพิ่มผู้ใช้งานใหม่</DialogTitle>
          </DialogHeader>
          <div className="grid gap-4 py-2">
            <div className="space-y-1.5">
              <Label>อีเมล <span className="text-red-500">*</span></Label>
              <Input
                type="email"
                value={inviteEmail}
                onChange={(e) => setInviteEmail(e.target.value)}
                placeholder="name@example.com"
                disabled={inviting}
              />
            </div>
            <div className="space-y-1.5">
              <Label>สิทธิ์การใช้งาน</Label>
              <CustomSelect
                value={inviteRole}
                onChange={setInviteRole}
                options={ROLE_OPTIONS}
              />
            </div>
            {inviteErr && <p className="text-sm text-red-500">{inviteErr}</p>}
            {inviteSuccess && (
              <p className="rounded-md bg-teal-50 px-3 py-2 text-sm text-teal-700">{inviteSuccess}</p>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setInviteOpen(false)} disabled={inviting}>ปิด</Button>
            <Button onClick={handleInvite} disabled={inviting}>
              {inviting ? "กำลังส่ง..." : "ส่งคำเชิญ"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
