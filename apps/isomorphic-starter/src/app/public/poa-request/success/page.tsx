"use client";

import React, { useMemo } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import toast from "react-hot-toast";
import { Button } from "rizzui";

function PublicPoaRequestSuccessInner() {
  const router = useRouter();
  const params = useSearchParams();
  const ref = useMemo(() => String(params.get("ref") ?? "").trim(), [params]);
  const amount = useMemo(() => {
    const n = Number(params.get("amount") ?? "");
    return Number.isFinite(n) ? n : null;
  }, [params]);
  const workers = useMemo(() => {
    const n = Math.trunc(Number(params.get("workers") ?? ""));
    return Number.isFinite(n) ? n : null;
  }, [params]);

  const asMoney = (n: number) => n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  return (
    <div className="min-h-screen bg-[#F7F8FA]">
      <div className="mx-auto max-w-[760px] px-6 py-10">
        <div className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm">
          <div className="text-2xl font-semibold text-gray-900">ส่งคำขอสำเร็จ</div>
          <div className="mt-1 text-sm text-gray-600">Operation จะรับเรื่องไปดำเนินการต่อ</div>

          <div className="mt-6 rounded-2xl border border-gray-200 bg-gray-50 p-5">
            <div className="text-sm font-semibold text-gray-900">เลขอ้างอิง</div>
            <div className="mt-2 rounded-xl border border-gray-200 bg-white px-4 py-3 font-mono text-lg text-gray-900">{ref || "-"}</div>
            {amount != null ? (
              <div className="mt-3 grid gap-1 text-sm text-gray-700">
                <div className="flex items-center justify-between gap-3">
                  <div className="text-gray-600">จำนวนแรงงาน</div>
                  <div className="font-medium text-gray-900">{workers ?? "-"}</div>
                </div>
                <div className="flex items-center justify-between gap-3">
                  <div className="text-gray-600">ยอดที่ต้องชำระ</div>
                  <div className="font-semibold text-gray-900">{asMoney(amount)} บาท</div>
                </div>
              </div>
            ) : null}
            <div className="mt-3 flex flex-wrap gap-2">
              <Button
                size="sm"
                onClick={async () => {
                  if (!ref) return;
                  try {
                    await navigator.clipboard.writeText(ref);
                    toast.success("คัดลอกแล้ว");
                  } catch {
                    toast.error("คัดลอกไม่สำเร็จ");
                  }
                }}
                disabled={!ref}
                className="whitespace-nowrap"
              >
                คัดลอกเลขอ้างอิง
              </Button>
              <Button size="sm" variant="outline" onClick={() => router.push("/public/poa-request")} className="whitespace-nowrap">
                ส่งคำขอใหม่
              </Button>
            </div>
          </div>

          <div className="mt-6 text-sm text-gray-700">
            <div className="font-semibold text-gray-900">ขั้นตอนถัดไป</div>
            <ul className="mt-2 list-disc pl-5 text-gray-700">
              <li>เก็บเลขอ้างอิงไว้สำหรับอ้างอิงกับทีม Operation</li>
              <li>หากต้องการแก้ไขข้อมูล กรุณาติดต่อทีม Operation พร้อมเลขอ้างอิง</li>
            </ul>
          </div>
        </div>

        <div className="mt-6 text-center text-xs text-gray-500">หากมีปัญหาในการส่งคำขอ โปรดติดต่อทีม Operation</div>
      </div>
    </div>
  );
}

export default function PublicPoaRequestSuccessPage() {
  return (
    <React.Suspense fallback={<div className="min-h-screen bg-[#F7F8FA]" />}>
      <PublicPoaRequestSuccessInner />
    </React.Suspense>
  );
}
