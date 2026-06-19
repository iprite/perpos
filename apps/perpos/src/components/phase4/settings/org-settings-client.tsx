"use client";

import React, { useMemo, useState, useTransition } from "react";
import { toast } from '@/lib/toast';
import { Save, UploadCloud } from "lucide-react";

import { Button } from "@/components/ui/button";
import { CustomSelect } from "@/components/ui/custom-select";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import cn from "@core/utils/class-names";
import { updateOrgAction, uploadOrgAssetAction, upsertDocumentSequencesAction, upsertOrgSettingsAction, type DocSequence, type OrgSettings } from "@/lib/phase4/settings/actions";

export function OrgSettingsClient(props: {
  organizationId: string;
  initialOrgName: string;
  initialBaseCurrency: string;
  initialSettings: OrgSettings;
  initialSequences: DocSequence[];
}) {
  const [pending, startTransition] = useTransition();
  const [orgName, setOrgName] = useState(props.initialOrgName);
  const [baseCurrency, setBaseCurrency] = useState(props.initialBaseCurrency);
  const [settings, setSettings] = useState(props.initialSettings);
  const [sequences, setSequences] = useState<DocSequence[]>(props.initialSequences);

  const byType = useMemo(() => {
    const m = new Map<string, DocSequence>();
    for (const s of sequences) m.set(s.docType, s);
    return m;
  }, [sequences]);

  const updateSeq = (docType: string, patch: Partial<DocSequence>) => {
    const next = [...sequences];
    const idx = next.findIndex((x) => x.docType === docType);
    if (idx >= 0) next[idx] = { ...next[idx], ...patch } as DocSequence;
    else next.push({ docType, prefix: "", nextNumber: 1, resetPolicy: "yearly", ...patch } as DocSequence);
    setSequences(next);
  };

  const upload = (kind: "logo" | "accountant_signature" | "authorized_signature", file: File) => {
    startTransition(async () => {
      const res = await uploadOrgAssetAction({ organizationId: props.organizationId, kind, file });
      if (!res.ok) {
        toast.error(String(res.error));
        return;
      }
      if (kind === "logo") setSettings((s) => ({ ...s, logoObjectPath: res.path }));
      if (kind === "accountant_signature") setSettings((s) => ({ ...s, accountantSignatureObjectPath: res.path }));
      if (kind === "authorized_signature") setSettings((s) => ({ ...s, authorizedSignatureObjectPath: res.path }));
      toast.success("อัปโหลดแล้ว");
    });
  };

  const saveAll = () => {
    startTransition(async () => {
      const [a, b, c] = await Promise.all([
        updateOrgAction({ organizationId: props.organizationId, name: orgName, baseCurrency }),
        upsertOrgSettingsAction({ organizationId: props.organizationId, settings }),
        upsertDocumentSequencesAction({ organizationId: props.organizationId, sequences }),
      ]);
      if (!a.ok) { toast.error(a.error); return; }
      if (!b.ok) { toast.error(b.error); return; }
      if (!c.ok) { toast.error(c.error); return; }
      toast.success("บันทึกการตั้งค่าแล้ว");
    });
  };

  const seqWht = byType.get("wht") ?? { docType: "wht", prefix: "WHT-", nextNumber: 1, resetPolicy: "yearly" };
  const seqInv = byType.get("invoice") ?? { docType: "invoice", prefix: "INV-", nextNumber: 1, resetPolicy: "monthly" };

  return (
    <div className="grid gap-6">
      {/* ── Section 1: ข้อมูลในระบบ ── */}
      <div className="rounded-xl border border-slate-200 bg-white p-5">
        <div className="text-sm font-semibold text-slate-900">ข้อมูลในระบบ</div>
        <div className="mt-4 grid gap-4 md:grid-cols-2">
          <div className="grid gap-2">
            <Label>ชื่อองค์กรในระบบ</Label>
            <Input value={orgName} onChange={(e) => setOrgName(e.target.value)} placeholder="ชื่อที่แสดงใน org switcher" />
          </div>
          <div className="grid gap-2">
            <Label>สกุลเงินหลัก</Label>
            <CustomSelect
              value={baseCurrency}
              onChange={setBaseCurrency}
              options={[
                { value: "THB", label: "THB — บาทไทย" },
                { value: "USD", label: "USD — US Dollar" },
                { value: "EUR", label: "EUR — Euro" },
                { value: "JPY", label: "JPY — Japanese Yen" },
                { value: "CNY", label: "CNY — Chinese Yuan" },
                { value: "SGD", label: "SGD — Singapore Dollar" },
              ]}
            />
          </div>
        </div>
      </div>

      {/* ── Section 2: ข้อมูลนิติบุคคล ── */}
      <div className="rounded-xl border border-slate-200 bg-white p-5">
        <div className="text-sm font-semibold text-slate-900">ข้อมูลนิติบุคคล</div>
        <div className="mt-4 grid gap-4 md:grid-cols-2">
          <div className="grid gap-2">
            <Label>ชื่อบริษัท (ไทย)</Label>
            <Input value={settings.companyNameTh} onChange={(e) => setSettings((s) => ({ ...s, companyNameTh: e.target.value }))} />
          </div>
          <div className="grid gap-2">
            <Label>ชื่อบริษัท (อังกฤษ)</Label>
            <Input value={settings.companyNameEn} onChange={(e) => setSettings((s) => ({ ...s, companyNameEn: e.target.value }))} />
          </div>
          <div className="grid gap-2 md:col-span-2">
            <Label>ที่อยู่</Label>
            <textarea
              rows={2}
              value={settings.address}
              onChange={(e) => setSettings((s) => ({ ...s, address: e.target.value }))}
              className="flex w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2 ring-offset-white resize-none"
            />
          </div>
          <div className="grid gap-2">
            <Label>เลขประจำตัวผู้เสียภาษี</Label>
            <Input value={settings.taxId} onChange={(e) => setSettings((s) => ({ ...s, taxId: e.target.value }))} placeholder="0000000000000" />
          </div>
          <div className="grid gap-2">
            <Label>สาขา</Label>
            <Input value={settings.branchInfo} onChange={(e) => setSettings((s) => ({ ...s, branchInfo: e.target.value }))} placeholder="สำนักงานใหญ่ / สาขา 0001" />
          </div>
        </div>
      </div>

      {/* ── Section 3: ข้อมูลติดต่อ ── */}
      <div className="rounded-xl border border-slate-200 bg-white p-5">
        <div className="text-sm font-semibold text-slate-900">ข้อมูลติดต่อ</div>
        <div className="mt-4 grid gap-4 md:grid-cols-2">
          <div className="grid gap-2">
            <Label>โทรศัพท์</Label>
            <Input type="tel" value={settings.phone} onChange={(e) => setSettings((s) => ({ ...s, phone: e.target.value }))} placeholder="02-xxx-xxxx" />
          </div>
          <div className="grid gap-2">
            <Label>โทรสาร (Fax)</Label>
            <Input type="tel" value={settings.fax} onChange={(e) => setSettings((s) => ({ ...s, fax: e.target.value }))} placeholder="02-xxx-xxxx" />
          </div>
          <div className="grid gap-2">
            <Label>อีเมลองค์กร</Label>
            <Input type="email" value={settings.email} onChange={(e) => setSettings((s) => ({ ...s, email: e.target.value }))} placeholder="info@company.com" />
          </div>
          <div className="grid gap-2">
            <Label>เว็บไซต์</Label>
            <Input type="url" value={settings.website} onChange={(e) => setSettings((s) => ({ ...s, website: e.target.value }))} placeholder="https://www.company.com" />
          </div>
        </div>
      </div>

      <div className="rounded-xl border border-slate-200 bg-white p-5">
        <div className="text-sm font-semibold text-slate-900">โลโก้และลายเซ็น</div>
        <div className="mt-4 grid gap-4 md:grid-cols-3">
          <UploadCard title="โลโก้" hint="PNG/JPG/SVG" onPick={(f) => upload("logo", f)} disabled={pending} />
          <UploadCard title="ลายเซ็นนักบัญชี" hint="PNG" onPick={(f) => upload("accountant_signature", f)} disabled={pending} />
          <UploadCard title="ลายเซ็นผู้มีอำนาจ" hint="PNG" onPick={(f) => upload("authorized_signature", f)} disabled={pending} />
        </div>
        <div className="mt-3 text-xs text-slate-600">
          Paths: {settings.logoObjectPath ?? "-"} | {settings.accountantSignatureObjectPath ?? "-"} | {settings.authorizedSignatureObjectPath ?? "-"}
        </div>
      </div>

      <div className="rounded-xl border border-slate-200 bg-white p-5">
        <div className="text-sm font-semibold text-slate-900">เลขที่เอกสาร</div>
        <div className="mt-4 grid gap-4 md:grid-cols-2">
          <SequenceCard
            title="WHT (50 ทวิ)"
            seq={seqWht}
            onChange={(p) => updateSeq("wht", p)}
          />
          <SequenceCard
            title="Invoice"
            seq={seqInv}
            onChange={(p) => updateSeq("invoice", p)}
          />
        </div>
      </div>

      <div className="flex justify-end">
        <Button className="gap-2" onClick={saveAll} disabled={pending}>
          <Save className={cn("h-4 w-4", pending ? "animate-spin" : undefined)} />
          บันทึก
        </Button>
      </div>
    </div>
  );
}

