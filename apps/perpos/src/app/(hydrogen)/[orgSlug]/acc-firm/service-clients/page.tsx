"use client";

import React, { useCallback, useEffect, useMemo, useState } from "react";
import { useParams } from "next/navigation";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogBody,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { StatusBadge } from "@/components/ui/badge";
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
import { Plus, Check, Users } from "lucide-react";
import { PageShell } from "@/components/ui/page-shell";
import type { ServiceClient } from "@/app/api/acc-firm/service-clients/route";

const SERVICE_FLAGS: { key: keyof ServiceClient; label: string }[] = [
  { key: "svc_invoice", label: "Inv." },
  { key: "svc_billing", label: "Billing" },
  { key: "svc_expense", label: "Expense" },
  { key: "svc_sso", label: "SSO" },
  { key: "svc_pp30", label: "PP.30" },
  { key: "svc_pnd", label: "PND1,3,53" },
  { key: "svc_pnd51", label: "PND.51" },
  { key: "svc_pnd50", label: "PND.50" },
  { key: "svc_close_f", label: "Close F." },
];

const EMPTY_FORM = {
  client_code: "",
  company_name: "",
  fee_2023: "",
  fee_2024: "",
  fee_2025: "",
  fee_2026: "",
  billing_note: "",
  svc_invoice: false,
  svc_billing: false,
  svc_expense: false,
  svc_sso: false,
  svc_pp30: false,
  svc_pnd: false,
  svc_pnd51: false,
  svc_pnd50: false,
  svc_close_f: false,
  note: "",
  is_active: true,
};

type FormState = typeof EMPTY_FORM;

function fmtFee(v: number | null) {
  if (v == null || v === 0) return "—";
  return v.toLocaleString("th-TH", { minimumFractionDigits: 0 });
}

