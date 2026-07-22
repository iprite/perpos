"use client";

// _catalogs-client.tsx — รายการชุดแคตตาล็อก (client view: filter + dialog สร้างชุด)
// row clickable → ห้องทำงานของชุดนั้น (workspace เต็มหน้า ไม่ใช่ dialog)

import { useCallback, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  BookImage,
  CheckCircle2,
  ClipboardCheck,
  FileSignature,
  FilterX,
  Library,
  Plus,
  Search,
  Sparkles,
} from "lucide-react";
import { PageShell } from "@/components/ui/page-shell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { CustomSelect } from "@/components/ui/custom-select";
import { Dropdown } from "@/components/ui/dropdown";
import { StatCard } from "@/components/ui/stat-card";
import { StatusBadge } from "@/components/ui/badge";
import { Text } from "@/components/ui/typography";
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
import { toast } from "@/lib/toast";
import type { Catalog, CatalogListStats, CatalogStatus } from "@/lib/gov-procure/catalog";
import { COMPANIES, type GovProcureOrder } from "@/lib/gov-procure/types";
import { govApi } from "../_components/api";
import { CatalogStatusBadge } from "./_components/badges";
import { CreateCatalogDialog } from "./_components/create-catalog-dialog";
import { fmtDateTime, fmtMoney, fmtNum, TEMPLATE_LABEL } from "./_components/format";

const STATUS_OPTIONS: { value: string; label: string }[] = [
  { value: "", label: "ทุกสถานะ" },
  { value: "draft", label: "ร่าง" },
  { value: "enriching", label: "AI กำลังเติมข้อมูล" },
  { value: "review", label: "รอตรวจสอบ" },
  { value: "approved", label: "อนุมัติแล้ว" },
];

const COMPANY_OPTIONS = [
  { value: "", label: "ทุกบริษัท" },
  ...COMPANIES.map((c) => ({ value: c, label: c })),
];

const ATTACH_OPTIONS = [
  { value: "", label: "ทั้งหมด" },
  { value: "yes", label: "แนบงานแล้ว" },
  { value: "no", label: "ยังไม่แนบงาน" },
];

