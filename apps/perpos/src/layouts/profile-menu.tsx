"use client";

import { Title, Avatar } from "rizzui";
import cn from "@core/utils/class-names";
import { Button } from "@/components/ui/button";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { LogOut, ChevronsUpDown, User, PenLine, Zap, Triangle, MessageCircle } from "lucide-react";

import { useAuth } from "@/app/shared/auth-provider";
import { useOrgSlug } from "@/app/shared/module-provider";
import { withBasePath } from "@/utils/base-path";
import { Popover } from "@/components/ui/popover";

export default function ProfileMenu({
  buttonClassName,
}: {
  buttonClassName?: string;
} = {}) {
  const { email, profile } = useAuth();
  const name = String(profile?.display_name ?? email ?? "U");

  return (
    <Popover
      placement="right-end"
      triggerClassName="w-full"
      trigger={(open) => (
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
          <ChevronsUpDown
            className={cn("h-4 w-4 shrink-0 text-gray-400 transition-transform duration-150", open && "rotate-180")}
          />
        </button>
      )}
    >
      <DropdownMenu />
    </Popover>
  );
}

function DropdownMenu() {
  const router = useRouter();
  const { email, profile, userId, signOut } = useAuth();
  const orgSlug = useOrgSlug();
  const name = String(profile?.display_name ?? email ?? "U");
  const [signingOut, setSigningOut] = useState(false);

  const items: Array<{ label: string; href: string; icon: React.ReactNode }> = [
    {
      label: "โปรไฟล์",
      href: "/user",
      icon: <User className="h-[18px] w-[18px] shrink-0 text-gray-500" />,
    },
    {
      label: "ลายเซ็นรับรองใบเสร็จ",
      href: "/user",
      icon: <PenLine className="h-[18px] w-[18px] shrink-0 text-gray-500" />,
    },
    {
      label: "แพ็กเกจสมาชิก",
      href: "/assistant/billing",
      icon: <Zap className="h-[18px] w-[18px] shrink-0 text-gray-500" />,
    },
    {
      label: "การเข้าถึง Google",
      href: orgSlug ? `/${orgSlug}/setting` : "/user",
      icon: <Triangle className="h-[18px] w-[18px] shrink-0 text-gray-500" />,
    },
  ];

  return (
    <div className="min-w-[200px] max-w-xs text-left rtl:text-right">
      {/* Header — avatar + ชื่อ + badge */}
      <div className="flex items-center gap-2.5 px-4 pb-3 pt-3.5">
        <Avatar
          src={profile?.avatar_url ?? undefined}
          name={name}
          color="secondary"
          className="!h-9 !w-9 !rounded-lg bg-gray-100 text-sm font-semibold text-gray-700 shrink-0"
        />
        <div className="min-w-0">
          <div className="flex items-center gap-1.5">
            <Title as="h6" className="truncate text-sm font-semibold leading-tight">
              {name}
            </Title>
            <span className="shrink-0 rounded bg-indigo-50 px-1.5 py-0.5 text-[11px] font-medium leading-none text-indigo-600">
              Free
            </span>
          </div>
        </div>
      </div>

      {/* แถวลิงก์ข้อกำหนด/ความเป็นส่วนตัว/แชท */}
      <div className="flex items-center gap-2 border-b border-t border-gray-100 px-5 py-2.5 text-xs text-gray-500">
        <Link href="/terms" className="hover:text-gray-800 transition-colors">
          ข้อตกลง
        </Link>
        <span className="text-gray-300">•</span>
        <Link href="/privacy" className="hover:text-gray-800 transition-colors">
          ความเป็นส่วนตัว
        </Link>
        <span className="text-gray-300">•</span>
        <button className="flex items-center hover:text-gray-800 transition-colors">
          <MessageCircle className="h-3.5 w-3.5" />
        </button>
      </div>

      {/* เมนูหลัก */}
      <div className="px-3 py-2.5">
        <div className="grid gap-0.5">
          {items.map((it) => (
            <Button
              key={it.label}
              className="h-auto w-full items-center justify-start gap-3 rounded-lg px-3 py-1.5 text-sm font-medium text-gray-700 outline-none hover:bg-gray-50 hover:text-gray-900 focus-visible:ring-0"
              variant="ghost"
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

        <div className="my-1 h-px w-full bg-gray-100" />

        <Button
          className="h-auto w-full items-center justify-start gap-3 rounded-lg px-3 py-1.5 text-sm font-medium text-gray-700 outline-none hover:bg-gray-50 hover:text-gray-900 focus-visible:ring-0"
          variant="ghost"
          disabled={signingOut}
          onClick={async () => {
            setSigningOut(true);
            await signOut();
            router.replace(withBasePath("/signin"));
            setSigningOut(false);
          }}
        >
          <LogOut className="h-[18px] w-[18px] shrink-0 text-gray-500" />
          {signingOut ? "กำลังลงชื่อออก..." : "ออกจากระบบ"}
        </Button>
      </div>
    </div>
  );
}
