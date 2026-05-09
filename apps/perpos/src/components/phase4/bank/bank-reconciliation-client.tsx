"use client";

import React, { useMemo, useState, useTransition } from "react";
import { toast } from "react-hot-toast";
import { CheckCircle2, RefreshCw, UploadCloud, XCircle } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import cn from "@core/utils/class-names";
import { parseCsv } from "@/utils/csv";
import {
  confirmReconciliationAction,
  importBankStatementCsvAction,
  listBankImportsAction,
  listBankLinesAction,
  suggestReconciliationAction,
  unreconcileBankLineAction,
  type BankImportRow,
  type BankLineRow,
  type SuggestRow,
} from "@/lib/phase4/bank/actions";

function fmt(n: number) {
  return n.toLocaleString("th-TH", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

type Mapping = {
  txnDate: string;
  description: string;
  amount: string;
  direction?: string;
  reference?: string;
  balance?: string;
};

export function BankReconciliationClient(props: {
  organizationId: string;
  initialImports: BankImportRow[];
}) {
  const [pending, startTransition] = useTransition();
  const [imports, setImports] = useState(props.initialImports);
  const [activeImportId, setActiveImportId] = useState<string>(imports[0]?.id ?? "");
  const [lines, setLines] = useState<BankLineRow[]>([]);
  const [selectedLine, setSelectedLine] = useState<BankLineRow | null>(null);
  const [suggestions, setSuggestions] = useState<SuggestRow[]>([]);

  const [bankName, setBankName] = useState("KBank");
  const [bankAccountName, setBankAccountName] = useState("บัญชีธนาคาร");
  const [periodFrom, setPeriodFrom] = useState<string>("");
  const [periodTo, setPeriodTo] = useState<string>("");
  const [csvFile, setCsvFile] = useState<File | null>(null);
  const [csvHeaders, setCsvHeaders] = useState<string[]>([]);
  const [csvRecords, setCsvRecords] = useState<Record<string, string>[]>([]);
  const [mapping, setMapping] = useState<Mapping>({ txnDate: "", description: "", amount: "", direction: "", reference: "", balance: "" });

  const canImport = Boolean(csvFile) && csvHeaders.length > 0;

  const loadLines = React.useCallback(
    (importId: string) => {
      setSelectedLine(null);
      setSuggestions([]);
      startTransition(async () => {
        const res = await listBankLinesAction({ organizationId: props.organizationId, bankImportId: importId });
        if (!res.ok) {
          toast.error(res.error);
          return;
        }
        setLines(res.rows);
      });
    },
    [props.organizationId],
  );

  const refreshImports = () => {
    startTransition(async () => {
      const res = await listBankImportsAction({ organizationId: props.organizationId });
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      setImports(res.rows);
      const id = res.rows[0]?.id ?? "";
      setActiveImportId(id);
      if (id) loadLines(id);
    });
  };

  React.useEffect(() => {
    if (activeImportId) loadLines(activeImportId);
  }, [activeImportId, loadLines]);

  const previewLines = useMemo(() => {
    if (!csvRecords.length) return [];
    const m = mapping;
    if (!m.txnDate || !m.amount) return [];
    const out: Array<{ txn_date: string; description?: string; amount: number; direction: "in" | "out"; reference?: string; balance?: number }> = [];
    for (const r of csvRecords.slice(0, 1000)) {
      const date = (r[m.txnDate] ?? "").trim();
      const amountRaw = (r[m.amount] ?? "").replaceAll(",", "").trim();
      if (!date || !amountRaw) continue;
      const amt = Number(amountRaw);
      if (!Number.isFinite(amt) || amt === 0) continue;
      const dirRaw = m.direction ? (r[m.direction] ?? "").toLowerCase() : "";
      const direction: "in" | "out" = dirRaw.includes("in") || dirRaw.includes("credit") || dirRaw.includes("รับ") || amt > 0 ? "in" : "out";
      out.push({
        txn_date: date,
        description: m.description ? r[m.description] : "",
        amount: Math.abs(amt),
        direction,
        reference: m.reference ? r[m.reference] : "",
        balance: m.balance ? Number((r[m.balance] ?? "").replaceAll(",", "")) : undefined,
      });
    }
    return out;
  }, [csvRecords, mapping]);

  const importCsv = () => {
    if (!csvFile) return;
    if (!previewLines.length) {
      toast.error("กรุณาตั้งค่า mapping ให้ถูกต้อง");
      return;
    }
    startTransition(async () => {
      const res = await importBankStatementCsvAction({
        organizationId: props.organizationId,
        bankName,
        bankAccountName,
        periodFrom: periodFrom || null,
        periodTo: periodTo || null,
        file: csvFile,
        lines: previewLines,
      });
      if (!res.ok) {
        toast.error(String(res.error));
        return;
      }
      toast.success("นำเข้า statement สำเร็จ");
      setCsvFile(null);
      setCsvHeaders([]);
      setCsvRecords([]);
      setMapping({ txnDate: "", description: "", amount: "", direction: "", reference: "", balance: "" });
      refreshImports();
    });
  };

  const selectLine = (l: BankLineRow) => {
    setSelectedLine(l);
    setSuggestions([]);
    startTransition(async () => {
      const res = await suggestReconciliationAction({ organizationId: props.organizationId, bankLineId: l.id, limit: 10 });
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      setSuggestions(res.rows);
    });
  };

  const confirmMatch = (jeId: string) => {
    if (!selectedLine) return;
    startTransition(async () => {
      const res = await confirmReconciliationAction({ organizationId: props.organizationId, bankLineId: selectedLine.id, journalEntryId: jeId });
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      toast.success("ยืนยันการจับคู่แล้ว");
      loadLines(activeImportId);
      setSelectedLine(null);
      setSuggestions([]);
    });
  };

  const unmatch = () => {
    if (!selectedLine) return;
    startTransition(async () => {
      const res = await unreconcileBankLineAction({ organizationId: props.organizationId, bankLineId: selectedLine.id });
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      toast.success("ยกเลิกการจับคู่แล้ว");
      loadLines(activeImportId);
      setSelectedLine(null);
      setSuggestions([]);
    });
  };

  return (
    <div className="grid gap-6">
      <div className="rounded-xl border border-slate-200 bg-white p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <div className="text-sm font-semibold text-slate-900">อัปโหลด Bank Statement (CSV)</div>
            <div className="mt-0.5 text-xs text-slate-600">นำเข้ารายการธนาคารเพื่อทำการจับคู่กับรายการในระบบ</div>
          </div>
          <Button variant="outline" className="gap-2" onClick={refreshImports} disabled={pending}>
            <RefreshCw className={cn("h-4 w-4", pending ? "animate-spin" : undefined)} />
            Refresh
          </Button>
        </div>

        <div className="mt-4 grid gap-3 md:grid-cols-5">
          <div className="grid gap-1 md:col-span-1">
            <div className="text-xs text-slate-600">ธนาคาร</div>
            <select className="h-9 rounded-md border border-slate-200 bg-white px-3 text-sm" value={bankName} onChange={(e) => setBankName(e.target.value)}>
              <option value="KBank">KBank</option>
              <option value="SCB">SCB</option>
              <option value="BBL">BBL</option>
              <option value="Other">Other</option>
            </select>
          </div>
          <div className="grid gap-1 md:col-span-2">
            <div className="text-xs text-slate-600">ชื่อบัญชี</div>
            <Input value={bankAccountName} onChange={(e) => setBankAccountName(e.target.value)} />
          </div>
          <div className="grid gap-1">
            <div className="text-xs text-slate-600">งวดจาก</div>
            <Input type="date" value={periodFrom} onChange={(e) => setPeriodFrom(e.target.value)} />
          </div>
          <div className="grid gap-1">
            <div className="text-xs text-slate-600">งวดถึง</div>
            <Input type="date" value={periodTo} onChange={(e) => setPeriodTo(e.target.value)} />
          </div>
        </div>

        <div className="mt-4 grid gap-3 md:grid-cols-3">
          <div className="md:col-span-1">
            <div className="text-xs text-slate-600">เลือกไฟล์ CSV</div>
            <label className="mt-1 flex h-10 cursor-pointer items-center justify-center gap-2 rounded-md border border-slate-200 bg-slate-50 text-sm text-slate-700 hover:bg-slate-100">
              <UploadCloud className="h-4 w-4" />
              <span>{csvFile ? csvFile.name : "เลือกไฟล์"}</span>
              <input
                type="file"
                accept=".csv,text/csv"
                className="hidden"
                onChange={async (e) => {
                  const f = e.target.files?.[0] ?? null;
                  if (!f) return;
                  const text = await f.text();
                  const parsed = parseCsv(text);
                  setCsvFile(f);
                  setCsvHeaders(parsed.headers);
                  setCsvRecords(parsed.records);
                }}
              />
            </label>
          </div>

          <div className="md:col-span-2">
            {canImport ? (
              <div className="grid gap-2 rounded-lg border border-slate-200 p-3">
                <div className="text-sm font-semibold text-slate-900">ตั้งค่า Mapping</div>
                <div className="grid grid-cols-2 gap-2">
                  <MappingSelect label="วันที่" value={mapping.txnDate} onChange={(v) => setMapping((s) => ({ ...s, txnDate: v }))} headers={csvHeaders} />
                  <MappingSelect label="จำนวนเงิน" value={mapping.amount} onChange={(v) => setMapping((s) => ({ ...s, amount: v }))} headers={csvHeaders} />
                  <MappingSelect label="รายละเอียด" value={mapping.description} onChange={(v) => setMapping((s) => ({ ...s, description: v }))} headers={csvHeaders} />
                  <MappingSelect label="ทิศทาง (optional)" value={mapping.direction ?? ""} onChange={(v) => setMapping((s) => ({ ...s, direction: v }))} headers={csvHeaders} optional />
                  <MappingSelect label="อ้างอิง (optional)" value={mapping.reference ?? ""} onChange={(v) => setMapping((s) => ({ ...s, reference: v }))} headers={csvHeaders} optional />
                  <MappingSelect label="คงเหลือ (optional)" value={mapping.balance ?? ""} onChange={(v) => setMapping((s) => ({ ...s, balance: v }))} headers={csvHeaders} optional />
                </div>
                <div className="flex items-center justify-between">
                  <div className="text-xs text-slate-600">ตัวอย่างที่จะนำเข้า: {previewLines.length.toLocaleString("th-TH")} รายการ</div>
                  <Button onClick={importCsv} disabled={pending || !previewLines.length} className="gap-2">
                    <UploadCloud className="h-4 w-4" />
                    นำเข้า
                  </Button>
                </div>
              </div>
            ) : (
              <div className="mt-6 text-sm text-slate-600">เลือกไฟล์เพื่อเริ่มตั้งค่า mapping</div>
            )}
          </div>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-12">
        <div className="rounded-xl border border-slate-200 bg-white p-4 lg:col-span-7">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="text-sm font-semibold text-slate-900">รายการ Statement</div>
            <select
              className="h-9 rounded-md border border-slate-200 bg-white px-3 text-sm"
              value={activeImportId}
              onChange={(e) => {
                const id = e.target.value;
                setActiveImportId(id);
                if (id) loadLines(id);
              }}
            >
              {imports.map((im) => (
                <option key={im.id} value={im.id}>
                  {im.bankName} • {im.bankAccountName}
                </option>
              ))}
            </select>
          </div>

          <div className="mt-3 max-h-[520px] overflow-auto rounded-lg border border-slate-200">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-[120px]">วันที่</TableHead>
                  <TableHead>รายละเอียด</TableHead>
                  <TableHead className="w-[120px] text-right">จำนวน</TableHead>
                  <TableHead className="w-[90px]">สถานะ</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {lines.map((l) => (
                  <TableRow
                    key={l.id}
                    className={cn(selectedLine?.id === l.id ? "bg-slate-50" : undefined)}
                    onClick={() => selectLine(l)}
                  >
                    <TableCell>{l.txnDate}</TableCell>
                    <TableCell>
                      <div className="text-sm text-slate-900">{l.description ?? ""}</div>
                      <div className="mt-0.5 text-xs text-slate-600">{l.direction.toUpperCase()} {l.reference ?? ""}</div>
                    </TableCell>
                    <TableCell className={cn("text-right tabular-nums", l.direction === "in" ? "text-emerald-700" : "text-slate-900")}>
                      {fmt(l.amount)}
                    </TableCell>
                    <TableCell>
                      {l.matchedJournalEntryId ? (
                        <span className="text-xs text-emerald-700">Matched</span>
                      ) : (
                        <span className="text-xs text-slate-500">Open</span>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </div>

        <div className="rounded-xl border border-slate-200 bg-white p-4 lg:col-span-5">
          <div className="text-sm font-semibold text-slate-900">คำแนะนำการจับคู่</div>
          {selectedLine ? (
            <div className="mt-2 rounded-lg border border-slate-200 bg-slate-50 p-3 text-sm">
              <div className="font-medium text-slate-900">{selectedLine.txnDate} • {fmt(selectedLine.amount)}</div>
              <div className="mt-1 text-xs text-slate-600">{selectedLine.description ?? ""}</div>
              {selectedLine.matchedJournalEntryId ? (
                <div className="mt-3 flex items-center justify-between">
                  <div className="text-xs text-emerald-700">จับคู่แล้ว</div>
                  <Button variant="ghost" className="gap-2" onClick={unmatch} disabled={pending}>
                    <XCircle className="h-4 w-4" />
                    ยกเลิกจับคู่
                  </Button>
                </div>
              ) : null}
            </div>
          ) : (
            <div className="mt-2 text-sm text-slate-600">เลือก statement ด้านซ้ายเพื่อดูคำแนะนำ</div>
          )}

          <div className="mt-4 grid gap-2">
            {suggestions.map((s) => (
              <div key={s.journalEntryId} className="flex items-center justify-between rounded-lg border border-slate-200 p-3">
                <div>
                  <div className="font-mono text-xs text-slate-600">{s.journalEntryId.slice(0, 8)}</div>
                  <div className="mt-0.5 text-sm text-slate-900">{s.memo ?? "(ไม่มี memo)"}</div>
                  <div className="mt-0.5 text-xs text-slate-600">วันที่ {s.entryDate} • ±{s.dayDiff} วัน</div>
                </div>
                <Button className="gap-2" size="sm" onClick={() => confirmMatch(s.journalEntryId)} disabled={pending || !!selectedLine?.matchedJournalEntryId}>
                  <CheckCircle2 className="h-4 w-4" />
                  Match
                </Button>
              </div>
            ))}
            {selectedLine && !suggestions.length ? <div className="text-sm text-slate-600">ไม่พบคำแนะนำ (ลองจับคู่เองจากสมุดรายวัน)</div> : null}
          </div>
        </div>
      </div>
    </div>
  );
}

function MappingSelect(props: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  headers: string[];
  optional?: boolean;
}) {
  return (
    <div className="grid gap-1">
      <div className="text-xs text-slate-600">{props.label}</div>
      <select
        className="h-9 rounded-md border border-slate-200 bg-white px-3 text-sm"
        value={props.value}
        onChange={(e) => props.onChange(e.target.value)}
      >
        <option value="">{props.optional ? "(ไม่ระบุ)" : "เลือกคอลัมน์"}</option>
        {props.headers.map((h) => (
          <option key={h} value={h}>
            {h}
          </option>
        ))}
      </select>
    </div>
  );
}
