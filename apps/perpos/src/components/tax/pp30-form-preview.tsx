"use client";

import React from "react";
import type { PP30Row } from "@/lib/tax/actions";

const THAI_MONTHS = [
  "มกราคม", "กุมภาพันธ์", "มีนาคม", "เมษายน", "พฤษภาคม", "มิถุนายน",
  "กรกฎาคม", "สิงหาคม", "กันยายน", "ตุลาคม", "พฤศจิกายน", "ธันวาคม",
];

function fmt(n: number | null | undefined) {
  if (n == null) return "-";
  return n.toLocaleString("th-TH", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
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

function AmountCell({ value }: { value: number | null | undefined }) {
  return (
    <span
      className="inline-block text-right"
      style={{ minWidth: 120, borderBottom: "1px solid #333", fontSize: 11 }}
    >
      {fmt(value)}
    </span>
  );
}

type Props = {
  row: PP30Row;
  orgName?: string;
  orgTaxId?: string;
  orgAddress?: string;
  outputBase?: number;
  inputBase?: number;
};

export function PP30FormPreview({ row, orgName, orgTaxId, orgAddress, outputBase, inputBase }: Props) {
  const month = THAI_MONTHS[(row.period_month ?? 1) - 1];
  const beYear = row.period_year + 543;
  const netPositive = row.net_vat > 0;
  const payAmt = row.payment_amount ?? (netPositive ? row.net_vat : 0);

  return (
    <div
      className="border border-slate-300 bg-white rounded-lg"
      style={{ fontFamily: "'Sarabun', 'Angsana New', sans-serif", fontSize: 11 }}
    >
      {/* Header */}
      <div className="flex items-start justify-between border-b border-slate-300 p-4">
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 14, fontWeight: "bold" }}>แบบแสดงรายการภาษีมูลค่าเพิ่ม</div>
          <div style={{ fontSize: 11, marginTop: 2 }}>ตามประมวลรัษฎากร</div>
          <div style={{ fontSize: 11 }}>สำหรับผู้ประกอบการจดทะเบียนทั่วไป และผู้นำเข้า</div>
        </div>
        <div
          className="flex items-center justify-center border-2 border-slate-700"
          style={{ width: 90, height: 50, fontSize: 18, fontWeight: "bold" }}
        >
          ภ.พ.30
        </div>
      </div>

      <div className="p-4 space-y-2">
        {/* Tax ID row */}
        <div className="flex items-center gap-2 flex-wrap">
          <span style={{ whiteSpace: "nowrap" }}>เลขประจำตัวผู้เสียภาษีอากร:</span>
          <TaxIdBoxes value={orgTaxId} />
          <span className="ml-4" style={{ whiteSpace: "nowrap" }}>สาขาที่:</span>
          <TaxIdBoxes value="00000" />
        </div>

        {/* Company name */}
        <div className="flex gap-2">
          <span style={{ whiteSpace: "nowrap" }}>ชื่อผู้ประกอบการ:</span>
          <span className="border-b border-slate-400 flex-1">{orgName ?? "-"}</span>
        </div>

        {/* Address */}
        <div className="flex gap-2">
          <span style={{ whiteSpace: "nowrap" }}>ที่อยู่:</span>
          <span className="border-b border-slate-400 flex-1">{orgAddress ?? "-"}</span>
        </div>

        {/* Filing type */}
        <div className="flex items-center gap-4 mt-2">
          <span>ยื่นแบบครั้งที่:</span>
          <span className="flex items-center gap-1">
            <span className="inline-flex items-center justify-center border border-slate-600" style={{ width: 14, height: 14, fontSize: 9 }}>✓</span>
            <span>ยื่นปกติ</span>
          </span>
          <span className="flex items-center gap-1 ml-4">
            <span className="inline-flex items-center justify-center border border-slate-600" style={{ width: 14, height: 14, fontSize: 9 }}></span>
            <span>ยื่นเพิ่มเติม</span>
          </span>
        </div>

        {/* Period */}
        <div className="flex gap-4 flex-wrap">
          <span>
            งวดภาษีเดือน <span className="underline font-medium">{month}</span> พ.ศ. <span className="underline font-medium">{beYear}</span>
          </span>
          <span className="ml-4">
            ตั้งแต่วันที่ <span className="underline">{`01/${String(row.period_month).padStart(2, "0")}/${beYear}`}</span>
          </span>
          <span>
            ถึงวันที่ <span className="underline">{`${new Date(row.period_year, row.period_month, 0).getDate()}/${String(row.period_month).padStart(2, "0")}/${beYear}`}</span>
          </span>
        </div>

        {/* Divider */}
        <div className="border-t border-slate-300 my-3" />

        {/* Calculation table */}
        <div
          className="w-full"
          style={{ fontSize: 11 }}
        >
          {/* Output VAT section */}
          <div
            className="px-2 py-1 font-bold"
            style={{ background: "#e8e8e8", borderBottom: "1px solid #bbb" }}
          >
            ภาษีขาย
          </div>

          <table className="w-full border-collapse" style={{ fontSize: 11 }}>
            <tbody>
              <CalcRow no="1" label="ยอดขายในเดือนนี้" value={outputBase ?? row.output_vat_total / 0.07} />
              <CalcRow no="2" label="หัก ยอดขายที่เสียภาษีในอัตราร้อยละ 0 (ถ้ามี)" value={0} />
              <CalcRow no="3" label="หัก ยอดขายที่ได้รับยกเว้น (ถ้ามี)" value={0} />
              <CalcRow no="4" label="ยอดขายที่ต้องเสียภาษี (1. - 2. - 3.)" value={outputBase ?? row.output_vat_total / 0.07} bold />
              <CalcRow no="5" label="ภาษีขายในเดือนนี้" value={row.output_vat_total} bold />

              <tr>
                <td colSpan={3} style={{ paddingTop: 4, paddingBottom: 0 }}>
                  <div
                    className="px-2 py-1 font-bold"
                    style={{ background: "#e8e8e8", borderBottom: "1px solid #bbb" }}
                  >
                    ภาษีซื้อ
                  </div>
                </td>
              </tr>

              <CalcRow no="6" label="ภาษีซื้อในเดือนนี้" value={row.input_vat_total} />
              <CalcRow no="7" label="ภาษีที่ต้องชำระ/เครดิต (5. - 6.)" value={row.net_vat} bold />

              <tr>
                <td colSpan={3}>
                  <div className="border-t border-slate-300 my-2" />
                </td>
              </tr>

              <CalcRow no="8" label="ภาษีที่ต้องชำระ (ถ้าข้อ 7 มากกว่า 10.)" value={netPositive ? row.net_vat : 0} />
              <CalcRow no="9" label="ภาษีที่ชำระเกินมา" value={0} />
              <CalcRow no="10" label="ภาษีที่ชำระมายกมาก่อนหน้า" value={0} />

              <tr>
                <td colSpan={3}>
                  <div className="border-t border-slate-300 my-1" />
                </td>
              </tr>

              <CalcRow no="11" label="ต้องชำระ (8. - 9. - 10.)" value={netPositive ? row.net_vat : 0} bold />
              <CalcRow no="12" label="ชำระเงิน" value={payAmt} bold />
            </tbody>
          </table>
        </div>

        {/* Divider */}
        <div className="border-t border-slate-300 my-3" />

        {/* Signature area */}
        <div className="flex justify-between" style={{ fontSize: 11 }}>
          <div>
            <div>ลงชื่อ _______________________________ ผู้ยื่นแบบ</div>
            <div className="mt-1">วันที่ยื่นแบบ ___/___/______</div>
          </div>
          <div className="text-right">
            <div>เลขที่รับ ___________________</div>
            <div className="mt-1">วันที่รับ ___________________</div>
          </div>
        </div>
      </div>
    </div>
  );
}

function CalcRow({
  no,
  label,
  value,
  bold,
}: {
  no: string;
  label: string;
  value: number | null | undefined;
  bold?: boolean;
}) {
  return (
    <tr style={bold ? { fontWeight: "bold" } : {}}>
      <td
        className="border-b border-slate-100 py-1"
        style={{ width: 20, paddingLeft: 4, verticalAlign: "top", color: "#666" }}
      >
        {no}.
      </td>
      <td className="border-b border-slate-100 py-1 px-2" style={{ verticalAlign: "top" }}>
        {label}
      </td>
      <td
        className="border-b border-slate-100 py-1 text-right"
        style={{ width: 160, paddingRight: 8, verticalAlign: "top" }}
      >
        <span style={{ borderBottom: "1px solid #444", display: "inline-block", minWidth: 130, textAlign: "right" }}>
          {fmt(value)}
        </span>
        <span className="ml-1 text-slate-400" style={{ fontSize: 10 }}>
          บาท
        </span>
      </td>
    </tr>
  );
}
