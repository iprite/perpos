"use client";

import React, { useMemo, useState } from "react";
import { Button } from "rizzui";
import AppSelect from "@core/ui/app-select";
import { Modal } from "@core/modal-views/modal";

import { useAuth } from "@/app/shared/auth-provider";
import FileUploader from "@/components/form/file-uploader";
import { mapCsvRecordToEmployer, validateEmployerImportRows, type EmployerImportError, type EmployerImportRow } from "@/components/customers/employers-import-mapping";
import { ImportError, ImportRow, mapCsvRecordToWorker, validateImportRows } from "@/components/workers/workers-import-mapping";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import { parseCsv } from "@/utils/csv";

export type CustomerOption = { id: string; name: string };

const duplicateModeOptions = [
  { label: "อัปเดตข้อมูลเดิม", value: "update" },
  { label: "ข้ามรายการที่ซ้ำ", value: "skip" },
];

type Props = {
  open: boolean;
  onClose: () => void;
  customers: CustomerOption[];
  onImported: () => void;
};

export function EmployersWorkersCsvImportModal({ open, onClose, customers, onImported }: Props) {
  const { role, userId } = useAuth();
  const supabase = useMemo(() => createSupabaseBrowserClient(), []);

  const [employersFile, setEmployersFile] = useState<File[]>([]);
  const [workersFile, setWorkersFile] = useState<File[]>([]);

  const [parsedEmployers, setParsedEmployers] = useState<EmployerImportRow[]>([]);
  const [parsedWorkers, setParsedWorkers] = useState<ImportRow[]>([]);

  const [employerErrors, setEmployerErrors] = useState<EmployerImportError[]>([]);
  const [workerErrors, setWorkerErrors] = useState<ImportError[]>([]);
  const [linkErrors, setLinkErrors] = useState<Array<{ rowIndex: number; reason: string }>>([]);
  const [employersHeaders, setEmployersHeaders] = useState<string[]>([]);
  const [workersHeaders, setWorkersHeaders] = useState<string[]>([]);

  const [defaultCustomerId, setDefaultCustomerId] = useState<string>("");
  const [mode, setMode] = useState<"skip" | "update">("update");

  const [loading, setLoading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [message, setMessage] = useState<string | null>(null);
  const [fatalError, setFatalError] = useState<string | null>(null);

  const canUpdateExisting = role === "admin" || role === "sale" || role === "operation";
  const effectiveMode = canUpdateExisting ? mode : "skip";

  const customerOptions = useMemo(() => customers.map((c) => ({ label: c.name, value: c.id })), [customers]);

  const employerPreview = parsedEmployers.slice(0, 5);
  const workerPreview = parsedWorkers.slice(0, 5);

  const normalizeLinkId = (v: string) => {
    const raw = String(v ?? "").trim();
    if (!raw) return "";

    const compact = raw
      .toUpperCase()
      .replace(/×/g, "X")
      .replace(/\s+/g, "")
      .replace(/[^A-Z0-9]/g, "");

    if (!compact) return "";

    if (/^\d+(\.0+)?$/.test(raw)) {
      const t = raw.split(".")[0];
      return t.replace(/^0+(?=\d)/, "");
    }

    const m = raw.match(/\d+(\.0+)?/);
    if (m && String(m[0]).length === raw.replace(/\s+/g, "").length) {
      const t = String(m[0]).split(".")[0];
      return t.replace(/^0+(?=\d)/, "");
    }

    if (/^\d+$/.test(compact)) return compact.replace(/^0+(?=\d)/, "");
    return compact;
  };

  const normalizeEmployerName = (v: string) =>
    String(v ?? "")
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9ก-๙\s]+/g, " ")
      .replace(/\s+/g, " ");

  const employerIdSet = useMemo(() => {
    return new Set(parsedEmployers.map((e) => normalizeLinkId(e.import_temp_id)).filter(Boolean));
  }, [parsedEmployers]);

  const employerNameSet = useMemo(() => {
    return new Set(parsedEmployers.map((e) => normalizeEmployerName(e.name)).filter(Boolean));
  }, [parsedEmployers]);

  const employerNameToImportId = useMemo(() => {
    const m = new Map<string, string>();
    const dup = new Set<string>();
    for (const e of parsedEmployers) {
      const nameKey = normalizeEmployerName(e.name);
      const idKey = normalizeLinkId(e.import_temp_id);
      if (!nameKey || !idKey) continue;
      const prev = m.get(nameKey);
      if (prev && prev !== idKey) dup.add(nameKey);
      else m.set(nameKey, idKey);
    }
    dup.forEach((k) => m.delete(k));
    return m;
  }, [parsedEmployers]);

  const blockingEmployerErrors = employerErrors.filter((e) => e.field === "import_temp_id" || e.field === "name");
  const blockingWorkerErrors = workerErrors.filter((e) => e.field === "full_name");
  const blockingLinkErrors = linkErrors;

  const validEmployerCount = useMemo(() => {
    return parsedEmployers.filter((e) => normalizeLinkId(e.import_temp_id) && String(e.name ?? "").trim()).length;
  }, [parsedEmployers]);

  const canImport =
    !!userId &&
    parsedWorkers.length > 0 &&
    blockingWorkerErrors.length === 0 &&
    !loading;

  const resetAll = () => {
    setEmployersFile([]);
    setWorkersFile([]);
    setParsedEmployers([]);
    setParsedWorkers([]);
    setEmployerErrors([]);
    setWorkerErrors([]);
    setLinkErrors([]);
    setEmployersHeaders([]);
    setWorkersHeaders([]);
    setDefaultCustomerId("");
    setMode("update");
    setLoading(false);
    setProgress(0);
    setMessage(null);
    setFatalError(null);
  };

  const recomputeLinkErrors = (nextEmployers: EmployerImportRow[], nextWorkers: ImportRow[]) => {
    const ids = new Set(nextEmployers.map((e) => normalizeLinkId(e.import_temp_id)).filter(Boolean));
    const names = new Set(nextEmployers.map((e) => normalizeEmployerName(e.name)).filter(Boolean));
    const errs: Array<{ rowIndex: number; reason: string }> = [];
    nextWorkers.forEach((w, idx) => {
      const raw = String(w.employer_import_temp_id ?? "").trim();
      if (!raw) return;
      const key = normalizeLinkId(raw);
      const nk = normalizeEmployerName(raw);
      if (!ids.has(key) && !names.has(nk)) errs.push({ rowIndex: idx + 2, reason: `ไม่พบ Employer '${raw}' ใน Employers.csv` });
    });
    setLinkErrors(errs);
  };

  const stats = useMemo(() => {
    const employerIds = parsedEmployers.map((e) => normalizeLinkId(e.import_temp_id)).filter(Boolean);
    const uniqEmployerIds = new Set(employerIds);
    const workerRawEmployers = parsedWorkers.map((w) => String(w.employer_import_temp_id ?? "").trim()).filter(Boolean);
    const workerKeys = workerRawEmployers.map((x) => normalizeLinkId(x)).filter(Boolean);
    const uniqWorkerKeys = new Set(workerKeys);
    const matched = workerKeys.filter((k) => employerIdSet.has(k)).length;
    const unmatchedKeys: string[] = [];
    for (let i = 0; i < workerRawEmployers.length && unmatchedKeys.length < 5; i += 1) {
      const raw = workerRawEmployers[i];
      const k = normalizeLinkId(raw);
      if (!k) continue;
      if (!employerIdSet.has(k)) unmatchedKeys.push(raw);
    }
    return {
      employersWithId: uniqEmployerIds.size,
      workersWithEmployer: workerRawEmployers.length,
      uniqWorkerKeys: uniqWorkerKeys.size,
      matched,
      unmatchedExamples: unmatchedKeys,
    };
  }, [employerIdSet, employerIdSet.size, parsedEmployers, parsedWorkers]);

  return (
    <Modal isOpen={open} onClose={onClose} size="xl" customSize={980} rounded="md">
      <div className="rounded-xl bg-white p-5">
        <div className="text-base font-semibold text-gray-900">นำเข้า นายจ้าง + แรงงาน (Employers.csv + Workers.csv)</div>
        <div className="mt-1 text-sm text-gray-600">ระบบจะนำเข้านายจ้างก่อน แล้วนำเข้าแรงงานโดยใช้คอลัมน์ Workers.Employer เพื่อ map กับ Employers (unique id)</div>

        <div className="mt-4 grid gap-3 rounded-xl border border-gray-200 bg-white p-4">
          <div className="grid gap-3 md:grid-cols-2">
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
                  files={employersFile}
                  onFilesChange={(next) => {
                    setEmployersFile(next);
                    const f = next[0];
                    setMessage(null);
                    setFatalError(null);
                    setProgress(0);
                    if (!f) {
                      setParsedEmployers([]);
                      setEmployerErrors([]);
                      setLinkErrors([]);
                      return;
                    }

                    const reader = new FileReader();
                    reader.onload = () => {
                      try {
                        const text = String(reader.result ?? "");
                        const { records } = parseCsv(text);
                    setEmployersHeaders(records[0] ? Object.keys(records[0]) : []);
                        const mapped = records.map(mapCsvRecordToEmployer);
                        const errs = validateEmployerImportRows(mapped, 2);
                        setParsedEmployers(mapped);
                        setEmployerErrors(errs);
                        recomputeLinkErrors(mapped, parsedWorkers);
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

            <div>
              <div className="text-sm font-medium text-gray-700">ไฟล์ Workers.csv</div>
              <div className="mt-2">
                <FileUploader
                  label=""
                  helperText="คลิกเพื่อเลือกไฟล์ CSV หรือ ลากไฟล์มาวาง"
                  hintText="รองรับ .csv"
                  accept={{ "text/csv": [".csv"], "application/vnd.ms-excel": [".csv"] }}
                  multiple={false}
                  maxFiles={1}
                  maxSizeBytes={10 * 1024 * 1024}
                  files={workersFile}
                  onFilesChange={(next) => {
                    setWorkersFile(next);
                    const f = next[0];
                    setMessage(null);
                    setFatalError(null);
                    setProgress(0);
                    if (!f) {
                      setParsedWorkers([]);
                      setWorkerErrors([]);
                      setLinkErrors([]);
                      return;
                    }

                    const reader = new FileReader();
                    reader.onload = () => {
                      try {
                        const text = String(reader.result ?? "");
                        const { records } = parseCsv(text);
                    setWorkersHeaders(records[0] ? Object.keys(records[0]) : []);
                        const mapped = records.map(mapCsvRecordToWorker);
                        const errs = validateImportRows(mapped, 2);
                        setParsedWorkers(mapped);
                        setWorkerErrors(errs);
                        recomputeLinkErrors(parsedEmployers, mapped);
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
          </div>

          <div className="grid gap-3 md:grid-cols-3">
            <div>
              <div className="text-sm font-medium text-gray-700">ลูกค้า (fallback ถ้า map ไม่เจอ)</div>
              <AppSelect
                placeholder="ไม่กำหนด"
                options={customerOptions}
                value={defaultCustomerId}
                onChange={(v: string) => setDefaultCustomerId(v)}
                getOptionValue={(o) => o.value}
                displayValue={(selected) => customerOptions.find((o) => o.value === selected)?.label ?? ""}
                disabled={loading}
                selectClassName="h-10 px-3"
                dropdownClassName="!z-[9999]"
              />
            </div>

            <div>
              <div className="text-sm font-medium text-gray-700">เมื่อพบข้อมูลซ้ำ (นายจ้าง/แรงงาน)</div>
              <AppSelect
                placeholder="เลือก"
                options={duplicateModeOptions}
                value={effectiveMode}
                onChange={(v: any) => setMode(v)}
                getOptionValue={(o) => o.value}
                displayValue={(selected) => duplicateModeOptions.find((o) => o.value === selected)?.label ?? ""}
                disabled={loading || !canUpdateExisting}
                selectClassName="h-10 px-3"
                dropdownClassName="!z-[9999]"
              />
              {!canUpdateExisting ? <div className="mt-1 text-xs text-gray-500">บทบาทนี้จะ “ข้ามรายการซ้ำ” เท่านั้น</div> : null}
            </div>
          </div>

          {fatalError ? <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">{fatalError}</div> : null}

          <div className="grid gap-3 rounded-lg border border-gray-200 bg-gray-50 p-3">
            <div className="text-sm font-semibold text-gray-900">พรีวิว</div>
            <div className="grid gap-2 text-sm text-gray-700 md:grid-cols-2">
              <div>Employers: {parsedEmployers.length.toLocaleString()} แถว</div>
              <div>Workers: {parsedWorkers.length.toLocaleString()} แถว</div>
            </div>

            {blockingEmployerErrors.length ? <div className="text-sm text-red-700">Employers errors: {blockingEmployerErrors.length.toLocaleString()} รายการ</div> : null}
            {blockingWorkerErrors.length ? <div className="text-sm text-red-700">Workers errors: {blockingWorkerErrors.length.toLocaleString()} รายการ</div> : null}
            {blockingLinkErrors.length ? <div className="text-sm text-red-700">Link errors: {blockingLinkErrors.length.toLocaleString()} รายการ</div> : null}
            {blockingLinkErrors.length && defaultCustomerId ? <div className="text-xs text-gray-600">ระบบจะนำเข้าแรงงานที่ link ไม่เจอ โดยใช้ลูกค้า fallback</div> : null}
            {parsedEmployers.length || parsedWorkers.length ? (
              <div className="text-xs text-gray-600">
                <div>Employer IDs ที่อ่านได้: {stats.employersWithId.toLocaleString()} | Workers ที่มี Employer: {stats.workersWithEmployer.toLocaleString()} | match ได้: {stats.matched.toLocaleString()}</div>
                {stats.unmatchedExamples.length ? <div>ตัวอย่าง Employer ที่ไม่ match: {stats.unmatchedExamples.join(" | ")}</div> : null}
              </div>
            ) : null}
            {employersHeaders.length ? <div className="text-xs text-gray-500">Employers headers: {employersHeaders.slice(0, 12).join(", ")}{employersHeaders.length > 12 ? " ..." : ""}</div> : null}
            {workersHeaders.length ? <div className="text-xs text-gray-500">Workers headers: {workersHeaders.slice(0, 12).join(", ")}{workersHeaders.length > 12 ? " ..." : ""}</div> : null}

            {employerPreview.length ? (
              <div className="overflow-hidden rounded-lg border border-gray-200 bg-white">
                <div className="grid grid-cols-[0.9fr_1.4fr_1fr] gap-3 bg-gray-50 px-3 py-2 text-xs font-semibold text-gray-600">
                  <div>Employer ID</div>
                  <div>ชื่อ</div>
                  <div>เบอร์</div>
                </div>
                {employerPreview.map((r, i) => (
                  <div key={i} className="grid grid-cols-[0.9fr_1.4fr_1fr] gap-3 border-t border-gray-100 px-3 py-2 text-sm">
                    <div className="font-medium text-gray-900">{r.import_temp_id || "-"}</div>
                    <div className="text-gray-700">{r.name || "-"}</div>
                    <div className="text-gray-700">{r.phone ?? "-"}</div>
                  </div>
                ))}
              </div>
            ) : null}

            {workerPreview.length ? (
              <div className="overflow-hidden rounded-lg border border-gray-200 bg-white">
                <div className="grid grid-cols-[1.2fr_0.9fr_0.9fr_0.7fr] gap-3 bg-gray-50 px-3 py-2 text-xs font-semibold text-gray-600">
                  <div>ชื่อ</div>
                  <div>Employer (Map ID)</div>
                  <div>Passport</div>
                  <div>สัญชาติ</div>
                </div>
                {workerPreview.map((r, i) => (
                  <div key={i} className="grid grid-cols-[1.2fr_0.9fr_0.9fr_0.7fr] gap-3 border-t border-gray-100 px-3 py-2 text-sm">
                    <div className="font-medium text-gray-900">{r.full_name}</div>
                    <div className="text-gray-700">{r.employer_import_temp_id ?? "-"}</div>
                    <div className="text-gray-700">{r.passport_no ?? "-"}</div>
                    <div className="text-gray-700">{r.nationality ?? "-"}</div>
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
            <Button variant="outline" onClick={() => (loading ? null : resetAll())} disabled={loading}>
              ล้าง
            </Button>
            <Button variant="outline" onClick={() => (loading ? null : onClose())} disabled={loading}>
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
                  const batchSize = 200;
                  let employerInserted = 0;
                  let employerUpdated = 0;
                  let employerSkipped = 0;

                  for (let i = 0; i < parsedEmployers.length; i += batchSize) {
                    const batch = parsedEmployers.slice(i, i + batchSize);
                    const ids = Array.from(new Set(batch.map((b) => normalizeLinkId(b.import_temp_id)).filter(Boolean)));

                    const existingMap = new Map<string, string>();
                    if (ids.length) {
                      const { data: existing, error } = await supabase.from("customers").select("id,import_temp_id").in("import_temp_id", ids);
                      if (error) throw new Error(error.message);
                      for (const r of (existing ?? []) as any[]) {
                        const key = normalizeLinkId(String(r.import_temp_id ?? ""));
                        const id = String(r.id);
                        if (!key) continue;
                        existingMap.set(key, id);
                      }
                    }

                    const toInsert: any[] = [];
                    const toUpdate: Array<{ id: string; patch: any }> = [];

                    for (const e of batch) {
                      const key = normalizeLinkId(e.import_temp_id);
                      if (!key || !e.name.trim()) {
                        employerSkipped += 1;
                        continue;
                      }
                      const existingId = existingMap.get(key);
                      const patch = {
                        name: e.name.trim(),
                        contact_name: e.contact_name,
                        phone: e.phone,
                        email: e.email,
                      };
                      if (existingId) {
                        if (effectiveMode === "skip") {
                          employerSkipped += 1;
                        } else {
                          toUpdate.push({ id: existingId, patch });
                        }
                      } else {
                        toInsert.push({
                          import_temp_id: key,
                          created_by_profile_id: userId,
                          ...patch,
                        });
                      }
                    }

                    if (toInsert.length) {
                      const { error } = await supabase.from("customers").insert(toInsert);
                      if (error) throw new Error(error.message);
                      employerInserted += toInsert.length;
                    }

                    if (toUpdate.length) {
                      for (const u of toUpdate) {
                        const { error } = await supabase.from("customers").update(u.patch).eq("id", u.id);
                        if (error) throw new Error(error.message);
                        employerUpdated += 1;
                      }
                    }

                    setProgress(((i + batch.length) / (parsedEmployers.length + parsedWorkers.length)) * 100);
                  }

                  const employerIds = Array.from(employerIdSet);
                  const employerToCustomerId = new Map<string, string>();
                  if (employerIds.length) {
                    const { data: custMap, error } = await supabase
                      .from("customers")
                      .select("id,import_temp_id")
                      .in("import_temp_id", employerIds);
                    if (error) throw new Error(error.message);
                    for (const r of (custMap ?? []) as any[]) {
                      const key = normalizeLinkId(String(r.import_temp_id ?? ""));
                      const cid = String(r.id);
                      if (!key) continue;
                      employerToCustomerId.set(key, cid);
                    }
                  }

                  let inserted = 0;
                  let updated = 0;
                  let skipped = 0;
                  let failed = 0;

                  for (let i = 0; i < parsedWorkers.length; i += batchSize) {
                    const batch = parsedWorkers.slice(i, i + batchSize);

                    const passports = Array.from(new Set(batch.map((b) => (b.passport_no ?? "").trim()).filter((x) => x.length > 0)));
                    const existingByPassport = new Map<string, string>();
                    if (passports.length) {
                      const { data: existing, error } = await supabase.from("workers").select("id,passport_no").in("passport_no", passports);
                      if (error) throw new Error(error.message);
                      for (const r of (existing ?? []) as any[]) {
                        const key = String(r.passport_no ?? "").trim();
                        const id = String(r.id);
                        if (!key) continue;
                        existingByPassport.set(key, id);
                      }
                    }

                    const toInsert: any[] = [];
                    const toUpdate: Array<{ id: string; patch: any }> = [];

                    for (const row of batch) {
                      const rawEmployer = String(row.employer_import_temp_id ?? "").trim();
                      const employerKey = normalizeLinkId(rawEmployer);
                      const employerNameKey = normalizeEmployerName(rawEmployer);
                      const customer_id =
                        (employerKey ? employerToCustomerId.get(employerKey) ?? null : null) ??
                        (employerNameKey
                          ? (() => {
                              const importId = employerNameToImportId.get(employerNameKey);
                              return importId ? employerToCustomerId.get(importId) ?? null : null;
                            })()
                          : null);
                      const resolvedCustomerId = customer_id ?? (defaultCustomerId || null);

                      const patch = {
                        worker_id: row.worker_id?.trim() || null,
                        passport_type: row.passport_type?.trim() || null,
                        full_name: row.full_name.trim(),
                        customer_id: resolvedCustomerId,
                        passport_no: row.passport_no?.trim() || null,
                        nationality: row.nationality?.trim() || null,
                        profile_pic_url: row.profile_pic_url ?? null,
                        visa_exp_date: row.visa_exp_date ?? null,
                        wp_number: row.wp_number ?? null,
                        wp_expire_date: row.wp_expire_date ?? null,
                        wp_type: row.wp_type ?? null,
                        birth_date: row.birth_date ?? null,
                        os_sex: row.os_sex ?? null,
                        passport_expire_date: row.passport_expire_date ?? null,
                      };

                      const passportKey = String(row.passport_no ?? "").trim();
                      const existingId = passportKey ? existingByPassport.get(passportKey) : null;

                      if (existingId) {
                        if (effectiveMode === "skip") {
                          skipped += 1;
                          continue;
                        }
                        toUpdate.push({ id: existingId, patch });
                      } else {
                        toInsert.push({
                          ...patch,
                          created_by_profile_id: userId,
                        });
                      }
                    }

                    if (toInsert.length) {
                      const { error } = await supabase.from("workers").insert(toInsert);
                      if (error) throw new Error(error.message);
                      inserted += toInsert.length;
                    }

                    if (toUpdate.length) {
                      for (const u of toUpdate) {
                        const { error } = await supabase.from("workers").update(u.patch).eq("id", u.id);
                        if (error) throw new Error(error.message);
                        updated += 1;
                      }
                    }

                    setProgress(((parsedEmployers.length + i + batch.length) / (parsedEmployers.length + parsedWorkers.length)) * 100);
                  }

                  setMessage(
                    `นำเข้าผ่าน: นายจ้างเพิ่ม ${employerInserted.toLocaleString()} อัปเดต ${employerUpdated.toLocaleString()} ข้าม ${employerSkipped.toLocaleString()} | แรงงานเพิ่ม ${inserted.toLocaleString()} อัปเดต ${updated.toLocaleString()} ข้าม ${skipped.toLocaleString()}`,
                  );
                  setLoading(false);
                  setProgress(100);
                  onImported();
                } catch (e: any) {
                  setFatalError(e?.message ?? "นำเข้าไม่สำเร็จ");
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
