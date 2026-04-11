"use client";

import React, { useMemo, useState } from "react";
import { Button } from "rizzui";
import AppSelect from "@core/ui/app-select";

import { useAuth } from "@/app/shared/auth-provider";
import { useModal } from "@/app/shared/modal-views/use-modal";
import FileUploader from "@/components/form/file-uploader";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import { parseCsv } from "@/utils/csv";

import {
  deriveItemPaymentStatus,
  deriveRequestStatus,
  mapCsvRecordToPoa,
  parseRequestedTypeNames,
  type ImportError,
  type ImportRow,
  type TypeOption,
  validateImportRows,
} from "./poa-requests-csv-import";

type PoaRequestsCsvImportModalProps = {
  onImported: () => void;
};

const duplicateModeOptions = [
  { label: "อัปเดตข้อมูลเดิม", value: "update" },
  { label: "ข้ามรายการที่ซ้ำ", value: "skip" },
];

export function PoaRequestsCsvImportModal({ onImported }: PoaRequestsCsvImportModalProps) {
  const { role } = useAuth();
  const { closeModal } = useModal();
  const supabase = useMemo(() => createSupabaseBrowserClient(), []);

  const [fileName, setFileName] = useState<string | null>(null);
  const [parsed, setParsed] = useState<ImportRow[]>([]);
  const [errors, setErrors] = useState<ImportError[]>([]);

  const [types, setTypes] = useState<TypeOption[]>([]);

  const [loading, setLoading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [message, setMessage] = useState<string | null>(null);
  const [fatalError, setFatalError] = useState<string | null>(null);
  const [mode, setMode] = useState<"skip" | "update">("update");
  const [csvFiles, setCsvFiles] = useState<File[]>([]);

  const canUpdateExisting = role === "admin" || role === "operation";
  const effectiveMode = canUpdateExisting ? mode : "skip";

  const preview = parsed.slice(0, 5);
  const blockingErrors = errors.filter((e) => e.field === "import_temp_id" || e.field === "employer_name");
  const importableCount = parsed.length;
  const canImport = importableCount > 0 && blockingErrors.length === 0 && !loading;

  return (
    <div className="p-4">
      <div className="text-base font-semibold text-gray-900">นำเข้า POA Requests จาก CSV</div>
      <div className="mt-1 text-sm text-gray-600">นำเข้าเฉพาะ schema ใหม่ (ไฟล์ export_All-POA-requests-modified...)</div>

      <div className="mt-4 grid gap-3 rounded-xl border border-gray-200 bg-white p-4">
        <div>
          <div className="text-sm font-medium text-gray-700">ไฟล์ CSV</div>
          <div className="mt-2">
            <FileUploader
              label=""
              helperText="คลิกเพื่อเลือกไฟล์ CSV หรือ ลากไฟล์มาวาง"
              hintText="รองรับ .csv"
              accept={{ "text/csv": [".csv"], "application/vnd.ms-excel": [".csv"] }}
              multiple={false}
              maxFiles={1}
              maxSizeBytes={10 * 1024 * 1024}
              files={csvFiles}
              onFilesChange={(next) => {
                setCsvFiles(next);
                const f = next[0];
                if (!f) return;
                setFileName(f.name);
                setMessage(null);
                setFatalError(null);
                setProgress(0);
                setErrors([]);
                setParsed([]);

                const reader = new FileReader();
                reader.onload = async () => {
                  try {
                    const text = String(reader.result ?? "");
                    const { records } = parseCsv(text);
                    const mapped = records.map(mapCsvRecordToPoa);
                    const errs = validateImportRows(mapped);
                    setParsed(mapped);
                    setErrors(errs);
                    const { data: tData, error: tErr } = await supabase
                      .from("poa_request_types")
                      .select("id,name,base_price,is_active")
                      .order("created_at", { ascending: false });
                    if (tErr) throw new Error(tErr.message);
                    setTypes(((tData ?? []) as TypeOption[]) ?? []);
                  } catch (err: any) {
                    setFatalError(err?.message ?? "อ่านไฟล์ไม่สำเร็จ");
                  }
                };
                reader.onerror = () => setFatalError("อ่านไฟล์ไม่สำเร็จ");
                reader.readAsText(f);
              }}
              disabled={loading}
            />
          </div>
          {fileName ? <div className="mt-2 text-xs text-gray-500">ไฟล์: {fileName}</div> : null}
        </div>

        <div>
          <div className="text-sm font-medium text-gray-700">เมื่อพบ POA id ซ้ำ</div>
          <AppSelect
            placeholder="เลือก"
            options={duplicateModeOptions}
            value={effectiveMode}
            onChange={(v: any) => setMode(v)}
            getOptionValue={(o) => o.value}
            displayValue={(selected) => duplicateModeOptions.find((o) => o.value === selected)?.label ?? ""}
            disabled={loading || !canUpdateExisting}
            selectClassName="h-10 px-3"
          />
          {!canUpdateExisting ? <div className="mt-1 text-xs text-gray-500">บทบาทนี้จะ “ข้ามรายการซ้ำ” เท่านั้น</div> : null}
        </div>

        {fatalError ? <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">{fatalError}</div> : null}

        <div className="grid gap-2 rounded-lg border border-gray-200 bg-gray-50 p-3">
          <div className="text-sm font-semibold text-gray-900">พรีวิว</div>
          <div className="text-sm text-gray-700">จำนวนแถว: {importableCount.toLocaleString()}</div>
          {blockingErrors.length ? (
            <div className="text-sm text-red-700">พบข้อผิดพลาดที่ต้องแก้ไข: {blockingErrors.length.toLocaleString()} รายการ</div>
          ) : null}
          {preview.length ? (
            <div className="overflow-hidden rounded-lg border border-gray-200 bg-white">
              <div className="grid grid-cols-[1.2fr_0.7fr_0.5fr_0.6fr] gap-3 bg-gray-50 px-3 py-2 text-xs font-semibold text-gray-600">
                <div>นายจ้าง</div>
                <div>POA id</div>
                <div className="text-right">จำนวน</div>
                <div>สถานะจ่าย</div>
              </div>
              {preview.map((r, i) => (
                <div key={i} className="grid grid-cols-[1.2fr_0.7fr_0.5fr_0.6fr] gap-3 border-t border-gray-100 px-3 py-2 text-sm">
                  <div className="font-medium text-gray-900">{r.employer_name}</div>
                  <div className="text-gray-700">{r.import_temp_id}</div>
                  <div className="text-right text-gray-900">{Number(r.worker_count ?? 0).toLocaleString()}</div>
                  <div className="text-gray-700">{r.payment_status_text ?? "-"}</div>
                </div>
              ))}
            </div>
          ) : null}
          {errors.length ? <div className="text-xs text-gray-600">Errors: {errors.length.toLocaleString()} (แสดงเฉพาะที่จำเป็น)</div> : null}
        </div>

        {loading ? (
          <div className="grid gap-2">
            <div className="h-2 w-full overflow-hidden rounded bg-gray-100">
              <div className="h-full rounded bg-gray-900" style={{ width: `${Math.min(100, Math.max(0, progress))}%` }} />
            </div>
            <div className="text-xs text-gray-600">กำลังนำเข้า... {Math.round(progress)}%</div>
          </div>
        ) : null}

        {message ? <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800">{message}</div> : null}

        <div className="flex flex-wrap gap-2">
          <Button
            onClick={async () => {
              setLoading(true);
              setMessage(null);
              setFatalError(null);
              setProgress(0);

              try {
                const typeByName = new Map(types.map((t) => [t.name.trim(), t]));
                const defaultType = types.find((t) => t.is_active) ?? null;

                const batchSize = 100;
                let inserted = 0;
                let updated = 0;
                let skipped = 0;

                for (let i = 0; i < parsed.length; i += batchSize) {
                  const batch = parsed.slice(i, i + batchSize);
                  const importIds = Array.from(new Set(batch.map((b) => b.import_temp_id).filter((x) => x.length > 0)));

                  const existingMap = new Map<string, { id: string }>();
                  if (importIds.length) {
                    const { data: ex, error: exErr } = await supabase.from("poa_requests").select("id,import_temp_id").in("import_temp_id", importIds);
                    if (exErr) throw new Error(exErr.message);
                    for (const r of (ex ?? []) as any[]) {
                      const key = String(r.import_temp_id ?? "").trim();
                      if (!key) continue;
                      existingMap.set(key, { id: String(r.id) });
                    }
                  }

                  const upsertMap = new Map<string, any>();
                  for (const row of batch) {
                    const ex = existingMap.get(row.import_temp_id);
                    if (ex && effectiveMode === "skip") {
                      skipped += 1;
                      continue;
                    }

                    const status = deriveRequestStatus(row.payment_status_text);

                    const payload = {
                      ...(ex ? { id: ex.id } : {}),
                      import_temp_id: row.import_temp_id,
                      representative_profile_id: null,
                      representative_import_temp_id: row.representative_import_temp_id,
                      employer_name: row.employer_name,
                      employer_address: row.employer_address,
                      employer_tax_id: row.employer_tax_id,
                      employer_tel: row.employer_tel,
                      employer_type: row.employer_type,
                      worker_count: Math.max(0, row.worker_count ?? 0),
                      worker_male: row.worker_male,
                      worker_female: row.worker_female,
                      worker_nation: row.worker_nation,
                      worker_type: row.worker_type,
                      payment_amount: row.payment_amount,
                      payment_date: row.payment_date,
                      payment_file_url: row.payment_file_url,
                      payment_status_text: row.payment_status_text,
                      status,
                    };

                    upsertMap.set(row.import_temp_id, payload);
                  }

                  const upsertPayload = Array.from(upsertMap.values());
                  if (upsertPayload.length) {
                    const { error: upErr } = await supabase.from("poa_requests").upsert(upsertPayload, { onConflict: "import_temp_id" });
                    if (upErr) throw new Error(upErr.message);

                    for (const p of upsertPayload) {
                      if (p.id) updated += 1;
                      else inserted += 1;
                    }
                  }

                  const { data: reqs, error: reqErr } = await supabase
                    .from("poa_requests")
                    .select("id,import_temp_id,worker_count,payment_status_text")
                    .in("import_temp_id", importIds);
                  if (reqErr) throw new Error(reqErr.message);
                  const reqByImportId = new Map<string, { id: string; worker_count: number; payment_status_text: string | null }>();
                  for (const r of (reqs ?? []) as any[]) {
                    reqByImportId.set(String(r.import_temp_id ?? "").trim(), {
                      id: String(r.id),
                      worker_count: Number(r.worker_count ?? 0),
                      payment_status_text: r.payment_status_text ?? null,
                    });
                  }

                  const itemUpserts: any[] = [];
                  for (const row of batch) {
                    const req = reqByImportId.get(row.import_temp_id);
                    if (!req) continue;
                    const typeNames = parseRequestedTypeNames(row.poa_request);
                    const selectedType = typeNames.length
                      ? (typeByName.get(typeNames[0]) ?? null)
                      : defaultType
                        ? defaultType
                        : null;
                    const payment_status = deriveItemPaymentStatus(row.payment_status_text ?? req.payment_status_text);

                    if (selectedType) {
                      const unit = Number(selectedType.base_price ?? 0);
                      const wc = Math.max(0, Number(req.worker_count ?? 0));
                      const total = unit * wc;
                      itemUpserts.push({
                        poa_request_id: req.id,
                        poa_request_type_id: selectedType.id,
                        unit_price_per_worker: unit,
                        worker_count: wc,
                        total_price: total,
                        payment_status,
                      });
                    }
                  }

                  if (itemUpserts.length) {
                    const { error: itemErr } = await supabase
                      .from("poa_request_items")
                      .upsert(itemUpserts, { onConflict: "poa_request_id,poa_request_type_id" });
                    if (itemErr) throw new Error(itemErr.message);
                  }

                  setProgress(Math.min(100, ((i + batch.length) / parsed.length) * 100));
                }

                setMessage(`นำเข้าเสร็จสิ้น • เพิ่มใหม่ ${inserted.toLocaleString()} • อัปเดต ${updated.toLocaleString()} • ข้าม ${skipped.toLocaleString()}`);
                setLoading(false);
                onImported();
              } catch (err: any) {
                setFatalError(err?.message ?? "นำเข้าไม่สำเร็จ");
                setLoading(false);
              }
            }}
            disabled={!canImport}
          >
            นำเข้า
          </Button>
          <Button variant="outline" onClick={() => closeModal()} disabled={loading}>
            ปิด
          </Button>
        </div>
      </div>
    </div>
  );
}
