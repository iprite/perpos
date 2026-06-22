"use client";

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Text, Title } from "@/components/ui/typography";
import {
  Settings2,
  Building2,
  KeyRound,
  Eye,
  UserX,
  UserCheck,
  Trash2,
  Gauge,
  Search,
  ChevronDown,
  Users as UsersIcon,
  Copy,
  Check,
  CalendarDays,
  MessagesSquare,
} from "lucide-react";

import { useAuth } from "@/app/shared/auth-provider";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import { useUrlState } from "@/lib/use-url-state";
import type { Role } from "@/lib/supabase/types";
import { withBasePath } from "@/utils/base-path";
import { copyText } from "@/utils/clipboard";
import { backendUrl } from "@/lib/backend";
import { toast } from "@/lib/toast";
import { AdminPage } from "../_components/admin-page";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { CustomSelect } from "@/components/ui/custom-select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogBody,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { ConfirmDeleteDialog } from "@/components/ui/confirm-delete-dialog";
import { startImpersonationSession } from "@/components/impersonation-banner";

// ── Types ─────────────────────────────────────────────────────────────────────

type UserOrg = { orgId: string; orgName: string; role: string };

type ListedUser = {
  id: string;
  display_name: string;
  picture_url: string | null;
  email: string | null;
  role: Role;
  is_active: boolean;
  line_linked: boolean;
  line_user_id: string | null;
  created_at: string;
  last_seen_at: string | null;
  orgs: UserOrg[];
  tokens: { balance: number };
  usage: { sttSeconds: number; botSeconds: number; pdfPages: number; lastUsed: string | null };
};

const ONLINE_WINDOW_MS = 2 * 60_000; // ออนไลน์ = ใช้งานภายใน 2 นาที

// จำนวนวันนับจากวันที่สมัคร (provisioning) ถึงวันนี้
function membershipDays(iso: string | null, now: number): number {
  if (!iso) return 0;
  return Math.max(0, Math.floor((now - new Date(iso).getTime()) / 86_400_000));
}

// วินาที → นาที (ปัดขึ้น) แบบมีหลักพัน — เช่น 130 วิ → "3"
function secondsToMinutes(sec: number): number {
  return Math.round(sec / 60);
}

// วันที่แบบไทย (พ.ศ.) — เช่น "21 มิ.ย. 2569"
function formatThaiDate(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "—";
  return new Intl.DateTimeFormat("th-TH", {
    day: "numeric",
    month: "short",
    year: "numeric",
  }).format(d);
}

function relativeSeen(iso: string | null, now: number): string {
  if (!iso) return "ยังไม่เคยเข้าใช้งาน";
  const diff = now - new Date(iso).getTime();
  if (diff < ONLINE_WINDOW_MS) return "ออนไลน์";
  const min = Math.floor(diff / 60_000);
  if (min < 60) return `ใช้งานล่าสุด ${min} นาทีที่แล้ว`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `ใช้งานล่าสุด ${hr} ชม.ที่แล้ว`;
  const day = Math.floor(hr / 24);
  return `ใช้งานล่าสุด ${day} วันที่แล้ว`;
}

type OrgItem = { id: string; name: string };

const ORG_ROLES = ["owner", "admin", "team_lead", "team_member"] as const;
type OrgRole = (typeof ORG_ROLES)[number];

const ORG_ROLE_LABELS: Record<string, string> = {
  owner: "เจ้าของ",
  admin: "ผู้ดูแล",
  team_lead: "หัวหน้าทีม",
  team_member: "สมาชิก",
};
const ORG_ROLE_OPTIONS = ORG_ROLES.map((r) => ({ value: r, label: ORG_ROLE_LABELS[r] ?? r }));

// ── Avatar ──────────────────────────────────────────────────────────────────────

function Avatar({ src, name }: { src: string | null; name: string }) {
  const [failed, setFailed] = useState(false);
  const letter = (name || "L").charAt(0).toUpperCase();
  if (src && !failed) {
    return (
      <img
        src={src}
        alt={name}
        referrerPolicy="no-referrer"
        onError={() => setFailed(true)}
        className="h-11 w-11 shrink-0 rounded-full object-cover"
      />
    );
  }
  return (
    <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-indigo-50 text-base font-semibold text-indigo-600">
      {letter}
    </div>
  );
}

// ── LineIdLine ─────────────────────────────────────────────────────────────────

function LineIdLine({ lineUserId }: { lineUserId: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      title="คัดลอก LINE User ID"
      onClick={async (e) => {
        e.stopPropagation();
        if (await copyText(lineUserId)) {
          setCopied(true);
          setTimeout(() => setCopied(false), 2000);
        }
      }}
      className="mt-0.5 flex max-w-full items-center gap-1 text-xs text-gray-400 transition-colors hover:text-gray-600"
    >
      <span className="shrink-0 font-medium text-gray-400">LINE ID:</span>
      <span className="truncate font-mono">{lineUserId}</span>
      {copied ? (
        <Check className="h-3 w-3 shrink-0 text-green-500" />
      ) : (
        <Copy className="h-3 w-3 shrink-0 opacity-50" />
      )}
    </button>
  );
}

// ── UserActionMenu ─────────────────────────────────────────────────────────────

interface UserActionMenuProps {
  user: ListedUser;
  isToggling: boolean;
  isDeleting: boolean;
  isResetting: boolean;
  onManageOrgs: () => void;
  onGrant: () => void;
  onToggleStatus: () => void;
  onResetPassword: () => void;
  onImpersonate: () => void;
  onDelete: () => void;
}

