"use client";

/**
 * มุมมองต้นทุนต่อองค์กร — 3 แท็บ
 *   ต่อองค์กร      : ใครทำให้เราจ่ายเท่าไร + ราคาที่ควรเก็บตาม margin เป้าหมาย
 *   แยกตามฟีเจอร์  : ต้นทุนไปจมอยู่ที่ฟีเจอร์ไหน (เจาะราย org ได้)
 *   สมมติฐาน       : ราคาต่อหน่วย / เรตเงิน / margin / ต้นทุนคงที่ — แก้แล้วมีผลกับข้อมูลใหม่
 *
 * ตัวเลขทุกช่องมาจาก SSR (RPC aggregate) — component นี้ไม่ fetch เอง ยกเว้นตอนบันทึกสมมติฐาน
 */

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Building2, Coins, Layers, Percent, SlidersHorizontal, Trash2, Wallet } from "lucide-react";
import {
  SERVICE_LABEL,
  USAGE_SERVICES,
  type FixedCostRow,
  type UsagePriceRow,
  type UsageReport,
  type UsageServiceKey,
} from "@/lib/admin/usage";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { CustomSelect } from "@/components/ui/custom-select";
import { SegmentedControl } from "@/components/ui/segmented";
import { StatCard } from "@/components/ui/stat-card";
import { StatusBadge } from "@/components/ui/badge";
import {
  Table,
  TableHeader,
  TableBody,
  TableFooter,
  TableRow,
  TableHead,
  TableCell,
  TableEmpty,
} from "@/components/ui/table";
import { TablePager, usePagination } from "@/components/ui/table-pager";
import {
  Dialog,
  DialogContent,
  DialogBody,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { toast } from "@/lib/toast";

type Tab = "orgs" | "features" | "assumptions";

const nf = (n: number, d = 2) =>
  new Intl.NumberFormat("th-TH", { minimumFractionDigits: d, maximumFractionDigits: d }).format(n);
const int = (n: number) => new Intl.NumberFormat("th-TH").format(Math.round(n));

/**
 * ราคาต่อหน่วยของ AI เล็กมาก (0.0000004) — `String()` จะได้ "4e-7" ซึ่งอ่านไม่รู้เรื่อง
 * และพิมพ์แก้ไม่ได้ · หน่วย token จึงแสดงเป็น "ต่อ 1 ล้าน token" แบบเดียวกับที่ Google ประกาศราคา
 */
const PER_MILLION = 1_000_000;
const isTokenUnit = (unit: string) => unit === "token";

function priceToInput(unitCostUsd: number, unit: string): string {
  const v = isTokenUnit(unit) ? unitCostUsd * PER_MILLION : unitCostUsd;
  // ตัดศูนย์ท้ายทิ้ง แต่ไม่ใช้ exponent notation
  return v.toFixed(10).replace(/\.?0+$/, "") || "0";
}

function inputToPrice(raw: string, unit: string): number {
  const v = Number(raw);
  if (!Number.isFinite(v)) return NaN;
  return isTokenUnit(unit) ? v / PER_MILLION : v;
}

/** เงินบาท — ต่ำกว่า 1 สตางค์ยังต้องเห็นว่า "มีต้นทุน" ไม่ใช่ 0.00 */
function thb(usd: number, rate: number): string {
  const v = usd * rate;
  if (v > 0 && v < 0.01) return "< 0.01";
  return nf(v);
}

export function UsageView({
  report,
  prices,
  selectedOrgId,
}: {
  report: UsageReport;
  prices: UsagePriceRow[];
  selectedOrgId: string | null;
}) {
  const [tab, setTab] = useState<Tab>("orgs");
  const rate = report.settings.usdThbRate;
  const margin = report.settings.targetMargin;

  // ปรับยอดของช่วงที่เลือกให้เป็น "ต่อเดือน" เพื่อเทียบกับราคาแพ็กเกจรายเดือน
  const toMonthly = 30 / report.days;

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          icon={<Coins className="h-4 w-4" />}
          label="ต้นทุนแปรผัน"
          value={`${thb(report.totals.variableUsd, rate)} ฿`}
          sub={`${int(report.totals.events)} รายการ · $${nf(report.totals.variableUsd, 4)}`}
          tone="info"
        />
        <StatCard
          icon={<Wallet className="h-4 w-4" />}
          label="ต้นทุนคงที่ (ตามสัดส่วนช่วงนี้)"
          value={`${thb(report.totals.fixedUsd, rate)} ฿`}
          sub={
            report.fixedCosts.length
              ? `${report.fixedCosts.length} รายการ`
              : "ยังไม่ได้บันทึก — ใส่ที่แท็บสมมติฐาน"
          }
          tone={report.fixedCosts.length ? "neutral" : "warning"}
        />
        <StatCard
          icon={<Building2 className="h-4 w-4" />}
          label="ต้นทุนรวม"
          value={`${thb(report.totals.totalUsd, rate)} ฿`}
          sub={`${report.totals.orgsWithUsage} องค์กรที่มีการใช้งาน`}
          tone="negative"
          valueColored
        />
        <StatCard
          icon={<Percent className="h-4 w-4" />}
          label={`ราคาที่ควรเก็บรวม (×${nf(margin, 2)})`}
          value={`${thb(report.totals.totalUsd * margin * toMonthly, rate)} ฿`}
          sub="ประมาณเป็นยอดต่อเดือน"
          tone="positive"
          valueColored
        />
      </div>

      {report.totals.unattributedUsd > 0 && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          มีต้นทุน{" "}
          <span className="font-mono font-medium tabular-nums">
            {thb(report.totals.unattributedUsd, rate)} ฿
          </span>{" "}
          ที่ยังผูกองค์กรไม่ได้ (แถว “ไม่ระบุองค์กร”) — ส่วนใหญ่มาจากบอทตอบคำถามก่อนขายที่ยังไม่มี
          org และงานที่ยังไม่ได้ส่งบริบทองค์กรเข้ามา ยอดนี้ยังนับรวมในต้นทุนรวม
          แต่แบ่งรายองค์กรไม่ได้
        </div>
      )}

      <SegmentedControl
        value={tab}
        onChange={setTab}
        ariaLabel="มุมมองต้นทุน"
        options={[
          { value: "orgs", label: "ต่อองค์กร", icon: <Building2 className="h-4 w-4" /> },
          { value: "features", label: "แยกตามฟีเจอร์", icon: <Layers className="h-4 w-4" /> },
          {
            value: "assumptions",
            label: "สมมติฐานต้นทุน",
            icon: <SlidersHorizontal className="h-4 w-4" />,
          },
        ]}
      />

      {tab === "orgs" && <OrgTable report={report} />}
      {tab === "features" && <FeatureTable report={report} selectedOrgId={selectedOrgId} />}
      {tab === "assumptions" && <Assumptions report={report} prices={prices} />}
    </div>
  );
}

