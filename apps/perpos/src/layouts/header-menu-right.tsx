"use client";

import ProfileMenu from "@/layouts/profile-menu";
import { Button } from "rizzui";
import { LogIn } from "lucide-react";

import { useAuth } from "@/app/shared/auth-provider";
import { useModal } from "@/app/shared/modal-views/use-modal";
import GoogleAuthView from "@/components/auth/google-auth-view";

export default function HeaderMenuRight() {
  const { userId, loading } = useAuth();
  const { openModal, closeModal } = useModal();

  return (
    <div className="ms-auto grid shrink-0 items-center gap-2 text-gray-700 xs:gap-3 xl:gap-4">
      {loading ? (
        <div className="h-9 w-28 animate-pulse rounded-lg bg-gray-200" />
      ) : userId ? (
        <div className="grid grid-cols-1 items-center gap-2 xs:gap-3 xl:gap-4">
          <ProfileMenu />
        </div>
      ) : (
        <Button
          className="h-9 gap-2 bg-indigo-600 text-white hover:bg-indigo-500"
          onClick={() => {
            openModal({
              view: <GoogleAuthView mode="modal" onClose={closeModal} />,
              customSize: 520,
              size: "sm",
            });
          }}
        >
          <LogIn className="h-4 w-4" />
          เข้าสู่ระบบ
        </Button>
      )}
    </div>
  );
}
