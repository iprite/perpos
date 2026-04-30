"use client";

import { Title, Text, Avatar, Button, Popover } from "rizzui";
import cn from "@core/utils/class-names";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";

import { useAuth } from "@/app/shared/auth-provider";

export default function ProfileMenu({
  buttonClassName,
  avatarClassName,
  username = false,
}: {
  buttonClassName?: string;
  avatarClassName?: string;
  username?: boolean;
}) {
  const { email, role } = useAuth();
  const initial = (email ?? "U").trim().charAt(0).toUpperCase();

  return (
    <ProfileMenuPopover>
      <Popover.Trigger>
        <button
          className={cn(
            "w-9 shrink-0 rounded-full outline-none focus-visible:ring-[1.5px] focus-visible:ring-gray-400 focus-visible:ring-offset-2 active:translate-y-px sm:w-10",
            buttonClassName
          )}
        >
          <div
            aria-hidden="true"
            className={cn(
              "flex items-center justify-center rounded-full bg-white ring-1 ring-gray-300 text-sm font-semibold text-gray-700",
              "h-9 w-9 sm:h-10 sm:w-10",
              avatarClassName
            )}
          >
            {initial}
          </div>
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
  const { email, role, signOut } = useAuth();
  const initial = (email ?? "U").trim().charAt(0).toUpperCase();
  const [signingOut, setSigningOut] = useState(false);

  return (
    <div className="w-64 text-left rtl:text-right">
      <div className="flex items-center border-b border-gray-300 px-6 pb-5 pt-6">
        <div className="flex h-10 w-10 items-center justify-center rounded-full bg-white ring-1 ring-gray-300 text-sm font-semibold text-gray-700">
          {initial}
        </div>
        <div className="ms-3">
          <Title
            as="h6"
            className="font-semibold"
          >
            {role ? role.toUpperCase() : ""}
          </Title>
          <Text className="text-gray-600">{email ?? ""}</Text>
        </div>
      </div>
      <div className="border-t border-gray-300 px-6 pb-6 pt-5">
        <Button
          className="h-auto w-full justify-start p-0 font-medium text-gray-700 outline-none focus-within:text-gray-600 hover:text-gray-900 focus-visible:ring-0"
          variant="text"
          disabled={signingOut}
          onClick={() => {
            router.push("/settings");
          }}
        >
          ตั้งค่าโปรไฟล์
        </Button>

        <div className="my-4 h-px w-full bg-gray-200" />

        <Button
          className="h-auto w-full justify-start p-0 font-medium text-gray-700 outline-none focus-within:text-gray-600 hover:text-gray-900 focus-visible:ring-0"
          variant="text"
          disabled={signingOut}
          onClick={async () => {
            setSigningOut(true);
            await signOut();
            router.replace("/sign-in");
            setSigningOut(false);
          }}
        >
          {signingOut ? "Signing out..." : "Sign Out"}
        </Button>
      </div>
    </div>
  );
}