function UserActionMenu({
  user,
  isToggling,
  isDeleting,
  isResetting,
  onManageOrgs,
  onGrant,
  onToggleStatus,
  onResetPassword,
  onImpersonate,
  onDelete,
}: UserActionMenuProps) {
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState<{ top?: number; bottom?: number; right: number }>({ right: 0 });
  const btnRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  const MENU_H = 260;

  function openMenu() {
    if (!btnRef.current) return;
    const r = btnRef.current.getBoundingClientRect();
    const right = window.innerWidth - r.right;
    const fitsBelow = r.bottom + 4 + MENU_H <= window.innerHeight;
    setPos(
      fitsBelow ? { top: r.bottom + 4, right } : { bottom: window.innerHeight - r.top + 4, right },
    );
    setOpen(true);
  }

  useEffect(() => {
    if (!open) return;
    function handler(e: MouseEvent) {
      if (
        menuRef.current &&
        !menuRef.current.contains(e.target as Node) &&
        btnRef.current &&
        !btnRef.current.contains(e.target as Node)
      )
        setOpen(false);
    }
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  const canImpersonate = user.role !== "super_admin";

  return (
    <>
      <button
        ref={btnRef}
        onClick={() => (open ? setOpen(false) : openMenu())}
        title="การจัดการ"
        className={`flex h-8 w-8 items-center justify-center rounded-lg border transition-colors ${
          open
            ? "border-primary bg-gray-100 text-primary"
            : "border-gray-200 bg-white text-gray-500 hover:border-gray-300 hover:bg-gray-50 hover:text-gray-700"
        }`}
      >
        <Settings2 className="h-4 w-4" />
      </button>

      {open && typeof window !== "undefined" && (
        <div
          ref={menuRef}
          style={{
            position: "fixed",
            top: pos.top,
            bottom: pos.bottom,
            right: pos.right,
            zIndex: 9999,
          }}
          className="w-52 rounded-xl border border-gray-200 bg-white py-1 shadow-lg ring-1 ring-black/5"
        >
          <MenuItem
            icon={<Building2 className="h-4 w-4" />}
            label="จัดการองค์กร"
            onClick={() => {
              onManageOrgs();
              setOpen(false);
            }}
            className="text-gray-700 hover:bg-gray-50"
          />
          <MenuItem
            icon={<Gauge className="h-4 w-4" />}
            label="เติมเครดิต (Token)"
            onClick={() => {
              onGrant();
              setOpen(false);
            }}
            className="text-gray-700 hover:bg-gray-50"
          />

          {!!user.email && (
            <MenuItem
              icon={<KeyRound className="h-4 w-4" />}
              label={isResetting ? "กำลังสร้าง…" : "รีเซ็ตรหัสผ่าน"}
              onClick={() => {
                onResetPassword();
                setOpen(false);
              }}
              disabled={isResetting}
              className="text-amber-700 hover:bg-amber-50"
            />
          )}

          {canImpersonate && (
            <MenuItem
              icon={<Eye className="h-4 w-4" />}
              label="เข้าดูแทนผู้ใช้"
              onClick={() => {
                onImpersonate();
                setOpen(false);
              }}
              className="text-orange-700 hover:bg-orange-50"
            />
          )}

          <div className="my-1 h-px bg-gray-100" />

          <MenuItem
            icon={
              user.is_active ? <UserX className="h-4 w-4" /> : <UserCheck className="h-4 w-4" />
            }
            label={isToggling ? "กำลังอัปเดต…" : user.is_active ? "ระงับการใช้งาน" : "เปิดใช้งาน"}
            onClick={() => {
              onToggleStatus();
              setOpen(false);
            }}
            disabled={isToggling}
            className={
              user.is_active ? "text-gray-600 hover:bg-gray-50" : "text-green-700 hover:bg-green-50"
            }
          />

          <div className="my-1 h-px bg-gray-100" />

          <MenuItem
            icon={<Trash2 className="h-4 w-4" />}
            label={isDeleting ? "กำลังลบ…" : "ลบผู้ใช้"}
            onClick={() => {
              onDelete();
              setOpen(false);
            }}
            disabled={isDeleting}
            className="text-red-600 hover:bg-red-50"
          />
        </div>
      )}
    </>
  );
}

function MenuItem({
  icon,
  label,
  onClick,
  disabled,
  className,
}: {
  icon: React.ReactNode;
  label: string;
  onClick: () => void;
  disabled?: boolean;
  className?: string;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={`flex w-full items-center gap-2.5 px-3 py-2 text-sm font-medium disabled:opacity-40 ${className ?? ""}`}
    >
      <span className="flex-shrink-0">{icon}</span>
      <span className="flex-1 text-left">{label}</span>
    </button>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function AdminUsersPage() {
  const { role, loading: authLoading } = useAuth();
  const supabase = useMemo(() => createSupabaseBrowserClient(), []);

  const [loading, setLoading] = useState(false);
  const [items, setItems] = useState<ListedUser[]>([]);
  const [allOrgs, setAllOrgs] = useState<OrgItem[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [actionLink, setActionLink] = useState<string | null>(null);

  // filters — เริ่มจาก URL + sync กลับ (saved view: bookmark/แชร์ลิงก์ได้)
  const { get: getUrlParam, commit: commitUrl } = useUrlState();
  const [query, setQuery] = useState(() => getUrlParam("q"));
  const [statusFilter, setStatusFilter] = useState(() => getUrlParam("status", "all"));

  // sync filter → URL (debounce กันเขียนถี่ตอนพิมพ์) · "all"/"" ถูกตัดออกจาก URL
  useEffect(() => {
    const t = setTimeout(() => {
      commitUrl({ q: query, status: statusFilter === "all" ? "" : statusFilter });
    }, 300);
    return () => clearTimeout(t);
  }, [query, statusFilter, commitUrl]);

  // expanded org panel
  const [expandedUserId, setExpandedUserId] = useState<string | null>(null);
  const [addOrgId, setAddOrgId] = useState<Record<string, string>>({});
  const [addOrgRole, setAddOrgRole] = useState<Record<string, OrgRole>>({});

  // per-user action states
  const [deletingUserId, setDeletingUserId] = useState<string | null>(null);
  const [resettingUserId, setResettingUserId] = useState<string | null>(null);
  const [togglingUserId, setTogglingUserId] = useState<string | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState<{
    open: boolean;
    userId: string;
    name: string;
  }>({ open: false, userId: "", name: "" });

  // quota dialog
  const [grantTarget, setGrantTarget] = useState<ListedUser | null>(null);
  const [grantTokens, setGrantTokens] = useState("");
  const [granting, setGranting] = useState(false);

  // impersonation modal
  const [impersonateTarget, setImpersonateTarget] = useState<ListedUser | null>(null);
  const [impersonateReason, setImpersonateReason] = useState("");
  const [impersonateOrgId, setImpersonateOrgId] = useState("");
  const [impersonateLoading, setImpersonateLoading] = useState(false);
  const [impersonateError, setImpersonateError] = useState<string | null>(null);

  const authHeader = useCallback(async () => {
    const { data } = await supabase.auth.getSession();
    const token = data.session?.access_token;
    if (!token) throw new Error("ยังไม่ได้เข้าสู่ระบบ");
    return { Authorization: `Bearer ${token}` };
  }, [supabase]);

  const refreshUsers = useCallback(() => {
    Promise.resolve().then(async () => {
      setLoading(true);
      setError(null);
      try {
        const headers = await authHeader();
        const res = await fetch(backendUrl("/admin/users/list"), { headers });
        const json = await res.json().catch(() => null);
        if (!res.ok) {
          setError(json?.error ?? "โหลดรายการผู้ใช้ไม่สำเร็จ");
          setItems([]);
        } else {
          setItems((json?.items ?? []) as ListedUser[]);
          setAllOrgs((json?.allOrgs ?? []) as OrgItem[]);
        }
      } catch (e: unknown) {
        setError((e as Error)?.message ?? "โหลดรายการผู้ใช้ไม่สำเร็จ");
        setItems([]);
      } finally {
        setLoading(false);
      }
    });
  }, [authHeader]);

  useEffect(() => {
    refreshUsers();
  }, [refreshUsers]);

  // ── presence: re-render relative time ทุก 30 วิ + รีเฟรชรายการเงียบ ๆ ทุก 60 วิ ──
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const tick = window.setInterval(() => setNow(Date.now()), 30_000);
    const reload = window.setInterval(() => refreshUsers(), 60_000);
    return () => {
      window.clearInterval(tick);
      window.clearInterval(reload);
    };
  }, [refreshUsers]);

  const onlineCount = useMemo(
    () =>
      items.filter(
        (u) => u.last_seen_at && now - new Date(u.last_seen_at).getTime() < ONLINE_WINDOW_MS,
      ).length,
    [items, now],
  );

  // ── org membership mutations (operate on embedded data, update locally) ──────────
  const patchOrgs = useCallback((userId: string, fn: (orgs: UserOrg[]) => UserOrg[]) => {
    setItems((prev) => prev.map((u) => (u.id === userId ? { ...u, orgs: fn(u.orgs) } : u)));
  }, []);

  const handleAddOrg = useCallback(
    async (userId: string) => {
      const orgId = addOrgId[userId] ?? "";
      const r = addOrgRole[userId] ?? "team_member";
      if (!orgId) return;
      try {
        const headers = await authHeader();
        const res = await fetch(backendUrl("/admin/users/orgs"), {
          method: "PUT",
          headers: { ...headers, "content-type": "application/json" },
          body: JSON.stringify({ userId, orgId, role: r }),
        });
        const json = await res.json().catch(() => null);
        if (!res.ok) {
          const m = json?.error ?? "เพิ่มองค์กรไม่สำเร็จ";
          setError(m);
          toast.error(m);
          return;
        }
        const orgName = allOrgs.find((o) => o.id === orgId)?.name ?? "";
        patchOrgs(userId, (orgs) => [
          ...orgs.filter((o) => o.orgId !== orgId),
          { orgId, orgName, role: r },
        ]);
        setAddOrgId((p) => ({ ...p, [userId]: "" }));
        setAddOrgRole((p) => ({ ...p, [userId]: "team_member" }));
        toast.success(`เพิ่มเข้าองค์กร ${orgName} แล้ว`);
      } catch (e: unknown) {
        const m = (e as Error)?.message ?? "เพิ่มองค์กรไม่สำเร็จ";
        setError(m);
        toast.error(m);
      }
    },
    [authHeader, addOrgId, addOrgRole, allOrgs, patchOrgs],
  );

  const handleRoleChange = useCallback(
    async (userId: string, orgId: string, newRole: OrgRole) => {
      try {
        const headers = await authHeader();
        const res = await fetch(backendUrl("/admin/users/orgs"), {
          method: "PUT",
          headers: { ...headers, "content-type": "application/json" },
          body: JSON.stringify({ userId, orgId, role: newRole }),
        });
        if (!res.ok) {
          const j = await res.json().catch(() => null);
          const m = j?.error ?? "อัปเดตสิทธิ์ไม่สำเร็จ";
          setError(m);
          toast.error(m);
          return;
        }
        patchOrgs(userId, (orgs) =>
          orgs.map((o) => (o.orgId === orgId ? { ...o, role: newRole } : o)),
        );
        toast.success("อัปเดตสิทธิ์แล้ว");
      } catch (e: unknown) {
        const m = (e as Error)?.message ?? "อัปเดตสิทธิ์ไม่สำเร็จ";
        setError(m);
        toast.error(m);
      }
    },
    [authHeader, patchOrgs],
  );

  const handleRemoveOrg = useCallback(
    async (userId: string, orgId: string) => {
      try {
        const headers = await authHeader();
        const res = await fetch(backendUrl("/admin/users/orgs"), {
          method: "DELETE",
          headers: { ...headers, "content-type": "application/json" },
          body: JSON.stringify({ userId, orgId }),
        });
        if (!res.ok) {
          const j = await res.json().catch(() => null);
          const m = j?.error ?? "ลบองค์กรไม่สำเร็จ";
          setError(m);
          toast.error(m);
          return;
        }
        patchOrgs(userId, (orgs) => orgs.filter((o) => o.orgId !== orgId));
        toast.success("นำออกจากองค์กรแล้ว");
      } catch (e: unknown) {
        const m = (e as Error)?.message ?? "ลบองค์กรไม่สำเร็จ";
        setError(m);
        toast.error(m);
      }
    },
    [authHeader, patchOrgs],
  );

  // ── status toggle ──────────────────────────────────────────────────────────────
  const handleToggleStatus = useCallback(
    async (userId: string, currentActive: boolean) => {
      setTogglingUserId(userId);
      try {
        const headers = await authHeader();
        const res = await fetch(backendUrl("/admin/users/status"), {
          method: "PUT",
          headers: { ...headers, "content-type": "application/json" },
          body: JSON.stringify({ userId, isActive: !currentActive }),
        });
        const json = await res.json().catch(() => null);
        if (!res.ok) {
          const m = json?.error ?? "อัปเดตสถานะไม่สำเร็จ";
          setError(m);
          toast.error(m);
        } else {
          setItems((prev) =>
            prev.map((u) => (u.id === userId ? { ...u, is_active: !currentActive } : u)),
          );
          toast.success(!currentActive ? "เปิดใช้งานผู้ใช้แล้ว" : "ระงับผู้ใช้แล้ว");
        }
      } catch (e: unknown) {
        const m = (e as Error)?.message ?? "อัปเดตสถานะไม่สำเร็จ";
        setError(m);
        toast.error(m);
      } finally {
        setTogglingUserId(null);
      }
    },
    [authHeader],
  );

  // ── token grant (เติมเครดิต — unified pool) ───────────────────────────────────
  const handleGrant = useCallback(async () => {
    if (!grantTarget) return;
    const tk = parseInt(grantTokens, 10);
    if (isNaN(tk) || tk <= 0) {
      setError("ระบุจำนวนเครดิตให้ถูกต้อง");
      return;
    }
    setGranting(true);
    try {
      const headers = await authHeader();
      const res = await fetch(backendUrl("/admin/tokens"), {
        method: "POST",
        headers: { ...headers, "content-type": "application/json" },
        body: JSON.stringify({ profileId: grantTarget.id, tokens: tk, reason: "admin_grant" }),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => null);
        const em = j?.error ?? "เติมเครดิตไม่สำเร็จ";
        setError(em);
        toast.error(em);
        return;
      }
      setItems((prev) =>
        prev.map((u) =>
          u.id === grantTarget.id ? { ...u, tokens: { balance: u.tokens.balance + tk } } : u,
        ),
      );
      const okMsg = `เติมเครดิต ${grantTarget.display_name} แล้ว (+${tk.toLocaleString("th-TH")} เครดิต)`;
      setMessage(okMsg);
      toast.success(okMsg);
      setGrantTarget(null);
      setGrantTokens("");
    } catch (e: unknown) {
      const em = (e as Error)?.message ?? "เติมเครดิตไม่สำเร็จ";
      setError(em);
      toast.error(em);
    } finally {
      setGranting(false);
    }
  }, [authHeader, grantTarget, grantTokens]);

  // ── delete ─────────────────────────────────────────────────────────────────────
  const doDeleteUser = useCallback(async () => {
    const { userId, name } = deleteConfirm;
    setDeletingUserId(userId);
    setDeleteConfirm({ open: false, userId: "", name: "" });
    try {
      const headers = await authHeader();
      const res = await fetch(backendUrl("/admin/users/delete"), {
        method: "POST",
        headers: { ...headers, "content-type": "application/json" },
        body: JSON.stringify({ userId }),
      });
      const json = await res.json().catch(() => null);
      if (!res.ok) {
        const m = json?.error ?? "ลบผู้ใช้ไม่สำเร็จ";
        setError(m);
        toast.error(m);
      } else {
        setMessage(`ลบ ${name} แล้ว`);
        toast.success(`ลบ ${name} แล้ว`);
        setItems((prev) => prev.filter((u) => u.id !== userId));
      }
    } catch (e: unknown) {
      const m = (e as Error)?.message ?? "ลบผู้ใช้ไม่สำเร็จ";
      setError(m);
      toast.error(m);
    } finally {
      setDeletingUserId(null);
    }
  }, [authHeader, deleteConfirm]);

  // ── reset password ──────────────────────────────────────────────────────────────
  const handleResetPassword = useCallback(
    async (user: ListedUser) => {
      if (!user.email) return;
      setResettingUserId(user.id);
      try {
        const headers = await authHeader();
        const redirectTo = `${window.location.origin}${withBasePath("/auth/password")}`;
        const res = await fetch(backendUrl("/admin/users/reset-password"), {
          method: "POST",
          headers: { ...headers, "content-type": "application/json" },
          body: JSON.stringify({ email: user.email, redirectTo }),
        });
        const json = await res.json().catch(() => null);
        if (!res.ok) {
          const m = json?.error ?? "สร้างลิงก์รีเซ็ตรหัสผ่านไม่สำเร็จ";
          setError(m);
          toast.error(m);
        } else {
          const link = json?.actionLink as string | null;
          if (link) {
            setActionLink(link);
            await navigator.clipboard.writeText(link).catch(() => undefined);
          }
          const okMsg = json?.emailSent
            ? `ส่งอีเมลรีเซ็ตรหัสผ่านไปที่ ${user.email} แล้ว`
            : "สร้างลิงก์รีเซ็ตรหัสผ่านแล้ว (คัดลอกไว้ในคลิปบอร์ด)";
          setMessage(okMsg);
          toast.success(okMsg);
        }
      } catch (e: unknown) {
        const m = (e as Error)?.message ?? "สร้างลิงก์รีเซ็ตรหัสผ่านไม่สำเร็จ";
        setError(m);
        toast.error(m);
      } finally {
        setResettingUserId(null);
      }
    },
    [authHeader],
  );

  // ── impersonation ──────────────────────────────────────────────────────────────
  const handleStartImpersonation = useCallback(async () => {
    if (!impersonateTarget || !impersonateOrgId || !impersonateReason.trim()) return;
    setImpersonateLoading(true);
    setImpersonateError(null);
    try {
      const headers = await authHeader();
      const res = await fetch(backendUrl("/admin/impersonate"), {
        method: "POST",
        headers: { ...headers, "content-type": "application/json" },
        body: JSON.stringify({
          targetUserId: impersonateTarget.id,
          orgId: impersonateOrgId,
          reason: impersonateReason.trim(),
        }),
      });
      const json = await res.json().catch(() => null);
      if (!res.ok) {
        setImpersonateError(json?.error ?? "เริ่ม session ไม่สำเร็จ");
        return;
      }
      startImpersonationSession(json.sessionId as string);
      setImpersonateTarget(null);
      setImpersonateReason("");
      setImpersonateOrgId("");
    } catch (e: unknown) {
      setImpersonateError((e as Error)?.message ?? "เริ่ม session ไม่สำเร็จ");
    } finally {
      setImpersonateLoading(false);
    }
  }, [impersonateTarget, impersonateOrgId, impersonateReason, authHeader]);

  // ── derived ────────────────────────────────────────────────────────────────────
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return items.filter((u) => {
      if (statusFilter === "active" && !u.is_active) return false;
      if (statusFilter === "suspended" && u.is_active) return false;
      if (statusFilter === "admin" && u.role !== "super_admin") return false;
      if (
        statusFilter === "online" &&
        !(u.last_seen_at && now - new Date(u.last_seen_at).getTime() < ONLINE_WINDOW_MS)
      )
        return false;
      if (!q) return true;
      return (
        (u.display_name?.toLowerCase().includes(q) ?? false) ||
        (u.email?.toLowerCase().includes(q) ?? false)
      );
    });
  }, [items, query, statusFilter, now]);

  const allOrgOptions = useMemo(
    () => [
      { value: "", label: "— เลือกองค์กร —" },
      ...allOrgs.map((o) => ({ value: o.id, label: o.name })),
    ],
    [allOrgs],
  );

  // ── guards ─────────────────────────────────────────────────────────────────────
  if (authLoading)
    return (
      <div className="rounded-xl border border-gray-200 bg-white p-6">
        <Title as="h1" className="text-lg font-semibold text-gray-900">
          กำลังโหลด…
        </Title>
      </div>
    );
  if (role !== "super_admin")
    return (
      <div className="rounded-xl border border-gray-200 bg-white p-6">
        <Title as="h1" className="text-lg font-semibold text-gray-900">
          ไม่มีสิทธิ์เข้าถึงหน้านี้
        </Title>
        <Text className="mt-2 text-sm text-gray-600">หน้านี้สำหรับผู้ดูแลระบบเท่านั้น</Text>
      </div>
    );

  return (
    <AdminPage
      title="จัดการผู้ใช้"
      icon={<UsersIcon className="h-6 w-6" />}
      description="ผู้ใช้ทุกคนสมัครผ่าน LINE — กำหนดองค์กร (ERP) และโควต้าผู้ช่วย AI ได้จากที่นี่"
    >
      {/* Filter bar */}
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="ค้นหาชื่อ หรือ อีเมล"
            className="pl-9"
          />
        </div>
        <CustomSelect
          value={statusFilter}
          onChange={setStatusFilter}
          className="sm:w-48"
          options={[
            { value: "all", label: "ทุกสถานะ" },
            { value: "online", label: "กำลังออนไลน์" },
            { value: "active", label: "ใช้งานได้" },
            { value: "suspended", label: "ถูกระงับ" },
            { value: "admin", label: "ผู้ดูแลระบบ" },
          ]}
        />
        <div className="hidden items-center gap-2 text-sm text-gray-500 sm:flex sm:whitespace-nowrap">
          <span className="inline-flex items-center gap-1.5 rounded-full bg-green-50 px-2 py-0.5 font-medium text-green-700">
            <span className="h-1.5 w-1.5 rounded-full bg-green-500" />
            ออนไลน์ {onlineCount}
          </span>
          <span>{filtered.length} คน</span>
        </div>
      </div>

      {/* Feedback */}
      {error && (
        <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
          {error}
        </div>
      )}
      {message && (
        <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-800">
          {message}
        </div>
      )}
      {actionLink && (
        <div className="rounded-xl border border-gray-200 bg-white p-4 text-sm text-gray-700">
          <div className="font-medium text-gray-900">ลิงก์สำหรับตั้งรหัสผ่าน</div>
          <div className="mt-2 break-all rounded-md border border-gray-200 bg-gray-50 px-3 py-2 text-xs text-gray-700">
            {actionLink}
          </div>
          <div className="mt-3 flex flex-wrap gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={async () => {
                await navigator.clipboard.writeText(actionLink).catch(() => undefined);
                setMessage("คัดลอกลิงก์แล้ว");
              }}
            >
              คัดลอกลิงก์
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => window.open(actionLink, "_blank", "noopener,noreferrer")}
            >
              เปิดลิงก์
            </Button>
          </div>
        </div>
      )}

      {/* User list */}
      <div className="space-y-3">
        {loading && items.length === 0 ? (
          [...Array(4)].map((_, i) => (
            <div key={i} className="h-20 animate-pulse rounded-2xl bg-gray-100" />
          ))
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center rounded-2xl border border-gray-100 bg-white py-16 text-center">
            <div className="mb-3 rounded-full bg-gray-50 p-4">
              <Building2 className="h-7 w-7 text-gray-300" />
            </div>
            <p className="text-sm font-medium text-gray-700">ไม่พบผู้ใช้</p>
            <p className="mt-1 text-sm text-gray-400">ผู้ใช้จะปรากฏที่นี่เมื่อแอด LINE OA</p>
          </div>
        ) : (
          filtered.map((u) => {
            const isExpanded = expandedUserId === u.id;
            const lowCredit = u.tokens.balance <= 0;
            const availableOrgs = allOrgs.filter((o) => !u.orgs.some((m) => m.orgId === o.id));
            const seenLabel = relativeSeen(u.last_seen_at, now);
            const online = seenLabel === "ออนไลน์";

            return (
              <div
                key={u.id}
                className={`overflow-hidden rounded-2xl border border-gray-100 bg-white shadow-sm transition-colors ${!u.is_active ? "opacity-70" : ""}`}
              >
                {/* Row */}
                <div className="flex flex-col gap-4 p-4 sm:flex-row sm:items-center sm:justify-between">
                  {/* identity */}
                  <div className="flex min-w-0 items-center gap-3">
                    <div className="relative shrink-0">
                      <Avatar src={u.picture_url} name={u.display_name} />
                      {online && (
                        <span
                          title="ออนไลน์"
                          className="absolute -bottom-0.5 -right-0.5 h-3 w-3 rounded-full border-2 border-white bg-green-500"
                        />
                      )}
                    </div>
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="truncate font-medium text-gray-900">{u.display_name}</span>
                        {u.role === "super_admin" && (
                          <span className="shrink-0 rounded-full border border-violet-200 bg-violet-50 px-2 py-0.5 text-xs font-medium text-violet-700">
                            ผู้ดูแลระบบ
                          </span>
                        )}
                        {!u.is_active && (
                          <span className="shrink-0 rounded-full border border-red-200 bg-red-50 px-2 py-0.5 text-xs font-medium text-red-700">
                            ถูกระงับ
                          </span>
                        )}
                      </div>
                      <div className="truncate text-xs text-gray-400">
                        {u.email ?? "เข้าสู่ระบบผ่าน LINE"}
                      </div>
                      {u.line_user_id && <LineIdLine lineUserId={u.line_user_id} />}
                      <div
                        className={`truncate text-xs ${online ? "font-medium text-green-600" : "text-gray-400"}`}
                      >
                        {online && (
                          <span className="mr-1 inline-block h-1.5 w-1.5 rounded-full bg-green-500 align-middle" />
                        )}
                        {seenLabel}
                      </div>
                      <div className="mt-0.5 flex items-center gap-1 truncate text-xs text-gray-400">
                        <CalendarDays className="h-3 w-3 shrink-0" />
                        <span>
                          สมัคร {formatThaiDate(u.created_at)} · เป็นสมาชิกมาแล้ว{" "}
                          {membershipDays(u.created_at, now).toLocaleString("th-TH")} วัน
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* org + quota + action */}
                  <div className="flex flex-wrap items-center gap-4 sm:shrink-0 sm:justify-end">
                    {/* org summary */}
                    <button
                      onClick={() => setExpandedUserId(isExpanded ? null : u.id)}
                      className="flex items-center gap-1.5 rounded-lg border border-gray-200 px-2.5 py-1.5 text-xs font-medium text-gray-600 transition-colors hover:bg-gray-50"
                    >
                      <Building2 className="h-3.5 w-3.5 text-gray-400" />
                      {u.orgs.length > 0 ? `${u.orgs.length} องค์กร` : "ยังไม่มีองค์กร"}
                      <ChevronDown
                        className={`h-3.5 w-3.5 opacity-50 transition-transform ${isExpanded ? "rotate-180" : ""}`}
                      />
                    </button>

                    {/* เครดิต (token) — unified pool */}
                    <div className="min-w-[120px] text-right">
                      <div className="text-xs text-gray-400">เครดิตคงเหลือ</div>
                      <div
                        className={`tabular-nums ${lowCredit ? "font-semibold text-red-600" : "font-semibold text-gray-900"}`}
                      >
                        {u.tokens.balance.toLocaleString("th-TH")}
                        <span className="ml-1 text-xs font-normal text-gray-400">
                          ≈ ฿{Math.floor(u.tokens.balance / 100).toLocaleString("th-TH")}
                        </span>
                      </div>
                    </div>

                    <UserActionMenu
                      user={u}
                      isToggling={togglingUserId === u.id}
                      isDeleting={deletingUserId === u.id}
                      isResetting={resettingUserId === u.id}
                      onManageOrgs={() => setExpandedUserId(isExpanded ? null : u.id)}
                      onGrant={() => {
                        setGrantTarget(u);
                        setGrantTokens("");
                      }}
                      onToggleStatus={() => handleToggleStatus(u.id, u.is_active)}
                      onResetPassword={() => handleResetPassword(u)}
                      onImpersonate={() => {
                        setImpersonateTarget(u);
                        setImpersonateReason("");
                        setImpersonateError(null);
                        setImpersonateOrgId(u.orgs.length === 1 ? u.orgs[0].orgId : "");
                      }}
                      onDelete={() =>
                        setDeleteConfirm({ open: true, userId: u.id, name: u.display_name })
                      }
                    />
                  </div>
                </div>

                {/* Expanded org panel */}
                {isExpanded && (
                  <div className="border-t border-gray-100 bg-gray-50/60 px-4 py-4">
                    <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-500">
                      องค์กร (ERP)
                    </div>
                    {u.orgs.length === 0 ? (
                      <div className="mb-3 text-sm text-gray-500">ยังไม่ได้อยู่ในองค์กรใด</div>
                    ) : (
                      <div className="mb-3 space-y-2">
                        {u.orgs.map((m) => (
                          <div
                            key={m.orgId}
                            className="flex items-center gap-2 rounded-lg border border-gray-200 bg-white px-3 py-2"
                          >
                            <span className="flex-1 truncate text-sm font-medium text-gray-800">
                              {m.orgName}
                            </span>
                            <div className="w-36">
                              <CustomSelect
                                value={m.role}
                                onChange={(v) => handleRoleChange(u.id, m.orgId, v as OrgRole)}
                                options={ORG_ROLE_OPTIONS}
                              />
                            </div>
                            <button
                              onClick={() => handleRemoveOrg(u.id, m.orgId)}
                              className="rounded px-2 py-1 text-xs text-red-500 hover:bg-red-50 hover:text-red-700"
                            >
                              ลบ
                            </button>
                          </div>
                        ))}
                      </div>
                    )}

                    {/* Add org */}
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-xs font-medium text-gray-600">เพิ่มองค์กร:</span>
                      <div className="w-52">
                        <CustomSelect
                          value={addOrgId[u.id] ?? ""}
                          onChange={(v) => setAddOrgId((p) => ({ ...p, [u.id]: v }))}
                          options={[
                            { value: "", label: "— เลือกองค์กร —" },
                            ...availableOrgs.map((o) => ({ value: o.id, label: o.name })),
                          ]}
                        />
                      </div>
                      <div className="w-36">
                        <CustomSelect
                          value={addOrgRole[u.id] ?? "team_member"}
                          onChange={(v) => setAddOrgRole((p) => ({ ...p, [u.id]: v as OrgRole }))}
                          options={ORG_ROLE_OPTIONS}
                          disabled={!addOrgId[u.id]}
                        />
                      </div>
                      <Button
                        size="sm"
                        disabled={!addOrgId[u.id]}
                        onClick={() => handleAddOrg(u.id)}
                      >
                        เพิ่ม
                      </Button>
                    </div>

                    {/* การใช้งานผู้ช่วย (Flow) — มิเตอร์จริงตามบริการ */}
                    <div className="mt-4 border-t border-gray-200 pt-4">
                      <div className="mb-2 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-gray-500">
                        <MessagesSquare className="h-3.5 w-3.5" />
                        การใช้งานผู้ช่วย (Flow)
                      </div>
                      {u.usage.sttSeconds === 0 &&
                      u.usage.botSeconds === 0 &&
                      u.usage.pdfPages === 0 ? (
                        <div className="text-sm text-gray-500">ยังไม่เคยใช้บริการ</div>
                      ) : (
                        <>
                          <div className="grid grid-cols-3 gap-2">
                            <div className="rounded-lg border border-gray-200 bg-white px-3 py-2">
                              <div className="text-xs text-gray-400">แกะเสียง (STT)</div>
                              <div className="font-semibold tabular-nums text-gray-900">
                                {secondsToMinutes(u.usage.sttSeconds).toLocaleString("th-TH")}
                                <span className="ml-1 text-xs font-normal text-gray-400">นาที</span>
                              </div>
                            </div>
                            <div className="rounded-lg border border-gray-200 bg-white px-3 py-2">
                              <div className="text-xs text-gray-400">บอทประชุม (Bot)</div>
                              <div className="font-semibold tabular-nums text-gray-900">
                                {secondsToMinutes(u.usage.botSeconds).toLocaleString("th-TH")}
                                <span className="ml-1 text-xs font-normal text-gray-400">นาที</span>
                              </div>
                            </div>
                            <div className="rounded-lg border border-gray-200 bg-white px-3 py-2">
                              <div className="text-xs text-gray-400">บีบ PDF</div>
                              <div className="font-semibold tabular-nums text-gray-900">
                                {Math.round(u.usage.pdfPages).toLocaleString("th-TH")}
                                <span className="ml-1 text-xs font-normal text-gray-400">หน้า</span>
                              </div>
                            </div>
                          </div>
                          <div className="mt-2 text-xs text-gray-400">
                            ใช้งานล่าสุด {formatThaiDate(u.usage.lastUsed)}
                          </div>
                        </>
                      )}
                    </div>
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>

      {/* Token grant dialog */}
      <Dialog
        open={!!grantTarget}
        onOpenChange={(o) => {
          if (!o) setGrantTarget(null);
        }}
      >
        <DialogContent size="md">
          <DialogHeader>
            <DialogTitle>เติมเครดิต — {grantTarget?.display_name}</DialogTitle>
          </DialogHeader>
          <DialogBody>
            <div className="space-y-4">
              <div className="rounded-xl border border-gray-100 bg-gray-50 p-3 text-sm">
                <span className="text-gray-500">เครดิตปัจจุบัน </span>
                <span className="font-semibold tabular-nums text-gray-900">
                  {(grantTarget?.tokens.balance ?? 0).toLocaleString("th-TH")}
                </span>
                <span className="text-gray-400">
                  {" "}
                  ≈ ฿{Math.floor((grantTarget?.tokens.balance ?? 0) / 100).toLocaleString("th-TH")}
                </span>
              </div>
              <div>
                <Label htmlFor="grant-tokens">จำนวนเครดิตที่เติม (1 บาท = 100 เครดิต)</Label>
                <Input
                  id="grant-tokens"
                  type="number"
                  min={1}
                  value={grantTokens}
                  onChange={(e) => setGrantTokens(e.target.value)}
                  className="mt-1"
                  placeholder="เช่น 30000"
                />
                <p className="mt-1 text-xs text-gray-500">
                  เติมมือ (goodwill/adjust) — ไม่กระทบรายได้ · เครดิตมีอายุ 1 ปี +
                  ต่ออายุก้อนเก่าให้
                </p>
              </div>
            </div>
          </DialogBody>
          <DialogFooter>
            <Button variant="outline" onClick={() => setGrantTarget(null)}>
              ยกเลิก
            </Button>
            <Button onClick={handleGrant} disabled={granting}>
              {granting ? "กำลังเติม…" : "เติมเครดิต"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Impersonation modal */}
      <Dialog
        open={!!impersonateTarget}
        onOpenChange={(open) => {
          if (!open) {
            setImpersonateTarget(null);
            setImpersonateReason("");
            setImpersonateOrgId("");
            setImpersonateError(null);
          }
        }}
      >
        <DialogContent size="md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-red-700">
              <span>⚠️</span>
              <span>เข้าดูแทนผู้ใช้</span>
            </DialogTitle>
          </DialogHeader>
          <DialogBody>
            <div className="space-y-4">
              <div className="flex items-center gap-3 rounded-lg border border-red-100 bg-red-50 px-4 py-3">
                <Avatar
                  src={impersonateTarget?.picture_url ?? null}
                  name={impersonateTarget?.display_name ?? ""}
                />
                <div className="min-w-0">
                  <p className="truncate font-medium text-gray-900">
                    {impersonateTarget?.display_name ?? "—"}
                  </p>
                  <p className="truncate text-xs text-gray-500">
                    {impersonateTarget?.email ?? "เข้าสู่ระบบผ่าน LINE"}
                  </p>
                </div>
              </div>
              <div className="space-y-1.5">
                <Label>
                  บริบทองค์กร <span className="text-red-500">*</span>
                </Label>
                <CustomSelect
                  value={impersonateOrgId}
                  onChange={setImpersonateOrgId}
                  options={allOrgOptions}
                  disabled={impersonateLoading}
                />
              </div>
              <div className="space-y-1.5">
                <Label>
                  เหตุผล <span className="text-red-500">*</span>
                </Label>
                <Textarea
                  value={impersonateReason}
                  onChange={(e) => setImpersonateReason(e.target.value)}
                  placeholder="ระบุเหตุผล เช่น 'ช่วย debug ปัญหา invoice #123'"
                  rows={3}
                  disabled={impersonateLoading}
                />
              </div>
              {impersonateError && (
                <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
                  {impersonateError}
                </div>
              )}
              <p className="text-xs text-gray-500">
                Session จะหมดอายุอัตโนมัติใน <strong>30 นาที</strong> และถูกบันทึกใน audit log
                ทุกครั้ง
              </p>
            </div>
          </DialogBody>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setImpersonateTarget(null)}
              disabled={impersonateLoading}
            >
              ยกเลิก
            </Button>
            <Button
              variant="destructive"
              onClick={handleStartImpersonation}
              disabled={impersonateLoading || !impersonateOrgId || !impersonateReason.trim()}
            >
              {impersonateLoading ? "กำลังเริ่ม…" : "เริ่มเข้าดูแทน"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <ConfirmDeleteDialog
        open={deleteConfirm.open}
        onOpenChange={(o) => setDeleteConfirm((s) => ({ ...s, open: o }))}
        title={`ลบผู้ใช้ "${deleteConfirm.name}"`}
        description="การกระทำนี้ไม่สามารถย้อนกลับได้"
        onConfirm={doDeleteUser}
        loading={!!deletingUserId}
      />
    </AdminPage>
  );
}
