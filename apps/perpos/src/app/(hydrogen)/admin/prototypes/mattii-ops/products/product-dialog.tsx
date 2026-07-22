"use client";

// product-dialog.tsx — รายละเอียดแบบพรม + ตารางขนาด/ราคา (คลิกแถวขนาด → แก้ไข)
// 🔒 owner-only §2.3: คอลัมน์ "ต้นทุน/ชิ้น" (base_cost) + "กำไร/ผืน" อยู่ท้ายสุดติดกัน → role อื่นตัดทั้งชุด
// §5 ข้อ 3: ไม่มีปุ่ม action ในแถว — คลิกแถวเปิด dialog ย่อย · §5 ข้อ 7: ตารางใน dialog เป็น flush

import { useState } from "react";
import { Plus, Ruler } from "lucide-react";
import { Button } from "@/components/ui/button";
import { StatusBadge } from "@/components/ui/badge";
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableEmpty,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Text } from "@/components/ui/typography";
import { EDGE_FINISH_LABEL, RUG_CATEGORY_LABEL, SIZE_KIND_LABEL } from "../_fixtures/labels";
import type { MattiiProduct, MattiiProductSize } from "../_fixtures/types";
import { Field, SectionHeading, fmtMoney, fmtNum, useMattiiRole } from "../_components";
import { SizeDialog } from "./size-dialog";