// ── แท็บ 1: ต่อองค์กร ─────────────────────────────────────────────────────────

function OrgTable({ report }: { report: UsageReport }) {
  const router = useRouter();
  const rate = report.settings.usdThbRate;
  const margin = report.settings.targetMargin;
  const toMonthly = 30 / report.days;
  const pager = usePagination(report.orgs, { pageSize: 15 });

  // แสดงเฉพาะคอลัมน์บริการที่มีต้นทุนจริงในช่วงนี้ — ไม่งั้นตารางเต็มไปด้วยศูนย์
  const activeServices = useMemo<UsageServiceKey[]>(
    () => USAGE_SERVICES.filter((s) => report.orgs.some((o) => (o.byService[s] ?? 0) > 0)),
    [report.orgs],
  );

  const totals = report.orgs.reduce(
    (acc, o) => ({ variable: acc.variable + o.variableUsd, total: acc.total + o.totalUsd }),
    { variable: 0, total: 0 },
  );

  return (
    <div className="space-y-3">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>องค์กร</TableHead>
            {activeServices.map((s) => (
              <TableHead key={s} align="right">
                {SERVICE_LABEL[s]}
              </TableHead>
            ))}
            <TableHead align="right">ปันส่วนคงที่</TableHead>
            <TableHead align="right">ต้นทุนรวม (฿)</TableHead>
            <TableHead align="right">ราคาที่ควรเก็บ/เดือน</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {report.orgs.length === 0 ? (
            <TableEmpty colSpan={activeServices.length + 4}>
              ยังไม่มีการใช้งานที่มีต้นทุนในช่วงนี้
            </TableEmpty>
          ) : (
            pager.rows.map((o) => (
              <TableRow
                key={o.orgId ?? "none"}
                clickable={!!o.orgId}
                onClick={o.orgId ? () => router.push(`/admin/usage?org=${o.orgId}`) : undefined}
              >
                <TableCell>
                  <div className="font-medium text-gray-900">{o.orgName}</div>
                  <div className="text-xs text-gray-500">
                    {o.orgSlug} · {int(o.events)} รายการ · token เข้า {int(o.inTokens)} / ออก{" "}
                    {int(o.outTokens)}
                  </div>
                </TableCell>
                {activeServices.map((s) => (
                  <TableCell key={s} align="right" className="tabular-nums">
                    {o.byService[s] ? thb(o.byService[s] as number, rate) : "—"}
                  </TableCell>
                ))}
                <TableCell align="right" className="tabular-nums text-gray-500">
                  {o.allocatedUsd > 0 ? thb(o.allocatedUsd, rate) : "—"}
                </TableCell>
                <TableCell align="right" tabular>
                  {thb(o.totalUsd, rate)}
                </TableCell>
                <TableCell align="right" tabular className="font-medium text-green-600">
                  {thb(o.totalUsd * margin * toMonthly, rate)}
                </TableCell>
              </TableRow>
            ))
          )}
        </TableBody>
        {report.orgs.length > 0 && (
          <TableFooter>
            <TableRow>
              <TableCell>รวมทุกองค์กร</TableCell>
              {activeServices.map((s) => (
                <TableCell key={s} align="right" className="tabular-nums">
                  {thb(
                    report.orgs.reduce((sum, o) => sum + (o.byService[s] ?? 0), 0),
                    rate,
                  )}
                </TableCell>
              ))}
              <TableCell align="right" className="tabular-nums">
                {thb(totals.total - totals.variable, rate)}
              </TableCell>
              <TableCell align="right" tabular>
                {thb(totals.total, rate)}
              </TableCell>
              <TableCell align="right" tabular className="text-green-600">
                {thb(totals.total * margin * toMonthly, rate)}
              </TableCell>
            </TableRow>
          </TableFooter>
        )}
      </Table>
      <TablePager pager={pager} unit="องค์กร" />
      <p className="px-1 text-xs text-gray-500">
        คลิกแถวเพื่อเจาะดูว่าองค์กรนั้นเสียต้นทุนไปกับฟีเจอร์ไหน · “ราคาที่ควรเก็บ” = ต้นทุนรวม ×
        ตัวคูณเป้าหมาย แล้วเทียบเป็นยอด 30 วัน
      </p>
    </div>
  );
}

