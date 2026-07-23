"use client";

// products/page.tsx — แบบพรม & ขนาด/ราคา (ข้อมูลหลัก)
// pattern ล็อกจากหน้า /orders: MattiiShell + StatCard + FilterBar + Table primitives (row click → dialog)
// 🔒 owner-only §2.3: `base_cost` (ต้นทุนต่อขนาด) ซ่อนทั้งคอลัมน์ + การ์ด "สำหรับเจ้าของ"
// mock: แก้ราคา/เพิ่มขนาด/เพิ่มแบบพรม เก็บใน client state ของหน้านี้ (refresh แล้ว reset)

import { useEffect, useMemo, useState } from "react";
import { Layers, Package, Plus, Ruler, Search, Coins } from "lucide-react";
import { Button } from "@/components/ui/button";
import { CustomSelect } from "@/components/ui/custom-select";
import { Input } from "@/components/ui/input";
import { StatCard } from "@/components/ui/stat-card";
import { StatusBadge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableEmpty,
  TableHead,
  TableHeader,
  TableLoading,
  TableRow,
} from "@/components/ui/table";
import { EDGE_FINISH_LABEL, RUG_CATEGORY_LABEL } from "../_fixtures/labels";
import type { MattiiProduct, MattiiProductSize, RugCategory } from "../_fixtures/types";
import {
  FilterBar,
  MattiiShell,
  NoAccess,
  SectionHeading,
  fmtMoney,
  fmtNum,
  useMattiiData,
  useMattiiRole,
} from "../_components";
import { ProductDialog } from "./product-dialog";
import { ProductFormDialog } from "./product-form-dialog";

/** §1.2 NAV_BY_ROLE — หน้านี้อยู่ในเมนูของ "เจ้าของ/ผู้จัดการ" เท่านั้น */
const ALLOWED_ROLES = ["owner"];

const CATEGORY_OPTIONS = [
  { value: "", label: "ทุกประเภท" },
  ...(Object.keys(RUG_CATEGORY_LABEL) as RugCategory[]).map((k) => ({
    value: k as string,
    label: RUG_CATEGORY_LABEL[k],
  })),
];

const ACTIVE_OPTIONS = [
  { value: "", label: "ทั้งหมด" },
  { value: "active", label: "เปิดขาย" },
  { value: "inactive", label: "ปิดขาย" },
];

/** ช่วงราคาของแบบพรม 1 แบบ (จากขนาดมาตรฐานที่เปิดใช้งาน) */
function priceRange(sizes: MattiiProductSize[]): string {
  const standard = sizes.filter((s) => s.size_kind === "standard" && s.is_active);
  if (standard.length === 0) {
    const custom = sizes.find((s) => s.size_kind === "custom_cut" && s.price_per_sqm);
    return custom?.price_per_sqm ? `${fmtMoney(custom.price_per_sqm)} / ตร.ม.` : "—";
  }
  const prices = standard.map((s) => s.unit_price);
  const min = Math.min(...prices);
  const max = Math.max(...prices);
  return min === max ? fmtMoney(min) : `${fmtMoney(min)} – ${fmtMoney(max)}`;
}

