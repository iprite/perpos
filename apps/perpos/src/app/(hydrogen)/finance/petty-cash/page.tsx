"use client";

import React, { useCallback, useMemo, useRef, useState } from "react";
import dayjs from "dayjs";
import toast from "react-hot-toast";
import Link from "next/link";
import { Button, Input } from "rizzui";
import { Title, Text } from "rizzui/typography";
import AppSelect from "@core/ui/app-select";
import { Modal } from "@core/modal-views/modal";
import { Pencil, Trash2 } from "lucide-react";
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

import { useAuth } from "@/app/shared/auth-provider";
import { useConfirmDialog } from "@/app/shared/confirm-dialog/provider";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import { withBasePath } from "@/utils/base-path";

import { PettyCashTransactionModal, type PettyCashTransactionRow } from "@/components/petty-cash/petty-cash-transaction-modal";

type CategoryRow = { id: string; name: string; is_active: boolean; sort_order: number };
type SettingsRow = { id: number; low_balance_threshold: number; in_app_alert_enabled: boolean };

async function getSignedStorageUrl(params: { supabase: any; table: string; id: string; disposition: "inline" | "attachment" }) {
  const sessionRes = await params.supabase.auth.getSession();
  const token = sessionRes.data.session?.access_token;
  if (!token) throw new Error("ยังไม่ได้เข้าสู่ระบบ");
  const res = await fetch(withBasePath("/api/storage/signed-url"), {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ table: params.table, id: params.id, disposition: params.disposition }),
  });
  if (!res.ok) {
    const data = (await res.json().catch(() => ({}))) as { error?: string };
    throw new Error(data.error || "ขอ signed url ไม่สำเร็จ");
  }
  const data = (await res.json()) as { ok: true; url: string };
  return data.url;
}

