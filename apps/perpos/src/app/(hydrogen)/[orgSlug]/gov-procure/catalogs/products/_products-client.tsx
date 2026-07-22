"use client";

// _products-client.tsx — คลังสินค้า (client view: ค้นหา/กรอง/แก้ผ่าน dialog)
// KPI = ทรัพย์สินความรู้ที่สะสม (ยิ่งใช้ ยิ่งเร็ว/ถูกลง)

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ArrowLeft, ImageOff, Library, History, Repeat2, Search, FilterX } from "lucide-react";
import Link from "next/link";
import { PageShell } from "@/components/ui/page-shell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { CustomSelect } from "@/components/ui/custom-select";
import { StatCard } from "@/components/ui/stat-card";
import { StatusBadge } from "@/components/ui/badge";
import { Text } from "@/components/ui/typography";
import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
  TableEmpty,
} from "@/components/ui/table";
import { toast } from "@/lib/toast";
import type { CatalogProduct } from "@/lib/gov-procure/catalog";
import { computeProductStats, isStalePrice } from "@/lib/gov-procure/catalog-product-list";
import { govApi } from "../../_components/api";
import { ProductDialog } from "../_components/product-dialog";
import { fetchProductImageUrls } from "../_components/image-api";
import { fmtDateTime, fmtMoney, fmtNum } from "../_components/format";

/** ต่ออายุ signed URL ก่อนหมดอายุ (server เซ็นไว้ 5 นาที) */
const IMAGE_REFRESH_MS = 4 * 60 * 1000;

const PRICE_FILTERS = [
  { value: "", label: "ทุกสถานะราคา" },
  { value: "fresh", label: "ราคาล่าสุด" },
  { value: "stale", label: "ราคาควรทบทวน" },
  { value: "none", label: "ยังไม่มีราคา" },
];

