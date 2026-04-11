"use client";

import React, { useMemo, useState } from "react";
import { Button } from "rizzui";
import AppSelect from "@core/ui/app-select";

import { useAuth } from "@/app/shared/auth-provider";
import { useModal } from "@/app/shared/modal-views/use-modal";
import FileUploader from "@/components/form/file-uploader";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import { parseCsv } from "@/utils/csv";

type ServicesCsvImportModalProps = {
  onImported: () => void;
};

type ImportRow = {
  group: string;
  job_id: string;
  job_name: string;
  sell_price: number;
};

type ImportError = { rowIndex: number; field: keyof ImportRow; message: string };

const duplicateModeOptions = [
  { label: "อัปเดตข้อมูลเดิม", value: "update" },
  { label: "ข้ามรายการที่ซ้ำ", value: "skip" },
];

function parseNumber(s: string) {
  const v = Number(String(s ?? "").replaceAll(",", "").trim());
  return Number.isFinite(v) ? v : 0;
}

function mapGroupCode(raw: string): "mou" | "registration" | "general" {
  const g = String(raw ?? "").trim().toLowerCase();
  if (g.includes("mou")) return "mou";
  if (g.includes("registration") || g.includes("ขึ้นทะเบียน")) return "registration";
  return "general";
}

function groupLabel(code: "mou" | "registration" | "general") {
  if (code === "mou") return "MOU";
  if (code === "registration") return "ขึ้นทะเบียน";
  return "ทั่วไป";
}

function mapCsvRecordToImportRow(rec: Record<string, string>): ImportRow {
  return {
    group: String(rec["group"] ?? "").trim(),
    job_id: String(rec["job id"] ?? "").trim(),
    job_name: String(rec["job name"] ?? "").trim(),
    sell_price: parseNumber(rec["sell price"] ?? ""),
  };
}

function validateRows(rows: ImportRow[]): ImportError[] {
  const errs: ImportError[] = [];
  for (let i = 0; i < rows.length; i++) {
    const r = rows[i];
    if (!r.job_id.trim()) errs.push({ rowIndex: i, field: "job_id", message: "job id ห้ามว่าง" });
    if (!r.job_name.trim()) errs.push({ rowIndex: i, field: "job_name", message: "job name ห้ามว่าง" });
    if (!r.group.trim()) errs.push({ rowIndex: i, field: "group", message: "group ห้ามว่าง" });
  }
  return errs;
}

export function ServicesCsvImportModal({ onImported }: ServicesCsvImportModalProps) {
  const { role } = useAuth();
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

  const canUpdateExisting = role === "admin" || role === "operation";
  const effectiveMode = canUpdateExisting ? mode : "skip";

  const preview = parsed.slice(0, 8);
  const blockingErrors = errors.filter((e) => e.field === "job_id" || e.field === "job_name");
  const importableCount = parsed.length;
  const canImport = importableCount > 0 && blockingErrors.length === 0 && !loading;

  return (
    <div className="p-4">
      <div className="text-base font-semibold text-gray-900">นำเข้า Services จาก CSV</div>
      <div className="mt-1 text-sm text-gray-600">
        รองรับไฟล์ export_All-Services-Lists-modified... (columns: group, job id, job name, sell price)
      </div>

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
                    const mapped = records.map(mapCsvRecordToImportRow);
                    const errs = validateRows(mapped);
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
          <div className="text-sm font-medium text-gray-700">เมื่อพบ job id ซ้ำ</div>
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
              <div className="grid grid-cols-[0.6fr_0.7fr_1.2fr_0.6fr] gap-3 bg-gray-50 px-3 py-2 text-xs font-semibold text-gray-600">
                <div>กลุ่ม</div>
                <div>Job id</div>
                <div>ชื่อ</div>
                <div className="text-right">ราคาขาย</div>
              </div>
              {preview.map((r, i) => (
                <div key={i} className="grid grid-cols-[0.6fr_0.7fr_1.2fr_0.6fr] gap-3 border-t border-gray-100 px-3 py-2 text-sm">
                  <div className="text-gray-700">{r.group || "-"}</div>
                  <div className="font-medium text-gray-900">{r.job_id || "-"}</div>
                  <div className="text-gray-900">{r.job_name || "-"}</div>
                  <div className="text-right text-gray-900">{Number(r.sell_price ?? 0).toLocaleString()}</div>
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
                const batchSize = 200;
                let processed = 0;
                let upserted = 0;
                let skipped = 0;

                for (let i = 0; i < parsed.length; i += batchSize) {
                  const batch = parsed.slice(i, i + batchSize);
                  const ids = Array.from(new Set(batch.map((b) => b.job_id).filter((x) => x.length > 0)));

                  const existing = new Set<string>();
                  if (ids.length) {
                    const { data: ex, error: exErr } = await supabase.from("services").select("job_id").in("job_id", ids);
                    if (exErr) throw new Error(exErr.message);
                    for (const r of (ex ?? []) as any[]) {
                      const k = String((r as any).job_id ?? "").trim();
                      if (k) existing.add(k);
                    }
                  }

                  const payloads = batch
                    .filter((b) => b.job_id.trim() && b.job_name.trim())
                    .filter((b) => !(existing.has(b.job_id) && effectiveMode === "skip"))
                    .map((b) => {
                      const code = mapGroupCode(b.group);
                      return {
                        job_id: b.job_id,
                        name: b.job_name,
                        service_group_code: code,
                        service_group: groupLabel(code),
                        sell_price: Number(b.sell_price ?? 0),
                        cost: 0,
                        base_price: 0,
                        status: "active",
                        updated_at: new Date().toISOString(),
                      } as const;
                    });

                  skipped += batch.filter((b) => existing.has(b.job_id) && effectiveMode === "skip").length;

                  if (payloads.length) {
                    const { error: upErr } = await supabase.from("services").upsert(payloads as any, { onConflict: "job_id" });
                    if (upErr) throw new Error(upErr.message);
                    upserted += payloads.length;
                  }

                  processed += batch.length;
                  setProgress((processed / Math.max(1, parsed.length)) * 100);
                }

                setMessage(`นำเข้าเรียบร้อย: upsert ${upserted.toLocaleString()} รายการ, ข้าม ${skipped.toLocaleString()} รายการ`);
                onImported();
              } catch (err: any) {
                setFatalError(err?.message ?? "นำเข้าไม่สำเร็จ");
              } finally {
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
