"use client";

// paste-items-dialog.tsx — วางรายการสินค้า (paste/CSV) → พรีวิว → เพิ่มเข้าชุด
//
// พรีวิวใช้ตัวแยกข้อมูลตัวเดียวกับ server (`lib/gov-procure/catalog-parse`) จึงเห็นผลตรงกัน
// บรรทัดที่แยกไม่ได้ = แก้ inline ในพรีวิวก่อนกดยืนยัน (พรีวิวมีไม่กี่แถวเสีย จึงยอมให้ inline ที่นี่)
// ตอนยืนยันจะประกอบข้อความใหม่จากค่าที่แก้แล้ว (ชื่อ⇥จำนวน⇥หน่วย) แล้วส่งให้ server แยกซ้ำ

import { useMemo, useState } from "react";
import { ListPlus, Wand2 } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogBody,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { SegmentedControl } from "@/components/ui/segmented";
import { StatusBadge } from "@/components/ui/badge";
import { Text } from "@/components/ui/typography";
import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
} from "@/components/ui/table";
import { toast } from "@/lib/toast";
import type { CatalogItem } from "@/lib/gov-procure/catalog";
import { parseCatalogCsv, parseCatalogPaste } from "@/lib/gov-procure/catalog-parse";
import { govApi } from "../../_components/api";
import { fmtNum } from "./format";

interface DraftRow {
  key: string;
  name: string;
  qty: string;
  unit: string;
  /** แถวนี้มาจากบรรทัดที่ตัวแยกข้อมูลอ่านไม่ออก → ต้องแก้ก่อน */
  broken: boolean;
  reason?: string;
}

const PLACEHOLDER = `ปากกาหมึกซึม น้ำเงิน (เจล) ขนาด 0.5\t40\tกล่อง
กระดาษถ่ายเอกสาร A4 80 แกรม\t200\tรีม
แฟ้มสันกว้าง 3 นิ้ว\t50\tเล่ม`;

