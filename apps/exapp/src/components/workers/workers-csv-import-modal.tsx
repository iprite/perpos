"use client";

import React, { useMemo, useState } from "react";
import { Button } from "rizzui";
import AppSelect from "@core/ui/app-select";

import { useAuth } from "@/app/shared/auth-provider";
import { useModal } from "@/app/shared/modal-views/use-modal";
import FileUploader from "@/components/form/file-uploader";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import { parseCsv } from "@/utils/csv";
import { ImportError, ImportMappingRow, ImportRow, explainWorkerImportMapping, mapCsvRecordToWorker, validateImportRows } from "@/components/workers/workers-import-mapping";
import { normalizeImportTempId } from "@/utils/import-normalize";

export type CustomerOption = { id: string; name: string };

const duplicateModeOptions = [
  { label: "อัปเดตข้อมูลเดิม", value: "update" },
  { label: "ข้ามรายการที่ซ้ำ", value: "skip" },
];

type WorkerCsvImportModalProps = {
  customers: CustomerOption[];
  onImported: () => void;
};

export function WorkersCsvImportModal({ customers, onImported }: WorkerCsvImportModalProps) {
  const { role, userId } = useAuth();
  const { closeModal } = useModal();
  const supabase = useMemo(() => createSupabaseBrowserClient(), []);

  const [fileName, setFileName] = useState<string | null>(null);
  const [parsed, setParsed] = useState<ImportRow[]>([]);
  const [errors, setErrors] = useState<ImportError[]>([]);
  const [headers, setHeaders] = useState<string[]>([]);
  const [mapping, setMapping] = useState<ImportMappingRow[]>([]);
  const [defaultCustomerId, setDefaultCustomerId] = useState<string>("");

  const [loading, setLoading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [message, setMessage] = useState<string | null>(null);
  const [fatalError, setFatalError] = useState<string | null>(null);
  const [mode, setMode] = useState<"skip" | "update">("update");
  const [csvFiles, setCsvFiles] = useState<File[]>([]);

  const customerOptions = useMemo(() => customers.map((c) => ({ label: c.name, value: c.id })), [customers]);

  const canUpdateExisting = role === "admin" || role === "operation";
  const effectiveMode = canUpdateExisting ? mode : "skip";

  const preview = parsed.slice(0, 5);
  const blockingErrors = errors.filter((e) => e.field === "full_name");

  const importableCount = parsed.length;
  const canImport = !!userId && importableCount > 0 && blockingErrors.length === 0 && !loading;

  return (
    <div className="p-4">
      <div className="text-base font-semibold text-gray-900">นำเข้าแรงงานจาก CSV</div>
      <div className="mt-1 text-sm text-gray-600">เลือกไฟล์ CSV แล้วตรวจพรีวิวก่อนยืนยันนำเข้า</div>

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
                setHeaders([]);
                setMapping([]);

                const reader = new FileReader();
                reader.onload = () => {
                  try {
                    const text = String(reader.result ?? "");
                    const { records } = parseCsv(text);
                    setHeaders(records[0] ? Object.keys(records[0]) : []);
                    setMapping(records[0] ? explainWorkerImportMapping(records[0] as any) : []);
                    const mapped = records.map(mapCsvRecordToWorker);
                    const errs = validateImportRows(mapped, 2);
                    setParsed(mapped);
                    setErrors(errs);
                  } catch (err: any) {
                    setFatalError(err?.message ?? "อ่านไฟล์ไม่สำเร็จ");
                  }
                };
                reader.onerror = () => {
                  setFatalError("อ่านไฟล์ไม่สำเร็จ");
                };
                reader.readAsText(f);
              }}
              disabled={loading}
            />
          </div>
          {fileName ? <div className="mt-2 text-xs text-gray-500">ไฟล์: {fileName}</div> : null}
        </div>

        <div className="grid gap-3 md:grid-cols-2">
          <div>
            <div className="text-sm font-medium text-gray-700">ลูกค้า (ถ้าต้องการกำหนดให้ทั้งไฟล์)</div>
            <AppSelect
              placeholder="ไม่กำหนด"
              options={customerOptions}
              value={defaultCustomerId}
              onChange={(v: string) => setDefaultCustomerId(v)}
              getOptionValue={(o) => o.value}
              displayValue={(selected) => customerOptions.find((o) => o.value === selected)?.label ?? ""}
              disabled={loading}
              selectClassName="h-10 px-3"
            />
          </div>

          <div>
            <div className="text-sm font-medium text-gray-700">เมื่อพบ Passport ซ้ำ</div>
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
              <div className="grid grid-cols-[1.2fr_0.9fr_0.9fr_0.7fr] gap-3 bg-gray-50 px-3 py-2 text-xs font-semibold text-gray-600">
                <div>ชื่อ</div>
                <div>นายจ้าง (Map ID)</div>
                <div>Passport</div>
                <div>สัญชาติ</div>
              </div>
              {preview.map((r, i) => (
                <div key={i} className="grid grid-cols-[1.2fr_0.9fr_0.9fr_0.7fr] gap-3 border-t border-gray-100 px-3 py-2 text-sm">
                  <div className="font-medium text-gray-900">{r.full_name}</div>
                  <div className="text-gray-700">{r.employer_import_temp_id ?? "-"}</div>
                  <div className="text-gray-700">{r.passport_no ?? "-"}</div>
                  <div className="text-gray-700">{r.nationality ?? "-"}</div>
                </div>
              ))}
            </div>
          ) : null}
          {errors.length ? (
            <div className="text-xs text-gray-600">Errors: {errors.length.toLocaleString()} (แสดงเฉพาะที่จำเป็น)</div>
          ) : null}
          {headers.length ? (
            <div className="text-xs text-gray-500">
              Headers: {headers.slice(0, 14).join(", ")}
              {headers.length > 14 ? " ..." : ""}
            </div>
          ) : null}
          {mapping.length ? (
            <div className="overflow-hidden rounded-lg border border-gray-200 bg-white">
              <div className="grid grid-cols-[1fr_1.2fr] gap-3 bg-gray-50 px-3 py-2 text-xs font-semibold text-gray-600">
                <div>ฟิลด์ระบบ</div>
                <div>คอลัมน์ในไฟล์</div>
              </div>
              {mapping.map((m) => (
                <div key={String(m.field)} className="grid grid-cols-[1fr_1.2fr] gap-3 border-t border-gray-100 px-3 py-2 text-sm">
                  <div className="font-medium text-gray-900">{m.label}</div>
                  <div className="text-gray-700">{m.source ?? "-"}</div>
                </div>
              ))}
            </div>
          ) : null}
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
              if (!userId) return;
              setLoading(true);
              setMessage(null);
              setFatalError(null);
              setProgress(0);

              try {
                const batchSize = 200;
                let inserted = 0;
                let updated = 0;
                let skipped = 0;
                let failed = 0;
                let workerIdDuplicated = 0;

                for (let i = 0; i < parsed.length; i += batchSize) {
                  const batch = parsed.slice(i, i + batchSize);

                  const employerIds = Array.from(
                    new Set(batch.map((b) => normalizeImportTempId(String(b.employer_import_temp_id ?? ""))).filter((x) => x.length > 0)),
                  );
                  const employerToCustomerId = new Map<string, string>();
                  if (employerIds.length) {
                    const { data: custMap, error: custErr } = await supabase
                      .from("customers")
                      .select("id,import_temp_id")
                      .in("import_temp_id", employerIds);
                    if (custErr) throw new Error(custErr.message);
                    for (const r of (custMap ?? []) as any[]) {
                      const key = normalizeImportTempId(String(r.import_temp_id ?? ""));
                      const cid = String(r.id);
                      if (!key) continue;
                      employerToCustomerId.set(key, cid);
                    }
                  }

                  const passports = Array.from(
                    new Set(batch.map((b) => (b.passport_no ?? "").trim()).filter((x) => x.length > 0)),
                  );
                  const workerIds = Array.from(
                    new Set(batch.map((b) => String(b.worker_id ?? "").trim().replace(/×/g, "X")).filter((x) => x.length > 0)),
                  );

                  const existingMap = new Map<string, { id: string; created_by_profile_id: string | null }>();
                  if (passports.length) {
                    const { data: ex, error: exErr } = await supabase
                      .from("workers")
                      .select("id,passport_no,created_by_profile_id")
                      .in("passport_no", passports);
                    if (exErr) throw new Error(exErr.message);
                    for (const r of (ex ?? []) as any[]) {
                      const pn = String(r.passport_no ?? "").trim();
                      if (!pn) continue;
                      existingMap.set(pn, { id: String(r.id), created_by_profile_id: r.created_by_profile_id ?? null });
                    }
                  }

                  const existingWorkerIdMap = new Map<string, { id: string; created_by_profile_id: string | null }>();
                  if (workerIds.length) {
                    const { data: ex2, error: ex2Err } = await supabase
                      .from("workers")
                      .select("id,worker_id,created_by_profile_id")
                      .in("worker_id", workerIds);
                    if (ex2Err) throw new Error(ex2Err.message);
                    for (const r of (ex2 ?? []) as any[]) {
                      const wid = String(r.worker_id ?? "").trim().replace(/×/g, "X");
                      if (!wid) continue;
                      existingWorkerIdMap.set(wid, { id: String(r.id), created_by_profile_id: r.created_by_profile_id ?? null });
                    }
                  }

                  const insertMap = new Map<string, any>();
                  const updateMap = new Map<string, any>();
                  const seenWorkerIds = new Set<string>();

                  for (const row of batch) {
                    const pn = (row.passport_no ?? "").trim();
                    const desiredWorkerId = String((row as any).worker_id ?? "").trim().replace(/×/g, "X");
                    const exByWorkerId = desiredWorkerId ? existingWorkerIdMap.get(desiredWorkerId) : undefined;
                    const exByPassport = pn ? existingMap.get(pn) : undefined;
                    const ex = exByWorkerId ?? exByPassport;

                    const empKey = normalizeImportTempId(String(row.employer_import_temp_id ?? ""));
                    const mappedCustomerId = empKey ? (employerToCustomerId.get(empKey) ?? null) : null;
                    const effectiveCustomerId = mappedCustomerId ?? (defaultCustomerId || null);
                    if (empKey && !mappedCustomerId && !defaultCustomerId) {
                      failed += 1;
                      continue;
                    }

                    const { employer_import_temp_id: _, ...workerFields } = row as any;
                    workerFields.worker_id = desiredWorkerId || null;
                    if (desiredWorkerId) {
                      if (seenWorkerIds.has(desiredWorkerId)) {
                        workerIdDuplicated += 1;
                        skipped += 1;
                        continue;
                      }
                      seenWorkerIds.add(desiredWorkerId);
                    }

                    if (ex) {
                      if (effectiveMode === "skip") {
                        skipped += 1;
                        continue;
                      }
                      if (role === "representative" && ex.created_by_profile_id && ex.created_by_profile_id !== userId) {
                        skipped += 1;
                        continue;
                      }

                      if (exByWorkerId && exByPassport && exByWorkerId.id !== exByPassport.id) {
                        failed += 1;
                        continue;
                      }

                      const nextRow = {
                        id: ex.id,
                        customer_id: effectiveCustomerId,
                        ...workerFields,
                      };
                      if (updateMap.has(ex.id)) {
                        skipped += 1;
                      }
                      updateMap.set(ex.id, nextRow);
                      continue;
                    }

                    const insertKey = desiredWorkerId || pn || `${workerFields.full_name ?? ""}|${workerFields.birth_date ?? ""}|${workerFields.alien_identification_number ?? ""}`;
                    const nextRow = {
                      customer_id: effectiveCustomerId,
                      ...workerFields,
                      created_by_profile_id: userId,
                    };
                    if (insertMap.has(insertKey)) {
                      skipped += 1;
                    }
                    insertMap.set(insertKey, nextRow);
                  }

                  const updatePayload = Array.from(updateMap.values());
                  const insertPayload = Array.from(insertMap.values());

                  if (updatePayload.length) {
                    const { error: upErr } = await supabase.from("workers").upsert(updatePayload, { onConflict: "id" });
                    if (upErr) throw new Error(upErr.message);
                    updated += updatePayload.length;
                  }

                  if (insertPayload.length) {
                    const { error: insErr } = await supabase.from("workers").insert(insertPayload);
                    if (insErr) throw new Error(insErr.message);
                    inserted += insertPayload.length;
                  }

                  setProgress(((i + batch.length) / parsed.length) * 100);
                }

                setMessage(
                  `นำเข้าเสร็จแล้ว: เพิ่มใหม่ ${inserted.toLocaleString()} • อัปเดต ${updated.toLocaleString()} • ข้าม ${skipped.toLocaleString()} • ล้มเหลว ${failed.toLocaleString()}${workerIdDuplicated ? ` • ซ้ำเลขแรงงาน ${workerIdDuplicated.toLocaleString()}` : ""}`,
                );
                onImported();
              } catch (e: any) {
                setFatalError(e?.message ?? "นำเข้าไม่สำเร็จ");
              } finally {
                setLoading(false);
                setProgress(100);
              }
            }}
            disabled={!canImport}
          >
            ยืนยันนำเข้า
          </Button>
          <Button
            variant="outline"
            onClick={() => {
              closeModal();
            }}
            disabled={loading}
          >
            ปิด
          </Button>
        </div>
      </div>
    </div>
  );
}
