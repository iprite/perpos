"use client";

// _catalog-workspace-client.tsx — ห้องทำงานแคตตาล็อก (client view: filter/dialog/mutation)
// server ส่ง initial (catalog + items + stats) มาแล้ว — ไฟล์นี้ไม่ fetch ตอน mount (ยกเว้นรูป/สถานะ job)
//
// กติกาที่ล็อกไว้ (spec §5.9 B):
//  B2 — แถบ disclaimer ถาวรใต้ header จนกว่าชุดจะ `approved` (ถ้อยคำเป๊ะ, ≥ text-xs text-gray-600)
//  B4 — ล็อก "ระดับแถว" ระหว่าง AI ทำงาน (queued/running) ไม่ล็อกทั้งตาราง · ปุ่มระดับชุดถูก disable
//  P1-1 — โหมด `ตาราง | อ่านเนื้อหา` · P1-2 — ตาราง 7 คอลัมน์ สีเฉพาะคอลัมน์ "ต้องตรวจ"
//  P1-4 — ป้าย "ประมาณการ" ใต้ราคา AI ทุกใบ + KPI มูลค่า tone neutral (ตัวเลขสีเข้ม ไม่ระบายสี)
//  P1-5 — สื่อสารความคืบหน้าเป็นช่วงลำดับรายการ ("รายการที่ 33–40 จาก 84") เท่านั้น

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  BookImage,
  CheckCircle2,
  ClipboardCheck,
  FileDown,
  FilterX,
  ImageOff,
  Library,
  ListChecks,
  ListPlus,
  PackageOpen,
  Search,
  Settings2,
  ShieldAlert,
  Sparkles,
  Wallet,
} from "lucide-react";
import { PageShell } from "@/components/ui/page-shell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { CustomSelect } from "@/components/ui/custom-select";
import { SegmentedControl } from "@/components/ui/segmented";
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
  TableLoading,
} from "@/components/ui/table";
import { toast } from "@/lib/toast";
import type { Catalog, CatalogItem, CatalogItemStats } from "@/lib/gov-procure/catalog";
import type { GovProcureOrder } from "@/lib/gov-procure/types";
import { govApi } from "../../_components/api";
import { CatalogStatusBadge, IssueChips, SourceBadge } from "../_components/badges";
import { ItemReviewDialog } from "../_components/item-dialog";
import { AiEnrichPanel } from "../_components/ai-enrich-panel";
import { PasteItemsDialog } from "../_components/paste-items-dialog";
import { CatalogSettingsDialog } from "../_components/catalog-settings-dialog";
import { ExportDialog } from "../_components/export-dialog";
import { VerifyBulkDialog } from "../_components/verify-bulk-dialog";
import { SaveToLibraryDialog } from "../_components/save-to-library-dialog";
import { fetchItemImageUrls } from "../_components/image-api";
import {
  computeIssues,
  computeStats,
  fmtDateTime,
  fmtMoney,
  fmtNum,
  fmtQty,
  isItemLocked,
  matchesTab,
  priceEstimateLabel,
  sumEstimatedValue,
  TAB_LABELS,
  TAB_ORDER,
  TEMPLATE_LABEL,
  type WorkspaceTab,
} from "../_components/format";

/** ถ้อยคำบังคับ (B2) — ห้ามดัดแปลง */
const DISCLAIMER =
  "เนื้อหาและราคาสร้างโดย AI จากความรู้ทั่วไป ไม่ได้ค้นราคาตลาดจริง — โปรดตรวจยี่ห้อ รุ่น และราคา ก่อนใช้ยื่นหน่วยงานราชการ";

const SORT_OPTIONS = [
  { value: "seq", label: "เรียงตามลำดับ" },
  { value: "issues", label: "ที่ต้องตรวจก่อน" },
  { value: "value", label: "มูลค่าสูงสุดก่อน" },
];

/** ต่ออายุ signed URL ของรูปก่อนหมดอายุ (server เซ็นไว้ 5 นาที) */
const IMAGE_REFRESH_MS = 4 * 60 * 1000;