// ── แท็บ 2: แยกตามฟีเจอร์ ─────────────────────────────────────────────────────

function FeatureTable({
  report,
  selectedOrgId,
}: {
  report: UsageReport;
  selectedOrgId: string | null;
}) {
  const router = useRouter();
  const rate = report.settings.usdThbRate;
  const pager = usePagination(report.features, { pageSize: 20 });
  const selected = report.orgs.find((o) => o.orgId === selectedOrgId);
  const totalUsd = report.features.reduce((s, f) => s + f.costUsd, 0);
  const peak = Math.max(1e-9, ...report.daily.map((d) => d.costUsd));

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <CustomSelect
          value={selectedOrgId ?? ""}
          onChange={(v) =>
            router.push(
              `/admin/usage?days=${report.days}${v ? `&org=${v}` : ""}`.replace("days=30&", ""),
            )
          }
          className="w-64"
          options={[
            { value: "", label: "ทุกองค์กร" },
            ...report.orgs
              .filter((o) => o.orgId)
              .map((o) => ({ value: o.orgId as string, label: o.orgName })),
          ]}
        />
        {selected && <StatusBadge tone="info">{selected.orgName}</StatusBadge>}
      </div>

      {report.daily.length > 0 && (
        <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
          <div className="mb-3 text-sm font-semibold text-gray-900">แนวโน้มรายวัน</div>
          <div className="flex h-24 items-end gap-0.5">
            {report.daily.map((d) => (
              <div
                key={d.day}
                className="flex-1 rounded-t bg-primary/70 transition-colors hover:bg-primary"
                style={{ height: `${Math.max(2, (d.costUsd / peak) * 100)}%` }}
                title={`${d.day} — ${thb(d.costUsd, rate)} ฿ · ${int(d.events)} รายการ`}
              />
            ))}
          </div>
          <div className="mt-2 flex justify-between text-xs text-gray-500">
            <span>{report.daily[0]?.day}</span>
            <span>{report.daily[report.daily.length - 1]?.day}</span>
          </div>
        </div>
      )}

      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>ฟีเจอร์</TableHead>
            <TableHead>บริการ / ทรัพยากร</TableHead>
            <TableHead align="right">ปริมาณ</TableHead>
            <TableHead align="right">ครั้ง</TableHead>
            <TableHead align="right">ต้นทุน (฿)</TableHead>
            <TableHead align="right">สัดส่วน</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {report.features.length === 0 ? (
            <TableEmpty colSpan={6}>ยังไม่มีข้อมูลในช่วงนี้</TableEmpty>
          ) : (
            pager.rows.map((f) => (
              <TableRow key={`${f.service}-${f.feature}-${f.resource}`}>
                <TableCell className="font-medium text-gray-900">{f.feature}</TableCell>
                <TableCell>
                  <StatusBadge tone="neutral">{SERVICE_LABEL[f.service] ?? f.service}</StatusBadge>
                  <span className="ml-2 text-xs text-gray-500">{f.resource}</span>
                </TableCell>
                <TableCell align="right" className="tabular-nums">
                  {int(f.quantity)} {f.unit}
                </TableCell>
                <TableCell align="right" tabular>
                  {int(f.events)}
                </TableCell>
                <TableCell align="right" tabular>
                  {thb(f.costUsd, rate)}
                </TableCell>
                <TableCell align="right" className="tabular-nums text-gray-500">
                  {totalUsd > 0 ? `${nf((f.costUsd / totalUsd) * 100, 1)}%` : "—"}
                </TableCell>
              </TableRow>
            ))
          )}
        </TableBody>
      </Table>
      <TablePager pager={pager} unit="รายการ" />
    </div>
  );
}

