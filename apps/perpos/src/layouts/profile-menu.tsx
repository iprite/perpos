"use client";

import { Title, Text, Avatar, Button, Popover } from "rizzui";
import cn from "@core/utils/class-names";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { Settings, Shield, LogOut } from "lucide-react";

import { useAuth } from "@/app/shared/auth-provider";
import { withBasePath } from "@/utils/base-path";

export default function ProfileMenu({
  buttonClassName,
  avatarClassName,
  username = false,
}: {
  buttonClassName?: string;
  avatarClassName?: string;
  username?: boolean;
}) {
  const { email, role, profile } = useAuth();
  const name = String(profile?.display_name ?? email ?? "U");

  return (
    <ProfileMenuPopover>
      <Popover.Trigger>
        <button
          className={cn(
            "w-9 shrink-0 rounded-full outline-none focus-visible:ring-[1.5px] focus-visible:ring-gray-400 focus-visible:ring-offset-2 active:translate-y-px sm:w-10",
            buttonClassName
          )}
        >
          <Avatar
            src={profile?.avatar_url ?? undefined}
            name={name}
            color="secondary"
            className={cn(
              "bg-gray-100 ring-1 ring-gray-300 text-sm font-semibold text-gray-700",
              "!h-9 !w-9 sm:!h-10 sm:!w-10",
              avatarClassName
            )}
          />
          {!!username && (
            <span className="username hidden text-gray-200 dark:text-gray-700 md:inline-flex">
              {role ? role.toUpperCase() : ""}
            </span>
          )}
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
      placement="bottom-end"
    >
      {children}
    </Popover>
  );
}

function DropdownMenu() {
  const router = useRouter();
  const { email, role, profile, signOut } = useAuth();
  const name = String(profile?.display_name ?? email ?? "U");
  const [signingOut, setSigningOut] = useState(false);
  const isAdmin = role === "admin";

  const items: Array<{ label: string; href: string; icon: React.ReactNode; show: boolean }> = [
    {
      label: "ข้อมูลส่วนตัว",
      href: "/settings",
      icon: <Settings className="h-4 w-4 text-gray-500" />,
      show: true,
    },
    {
      label: "จัดการระบบ",
      href: "/admin",
      icon: <Shield className="h-4 w-4 text-gray-500" />,
      show: isAdmin,
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
        <div className="ms-3">
          <Title
            as="h6"
            className="font-semibold"
          >
            {String(profile?.display_name ?? (role ? role.toUpperCase() : "")).trim()}
          </Title>
          <Text className="text-gray-600">{email ?? ""}</Text>
        </div>
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
