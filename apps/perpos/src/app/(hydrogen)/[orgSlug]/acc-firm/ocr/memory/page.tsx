"use client";

/**
 * ความจำของระบบ (OCR self-improvement loop) — จัดการ ocr_vendor_mappings + ดูสถิติความแม่นยำ
 *
 * ระบบเรียนรู้เองจากทุกครั้งที่นักบัญชี "อนุมัติ" ร่างสมุดรายวัน (ผู้ขาย → บัญชีเดบิตหลัก)
 * หน้านี้ทำให้ความจำนั้น "มองเห็น + แก้ได้" แทนที่จะเป็นกล่องดำ
 *
 * Pattern เดียวกับหน้า acc-firm อื่น: client component + เรียก API ที่ guard ด้วย
 * requireModuleMember (firm member ไม่ได้เป็นสมาชิก client org จึงใช้ RLS ตรง ๆ ไม่ได้)
 */

import { useEffect, useState, useCallback, useMemo } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { toast } from "react-hot-toast";
import { Brain, Trash2, TrendingUp, Pencil, CheckCircle2 } from "lucide-react";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import { PageShell } from "@/components/ui/page-shell";
import { StatCard } from "@/components/ui/stat-card";
import { Button } from "@/components/ui/button";
import { CustomSelect } from "@/components/ui/custom-select";
import { Label } from "@/components/ui/label";
import { StatusBadge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogBody,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
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

type Mapping = {
  id: string;
  client_org_id: string;
  client_name: string;
  vendor_name: string;
  vendor_tax_id: string | null;
  account_id: string;
  account_code: string;
  account_name: string;
  use_count: number;
  last_used_at: string;
};

type Stats = {
  total: number;
  edited: number;
  accepted: number;
  accuracy_pct: number;
  by_month: Array<{ month: string; total: number; edited: number; accuracy_pct: number }>;
};

type AccountOption = { value: string; label: string };

const THAI_MONTH = [
  "ม.ค.",
  "ก.พ.",
  "มี.ค.",
  "เม.ย.",
  "พ.ค.",
  "มิ.ย.",
  "ก.ค.",
  "ส.ค.",
  "ก.ย.",
  "ต.ค.",
  "พ.ย.",
  "ธ.ค.",
];

function formatMonth(ym: string): string {
  const [y, m] = ym.split("-");
  const idx = Number(m) - 1;
  if (Number.isNaN(idx) || !THAI_MONTH[idx]) return ym;
  return `${THAI_MONTH[idx]} ${Number(y) + 543}`;
}

export default function OcrMemoryPage() {
  const { orgSlug } = useParams<{ orgSlug: string }>();
  const supabase = useMemo(() => createSupabaseBrowserClient(), []);

  const [orgId, setOrgId] = useState("");
  const [token, setToken] = useState("");
  const [loading, setLoading] = useState(true);

  const [mappings, setMappings] = useState<Mapping[]>([]);
  const [stats, setStats] = useState<Stats | null>(null);
  const [clients, setClients] = useState<AccountOption[]>([]);
  const [filterClient, setFilterClient] = useState("");

  // Edit dialog
  const [active, setActive] = useState<Mapping | null>(null);
  const [accounts, setAccounts] = useState<AccountOption[]>([]);
  const [selectedAccount, setSelectedAccount] = useState("");
  const [loadingAccounts, setLoadingAccounts] = useState(false);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);

  // ── Load mappings + stats ────────────────────────────────────────────────────
  const fetchMemory = useCallback(async (firmId: string, accessToken: string, clientId: string) => {
    setLoading(true);
    try {
      const qs = new URLSearchParams({ firmOrgId: firmId });
      if (clientId) qs.set("clientOrgId", clientId);
      const res = await fetch(`/api/acc-firm/ocr/mappings?${qs.toString()}`, {
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      if (!res.ok) {
        const e = await res.json().catch(() => null);
        toast.error(e?.error?.message || "โหลดความจำของระบบไม่สำเร็จ");
        return;
      }
      const payload = await res.json();
      setMappings(payload?.data?.mappings ?? []);
      setStats(payload?.data?.stats ?? null);
    } catch {
      toast.error("โหลดความจำของระบบไม่สำเร็จ");
    } finally {
      setLoading(false);
    }
  }, []);

  // ── Init ─────────────────────────────────────────────────────────────────────
  const init = useCallback(async () => {
    const [{ data: org }, { data: sess }] = await Promise.all([
      supabase.from("organizations").select("id").eq("slug", orgSlug).single(),
      supabase.auth.getSession(),
    ]);
    if (!org || !sess.session) {
      setLoading(false);
      return;
    }
    const accessToken = sess.session.access_token;
    setOrgId(org.id);
    setToken(accessToken);

    const clientsRes = await fetch(`/api/acc-firm/clients?orgId=${org.id}`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    if (clientsRes.ok) {
      const json = await clientsRes.json();
      setClients(
        (json.clients ?? json.data?.clients ?? []).map(
          (c: { client_org: { id: string; name: string } }) => ({
            value: c.client_org.id,
            label: c.client_org.name,
          }),
        ),
      );
    }
    await fetchMemory(org.id, accessToken, "");
  }, [supabase, orgSlug, fetchMemory]);

  useEffect(() => {
    init();
  }, [init]);

  const handleFilterChange = (value: string) => {
    setFilterClient(value);
    if (orgId && token) fetchMemory(orgId, token, value);
  };

  // ── Open edit dialog (โหลดผังบัญชีของลูกค้ารายนั้น) ────────────────────────────
  const openEdit = async (m: Mapping) => {
    setActive(m);
    setSelectedAccount(m.account_id);
    setAccounts([]);
    setLoadingAccounts(true);
    try {
      const res = await fetch(
        `/api/acc-firm/ocr/client-context?firmOrgId=${orgId}&clientOrgId=${m.client_org_id}`,
        { headers: { Authorization: `Bearer ${token}` } },
      );
      if (res.ok) {
        const json = await res.json();
        const coa = json?.data?.chart_of_accounts ?? json?.chart_of_accounts ?? [];
        setAccounts(
          coa.map((a: { id: string; code: string; name: string }) => ({
            value: a.id,
            label: `${a.code} — ${a.name}`,
          })),
        );
      } else {
        toast.error("โหลดผังบัญชีของลูกค้าไม่สำเร็จ");
      }
    } catch {
      toast.error("โหลดผังบัญชีของลูกค้าไม่สำเร็จ");
    } finally {
      setLoadingAccounts(false);
    }
  };

  const handleSave = async () => {
    if (!active || !selectedAccount) return;
    setSaving(true);
    try {
      const res = await fetch("/api/acc-firm/ocr/mappings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          firmOrgId: orgId,
          mappingId: active.id,
          debitAccountId: selectedAccount,
        }),
      });
      if (!res.ok) {
        const e = await res.json().catch(() => null);
        toast.error(e?.error?.message || "แก้ไขไม่สำเร็จ");
        return;
      }
      toast.success("แก้ไขความจำเรียบร้อย — บิลใบถัดไปจากผู้ขายรายนี้จะใช้บัญชีใหม่");
      setActive(null);
      await fetchMemory(orgId, token, filterClient);
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!active) return;
    setDeleting(true);
    try {
      const res = await fetch("/api/acc-firm/ocr/mappings", {
        method: "DELETE",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ firmOrgId: orgId, mappingId: active.id }),
      });
      if (!res.ok) {
        const e = await res.json().catch(() => null);
        toast.error(e?.error?.message || "ลบไม่สำเร็จ");
        return;
      }
      toast.success("ลบความจำเรียบร้อย — ผู้ขายรายนี้จะถูกวิเคราะห์ใหม่ตั้งแต่ต้น");
      setActive(null);
      await fetchMemory(orgId, token, filterClient);
    } finally {
      setDeleting(false);
    }
  };

  const accuracyTone =
    !stats || stats.total === 0
      ? "neutral"
      : stats.accuracy_pct >= 80
        ? "positive"
        : stats.accuracy_pct >= 50
          ? "warning"
          : "negative";

  return (
    <PageShell
      width="full"
      icon={<Brain className="h-6 w-6" />}
      title="ความจำของระบบ"
      description="ผู้ขายที่ระบบจดจำได้จากการอนุมัติของนักบัญชี — แก้ได้เมื่อจำผิด"
    >
      {/* สถิติความแม่นยำ */}
      <div className="mb-5 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          icon={<Brain className="h-4 w-4" />}
          label="ผู้ขายที่จำได้"
          value={mappings.length.toLocaleString("th-TH")}
          sub="ยิ่งมาก ยิ่งกรอกเองน้อยลง"
          tone="info"
        />
        <StatCard
          icon={<TrendingUp className="h-4 w-4" />}
          label="AI ถูกเลย (ไม่ต้องแก้)"
          value={stats && stats.total > 0 ? `${stats.accuracy_pct}%` : "—"}
          sub={
            stats && stats.total > 0
              ? `จากที่อนุมัติแล้ว ${stats.total} ใบ`
              : "ยังไม่มีข้อมูลอนุมัติ"
          }
          tone={accuracyTone}
          valueColored
        />
        <StatCard
          icon={<CheckCircle2 className="h-4 w-4" />}
          label="รับได้เลย"
          value={stats ? stats.accepted.toLocaleString("th-TH") : "0"}
          sub="ใบที่ไม่ต้องแก้อะไร"
          tone="positive"
        />
        <StatCard
          icon={<Pencil className="h-4 w-4" />}
          label="ต้องแก้"
          value={stats ? stats.edited.toLocaleString("th-TH") : "0"}
          sub="ทุกครั้งที่แก้ = ระบบได้เรียนรู้"
          tone="warning"
        />
      </div>

      {/* เทรนด์รายเดือน */}
      {stats && stats.by_month.length > 0 && (
        <div className="mb-5">
          <div className="mb-2.5 px-1 text-sm font-semibold text-gray-900">ความแม่นยำรายเดือน</div>
          <Table className="shadow-sm">
            <TableHeader>
              <TableRow>
                <TableHead>เดือน</TableHead>
                <TableHead align="right">อนุมัติ (ใบ)</TableHead>
                <TableHead align="right">ต้องแก้ (ใบ)</TableHead>
                <TableHead align="right">AI ถูกเลย</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {stats.by_month.map((m) => (
                <TableRow key={m.month}>
                  <TableCell>{formatMonth(m.month)}</TableCell>
                  <TableCell align="right" tabular>
                    {m.total}
                  </TableCell>
                  <TableCell align="right" tabular>
                    {m.edited}
                  </TableCell>
                  <TableCell align="right" className="font-semibold tabular-nums">
                    {m.accuracy_pct}%
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      {/* ตัวกรองลูกค้า */}
      <div className="mb-3 flex items-center gap-2">
        <Label className="shrink-0 text-xs text-gray-500">ลูกค้า</Label>
        <CustomSelect
          value={filterClient}
          onChange={handleFilterChange}
          className="w-64"
          options={[{ value: "", label: "ทุกบริษัทลูกค้า" }, ...clients]}
        />
      </div>

      {/* ตารางความจำ */}
      <div className="mb-2.5 px-1 text-sm font-semibold text-gray-900">
        ผู้ขาย → บัญชีที่ระบบจำไว้
      </div>
      <Table className="shadow-sm">
        <TableHeader>
          <TableRow>
            <TableHead>ผู้ขาย</TableHead>
            <TableHead>เลขผู้เสียภาษี</TableHead>
            <TableHead>บริษัทลูกค้า</TableHead>
            <TableHead>บัญชีที่จำไว้</TableHead>
            <TableHead align="right">ใช้ไปแล้ว</TableHead>
            <TableHead>ใช้ล่าสุด</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {loading ? (
            <TableLoading colSpan={6} />
          ) : mappings.length === 0 ? (
            <TableEmpty colSpan={6}>
              ระบบยังไม่ได้จดจำผู้ขายรายใด — อนุมัติร่างสมุดรายวันสักใบ แล้วระบบจะเริ่มจำเอง
            </TableEmpty>
          ) : (
            mappings.map((m) => (
              <TableRow key={m.id} clickable onClick={() => openEdit(m)}>
                <TableCell className="font-semibold text-gray-800">{m.vendor_name}</TableCell>
                <TableCell className="tabular-nums text-gray-500">
                  {m.vendor_tax_id || "—"}
                </TableCell>
                <TableCell className="text-gray-600">{m.client_name}</TableCell>
                <TableCell>
                  <StatusBadge tone="info">
                    {m.account_code} — {m.account_name}
                  </StatusBadge>
                </TableCell>
                <TableCell align="right" className="tabular-nums">
                  {m.use_count} ครั้ง
                </TableCell>
                <TableCell className="text-xs text-gray-400">
                  {new Date(m.last_used_at).toLocaleDateString("th-TH")}
                </TableCell>
              </TableRow>
            ))
          )}
        </TableBody>
      </Table>

      {/* Dialog แก้ไข/ลบความจำ */}
      <Dialog open={!!active} onOpenChange={(o) => !o && setActive(null)}>
        <DialogContent size="lg">
          <DialogHeader>
            <DialogTitle>แก้ไขความจำของระบบ</DialogTitle>
          </DialogHeader>
          <DialogBody>
            <div className="space-y-4">
              <div className="rounded-xl border border-gray-200 bg-gray-50 p-3.5 text-sm">
                <div className="font-semibold text-gray-900">{active?.vendor_name}</div>
                <div className="mt-1 text-xs text-gray-500">
                  เลขผู้เสียภาษี {active?.vendor_tax_id || "—"} · บริษัทลูกค้า {active?.client_name}{" "}
                  · ใช้ความจำนี้ไปแล้ว {active?.use_count} ครั้ง
                </div>
              </div>

              <div>
                <Label htmlFor="acc">บัญชีเดบิตหลักที่จะใช้กับผู้ขายรายนี้ *</Label>
                <div className="mt-1">
                  <CustomSelect
                    value={selectedAccount}
                    onChange={setSelectedAccount}
                    options={
                      loadingAccounts
                        ? [{ value: "", label: "กำลังโหลดผังบัญชี…" }]
                        : [{ value: "", label: "— เลือกบัญชี —" }, ...accounts]
                    }
                  />
                </div>
                <p className="mt-1 text-xs text-gray-500">
                  บิลใบถัดไปจากผู้ขายรายนี้จะถูกจัดประเภทเข้าบัญชีนี้โดยอัตโนมัติ
                  (นักบัญชียังต้องกดอนุมัติทุกใบเช่นเดิม)
                </p>
              </div>
            </div>
          </DialogBody>
          <DialogFooter>
            <Button
              variant="destructive"
              className="mr-auto"
              disabled={deleting || saving}
              onClick={handleDelete}
            >
              <Trash2 className="mr-1.5 h-4 w-4" />
              {deleting ? "กำลังลบ…" : "ลบความจำนี้"}
            </Button>
            <Button variant="outline" onClick={() => setActive(null)} disabled={saving || deleting}>
              ยกเลิก
            </Button>
            <Button
              onClick={handleSave}
              disabled={
                saving || deleting || !selectedAccount || selectedAccount === active?.account_id
              }
            >
              {saving ? "กำลังบันทึก…" : "บันทึก"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </PageShell>
  );
}