export default function ServiceClientsPage() {
  const { orgSlug } = useParams<{ orgSlug: string }>();
  const supabase = useMemo(() => createSupabaseBrowserClient(), []);

  const [orgId, setOrgId] = useState("");
  const [token, setToken] = useState("");
  const [clients, setClients] = useState<ServiceClient[]>([]);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState("");
  const [showInactive, setShowInactive] = useState(false);

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<ServiceClient | null>(null);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [saving, setSaving] = useState(false);

  // Init: resolve org
  useEffect(() => {
    (async () => {
      const [{ data: org }, { data: sess }] = await Promise.all([
        supabase.from("organizations").select("id").eq("slug", orgSlug).single(),
        supabase.auth.getSession(),
      ]);
      if (org) setOrgId(org.id);
      if (sess?.session) setToken(sess.session.access_token);
    })();
  }, [supabase, orgSlug]);

  const load = useCallback(async () => {
    if (!orgId || !token) return;
    setLoading(true);
    const res = await fetch(`/api/acc-firm/service-clients?orgId=${orgId}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (res.ok) setClients(await res.json());
    setLoading(false);
  }, [orgId, token]);

  useEffect(() => {
    load();
  }, [load]);

  function openAdd() {
    setEditing(null);
    setForm(EMPTY_FORM);
    setDialogOpen(true);
  }

  function openEdit(c: ServiceClient) {
    setEditing(c);
    setForm({
      client_code: c.client_code,
      company_name: c.company_name,
      fee_2023: c.fee_2023 != null ? String(c.fee_2023) : "",
      fee_2024: c.fee_2024 != null ? String(c.fee_2024) : "",
      fee_2025: c.fee_2025 != null ? String(c.fee_2025) : "",
      fee_2026: c.fee_2026 != null ? String(c.fee_2026) : "",
      billing_note: c.billing_note ?? "",
      svc_invoice: c.svc_invoice,
      svc_billing: c.svc_billing,
      svc_expense: c.svc_expense,
      svc_sso: c.svc_sso,
      svc_pp30: c.svc_pp30,
      svc_pnd: c.svc_pnd,
      svc_pnd51: c.svc_pnd51,
      svc_pnd50: c.svc_pnd50,
      svc_close_f: c.svc_close_f,
      note: c.note ?? "",
      is_active: c.is_active,
    });
    setDialogOpen(true);
  }

  async function save() {
    if (!orgId || !form.client_code || !form.company_name) return;
    setSaving(true);

    const body = editing ? { orgId, id: editing.id, ...form } : { orgId, ...form };

    const res = await fetch("/api/acc-firm/service-clients", {
      method: editing ? "PATCH" : "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify(body),
    });
    setSaving(false);
    if (res.ok) {
      setDialogOpen(false);
      load();
    }
  }

  function toggleFlag(key: keyof FormState) {
    setForm((f) => ({ ...f, [key]: !f[key as keyof typeof f] }));
  }

  const filtered = clients.filter((c) => {
    if (!showInactive && !c.is_active) return false;
    if (search) {
      const q = search.toLowerCase();
      return c.company_name.toLowerCase().includes(q) || c.client_code.toLowerCase().includes(q);
    }
    return true;
  });

  // Current CE year → map to fee column
  const year = new Date().getFullYear();
  const feeKey = `fee_${year}` as keyof ServiceClient;
  const totalRevenue = filtered.reduce((s, c) => s + Number(c[feeKey] ?? 0), 0);

  return (
    <PageShell
      width="wide"
      icon={<Users className="h-6 w-6" />}
      title="ลูกค้าบริการ"
      description="รายชื่อลูกค้าที่ใช้บริการสำนักงานบัญชี"
      actions={
        <Button onClick={openAdd}>
          <Plus className="mr-1 h-4 w-4" /> เพิ่มลูกค้า
        </Button>
      }
    >
      {/* Stats */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        <StatCard label="ลูกค้าทั้งหมด" value={filtered.length} unit="ราย" />
        <StatCard
          label={`ค่าบริการปี ${year + 543}`}
          value={totalRevenue}
          unit="บาท/เดือน"
          isMoney
        />
        <StatCard
          label="ลูกค้าใช้งาน"
          value={filtered.filter((c) => c.is_active).length}
          unit="ราย"
        />
      </div>

      {/* Filters */}
      <div className="flex items-center gap-3">
        <Input
          placeholder="ค้นหาชื่อบริษัท / รหัส..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="max-w-sm"
        />
        <label className="flex cursor-pointer select-none items-center gap-2 text-sm text-gray-600">
          <input
            type="checkbox"
            checked={showInactive}
            onChange={(e) => setShowInactive(e.target.checked)}
            className="rounded"
          />
          แสดงที่ยกเลิกแล้ว
        </label>
      </div>

      {/* Table */}
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>รหัส</TableHead>
            <TableHead>บริษัท</TableHead>
            <TableHead align="right">2566</TableHead>
            <TableHead align="right">2567</TableHead>
            <TableHead align="right">2568</TableHead>
            <TableHead align="right">2569</TableHead>
            <TableHead>บริการ</TableHead>
            <TableHead>หมายเหตุ</TableHead>
            <TableHead>สถานะ</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {loading ? (
            <TableLoading colSpan={9} />
          ) : filtered.length === 0 ? (
            <TableEmpty colSpan={9}>ไม่พบรายการ</TableEmpty>
          ) : (
            filtered.map((c) => (
              <TableRow
                key={c.id}
                clickable
                onClick={() => openEdit(c)}
                className={!c.is_active ? "opacity-50" : ""}
              >
                <TableCell>
                  <span className="rounded bg-gray-100 px-1.5 py-0.5 font-mono text-xs">
                    {c.client_code}
                  </span>
                </TableCell>
                <TableCell className="max-w-[240px] font-medium text-gray-800">
                  <div className="truncate" title={c.company_name}>
                    {c.company_name}
                  </div>
                  {c.billing_note && (
                    <div className="truncate text-xs text-gray-400">{c.billing_note}</div>
                  )}
                </TableCell>
                <TableCell align="right" tabular className="text-xs text-gray-500">
                  {fmtFee(c.fee_2023)}
                </TableCell>
                <TableCell align="right" tabular className="text-xs text-gray-500">
                  {fmtFee(c.fee_2024)}
                </TableCell>
                <TableCell align="right" tabular className="text-xs font-medium text-gray-700">
                  {fmtFee(c.fee_2025)}
                </TableCell>
                <TableCell align="right" tabular className="text-xs font-semibold text-blue-700">
                  {fmtFee(c.fee_2026)}
                </TableCell>
                <TableCell>
                  <ServiceFlags client={c} />
                </TableCell>
                <TableCell
                  className="max-w-[160px] truncate text-xs text-gray-500"
                  title={c.note ?? ""}
                >
                  {c.note || "—"}
                </TableCell>
                <TableCell>
                  <StatusBadge tone={c.is_active ? "success" : "neutral"}>
                    {c.is_active ? "ใช้งาน" : "ยกเลิก"}
                  </StatusBadge>
                </TableCell>
              </TableRow>
            ))
          )}
        </TableBody>
      </Table>

      {/* Add/Edit Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent size="xl">
          <DialogHeader>
            <DialogTitle>{editing ? "แก้ไขลูกค้า" : "เพิ่มลูกค้าบริการ"}</DialogTitle>
          </DialogHeader>

          <DialogBody>
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label>รหัสลูกค้า *</Label>
                  <Input
                    value={form.client_code}
                    onChange={(e) => setForm((f) => ({ ...f, client_code: e.target.value }))}
                    placeholder="เช่น IN01, C01"
                  />
                </div>
                <div className="col-span-2">
                  <Label>ชื่อบริษัท *</Label>
                  <Input
                    value={form.company_name}
                    onChange={(e) => setForm((f) => ({ ...f, company_name: e.target.value }))}
                    placeholder="บริษัท ... จำกัด"
                  />
                </div>
              </div>

              {/* Fees */}
              <div>
                <p className="mb-2 text-sm font-medium text-gray-700">ค่าบริการรายเดือน (บาท)</p>
                <div className="grid grid-cols-4 gap-3">
                  {([2023, 2024, 2025, 2026] as const).map((y) => (
                    <div key={y}>
                      <Label className="text-xs">ปี {y + 543}</Label>
                      <Input
                        type="number"
                        value={(form as Record<string, unknown>)[`fee_${y}`] as string}
                        onChange={(e) => setForm((f) => ({ ...f, [`fee_${y}`]: e.target.value }))}
                        placeholder="0"
                      />
                    </div>
                  ))}
                </div>
              </div>

              <div>
                <Label>หมายเหตุค่าบริการ</Label>
                <Input
                  value={form.billing_note}
                  onChange={(e) => setForm((f) => ({ ...f, billing_note: e.target.value }))}
                  placeholder="เช่น รายปี 15000"
                />
              </div>

              {/* Service flags */}
              <div>
                <p className="mb-2 text-sm font-medium text-gray-700">บริการที่ให้</p>
                <div className="flex flex-wrap gap-2">
                  {SERVICE_FLAGS.map(({ key, label }) => {
                    const on = form[key as keyof FormState] as boolean;
                    return (
                      <button
                        key={key}
                        type="button"
                        onClick={() => toggleFlag(key as keyof FormState)}
                        className={`rounded-lg border px-3 py-1.5 text-sm font-medium transition-colors ${
                          on
                            ? "border-blue-600 bg-blue-600 text-white"
                            : "border-gray-200 bg-white text-gray-600 hover:border-blue-300"
                        }`}
                      >
                        {label}
                      </button>
                    );
                  })}
                </div>
              </div>

              <div>
                <Label>หมายเหตุ</Label>
                <Input
                  value={form.note}
                  onChange={(e) => setForm((f) => ({ ...f, note: e.target.value }))}
                  placeholder="หมายเหตุเพิ่มเติม"
                />
              </div>

              {editing && (
                <label className="flex cursor-pointer items-center gap-2">
                  <input
                    type="checkbox"
                    checked={form.is_active}
                    onChange={(e) => setForm((f) => ({ ...f, is_active: e.target.checked }))}
                    className="rounded"
                  />
                  <span className="text-sm text-gray-700">ใช้งาน (Active)</span>
                </label>
              )}
            </div>
          </DialogBody>

          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>
              ยกเลิก
            </Button>
            <Button onClick={save} disabled={saving || !form.client_code || !form.company_name}>
              {saving ? "กำลังบันทึก…" : "บันทึก"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </PageShell>
  );
}

function ServiceFlags({ client }: { client: ServiceClient }) {
  const active = SERVICE_FLAGS.filter(({ key }) => client[key] as boolean);
  if (active.length === 0) return <span className="text-xs text-gray-300">—</span>;
  return (
    <div className="flex gap-1">
      {active.map(({ key, label }) => (
        <span
          key={key}
          className="inline-flex items-center gap-0.5 whitespace-nowrap rounded bg-green-50 px-1.5 py-0.5 text-xs text-green-700"
        >
          <Check className="h-2.5 w-2.5" /> {label}
        </span>
      ))}
    </div>
  );
}

function StatCard({
  label,
  value,
  unit,
  isMoney,
}: {
  label: string;
  value: number;
  unit: string;
  isMoney?: boolean;
}) {
  return (
    <div className="rounded-xl border bg-white p-4">
      <p className="mb-1 text-xs text-gray-500">{label}</p>
      <p className="text-xl font-bold text-gray-900">
        {isMoney ? value.toLocaleString("th-TH") : value}
        <span className="ml-1 text-sm font-normal text-gray-500">{unit}</span>
      </p>
    </div>
  );
}