export function ProductsClient({
  initialProducts,
  total,
  truncated,
  orgId,
  orgSlug,
  canWrite,
  canDelete,
}: {
  initialProducts: CatalogProduct[];
  total: number;
  truncated: boolean;
  orgId: string;
  orgSlug: string;
  canWrite: boolean;
  canDelete: boolean;
}) {
  const [products, setProducts] = useState<CatalogProduct[]>(initialProducts);
  const [isTruncated, setIsTruncated] = useState(truncated);
  const [loadingMore, setLoadingMore] = useState(false);

  const [q, setQ] = useState("");
  const [category, setCategory] = useState("");
  const [priceFilter, setPriceFilter] = useState("");
  const [editing, setEditing] = useState<CatalogProduct | null>(null);
  const [thumbs, setThumbs] = useState<Record<string, string>>({});
  const thumbReqRef = useRef<Set<string>>(new Set());

  // thumbnail — signed URL แบบ batch (`productIds`) · อ้างด้วย id เท่านั้น ห้ามส่ง path
  useEffect(() => {
    const need = products
      .filter((p) => p.image_path && !thumbReqRef.current.has(p.id))
      .map((p) => p.id);
    if (need.length === 0) return;
    need.forEach((id) => thumbReqRef.current.add(id));
    fetchProductImageUrls(orgId, need)
      .then((urls) => setThumbs((prev) => ({ ...prev, ...urls })))
      .catch(() => {
        /* โหลดรูปไม่ได้ → แสดงกล่องเส้นประแทน (ไม่รบกวนผู้ใช้) */
      });
  }, [products, orgId]);

  // URL หมดอายุใน 5 นาที → ขอใหม่ทั้งหน้าเมื่อค้างหน้านาน
  useEffect(() => {
    const timer = window.setInterval(() => {
      const ids = products.filter((p) => p.image_path).map((p) => p.id);
      if (ids.length === 0) return;
      fetchProductImageUrls(orgId, ids)
        .then((urls) => setThumbs((prev) => ({ ...prev, ...urls })))
        .catch(() => {
          /* ต่ออายุไม่สำเร็จ → รอบหน้าลองใหม่ */
        });
    }, IMAGE_REFRESH_MS);
    return () => window.clearInterval(timer);
  }, [products, orgId]);

  const categoryOptions = useMemo(() => {
    const set = new Set<string>();
    products.forEach((p) => {
      if (p.category) set.add(p.category);
    });
    return [
      { value: "", label: "ทุกหมวดหมู่" },
      ...Array.from(set)
        .sort()
        .map((c) => ({ value: c, label: c })),
    ];
  }, [products]);

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return products.filter((p) => {
      if (category && p.category !== category) return false;
      if (priceFilter === "none" && p.last_unit_price !== null) return false;
      if (priceFilter === "stale" && !isStalePrice(p)) return false;
      if (priceFilter === "fresh" && (p.last_unit_price === null || isStalePrice(p))) return false;
      if (needle) {
        const hay = `${p.name} ${p.brand_model ?? ""} ${p.category ?? ""}`.toLowerCase();
        if (!hay.includes(needle)) return false;
      }
      return true;
    });
  }, [products, q, category, priceFilter]);

  const stats = useMemo(() => computeProductStats(products), [products]);
  const hasFilter = Boolean(q || category || priceFilter);

  const loadMore = useCallback(async () => {
    setLoadingMore(true);
    try {
      const res = await govApi<{ products: CatalogProduct[]; truncated: boolean }>(
        `/api/gov-procure/products?orgId=${encodeURIComponent(orgId)}&offset=${products.length}&limit=500`,
        "GET",
      );
      setProducts((prev) => {
        const seen = new Set(prev.map((p) => p.id));
        return [...prev, ...res.products.filter((p) => !seen.has(p.id))];
      });
      setIsTruncated(res.truncated);
      toast.success(`โหลดเพิ่ม ${res.products.length} รายการแล้ว`);
    } catch (e) {
      toast.error((e as Error).message || "โหลดเพิ่มไม่สำเร็จ");
    } finally {
      setLoadingMore(false);
    }
  }, [orgId, products.length]);

  function clearFilters() {
    setQ("");
    setCategory("");
    setPriceFilter("");
  }

  return (
    <PageShell
      width="full"
      icon={<Library className="h-6 w-6" />}
      title="คลังสินค้า"
      description="สินค้าที่ทีมยืนยันแล้ว — ชุดถัดไปที่ชื่อตรงกันจะดึงสเปก ราคา และรูปมาให้อัตโนมัติ (ไม่ต้องให้ AI ทำซ้ำ)"
      actions={
        <Button variant="outline" asChild>
          <Link href={`/${orgSlug}/gov-procure/catalogs`}>
            <ArrowLeft className="mr-1.5 h-4 w-4" /> กลับไปแคตตาล็อก
          </Link>
        </Button>
      }
    >
      <div className="space-y-5">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <StatCard
            icon={<Library className="h-4 w-4" />}
            label="สินค้าในคลัง"
            value={`${fmtNum(stats.total)} รายการ`}
            sub={`ยังไม่มีรูป ${fmtNum(stats.no_image)} รายการ`}
            tone="neutral"
          />
          <StatCard
            icon={<Repeat2 className="h-4 w-4" />}
            label="ถูกดึงใช้ซ้ำ"
            value={`${fmtNum(stats.times_used)} ครั้ง`}
            sub="ทุกครั้งที่ดึงซ้ำ = ไม่ต้องจ่ายค่า AI และไม่ต้องพิมพ์ใหม่"
            tone="positive"
          />
          <StatCard
            icon={<History className="h-4 w-4" />}
            label="ราคาควรทบทวน"
            value={`${fmtNum(stats.stale_price)} รายการ`}
            sub={`ราคาเก่ากว่า 6 เดือน · ยังไม่มีราคา ${fmtNum(stats.no_price)} รายการ`}
            tone={stats.stale_price > 0 ? "warning" : "positive"}
          />
        </div>

        {products.length === 0 ? (
          <EmptyLibrary orgSlug={orgSlug} />
        ) : (
          <>
            <div className="rounded-xl border border-gray-200 bg-white p-4">
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
                <div className="relative lg:col-span-2">
                  <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
                  <Input
                    className="pl-9"
                    placeholder="ค้นหาชื่อสินค้า / ยี่ห้อ"
                    value={q}
                    onChange={(e) => setQ(e.target.value)}
                  />
                </div>
                <CustomSelect value={category} onChange={setCategory} options={categoryOptions} />
                <CustomSelect
                  value={priceFilter}
                  onChange={setPriceFilter}
                  options={PRICE_FILTERS}
                />
              </div>
              {hasFilter && (
                <div className="mt-2 flex items-center justify-between">
                  <Text className="text-xs text-gray-500">พบ {fmtNum(filtered.length)} รายการ</Text>
                  <Button variant="ghost" size="sm" onClick={clearFilters}>
                    <FilterX className="mr-1.5 h-3.5 w-3.5" /> ล้างตัวกรอง
                  </Button>
                </div>
              )}
            </div>

            {isTruncated && (
              <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-amber-200 bg-amber-50 p-3">
                <Text className="text-xs text-amber-700">
                  แสดง {fmtNum(products.length)} จาก {fmtNum(total)} รายการ —
                  ตัวเลขสรุปด้านบนคิดจากเท่าที่โหลดมาแล้ว
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
                  <TableHead align="center">รูป</TableHead>
                  <TableHead>ชื่อสินค้า</TableHead>
                  <TableHead>หมวดหมู่</TableHead>
                  <TableHead align="center">หน่วยตั้งต้น</TableHead>
                  <TableHead align="right">ราคาล่าสุด</TableHead>
                  <TableHead align="right">อัปเดตราคา</TableHead>
                  <TableHead align="right">ใช้ไปแล้ว</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.length === 0 ? (
                  <TableEmpty colSpan={7}>
                    <div className="flex flex-col items-center gap-2 py-6">
                      <Search className="h-8 w-8 text-gray-300" />
                      <span>ไม่พบสินค้าตามเงื่อนไข</span>
                      <Button variant="outline" size="sm" className="mt-1" onClick={clearFilters}>
                        <FilterX className="mr-1.5 h-4 w-4" /> ล้างตัวกรอง
                      </Button>
                    </div>
                  </TableEmpty>
                ) : (
                  filtered.map((p) => (
                    <TableRow key={p.id} clickable onClick={() => setEditing(p)}>
                      <TableCell align="center">
                        <ProductThumb name={p.name} url={thumbs[p.id]} />
                      </TableCell>
                      <TableCell>
                        <div className="min-w-0 max-w-[280px]">
                          <div className="truncate font-medium text-gray-900">{p.name}</div>
                          <div className="truncate text-xs text-gray-500">
                            {p.brand_model ?? "— ไม่ระบุยี่ห้อ/รุ่น —"}
                          </div>
                        </div>
                      </TableCell>
                      <TableCell className="text-gray-600">{p.category ?? "—"}</TableCell>
                      <TableCell align="center" className="text-gray-600">
                        {p.default_unit ?? "—"}
                      </TableCell>
                      <TableCell align="right" tabular>
                        {fmtMoney(p.last_unit_price)}
                      </TableCell>
                      <TableCell align="right" className="tabular-nums text-gray-600">
                        <div className="flex items-center justify-end gap-2">
                          {fmtDateTime(p.price_updated_at)}
                          {isStalePrice(p) && <StatusBadge tone="warning">ควรทบทวน</StatusBadge>}
                        </div>
                      </TableCell>
                      <TableCell align="right" className="tabular-nums text-gray-600">
                        {fmtNum(p.times_used)} ครั้ง
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </>
        )}
      </div>

      <ProductDialog
        product={editing}
        open={editing !== null}
        onOpenChange={(v) => !v && setEditing(null)}
        orgId={orgId}
        canWrite={canWrite}
        canDelete={canDelete}
        onSaved={(next) => setProducts((prev) => prev.map((p) => (p.id === next.id ? next : p)))}
        onDeleted={(id) => {
          setProducts((prev) => prev.filter((p) => p.id !== id));
          setThumbs((prev) => {
            const next = { ...prev };
            delete next[id];
            return next;
          });
        }}
        onImageChanged={(id) => {
          thumbReqRef.current.delete(id);
          fetchProductImageUrls(orgId, [id])
            .then((urls) => {
              thumbReqRef.current.add(id);
              setThumbs((prev) => {
                const next = { ...prev, ...urls };
                if (!urls[id]) delete next[id];
                return next;
              });
            })
            .catch(() => {
              /* ขอ URL ใหม่ไม่สำเร็จ → รอบต่ออายุถัดไปจะลองอีกครั้ง */
            });
        }}
      />
    </PageShell>
  );
}

/** thumbnail ของสินค้าในคลัง — ท่าเดียวกับ `ItemThumb` ในห้องทำงาน */
function ProductThumb({ name, url }: { name: string; url?: string }) {
  if (!url) {
    return (
      <span className="mx-auto flex h-9 w-9 items-center justify-center rounded border border-dashed border-gray-300 text-gray-300">
        <ImageOff className="h-4 w-4" />
      </span>
    );
  }
  return (
    /* signed URL ของ Supabase Storage (อายุ 5 นาที) — ใช้ next/image ไม่ได้ */
    <img
      src={url}
      alt={name}
      className="mx-auto h-9 w-9 rounded border border-gray-200 object-cover"
    />
  );
}

function EmptyLibrary({ orgSlug }: { orgSlug: string }) {
  return (
    <div className="flex flex-col items-center justify-center rounded-xl border border-gray-200 bg-white py-16 text-center">
      <div className="mb-4 rounded-full bg-gray-100 p-4">
        <Library className="h-8 w-8 text-gray-400" />
      </div>
      <Text className="text-sm font-medium text-gray-900">คลังยังว่าง</Text>
      <Text className="mt-1 max-w-md text-sm text-gray-500">
        ยืนยันรายการในแคตตาล็อกแล้วกด &quot;บันทึกเข้าคลัง&quot; — ครั้งหน้าระบบจะเติมสเปก ราคา
        และรูปให้อัตโนมัติ
      </Text>
      <Button className="mt-4" size="sm" asChild>
        <Link href={`/${orgSlug}/gov-procure/catalogs`}>ไปที่แคตตาล็อก</Link>
      </Button>
    </div>
  );
}
