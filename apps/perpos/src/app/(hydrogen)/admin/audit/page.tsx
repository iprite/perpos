"use client";

import React, { useCallback, useEffect, useMemo, useState } from "react";
import { Title, Text } from "@/components/ui/typography";
import {
  ShieldCheck,
  ShieldAlert,
  Download,
  ChevronDown,
  ChevronUp,
  Clock,
  Database,
  Truck,
  AlertCircle,
  CheckCircle2,
} from "lucide-react";

import { useAuth } from "@/app/shared/auth-provider";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import { useUrlState } from "@/lib/use-url-state";
import { backendUrl } from "@/lib/backend";
import { AdminPage } from "../_components/admin-page";
import { Button } from "@/components/ui/button";
import { CustomSelect } from "@/components/ui/custom-select";
import { ThaiDatePicker } from "@/components/ui/thai-date-picker";
import { StatusBadge, type BadgeTone } from "@/components/ui/badge";
import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
  TableEmpty,
  TableLoading,
} from "@/components/ui/table";
import { CopyInline } from "@/components/ui/copy-cell";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogBody,
  DialogTitle,
} from "@/components/ui/dialog";

// ─── Types ────────────────────────────────────────────────────────────────────

type AuditEntry = {
  id: string;
  sequence_no: number;
  action: "INSERT" | "UPDATE" | "DELETE";
  table_name: string;
  record_id: string | null;
  org_id: string | null;
  actor_id: string | null;
  diff_keys: string[] | null;
  payload_hash: string;
  chain_hash: string;
  ip_address: string | null;
  user_agent: string | null;
  request_id: string | null;
  logged_at: string;
  profiles: { display_name: string | null; email: string } | null;
};

type AuditDetail = AuditEntry & {
  old_data: Record<string, unknown> | null;
  new_data: Record<string, unknown> | null;
};

type ShippingCursor = {
  destination: string;
  last_seq: number;
  last_shipped_at: string | null;
  total_shipped: number;
  error_count: number;
  last_error: string | null;
  unshipped: number;
};

type VerifyResult = {
  table: string;
  total: number;
  broken: number;
  ok: boolean;
  entries: { seq_no: number; ok: boolean; chain_hash: string; expected: string }[];
};

// ─── Constants ────────────────────────────────────────────────────────────────

const KNOWN_TABLES = [
  "tmc_finance_entries",
  "tmc_accounts",
  "profiles",
  "organization_members",
  "invoices",
  "journal_entries",
  "journal_items",
  "wht_certificates",
];

const TABLE_OPTIONS = [
  { value: "", label: "ทุกตาราง" },
  ...KNOWN_TABLES.map((t) => ({ value: t, label: t })),
];

const ACTION_OPTIONS = [
  { value: "", label: "ทุก action" },
  { value: "INSERT", label: "INSERT — เพิ่มข้อมูล" },
  { value: "UPDATE", label: "UPDATE — แก้ไข" },
  { value: "DELETE", label: "DELETE — ลบ" },
];

// ─── Helpers ──────────────────────────────────────────────────────────────────

function actionTone(action: string): BadgeTone {
  switch (action) {
    case "INSERT":
      return "success";
    case "UPDATE":
      return "info";
    case "DELETE":
      return "danger";
    default:
      return "neutral";
  }
}

function fmtTs(iso: string) {
  const d = new Date(iso);
  return d.toLocaleString("th-TH", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    timeZone: "Asia/Bangkok",
  });
}

function fmtDate(iso: string | null) {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("th-TH", {
    year: "numeric",
    month: "short",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Asia/Bangkok",
  });
}

function actorLabel(e: AuditEntry) {
  if (e.profiles?.display_name) return e.profiles.display_name;
  if (e.profiles?.email) return e.profiles.email.split("@")[0];
  if (e.actor_id) return e.actor_id.slice(0, 8) + "…";
  return "—";
}