export function CatalogsClient({
  initialCatalogs,
  total,
  truncated,
  stats,
  orders,
  orgId,
  orgSlug,
  canWrite,
}: {
  initialCatalogs: Catalog[];
  total: number;
  truncated: boolean;
  stats: CatalogListStats;
  orders: GovProcureOrder[];
  orgId: string;
  orgSlug: string;
  canWrite: boolean;
}) {
  const router = useRouter();
  const [catalogs, setCatalogs] = useState<Catalog[]>(initialCatalogs);
  const [isTruncated, setIsTruncated] = useState(truncated);
  const [loadingMore, setLoadingMore] = useState(false);

  const [q, setQ] = useState("");
  const [statusF, setStatusF] = useState("");
  const [companyF, setCompanyF] = useState("");
  const [attachF, setAttachF] = useState("");
  const [createOpen, setCreateOpen] = useState(false);

  const orderById = useMemo(() => {
    const map = new Map<string, GovProcureOrder>();
    orders.forEach((o) => map.set(o.id, o));
    return map;
  }, [orders]);

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return catalogs.filter((c) => {
      if (statusF && c.status !== statusF) return false;
      if (companyF && c.company !== companyF) return false;
      if (attachF === "yes" && !c.order_id) return false;
      if (attachF === "no" && c.order_id) return false;
      if (needle) {
        const order = c.order_id ? orderById.get(c.order_id) : undefined;
        const hay =
          `${c.title} ${c.company ?? ""} ${order?.qt_reference ?? ""} ${order?.customer_name ?? ""}`.toLowerCase();
        if (!hay.includes(needle)) return false;
      }
      return true;
    });
  }, [catalogs, q, statusF, companyF, attachF, orderById]);

  const kpi = useMemo(() => {
    const byStatus = (s: CatalogStatus) => catalogs.filter((c) => c.status === s).length;
    return {
      totalCatalogs: total,
      approved: byStatus("approved"),
      review: byStatus("review"),
      aiDraft: stats.totals.ai_draft,
      products: stats.product_count,
    };
  }, [catalogs, total, stats]);

  const filteredValue = useMemo(
    () => filtered.reduce((sum, c) => sum + (stats.byCatalog[c.id]?.est_value ?? 0), 0),
    [filtered, stats],
  );

  const hasFilter = Boolean(q || statusF || companyF || attachF);

  const loadMore = useCallback(async () => {
    setLoadingMore(true);
    try {
      const res = await govApi<{ catalogs: Catalog[]; truncated: boolean }>(
        `/api/gov-procure/catalogs?orgId=${encodeURIComponent(orgId)}&stats=0&offset=${catalogs.length}&limit=500`,
        "GET",
      );
      setCatalogs((prev) => {
        const seen = new Set(prev.map((c) => c.id));
        return [...prev, ...res.catalogs.filter((c) => !seen.has(c.id))];
      });
      setIsTruncated(res.truncated);
      toast.success(`โหลดเพิ่ม ${res.catalogs.length} ชุดแล้ว`);
    } catch (e) {
      toast.error((e as Error).message || "โหลดเพิ่มไม่สำเร็จ");
    } finally {
      setLoadingMore(false);
    }
  }, [orgId, catalogs.length]);

  function clearFilters() {
    setQ("");
    setStatusF("");
    setCompanyF("");
    setAttachF("");
  }

  return (
    <PageShell
      width="full"
      icon={<BookImage className="h-6 w-6" />}
      title="แคตตาล็อกสินค้า"
      description="รวมชุดเอกสารแคตตาล็อกสำหรับแนบซองเสนอราคา — สร้างจากรายการดิบ ให้ AI เติมรายละเอียด แล้วส่งออกเป็น PDF"
      actions={
        <>
          {/* 2 ปุ่มพอ — ที่เหลือรวมใน Dropdown (กัน header แตกบนจอแคบ) */}
          <Dropdown
            label="ข้อมูลตั้งต้น"
            leadingIcon={<Library className="h-4 w-4" />}
            placement="bottom-end"
            items={[
              {
                key: "products",
                label: "คลังสินค้า",
                icon: <Library className="h-4 w-4" />,
                onClick: () => router.push(`/${orgSlug}/gov-procure/catalogs/products`),
              },
              {
                key: "letterheads",
                label: "หัวจดหมายของบริษัท",
                icon: <FileSignature className="h-4 w-4" />,
                onClick: () => router.push(`/${orgSlug}/gov-procure/catalogs/letterheads`),
              },
            ]}
          />
          {canWrite && (
            <Button onClick={() => setCreateOpen(true)}>
              <Plus className="mr-1.5 h-4 w-4" /> สร้างชุดใหม่
            </Button>
          )}
        </>
      }
    >
      <div className="space-y-5">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <StatCard
            icon={<BookImage className="h-4 w-4" />}
            label="ชุดทั้งหมด"
            value={`${fmtNum(kpi.totalCatalogs)} ชุด`}
            sub={`รวมทุกสถานะในองค์กรนี้`}
            tone="neutral"
          />
          <StatCard
            icon={<ClipboardCheck className="h-4 w-4" />}
            label="รอตรวจสอบ"
            value={`${fmtNum(kpi.review)} ชุด`}
            sub={`รายการที่ AI เดา ${fmtNum(kpi.aiDraft)} รายการ`}
            tone={kpi.review > 0 ? "warning" : "positive"}
          />
          <StatCard
            icon={<CheckCircle2 className="h-4 w-4" />}
            label="อนุมัติแล้ว"
            value={`${fmtNum(kpi.approved)} ชุด`}
            sub="พร้อมแนบซองเสนอราคา"
            tone="positive"
          />
          <StatCard
            icon={<Library className="h-4 w-4" />}
            label="สินค้าในคลัง"
            value={`${fmtNum(kpi.products)} รายการ`}
            sub="ครั้งหน้าที่ชื่อตรงกัน ระบบเติมให้เอง ไม่ต้องให้ AI ทำซ้ำ"
            tone="info"
          />
        </div>

        {catalogs.length === 0 ? (
          <EmptyCatalogs canWrite={canWrite} onCreate={() => setCreateOpen(true)} />
        ) : (
          <>
            <div className="rounded-xl border border-gray-200 bg-white p-4">
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
                <div className="relative">
                  <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
                  <Input
                    className="pl-9"
                    placeholder="ค้นหาชื่อชุด / งานที่แนบ"
                    value={q}
                    onChange={(e) => setQ(e.target.value)}
                  />
                </div>
                <CustomSelect value={statusF} onChange={setStatusF} options={STATUS_OPTIONS} />
                <CustomSelect value={companyF} onChange={setCompanyF} options={COMPANY_OPTIONS} />
                <CustomSelect value={attachF} onChange={setAttachF} options={ATTACH_OPTIONS} />
              </div>
              {hasFilter && (
                <div className="mt-2 flex items-center justify-between">
                  <Text className="text-xs text-gray-500">พบ {fmtNum(filtered.length)} ชุด</Text>
                  <Button variant="ghost" size="sm" onClick={clearFilters}>
                    <FilterX className="mr-1.5 h-3.5 w-3.5" /> ล้างตัวกรอง
                  </Button>
                </div>
              )}
            </div>

            {isTruncated && (
              <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-amber-200 bg-amber-50 p-3">
                <Text className="text-xs text-amber-700">
                  แสดง {fmtNum(catalogs.length)} จาก {fmtNum(total)} ชุด — ยังโหลดไม่ครบ
                </Text>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => void loadMore()}
                  disabled={loadingMore}
                >
                  {loadingMore ? "กำลังโหลด…" : "โหลดเพิ่ม"}
                </Button>
              </div>
            )}

            <Table className="shadow-sm">
              <TableHeader>
                <TableRow>
                  <TableHead>ชื่อชุด</TableHead>
                  <TableHead>งานที่แนบ</TableHead>
                  <TableHead align="center">เทมเพลต</TableHead>
                  <TableHead align="right">รายการ</TableHead>
                  <TableHead align="right">ตรวจแล้ว</TableHead>
                  <TableHead align="right">มูลค่าประมาณการ</TableHead>
                  <TableHead align="center">สถานะ</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.length === 0 ? (
                  <TableEmpty colSpan={7}>
                    <div className="flex flex-col items-center gap-2 py-6">
                      <Search className="h-8 w-8 text-gray-300" />
                      <span>ไม่พบชุดตามเงื่อนไข</span>
                      <Button variant="outline" size="sm" className="mt-1" onClick={clearFilters}>
                        <FilterX className="mr-1.5 h-4 w-4" /> ล้างตัวกรอง
                      </Button>
                    </div>
                  </TableEmpty>
                ) : (
                  filtered.map((c) => {
                    const s = stats.byCatalog[c.id];
                    const order = c.order_id ? orderById.get(c.order_id) : undefined;
                    const itemCount = s?.total ?? 0;
                    const verified = s?.verified ?? 0;
                    const pct = itemCount > 0 ? Math.round((verified / itemCount) * 100) : 0;
                    return (
                      <TableRow
                        key={c.id}
                        clickable
                        onClick={() => router.push(`/${orgSlug}/gov-procure/catalogs/${c.id}`)}
                      >
                        <TableCell>
                          <div className="min-w-0 max-w-[300px]">
                            <div className="truncate font-medium text-gray-900">{c.title}</div>
                            <div className="truncate text-xs text-gray-500">
                              {c.company ?? "ไม่ระบุบริษัท"} · สร้าง {fmtDateTime(c.created_at)}
                            </div>
                          </div>
                        </TableCell>
                        <TableCell className="text-gray-600">
                          {order ? (order.qt_reference ?? order.customer_name) : "—"}
                        </TableCell>
                        <TableCell align="center">
                          <StatusBadge tone="neutral">{TEMPLATE_LABEL[c.template]}</StatusBadge>
                        </TableCell>
                        <TableCell align="right" className="tabular-nums text-gray-700">
                          {fmtNum(itemCount)} รายการ
                        </TableCell>
                        <TableCell align="right" className="tabular-nums text-gray-700">
                          <div className="flex flex-col items-end gap-1">
                            <span>
                              {fmtNum(verified)}/{fmtNum(itemCount)}
                            </span>
                            <span className="block h-1 w-20 rounded bg-gray-100">
                              <span
                                className="block h-1 rounded bg-primary"
                                style={{ width: `${pct}%` }}
                              />
                            </span>
                          </div>
                        </TableCell>
                        <TableCell align="right" tabular>
                          {s && s.est_value > 0 ? fmtMoney(s.est_value) : "—"}
                        </TableCell>
                        <TableCell align="center">
                          <CatalogStatusBadge status={c.status} />
                        </TableCell>
                      </TableRow>
                    );
                  })
                )}
              </TableBody>
              {filtered.length > 0 && (
                <TableFooter>
                  <TableRow>
                    <TableCell colSpan={5} className="font-medium text-gray-700">
                      รวม {fmtNum(filtered.length)} ชุด
                    </TableCell>
                    <TableCell align="right" tabular className="font-semibold text-gray-900">
                      {fmtMoney(filteredValue)}
                    </TableCell>
                    <TableCell />
                  </TableRow>
                </TableFooter>
              )}
            </Table>
          </>
        )}
      </div>

      <CreateCatalogDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        orgId={orgId}
        orgSlug={orgSlug}
        orders={orders}
      />
    </PageShell>
  );
}

