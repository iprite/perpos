"use client";

import React, { useMemo, useState } from "react";
import { Button, Input } from "rizzui";

import AppSelect from "@core/ui/app-select";

export type DocType = "passport" | "visa" | "wp";
export type Audience = "employer" | "sale";

export type TemplateRow = {
  id: string;
  customer_id: string | null;
  doc_type: DocType;
  audience: Audience;
  channel: "email";
  subject_template: string;
  body_template: string;
  enabled: boolean;
};

export function NotificationSettingsTemplatesCard(props: {
  loading: boolean;
  templates: TemplateRow[];
  onSaveTemplate: (id: string, next: Pick<TemplateRow, "subject_template" | "body_template" | "enabled">) => Promise<void>;
  onSendTest: (docType: DocType, audience: Audience, toEmail: string) => Promise<void>;
}) {
  const [selectedDoc, setSelectedDoc] = useState<DocType>("passport");
  const [selectedAudience, setSelectedAudience] = useState<Audience>("employer");

  const selectedRow = useMemo(() => {
    return (
      props.templates.find((t) => t.customer_id === null && t.doc_type === selectedDoc && t.audience === selectedAudience && t.channel === "email") ?? null
    );
  }, [props.templates, selectedAudience, selectedDoc]);

  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [enabled, setEnabled] = useState(true);

  React.useEffect(() => {
    if (!selectedRow) return;
    setSubject(selectedRow.subject_template);
    setBody(selectedRow.body_template);
    setEnabled(Boolean(selectedRow.enabled));
  }, [selectedRow]);

  return (
    <div className="rounded-xl border border-gray-200 bg-white p-4">
      <div className="text-sm font-semibold text-gray-900">แม่แบบอีเมล (ค่าเริ่มต้น)</div>
      <div className="mt-1 text-xs text-gray-500">
        ตัวแปร: {"{{customer_name}}"}, {"{{worker_full_name}}"}, {"{{expires_at}}"}, {"{{days_left}}"}, {"{{passport_no}}"}, {"{{wp_number}}"}
      </div>

      <div className="mt-4 grid gap-3 md:grid-cols-2">
        <div>
          <AppSelect
            label="ประเภทเอกสาร"
            placeholder="เลือก"
            options={[
              { label: "พาสปอร์ต", value: "passport" },
              { label: "วีซ่า", value: "visa" },
              { label: "ใบอนุญาตทำงาน", value: "wp" },
            ]}
            value={selectedDoc}
            onChange={(v: any) => setSelectedDoc(v)}
            getOptionValue={(o) => o.value}
            displayValue={(selected) =>
              (
                [
                  { label: "พาสปอร์ต", value: "passport" },
                  { label: "วีซ่า", value: "visa" },
                  { label: "ใบอนุญาตทำงาน", value: "wp" },
                ] as any[]
              ).find((o) => o.value === selected)?.label ?? ""
            }
            selectClassName="h-10 px-3"
            inPortal={false}
            disabled={props.loading}
          />
        </div>
        <div>
          <AppSelect
            label="ผู้รับ"
            placeholder="เลือก"
            options={[
              { label: "นายจ้าง", value: "employer" },
              { label: "ทีมขาย", value: "sale" },
            ]}
            value={selectedAudience}
            onChange={(v: any) => setSelectedAudience(v)}
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
      </div>

      <div className="mt-3">
        <label className="inline-flex items-center gap-2 text-xs font-semibold text-gray-700">
          <input type="checkbox" checked={enabled} onChange={(e) => setEnabled(e.target.checked)} disabled={props.loading} />
          เปิดใช้งานแม่แบบนี้
        </label>
      </div>

      <div className="mt-3 grid gap-3">
        <Input label="Subject" value={subject} onChange={(e) => setSubject(e.target.value)} disabled={props.loading} />
        <div>
          <div className="mb-1 text-xs font-medium text-gray-900">Body</div>
          <textarea
            value={body}
            onChange={(e) => setBody(e.target.value)}
            disabled={props.loading}
            className="h-44 w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-800 focus:border-blue-600 focus:outline-none focus:ring-2 focus:ring-blue-100 disabled:bg-gray-50"
          />
        </div>
      </div>

      <div className="mt-4 flex flex-wrap items-center justify-end gap-2">
        <Button
          variant="outline"
          onClick={() => {
            const to = window.prompt("กรอกอีเมลปลายทางสำหรับทดสอบ");
            if (!to) return;
            props.onSendTest(selectedDoc, selectedAudience, to);
          }}
          disabled={props.loading}
        >
          ส่งทดสอบ
        </Button>
        <Button
          onClick={() => {
            if (!selectedRow?.id) return;
            props.onSaveTemplate(selectedRow.id, { subject_template: subject, body_template: body, enabled });
          }}
          disabled={props.loading || !selectedRow?.id}
        >
          บันทึกแม่แบบ
        </Button>
      </div>
    </div>
  );
}