function exportCsv(entries: AuditEntry[], filename = "audit_logs.csv") {
  const header = [
    "sequence_no",
    "logged_at",
    "action",
    "table_name",
    "record_id",
    "actor",
    "org_id",
    "diff_keys",
    "payload_hash",
    "chain_hash",
    "ip_address",
    "request_id",
  ];
  const rows = entries.map((e) => [
    e.sequence_no,
    e.logged_at,
    e.action,
    e.table_name,
    e.record_id ?? "",
    actorLabel(e),
    e.org_id ?? "",
    (e.diff_keys ?? []).join(";"),
    e.payload_hash,
    e.chain_hash,
    e.ip_address ?? "",
    e.request_id ?? "",
  ]);
  const csv = [header, ...rows]
    .map((r) => r.map((v) => `"${String(v).replace(/"/g, '""')}"`).join(","))
    .join("\n");
  const blob = new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function AuditLogPage() {
  const { role, loading: authLoading } = useAuth();
  const supabase = useMemo(() => createSupabaseBrowserClient(), []);

  // ── Auth header ──────────────────────────────────────────────────────────────
  const authHeader = useCallback(async () => {
    const { data } = await supabase.auth.getSession();
    const token = data.session?.access_token;
    if (!token) throw new Error("ยังไม่ได้เข้าสู่ระบบ");
    return { Authorization: `Bearer ${token}` };
  }, [supabase]);

  // ── State ────────────────────────────────────────────────────────────────────
  const [entries, setEntries] = useState<AuditEntry[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Filters — เริ่มจาก URL (saved view: bookmark/แชร์ลิงก์ได้)
  const url = useUrlState();
  const [fTable, setFTable] = useState(() => url.get("table"));
  const [fAction, setFAction] = useState(() => url.get("action"));
  const [fFrom, setFFrom] = useState(() => url.get("from"));
  const [fTo, setFTo] = useState(() => url.get("to"));

  const applyFilters = useCallback(() => {
    url.commit({ table: fTable, action: fAction, from: fFrom, to: fTo });
    load(1);
    // load อ่าน filter ปัจจุบันผ่าน closure (useCallback dep) — เรียกหลัง commit ได้
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [url, fTable, fAction, fFrom, fTo]);

  // Detail dialog
  const [detail, setDetail] = useState<AuditDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);

  // Integrity check
  const [verifyTable, setVerifyTable] = useState("tmc_finance_entries");
  const [verifyResult, setVerifyResult] = useState<VerifyResult | null>(null);
  const [verifying, setVerifying] = useState(false);

  // Shipping status
  const [shipping, setShipping] = useState<ShippingCursor[]>([]);
  const [shippingOpen, setShippingOpen] = useState(false);

  const LIMIT = 50;

  // ── Load entries ─────────────────────────────────────────────────────────────
  const load = useCallback(
    async (pg = 1) => {
      setLoading(true);
      setError(null);
      try {
        const h = await authHeader();
        const params = new URLSearchParams({ page: String(pg), limit: String(LIMIT) });
        if (fTable) params.set("table", fTable);
        if (fAction) params.set("action", fAction);
        if (fFrom) params.set("from", fFrom);
        if (fTo) params.set("to", fTo);

        const res = await fetch(backendUrl(`/admin/audit-logs?${params}`), { headers: h });
        const json = await res.json().catch(() => ({}));
        if (!res.ok) {
          setError(json.error ?? "โหลดข้อมูลไม่สำเร็จ");
          return;
        }
        setEntries(json.entries ?? []);
        setTotal(json.total ?? 0);
        setPage(pg);
      } finally {
        setLoading(false);
      }
    },
    [authHeader, fTable, fAction, fFrom, fTo],
  );

  // ── Load shipping status ──────────────────────────────────────────────────────
  const loadShipping = useCallback(async () => {
    try {
      const h = await authHeader();
      const res = await fetch(backendUrl("/admin/audit-logs?shipping=1"), { headers: h });
      const json = await res.json().catch(() => []);
      setShipping(Array.isArray(json) ? json : []);
    } catch {
      /* silent */
    }
  }, [authHeader]);

  useEffect(() => {
    load(1);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    loadShipping();
  }, [loadShipping]);

  // ── Open detail dialog ───────────────────────────────────────────────────────
  const openDetail = useCallback(
    async (id: string) => {
      setDetail(null);
      setDetailLoading(true);
      try {
        const h = await authHeader();
        const res = await fetch(backendUrl(`/admin/audit-logs?detail=1&id=${id}`), { headers: h });
        const json = await res.json().catch(() => null);
        setDetail(json as AuditDetail);
      } finally {
        setDetailLoading(false);
      }
    },
    [authHeader],
  );

  // ── Verify chain ─────────────────────────────────────────────────────────────
  const runVerify = useCallback(async () => {
    if (!verifyTable) return;
    setVerifying(true);
    setVerifyResult(null);
    try {
      const h = await authHeader();
      const res = await fetch(backendUrl(`/admin/audit-logs/verify?table=${verifyTable}`), {
        headers: h,
      });
      const json = await res.json().catch(() => null);
      setVerifyResult(json as VerifyResult);
    } finally {
      setVerifying(false);
    }
  }, [authHeader, verifyTable]);

  // ── Export CSV ───────────────────────────────────────────────────────────────
  const handleExport = useCallback(async () => {
    try {
      const h = await authHeader();
      const params = new URLSearchParams({ page: "1", limit: "200" });
      if (fTable) params.set("table", fTable);
      if (fAction) params.set("action", fAction);
      if (fFrom) params.set("from", fFrom);
      if (fTo) params.set("to", fTo);
      const res = await fetch(backendUrl(`/admin/audit-logs?${params}`), { headers: h });
      const json = await res.json().catch(() => ({ entries: [] }));
      exportCsv(
        json.entries ?? [],
        `audit_${fTable || "all"}_${new Date().toISOString().slice(0, 10)}.csv`,
      );
    } catch {
      /* silent */
    }
  }, [authHeader, fTable, fAction, fFrom, fTo]);

  // ─────────────────────────────────────────────────────────────────────────────

  if (authLoading) {
    return <div className="p-6 text-sm text-gray-500">กำลังโหลด…</div>;
  }
  if (role !== "super_admin") {
    return (
      <div className="rounded-xl border border-gray-200 bg-white p-6">
        <Title as="h1" className="text-lg font-semibold text-gray-900">
          ไม่มีสิทธิ์เข้าถึง
        </Title>
        <Text className="mt-2 text-sm text-gray-600">หน้านี้สำหรับ Super Admin เท���านั้น</Text>
      </div>
    );
  }

  const totalPages = Math.max(1, Math.ceil(total / LIMIT));

  return (
    <AdminPage
      width="wide"
      title="Audit Log"
      icon={<ShieldCheck className="h-6 w-6" />}
      description="ประวัติทุกการเปลี่ยนแปลงในระบบ — tamper-evident hash chain"
      actions={
        <>
          {/* Shipping status pill */}
          {shipping.map((s) => (
            <button
              key={s.destination}
              onClick={() => {
                setShippingOpen(!shippingOpen);
              }}
              className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-medium transition-colors ${
                s.error_count > 0
                  ? "border-red-200 bg-red-50 text-red-700"
                  : s.unshipped > 0
                    ? "border-amber-200 bg-amber-50 text-amber-700"
                    : "border-emerald-200 bg-emerald-50 text-emerald-700"
              }`}
            >
              <Truck className="h-3 w-3" />
              {s.destination}:&nbsp;
              {s.error_count > 0
                ? `ส่งไม่สำเร็จ ${s.error_count}×`
                : s.unshipped > 0
                  ? `รอส่ง ${s.unshipped}`
                  : `ส่งแล้ว ${s.total_shipped.toLocaleString()}`}
            </button>
          ))}
        </>
      }
    >
      {/* ── Shipping detail (expandable) ────────────────────────────── */}
      {shippingOpen && shipping.length > 0 && (
        <div className="space-y-3 rounded-xl border border-gray-200 bg-white p-4">
          <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">
            สถานะ External Log Shipping
          </p>
          {shipping.map((s) => (
            <div key={s.destination} className="grid grid-cols-[120px_1fr_1fr_1fr] gap-4 text-sm">
              <span className="font-medium capitalize text-gray-800">{s.destination}</span>
              <span className="text-gray-600">
                ส่งล่าสุด: <span className="text-gray-900">{fmtDate(s.last_shipped_at)}</span>
              </span>
              <span className="text-gray-600">
                รวม:{" "}
                <span className="text-gray-900">{s.total_shipped.toLocaleString()} entries</span>
              </span>
              <span className={s.unshipped > 0 ? "font-medium text-amber-700" : "text-emerald-700"}>
                {s.unshipped > 0 ? `⚠ รอส่ง ${s.unshipped}` : "✓ ทันสมัย"}
              </span>
              {s.last_error && (
                <div className="col-span-4 rounded bg-red-50 px-3 py-1.5 text-xs text-red-700">
                  {s.last_error}
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* ── Stats ───────────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {[
          {
            icon: Database,
            label: "รายการทั้งหมด",
            value: total.toLocaleString(),
            color: "text-indigo-600 bg-indigo-50",
          },
          {
            icon: Clock,
            label: "กรองปัจจุบัน",
            value: entries.length.toLocaleString(),
            color: "text-blue-600 bg-blue-50",
          },
          {
            icon: ShieldCheck,
            label: "ตารางที่คุ้มครอง",
            value: KNOWN_TABLES.length,
            color: "text-emerald-600 bg-emerald-50",
          },
          {
            icon: Truck,
            label: "รอส่ง (Axiom)",
            value: (shipping[0]?.unshipped ?? "—").toLocaleString(),
            color: "text-amber-600 bg-amber-50",
          },
        ].map(({ icon: Icon, label, value, color }) => (
          <div
            key={label}
            className="flex items-center gap-3 rounded-xl border border-gray-200 bg-white p-4"
          >
            <div className={`flex h-9 w-9 items-center justify-center rounded-lg ${color}`}>
              <Icon className="h-4.5 w-4.5" />
            </div>
            <div>
              <div className="text-lg font-semibold leading-tight text-gray-900">{value}</div>
              <div className="text-xs text-gray-500">{label}</div>
            </div>
          </div>
        ))}
      </div>

      {/* ── Filters ─────────────────────────────────────────────────── */}
      <div className="flex flex-wrap items-end gap-2 rounded-xl border border-gray-200 bg-white p-4">
        <div className="w-52">
          <p className="mb-1 text-xs font-medium text-gray-600">ตาราง</p>
          <CustomSelect value={fTable} onChange={setFTable} options={TABLE_OPTIONS} />
        </div>
        <div className="w-44">
          <p className="mb-1 text-xs font-medium text-gray-600">Action</p>
          <CustomSelect value={fAction} onChange={setFAction} options={ACTION_OPTIONS} />
        </div>
        <div className="w-40">
          <p className="mb-1 text-xs font-medium text-gray-600">วันที่เริ่ม</p>
          <ThaiDatePicker value={fFrom} onChange={setFFrom} placeholder="เริ่มต้น" />
        </div>
        <div className="w-40">
          <p className="mb-1 text-xs font-medium text-gray-600">วันที่สิ้นสุด</p>
          <ThaiDatePicker value={fTo} onChange={setFTo} placeholder="สิ้นสุด" />
        </div>
        <div className="flex items-center gap-2 pt-5">
          <Button onClick={applyFilters} disabled={loading} size="sm">
            {loading ? "กำลังโหลด…" : "ค้นหา"}
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              setFTable("");
              setFAction("");
              setFFrom("");
              setFTo("");
              url.commit({});
            }}
          >
            ล้าง
          </Button>
          <Button variant="outline" size="sm" onClick={handleExport}>
            <Download className="mr-1.5 h-3.5 w-3.5" />
            CSV
          </Button>
        </div>
      </div>

      {error && (
        <div className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">
          {error}
        </div>
      )}

      {/* ── Table ───────────────────────────────────────────────────── */}
      <Table dense>
        <TableHeader>
          <TableRow>
            <TableHead align="right">#</TableHead>
            <TableHead>วันเวลา (BKK)</TableHead>
            <TableHead>Action</TableHead>
            <TableHead>ตาราง</TableHead>
            <TableHead>ผู้ทำ</TableHead>
            <TableHead>ฟิลด์ที่เปลี่ยน</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {loading ? (
            <TableLoading colSpan={6} />
          ) : entries.length === 0 ? (
            <TableEmpty colSpan={6}>ไม่พบรายการ</TableEmpty>
          ) : (
            entries.map((e) => (
              <TableRow key={e.id} clickable onClick={() => openDetail(e.id)}>
                <TableCell align="right" tabular className="text-xs text-gray-400">
                  {e.sequence_no}
                </TableCell>
                <TableCell className="text-xs text-gray-600">{fmtTs(e.logged_at)}</TableCell>
                <TableCell>
                  <StatusBadge tone={actionTone(e.action)}>{e.action}</StatusBadge>
                </TableCell>
                <TableCell className="font-mono text-xs text-gray-700">{e.table_name}</TableCell>
                <TableCell className="text-xs text-gray-700">{actorLabel(e)}</TableCell>
                <TableCell>
                  {(e.diff_keys ?? []).length > 0 ? (
                    <div className="flex gap-1">
                      {(e.diff_keys ?? []).map((k) => (
                        <span
                          key={k}
                          className="whitespace-nowrap rounded bg-slate-100 px-1.5 py-0.5 text-xs text-slate-600"
                        >
                          {k}
                        </span>
                      ))}
                    </div>
                  ) : (
                    <span className="text-xs text-gray-400">—</span>
                  )}
                </TableCell>
              </TableRow>
            ))
          )}
        </TableBody>
      </Table>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between px-1">
          <span className="text-xs text-gray-500">
            รายการ {(page - 1) * LIMIT + 1}–{Math.min(page * LIMIT, total)} จาก{" "}
            {total.toLocaleString()}
          </span>
          <div className="flex items-center gap-1">
            <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => load(page - 1)}>
              ‹
            </Button>
            <span className="px-2 text-xs text-gray-600">
              {page} / {totalPages}
            </span>
            <Button
              variant="outline"
              size="sm"
              disabled={page >= totalPages}
              onClick={() => load(page + 1)}
            >
              ›
            </Button>
          </div>
        </div>
      )}

      {/* ── Integrity Check ─────────────────────────────────────────── */}
      <div className="space-y-4 rounded-2xl border border-gray-200 bg-white p-5">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <ShieldCheck className="h-4.5 w-4.5 text-indigo-500" />
            <p className="text-sm font-semibold text-gray-800">ตรวจสอบความสมบูรณ์ของ Hash Chain</p>
          </div>
          <p className="text-xs text-gray-500">verify_audit_chain()</p>
        </div>

        <div className="flex flex-wrap items-end gap-3">
          <div className="w-60">
            <p className="mb-1 text-xs font-medium text-gray-600">เลือกตาราง</p>
            <CustomSelect
              value={verifyTable}
              onChange={setVerifyTable}
              options={KNOWN_TABLES.map((t) => ({ value: t, label: t }))}
            />
          </div>
          <Button onClick={runVerify} disabled={verifying || !verifyTable}>
            {verifying ? "กำลังตรวจสอบ…" : "ตรวจสอบ"}
          </Button>
        </div>

        {verifyResult && (
          <div
            className={`rounded-xl border p-4 ${
              verifyResult.ok ? "border-emerald-200 bg-emerald-50" : "border-red-200 bg-red-50"
            }`}
          >
            <div className="mb-2 flex items-center gap-2">
              {verifyResult.ok ? (
                <CheckCircle2 className="h-4.5 w-4.5 text-emerald-600" />
              ) : (
                <AlertCircle className="h-4.5 w-4.5 text-red-600" />
              )}
              <p
                className={`text-sm font-semibold ${verifyResult.ok ? "text-emerald-800" : "text-red-800"}`}
              >
                {verifyResult.ok
                  ? `✓ Hash Chain สมบูรณ์ — ${verifyResult.total.toLocaleString()} รายการ, ไม่พบการแก้ไข`
                  : `⚠ พบ ${verifyResult.broken} รายการที่ chain_hash ไม่ตรง จาก ${verifyResult.total.toLocaleString()} รายการ`}
              </p>
            </div>

            {/* Show broken entries if any */}
            {verifyResult.broken > 0 && (
              <div className="mt-3 space-y-1">
                <p className="mb-2 text-xs font-semibold text-red-700">รายการที่มีปัญหา:</p>
                {verifyResult.entries
                  .filter((r) => !r.ok)
                  .slice(0, 20)
                  .map((r) => (
                    <div
                      key={r.seq_no}
                      className="rounded border border-red-200 bg-white px-3 py-2 font-mono text-xs"
                    >
                      <span className="font-semibold text-red-700">seq #{r.seq_no}</span>
                      <span className="ml-3 text-gray-500">stored: </span>
                      <span className="text-gray-700">{r.chain_hash.slice(0, 16)}…</span>
                      <span className="ml-3 text-gray-500">expected: </span>
                      <span className="text-red-600">{r.expected.slice(0, 16)}…</span>
                    </div>
                  ))}
                {verifyResult.broken > 20 && (
                  <p className="mt-1 text-xs text-red-500">
                    … และอีก {verifyResult.broken - 20} รายการ
                  </p>
                )}
              </div>
            )}
          </div>
        )}
      </div>

      {/* ── Detail Dialog ────────────────────────────────────────────── */}
      <Dialog
        open={!!detail || detailLoading}
        onOpenChange={(o) => {
          if (!o) setDetail(null);
        }}
      >
        <DialogContent size="xl">
          <DialogHeader>
            <DialogTitle>รายละเอียด Audit Entry</DialogTitle>
          </DialogHeader>

          <DialogBody>
            {detailLoading && <p className="py-8 text-center text-sm text-gray-500">กำลังโหลด…</p>}

            {detail && (
              <div className="space-y-4 text-sm">
                {/* Meta */}
                <div className="grid grid-cols-2 gap-3">
                  {(
                    [
                      ["Sequence #", String(detail.sequence_no), false],
                      ["Action", detail.action, false],
                      ["ตาราง", detail.table_name, false],
                      ["Record ID", detail.record_id ?? "—", !!detail.record_id],
                      ["Actor", actorLabel(detail), false],
                      ["Org ID", detail.org_id ?? "—", !!detail.org_id],
                      ["IP Address", detail.ip_address ?? "—", false],
                      [
                        "User Agent",
                        detail.user_agent ? detail.user_agent.slice(0, 40) + "…" : "—",
                        false,
                      ],
                      ["Request ID", detail.request_id ?? "—", !!detail.request_id],
                      ["วันเวลา", fmtTs(detail.logged_at), false],
                    ] as [string, string, boolean][]
                  ).map(([k, v, copyable]) => (
                    <div key={k} className="min-w-0 space-y-0.5">
                      <p className="text-xs font-medium text-gray-500">{k}</p>
                      {copyable ? (
                        <CopyInline value={v} className="text-xs text-gray-800" />
                      ) : (
                        <p className="break-all font-mono text-xs text-gray-800">{v}</p>
                      )}
                    </div>
                  ))}
                </div>

                {/* Diff keys */}
                {(detail.diff_keys ?? []).length > 0 && (
                  <div>
                    <p className="mb-1.5 text-xs font-semibold text-gray-600">
                      ��ิลด์ที่เปลี่ยนแปลง
                    </p>
                    <div className="flex flex-wrap gap-1.5">
                      {(detail.diff_keys ?? []).map((k) => (
                        <span
                          key={k}
                          className="rounded-full border border-blue-200 bg-blue-50 px-2.5 py-0.5 text-xs font-medium text-blue-700"
                        >
                          {k}
                        </span>
                      ))}
                    </div>
                  </div>
                )}

                {/* Hash info */}
                <div className="space-y-1.5 rounded-lg border border-gray-200 bg-gray-50 p-3">
                  <p className="text-xs font-semibold text-gray-600">Hash Chain</p>
                  <div className="flex min-w-0 items-center gap-1 text-xs text-gray-700">
                    <span className="shrink-0 text-gray-400">payload:</span>
                    <CopyInline value={detail.payload_hash} className="min-w-0 text-gray-700" />
                  </div>
                  <div className="flex min-w-0 items-center gap-1 text-xs text-gray-700">
                    <span className="shrink-0 text-gray-400">chain:</span>
                    <CopyInline value={detail.chain_hash} className="min-w-0 text-gray-700" />
                  </div>
                </div>

                {/* Old data */}
                {detail.old_data && (
                  <div>
                    <p className="mb-1.5 text-xs font-semibold text-gray-600">
                      ข้อมูลก่อนแก้ไข (old_data)
                    </p>
                    <pre className="overflow-x-auto whitespace-pre-wrap rounded-lg border border-gray-200 bg-gray-50 p-3 text-xs text-gray-700">
                      {JSON.stringify(detail.old_data, null, 2)}
                    </pre>
                  </div>
                )}

                {/* New data */}
                {detail.new_data && (
                  <div>
                    <p className="mb-1.5 text-xs font-semibold text-gray-600">
                      ข้อมูลหลังแก้ไข (new_data)
                    </p>
                    <pre className="overflow-x-auto whitespace-pre-wrap rounded-lg border border-gray-200 bg-gray-50 p-3 text-xs text-gray-700">
                      {JSON.stringify(detail.new_data, null, 2)}
                    </pre>
                  </div>
                )}
              </div>
            )}
          </DialogBody>
        </DialogContent>
      </Dialog>
    </AdminPage>
  );
}