/** empty state + แถบ 3 ขั้นตอน (N3) — บอกว่าฟีเจอร์นี้ทำงานยังไงตั้งแต่ยังไม่มีชุดเลย */
function EmptyCatalogs({ canWrite, onCreate }: { canWrite: boolean; onCreate: () => void }) {
  const steps = [
    { icon: <BookImage className="h-4 w-4" />, label: "1 วางรายการ" },
    { icon: <Sparkles className="h-4 w-4" />, label: "2 ให้ AI เติม" },
    { icon: <ClipboardCheck className="h-4 w-4" />, label: "3 ตรวจ + ใส่รูป" },
  ];
  return (
    <div className="flex flex-col items-center justify-center rounded-xl border border-gray-200 bg-white py-16 text-center">
      <div className="mb-4 rounded-full bg-gray-100 p-4">
        <BookImage className="h-8 w-8 text-gray-400" />
      </div>
      <Text className="text-sm font-medium text-gray-900">ยังไม่มีชุดแคตตาล็อก</Text>
      <Text className="mt-1 max-w-md text-sm text-gray-500">
        สร้างชุดแรก แล้ววางรายการสินค้าจาก TOR หรือใบเสนอราคา — AI
        จะช่วยเติมสเปกและรายละเอียดให้ทั้งเล่ม
      </Text>
      <div className="mt-4 flex flex-wrap items-center justify-center gap-2">
        {steps.map((s, i) => (
          <span key={s.label} className="flex items-center gap-2">
            <span className="inline-flex items-center gap-1.5 rounded-full border border-gray-200 bg-gray-50 px-3 py-1 text-xs text-gray-600">
              {s.icon}
              {s.label}
            </span>
            {i < steps.length - 1 && <span className="text-gray-300">→</span>}
          </span>
        ))}
      </div>
      {canWrite && (
        <Button className="mt-5" size="sm" onClick={onCreate}>
          <Plus className="mr-1.5 h-4 w-4" /> สร้างชุดแรก
        </Button>
      )}
    </div>
  );
}
