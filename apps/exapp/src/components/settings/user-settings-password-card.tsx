"use client";

import React, { useCallback, useMemo, useState } from "react";
import toast from "react-hot-toast";
import { Button, Password } from "rizzui";
import type { SupabaseClient } from "@supabase/supabase-js";

export default function PasswordCard({ supabase, disabled }: { supabase: SupabaseClient; disabled: boolean }) {
  const [pw, setPw] = useState("");
  const [pw2, setPw2] = useState("");
  const [saving, setSaving] = useState(false);
  const canSave = useMemo(() => pw.trim().length >= 8 && pw === pw2, [pw, pw2]);

  const onChangePassword = useCallback(async () => {
    if (!canSave) {
      toast.error("กรุณาตรวจสอบรหัสผ่าน");
      return;
    }
    setSaving(true);
    try {
      const { error } = await supabase.auth.updateUser({ password: pw });
      if (error) {
        toast.error(error.message);
        return;
      }
      toast.success("เปลี่ยนรหัสผ่านแล้ว");
      setPw("");
      setPw2("");
    } finally {
      setSaving(false);
    }
  }, [canSave, pw, supabase]);

  return (
    <div className="rounded-xl border border-gray-200 bg-white p-5">
      <div className="text-base font-semibold text-gray-900">ความปลอดภัย</div>
      <div className="mt-1 text-sm text-gray-600">เปลี่ยนรหัสผ่านสำหรับการเข้าสู่ระบบ</div>

      <div className="mt-4 grid grid-cols-1 gap-4 md:grid-cols-2">
        <Password label="รหัสผ่านใหม่" value={pw} onChange={(e) => setPw(e.target.value)} />
        <Password label="ยืนยันรหัสผ่านใหม่" value={pw2} onChange={(e) => setPw2(e.target.value)} />
      </div>

      <div className="mt-2 text-xs text-gray-500">อย่างน้อย 8 ตัวอักษร</div>

      <div className="mt-5 flex justify-end">
        <Button disabled={disabled || saving || !canSave} onClick={() => void onChangePassword()}>
          เปลี่ยนรหัสผ่าน
        </Button>
      </div>
    </div>
  );
}

