"use client";

import React, { useMemo, useState } from "react";
import { Button, Input } from "rizzui";
import AppSelect from "@core/ui/app-select";

import type { RepresentativeLevel, Role } from "@/lib/supabase/types";
import type { OrgOption, RepOption } from "@/components/admin-users/types";

const roleOptions: Array<{ label: string; value: Role }> = [
  { label: "Sale", value: "sale" },
  { label: "Operation", value: "operation" },
  { label: "Employer", value: "employer" },
  { label: "Representative", value: "representative" },
  { label: "Admin", value: "admin" },
];

const repLevelOptions: Array<{ label: string; value: RepresentativeLevel }> = [
  { label: "หัวหน้าทีม", value: "lead" },
  { label: "ลูกทีม", value: "member" },
];

export default function InviteForm({
  loading,
  orgOptions,
  repOptions,
  repLeadOptions,
  onInvite,
}: {
  loading: boolean;
  orgOptions: OrgOption[];
  repOptions: RepOption[];
  repLeadOptions: Array<{ label: string; value: string }>;
  onInvite: (payload: {
    email: string;
    role: Role;
    customerId?: string;
    companyRepresentativeId?: string;
    representativeLevel?: RepresentativeLevel;
    representativeLeadId?: string;
  }) => Promise<void>;
}) {
  const [email, setEmail] = useState("");
  const [lastAutoEmail, setLastAutoEmail] = useState("");
  const [role, setRole] = useState<Role>("sale");
  const [customerId, setCustomerId] = useState<string>("");
  const [companyRepresentativeId, setCompanyRepresentativeId] = useState<string>("");
  const [repLevel, setRepLevel] = useState<RepresentativeLevel>("lead");
  const [repLeadId, setRepLeadId] = useState<string>("");

  const canInvite = useMemo(() => {
    const emailTrimmed = email.trim();
    if (emailTrimmed.length === 0) return false;
    const looksLikeEmail = /^\S+@\S+\.\S+$/.test(emailTrimmed);
    if (!looksLikeEmail) return false;
    if (role === "employer") return customerId.length > 0;
    if (role === "representative") {
      if (!companyRepresentativeId) return false;
      if (repLevel === "member" && !repLeadId) return false;
    }
    return true;
  }, [companyRepresentativeId, customerId, email, repLeadId, repLevel, role]);

  return (
    <div className="mt-5 grid gap-3 rounded-xl border border-gray-200 bg-white p-4">
      <div className="text-sm font-semibold text-gray-900">เพิ่มผู้ใช้และส่งอีเมลตั้งรหัส</div>
      <div className="grid gap-3 md:grid-cols-2">
        <Input
          label="อีเมล"
          value={email}
          onChange={(e) => {
            setEmail(e.target.value);
            if (lastAutoEmail.trim()) setLastAutoEmail("");
          }}
          placeholder="name@company.com"
        />
        <div>
          <AppSelect
            label="Role"
            placeholder="เลือก"
            options={roleOptions}
            value={role}
            onChange={(v: Role) => {
              setRole(v);
              setLastAutoEmail("");
            }}
            getOptionValue={(o) => o.value}
            displayValue={(selected) => roleOptions.find((o) => o.value === selected)?.label ?? ""}
            selectClassName="h-10 px-3"
          />
        </div>
      </div>

      {role === "employer" ? (
        <div>
          <AppSelect
            label="ผู้องค์กร (นายจ้าง)"
            placeholder={orgOptions.length ? "เลือกนายจ้าง" : "ยังไม่มีนายจ้าง"}
            options={orgOptions}
            value={customerId}
            onChange={(v: string) => {
              const nextId = String(v ?? "");
              setCustomerId(nextId);
              const emailTrimmed = email.trim();
              const autoTrimmed = lastAutoEmail.trim();
              const shouldAutofill = emailTrimmed.length === 0 || (autoTrimmed.length > 0 && emailTrimmed === autoTrimmed);
              if (!shouldAutofill) return;
              const nextEmail = String(orgOptions.find((o) => o.value === nextId)?.email ?? "").trim();
              if (!nextEmail) {
                setEmail("");
                setLastAutoEmail("");
                return;
              }
              setEmail(nextEmail);
              setLastAutoEmail(nextEmail);
            }}
            getOptionValue={(o) => o.value}
            displayValue={(selected) => orgOptions.find((o) => o.value === selected)?.label ?? ""}
            selectClassName="h-10 px-3"
          />
          {!orgOptions.length ? (
            <div className="mt-2 text-sm text-gray-600">
              ยังไม่มีข้อมูลนายจ้าง กรุณาไปเพิ่มที่ <a className="text-blue-600 underline" href="/customers">หน้า นายจ้าง</a>
            </div>
          ) : null}
        </div>
      ) : null}

      {role === "representative" ? (
        <div className="grid gap-3 md:grid-cols-2">
          <div>
            <AppSelect
              label="ตัวแทนบริษัท"
              placeholder="เลือกตัวแทน"
              options={repOptions}
              value={companyRepresentativeId}
              onChange={(v: string) => {
                const nextId = String(v ?? "");
                setCompanyRepresentativeId(nextId);
                const emailTrimmed = email.trim();
                const autoTrimmed = lastAutoEmail.trim();
                const shouldAutofill = emailTrimmed.length === 0 || (autoTrimmed.length > 0 && emailTrimmed === autoTrimmed);
                if (!shouldAutofill) return;
                const nextEmail = String(repOptions.find((o) => o.value === nextId)?.email ?? "").trim();
                if (!nextEmail) {
                  setEmail("");
                  setLastAutoEmail("");
                  return;
                }
                setEmail(nextEmail);
                setLastAutoEmail(nextEmail);
              }}
              getOptionValue={(o) => o.value}
              displayValue={(selected) => repOptions.find((o) => o.value === selected)?.label ?? ""}
              selectClassName="h-10 px-3"
            />
          </div>
          <div>
            <AppSelect
              label="ระดับทีม"
              placeholder="เลือก"
              options={repLevelOptions}
              value={repLevel}
              onChange={(v: RepresentativeLevel) => setRepLevel(v)}
              getOptionValue={(o) => o.value}
              displayValue={(selected) => repLevelOptions.find((o) => o.value === selected)?.label ?? ""}
              selectClassName="h-10 px-3"
            />
          </div>
          {repLevel === "member" ? (
            <div className="md:col-span-2">
              <AppSelect
                label="หัวหน้าทีม"
                placeholder={repLeadOptions.length ? "เลือกหัวหน้าทีม" : "ยังไม่มีหัวหน้าทีม"}
                options={repLeadOptions}
                value={repLeadId}
                onChange={(v: string) => setRepLeadId(v)}
                getOptionValue={(o) => o.value}
                displayValue={(selected) => repLeadOptions.find((o) => o.value === selected)?.label ?? ""}
                selectClassName="h-10 px-3"
              />
            </div>
          ) : null}
        </div>
      ) : null}

      <div>
        <Button
          disabled={loading || !canInvite}
          onClick={async () => {
            await onInvite({
              email: email.trim(),
              role,
              customerId: role === "employer" ? customerId : undefined,
              companyRepresentativeId: role === "representative" ? companyRepresentativeId : undefined,
              representativeLevel: role === "representative" ? repLevel : undefined,
              representativeLeadId: role === "representative" && repLevel === "member" ? repLeadId : undefined,
            });
            setEmail("");
            setLastAutoEmail("");
            setCustomerId("");
            setCompanyRepresentativeId("");
            setRepLeadId("");
          }}
        >
          ส่งอีเมลเชิญตั้งรหัส
        </Button>
      </div>
    </div>
  );
}
