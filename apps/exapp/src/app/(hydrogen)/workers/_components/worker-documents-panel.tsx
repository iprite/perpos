"use client";

import React from "react";
import { Button } from "rizzui";

import type { WorkerDocumentRow } from "./worker-edit-types";

export function WorkerDocumentsPanel({
  loading,
  editingId,
  docs,
  onAdd,
  onOpenDoc,
}: {
  loading: boolean;
  editingId: string | null;
  docs: WorkerDocumentRow[];
  onAdd: () => void;
  onOpenDoc: (doc: WorkerDocumentRow) => void;
}) {
  return (
    <div className="mt-5 rounded-2xl border border-gray-200 bg-white/70 p-4 backdrop-blur">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <div className="text-sm font-semibold text-gray-900">รายการเอกสาร</div>
          <div className="mt-0.5 text-xs text-gray-500">เอกสารประกอบของแรงงาน</div>
        </div>
        <Button size="sm" variant="outline" onClick={onAdd} disabled={loading || !editingId}>
          เพิ่มเอกสาร
        </Button>
      </div>

      {!editingId ? (
        <div className="mt-3 rounded-xl border border-gray-200 bg-gray-50 p-4 text-sm text-gray-700">บันทึกแรงงานก่อน แล้วจึงเพิ่มเอกสารได้</div>
      ) : null}

      <div className="mt-4 grid gap-2">
        {editingId && docs.length === 0 ? <div className="text-sm text-gray-600">ยังไม่มีเอกสาร</div> : null}
        {editingId
          ? docs.map((d) => (
              <button
                key={d.id}
                type="button"
                className="flex w-full flex-wrap items-center justify-between gap-2 rounded-xl border border-gray-200 bg-white px-3 py-2 text-left transition-colors hover:bg-gray-50"
                onClick={() => onOpenDoc(d)}
                disabled={loading}
              >
                <div className="min-w-[220px]">
                  <div className="text-sm font-medium text-gray-900">{d.doc_type || "เอกสาร"}</div>
                  <div className="text-xs text-gray-600">
                    {d.file_name || "-"}
                    {d.expiry_date ? ` • หมดอายุ ${d.expiry_date}` : ""}
                  </div>
                </div>
                <div className="text-xs font-semibold text-gray-700">เปิด</div>
              </button>
            ))
          : null}
      </div>
    </div>
  );
}