export function CatalogWorkspaceClient({
  catalog: initialCatalog,
  initialItems,
  total,
  truncated,
  serverStats,
  orders,
  orgId,
  orgSlug,
  canWrite,
  canDelete,
  costPerCallThb,
  chunkSize,
}: {
  catalog: Catalog;
  initialItems: CatalogItem[];
  total: number;
  truncated: boolean;
  serverStats: CatalogItemStats;
  orders: GovProcureOrder[];
  orgId: string;
  orgSlug: string;
  /** owner/manager/staff = true · viewer อ่านอย่างเดียว (มาจาก guard ฝั่ง server) */
  canWrite: boolean;
  /** owner/manager เท่านั้น (ลบชุด) */
  canDelete: boolean;
  /** ค่าใช้จ่ายเฉลี่ยต่อ 1 คำขอ AI (บาท) — คิดฝั่ง server จาก lib/gov-procure/catalog-cost */
  costPerCallThb: number;
  chunkSize: number;
}) {
  const [catalog, setCatalog] = useState<Catalog>(initialCatalog);
  const catalogId = catalog.id;

  const [items, setItems] = useState<CatalogItem[]>(initialItems);
  const [itemTotal, setItemTotal] = useState(total);
  const [isTruncated, setIsTruncated] = useState(truncated);
  const [loadingMore, setLoadingMore] = useState(false);

  const [tab, setTab] = useState<WorkspaceTab>(catalog.status === "review" ? "todo" : "all");
  const [q, setQ] = useState("");
  const [category, setCategory] = useState("");
  const [sort, setSort] = useState("seq");
  const [view, setView] = useState<"table" | "read">("table");

  const [openId, setOpenId] = useState<string | null>(null);
  /** คิว freeze ตอนเปิด dialog — สลับแท็บ/พิมพ์ค้นหาระหว่างเปิดไม่ทำให้คิวหด (B3 ข้อ 3) */
  const [queue, setQueue] = useState<string[]>([]);

  const [pasteOpen, setPasteOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [exportOpen, setExportOpen] = useState(false);
  const [verifyOpen, setVerifyOpen] = useState(false);
  const [libraryOpen, setLibraryOpen] = useState(false);
  const [aiRunning, setAiRunning] = useState(false);

  const [imageUrls, setImageUrls] = useState<Record<string, string>>({});
  const imageReqRef = useRef<Set<string>>(new Set());

  // signed URL ของรูป — ขอเป็นชุดเดียวต่อรอบ (id เท่านั้น ไม่มี path ดิบ)
  useEffect(() => {
    const need = items
      .filter((i) => i.image_path && !imageReqRef.current.has(i.id))
      .map((i) => i.id);
    if (need.length === 0) return;
    need.forEach((id) => imageReqRef.current.add(id));
    fetchItemImageUrls(orgId, need)
      .then((urls) => setImageUrls((prev) => ({ ...prev, ...urls })))
      .catch(() => {
        /* รูปโหลดไม่ได้ → แสดงกล่องเส้นประแทน (ไม่รบกวนผู้ใช้) */
      });
  }, [items, orgId]);

  // ค้างหน้านานกว่าอายุ URL → ขอใหม่ทั้งชุด (ไม่งั้นรูปหายเงียบ ๆ)
  useEffect(() => {
    const timer = window.setInterval(() => {
      const ids = items.filter((i) => i.image_path).map((i) => i.id);
      if (ids.length === 0) return;
      fetchItemImageUrls(orgId, ids)
        .then((urls) => setImageUrls((prev) => ({ ...prev, ...urls })))
        .catch(() => {
          /* ต่ออายุไม่สำเร็จ → รอบหน้าลองใหม่ */
        });
    }, IMAGE_REFRESH_MS);
    return () => window.clearInterval(timer);
  }, [items, orgId]);

  /** โหลดรายการใหม่ทั้งชุด (ใช้หลัง AI ทำเสร็จแต่ละรอบ / bulk / วางรายการ) */
  const refreshItems = useCallback(async () => {
    try {
      const res = await govApi<{ items: CatalogItem[]; total: number; truncated: boolean }>(
        `/api/gov-procure/catalogs/${catalogId}/items?orgId=${encodeURIComponent(orgId)}&limit=500`,
        "GET",
      );
      setItems(res.items ?? []);
      setItemTotal(res.total ?? 0);
      setIsTruncated(res.truncated ?? false);
    } catch {
      /* โหลดใหม่ไม่สำเร็จ → คงข้อมูลเดิมไว้ (ผู้ใช้ยังทำงานต่อได้) */
    }
  }, [catalogId, orgId]);

  const categoryOptions = useMemo(() => {
    const set = new Set<string>();
    items.forEach((i) => {
      if (i.category) set.add(i.category);
    });
    return [
      { value: "", label: "ทุกหมวดหมู่" },
      ...Array.from(set)
        .sort()
        .map((c) => ({ value: c, label: c })),
    ];
  }, [items]);

  /** ขอบเขตของ bulk — server รับ q + category (ไม่ผูกกับแท็บ) จึงต้องคิดให้ตรงกัน */
  const scopeItems = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return items.filter((i) => {
      if (category && i.category !== category) return false;
      if (needle && !i.name.toLowerCase().includes(needle)) return false;
      return true;
    });
  }, [items, q, category]);

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    const rows = items.filter((i) => {
      if (!matchesTab(i, tab)) return false;
      if (category && i.category !== category) return false;
      if (needle) {
        const hay = `${i.name} ${i.brand_model ?? ""} ${i.spec_line ?? ""}`.toLowerCase();
        if (!hay.includes(needle)) return false;
      }
      return true;
    });

    if (sort === "issues") {
      return [...rows].sort(
        (a, b) => computeIssues(b).length - computeIssues(a).length || a.seq_no - b.seq_no,
      );
    }
    if (sort === "value") {
      const val = (i: CatalogItem) => (i.qty ?? 0) * (i.unit_price_ref ?? 0);
      return [...rows].sort((a, b) => val(b) - val(a) || a.seq_no - b.seq_no);
    }
    return [...rows].sort((a, b) => a.seq_no - b.seq_no);
  }, [items, tab, category, q, sort]);

  const tabCounts = useMemo(() => {
    const out = {} as Record<WorkspaceTab, number>;
    TAB_ORDER.forEach((t) => {
      out[t] = items.filter((i) => matchesTab(i, t)).length;
    });
    return out;
  }, [items]);

  // KPI — คิดจาก items ได้เฉพาะเมื่อโหลดครบ (ห้ามคิดยอดจาก array ที่ถูกตัด)
  const stats = useMemo(
    () => (isTruncated ? serverStats : computeStats(items)),
    [isTruncated, serverStats, items],
  );

  const upsertItem = useCallback((next: CatalogItem) => {
    setItems((prev) => prev.map((i) => (i.id === next.id ? next : i)));
  }, []);

  const removeItem = useCallback((id: string) => {
    setItems((prev) => prev.filter((i) => i.id !== id));
    setItemTotal((n) => Math.max(0, n - 1));
    setOpenId(null);
  }, []);

  const openItem = useCallback(
    (item: CatalogItem) => {
      if (isItemLocked(item)) return;
      setQueue(filtered.map((i) => i.id));
      setOpenId(item.id);
    },
    [filtered],
  );

  const closeDialog = useCallback(() => setOpenId(null), []);

  const navigate = useCallback(
    (dir: -1 | 1) => {
      setOpenId((current) => {
        if (!current) return current;
        const idx = queue.indexOf(current);
        const nextIdx = idx + dir;
        if (idx < 0 || nextIdx < 0 || nextIdx >= queue.length) return current;
        return queue[nextIdx];
      });
    },
    [queue],
  );

  const loadMore = useCallback(async () => {
    setLoadingMore(true);
    try {
      const res = await govApi<{ items: CatalogItem[]; total: number; truncated: boolean }>(
        `/api/gov-procure/catalogs/${catalogId}/items?orgId=${encodeURIComponent(orgId)}&offset=${items.length}&limit=500`,
        "GET",
      );
      setItems((prev) => {
        const seen = new Set(prev.map((i) => i.id));
        return [...prev, ...res.items.filter((i) => !seen.has(i.id))];
      });
      setIsTruncated(res.truncated);
      toast.success(`โหลดเพิ่ม ${res.items.length} รายการแล้ว`);
    } catch (e) {
      toast.error((e as Error).message || "โหลดรายการเพิ่มไม่สำเร็จ");
    } finally {
      setLoadingMore(false);
    }
  }, [catalogId, orgId, items.length]);

  const openItemData = openId ? (items.find((i) => i.id === openId) ?? null) : null;
  const queueIndex = openId ? queue.indexOf(openId) : -1;
  const hasFilter = Boolean(q || category || tab !== "all");
  const filteredValue = sumEstimatedValue(filtered);
  const verifiedPct = stats.total > 0 ? Math.round((stats.verified / stats.total) * 100) : 0;
  const verifiedAll = stats.total > 0 && stats.verified === stats.total;
  const maxSeq = items.reduce((max, i) => Math.max(max, i.seq_no), 0);
  const setLevelDisabled = aiRunning || catalog.status === "enriching";

  function clearFilters() {
    setQ("");
    setCategory("");
    setTab("all");
  }

  return (
    <PageShell
      width="full"
      icon={<BookImage className="h-6 w-6" />}
      title={catalog.title}
      description={`${fmtNum(stats.total)} รายการ · ${catalog.company ?? "ไม่ระบุบริษัท"} · เทมเพลต${
        TEMPLATE_LABEL[catalog.template]
      } · แก้ล่าสุด ${fmtDateTime(catalog.updated_at)}`}
      actions={<CatalogStatusBadge status={catalog.status} />}
    >
      <div className="space-y-5">
        {/* แถบเครื่องมือระดับชุด — จงใจ "ไม่" ยัดลง PageShell.actions
            actions เป็น flex-shrink-0 → ปุ่มหลายตัวจะบีบช่องหัวข้อจนชื่อชุด
            (ยาวได้ตามที่ผู้ใช้ตั้ง) แตกเป็นตัวอักษรละบรรทัด. หน้าอื่นในโมดูลใส่แค่ 1–2 ปุ่ม
            ที่นี่มี 4 ปุ่ม จึงวางเป็นแถวของตัวเองที่ยุบ/ตัดบรรทัดได้ */}
        <div className="flex flex-wrap items-center gap-2">
          <Button variant="ghost" onClick={() => setSettingsOpen(true)}>
            <Settings2 className="mr-1.5 h-4 w-4" /> ตั้งค่าชุด
          </Button>
          <Button variant="outline" disabled={setLevelDisabled} onClick={() => setExportOpen(true)}>
            <FileDown className="mr-1.5 h-4 w-4" /> ส่งออกเอกสาร
          </Button>
          {canWrite && (
            <>
              <Button
                variant="outline"
                disabled={setLevelDisabled || stats.verified === 0}
                onClick={() => setLibraryOpen(true)}
              >
                <Library className="mr-1.5 h-4 w-4" /> บันทึกเข้าคลัง
              </Button>
              <Button
                disabled={setLevelDisabled || verifiedAll || stats.total === 0}
                onClick={() => setVerifyOpen(true)}
              >
                <ClipboardCheck className="mr-1.5 h-4 w-4" /> ยืนยันทั้งชุด
              </Button>
            </>
          )}
        </div>

        {setLevelDisabled && (
          <Text className="px-1 text-xs text-gray-500">
            ส่งออก / ยืนยันทั้งชุด / บันทึกเข้าคลัง ทำได้หลัง AI เติมข้อมูลเสร็จ —
            ระหว่างนี้ยังแก้รายการที่ AI ทำเสร็จแล้วได้ตามปกติ
          </Text>
        )}

        {/* B2 — แถบ disclaimer ถาวร (ปิดไม่ได้ จนกว่าชุดจะอนุมัติ) */}
        {catalog.status !== "approved" && (
          <div className="flex items-start gap-3 rounded-xl border border-primary/20 bg-primary/[0.03] p-4">
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
              <ShieldAlert className="h-4 w-4" />
            </span>
            <div className="min-w-0">
              <Text className="text-sm font-semibold text-gray-900">ตรวจก่อนใช้งานจริง</Text>
              <Text className="mt-0.5 text-xs text-gray-600">{DISCLAIMER}</Text>
            </div>
          </div>
        )}

        {/* KPI — ตอบว่า "เหลืออะไรต้องทำ" */}
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <StatCard
            icon={<ClipboardCheck className="h-4 w-4" />}
            label="ตรวจแล้ว"
            value={`${fmtNum(stats.verified)}/${fmtNum(stats.total)}`}
            sub={`คิดเป็น ${verifiedPct}% · เหลือ ${fmtNum(stats.total - stats.verified)} รายการ`}
            tone={verifiedAll ? "positive" : "warning"}
          />
          <StatCard
            icon={<Sparkles className="h-4 w-4" />}
            label="AI เดา — รอตรวจ"
            value={`${fmtNum(stats.ai_draft)} รายการ`}
            sub={`ความเชื่อมั่นต่ำ ${fmtNum(stats.low_conf)} · ยังไม่เปิดอ่าน ${fmtNum(stats.not_viewed)}`}
            tone="warning"
          />
          <StatCard
            icon={<ImageOff className="h-4 w-4" />}
            label="ยังไม่มีรูป"
            value={`${fmtNum(stats.no_image)} รายการ`}
            sub="ต้องมีครบก่อนออกเอกสาร"
            tone={stats.no_image > 0 ? "negative" : "positive"}
          />
          <StatCard
            icon={<Wallet className="h-4 w-4" />}
            label="มูลค่าประมาณการรวม"
            value={fmtMoney(stats.est_value)}
            sub="ประมาณการจาก AI — ห้ามใช้ตั้งราคาเสนอโดยไม่ตรวจ"
            tone="neutral"
          />
        </div>

        {items.length > 0 && (
          <AiEnrichPanel
            catalog={catalog}
            items={items}
            orgId={orgId}
            canWrite={canWrite}
            costPerCallThb={costPerCallThb}
            chunkSize={chunkSize}
            onRoundFinished={refreshItems}
            onCatalogStatusChanged={(status) => setCatalog((c) => ({ ...c, status }))}
            onRunningChange={setAiRunning}
          />
        )}

        {items.length === 0 ? (
          <EmptyItems canWrite={canWrite} onPaste={() => setPasteOpen(true)} />
        ) : (
          <>
            {/* แท็บ + ตัวกรอง + โหมดดู — แถวเดียว ล้นแล้วเลื่อน (DESIGN §4) */}
            <div className="flex items-center gap-2 overflow-x-auto rounded-xl border border-gray-200 bg-white p-1.5 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
              {TAB_ORDER.map((t) => (
                <Button
                  key={t}
                  size="sm"
                  variant={tab === t ? "secondary" : "ghost"}
                  className={`shrink-0 whitespace-nowrap ${tab === t ? "bg-gray-100 text-gray-900" : ""}`}
                  onClick={() => setTab(t)}
                >
                  {TAB_LABELS[t]} ({fmtNum(tabCounts[t])})
                </Button>
              ))}

              <div className="relative ml-1 w-56 shrink-0">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
                <Input
                  className="h-8 pl-9"
                  placeholder="ค้นหาชื่อสินค้า / รุ่น"
                  value={q}
                  onChange={(e) => setQ(e.target.value)}
                />
              </div>
              <CustomSelect
                value={category}
                onChange={setCategory}
                options={categoryOptions}
                className="w-40 shrink-0"
              />
              <CustomSelect
                value={sort}
                onChange={setSort}
                options={SORT_OPTIONS}
                className="w-44 shrink-0"
              />
              {canWrite && (
                <Button
                  variant="ghost"
                  size="sm"
                  className="shrink-0 whitespace-nowrap"
                  disabled={setLevelDisabled}
                  onClick={() => setPasteOpen(true)}
                >
                  <ListPlus className="mr-1.5 h-4 w-4" /> วางรายการเพิ่ม
                </Button>
              )}
              <div className="ml-auto shrink-0 pl-2">
                <SegmentedControl
                  size="sm"
                  value={view}
                  onChange={(v) => setView(v)}
                  ariaLabel="โหมดการดูรายการ"
                  options={[
                    { value: "table", label: "ตาราง" },
                    { value: "read", label: "อ่านเนื้อหา" },
                  ]}
                />
              </div>
            </div>

            <Text className="px-1 text-xs text-gray-500">
              {view === "table"
                ? "โหมดตาราง — กวาดตาหาแถวที่ต้องแตะ แล้วคลิกแถวเพื่อเปิดตรวจทีละรายการ"
                : "โหมดอ่านเนื้อหา — เห็นรายละเอียดที่ AI เขียนครบทุกบรรทัด ตรวจได้จากการ์ดเลย"}
            </Text>

            {/* N6 — เตือนเมื่อโหลดรายการมาไม่ครบ (ห้ามเชื่อยอดสรุปจากชุดที่ถูกตัด) */}
            {isTruncated && (
              <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-amber-200 bg-amber-50 p-3">
                <Text className="text-xs text-amber-700">
                  แสดง {fmtNum(items.length)} จาก {fmtNum(itemTotal)} รายการ —
                  ตัวเลขสรุปด้านบนมาจากฐานข้อมูลทั้งชุด แต่ตารางยังโหลดไม่ครบ
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

            {view === "table" ? (
              <ItemsTable
                rows={filtered}
                loading={loadingMore}
                total={stats.total}
                filteredValue={filteredValue}
                imageUrls={imageUrls}
                hasFilter={hasFilter}
                selectedId={openId}
                onOpen={openItem}
                onClearFilters={clearFilters}
              />
            ) : (
              <ReadingList
                rows={filtered}
                imageUrls={imageUrls}
                hasFilter={hasFilter}
                onOpen={openItem}
                onClearFilters={clearFilters}
              />
            )}
          </>
        )}
      </div>

      <ItemReviewDialog
        open={openId !== null}
        item={openItemData}
        queueIndex={queueIndex}
        queueSize={queue.length}
        totalItems={stats.total}
        canWrite={canWrite}
        orgId={orgId}
        catalogId={catalogId}
        imageUrl={openId ? imageUrls[openId] : undefined}
        onItemUpdated={upsertItem}
        onItemDeleted={removeItem}
        onImageChanged={refreshItems}
        onNavigate={navigate}
        onClose={closeDialog}
      />

      <PasteItemsDialog
        open={pasteOpen}
        onOpenChange={setPasteOpen}
        orgId={orgId}
        catalogId={catalogId}
        startSeq={maxSeq + 1}
        onAdded={() => void refreshItems()}
      />

      <CatalogSettingsDialog
        open={settingsOpen}
        onOpenChange={setSettingsOpen}
        catalog={catalog}
        orders={orders}
        orgId={orgId}
        orgSlug={orgSlug}
        canWrite={canWrite}
        canDelete={canDelete}
        verifiedAll={verifiedAll}
        onSaved={setCatalog}
      />

      <ExportDialog
        open={exportOpen}
        onOpenChange={setExportOpen}
        catalog={catalog}
        stats={stats}
        orgId={orgId}
        onOpenSettings={() => {
          setExportOpen(false);
          setSettingsOpen(true);
        }}
      />

      <VerifyBulkDialog
        open={verifyOpen}
        onOpenChange={setVerifyOpen}
        orgId={orgId}
        catalogId={catalogId}
        scopeItems={scopeItems}
        q={q.trim()}
        category={category}
        onDone={() => void refreshItems()}
      />

      <SaveToLibraryDialog
        open={libraryOpen}
        onOpenChange={setLibraryOpen}
        orgId={orgId}
        items={items}
        onDone={() => void refreshItems()}
      />
    </PageShell>
  );
}

/** ตาราง 7 คอลัมน์ (P1-2) — ข้อมูลดิบ neutral ล้วน สีอยู่ที่คอลัมน์ "ต้องตรวจ" เท่านั้น */
function ItemsTable({
  rows,
  loading,
  total,
  filteredValue,
  imageUrls,
  hasFilter,
  selectedId,
  onOpen,
  onClearFilters,
}: {
  rows: CatalogItem[];
  loading: boolean;
  total: number;
  filteredValue: number;
  imageUrls: Record<string, string>;
  hasFilter: boolean;
  selectedId: string | null;
  onOpen: (item: CatalogItem) => void;
  onClearFilters: () => void;
}) {
  return (
    <Table stickyHeader maxHeight="calc(100vh - 300px)" className="shadow-sm">
      <TableHeader sticky>
        <TableRow>
          <TableHead align="right">ลำดับ</TableHead>
          <TableHead>สินค้า</TableHead>
          <TableHead align="right">จำนวน</TableHead>
          <TableHead align="right">ราคา/หน่วย</TableHead>
          <TableHead align="center">รูป</TableHead>
          <TableHead align="center">ที่มาข้อมูล</TableHead>
          <TableHead>ต้องตรวจ</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {loading ? (
          <TableLoading colSpan={7} />
        ) : rows.length === 0 ? (
          <TableEmpty colSpan={7}>
            <div className="flex flex-col items-center gap-2 py-6">
              {hasFilter ? (
                <>
                  <CheckCircle2 className="h-8 w-8 text-green-500" />
                  <span>ไม่มีรายการค้างในมุมมองนี้ — ตรวจครบแล้ว</span>
                  <Button variant="outline" size="sm" className="mt-1" onClick={onClearFilters}>
                    <FilterX className="mr-1.5 h-4 w-4" /> ดูรายการทั้งหมด
                  </Button>
                </>
              ) : (
                <>
                  <Search className="h-8 w-8 text-gray-300" />
                  <span>ไม่พบรายการตามเงื่อนไข</span>
                </>
              )}
            </div>
          </TableEmpty>
        ) : (
          rows.map((item) => {
            const locked = isItemLocked(item);
            const estimate = priceEstimateLabel(item);
            return (
              <TableRow
                key={item.id}
                clickable={!locked}
                selected={item.id === selectedId}
                className={locked ? "cursor-default opacity-60" : undefined}
                onClick={locked ? undefined : () => onOpen(item)}
              >
                <TableCell align="right" tabular className="text-gray-500">
                  {item.seq_no}
                </TableCell>
                <TableCell>
                  {locked ? (
                    <div className="h-8 w-52 animate-pulse rounded bg-gray-100" />
                  ) : (
                    <div className="min-w-0 max-w-[260px]">
                      <div className="truncate font-medium text-gray-900">{item.name}</div>
                      <div className="truncate text-xs text-gray-500">
                        {item.spec_line ?? "— ยังไม่มีสเปก —"}
                      </div>
                    </div>
                  )}
                </TableCell>
                <TableCell align="right" className="tabular-nums text-gray-700">
                  {fmtQty(item.qty, item.unit)}
                </TableCell>
                <TableCell align="right" tabular>
                  {locked ? (
                    <div className="ml-auto h-4 w-16 animate-pulse rounded bg-gray-100" />
                  ) : item.unit_price_ref === null ? (
                    <span className="text-gray-400">—</span>
                  ) : (
                    <div className="flex flex-col items-end">
                      <span>{fmtMoney(item.unit_price_ref)}</span>
                      {estimate && (
                        <span className="font-sans text-[11px] text-gray-500">{estimate}</span>
                      )}
                    </div>
                  )}
                </TableCell>
                <TableCell align="center">
                  <ItemThumb name={item.name} url={imageUrls[item.id]} />
                </TableCell>
                <TableCell align="center">
                  <SourceBadge source={item.source} />
                </TableCell>
                <TableCell>
                  {locked ? (
                    <StatusBadge tone="info" className="gap-1">
                      <Sparkles className="h-3 w-3 animate-pulse" /> AI กำลังเติมข้อมูล
                    </StatusBadge>
                  ) : (
                    <IssueChips issues={computeIssues(item)} />
                  )}
                </TableCell>
              </TableRow>
            );
          })
        )}
      </TableBody>
      {rows.length > 0 && (
        <TableFooter>
          <TableRow>
            <TableCell colSpan={3} className="font-medium text-gray-700">
              แสดง {fmtNum(rows.length)} จาก {fmtNum(total)} รายการ
            </TableCell>
            <TableCell align="right" tabular className="font-semibold text-gray-900">
              {fmtMoney(filteredValue)}
            </TableCell>
            <TableCell colSpan={3} className="text-xs text-gray-500">
              มูลค่าประมาณการเฉพาะที่กรอง
            </TableCell>
          </TableRow>
        </TableFooter>
      )}
    </Table>
  );
}

function ItemThumb({ name, url }: { name: string; url?: string }) {
  if (!url) {
    return (
      <span className="mx-auto flex h-9 w-9 items-center justify-center rounded border border-dashed border-gray-300" />
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

/** โหมด "อ่านเนื้อหา" (P1-1) — การ์ด 1 คอลัมน์ เห็น bullets ครบทุกข้อ */
function ReadingList({
  rows,
  imageUrls,
  hasFilter,
  onOpen,
  onClearFilters,
}: {
  rows: CatalogItem[];
  imageUrls: Record<string, string>;
  hasFilter: boolean;
  onOpen: (item: CatalogItem) => void;
  onClearFilters: () => void;
}) {
  if (rows.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center rounded-xl border border-gray-200 bg-white py-16 text-center">
        <div className="mb-4 rounded-full bg-gray-100 p-4">
          <CheckCircle2 className="h-8 w-8 text-gray-400" />
        </div>
        <Text className="text-sm font-medium text-gray-900">ไม่มีรายการในมุมมองนี้</Text>
        {hasFilter && (
          <Button variant="outline" size="sm" className="mt-4" onClick={onClearFilters}>
            <FilterX className="mr-1.5 h-4 w-4" /> ดูรายการทั้งหมด
          </Button>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {rows.map((item) => {
        const locked = isItemLocked(item);
        const estimate = priceEstimateLabel(item);
        return (
          <div key={item.id} className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0">
                <Text className="text-sm font-semibold text-gray-900">
                  #{item.seq_no} · {item.name}
                </Text>
                <Text className="mt-0.5 text-xs text-gray-500">
                  {item.spec_line ?? "— ยังไม่มีสเปก —"}
                  {item.size_line ? ` · ${item.size_line}` : ""}
                </Text>
              </div>
              <div className="flex shrink-0 items-center gap-2">
                <SourceBadge source={item.source} />
                <IssueChips issues={computeIssues(item)} />
              </div>
            </div>

            <div className="mt-3 flex flex-wrap gap-4">
              <ItemThumb name={item.name} url={imageUrls[item.id]} />
              <ul className="min-w-0 flex-1 space-y-1">
                {item.bullets.length === 0 ? (
                  <li className="text-xs text-gray-500">ยังไม่มีรายละเอียดสินค้า</li>
                ) : (
                  item.bullets.map((b, i) => (
                    <li key={i} className="flex items-start gap-2 text-sm text-gray-700">
                      <span className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-gray-400" />
                      {b}
                    </li>
                  ))
                )}
              </ul>
              <div className="shrink-0 text-right">
                <div className="font-mono text-sm tabular-nums text-gray-900">
                  {fmtMoney(item.unit_price_ref)}
                </div>
                {estimate && <div className="text-[11px] text-gray-500">{estimate}</div>}
                <div className="mt-0.5 text-xs tabular-nums text-gray-500">
                  {fmtQty(item.qty, item.unit)}
                </div>
              </div>
            </div>

            <div className="mt-3 flex justify-end">
              <Button size="sm" variant="outline" disabled={locked} onClick={() => onOpen(item)}>
                <ListChecks className="mr-1.5 h-4 w-4" /> เปิดตรวจรายการ
              </Button>
            </div>
          </div>
        );
      })}
    </div>
  );
}

/** empty state (DESIGN §8) — ชุดที่ยังไม่มีรายการ */
function EmptyItems({ canWrite, onPaste }: { canWrite: boolean; onPaste: () => void }) {
  return (
    <div className="flex flex-col items-center justify-center rounded-xl border border-gray-200 bg-white py-16 text-center">
      <div className="mb-4 rounded-full bg-gray-100 p-4">
        <PackageOpen className="h-8 w-8 text-gray-400" />
      </div>
      <Text className="text-sm font-medium text-gray-900">ชุดนี้ยังไม่มีรายการสินค้า</Text>
      <Text className="mt-1 max-w-md text-sm text-gray-500">
        วางรายการจาก TOR หรือใบเสนอราคาเข้ามาก่อน แล้วให้ AI เติมสเปก รายละเอียด
        และราคาประมาณการให้ทั้งเล่ม
      </Text>
      {canWrite && (
        <Button className="mt-4" size="sm" onClick={onPaste}>
          <ListPlus className="mr-1.5 h-4 w-4" /> วางรายการสินค้า
        </Button>
      )}
    </div>
  );
}
