"use client";

// products/page.tsx (production) — A6 สินค้าและบริการ (master catalog)
//   StatCard (สินค้า/บริการ/ทั้งหมด) + filter (ค้นหา + SegmentedControl ประเภท/สถานะ)
//   + Table row→ProductDialog (CRUD API จริง)
// gate §4: products — owner/accountant/staff (W) · viewer (V)

import { useMemo, useState } from "react";
import { Package, Search, ShoppingBag, Wrench, Plus } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { SegmentedControl } from "@/components/ui/segmented";
import { StatCard } from "@/components/ui/stat-card";
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
import {
  AccountingShell,
  useAccountingRole,
  useAccountingData,
  NoAccess,
  fmtMoney,
} from "../_components";
import { ProductDialog } from "../_components/product-dialog";
import type { AccProduct, AccProductKind } from "@/lib/accounting/types";

type KindF = "" | AccProductKind;
type StatusF = "" | "active" | "inactive";

const KIND_OPTIONS: { value: KindF; label: string }[] = [
  { value: "", label: "ทุกประเภท" },
  { value: "good", label: "สินค้า" },
  { value: "service", label: "บริการ" },
];

const STATUS_OPTIONS: { value: StatusF; label: string }[] = [
  { value: "", label: "ทุกสถานะ" },
  { value: "active", label: "ใช้งาน" },
  { value: "inactive", label: "ปิด" },
];

const KIND_META: Record<AccProductKind, { label: string; tone: "success" | "info" }> = {
  good: { label: "สินค้า", tone: "info" },
  service: { label: "บริการ", tone: "success" },
};

export default function ProductsPage() {
  const { can } = useAccountingRole();
  const canView = can("view", "products");
  const canWrite = can("write", "products");

  const { products, loading } = useAccountingData();

  const [search, setSearch] = useState("");
  const [kindF, setKindF] = useState<KindF>("");
  const [statusF, setStatusF] = useState<StatusF>("");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [selected, setSelected] = useState<AccProduct | null>(null);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return products
      .filter((p) => {
        if (kindF && p.kind !== kindF) return false;
        if (statusF === "active" && !p.is_active) return false;
        if (statusF === "inactive" && p.is_active) return false;
        if (q) {
          const hay = `${p.name} ${p.code ?? ""}`.toLowerCase();
          if (!hay.includes(q)) return false;
        }
        return true;
      })
      .sort((a, b) => a.name.localeCompare(b.name, "th"));
  }, [products, search, kindF, statusF]);

  const stats = useMemo(() => {
    const goods = products.filter((p) => p.kind === "good").length;
    const services = products.filter((p) => p.kind === "service").length;
    return { goods, services, total: products.length };
  }, [products]);

  function openAdd() {
    setSelected(null);
    setDialogOpen(true);
  }
  function openEdit(p: AccProduct) {
    setSelected(p);
    setDialogOpen(true);
  }

  if (!canView)
    return (
      <NoAccess title="สินค้าและบริการ" icon={<Package className="h-6 w-6" />}>
        บทบาทนี้ไม่สามารถดูทะเบียนสินค้า/บริการได้
      </NoAccess>
    );

  return (
    <AccountingShell
      title="สินค้าและบริการ"
      description="ทะเบียนสินค้า/บริการ — เลือกใส่ในเอกสารขายได้ทันที ราคาและหน่วยตรงกันทุกบิล"
      icon={<Package className="h-6 w-6" />}
      actions={
        canWrite ? (
          <Button onClick={openAdd}>
            <Plus className="mr-1.5 h-4 w-4" /> เพิ่มสินค้า/บริการ
          </Button>
        ) : undefined
      }
    >
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <StatCard
          icon={<ShoppingBag className="h-4 w-4" />}
          label="สินค้า"
          value={String(stats.goods)}
          tone="info"
        />
        <StatCard
          icon={<Wrench className="h-4 w-4" />}
          label="บริการ"
          value={String(stats.services)}
          tone="positive"
        />
        <StatCard
          icon={<Package className="h-4 w-4" />}
          label="ทั้งหมด"
          value={String(stats.total)}
          tone="neutral"
        />
      </div>

      <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
          <div className="relative flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
            <Input
              className="pl-9"
              placeholder="ค้นหา ชื่อ / รหัสสินค้า"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <SegmentedControl
            value={kindF}
            onChange={setKindF}
            options={KIND_OPTIONS}
            ariaLabel="กรองตามประเภท"
          />
          <SegmentedControl
            value={statusF}
            onChange={setStatusF}
            options={STATUS_OPTIONS}
            ariaLabel="กรองตามสถานะ"
          />
        </div>
      </div>

      <Table className="shadow-sm">
        <TableHeader>
          <TableRow>
            <TableHead>รหัส</TableHead>
            <TableHead>ชื่อ</TableHead>
            <TableHead align="center">ประเภท</TableHead>
            <TableHead>หน่วย</TableHead>
            <TableHead align="right">ราคา/หน่วย</TableHead>
            <TableHead align="center">สถานะ</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {loading.products ? (
            <TableLoading colSpan={6} />
          ) : filtered.length === 0 ? (
            <TableEmpty colSpan={6}>
              <div className="flex flex-col items-center gap-3 py-10 text-center">
                <div className="rounded-full bg-gray-100 p-4">
                  <Package className="h-8 w-8 text-gray-400" />
                </div>
                <div>
                  <div className="text-sm font-medium text-gray-900">ยังไม่มีสินค้า/บริการ</div>
                  <div className="mt-1 text-sm text-gray-500">
                    เพิ่มรายการเพื่อใช้ซ้ำตอนออกเอกสารขาย ราคาและหน่วยตรงกันทุกบิล
                  </div>
                </div>
                {canWrite && (
                  <Button size="sm" onClick={openAdd}>
                    <Plus className="mr-1.5 h-4 w-4" /> เพิ่มรายการแรก
                  </Button>
                )}
              </div>
            </TableEmpty>
          ) : (
            filtered.map((p) => {
              const m = KIND_META[p.kind];
              return (
                <TableRow key={p.id} clickable onClick={() => openEdit(p)}>
                  <TableCell className="whitespace-nowrap font-mono text-xs tabular-nums text-gray-500">
                    {p.code ?? "—"}
                  </TableCell>
                  <TableCell className="text-gray-900">{p.name}</TableCell>
                  <TableCell align="center">
                    <StatusBadge tone={m.tone}>{m.label}</StatusBadge>
                  </TableCell>
                  <TableCell className="whitespace-nowrap text-gray-500">{p.unit ?? "—"}</TableCell>
                  <TableCell align="right" tabular>
                    {fmtMoney(p.unit_price)}
                  </TableCell>
                  <TableCell align="center">
                    {p.is_active ? (
                      <StatusBadge tone="success">ใช้งาน</StatusBadge>
                    ) : (
                      <StatusBadge tone="neutral">ปิด</StatusBadge>
                    )}
                  </TableCell>
                </TableRow>
              );
            })
          )}
        </TableBody>
      </Table>

      <ProductDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        product={selected}
        canWrite={canWrite}
      />
    </AccountingShell>
  );
}
