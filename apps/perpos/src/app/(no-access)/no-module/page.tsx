"use client";

import { LayoutGrid, LogOut } from "lucide-react";
import { useMemo } from "react";
import { useRouter } from "next/navigation";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";

export default function NoModulePage() {
  const supabase = useMemo(() => createSupabaseBrowserClient(), []);
  const router = useRouter();

  const signOut = async () => {
    await supabase.auth.signOut();
    router.push("/signin");
  };

  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-5 text-center">
      <div className="rounded-full bg-slate-100 p-5">
        <LayoutGrid className="h-10 w-10 text-slate-400" />
      </div>
      <div className="flex flex-col gap-2">
        <h1 className="text-xl font-semibold text-gray-900">ไม่มี Module ที่เข้าถึงได้</h1>
        <p className="max-w-sm text-sm text-gray-500">
          องค์กรของคุณยังไม่ได้เปิดใช้งาน module ใด
          <br />
          หรือ role ของคุณยังไม่มีสิทธิ์เข้าถึง
          <br />
          กรุณาติดต่อผู้ดูแลระบบ
        </p>
      </div>
      <Button variant="outline" onClick={() => void signOut()}>
        <LogOut className="mr-2 h-4 w-4" />
        ออกจากระบบ
      </Button>
    </div>
  );
}
