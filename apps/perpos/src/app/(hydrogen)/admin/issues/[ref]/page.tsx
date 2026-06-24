import Link from "next/link";
import { notFound } from "next/navigation";
import { Button } from "@/components/ui/button";
import { StatusBadge } from "@/components/ui/badge";
import { ArrowLeft, GitBranch } from "lucide-react";
import { requireSuperAdminPage } from "@/lib/admin/guard";
import { getIssueByRef } from "@/lib/admin/issues";
import { AdminPage } from "../../_components/admin-page";
import { CopyCommand } from "./_copy-command";
import {
  STATUS_LABEL,
  STATUS_TONE,
  TYPE_LABEL,
  SEVERITY_LABEL,
  SEVERITY_TONE,
  SOURCE_LABEL,
  fmtTime,
} from "../_meta";

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1">
      <p className="text-xs font-medium text-gray-500">{label}</p>
      <div className="whitespace-pre-wrap break-words text-sm text-gray-800">{children}</div>
    </div>
  );
}

export default async function IssueDetailPage({ params }: { params: Promise<{ ref: string }> }) {
  const admin = await requireSuperAdminPage();
  const { ref } = await params;
  const data = await getIssueByRef(admin, decodeURIComponent(ref));
  if (!data) notFound();
  const { issue, events } = data;

  return (
    <AdminPage
      width="default"
      title={issue.ref}
      icon={<span className="font-mono text-base">{issue.prefix}</span>}
      actions={
        <Link href="/admin/issues">
          <Button variant="outline" size="sm">
            <ArrowLeft className="mr-1 h-4 w-4" />
            กลับรายการ
          </Button>
        </Link>
      }
    >
      {/* หัวเรื่อง + สถานะ */}
      <div className="mb-5 space-y-3">
        <h2 className="text-lg font-semibold text-gray-900">{issue.title}</h2>
        <div className="flex flex-wrap items-center gap-2">
          <StatusBadge tone={STATUS_TONE[issue.status]}>{STATUS_LABEL[issue.status]}</StatusBadge>
          <StatusBadge tone={SEVERITY_TONE[issue.severity]}>
            {SEVERITY_LABEL[issue.severity]}
          </StatusBadge>
          <StatusBadge tone="neutral">{TYPE_LABEL[issue.type]}</StatusBadge>
          <StatusBadge tone="neutral">ที่มา: {SOURCE_LABEL[issue.source]}</StatusBadge>
        </div>
        <div className="flex flex-wrap items-center gap-2 pt-1">
          <span className="text-xs text-gray-500">สั่ง agent แก้:</span>
          <CopyCommand command={`/fix-issue ${issue.ref}`} />
        </div>
      </div>

      {/* รายละเอียด */}
      <div className="grid gap-5 sm:grid-cols-2">
        {issue.symptom && <Field label="อาการ">{issue.symptom}</Field>}
        {issue.reproduce && <Field label="ขั้นตอนทำซ้ำ">{issue.reproduce}</Field>}
        {issue.root_cause && <Field label="ต้นเหตุ (root cause)">{issue.root_cause}</Field>}
        {issue.fix_summary && <Field label="วิธีแก้">{issue.fix_summary}</Field>}
        {issue.area.length > 0 && <Field label="ชั้นที่เกี่ยว">{issue.area.join(", ")}</Field>}
        {issue.branch && (
          <Field label="Branch">
            <span className="inline-flex items-center gap-1 font-mono text-xs">
              <GitBranch className="h-3.5 w-3.5 text-gray-400" />
              {issue.branch}
            </span>
          </Field>
        )}
        {issue.files_touched.length > 0 && (
          <div className="sm:col-span-2">
            <Field label="ไฟล์ที่แก้">
              <ul className="space-y-0.5 font-mono text-xs text-gray-600">
                {issue.files_touched.map((f) => (
                  <li key={f}>{f}</li>
                ))}
              </ul>
            </Field>
          </div>
        )}
        {issue.reporter_note && <Field label="หมายเหตุผู้รายงาน">{issue.reporter_note}</Field>}
        <Field label="สร้างเมื่อ">{fmtTime(issue.created_at)}</Field>
        <Field label="อัปเดตล่าสุด">{fmtTime(issue.updated_at)}</Field>
        {issue.resolved_at && <Field label="แก้เสร็จเมื่อ">{fmtTime(issue.resolved_at)}</Field>}
      </div>

      {/* Case Note */}
      {issue.case_note_md && (
        <div className="mt-6">
          <p className="mb-2 text-xs font-medium text-gray-500">Case Note</p>
          <pre className="overflow-x-auto whitespace-pre-wrap rounded-lg border border-gray-100 bg-gray-50 p-3 text-xs text-gray-700">
            {issue.case_note_md}
          </pre>
        </div>
      )}

      {/* Timeline */}
      <div className="mt-6">
        <p className="mb-2 text-xs font-medium text-gray-500">ไทม์ไลน์</p>
        {events.length === 0 ? (
          <p className="text-sm text-gray-400">ยังไม่มีเหตุการณ์</p>
        ) : (
          <ul className="space-y-2">
            {events.map((e) => (
              <li key={e.id} className="flex items-start gap-3 text-sm">
                <span className="mt-0.5 shrink-0 text-xs tabular-nums text-gray-400">
                  {fmtTime(e.at)}
                </span>
                <div>
                  <span className="text-gray-700">{e.action}</span>
                  {e.from_status && e.to_status && (
                    <span className="text-gray-500">
                      {" "}
                      · {e.from_status ?? "—"} → {e.to_status}
                    </span>
                  )}
                  {e.actor && <span className="text-xs text-gray-400"> · {e.actor}</span>}
                  {e.note && <div className="text-xs text-gray-500">{e.note}</div>}
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </AdminPage>
  );
}
