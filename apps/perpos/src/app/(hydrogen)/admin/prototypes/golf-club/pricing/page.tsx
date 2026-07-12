"use client";

// pricing/page.tsx — ราคา & แพ็กเกจ (catalog) — P4b Group B
// จัดกลุ่มตาม category (green_fee/caddie/cart/range_bucket/other) — Table ต่อกลุ่ม + CRUD
// owner/manager เขียนได้ · staff = read-only banner · เงิน tabular
// PRICING RULE (LOCKED): ราคาฐาน = member_type='all' · ส่วนลดสมาชิกจาก plan (ไม่ซ้อน fallback)

import { useEffect, useMemo, useState } from "react";
import { Tag, Plus, Layers } from "lucide-react";
import { Button } from "@/components/ui/button";
import { StatCard } from "@/components/ui/stat-card";
import { Text } from "@/components/ui/typography";
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
  GolfShell,
  AccessLockBanner,
  useGolfRole,
  useGolfData,
  formatAmount,
  fmtNum,
} from "../_components";
import {
  PriceItemDialog,
  CATEGORY_LABEL,
  DAY_TYPE_LABEL,
  APPLIES_TO_LABEL,
  PRICE_MEMBER_LABEL,
} from "../_components/price-item-dialog";
import type { GolfPriceItem, GolfPriceCategory } from "../_fixtures/types";

const CATEGORY_ORDER: GolfPriceCategory[] = [
  "green_fee",
  "caddie",
  "cart",
  "range_bucket",
  "other",
];

export default function GolfPricingPage() {
  const { canWrite } = useGolfRole();
  const writable = canWrite("pricing");
  const { priceItems } = useGolfData();

  const [loading, setLoading] = useState(true);
  const [edit, setEdit] = useState<GolfPriceItem | null>(null);
  const [createOpen, setCreateOpen] = useState(false);

  useEffect(() => {
    const t = setTimeout(() => setLoading(false), 450);
    return () => clearTimeout(t);
  }, []);

  const grouped = useMemo(() => {
    return CATEGORY_ORDER.map((cat) => ({
      cat,
      items: priceItems
        .filter((p) => p.category === cat)
        .sort((a, b) => a.price - b.price),
    })).filter((g) => g.items.length > 0);
  }, [priceItems]);

  const kpi = useMemo(() => {
    const active = priceItems.filter((p) => p.is_active).length;
    return { total: priceItems.length, active, groups: grouped.length };
  }, [priceItems, grouped]);

  const isEmpty = !loading && priceItems.length === 0;

  return (
    <GolfShell
      title="ราคา & แพ็กเกจ"
      description="ตั้งราคากรีนฟี/แคดดี้/รถ/ตะกร้าลูก แยกวันธรรมดา-วันหยุด และกลุ่มลูกค้า — ตั้งราคาตาม demand"
      icon={<Tag className="h-6 w-6" />}
      actions={
        writable ? (
          <Button onClick={() => setCreateOpen(true)}>
            <Plus className="mr-1.5 h-4 w-4" />
            เพิ่มราคา
          </Button>
        ) : undefined
      }
    >
      {!writable && (
        <AccessLockBanner>
          โหมดดูอย่างเดียว — การตั้ง/แก้ไขราคาสงวนไว้สำหรับผู้จัดการ/เจ้าของ
        </AccessLockBanner>
      )}

      {/* KPI */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <StatCard
          icon={<Tag className="h-4 w-4" />}
          label="รายการราคาทั้งหมด"
          value={fmtNum(kpi.total)}
          tone="info"
          valueColored
        />
        <StatCard
          icon={<Tag className="h-4 w-4" />}
          label="เปิดใช้งาน"
          value={fmtNum(kpi.active)}
          sub={`ปิด ${fmtNum(kpi.total - kpi.active)}`}
          tone="positive"
          valueColored
        />
        <StatCard
          icon={<Layers className="h-4 w-4" />}
          label="หมวดหมู่"
          value={fmtNum(kpi.groups)}
          tone="neutral"
        />
      </div>

      {loading ? (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>รายการ</TableHead>
              <TableHead align="center">ใช้กับ</TableHead>
              <TableHead align="center">วัน</TableHead>
              <TableHead align="center">กลุ่มลูกค้า</TableHead>
              <TableHead align="right">ราคา</TableHead>
              <TableHead align="center">สถานะ</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            <TableLoading colSpan={6} />
          </TableBody>
        </Table>
      ) : isEmpty ? (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>รายการ</TableHead>
              <TableHead align="right">ราคา</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            <TableEmpty colSpan={2}>
              <div className="flex flex-col items-center gap-2 py-8">
                <Tag className="h-8 w-8 text-gray-300" />
                <span>ยังไม่ได้ตั้งราคา</span>
                <span className="text-xs text-gray-400">
                  เพิ่มราคากรีนฟี/แคดดี้/รถ/ตะกร้าลูก เพื่อคิดค่าบริการอัตโนมัติเวลาจอง
                </span>
                {writable && (
                  <Button size="sm" onClick={() => setCreateOpen(true)}>
                    <Plus className="mr-1.5 h-4 w-4" />
                    เพิ่มราคา
                  </Button>
                )}
              </div>
            </TableEmpty>
          </TableBody>
        </Table>
      ) : (
        <div className="space-y-6">
          {grouped.map((g) => (
            <div key={g.cat}>
              <div className="mb-2.5 flex items-center gap-2 px-1">
                <Text className="text-sm font-semibold text-gray-900">{CATEGORY_LABEL[g.cat]}</Text>
                <span className="rounded-full bg-gray-100 px-2 py-0.5 text-xs font-medium text-gray-500">
                  {fmtNum(g.items.length)} รายการ
                </span>
              </div>
              <Table className="shadow-sm">
                <TableHeader>
                  <TableRow>
                    <TableHead>รายการ</TableHead>
                    <TableHead align="center">ใช้กับ</TableHead>
                    <TableHead align="center">วัน</TableHead>
                    <TableHead align="center">กลุ่มลูกค้า</TableHead>
                    <TableHead align="right">ราคา</TableHead>
                    <TableHead align="center">สถานะ</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {g.items.map((p) => (
                    <TableRow
                      key={p.id}
                      clickable={writable}
                      onClick={writable ? () => setEdit(p) : undefined}
                    >
                      <TableCell wrap className="font-medium text-gray-900">
                        {p.name}
                        {p.unit ? <span className="ml-1 text-xs font-normal text-gray-400">/ {p.unit}</span> : null}
                      </TableCell>
                      <TableCell align="center" className="text-gray-600">
                        {APPLIES_TO_LABEL[p.applies_to]}
                      </TableCell>
                      <TableCell align="center" className="text-gray-600">
                        {DAY_TYPE_LABEL[p.day_type]}
                      </TableCell>
                      <TableCell align="center" className="text-gray-600">
                        {PRICE_MEMBER_LABEL[p.member_type]}
                      </TableCell>
                      <TableCell align="right" tabular>
                        {formatAmount(p.price)}
                      </TableCell>
                      <TableCell align="center">
                        <StatusBadge tone={p.is_active ? "success" : "neutral"}>
                          {p.is_active ? "ใช้งาน" : "เลิกใช้"}
                        </StatusBadge>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          ))}
        </div>
      )}

      <PriceItemDialog item={null} open={createOpen} onOpenChange={setCreateOpen} />
      <PriceItemDialog
        item={edit}
        open={edit !== null}
        onOpenChange={(v) => !v && setEdit(null)}
      />
    </GolfShell>
  );
}
