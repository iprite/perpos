"use client";

// client-view.tsx — แฟ้มลูกค้า 1 ราย (hybrid: initial data มาจาก SSR → แท็บทำงานฝั่ง client)
// แท็บใช้ <SegmentedControl> ตาม DESIGN §4 (มาตรฐานเดียวของแท็บในหน้า)

import { useState } from "react";
import { AlertTriangle, ClipboardList, FileText, ListChecks, MapPin } from "lucide-react";
import { StatusBadge } from "@/components/ui/badge";
import { SegmentedControl } from "@/components/ui/segmented";
import { Text } from "@/components/ui/typography";
import type {
  ChecklistRow,
  CustodyEntry,
  VaultCategory,
  VaultClient,
  VaultDocument,
  VaultPeriod,
} from "@/lib/acc-firm/vault/types";
import { PeriodTab } from "./period-tab";
import { DocumentsTab } from "./documents-tab";
import { CustodyTab } from "./custody-tab";

type TabKey = "period" | "documents" | "custody";

export function ClientVaultView({
  orgId,
  canWrite,
  canDownloadSensitive,
  client,
  periods,
  initialPeriodId,
  initialChecklist,
  categories,
  documents,
  custody,
}: {
  orgId: string;
  canWrite: boolean;
  canDownloadSensitive: boolean;
  client: VaultClient;
  periods: VaultPeriod[];
  initialPeriodId: string | null;
  initialChecklist: ChecklistRow[];
  categories: VaultCategory[];
  documents: VaultDocument[];
  custody: CustodyEntry[];
}) {
  const [tab, setTab] = useState<TabKey>("period");
  const fiscalYear = periods[0]?.fiscalYear ?? new Date().getFullYear();

  return (
    <div className="space-y-4">
      {/* สรุปหัวแฟ้ม */}
      <div className="flex flex-wrap items-center gap-x-6 gap-y-2 rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
        <div>
          <Text className="text-xs text-gray-500">เลขประจำตัวผู้เสียภาษี</Text>
          <Text className="text-sm font-medium tabular-nums text-gray-900">
            {client.taxId ?? "—"}
          </Text>
        </div>
        <div>
          <Text className="text-xs text-gray-500">จด VAT</Text>
          <Text className="text-sm font-medium text-gray-900">
            {client.vatRegistered ? "จดทะเบียน" : "ไม่ได้จด"}
          </Text>
        </div>
        <div>
          <Text className="text-xs text-gray-500">วันสิ้นรอบบัญชี</Text>
          <Text className="text-sm font-medium tabular-nums text-gray-900">
            {client.fiscalYearEndDay}/{client.fiscalYearEndMonth}
          </Text>
        </div>
        <div className="min-w-0">
          <Text className="text-xs text-gray-500">สถานที่เก็บเอกสาร</Text>
          <Text className="flex items-center gap-1 text-sm font-medium text-gray-900">
            <MapPin className="h-3.5 w-3.5 shrink-0 text-gray-400" />
            {client.storageLocation ?? "ยังไม่ระบุ"}
          </Text>
        </div>
        {!client.isActive && <StatusBadge tone="neutral">หยุดให้บริการ</StatusBadge>}
      </div>

      {client.storageLocation && !client.dbdRelocationNotified && (
        <div className="flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 p-3">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />
          <Text className="text-xs text-amber-800">
            เอกสารเก็บนอกสถานประกอบการแต่ยัง{" "}
            <span className="font-semibold">ไม่ได้แจ้งกรมพัฒนาธุรกิจการค้า</span> —
            พ.ร.บ.การบัญชีกำหนดให้ต้องแจ้งสถานที่เก็บบัญชีและเอกสารประกอบการลงบัญชี
          </Text>
        </div>
      )}

      <SegmentedControl
        value={tab}
        onChange={setTab}
        ariaLabel="มุมมองแฟ้มลูกค้า"
        options={[
          {
            value: "period",
            label: "รายการเอกสารตามงวด",
            icon: <ListChecks className="h-4 w-4" />,
          },
          { value: "documents", label: "เอกสารทั้งหมด", icon: <FileText className="h-4 w-4" /> },
          {
            value: "custody",
            label: "ทะเบียนรับ-ส่ง",
            icon: <ClipboardList className="h-4 w-4" />,
          },
        ]}
      />

      {tab === "period" && (
        <PeriodTab
          orgId={orgId}
          clientId={client.id}
          canWrite={canWrite}
          periods={periods}
          initialPeriodId={initialPeriodId}
          initialChecklist={initialChecklist}
          categories={categories}
        />
      )}
      {tab === "documents" && (
        <DocumentsTab
          orgId={orgId}
          clientId={client.id}
          fiscalYear={fiscalYear}
          canWrite={canWrite}
          canDownloadSensitive={canDownloadSensitive}
          documents={documents}
          categories={categories}
        />
      )}
      {tab === "custody" && (
        <CustodyTab orgId={orgId} clientId={client.id} canWrite={canWrite} entries={custody} />
      )}
    </div>
  );
}