// ── แท็บ 3: สมมติฐาน ─────────────────────────────────────────────────────────

function Assumptions({ report, prices }: { report: UsageReport; prices: UsagePriceRow[] }) {
  const router = useRouter();
  const supabase = createSupabaseBrowserClient();
  const [rate, setRate] = useState(String(report.settings.usdThbRate));
  const [margin, setMargin] = useState(String(report.settings.targetMargin));
  const [priceDraft, setPriceDraft] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState("");
  const [addOpen, setAddOpen] = useState(false);

  async function call(method: "PUT" | "POST" | "DELETE", body?: unknown, query = "") {
    const {
      data: { session },
    } = await supabase.auth.getSession();
    const res = await fetch(`/api/admin/usage${query}`, {
      method,
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${session?.access_token ?? ""}`,
      },
      body: body ? JSON.stringify(body) : undefined,
    });
    const json = await res.json().catch(() => null);
    if (!res.ok) throw new Error(json?.error?.message ?? "บันทึกไม่สำเร็จ");
    return json;
  }

  async function saveSettings() {
    setSaving("settings");
    try {
      await call("PUT", {
        kind: "settings",
        usdThbRate: Number(rate),
        targetMargin: Number(margin),
      });
      toast.success("บันทึกสมมติฐานแล้ว");
      router.refresh();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setSaving("");
    }
  }

  async function savePrice(price: UsagePriceRow) {
    const key = price.key;
    const v = inputToPrice(priceDraft[key] ?? "", price.unit);
    if (!Number.isFinite(v) || v < 0) return toast.error("ราคาต้องเป็นตัวเลข ≥ 0");
    setSaving(key);
    try {
      await call("PUT", { kind: "price", key, unitCostUsd: v });
      toast.success("บันทึกราคาแล้ว — มีผลกับการใช้งานหลังจากนี้");
      setPriceDraft((d) => {
        const next = { ...d };
        delete next[key];
        return next;
      });
      router.refresh();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setSaving("");
    }
  }

  async function deleteFixed(id: string) {
    setSaving(id);
    try {
      await call("DELETE", undefined, `?id=${id}`);
      toast.success("ลบแล้ว");
      router.refresh();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setSaving("");
    }
  }

  return (
    <div className="space-y-6">
      <section className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
        <div className="mb-1 text-sm font-semibold text-gray-900">
          อัตราแลกเปลี่ยน & เป้าหมายกำไร
        </div>
        <p className="mb-4 text-xs text-gray-500">
          ต้นทุนจากผู้ให้บริการเป็นดอลลาร์ · ตัวคูณเป้าหมายใช้คำนวณ “ราคาที่ควรเก็บ” (1 =
          ขายเท่าทุน)
        </p>
        <div className="flex flex-wrap items-end gap-3">
          <div>
            <Label htmlFor="usage-rate">USD → THB</Label>
            <Input
              id="usage-rate"
              type="number"
              step="0.25"
              value={rate}
              onChange={(e) => setRate(e.target.value)}
              className="mt-1 w-32"
            />
          </div>
          <div>
            <Label htmlFor="usage-margin">ตัวคูณราคาขาย</Label>
            <Input
              id="usage-margin"
              type="number"
              step="0.1"
              value={margin}
              onChange={(e) => setMargin(e.target.value)}
              className="mt-1 w-32"
            />
          </div>
          <Button onClick={saveSettings} disabled={saving === "settings"}>
            {saving === "settings" ? "กำลังบันทึก…" : "บันทึก"}
          </Button>
        </div>
      </section>

      <section className="space-y-2.5">
        <div className="flex items-center justify-between px-1">
          <div>
            <div className="text-sm font-semibold text-gray-900">ต้นทุนคงที่รายเดือน</div>
            <p className="text-xs text-gray-500">
              Vercel · Supabase · โดเมน · บริการรายเดือนอื่น —
              ปันส่วนเข้าองค์กรเพื่อดูต้นทุนจริงต่อราย
            </p>
          </div>
          <Button size="sm" onClick={() => setAddOpen(true)}>
            เพิ่มรายการ
          </Button>
        </div>
        <Table className="shadow-sm">
          <TableHeader>
            <TableRow>
              <TableHead>เดือน</TableHead>
              <TableHead>รายการ</TableHead>
              <TableHead>วิธีปันส่วน</TableHead>
              <TableHead align="right">จำนวน (USD)</TableHead>
              <TableHead align="right">≈ บาท</TableHead>
              <TableHead align="right"> </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {report.fixedCosts.length === 0 ? (
              <TableEmpty colSpan={6}>
                ยังไม่ได้บันทึกต้นทุนคงที่ — ใส่ค่า Vercel/Supabase เพื่อให้ต้นทุนต่อองค์กรครบจริง
              </TableEmpty>
            ) : (
              report.fixedCosts.map((f) => (
                <TableRow key={f.id}>
                  <TableCell className="tabular-nums">{f.month.slice(0, 7)}</TableCell>
                  <TableCell>
                    <div className="font-medium text-gray-900">{f.label}</div>
                    {f.note && <div className="text-xs text-gray-500">{f.note}</div>}
                  </TableCell>
                  <TableCell>{allocationLabel(f.allocation)}</TableCell>
                  <TableCell align="right" tabular>
                    {nf(f.amountUsd)}
                  </TableCell>
                  <TableCell align="right" tabular>
                    {nf(f.amountUsd * report.settings.usdThbRate)}
                  </TableCell>
                  <TableCell align="right">
                    <Button
                      variant="ghost"
                      size="icon"
                      title="ลบ"
                      disabled={saving === f.id}
                      onClick={() => deleteFixed(f.id)}
                    >
                      <Trash2 className="h-4 w-4 text-red-600" />
                    </Button>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </section>

      <section className="space-y-2.5">
        <div className="px-1">
          <div className="text-sm font-semibold text-gray-900">ราคาต่อหน่วยของผู้ให้บริการ</div>
          <p className="text-xs text-gray-500">
            แก้ที่นี่มีผลกับการใช้งานหลังจากนี้เท่านั้น —
            ต้นทุนที่บันทึกไปแล้วถูกตรึงไว้ที่ราคาตอนนั้น
          </p>
        </div>
        <Table className="shadow-sm">
          <TableHeader>
            <TableRow>
              <TableHead>ทรัพยากร</TableHead>
              <TableHead>คิดตาม</TableHead>
              <TableHead align="right">ราคา (USD)</TableHead>
              <TableHead align="right"> </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {prices.map((p) => {
              const current = priceToInput(p.unitCostUsd, p.unit);
              const draft = priceDraft[p.key];
              const dirty = draft != null && draft.trim() !== current;
              return (
                <TableRow key={p.key}>
                  <TableCell>
                    <div className="font-medium text-gray-900">{p.label}</div>
                    <div className="font-mono text-xs text-gray-500">{p.key}</div>
                  </TableCell>
                  <TableCell className="text-gray-600">
                    {isTokenUnit(p.unit) ? "ต่อ 1 ล้าน token" : `ต่อ 1 ${p.unit}`}
                  </TableCell>
                  <TableCell align="right">
                    <Input
                      type="number"
                      step="any"
                      className="ms-auto w-44 text-right"
                      value={draft ?? current}
                      onChange={(e) => setPriceDraft((d) => ({ ...d, [p.key]: e.target.value }))}
                    />
                  </TableCell>
                  <TableCell align="right">
                    <Button
                      size="sm"
                      variant={dirty ? "default" : "outline"}
                      disabled={!dirty || saving === p.key}
                      onClick={() => savePrice(p)}
                    >
                      {saving === p.key ? "…" : "บันทึก"}
                    </Button>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </section>

      <AddFixedCostDialog
        open={addOpen}
        onOpenChange={setAddOpen}
        onSaved={() => router.refresh()}
        call={call}
      />
    </div>
  );
}

function allocationLabel(a: FixedCostRow["allocation"]): string {
  if (a === "pro_rata") return "ตามสัดส่วนการใช้";
  if (a === "per_org") return "หารเท่ากันทุกองค์กร";
  return "ไม่ปันส่วน";
}

function AddFixedCostDialog({
  open,
  onOpenChange,
  onSaved,
  call,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onSaved: () => void;
  call: (method: "PUT" | "POST" | "DELETE", body?: unknown, query?: string) => Promise<unknown>;
}) {
  const thisMonth = new Date().toISOString().slice(0, 7);
  const [month, setMonth] = useState(thisMonth);
  const [label, setLabel] = useState("");
  const [amount, setAmount] = useState("");
  const [allocation, setAllocation] = useState<FixedCostRow["allocation"]>("pro_rata");
  const [saving, setSaving] = useState(false);

  async function submit() {
    if (!label.trim()) return toast.error("ใส่ชื่อรายการก่อน");
    const amt = Number(amount);
    if (!Number.isFinite(amt) || amt < 0) return toast.error("จำนวนเงินต้องเป็นตัวเลข ≥ 0");
    setSaving(true);
    try {
      await call("POST", {
        kind: "fixed_cost",
        month: `${month}-01`,
        label: label.trim(),
        amountUsd: amt,
        allocation,
      });
      toast.success("บันทึกแล้ว");
      setLabel("");
      setAmount("");
      onOpenChange(false);
      onSaved();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent size="md">
        <DialogHeader>
          <DialogTitle>เพิ่มต้นทุนคงที่</DialogTitle>
        </DialogHeader>
        <DialogBody>
          <div className="space-y-4">
            <div>
              <Label htmlFor="fc-month">เดือน</Label>
              <Input
                id="fc-month"
                type="month"
                value={month}
                onChange={(e) => setMonth(e.target.value)}
                className="mt-1"
              />
            </div>
            <div>
              <Label htmlFor="fc-label">รายการ *</Label>
              <Input
                id="fc-label"
                value={label}
                onChange={(e) => setLabel(e.target.value)}
                placeholder="เช่น Vercel Pro / Supabase Pro"
                className="mt-1"
              />
            </div>
            <div>
              <Label htmlFor="fc-amount">จำนวนเงิน (USD) *</Label>
              <Input
                id="fc-amount"
                type="number"
                step="0.01"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                className="mt-1"
              />
            </div>
            <div>
              <Label htmlFor="fc-alloc">วิธีปันส่วน</Label>
              <CustomSelect
                value={allocation}
                onChange={(v) => setAllocation(v as FixedCostRow["allocation"])}
                className="mt-1"
                options={[
                  { value: "pro_rata", label: "ตามสัดส่วนการใช้ (คนใช้เยอะแบกมาก)" },
                  { value: "per_org", label: "หารเท่ากันทุกองค์กร" },
                  { value: "none", label: "ไม่ปันส่วน (นับรวมบริษัทอย่างเดียว)" },
                ]}
              />
            </div>
          </div>
        </DialogBody>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            ยกเลิก
          </Button>
          <Button onClick={submit} disabled={saving}>
            {saving ? "กำลังบันทึก…" : "บันทึก"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