export function ProductDialog({
  product,
  sizes,
  onOpenChange,
  onEditProduct,
  onSizesChange,
}: {
  /** null = ปิด dialog */
  product: MattiiProduct | null;
  sizes: MattiiProductSize[];
  onOpenChange: (open: boolean) => void;
  onEditProduct: (p: MattiiProduct) => void;
  onSizesChange: (updater: (prev: MattiiProductSize[]) => MattiiProductSize[]) => void;
}) {
  const { isOwner } = useMattiiRole();
  const [sizeFor, setSizeFor] = useState<MattiiProductSize | null | "new">(null);

  const colCount = isOwner ? 7 : 5;

  return (
    <>
      <Dialog open={Boolean(product)} onOpenChange={onOpenChange}>
        <DialogContent size="3xl">
          <DialogHeader>
            <DialogTitle>{product ? product.name : "แบบพรม"}</DialogTitle>
          </DialogHeader>
          <DialogBody>
            {product && (
              <div className="space-y-5">
                <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
                  <Field label="รหัส">
                    <span className="font-mono">{product.code}</span>
                  </Field>
                  <Field label="ประเภท">{RUG_CATEGORY_LABEL[product.category]}</Field>
                  <Field label="วัสดุหน้าพรม">{product.fabric_type}</Field>
                  <Field label="ยางรองหลัง">{product.backing_type ?? "—"}</Field>
                  <Field label="การเก็บขอบ">{EDGE_FINISH_LABEL[product.edge_finish]}</Field>
                  <Field label="วิธีพิมพ์">{product.print_method}</Field>
                  <Field label="เวลาผลิตมาตรฐาน">
                    <span className="tabular-nums">
                      {fmtNum(product.default_lead_time_days)} วัน
                    </span>
                  </Field>
                  <Field label="สถานะ">
                    {product.is_active ? (
                      <StatusBadge tone="success">เปิดขาย</StatusBadge>
                    ) : (
                      <StatusBadge tone="neutral">ปิดขาย</StatusBadge>
                    )}
                  </Field>
                </div>

                {product.option_schema.length > 0 && (
                  <div>
                    <SectionHeading>ตัวเลือกที่ลูกค้าเลือกได้</SectionHeading>
                    <div className="flex flex-wrap gap-2 px-1">
                      {product.option_schema.map((opt) => (
                        <span
                          key={opt.key}
                          className="rounded-lg border border-gray-200 bg-gray-50 px-2.5 py-1.5 text-xs text-gray-600"
                        >
                          <span className="font-medium text-gray-900">{opt.label}:</span>{" "}
                          {opt.values.join(" · ")}
                        </span>
                      ))}
                    </div>
                  </div>
                )}

                {product.note && (
                  <Text className="rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-sm text-gray-600">
                    {product.note}
                  </Text>
                )}

                <div>
                  <SectionHeading
                    actions={
                      <Button size="sm" variant="outline" onClick={() => setSizeFor("new")}>
                        <Plus className="mr-1.5 h-4 w-4" /> เพิ่มขนาด
                      </Button>
                    }
                  >
                    ตารางขนาด & ราคาต่อชิ้น
                  </SectionHeading>
                  <Table className="shadow-sm">
                    <TableHeader>
                      <TableRow>
                        <TableHead>ขนาด</TableHead>
                        <TableHead>ชนิด</TableHead>
                        <TableHead align="right">กว้าง × ยาว</TableHead>
                        <TableHead align="right">ราคา/ผืน</TableHead>
                        <TableHead align="right">ผ้าที่ใช้</TableHead>
                        {isOwner && (
                          <>
                            <TableHead align="right">ต้นทุน/ชิ้น</TableHead>
                            <TableHead align="right">กำไร/ผืน</TableHead>
                          </>
                        )}
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {sizes.length === 0 ? (
                        <TableEmpty colSpan={colCount}>
                          <div className="flex flex-col items-center gap-2 py-4">
                            <div className="rounded-full bg-gray-100 p-4">
                              <Ruler className="h-7 w-7 text-gray-400" />
                            </div>
                            <div className="text-sm font-medium text-gray-900">
                              ยังไม่ได้ตั้งขนาดและราคา
                            </div>
                            <div className="text-sm text-gray-500">
                              เพิ่มขนาดอย่างน้อย 1 รายการ ทีมขายจึงจะเลือกแบบนี้ได้
                            </div>
                            <Button size="sm" className="mt-1" onClick={() => setSizeFor("new")}>
                              เพิ่มขนาดแรก
                            </Button>
                          </div>
                        </TableEmpty>
                      ) : (
                        sizes.map((s) => {
                          const custom = s.size_kind === "custom_cut";
                          const profit = s.unit_price - s.base_cost;
                          return (
                            <TableRow key={s.id} clickable onClick={() => setSizeFor(s)}>
                              <TableCell>
                                <div className="flex items-center gap-2">
                                  <span className="font-medium text-gray-900">{s.size_label}</span>
                                  {!s.is_active && (
                                    <StatusBadge tone="neutral">ปิดใช้งาน</StatusBadge>
                                  )}
                                </div>
                              </TableCell>
                              <TableCell>{SIZE_KIND_LABEL[s.size_kind]}</TableCell>
                              <TableCell align="right" className="tabular-nums">
                                {s.width_cm && s.length_cm
                                  ? `${fmtNum(s.width_cm)} × ${fmtNum(s.length_cm)} ซม.`
                                  : "ระบุตอนสั่ง"}
                              </TableCell>
                              <TableCell align="right" className="tabular-nums">
                                {custom
                                  ? `${fmtMoney(s.price_per_sqm ?? 0)} / ตร.ม.`
                                  : fmtMoney(s.unit_price)}
                              </TableCell>
                              <TableCell align="right" className="tabular-nums">
                                {custom
                                  ? "ตามขนาดที่สั่ง"
                                  : `${fmtNum(s.fabric_usage_sqm, 3)} ตร.ม.`}
                              </TableCell>
                              {isOwner && (
                                <>
                                  <TableCell align="right" tabular>
                                    {custom ? "—" : fmtMoney(s.base_cost)}
                                  </TableCell>
                                  <TableCell
                                    align="right"
                                    tabular
                                    className={profit < 0 ? "text-red-600" : "text-green-600"}
                                  >
                                    {custom ? "—" : fmtMoney(profit)}
                                  </TableCell>
                                </>
                              )}
                            </TableRow>
                          );
                        })
                      )}
                    </TableBody>
                  </Table>
                  <Text className="mt-2 px-1 text-xs text-gray-400">
                    คลิกที่แถวเพื่อแก้ราคา/ต้นทุน —
                    ราคาที่แก้จะถูกใช้ทันทีตอนสร้างรายการพรมในออเดอร์
                  </Text>
                </div>
              </div>
            )}
          </DialogBody>
          <DialogFooter>
            {product && (
              <Button
                variant="outline"
                className="mr-auto"
                onClick={() => {
                  onEditProduct(product);
                  onOpenChange(false);
                }}
              >
                แก้ไขแบบพรม
              </Button>
            )}
            <Button variant="outline" onClick={() => onOpenChange(false)}>
              ปิด
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {product && sizeFor !== null && (
        <SizeDialog
          open
          productId={product.id}
          size={sizeFor === "new" ? null : sizeFor}
          onOpenChange={(v) => !v && setSizeFor(null)}
          onSizesChange={onSizesChange}
        />
      )}
    </>
  );
}