function UploadCard(props: { title: string; hint: string; onPick: (f: File) => void; disabled: boolean }) {
  return (
    <div className="rounded-lg border border-slate-200 p-4">
      <div className="text-sm font-semibold text-slate-900">{props.title}</div>
      <div className="mt-1 text-xs text-slate-600">{props.hint}</div>
      <label className={cn("mt-3 flex h-10 cursor-pointer items-center justify-center gap-2 rounded-md border border-slate-200 bg-slate-50 text-sm text-slate-700 hover:bg-slate-100", props.disabled ? "opacity-50 cursor-not-allowed" : undefined)}>
        <UploadCloud className="h-4 w-4" />
        <span>อัปโหลด</span>
        <input
          type="file"
          className="hidden"
          disabled={props.disabled}
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) props.onPick(f);
          }}
        />
      </label>
    </div>
  );
}

function SequenceCard(props: { title: string; seq: DocSequence; onChange: (p: Partial<DocSequence>) => void }) {
  return (
    <div className="rounded-lg border border-slate-200 p-4">
      <div className="text-sm font-semibold text-slate-900">{props.title}</div>
      <div className="mt-3 grid gap-3">
        <div className="grid gap-2">
          <Label>Prefix</Label>
          <Input value={props.seq.prefix} onChange={(e) => props.onChange({ prefix: e.target.value })} />
        </div>
        <div className="grid grid-cols-2 gap-2">
          <div className="grid gap-2">
            <Label>Next Number</Label>
            <Input inputMode="numeric" value={String(props.seq.nextNumber)} onChange={(e) => props.onChange({ nextNumber: Number(e.target.value || 1) })} />
          </div>
          <div className="grid gap-2">
            <Label>Reset</Label>
            <CustomSelect
              value={props.seq.resetPolicy}
              onChange={(v) => props.onChange({ resetPolicy: v as any })}
              options={[
                { value: "never",   label: "Never" },
                { value: "yearly",  label: "Yearly" },
                { value: "monthly", label: "Monthly" },
              ]}
            />
          </div>
        </div>
        <div className="text-xs text-slate-600">ตัวอย่าง: {previewDocNo(props.seq)}</div>
      </div>
    </div>
  );
}

function previewDocNo(seq: DocSequence) {
  const now = new Date();
  const token = seq.resetPolicy === "monthly" ? `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, "0")}` : seq.resetPolicy === "yearly" ? String(now.getFullYear()) : "";
  const no = String(seq.nextNumber).padStart(4, "0");
  return seq.prefix + (token ? token + "-" : "") + no;
}