export default function ProductsPage() {
  const { role, isOwner } = useMattiiRole();
  const seed = useMattiiData();

  const [products, setProducts] = useState<MattiiProduct[]>(() => seed.products);
  const [sizes, setSizes] = useState<MattiiProductSize[]>(() => seed.productSizes);
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState<RugCategory | "">("");
  const [active, setActive] = useState("");
  const [openId, setOpenId] = useState<string | null>(null);
  const [formFor, setFormFor] = useState<MattiiProduct | null | "new">(null);
  const [loading, setLoading] = useState(true);

  // โหลดครั้งแรก (จำลองเวลาดึงข้อมูล) → โชว์ skeleton ตาม DESIGN §9
  useEffect(() => {
    const t = window.setTimeout(() => setLoading(false), 350);
    return () => window.clearTimeout(t);
  }, []);

  const visible = useMemo(() => {
    const q = search.trim().toLowerCase();
    return products.filter((p) => {
      if (q && !`${p.code} ${p.name}`.toLowerCase().includes(q)) return false;
      if (category && p.category !== category) return false;
      if (active === "active" && !p.is_active) return false;
      if (active === "inactive" && p.is_active) return false;
      return true;
    });
  }, [products, search, category, active]);

  const sizesOf = useMemo(() => {
    const map = new Map<string, MattiiProductSize[]>();
    for (const s of sizes) {
      const list = map.get(s.product_id) ?? [];
      list.push(s);
      map.set(s.product_id, list);
    }
    for (const list of Array.from(map.values())) {
      list.sort((a, b) => a.sort_order - b.sort_order);
    }
    return map;
  }, [sizes]);

  const summary = useMemo(() => {
    const standard = sizes.filter((s) => s.size_kind === "standard" && s.is_active);
    const marginSum = standard.reduce((sum, s) => sum + (s.unit_price - s.base_cost), 0);
    return {
      total: products.length,
      activeCount: products.filter((p) => p.is_active).length,
      sizeCount: sizes.filter((s) => s.is_active).length,
      avgMargin: standard.length > 0 ? marginSum / standard.length : 0,
    };
  }, [products, sizes]);

  const filtered = Boolean(search || category || active);

  function clearFilters() {
    setSearch("");
    setCategory("");
    setActive("");
  }

  const opened = openId ? (products.find((p) => p.id === openId) ?? null) : null;

  if (!ALLOWED_ROLES.includes(role)) {
    return (
      <NoAccess title="แบบพรม & ขนาด/ราคา" icon={<Package className="h-6 w-6" />}>
        หน้าตั้งราคาสินค้าเปิดให้เฉพาะเจ้าของ/ผู้จัดการ — สลับบทบาทที่แถบด้านบนเพื่อดูตัวอย่าง
      </NoAccess>
    );
  }

  return (
    <MattiiShell
      title="แบบพรม & ขนาด/ราคา"
      description="แคตตาล็อกแบบพรมและตารางขนาด — ราคาที่ตั้งไว้ที่นี่จะเด้งอัตโนมัติตอนสร้างออเดอร์"
      icon={<Package className="h-6 w-6" />}
      actions={
        <Button onClick={() => setFormFor("new")}>
          <Plus className="mr-1.5 h-4 w-4" /> เพิ่มแบบพรม
        </Button>
      }
    >
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          icon={<Package className="h-4 w-4" />}
          label="แบบพรมทั้งหมด"
          value={fmtNum(summary.total)}
          sub={`แสดงตามตัวกรอง ${fmtNum(visible.length)} แบบ`}
          tone="neutral"
        />
        <StatCard
          icon={<Layers className="h-4 w-4" />}
          label="เปิดขายอยู่"
          value={fmtNum(summary.activeCount)}
          sub="แบบที่ Sale เลือกได้ตอนสร้างออเดอร์"
          tone="positive"
          valueColored
        />
        <StatCard
          icon={<Ruler className="h-4 w-4" />}
          label="ขนาดที่ตั้งราคาไว้"
          value={fmtNum(summary.sizeCount)}
          sub="รวมทุกแบบ (มาตรฐาน + สั่งตัดพิเศษ)"
          tone="info"
        />
        {isOwner && (
          <StatCard
            icon={<Coins className="h-4 w-4" />}
            label="กำไรต่อผืนเฉลี่ย (ขนาดมาตรฐาน)"
            value={fmtMoney(summary.avgMargin)}
            sub="ราคาขาย − ต้นทุนต่อชิ้น"
            tone={summary.avgMargin >= 0 ? "positive" : "negative"}
            valueColored
          />
        )}
      </div>

      <div>
        <SectionHeading>รายการแบบพรม</SectionHeading>
        <FilterBar
          onClear={filtered ? clearFilters : undefined}
          resultText={`${fmtNum(visible.length)} / ${fmtNum(products.length)} แบบ`}
        >
          <div className="relative w-full sm:w-72">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="ค้นหารหัส / ชื่อแบบพรม"
              className="pl-9"
            />
          </div>
          <CustomSelect
            value={category}
            onChange={(v) => setCategory(v as RugCategory | "")}
            options={CATEGORY_OPTIONS}
            className="w-44"
          />
          <CustomSelect
            value={active}
            onChange={setActive}
            options={ACTIVE_OPTIONS}
            className="w-36"
          />
        </FilterBar>

        <Table className="shadow-sm" stickyHeader maxHeight="60vh">
          <TableHeader sticky>
            <TableRow>
              <TableHead>รหัส</TableHead>
              <TableHead>ชื่อแบบพรม</TableHead>
              <TableHead>ประเภท</TableHead>
              <TableHead>วัสดุหน้าพรม</TableHead>
              <TableHead>การเก็บขอบ</TableHead>
              <TableHead align="right">ขนาด</TableHead>
              <TableHead align="right">ผลิต</TableHead>
              <TableHead align="right">ช่วงราคา/ผืน</TableHead>
              <TableHead align="center">สถานะ</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              <TableLoading colSpan={9} />
            ) : visible.length === 0 ? (
              <TableEmpty colSpan={9}>
                <div className="flex flex-col items-center gap-2 py-4">
                  <div className="rounded-full bg-gray-100 p-4">
                    <Package className="h-7 w-7 text-gray-400" />
                  </div>
                  <div className="text-sm font-medium text-gray-900">
                    {filtered ? "ไม่พบแบบพรมตามเงื่อนไขที่เลือก" : "ยังไม่มีแบบพรมในระบบ"}
                  </div>
                  <div className="text-sm text-gray-500">
                    {filtered
                      ? "ลองล้างตัวกรองหรือเปลี่ยนคำค้นหา"
                      : "เพิ่มแบบพรมแรกเพื่อให้ทีมขายเลือกได้ตอนสร้างออเดอร์"}
                  </div>
                  {filtered ? (
                    <Button size="sm" variant="outline" className="mt-1" onClick={clearFilters}>
                      ล้างตัวกรอง
                    </Button>
                  ) : (
                    <Button size="sm" className="mt-1" onClick={() => setFormFor("new")}>
                      เพิ่มแบบพรมแรก
                    </Button>
                  )}
                </div>
              </TableEmpty>
            ) : (
              visible.map((p) => {
                const mine = sizesOf.get(p.id) ?? [];
                return (
                  <TableRow key={p.id} clickable onClick={() => setOpenId(p.id)}>
                    <TableCell>
                      <span className="font-mono font-medium text-gray-900">{p.code}</span>
                    </TableCell>
                    <TableCell>{p.name}</TableCell>
                    <TableCell>{RUG_CATEGORY_LABEL[p.category]}</TableCell>
                    <TableCell>{p.fabric_type}</TableCell>
                    <TableCell>{EDGE_FINISH_LABEL[p.edge_finish]}</TableCell>
                    <TableCell align="right" className="tabular-nums">
                      {fmtNum(mine.filter((s) => s.is_active).length)} ขนาด
                    </TableCell>
                    <TableCell align="right" className="tabular-nums">
                      {fmtNum(p.default_lead_time_days)} วัน
                    </TableCell>
                    <TableCell align="right" className="tabular-nums">
                      {priceRange(mine)}
                    </TableCell>
                    <TableCell align="center">
                      {p.is_active ? (
                        <StatusBadge tone="success">เปิดขาย</StatusBadge>
                      ) : (
                        <StatusBadge tone="neutral">ปิดขาย</StatusBadge>
                      )}
                    </TableCell>
                  </TableRow>
                );
              })
            )}
          </TableBody>
        </Table>
      </div>

      <ProductDialog
        product={opened}
        sizes={opened ? (sizesOf.get(opened.id) ?? []) : []}
        onOpenChange={(v) => !v && setOpenId(null)}
        onEditProduct={(p) => setFormFor(p)}
        onSizesChange={setSizes}
      />

      {formFor !== null && (
        <ProductFormDialog
          open
          product={formFor === "new" ? null : formFor}
          onOpenChange={(v) => !v && setFormFor(null)}
          onSubmit={(next, mode) => {
            setProducts((prev) =>
              mode === "create" ? [next, ...prev] : prev.map((p) => (p.id === next.id ? next : p)),
            );
            if (mode === "create") setOpenId(next.id);
          }}
        />
      )}
    </MattiiShell>
  );
}
