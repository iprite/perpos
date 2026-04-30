"use client";

import React, { useMemo, useState } from "react";
import { Button } from "rizzui";
import AppSelect from "@core/ui/app-select";

import { useAuth } from "@/app/shared/auth-provider";
import { useModal } from "@/app/shared/modal-views/use-modal";
import FileUploader from "@/components/form/file-uploader";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import { parseCsv } from "@/utils/csv";

type ImportRow = {
  import_temp_id: string;
  tax_id: string | null;
  name: string;
  contact_name: string | null;
  phone: string | null;
};

type ImportError = {
  rowIndex: number;
  field: keyof ImportRow;
  message: string;
};

function normalizePhone(v: string) {
  const x = v.trim();
  if (!x) return null;
  return x;
}

function mapCsvRecordToCustomer(rec: Record<string, string>): ImportRow {
  const tax_id = (rec["ID"] ?? rec["id"] ?? rec["tax_id"] ?? "").trim() || null;
  const import_temp_id = (
    rec["unique id"] ??
    rec["unique_id"] ??
    rec["import_temp_id"] ??
    rec["ID"] ??
    rec["id"] ??
    ""
  ).trim();
  const name = (rec["name_th"] ?? rec["name"] ?? "").trim();
  const contact_name = (rec["contact_name"] ?? "").trim() || null;
  const phone = normalizePhone(rec["contact_tel"] ?? rec["phone"] ?? "");
  return { import_temp_id, tax_id, name, contact_name, phone };
}

function validateImportRows(rows: ImportRow[]): ImportError[] {
  const errors: ImportError[] = [];
  for (let i = 0; i < rows.length; i++) {
    const r = rows[i];
    if (!r.import_temp_id) errors.push({ rowIndex: i + 2, field: "import_temp_id", message: "ต้องมี unique id หรือ Tax ID" });
    if (!r.name) errors.push({ rowIndex: i + 2, field: "name", message: "ต้องมีชื่อบริษัท/นายจ้าง" });
  }
  return errors;
}

type CustomersCsvImportModalProps = {
  onImported: () => void;
};

const duplicateModeOptions = [
  { label: "อัปเดตข้อมูลเดิม", value: "update" },
  { label: "ข้ามรายการที่ซ้ำ", value: "skip" },
];

