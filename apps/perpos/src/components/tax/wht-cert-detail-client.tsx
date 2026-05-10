"use client";

import React from "react";
import { Printer } from "lucide-react";
import { Button } from "@/components/ui/button";
import cn from "@core/utils/class-names";
import type { WHTCertRow } from "@/lib/tax/actions";
import { WhtCertFormPreview } from "@/components/tax/wht-cert-form-preview";

function fmt(n: number) {
  return n.toLocaleString("th-TH", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function fmtDate(d: string) {
  try {
    return new Date(d).toLocaleDateString("th-TH", { day: "2-digit", month: "short", year: "numeric" });
  } catch { return d; }
}

const STATUS_MAP: Record<string, { label: string; color: string; dot: string }> = {
  draft:  { label: "ร่าง",     color: "text-slate-600", dot: "bg-slate-400" },
  issued: { label: "ออกแล้ว", color: "text-teal-700",  dot: "bg-teal-500" },
  void:   { label: "ยกเลิก",  color: "text-red-700",   dot: "bg-red-500" },
};

type Props = {
  row: WHTCertRow;
  payerAddress?: string;
  receiverAddress?: string;
};

export function WhtCertDetailClient({ row, payerAddress, receiverAddress }: Props) {
  const statusCfg = STATUS_MAP[row.status] ?? STATUS_MAP.draft;
  const ratePercent = (row.wht_rate * 100).toFixed(0);

  return (
    <div className="flex flex-col lg:flex-row gap-6">
      {/* Left - form preview */}
      <div className="flex-1 min-w-0">
        <WhtCertFormPreview
          row={row}
          payerAddress={payerAddress}
          receiverAddress={receiverAddress}
        />
      </div>

      {/* Right panel */}
      <div className="lg:w-72 shrink-0 space-y-4">
        {/* Title card */}
        <div className="rounded-xl border border-slate-200 bg-white p-4">
          <div className="flex items-start justify-between gap-2 mb-3">
            <div>
              <div className="font-semibold text-slate-900">
                ใบรับรองหัก ณ ที่จ่าย
              </div>
              <div className="text-xs text-slate-500 mt-0.5">
                {row.certificate_no ?? "(ยังไม่มีเลข)"}
              </div>
            </div>
            <Button
              size="sm"
              variant="outline"
              className="flex items-center gap-1 shrink-0"
              onClick={() => window.print()}
            >
              <Printer className="h-3.5 w-3.5" />
              พิมพ์
            </Button>
          </div>

          {/* Status */}
          <div className="flex items-center gap-2 py-2 border-t border-slate-100">
            <span className={cn("inline-block w-2 h-2 rounded-full", statusCfg.dot)} />
            <span className={cn("text-sm font-medium", statusCfg.color)}>{statusCfg.label}</span>
          </div>
        </div>

        {/* Basic info */}
        <div className="rounded-xl border border-slate-200 bg-white p-4 space-y-2">
          <div className="font-medium text-slate-800 text-sm mb-3">ข้อมูลพื้นฐาน</div>
          <InfoRow label="วันที่" value={fmtDate(row.wht_date)} />
          <InfoRow label="ประเภทเงินได้" value={row.wht_category} />
          <InfoRow label="อัตราภาษี" value={`${ratePercent}%`} />
          <InfoRow label="ฐานภาษี" value={`${fmt(row.base_amount)} บาท`} />
          <InfoRow label="ภาษีที่หัก" value={`${fmt(row.wht_amount)} บาท`} valueClass="font-semibold text-slate-900" />
        </div>

        {/* Payer info */}
        <div className="rounded-xl border border-slate-200 bg-white p-4 space-y-2">
          <div className="font-medium text-slate-800 text-sm mb-3">ผู้จ่ายเงิน</div>
          <div className="text-sm text-slate-700 font-medium">{row.payer_name || "-"}</div>
          {row.payer_tax_id && (
            <div className="text-xs text-slate-500">เลขผู้เสียภาษี: {row.payer_tax_id}</div>
          )}
          {payerAddress && (
            <div className="text-xs text-slate-500 leading-relaxed">{payerAddress}</div>
          )}
        </div>

        {/* Receiver info */}
        <div className="rounded-xl border border-slate-200 bg-white p-4 space-y-2">
          <div className="font-medium text-slate-800 text-sm mb-3">ผู้รับเงิน</div>
          <div className="text-sm text-slate-700 font-medium">{row.receiver_name || "-"}</div>
          {row.receiver_tax_id && (
            <div className="text-xs text-slate-500">เลขผู้เสียภาษี: {row.receiver_tax_id}</div>
          )}
          {receiverAddress && (
            <div className="text-xs text-slate-500 leading-relaxed">{receiverAddress}</div>
          )}
        </div>
      </div>
    </div>
  );
}

function InfoRow({
  label,
  value,
  valueClass,
}: {
  label: string;
  value: string;
  valueClass?: string;
}) {
  return (
    <div className="flex justify-between text-sm py-1 border-b border-slate-50 last:border-0">
      <span className="text-slate-500">{label}</span>
      <span className={cn("text-slate-800", valueClass)}>{value}</span>
    </div>
  );
}
