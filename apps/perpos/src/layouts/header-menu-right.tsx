"use client";

import { LogIn } from "lucide-react";

import { Button } from "@/components/ui/button";

import { useAuth } from "@/app/shared/auth-provider";
import { useModal } from "@/app/shared/modal-views/use-modal";
import GoogleAuthView from "@/components/auth/google-auth-view";

export default function HeaderMenuRight() {
  const { userId, loading } = useAuth();
  const { openModal, closeModal } = useModal();

  // โปรไฟล์/เมนูผู้ใช้ ย้ายไปอยู่ที่ sidebar ด้านล่างแล้ว — header เหลือเฉพาะปุ่ม login ตอนยังไม่ล็อกอิน
  if (loading || userId) return null;

  return (
    <div className="ms-auto grid shrink-0 items-center gap-2 text-gray-700 xs:gap-3 xl:gap-4">
      <Button
        className="gap-2"
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
    </div>
  );
}
