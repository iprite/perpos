"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Pencil } from "lucide-react";
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
import { areaLabel } from "../_meta";

async function authToken(): Promise<string> {
  const supabase = createSupabaseBrowserClient();
  const { data } = await supabase.auth.getSession();
  return data.session?.access_token ?? "";
}

export type EditableIssue = {
  title: string;
  type: string;
  severity: string;
  area: string[];
  symptom: string;
  reproduce: string;
  root_cause: string;
  fix_summary: string;
  branch: string;
};

/**
 * แก้ไขรายละเอียด issue (re-triage) — ปลดล็อกการแก้ severity/type/area/ข้อความ
 * ที่ API รองรับอยู่แล้ว (PATCH body.fields) แต่เดิม UI แก้ได้แค่สถานะ
 * โดยเฉพาะเรื่องที่แจ้งผ่าน LINE ที่ถูกตั้ง type=bug/severity=sev2 ไว้ก่อน
 */
export function EditIssueButton({
  issueRef,
  initial,
}: {
  issueRef: string;
  initial: EditableIssue;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<EditableIssue>(initial);
  const [saving, setSaving] = useState(false);

  const set = <K extends keyof EditableIssue>(k: K, v: EditableIssue[K]) =>
    setForm((f) => ({ ...f, [k]: v }));
  const toggleArea = (a: string) =>
    setForm((f) => ({
      ...f,
      area: f.area.includes(a) ? f.area.filter((x) => x !== a) : [...f.area, a],
    }));

  const save = async () => {
    if (!form.title.trim()) {
      toast.error("กรุณากรอกหัวข้อ");
      return;
    }
    setSaving(true);
    try {
      const res = await fetch(`/api/admin/issues/${encodeURIComponent(issueRef)}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${await authToken()}`,
        },
        body: JSON.stringify({
          fields: {
            title: form.title.trim(),
            type: form.type,
            severity: form.severity,
            area: form.area,
            symptom: form.symptom,
            reproduce: form.reproduce,
            root_cause: form.root_cause,
            fix_summary: form.fix_summary,
            branch: form.branch,
          },
        }),
      });
      const d = await res.json();
      if (!res.ok) throw new Error(d?.error?.message ?? "บันทึกไม่สำเร็จ");
      toast.success("บันทึกแล้ว");
      setOpen(false);
      router.refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "บันทึกไม่สำเร็จ");
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      <Button
        variant="outline"
        size="sm"
        onClick={() => {
          setForm(initial);
          setOpen(true);
        }}
      >
        <Pencil className="mr-1 h-4 w-4" />
        แก้ไขรายละเอียด
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent size="xl">
          <DialogHeader>
            <DialogTitle>แก้ไขรายละเอียด {issueRef}</DialogTitle>
          </DialogHeader>
          <DialogBody>
            <div className="space-y-4">
              <div>
                <Label htmlFor="edit-title">หัวข้อ *</Label>
                <Input
                  id="edit-title"
                  className="mt-1"
                  value={form.title}
                  onChange={(e) => set("title", e.target.value)}
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label>ประเภท</Label>
                  <CustomSelect
                    className="mt-1"
                    value={form.type}
                    onChange={(v) => set("type", v)}
                    options={[
                      { value: "bug", label: "บั๊ก (BUG-)" },
                      { value: "config_infra", label: "ตั้งค่า/ระบบ (OPS-)" },
                      { value: "user_error", label: "ใช้งานผิด (UX-)" },
                      { value: "feature_gap", label: "ฟีเจอร์ขาด (FEAT-)" },
                    ]}
                  />
                  <p className="mt-1 text-xs text-gray-400">เลขอ้างอิงเดิมไม่เปลี่ยน</p>
                </div>
                <div>
                  <Label>ความรุนแรง</Label>
                  <CustomSelect
                    className="mt-1"
                    value={form.severity}
                    onChange={(v) => set("severity", v)}
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
                    <Button
                      key={a}
                      type="button"
                      size="sm"
                      variant={form.area.includes(a) ? "default" : "outline"}
                      className="h-7 rounded-full px-3 text-xs"
                      onClick={() => toggleArea(a)}
                    >
                      {areaLabel(a)}
                    </Button>
                  ))}
                </div>
              </div>

              <div>
                <Label htmlFor="edit-symptom">อาการ</Label>
                <Input
                  id="edit-symptom"
                  className="mt-1"
                  value={form.symptom}
                  onChange={(e) => set("symptom", e.target.value)}
                />
              </div>
              <div>
                <Label htmlFor="edit-reproduce">ขั้นตอนทำซ้ำ</Label>
                <Input
                  id="edit-reproduce"
                  className="mt-1"
                  value={form.reproduce}
                  onChange={(e) => set("reproduce", e.target.value)}
                />
              </div>
              <div>
                <Label htmlFor="edit-root">ต้นเหตุ (root cause)</Label>
                <Input
                  id="edit-root"
                  className="mt-1"
                  value={form.root_cause}
                  onChange={(e) => set("root_cause", e.target.value)}
                />
              </div>
              <div>
                <Label htmlFor="edit-fix">วิธีแก้</Label>
                <Input
                  id="edit-fix"
                  className="mt-1"
                  value={form.fix_summary}
                  onChange={(e) => set("fix_summary", e.target.value)}
                />
              </div>
              <div>
                <Label htmlFor="edit-branch">Branch</Label>
                <Input
                  id="edit-branch"
                  className="mt-1"
                  value={form.branch}
                  onChange={(e) => set("branch", e.target.value)}
                />
              </div>
            </div>
          </DialogBody>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>
              ยกเลิก
            </Button>
            <Button onClick={save} disabled={saving}>
              {saving ? "กำลังบันทึก…" : "บันทึก"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
