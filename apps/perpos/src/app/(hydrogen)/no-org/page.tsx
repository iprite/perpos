"use client";

import { Building2, LogOut } from "lucide-react";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import { useRouter } from "next/navigation";
import { useMemo } from "react";
import { Button } from "@/components/ui/button";

export default function NoOrgPage() {
  const supabase = useMemo(() => createSupabaseBrowserClient(), []);
  const router = useRouter();

  const signOut = async () => {
    await supabase.auth.signOut();
    router.push("/signin");
  };

  return (
    <div className="flex min-h-[70vh] flex-col items-center justify-center gap-5 text-center">
      <div className="rounded-full bg-amber-100 p-5">
        <Building2 className="h-10 w-10 text-amber-500" />
      </div>
      <div className="flex flex-col gap-2">
        <h1 className="text-xl font-semibold text-gray-900">ยังไม่ได้เข้าร่วมองค์กร</h1>
        <p className="max-w-sm text-sm text-gray-500">
          บัญชีของคุณยังไม่ถูกเพิ่มเข้าองค์กรใด
          <br />
          กรุณาติดต่อผู้ดูแลระบบเพื่อขอสิทธิ์การเข้าถึง
        </p>
      </div>
      <Button variant="outline" onClick={() => void signOut()}>
        <LogOut className="mr-2 h-4 w-4" />
        ออกจากระบบ
      </Button>
    </div>
  );
}
