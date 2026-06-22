"use client";

/**
 * AdminCommandPalette — ⌘K / Ctrl+K command palette ของ super admin
 *
 * - กด ⌘K (mac) / Ctrl+K เปิด-ปิดได้ทุกหน้าใน /admin
 * - ค้นหา: หน้า admin (reuse buildAdminMenuItems) · องค์กร (→ เปิด Org 360 drawer) · ผู้ใช้
 * - fuzzy match โดย cmdk · ดึงข้อมูล orgs/users ครั้งแรกที่เปิด (cache)
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Command } from "cmdk";
import { Search, Building2, Users, LayoutDashboard } from "lucide-react";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import { buildAdminMenuItems, isLinkMenuItem } from "@/layouts/hydrogen/menu-items";
import { useOrgDrawer } from "./org-link";

interface NavTarget {
  name: string;
  href: string;
}
interface OrgRow {
  id: string;
  name: string;
}
interface UserRow {
  id: string;
  name: string;
  email: string | null;
}

// หน้า admin ทั้งหมด (flatten จากเมนู — source of truth เดียวกับ sidebar)
function adminNavTargets(): NavTarget[] {
  const out: NavTarget[] = [];
  for (const it of buildAdminMenuItems()) {
    if (!isLinkMenuItem(it)) continue;
    out.push({ name: it.name, href: it.href });
    for (const d of it.dropdownItems ?? []) {
      if (d.href !== it.href) out.push({ name: `${it.name} · ${d.name}`, href: d.href });
    }
  }
  return out;
}

export function AdminCommandPalette() {
  const router = useRouter();
  const openOrg = useOrgDrawer();
  const supabase = useMemo(() => createSupabaseBrowserClient(), []);
  const [open, setOpen] = useState(false);
  const [orgs, setOrgs] = useState<OrgRow[]>([]);
  const [users, setUsers] = useState<UserRow[]>([]);
  const loadedRef = useRef(false);

  const navTargets = useMemo(() => adminNavTargets(), []);

  // ⌘K / Ctrl+K toggle
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setOpen((o) => !o);
      }
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, []);

  // โหลด orgs/users ครั้งแรกที่เปิด
  const load = useCallback(async () => {
    if (loadedRef.current) return;
    loadedRef.current = true;
    try {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      const res = await fetch("/api/admin/command-palette", {
        headers: { Authorization: `Bearer ${session?.access_token ?? ""}` },
      });
      if (!res.ok) return;
      const json = await res.json();
      setOrgs(json.orgs ?? []);
      setUsers(json.users ?? []);
    } catch {
      loadedRef.current = false; // ให้ลองใหม่รอบหน้า
    }
  }, [supabase]);

  useEffect(() => {
    if (open) void load();
  }, [open, load]);

  function run(action: () => void) {
    setOpen(false);
    action();
  }

  return (
    <Command.Dialog
      open={open}
      onOpenChange={setOpen}
      label="Command Menu"
      shouldFilter
      overlayClassName="fixed inset-0 z-[9998] bg-gray-900/40 backdrop-blur-sm"
      contentClassName="fixed left-1/2 top-[15vh] z-[9999] w-[calc(100vw-2rem)] max-w-xl -translate-x-1/2 overflow-hidden rounded-xl border border-gray-200 bg-white shadow-2xl"
    >
      <div className="flex items-center gap-2 border-b border-gray-100 px-4">
        <Search className="h-4 w-4 shrink-0 text-gray-400" />
        <Command.Input
          placeholder="ค้นหาองค์กร, ผู้ใช้, หน้า…"
          className="h-12 w-full bg-transparent text-sm text-gray-900 placeholder:text-gray-400 focus:outline-none"
        />
      </div>

      <Command.List className="max-h-[55vh] overflow-y-auto p-2">
        <Command.Empty className="px-3 py-8 text-center text-sm text-gray-400">
          ไม่พบผลลัพธ์
        </Command.Empty>

        <Command.Group
          heading="หน้า"
          className="px-1 py-1 text-xs font-medium text-gray-400 [&_[cmdk-group-heading]]:px-2 [&_[cmdk-group-heading]]:py-1.5"
        >
          {navTargets.map((t) => (
            <Item
              key={t.href}
              value={`หน้า ${t.name}`}
              onSelect={() => run(() => router.push(t.href))}
            >
              <LayoutDashboard className="h-4 w-4 text-gray-400" />
              <span className="truncate">{t.name}</span>
            </Item>
          ))}
        </Command.Group>

        {orgs.length > 0 && (
          <Command.Group
            heading="องค์กร"
            className="px-1 py-1 text-xs font-medium text-gray-400 [&_[cmdk-group-heading]]:px-2 [&_[cmdk-group-heading]]:py-1.5"
          >
            {orgs.map((o) => (
              <Item
                key={o.id}
                value={`องค์กร ${o.name} ${o.id}`}
                onSelect={() => run(() => openOrg(o.id))}
              >
                <Building2 className="h-4 w-4 text-gray-400" />
                <span className="truncate">{o.name}</span>
              </Item>
            ))}
          </Command.Group>
        )}

        {users.length > 0 && (
          <Command.Group
            heading="ผู้ใช้"
            className="px-1 py-1 text-xs font-medium text-gray-400 [&_[cmdk-group-heading]]:px-2 [&_[cmdk-group-heading]]:py-1.5"
          >
            {users.map((u) => (
              <Item
                key={u.id}
                value={`ผู้ใช้ ${u.name} ${u.email ?? ""} ${u.id}`}
                onSelect={() => run(() => router.push("/admin/users"))}
              >
                <Users className="h-4 w-4 text-gray-400" />
                <span className="min-w-0 flex-1 truncate">{u.name}</span>
                {u.email && <span className="shrink-0 text-xs text-gray-400">{u.email}</span>}
              </Item>
            ))}
          </Command.Group>
        )}
      </Command.List>
    </Command.Dialog>
  );
}

function Item({
  value,
  onSelect,
  children,
}: {
  value: string;
  onSelect: () => void;
  children: React.ReactNode;
}) {
  return (
    <Command.Item
      value={value}
      onSelect={onSelect}
      className="flex cursor-pointer items-center gap-2.5 rounded-lg px-3 py-2 text-sm text-gray-700 data-[selected=true]:bg-gray-100 data-[selected=true]:text-gray-900"
    >
      {children}
    </Command.Item>
  );
}