export function CustomersCsvImportModal({ onImported }: CustomersCsvImportModalProps) {
  const { role, userId } = useAuth();
  const { closeModal } = useModal();
  const supabase = useMemo(() => createSupabaseBrowserClient(), []);

  const [fileName, setFileName] = useState<string | null>(null);
  const [parsed, setParsed] = useState<ImportRow[]>([]);
  const [errors, setErrors] = useState<ImportError[]>([]);

  const [loading, setLoading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [message, setMessage] = useState<string | null>(null);
  const [fatalError, setFatalError] = useState<string | null>(null);
  const [mode, setMode] = useState<"skip" | "update">("update");
  const [csvFiles, setCsvFiles] = useState<File[]>([]);

  const canUpdateExisting = role === "admin" || role === "sale" || role === "operation";
  const effectiveMode = canUpdateExisting ? mode : "skip";

  const preview = parsed.slice(0, 5);
  const blockingErrors = errors.filter((e) => e.field === "import_temp_id" || e.field === "name");
  const importableCount = parsed.length;
  const canImport = !!userId && importableCount > 0 && blockingErrors.length === 0 && !loading;

  return (
    <div className="p-4">
      <div className="text-base font-semibold text-gray-900">นำเข้านายจ้าง/ลูกค้าจาก CSV</div>
      <div className="mt-1 text-sm text-gray-600">ระบบจะเก็บ unique id ชั่วคราวไว้ที่ลูกค้าเพื่อใช้ mapping กับแรงงาน</div>

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
                reader.onload = () => {
                  try {
                    const text = String(reader.result ?? "");
                    const { records } = parseCsv(text);
                    const mapped = records.map(mapCsvRecordToCustomer);
                    const errs = validateImportRows(mapped);
                    setParsed(mapped);
                    setErrors(errs);
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
          <div className="text-sm font-medium text-gray-700">เมื่อพบ unique id ซ้ำ</div>
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
              <div className="grid grid-cols-[1.4fr_0.9fr_0.7fr] gap-3 bg-gray-50 px-3 py-2 text-xs font-semibold text-gray-600">
                <div>ชื่อ</div>
                <div>ผู้ติดต่อ</div>
                <div>โทร</div>
              </div>
              {preview.map((r, i) => (
                <div key={i} className="grid grid-cols-[1.4fr_0.9fr_0.7fr] gap-3 border-t border-gray-100 px-3 py-2 text-sm">
                  <div className="font-medium text-gray-900">
                    {r.name}
                    <div className="text-xs text-gray-500">Tax ID: {r.tax_id ?? "-"} • Map ID: {r.import_temp_id}</div>
                  </div>
                  <div className="text-gray-700">{r.contact_name ?? "-"}</div>
                  <div className="text-gray-700">{r.phone ?? "-"}</div>
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

                for (let i = 0; i < parsed.length; i += batchSize) {
                  const batch = parsed.slice(i, i + batchSize);
                  const ids = Array.from(new Set(batch.map((b) => b.import_temp_id).filter((x) => x.length > 0)));

                  const existingMap = new Map<string, { id: string; created_by_profile_id: string | null }>();
                  if (ids.length) {
                    const { data: ex, error: exErr } = await supabase
                      .from("customers")
                      .select("id,import_temp_id,created_by_profile_id")
                      .in("import_temp_id", ids);
                    if (exErr) throw new Error(exErr.message);
                    for (const r of (ex ?? []) as any[]) {
                      const key = String(r.import_temp_id ?? "").trim();
                      if (!key) continue;
                      existingMap.set(key, { id: String(r.id), created_by_profile_id: r.created_by_profile_id ?? null });
                    }
                  }

                  const updateMap = new Map<string, any>();
                  const insertMap = new Map<string, any>();
                  for (const row of batch) {
                    const ex = existingMap.get(row.import_temp_id);
                    if (ex) {
                      if (effectiveMode === "skip") {
                        skipped += 1;
                        continue;
                      }
                      if (role === "representative" && ex.created_by_profile_id && ex.created_by_profile_id !== userId) {
                        skipped += 1;
                        continue;
                      }

                      const nextRow = {
                        id: ex.id,
                        import_temp_id: row.import_temp_id,
                        name: row.name,
                        tax_id: row.tax_id,
                        contact_name: row.contact_name,
                        phone: row.phone,
                      };
                      if (updateMap.has(ex.id)) {
                        skipped += 1;
                      }
                      updateMap.set(ex.id, nextRow);
                      continue;
                    }

                    const insertKey = row.import_temp_id;
                    const nextRow = {
                      import_temp_id: row.import_temp_id,
                      name: row.name,
                      tax_id: row.tax_id,
                      contact_name: row.contact_name,
                      phone: row.phone,
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
                    const { error: upErr } = await supabase.from("customers").upsert(updatePayload, { onConflict: "id" });
                    if (upErr) throw new Error(upErr.message);
                    updated += updatePayload.length;
                  }

                  if (insertPayload.length) {
                    const { error: insErr } = await supabase.from("customers").insert(insertPayload);
                    if (insErr) throw new Error(insErr.message);
                    inserted += insertPayload.length;
                  }

                  setProgress(((i + batch.length) / parsed.length) * 100);
                }

                setMessage(`นำเข้าเสร็จแล้ว: เพิ่มใหม่ ${inserted.toLocaleString()} • อัปเดต ${updated.toLocaleString()} • ข้าม ${skipped.toLocaleString()}`);
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
          <Button variant="outline" onClick={() => closeModal()} disabled={loading}>
            ปิด
          </Button>
        </div>
      </div>
    </div>
  );
}
