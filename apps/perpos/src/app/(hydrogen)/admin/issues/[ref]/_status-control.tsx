"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { CustomSelect } from "@/components/ui/custom-select";
import { toast } from "@/lib/toast";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";

async function authToken(): Promise<string> {
  const supabase = createSupabaseBrowserClient();
  const { data } = await supabase.auth.getSession();
  return data.session?.access_token ?? "";
}

const STATUS_OPTIONS = [
  { value: "open", label: "เปิดเรื่อง" },
  { value: "triaging", label: "คัดแยก" },
  { value: "diagnosing", label: "หาต้นเหตุ" },
  { value: "fixing", label: "กำลังแก้" },
  { value: "verifying", label: "กำลังตรวจ" },
  { value: "fixed", label: "แก้แล้ว (รอ deploy)" },
  { value: "deployed", label: "ขึ้น prod แล้ว" },
  { value: "closed", label: "ปิดสมบูรณ์" },
  { value: "blocked", label: "ติดบล็อก" },
  { value: "wontfix", label: "ไม่แก้" },
  { value: "duplicate", label: "ซ้ำ" },
  { value: "handoff_feature", label: "ส่งต่อฟีเจอร์" },
];

export function StatusControl({ issueRef, current }: { issueRef: string; current: string }) {
  const router = useRouter();
  const [status, setStatus] = useState(current);
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);

  const dirty = status !== current || note.trim().length > 0;

  const save = async () => {
    setSaving(true);
    try {
      const res = await fetch(`/api/admin/issues/${encodeURIComponent(issueRef)}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${await authToken()}`,
        },
        body: JSON.stringify({
          status: status !== current ? status : undefined,
          note: note.trim() || undefined,
        }),
      });
      const d = await res.json();
      if (!res.ok) throw new Error(d?.error?.message ?? "อัปเดตไม่สำเร็จ");
      toast.success("อัปเดตแล้ว");
      setNote("");
      router.refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "อัปเดตไม่สำเร็จ");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="rounded-xl border border-gray-100 bg-gray-50 p-4">
      <p className="mb-2 text-xs font-medium text-gray-500">อัปเดตสถานะ</p>
      <div className="flex flex-wrap items-center gap-2">
        <CustomSelect
          value={status}
          onChange={setStatus}
          options={STATUS_OPTIONS}
          className="w-48"
        />
        <Input
          placeholder="โน้ต (ไม่บังคับ) — บันทึกลงไทม์ไลน์"
          value={note}
          onChange={(e) => setNote(e.target.value)}
          className="min-w-[200px] flex-1"
        />
        <Button onClick={save} disabled={saving || !dirty}>
          {saving ? "กำลังบันทึก…" : "บันทึก"}
        </Button>
      </div>
    </div>
  );
}
