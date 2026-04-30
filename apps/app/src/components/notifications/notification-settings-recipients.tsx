"use client";

import React, { useMemo, useState } from "react";
import { Button, Input } from "rizzui";

import AppSelect from "@core/ui/app-select";

export type Audience = "employer" | "sale";

export type CustomerOption = { id: string; name: string };

export type RecipientRow = {
  id: string;
  customer_id: string;
  audience: Audience;
  channel: "email";
  destination_email: string;
  enabled: boolean;
  note: string | null;
};

export function NotificationSettingsRecipientsCard(props: {
  loading: boolean;
  customers: CustomerOption[];
  recipients: RecipientRow[];
  onAdd: (input: { customerId: string; audience: Audience; email: string; note: string }) => Promise<void>;
  onToggle: (id: string, enabled: boolean) => Promise<void>;
}) {
  const customerOptions = useMemo(() => props.customers.map((c) => ({ label: c.name, value: c.id })), [props.customers]);
  const customerNameById = useMemo(() => new Map(props.customers.map((c) => [c.id, c.name])), [props.customers]);

  const [customerId, setCustomerId] = useState<string>("");
  const [audience, setAudience] = useState<Audience>("employer");
  const [email, setEmail] = useState<string>("");
  const [note, setNote] = useState<string>("");

  return (
    <div className="rounded-xl border border-gray-200 bg-white p-4">
      <div className="text-sm font-semibold text-gray-900">ผู้รับเพิ่มเติม (อีเมล)</div>
      <div className="mt-1 text-xs text-gray-500">ใช้เมื่อผู้รับไม่มีบัญชีในระบบ หรืออยากให้มีหลายอีเมล</div>

      <div className="mt-4 grid gap-3 md:grid-cols-4">
        <div className="md:col-span-2">
          <AppSelect
            label="นายจ้าง"
            placeholder="เลือก"
            options={customerOptions}
            value={customerId}
            onChange={(v: string) => setCustomerId(v)}
            getOptionValue={(o) => o.value}
            displayValue={(selected) => customerOptions.find((o) => o.value === selected)?.label ?? ""}
            selectClassName="h-10 px-3"
            searchable
            searchPlaceHolder="ค้นหานายจ้าง..."
            inPortal={false}
            disabled={props.loading}
          />
        </div>
        <div>
          <AppSelect
            label="กลุ่มผู้รับ"
            placeholder="เลือก"
            options={[
              { label: "นายจ้าง", value: "employer" },
              { label: "ทีมขาย", value: "sale" },
            ]}
            value={audience}
            onChange={(v: any) => setAudience(v)}
            getOptionValue={(o) => o.value}
            displayValue={(selected) =>
              (
                [
                  { label: "นายจ้าง", value: "employer" },
                  { label: "ทีมขาย", value: "sale" },
                ] as any[]
              ).find((o) => o.value === selected)?.label ?? ""
            }
            selectClassName="h-10 px-3"
            inPortal={false}
            disabled={props.loading}
          />
        </div>
        <div>
          <Input label="อีเมล" value={email} onChange={(e) => setEmail(e.target.value)} disabled={props.loading} />
        </div>
      </div>

      <div className="mt-3 grid gap-3 md:grid-cols-[1fr_auto]">
        <Input label="หมายเหตุ" value={note} onChange={(e) => setNote(e.target.value)} disabled={props.loading} />
        <div className="flex items-end justify-end">
          <Button
            onClick={() => {
              props.onAdd({ customerId, audience, email, note });
              setEmail("");
              setNote("");
            }}
            disabled={props.loading}
          >
            เพิ่มผู้รับ
          </Button>
        </div>
      </div>

      <div className="mt-4 overflow-x-auto">
        <div className="min-w-[960px]">
          <div className="grid grid-cols-[1fr_0.6fr_0.8fr_0.6fr_0.6fr] gap-3 rounded-lg bg-gray-50 px-3 py-2 text-xs font-semibold text-gray-600">
            <div>นายจ้าง</div>
            <div>กลุ่มผู้รับ</div>
            <div>อีเมล</div>
            <div>สถานะ</div>
            <div>จัดการ</div>
          </div>
          {props.recipients.length === 0 ? (
            <div className="px-3 py-6 text-sm text-gray-500">ยังไม่มีผู้รับเพิ่มเติม</div>
          ) : (
            props.recipients.map((r) => (
              <div key={r.id} className="grid grid-cols-[1fr_0.6fr_0.8fr_0.6fr_0.6fr] gap-3 border-b border-gray-100 px-3 py-3 text-sm last:border-b-0">
                <div className="text-gray-700">{customerNameById.get(r.customer_id) ?? r.customer_id}</div>
                <div className="text-gray-700">{r.audience === "sale" ? "ทีมขาย" : "นายจ้าง"}</div>
                <div className="text-gray-700">{r.destination_email}</div>
                <div className="text-gray-700">{r.enabled ? "เปิด" : "ปิด"}</div>
                <div>
                  <Button size="sm" variant="outline" onClick={() => props.onToggle(r.id, !r.enabled)} disabled={props.loading}>
                    {r.enabled ? "ปิด" : "เปิด"}
                  </Button>
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}

