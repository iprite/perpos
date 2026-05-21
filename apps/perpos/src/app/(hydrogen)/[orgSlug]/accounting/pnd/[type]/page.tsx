import React from "react";
import { notFound } from "next/navigation";
import { getActiveOrganizationId } from "@/lib/accounting/queries";
import { listPNDFilings } from "@/lib/tax/actions";
import { PNDListClient } from "@/components/tax/pnd-list-client";
import type { PNDRow } from "@/lib/tax/actions";

export const dynamic = "force-dynamic";

const VALID_TYPES = ["1", "2", "3", "53"] as const;
type PndType = (typeof VALID_TYPES)[number];

type Props = {
  params: Promise<{ type: string }>;
};

export default async function PNDFilingsPage({ params }: Props) {
  const { type } = await params;

  if (!VALID_TYPES.includes(type as PndType)) notFound();

  const activeOrganizationId = await getActiveOrganizationId();

  let rows: PNDRow[] = [];
  let error: string | null = null;

  if (activeOrganizationId) {
    const result = await listPNDFilings({
      organizationId: activeOrganizationId,
      pnd_type: type,
    });
    if (result.ok) {
      rows = result.rows;
    } else {
      error = result.error;
    }
  }

  const titleMap: Record<string, string> = {
    "1":  "ภาษีเงินได้หัก ณ ที่จ่าย (พนักงาน)",
    "2":  "ภาษีเงินได้หัก ณ ที่จ่าย (เงินปันผล)",
    "3":  "ภาษีเงินได้หัก ณ ที่จ่าย (บริการ/อื่นๆ)",
    "53": "ภาษีเงินได้หัก ณ ที่จ่าย (นิติบุคคล)",
  };

  return (
    <div className="mx-auto w-full max-w-6xl px-4 py-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <div className="text-xl font-semibold text-slate-900">แบบ ภ.ง.ด.{type}</div>
          <div className="mt-1 text-sm text-slate-600">{titleMap[type]}</div>
        </div>
      </div>

      {error ? (
        <div className="mt-4 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
          {error}
        </div>
      ) : null}

      {activeOrganizationId ? (
        <div className="mt-6">
          <PNDListClient pndType={type} rows={rows} />
        </div>
      ) : (
        <div className="mt-6 rounded-xl border border-slate-200 bg-white p-6 text-sm text-slate-700">
          กรุณาเลือกองค์กรก่อน
        </div>
      )}
    </div>
  );
}
