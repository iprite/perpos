"use client";

import { Title, Text, Avatar, Button, Popover } from "rizzui";
import cn from "@core/utils/class-names";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { Settings, LogOut, LayoutGrid, Building2, CreditCard, ChevronsUpDown } from "lucide-react";

import { useAtomValue } from "jotai";
import { useAuth } from "@/app/shared/auth-provider";
import { useOrgSlug } from "@/app/shared/module-provider";
import { activeModuleKeyAtom, enabledModuleKeysAtom } from "@/app/shared/module-atoms";
import { ALL_MODULES } from "@/lib/modules";
import { withBasePath } from "@/utils/base-path";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";

export default function ProfileMenu({
  buttonClassName,
}: {
  buttonClassName?: string;
} = {}) {
  const { email, profile } = useAuth();
  const name = String(profile?.display_name ?? email ?? "U");

  return (
    <ProfileMenuPopover>
      <Popover.Trigger>
        <button
          className={cn(
            "flex w-full items-center gap-3 rounded-xl bg-gray-50 p-2 text-left outline-none transition-colors hover:bg-gray-100 focus-visible:ring-2 focus-visible:ring-gray-300 active:translate-y-px",
            buttonClassName
          )}
        >
          <Avatar
            src={profile?.avatar_url ?? undefined}
            name={name}
            color="secondary"
            className="!h-10 !w-10 !rounded-lg bg-gray-100 text-sm font-semibold text-gray-700"
          />
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-1.5">
              <span className="truncate text-sm font-semibold text-gray-900">{name}</span>
              {/* TODO: ผูกกับแพ็กเกจจริงเมื่อมีข้อมูล plan */}
              <span className="shrink-0 rounded bg-indigo-50 px-1.5 py-0.5 text-[11px] font-medium leading-none text-indigo-600">
                Free
              </span>
            </div>
          </div>
          <ChevronsUpDown className="h-4 w-4 shrink-0 text-gray-400" />
        </button>
      </Popover.Trigger>

      <Popover.Content className="z-[9999] p-0 dark:bg-gray-100 [&>svg]:dark:fill-gray-100">
        <DropdownMenu />
      </Popover.Content>
    </ProfileMenuPopover>
  );
}

function ProfileMenuPopover({ children }: React.PropsWithChildren<{}>) {
  const pathname = usePathname();
  const [isOpen, setIsOpen] = useState(false);

  useEffect(() => {
    setIsOpen(false);
  }, [pathname]);

  return (
    <Popover
      isOpen={isOpen}
      setIsOpen={setIsOpen}
      shadow="sm"
      placement="top-start"
    >
      {children}
    </Popover>
  );
}

