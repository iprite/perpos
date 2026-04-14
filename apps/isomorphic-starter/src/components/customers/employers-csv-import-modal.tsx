"use client";

import React, { useMemo, useState } from "react";
import { Button } from "rizzui";
import { Modal } from "@core/modal-views/modal";

import { useAuth } from "@/app/shared/auth-provider";
import FileUploader from "@/components/form/file-uploader";
import { mapCsvRecordToEmployer, validateEmployerImportRows, type EmployerImportError, type EmployerImportRow } from "@/components/customers/employers-import-mapping";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import { parseCsv } from "@/utils/csv";
import { normalizeImportTempId } from "@/utils/import-normalize";

const duplicateModeOptions = [
  { label: "อัปเดตข้อมูลเดิม", value: "update" },
  { label: "ข้ามรายการที่ซ้ำ", value: "skip" },
];

type Props = {
  open: boolean;
  onClose: () => void;
  onImported: () => void;
};

export function EmployersCsvImportModal({ open, onClose, onImported }: Props) {
  const { role, userId } = useAuth();
  const supabase = useMemo(() => createSupabaseBrowserClient(), []);

  const [csvFiles, setCsvFiles] = useState<File[]>([]);
  const [parsed, setParsed] = useState<EmployerImportRow[]>([]);
  const [errors, setErrors] = useState<EmployerImportError[]>([]);
  const [headers, setHeaders] = useState<string[]>([]);

  const [loading, setLoading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [message, setMessage] = useState<string | null>(null);
  const [fatalError, setFatalError] = useState<string | null>(null);
  const [mode, setMode] = useState<"skip" | "update">("update");

  const canManageCustomers = role === "admin" || role === "sale" || role === "operation";
  const effectiveMode = canManageCustomers ? mode : "skip";

  const preview = parsed.slice(0, 5);
  const blockingErrors = errors.filter((e) => e.field === "import_temp_id" || e.field === "name");
  const canImport = !!userId && parsed.length > 0 && blockingErrors.length === 0 && !loading && canManageCustomers;

  return (
    <Modal isOpen={open} onClose={onClose} size="xl" customSize={860} rounded="md">
      <div className="rounded-xl bg-white p-5">
        <div className="text-base font-semibold text-gray-900">นำเข้านายจ้างจาก Employers.csv</div>
        <div className="mt-1 text-sm text-gray-600">ระบบจะบันทึก Unique ID ไปที่ customers.import_temp_id เพื่อใช้ map กับ Workers.csv (Employer)</div>

        <div className="mt-4 grid gap-3 rounded-xl border border-gray-200 bg-white p-4">
          <div>
            <div className="text-sm font-medium text-gray-700">ไฟล์ Employers.csv</div>
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
                  setMessage(null);
                  setFatalError(null);
                  setProgress(0);
                  setErrors([]);
                  setParsed([]);
                  setHeaders([]);
                  if (!f) return;

                  const reader = new FileReader();
                  reader.onload = () => {
                    try {
                      const text = String(reader.result ?? "");
                      const { records } = parseCsv(text);
                      setHeaders(records[0] ? Object.keys(records[0]) : []);
                      const mapped = records.map(mapCsvRecordToEmployer);
                      const errs = validateEmployerImportRows(mapped, 2);
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
          </div>

          <div className="grid gap-3 md:grid-cols-2">
            <div>
              <div className="text-sm font-medium text-gray-700">เมื่อพบ Unique ID ซ้ำ</div>
              <select
                value={effectiveMode}
                onChange={(e) => setMode(e.target.value as any)}
                disabled={loading || !canManageCustomers}
                className="mt-2 h-10 w-full rounded-md border border-gray-200 bg-white px-3 text-sm"
              >
                {duplicateModeOptions.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>
              {!canManageCustomers ? <div className="mt-1 text-xs text-gray-500">บทบาทนี้จะ “ข้ามรายการซ้ำ” เท่านั้น</div> : null}
            </div>
          </div>

          {fatalError ? <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">{fatalError}</div> : null}
          {!canManageCustomers ? <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">บทบาทนี้ยังไม่นำเข้านายจ้างได้ (ต้องเป็น admin/sale/operation)</div> : null}

          <div className="grid gap-2 rounded-lg border border-gray-200 bg-gray-50 p-3">
            <div className="text-sm font-semibold text-gray-900">พรีวิว</div>
            <div className="text-sm text-gray-700">จำนวนแถว: {parsed.length.toLocaleString()}</div>
            {blockingErrors.length ? <div className="text-sm text-red-700">พบข้อผิดพลาด: {blockingErrors.length.toLocaleString()} รายการ</div> : null}
            {headers.length ? (
              <div className="text-xs text-gray-500">
                Headers: {headers.slice(0, 14).join(", ")}
                {headers.length > 14 ? " ..." : ""}
              </div>
            ) : null}
            {preview.length ? (
              <div className="overflow-hidden rounded-lg border border-gray-200 bg-white">
                <div className="grid grid-cols-[1fr_1.4fr_1fr_1fr] gap-3 bg-gray-50 px-3 py-2 text-xs font-semibold text-gray-600">
                  <div>Unique ID</div>
                  <div>ชื่อ</div>
                  <div>Tax ID</div>
                  <div>โทรศัพท์</div>
                </div>
                {preview.map((r, i) => (
                  <div key={i} className="grid grid-cols-[1fr_1.4fr_1fr_1fr] gap-3 border-t border-gray-100 px-3 py-2 text-sm">
                    <div className="font-medium text-gray-900">{r.import_temp_id || "-"}</div>
                    <div className="text-gray-700">{r.name || "-"}</div>
                    <div className="text-gray-700">{r.tax_id ?? "-"}</div>
                    <div className="text-gray-700">{r.phone ?? "-"}</div>
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
            <Button variant="outline" onClick={onClose} disabled={loading}>
              ปิด
            </Button>
            <Button
              disabled={!canImport}
              onClick={async () => {
                if (!userId) return;
                setLoading(true);
                setMessage(null);
                setFatalError(null);
                setProgress(0);

                try {
                  const normalizedRows = parsed
                    .map((e) => ({ ...e, import_temp_id: normalizeImportTempId(e.import_temp_id) }))
                    .filter((e) => e.import_temp_id && e.name.trim());

                  const byId = new Map<string, EmployerImportRow>();
                  let duplicatedInFile = 0;
                  for (const r of normalizedRows) {
                    if (byId.has(r.import_temp_id)) duplicatedInFile += 1;
                    byId.set(r.import_temp_id, r);
                  }

                  const normalized = Array.from(byId.values());
                  const ids = normalized.map((e) => e.import_temp_id);

                  const existingMap = new Map<string, string>();
                  if (ids.length) {
                    const { data: existing, error } = await supabase.from("customers").select("id,import_temp_id").in("import_temp_id", ids);
                    if (error) {
                      if ((error.message ?? "").toLowerCase().includes("customers.import_temp_id")) {
                        throw new Error("ตาราง customers ยังไม่มีคอลัมน์ import_temp_id กรุณา apply migration 20260329000300_customers_import_temp_id.sql แล้วรีโหลด schema");
                      }
                      throw new Error(error.message);
                    }
                    for (const r of (existing ?? []) as any[]) {
                      const key = normalizeImportTempId(String(r.import_temp_id ?? ""));
                      const cid = String(r.id);
                      if (!key) continue;
                      existingMap.set(key, cid);
                    }
                  }

                  const toInsert: any[] = [];
                  const toUpdate: Array<{ id: string; patch: any }> = [];
                  let skipped = 0;

                  normalized.forEach((e) => {
                    const existingId = existingMap.get(e.import_temp_id);
                    const patch = { name: e.name.trim(), tax_id: e.tax_id, contact_name: e.contact_name, phone: e.phone, email: e.email };
                    if (existingId) {
                      if (effectiveMode === "skip") skipped += 1;
                      else toUpdate.push({ id: existingId, patch });
                    } else {
                      toInsert.push({ import_temp_id: e.import_temp_id, created_by_profile_id: userId, ...patch });
                    }
                  });

                  if (toInsert.length) {
                    if (effectiveMode === "update") {
                      const { error } = await supabase.from("customers").upsert(toInsert, { onConflict: "import_temp_id" });
                      if (error) throw new Error(error.message);
                    } else {
                      const { error } = await supabase.from("customers").insert(toInsert);
                      if (error) throw new Error(error.message);
                    }
                  }

                  let updated = 0;
                  for (let i = 0; i < toUpdate.length; i += 1) {
                    const u = toUpdate[i];
                    const { error } = await supabase.from("customers").update(u.patch).eq("id", u.id);
                    if (error) throw new Error(error.message);
                    updated += 1;
                    setProgress(((i + 1) / Math.max(1, toUpdate.length)) * 100);
                  }

                  const dupMsg = duplicatedInFile ? ` • ซ้ำในไฟล์ ${duplicatedInFile.toLocaleString()}` : "";
                  setMessage(`นำเข้าผ่าน: เพิ่ม ${toInsert.length.toLocaleString()} อัปเดต ${updated.toLocaleString()} ข้าม ${skipped.toLocaleString()}${dupMsg}`);
                  setLoading(false);
                  setProgress(100);
                  onImported();
                } catch (e: any) {
                  const msg = String(e?.message ?? "นำเข้าไม่สำเร็จ");
                  if (msg.includes("idx_customers_import_temp_id_unique") || msg.toLowerCase().includes("duplicate key value")) {
                    setFatalError("พบ Unique ID ซ้ำกับข้อมูลในระบบหรือซ้ำกันในไฟล์ กรุณาเลือกโหมด “อัปเดตข้อมูลเดิม” หรือแก้ให้ Unique ID ไม่ซ้ำ แล้วลองใหม่");
                    setLoading(false);
                    return;
                  }
                  setFatalError(msg);
                  setLoading(false);
                }
              }}
            >
              นำเข้า
            </Button>
          </div>
        </div>
      </div>
    </Modal>
  );
}