function money(n: number) {
  const x = Number.isFinite(n) ? n : 0;
  return x.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export default function PettyCashPage() {
  const { role, userId } = useAuth();
  const supabase = useMemo(() => createSupabaseBrowserClient(), []);
  const confirmDialog = useConfirmDialog();
  const topRef = useRef<HTMLDivElement | null>(null);

  const canUsePage = role === "admin" || role === "sale" || role === "operation";
  const canWrite = role === "admin" || role === "operation";

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [settings, setSettings] = useState<SettingsRow | null>(null);
  const [categories, setCategories] = useState<CategoryRow[]>([]);
  const [rows, setRows] = useState<PettyCashTransactionRow[]>([]);

  const [period, setPeriod] = useState<string>("month");
  const [search, setSearch] = useState<string>("");

  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<PettyCashTransactionRow | null>(null);

  const [receiptOpen, setReceiptOpen] = useState(false);
  const [receiptLoading, setReceiptLoading] = useState(false);
  const [receiptUrl, setReceiptUrl] = useState<string | null>(null);
  const [receiptDownloadUrl, setReceiptDownloadUrl] = useState<string | null>(null);
  const [receiptError, setReceiptError] = useState<string | null>(null);

  const periodOptions = useMemo(() => {
    return [
      { value: "today", label: "วันนี้" },
      { value: "week", label: "สัปดาห์นี้" },
      { value: "month", label: "เดือนนี้" },
      { value: "year", label: "ปีนี้" },
    ];
  }, []);

  const periodStart = useMemo(() => {
    if (period === "today") return dayjs().startOf("day");
    if (period === "week") return dayjs().startOf("week");
    if (period === "year") return dayjs().startOf("year");
    return dayjs().startOf("month");
  }, [period]);

  const filteredRows = useMemo(() => {
    const q = search.trim().toLowerCase();
    const list = rows.slice().sort((a, b) => String(b.occurred_at).localeCompare(String(a.occurred_at)));
    if (!q) return list;
    return list.filter((r) => {
      const s = [r.txn_type, r.category_name, r.title, r.amount, r.occurred_at].filter(Boolean).join(" ").toLowerCase();
      return s.includes(q);
    });
  }, [rows, search]);

  const totals = useMemo(() => {
    const allTopUp = rows.filter((r) => r.txn_type === "TOP_UP").reduce((acc, r) => acc + Number(r.amount ?? 0), 0);
    const allSpend = rows.filter((r) => r.txn_type === "SPEND").reduce((acc, r) => acc + Number(r.amount ?? 0), 0);
    const balance = allTopUp - allSpend;

    const pRows = rows.filter((r) => {
      const d = dayjs(r.occurred_at);
      return d.isSame(periodStart, "day") || d.isAfter(periodStart, "day");
    });
    const pTopUp = pRows.filter((r) => r.txn_type === "TOP_UP").reduce((acc, r) => acc + Number(r.amount ?? 0), 0);
    const pSpend = pRows.filter((r) => r.txn_type === "SPEND").reduce((acc, r) => acc + Number(r.amount ?? 0), 0);

    return { balance, allTopUp, allSpend, pTopUp, pSpend };
  }, [periodStart, rows]);

  const monthlySeries = useMemo(() => {
    const start = dayjs("2026-04-01").startOf("month");
    const end = dayjs().startOf("month");
    const count = end.diff(start, "month");
    if (!Number.isFinite(count) || count < 0) return [];
    const months = Array.from({ length: count + 1 }, (_, idx) => start.add(idx, "month"));
    const byKey: Record<string, { label: string; topUp: number; spend: number }> = {};
    for (const m of months) {
      const key = m.format("YYYY-MM");
      byKey[key] = { label: m.format("MM/YY"), topUp: 0, spend: 0 };
    }
    for (const r of rows) {
      const key = dayjs(r.occurred_at).format("YYYY-MM");
      const item = byKey[key];
      if (!item) continue;
      if (r.txn_type === "TOP_UP") item.topUp += Number(r.amount ?? 0);
      if (r.txn_type === "SPEND") item.spend += Number(r.amount ?? 0);
    }
    return months.map((m) => byKey[m.format("YYYY-MM")]);
  }, [rows]);

  const lowThreshold = Number(settings?.low_balance_threshold ?? 0);
  const lowEnabled = Boolean(settings?.in_app_alert_enabled ?? true);
  const isLow = lowEnabled && totals.balance < lowThreshold;

  const loadAll = useCallback(async () => {
    if (!canUsePage) return;
    setLoading(true);
    setError(null);
    try {
      const [sRes, cRes, tRes] = await Promise.all([
        supabase.from("petty_cash_settings").select("id,low_balance_threshold,in_app_alert_enabled").eq("id", 1).single(),
        supabase.from("petty_cash_categories").select("id,name,is_active,sort_order").order("sort_order", { ascending: true }).limit(200),
        supabase
          .from("petty_cash_transactions")
            .select("id,txn_type,amount,occurred_at,category_name,title,receipt_object_path,receipt_file_name")
          .order("occurred_at", { ascending: false })
          .order("created_at", { ascending: false })
          .limit(500),
      ]);

      if (sRes.error) throw new Error(sRes.error.message);
      if (cRes.error) throw new Error(cRes.error.message);
      if (tRes.error) throw new Error(tRes.error.message);

      setSettings(sRes.data as any);
      setCategories((cRes.data ?? []) as any);
      setRows((tRes.data ?? []) as any);
      setLoading(false);
    } catch (e: any) {
      setLoading(false);
      setError(e?.message ?? "โหลดข้อมูลไม่สำเร็จ");
    }
  }, [canUsePage, supabase]);

  React.useEffect(() => {
    loadAll();
  }, [loadAll]);

  if (!canUsePage) {
    return (
      <div className="p-6">
        <Title as="h2" className="text-lg font-semibold">
          ไม่อนุญาตให้เข้าถึง
        </Title>
        <Text className="mt-1 text-sm text-gray-600">หน้านี้สำหรับทีมภายในเท่านั้น</Text>
      </div>
    );
  }

  return (
    <div className="p-6" ref={topRef}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <Title as="h2" className="text-lg font-semibold">
            เงินสดย่อย
          </Title>
          <Text className="mt-1 text-sm text-gray-600">ติดตามเติมเงิน/ใช้เงิน และยอดคงเหลือ</Text>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link href="/finance" className="inline-flex">
            <Button variant="outline">กลับไปธุรกรรมการเงิน</Button>
          </Link>
          <Link href="/finance/petty-cash/settings" className="inline-flex">
            <Button variant="outline">ตั้งค่า</Button>
          </Link>
          <Button
            disabled={loading || !canWrite}
            onClick={() => {
              setEditing(null);
              setModalOpen(true);
            }}
          >
            บันทึกรายการ
          </Button>
        </div>
      </div>

      {error ? <div className="mt-4 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">{error}</div> : null}

      <div className="mt-4 grid gap-4 md:grid-cols-2">
        <div className="rounded-xl border border-gray-200 bg-white p-4">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <div className="text-sm font-semibold text-gray-900">ยอดคงเหลือ</div>
              <div className="mt-1 text-2xl font-semibold text-gray-900">{money(totals.balance)}</div>
              <div className="mt-1 text-xs text-gray-500">อัปเดตจากรายการล่าสุด</div>
            </div>
            <div className="w-full md:w-[260px]">
              <AppSelect
                label="ช่วงเวลา"
                placeholder="-"
                options={periodOptions}
                value={period}
                onChange={(v: string) => setPeriod(String(v))}
                getOptionValue={(o) => o.value}
                displayValue={(selected) => periodOptions.find((o) => o.value === selected)?.label ?? ""}
                inPortal={false}
                selectClassName="h-10 px-3"
              />
            </div>
          </div>

          <div className="mt-4 grid grid-cols-2 gap-2 text-sm">
            <div className="rounded-lg border border-gray-200 bg-gray-50 p-3">
              <div className="text-xs font-semibold text-gray-600">เติมเงิน</div>
              <div className="mt-1 font-semibold text-gray-900">{money(totals.pTopUp)}</div>
            </div>
            <div className="rounded-lg border border-gray-200 bg-gray-50 p-3">
              <div className="text-xs font-semibold text-gray-600">ใช้เงิน</div>
              <div className="mt-1 font-semibold text-gray-900">{money(totals.pSpend)}</div>
            </div>
          </div>

          {isLow ? (
            <div className="mt-4 rounded-xl border border-red-200 bg-red-50 p-4">
              <div className="text-sm font-semibold text-red-800">เงินสดย่อยเหลือน้อย</div>
              <div className="mt-1 text-sm text-red-700">เกณฑ์แจ้งเตือน {money(lowThreshold)} • ยอดคงเหลือ {money(totals.balance)}</div>
              <div className="mt-3 flex flex-wrap gap-2">
                <Button
                  disabled={loading || !canWrite}
                  onClick={() => {
                    setEditing({ txn_type: "TOP_UP", occurred_at: dayjs().format("YYYY-MM-DD"), amount: 0, category_name: null, title: "เติมเงินสดย่อย", id: "", receipt_object_path: null, receipt_file_name: null } as any);
                    setModalOpen(true);
                  }}
                >
                  เติมเงินตอนนี้
                </Button>
                <Link href="/finance/petty-cash/settings" className="inline-flex">
                  <Button variant="outline">ปรับเกณฑ์</Button>
                </Link>
              </div>
            </div>
          ) : null}
        </div>

        <div className="rounded-xl border border-gray-200 bg-white p-4">
          <div className="flex items-center justify-between gap-2">
            <div>
              <div className="text-sm font-semibold text-gray-900">สรุปยอดรายเดือน</div>
              <div className="mt-1 text-xs text-gray-500">เริ่มตั้งแต่ 04/26 (เติมเงิน/ใช้เงิน)</div>
            </div>
          </div>
          <div className="mt-3 h-[220px]">
            {loading ? (
              <div className="h-full w-full animate-pulse rounded-lg bg-gray-100" />
            ) : monthlySeries.length === 0 ? (
              <div className="flex h-full items-center justify-center text-sm text-gray-500">ไม่มีข้อมูล</div>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={monthlySeries} margin={{ top: 8, right: 16, bottom: 8, left: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#E5E7EB" />
                  <XAxis dataKey="label" tick={{ fontSize: 12, fill: "#6B7280" }} interval={0} />
                  <YAxis tick={{ fontSize: 12, fill: "#6B7280" }} tickFormatter={(v) => `${Number(v).toLocaleString()}`} width={56} />
                  <Tooltip
                    formatter={(v: any, name: any) => [`${money(Number(v ?? 0))} บาท`, name === "topUp" ? "เติมเงิน" : "ใช้เงิน"]}
                    labelFormatter={(l) => `เดือน ${l}`}
                    contentStyle={{ borderRadius: 12, borderColor: "#E5E7EB" }}
                  />
                  <Bar dataKey="topUp" name="เติมเงิน" fill="#34D399" radius={[6, 6, 0, 0]} />
                  <Bar dataKey="spend" name="ใช้เงิน" fill="#FB7185" radius={[6, 6, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </div>
        </div>
      </div>

      <div className="mt-4 rounded-xl border border-gray-200 bg-white p-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="text-sm font-semibold text-gray-900">รายการล่าสุด</div>
          <div className="w-full max-w-md">
            <Input placeholder="ค้นหา..." value={search} onChange={(e) => setSearch(e.target.value)} disabled={loading} />
          </div>
        </div>

        <div className="mt-3 overflow-hidden rounded-lg border border-gray-200">
          <div className="grid grid-cols-[0.7fr_0.6fr_1fr_0.8fr_1.2fr_0.8fr] gap-3 bg-gray-50 px-3 py-2 text-xs font-semibold text-gray-600">
            <div>วันที่</div>
            <div>ประเภท</div>
            <div>หมวดหมู่</div>
            <div className="text-right">จำนวนเงิน</div>
            <div>รายการ</div>
            <div className="text-right">จัดการ</div>
          </div>
          {filteredRows.length === 0 ? (
            <div className="p-4 text-sm text-gray-600">ยังไม่มีรายการ</div>
          ) : (
            filteredRows.slice(0, 50).map((r) => (
              <div key={r.id} className="grid grid-cols-[0.7fr_0.6fr_1fr_0.8fr_1.2fr_0.8fr] gap-3 border-t border-gray-100 px-3 py-2 text-sm">
                <div className="text-gray-700">{r.occurred_at}</div>
                <div className="text-gray-700">{r.txn_type === "TOP_UP" ? "เติมเงิน" : "ใช้เงิน"}</div>
                <div className="truncate text-gray-700">{r.category_name ?? "-"}</div>
                <div className="text-right font-medium text-gray-900">{money(Number(r.amount ?? 0))}</div>
                <div className="truncate text-gray-700">{r.title ?? "-"}</div>
                <div className="flex justify-end gap-2">
                  {r.receipt_object_path ? (
                    <button
                      type="button"
                      className="text-sm font-medium text-gray-900 underline disabled:opacity-50"
                      disabled={loading}
                      onClick={async () => {
                        setReceiptOpen(true);
                        setReceiptLoading(true);
                        setReceiptError(null);
                        setReceiptUrl(null);
                        setReceiptDownloadUrl(null);
                        try {
                          const url = await getSignedStorageUrl({ supabase, table: "petty_cash_transactions", id: r.id, disposition: "inline" });
                          const durl = await getSignedStorageUrl({ supabase, table: "petty_cash_transactions", id: r.id, disposition: "attachment" });
                          setReceiptUrl(url);
                          setReceiptDownloadUrl(durl);
                          setReceiptLoading(false);
                        } catch (e: any) {
                          setReceiptLoading(false);
                          setReceiptError(e?.message ?? "เปิดหลักฐานไม่สำเร็จ");
                        }
                      }}
                    >
                      ดูหลักฐาน
                    </button>
                  ) : null}

                  <button
                    type="button"
                    className="rounded-md p-2 text-gray-600 hover:bg-gray-100 disabled:opacity-50"
                    disabled={loading || !canWrite}
                    onClick={() => {
                      setEditing(r);
                      setModalOpen(true);
                    }}
                    aria-label="แก้ไข"
                  >
                    <Pencil className="h-4 w-4" />
                  </button>
                  <button
                    type="button"
                    className="rounded-md p-2 text-red-700 hover:bg-red-50 disabled:opacity-50"
                    disabled={loading || !canWrite}
                    onClick={async () => {
                      const ok = await confirmDialog({ title: "ยืนยันการลบ", message: "ต้องการลบรายการนี้หรือไม่?", confirmText: "ลบ", tone: "danger" });
                      if (!ok) return;
                      setLoading(true);
                      setError(null);
                      try {
                        const { error } = await supabase.from("petty_cash_transactions").delete().eq("id", r.id);
                        if (error) throw new Error(error.message);
                        toast.success("ลบรายการแล้ว");
                        await loadAll();
                        setLoading(false);
                      } catch (e: any) {
                        setLoading(false);
                        setError(e?.message ?? "ลบไม่สำเร็จ");
                      }
                    }}
                    aria-label="ลบ"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              </div>
            ))
          )}
        </div>
      </div>

      <PettyCashTransactionModal
        open={modalOpen}
        mode={editing?.id ? "edit" : "create"}
        supabase={supabase as any}
        userId={userId}
        role={role}
        loading={loading}
        setLoading={setLoading}
        setError={setError}
        categories={categories as any}
        initial={editing}
        onSaved={async () => {
          toast.success("บันทึกสำเร็จ");
          setModalOpen(false);
          setEditing(null);
          await loadAll();
          topRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
        }}
        onClose={() => {
          setModalOpen(false);
          setEditing(null);
        }}
      />

      <Modal
        isOpen={receiptOpen}
        onClose={() => {
          if (receiptLoading) return;
          setReceiptOpen(false);
          setReceiptLoading(false);
          setReceiptUrl(null);
          setReceiptDownloadUrl(null);
          setReceiptError(null);
        }}
        size="lg"
        rounded="md"
      >
        <div className="rounded-xl bg-white p-5">
          <div className="flex items-center justify-between gap-2">
            <div className="min-w-0 truncate text-base font-semibold text-gray-900">หลักฐานเงินสดย่อย</div>
            <div className="flex shrink-0 gap-2">
              <Button
                variant="outline"
                onClick={() => {
                  if (!receiptDownloadUrl) return;
                  window.open(receiptDownloadUrl, "_blank", "noopener,noreferrer");
                }}
                disabled={receiptLoading || !receiptDownloadUrl}
              >
                ดาวน์โหลด
              </Button>
              <Button
                variant="outline"
                onClick={() => {
                  setReceiptOpen(false);
                  setReceiptLoading(false);
                  setReceiptUrl(null);
                  setReceiptDownloadUrl(null);
                  setReceiptError(null);
                }}
                disabled={receiptLoading}
              >
                ปิด
              </Button>
            </div>
          </div>

          {receiptError ? <div className="mt-4 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">{receiptError}</div> : null}

          <div className="mt-4 overflow-hidden rounded-lg border border-gray-200 bg-gray-50">
            {receiptUrl ? (
              <iframe src={receiptUrl} className="h-[70vh] w-full" />
            ) : receiptLoading ? (
              <div className="p-6 text-sm text-gray-600">กำลังโหลด...</div>
            ) : (
              <div className="p-6 text-sm text-gray-600">ไม่พบไฟล์</div>
            )}
          </div>
        </div>
      </Modal>
    </div>
  );
}