function DropdownMenu() {
  const router = useRouter();
  const { email, role, profile, userId, signOut } = useAuth();
  const orgSlug        = useOrgSlug();
  const activeModuleKey = useAtomValue(activeModuleKeyAtom);
  const enabledKeys     = useAtomValue(enabledModuleKeysAtom);
  const name = String(profile?.display_name ?? email ?? "U");

  const visibleModules = ALL_MODULES.filter((m) => enabledKeys.includes(m.key) && !m.personal);
  const activeModule   = visibleModules.find((m) => m.key === activeModuleKey) ?? visibleModules[0];
  const erpHref        = orgSlug && activeModule ? `/${orgSlug}${activeModule.href}` : orgSlug ? `/${orgSlug}` : "/";
  const [signingOut, setSigningOut] = useState(false);
  const [isOrgManager, setIsOrgManager] = useState(false);
  const [isOrgOwner,   setIsOrgOwner]   = useState(false);

  // Check if user is owner/admin of the active org
  useEffect(() => {
    if (!userId) return;
    const match = document.cookie.match(/perpos\.activeOrgId=([^;]+)/);
    const activeOrgId = match ? decodeURIComponent(match[1]) : null;
    if (!activeOrgId) return;
    const supabase = createSupabaseBrowserClient();
    supabase
      .from("organization_members")
      .select("role")
      .eq("user_id", userId)
      .eq("organization_id", activeOrgId)
      .maybeSingle()
      .then(({ data }) => {
        if (data?.role && ["owner", "admin"].includes(String(data.role))) {
          setIsOrgManager(true);
        }
        if (data?.role === "owner") {
          setIsOrgOwner(true);
        }
      });
  }, [userId]);

  const items: Array<{ label: string; href: string; icon: React.ReactNode; show: boolean }> = [
    {
      label: "PERPOS",
      href: erpHref,
      icon: <LayoutGrid className="h-4 w-4 text-gray-500" />,
      show: true,
    },
    {
      label: "ตั้งค่าองค์กร",
      href: orgSlug ? `/${orgSlug}/setting` : "/",
      icon: <Building2 className="h-4 w-4 text-gray-500" />,
      show: isOrgManager && !!orgSlug,
    },
    {
      label: "Billing & Plan",
      href: "/billing",
      icon: <CreditCard className="h-4 w-4 text-gray-500" />,
      show: isOrgOwner,
    },
    {
      label: "ตั้งค่าผู้ใช้งาน",
      href: "/user",
      icon: <Settings className="h-4 w-4 text-gray-500" />,
      show: true,
    },
  ];

  return (
    <div className="w-64 text-left rtl:text-right">
      <div className="flex items-center border-b border-gray-300 px-6 pb-5 pt-6">
        <Avatar
          src={profile?.avatar_url ?? undefined}
          name={name}
          color="secondary"
          className="bg-gray-100 ring-1 ring-gray-300 text-sm font-semibold text-gray-700 !h-10 !w-10"
        />
        <div className="ms-3 min-w-0">
          <div className="flex items-center gap-1.5">
            <Title as="h6" className="truncate font-semibold">
              {String(profile?.display_name ?? (role ? role.toUpperCase() : "")).trim()}
            </Title>
            <span className="shrink-0 rounded bg-indigo-50 px-1.5 py-0.5 text-[11px] font-medium leading-none text-indigo-600">
              Free
            </span>
          </div>
          {/* ซ่อน shadow email ของ LINE user (id ยาว) — แสดง "บัญชี LINE" แทน */}
          <Text className="truncate text-gray-600">
            {email && !email.endsWith("@stt-line.perpos.io") ? email : "บัญชี LINE"}
          </Text>
        </div>
      </div>

      {/* แถวลิงก์ข้อกำหนด/ความเป็นส่วนตัว */}
      <div className="flex items-center gap-2 border-b border-gray-300 px-6 py-2.5 text-xs text-gray-500">
        <Link href="/terms" className="hover:text-gray-800">ข้อตกลง</Link>
        <span className="text-gray-300">•</span>
        <Link href="/privacy" className="hover:text-gray-800">ความเป็นส่วนตัว</Link>
      </div>
      <div className="border-t border-gray-300 px-6 pb-6 pt-5">
        <div className="grid gap-3">
          {items
            .filter((it) => it.show)
            .map((it) => (
              <Button
                key={it.href}
                className="h-auto w-full items-center justify-start gap-2 p-0 font-medium text-gray-700 outline-none focus-within:text-gray-600 hover:text-gray-900 focus-visible:ring-0"
                variant="text"
                disabled={signingOut}
                onClick={() => {
                  router.push(withBasePath(it.href));
                }}
              >
                {it.icon}
                {it.label}
              </Button>
            ))}
        </div>

        <div className="my-4 h-px w-full bg-gray-200" />

        <Button
          className="h-auto w-full items-center justify-start gap-2 p-0 font-medium text-gray-700 outline-none focus-within:text-gray-600 hover:text-gray-900 focus-visible:ring-0"
          variant="text"
          disabled={signingOut}
          onClick={async () => {
            setSigningOut(true);
            await signOut();
            router.replace(withBasePath("/signin"));
            setSigningOut(false);
          }}
        >
          <LogOut className="h-4 w-4 text-gray-500" />
          {signingOut ? "กำลังลงชื่อออก..." : "ลงชื่อออก"}
        </Button>
      </div>
    </div>
  );
}
