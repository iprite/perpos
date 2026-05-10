"use client";

import React from "react";
import type { WHTCertRow } from "@/lib/tax/actions";

function fmt(n: number) {
  return n.toLocaleString("th-TH", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function formatThaiDate(dateStr: string) {
  try {
    const d = new Date(dateStr);
    const day = d.getDate();
    const months = [
      "มกราคม", "กุมภาพันธ์", "มีนาคม", "เมษายน", "พฤษภาคม", "มิถุนายน",
      "กรกฎาคม", "สิงหาคม", "กันยายน", "ตุลาคม", "พฤศจิกายน", "ธันวาคม",
    ];
    const month = months[d.getMonth()];
    const year = d.getFullYear() + 543;
    return `${day} ${month} ${year}`;
  } catch {
    return dateStr;
  }
}

function TaxIdBoxes({ value }: { value?: string | null }) {
  const digits = (value ?? "").replace(/\D/g, "").slice(0, 13).split("");
  const boxes = Array.from({ length: 13 }, (_, i) => digits[i] ?? "");
  return (
    <span className="inline-flex gap-0.5">
      {boxes.map((d, i) => (
        <span
          key={i}
          className="inline-flex items-center justify-center border border-slate-500 text-center"
          style={{ width: 18, height: 20, fontSize: 11 }}
        >
          {d}
        </span>
      ))}
    </span>
  );
}

type Props = {
  row: WHTCertRow;
  payerAddress?: string;
  receiverAddress?: string;
};

export function WhtCertFormPreview({ row, payerAddress, receiverAddress }: Props) {
  const ratePercent = (row.wht_rate * 100).toFixed(0);

  return (
    <div
      className="border border-slate-300 bg-white rounded-lg"
      style={{ fontFamily: "'Sarabun', 'Angsana New', sans-serif", fontSize: 11 }}
    >
      {/* Header */}
      <div className="border-b border-slate-300 p-4 text-center">
        <div style={{ fontSize: 15, fontWeight: "bold" }}>หนังสือรับรองการหักภาษี ณ ที่จ่าย</div>
        <div style={{ fontSize: 12, marginTop: 2 }}>มาตรา 50 ทวิ แห่งประมวลรัษฎากร</div>
        <div style={{ fontSize: 11, marginTop: 4 }} className="text-right pr-4">
          เล่มที่ <span className="underline">_____</span>{" "}
          เลขที่ <span className="underline font-medium">{row.certificate_no ?? "-"}</span>
        </div>
      </div>

      <div className="p-4 space-y-4">
        {/* Payer section */}
        <div className="border border-slate-300 rounded p-3 space-y-2">
          <div style={{ fontWeight: "bold", color: "#333", marginBottom: 4 }}>
            ผู้มีหน้าที่หักภาษี ณ ที่จ่าย (ผู้จ่ายเงิน)
          </div>
          <div className="flex gap-2">
            <span className="text-slate-600" style={{ whiteSpace: "nowrap" }}>ชื่อ:</span>
            <span className="border-b border-slate-400 flex-1 font-medium">{row.payer_name || "-"}</span>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-slate-600" style={{ whiteSpace: "nowrap" }}>เลขประจำตัวผู้เสียภาษี:</span>
            <TaxIdBoxes value={row.payer_tax_id} />
          </div>
          <div className="flex gap-2">
            <span className="text-slate-600" style={{ whiteSpace: "nowrap" }}>ที่อยู่:</span>
            <span className="border-b border-slate-400 flex-1">{payerAddress ?? "-"}</span>
          </div>
        </div>

        {/* Receiver section */}
        <div className="border border-slate-300 rounded p-3 space-y-2">
          <div style={{ fontWeight: "bold", color: "#333", marginBottom: 4 }}>
            ผู้ถูกหักภาษี ณ ที่จ่าย (ผู้รับเงิน)
          </div>
          <div className="flex gap-2">
            <span className="text-slate-600" style={{ whiteSpace: "nowrap" }}>ชื่อ:</span>
            <span className="border-b border-slate-400 flex-1 font-medium">{row.receiver_name || "-"}</span>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-slate-600" style={{ whiteSpace: "nowrap" }}>เลขประจำตัวผู้เสียภาษี:</span>
            <TaxIdBoxes value={row.receiver_tax_id} />
          </div>
          <div className="flex gap-2">
            <span className="text-slate-600" style={{ whiteSpace: "nowrap" }}>ที่อยู่:</span>
            <span className="border-b border-slate-400 flex-1">{receiverAddress ?? "-"}</span>
          </div>
        </div>

        {/* Income type */}
        <div>
          <div
            className="px-2 py-1 font-bold"
            style={{ background: "#e8e8e8", borderBottom: "1px solid #bbb", fontSize: 11 }}
          >
            ประเภทเงินได้พึงประเมินที่จ่าย
          </div>
          <div className="mt-2 px-2">
            <span>ประเภทเงินได้: </span>
            <span className="font-medium underline">{row.wht_category || "-"}</span>
          </div>
        </div>

        {/* Table */}
        <table className="w-full border-collapse text-center" style={{ fontSize: 11 }}>
          <thead>
            <tr style={{ background: "#e8e8e8" }}>
              <th className="border border-slate-400 px-2 py-1 text-left">ประเภทเงินได้</th>
              <th className="border border-slate-400 px-2 py-1">วัน เดือน ปีที่จ่าย</th>
              <th className="border border-slate-400 px-2 py-1">อัตรา (%)</th>
              <th className="border border-slate-400 px-2 py-1 text-right">จำนวนเงินที่จ่าย (บาท)</th>
              <th className="border border-slate-400 px-2 py-1 text-right">ภาษีที่หักและนำส่ง (บาท)</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td className="border border-slate-300 px-2 py-1 text-left">{row.wht_category || "-"}</td>
              <td className="border border-slate-300 px-2 py-1">{formatThaiDate(row.wht_date)}</td>
              <td className="border border-slate-300 px-2 py-1">{ratePercent}%</td>
              <td className="border border-slate-300 px-2 py-1 text-right">{fmt(row.base_amount)}</td>
              <td className="border border-slate-300 px-2 py-1 text-right">{fmt(row.wht_amount)}</td>
            </tr>
            <tr>
              <td colSpan={2} className="border border-slate-300 px-2 py-1 text-right font-bold">
                รวม
              </td>
              <td className="border border-slate-300 px-2 py-1"></td>
              <td className="border border-slate-300 px-2 py-1 text-right font-bold">
                {fmt(row.base_amount)}
              </td>
              <td className="border border-slate-300 px-2 py-1 text-right font-bold">
                {fmt(row.wht_amount)}
              </td>
            </tr>
          </tbody>
        </table>

        {/* Condition checkboxes */}
        <div className="border border-slate-300 rounded p-3 space-y-1">
          <div style={{ fontWeight: "bold", marginBottom: 6 }}>เงื่อนไขการออกหนังสือรับรอง</div>
          <div className="flex items-center gap-2">
            <span
              className="inline-flex items-center justify-center border border-slate-600"
              style={{ width: 14, height: 14, fontSize: 9 }}
            >
              ✓
            </span>
            <span>(1) หัก ณ ที่จ่าย</span>
          </div>
          <div className="flex items-center gap-2">
            <span
              className="inline-flex items-center justify-center border border-slate-600"
              style={{ width: 14, height: 14 }}
            />
            <span>(2) ออกให้ตลอดไป</span>
          </div>
          <div className="flex items-center gap-2">
            <span
              className="inline-flex items-center justify-center border border-slate-600"
              style={{ width: 14, height: 14 }}
            />
            <span>(3) ออกให้ครั้งเดียว</span>
          </div>
        </div>

        {/* Signature */}
        <div className="flex justify-end mt-4">
          <div className="text-center" style={{ minWidth: 200 }}>
            <div className="border-b border-slate-400 mb-1" style={{ minWidth: 200 }}>&nbsp;</div>
            <div>ลงชื่อผู้มีหน้าที่หักภาษี ณ ที่จ่าย</div>
            <div className="mt-1">วันที่ออกหนังสือ: {formatThaiDate(row.wht_date)}</div>
          </div>
        </div>
      </div>
    </div>
  );
}