export function PasteItemsDialog({
  open,
  onOpenChange,
  orgId,
  catalogId,
  startSeq,
  onAdded,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  orgId: string;
  catalogId: string;
  /** ลำดับเริ่มต้นของรายการใหม่ (ต่อท้ายของเดิม) */
  startSeq: number;
  onAdded: (items: CatalogItem[], matched: number) => void;
}) {
  const [format, setFormat] = useState<"paste" | "csv">("paste");
  const [text, setText] = useState("");
  const [rows, setRows] = useState<DraftRow[] | null>(null);
  const [saving, setSaving] = useState(false);

  const brokenCount = useMemo(() => (rows ?? []).filter((r) => r.broken).length, [rows]);
  const readyCount = useMemo(
    () => (rows ?? []).filter((r) => !r.broken && r.name.trim()).length,
    [rows],
  );

  function parse() {
    const result =
      format === "csv"
        ? parseCatalogCsv(text, { startSeq })
        : parseCatalogPaste(text, { startSeq });

    if (result.rows.length === 0 && result.issues.length === 0) {
      toast.error("ยังไม่มีข้อความให้แยก — วางรายการก่อน");
      return;
    }

    const parsed: DraftRow[] = [
      ...result.rows.map((r) => ({
        key: `row-${r.lineNo}`,
        name: r.name,
        qty: r.qty === null ? "" : String(r.qty),
        unit: r.unit ?? "",
        broken: false,
      })),
      ...result.issues.map((i) => ({
        key: `issue-${i.lineNo}`,
        name: i.raw,
        qty: "",
        unit: "",
        broken: true,
        reason: i.reason,
      })),
    ];
    setRows(parsed);
  }

  function setRow(key: string, field: "name" | "qty" | "unit", value: string) {
    setRows((prev) =>
      prev
        ? prev.map((r) =>
            r.key === key
              ? {
                  ...r,
                  [field]: value,
                  // แก้แล้วถือว่าใช้ได้ ถ้ามีชื่อและจำนวนเป็นตัวเลข (หรือเว้นว่าง)
                  broken:
                    r.broken &&
                    !(
                      (field === "name" ? value : r.name).trim().length > 0 &&
                      ((field === "qty" ? value : r.qty).trim() === "" ||
                        Number.isFinite(Number((field === "qty" ? value : r.qty).trim())))
                    ),
                }
              : r,
          )
        : prev,
    );
  }

  async function submit() {
    const usable = (rows ?? []).filter((r) => r.name.trim());
    if (usable.length === 0) {
      toast.error("ยังไม่มีรายการที่พร้อมเพิ่ม");
      return;
    }
    // ประกอบข้อความมาตรฐาน (ชื่อ⇥จำนวน⇥หน่วย) — server แยกซ้ำเป็นแหล่งความจริงเดียว
    const payload = usable
      .map((r) => {
        const qty = r.qty.trim();
        if (!qty) return r.name.trim();
        return `${r.name.trim()}\t${qty}\t${r.unit.trim()}`;
      })
      .join("\n");

    setSaving(true);
    try {
      const res = await govApi<{ items: CatalogItem[]; matched: number }>(
        `/api/gov-procure/catalogs/${catalogId}/items?orgId=${encodeURIComponent(orgId)}`,
        "POST",
        { text: payload, format: "paste" },
      );
      onAdded(res.items ?? [], res.matched ?? 0);
      toast.success(
        `เพิ่ม ${fmtNum((res.items ?? []).length)} รายการแล้ว · ตรงกับคลังสินค้า ${fmtNum(res.matched ?? 0)} รายการ`,
      );
      setText("");
      setRows(null);
      onOpenChange(false);
    } catch (e) {
      toast.error((e as Error).message || "เพิ่มรายการไม่สำเร็จ");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent size="2xl">
        <DialogHeader>
          <DialogTitle>วางรายการสินค้า</DialogTitle>
        </DialogHeader>

        <DialogBody>
          <div className="space-y-4">
            <SegmentedControl
              value={format}
              onChange={(v) => {
                setFormat(v);
                setRows(null);
              }}
              ariaLabel="รูปแบบข้อมูลที่วาง"
              options={[
                { value: "paste", label: "วางข้อความ" },
                { value: "csv", label: "วาง CSV" },
              ]}
            />

            <div>
              <Label htmlFor="paste-text">รายการสินค้า (บรรทัดละ 1 รายการ)</Label>
              <Textarea
                id="paste-text"
                className="mt-1 font-mono text-xs"
                rows={10}
                placeholder={PLACEHOLDER}
                value={text}
                onChange={(e) => {
                  setText(e.target.value);
                  setRows(null);
                }}
              />
              <Text className="mt-1 text-xs text-gray-500">
                รองรับการคั่นด้วย Tab, เว้นวรรค 2 ช่องขึ้นไป หรือจุลภาค (CSV) ·
                เลขลำดับหน้าบรรทัดตัดให้อัตโนมัติ
              </Text>
            </div>

            <Button variant="outline" onClick={parse} disabled={!text.trim()}>
              <Wand2 className="mr-1.5 h-4 w-4" /> แยกข้อมูล
            </Button>

            {rows && (
              <div className="space-y-2">
                <div className="flex flex-wrap items-center gap-2">
                  <Text className="text-xs text-gray-600">
                    พร้อมเพิ่ม {fmtNum(readyCount)} รายการ
                  </Text>
                  {brokenCount > 0 && (
                    <StatusBadge tone="warning">
                      แยกไม่ได้ {brokenCount} บรรทัด — แก้ก่อน
                    </StatusBadge>
                  )}
                </div>

                <Table maxHeight="40vh" className="shadow-sm">
                  <TableHeader sticky>
                    <TableRow>
                      <TableHead>ชื่อสินค้า</TableHead>
                      <TableHead align="right">จำนวน</TableHead>
                      <TableHead>หน่วย</TableHead>
                      <TableHead align="center">สถานะ</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {rows.map((r) => (
                      <TableRow key={r.key}>
                        <TableCell className="min-w-[240px]">
                          <Input
                            className="h-8"
                            value={r.name}
                            onChange={(e) => setRow(r.key, "name", e.target.value)}
                          />
                        </TableCell>
                        <TableCell align="right" className="w-28">
                          <Input
                            className="h-8 text-right tabular-nums"
                            value={r.qty}
                            onChange={(e) => setRow(r.key, "qty", e.target.value)}
                          />
                        </TableCell>
                        <TableCell className="w-28">
                          <Input
                            className="h-8"
                            value={r.unit}
                            onChange={(e) => setRow(r.key, "unit", e.target.value)}
                          />
                        </TableCell>
                        <TableCell align="center">
                          {r.broken ? (
                            <StatusBadge tone="warning">{r.reason ?? "แยกไม่ได้"}</StatusBadge>
                          ) : (
                            <StatusBadge tone="neutral">พร้อม</StatusBadge>
                          )}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </div>
        </DialogBody>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            ยกเลิก
          </Button>
          <Button disabled={saving || !rows || readyCount === 0} onClick={() => void submit()}>
            <ListPlus className="mr-1.5 h-4 w-4" />
            {saving ? "กำลังเพิ่ม…" : `เพิ่ม ${fmtNum(readyCount)} รายการ`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
