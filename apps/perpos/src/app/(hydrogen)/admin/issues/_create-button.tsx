"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { CustomSelect } from "@/components/ui/custom-select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogBody,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { toast } from "@/lib/toast";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import { ISSUE_AREAS } from "@/lib/admin/issues";

async function authToken(): Promise<string> {
  const supabase = createSupabaseBrowserClient();
  const { data } = await supabase.auth.getSession();
  return data.session?.access_token ?? "";
}

const emptyForm = {
  title: "",
  type: "bug",
  severity: "sev2",
  symptom: "",
  reproduce: "",
};

export function CreateIssueButton() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const [area, setArea] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);

  const toggleArea = (a: string) =>
    setArea((prev) => (prev.includes(a) ? prev.filter((x) => x !== a) : [...prev, a]));

  const submit = async () => {
    if (!form.title.trim()) {
      toast.error("กรุณากรอกหัวข้อ");
      return;
    }
    setSaving(true);
    try {
      const res = await fetch("/api/admin/issues", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${await authToken()}`,
        },
        body: JSON.stringify({ ...form, area }),
      });
      const d = await res.json();
      if (!res.ok) throw new Error(d?.error?.message ?? "สร้างไม่สำเร็จ");
      toast.success(`สร้างแล้ว — ${d.data.ref}`);
      setOpen(false);
      setForm(emptyForm);
      setArea([]);
      router.push(`/admin/issues/${d.data.ref}`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "สร้างไม่สำเร็จ");
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      <Button size="sm" onClick={() => setOpen(true)}>
        <Plus className="mr-1 h-4 w-4" />
        เพิ่มปัญหา
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent size="lg">
          <DialogHeader>
            <DialogTitle>เพิ่มปัญหาใหม่</DialogTitle>
          </DialogHeader>
          <DialogBody>
            <div className="space-y-4">
              <div>
                <Label htmlFor="issue-title">หัวข้อ *</Label>
                <Input
                  id="issue-title"
                  className="mt-1"
                  placeholder="สรุปอาการสั้น ๆ"
                  value={form.title}
                  onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label>ประเภท</Label>
                  <CustomSelect
                    className="mt-1"
                    value={form.type}
                    onChange={(v) => setForm((f) => ({ ...f, type: v }))}
                    options={[
                      { value: "bug", label: "บั๊ก (BUG-)" },
                      { value: "config_infra", label: "ตั้งค่า/ระบบ (OPS-)" },
                      { value: "user_error", label: "ใช้งานผิด (UX-)" },
                      { value: "feature_gap", label: "ฟีเจอร์ขาด (FEAT-)" },
                    ]}
                  />
                </div>
                <div>
                  <Label>ความรุนแรง</Label>
                  <CustomSelect
                    className="mt-1"
                    value={form.severity}
                    onChange={(v) => setForm((f) => ({ ...f, severity: v }))}
                    options={[
                      { value: "sev1", label: "วิกฤต (sev1)" },
                      { value: "sev2", label: "สำคัญ (sev2)" },
                      { value: "sev3", label: "เล็กน้อย (sev3)" },
                    ]}
                  />
                </div>
              </div>

              <div>
                <Label>ชั้นที่เกี่ยว</Label>
                <div className="mt-1 flex flex-wrap gap-1.5">
                  {ISSUE_AREAS.map((a) => (
                    <button
                      key={a}
                      type="button"
                      onClick={() => toggleArea(a)}
                      className={`rounded-full border px-3 py-1 text-xs transition-colors ${
                        area.includes(a)
                          ? "border-primary bg-gray-100 text-gray-900"
                          : "border-gray-200 bg-white text-gray-500 hover:bg-gray-50"
                      }`}
                    >
                      {a}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <Label htmlFor="issue-symptom">อาการ (คาดหวัง vs จริง)</Label>
                <Input
                  id="issue-symptom"
                  className="mt-1"
                  placeholder="คาดหวัง… / จริง…"
                  value={form.symptom}
                  onChange={(e) => setForm((f) => ({ ...f, symptom: e.target.value }))}
                />
              </div>

              <div>
                <Label htmlFor="issue-reproduce">ขั้นตอนทำซ้ำ</Label>
                <Input
                  id="issue-reproduce"
                  className="mt-1"
                  placeholder="1) … 2) … 3) …"
                  value={form.reproduce}
                  onChange={(e) => setForm((f) => ({ ...f, reproduce: e.target.value }))}
                />
              </div>
            </div>
          </DialogBody>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>
              ยกเลิก
            </Button>
            <Button onClick={submit} disabled={saving}>
              {saving ? "กำลังสร้าง…" : "สร้าง"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
